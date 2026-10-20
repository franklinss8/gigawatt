/**
 * Flush pipeline tail: split USDC, build merkle tree, send `flush`, index on web.
 */
import { Connection, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { KeeperEnv } from "./config.js";
import { log } from "./config.js";
import type { Snapshot } from "./snapshot.js";
import { buildTree, toHex } from "./merkle.js";
import { buildFlushIx, findConfig, type ConfigAccount } from "./sdk.js";

export interface FlushInput {
  solCollected: bigint;
  usdcReceived: bigint;
  snapshot: Snapshot;
  config: ConfigAccount;
  configPda: PublicKey;
}

export interface FlushPayloadHolder {
  wallet: string;
  amount: string;
  proof: string[];
}

export interface FlushPayload {
  index: number;
  ts: number;
  slot: number;
  sig: string;
  sol_collected: string;
  usdc_received: string;
  usdc_to_treasury: string;
  usdc_to_funding: string;
  watt_for_holders: string;
  merkle_root: string;
  holder_supply: string;
  holder_count: number;
  holders: FlushPayloadHolder[];
}

export interface Split {
  usdcToTreasury: bigint;
  usdcToFunding: bigint;
  signature: string | null;
}

/** Split keeper USDC by treasury_share_bps and transfer to treasury / funding ATAs. */
export async function splitUsdc(connection: Connection, env: KeeperEnv, config: ConfigAccount, usdc: bigint): Promise<Split> {
  const usdcToTreasury = (usdc * BigInt(config.treasuryShareBps)) / 10_000n;
  const usdcToFunding = usdc - usdcToTreasury;
  if (usdc === 0n) return { usdcToTreasury, usdcToFunding, signature: null };

  const keeper = env.keeper.publicKey;
  const from = getAssociatedTokenAddressSync(env.usdcMint, keeper, true);
  const treasuryAta = getAssociatedTokenAddressSync(env.usdcMint, config.treasury, true);
  const fundingAta = getAssociatedTokenAddressSync(env.usdcMint, config.fundingWallet, true);

  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(keeper, treasuryAta, config.treasury, env.usdcMint),
    createAssociatedTokenAccountIdempotentInstruction(keeper, fundingAta, config.fundingWallet, env.usdcMint),
  );
  if (usdcToTreasury > 0n) tx.add(createTransferCheckedInstruction(from, env.usdcMint, treasuryAta, keeper, usdcToTreasury, 6));
  if (usdcToFunding > 0n) tx.add(createTransferCheckedInstruction(from, env.usdcMint, fundingAta, keeper, usdcToFunding, 6));
  tx.feePayer = keeper;
  if (env.dryRun) {
    log("split: dry run, not sending", { usdcToTreasury: usdcToTreasury.toString(), usdcToFunding: usdcToFunding.toString() });
    return { usdcToTreasury, usdcToFunding, signature: null };
  }
  const signature = await sendAndConfirmTransaction(connection, tx, [env.keeper], { commitment: "confirmed" });
  log("split: done", { usdcToTreasury: usdcToTreasury.toString(), usdcToFunding: usdcToFunding.toString(), signature });
  return { usdcToTreasury, usdcToFunding, signature };
}

/** amount_i = floor(watt_for_holders * balance_i / supply) */
export function allocate(wattForHolders: bigint, snapshot: Snapshot): { wallet: PublicKey; amount: bigint }[] {
  if (snapshot.supply === 0n) return [];
  return snapshot.holders
    .map((h) => ({ wallet: new PublicKey(h.owner), amount: (wattForHolders * h.amount) / snapshot.supply }))
    .filter((l) => l.amount > 0n);
}

export async function runFlush(connection: Connection, env: KeeperEnv, input: FlushInput, split: Split): Promise<FlushPayload> {
  const { config, snapshot } = input;
  const wattForHolders = split.usdcToFunding; // 1:1 USDC -> WATT
  const leaves = allocate(wattForHolders, snapshot);
  const tree = buildTree(leaves);
  const root = tree.root;
  const index = config.flushCount; // next flush index

  const [configPda] = findConfig(env.programId);
  const rewardsVault = getAssociatedTokenAddressSync(config.wattMint, configPda, true);
  const ix = await buildFlushIx(
    { programId: env.programId, wattMint: config.wattMint, rewardsVault, flushIndex: index },
    env.keeper.publicKey,
    {
      solCollected: input.solCollected,
      usdcReceived: input.usdcReceived,
      usdcToTreasury: split.usdcToTreasury,
      wattForHolders,
      merkleRoot: root,
      holderSupply: snapshot.supply,
      holderCount: snapshot.count,
    },
  );

  let sig = "dry-run";
  let slot = snapshot.slot;
  let ts = Math.floor(Date.now() / 1000);
  if (!env.dryRun) {
    const tx = new Transaction().add(ix);
    tx.feePayer = env.keeper.publicKey;
    sig = await sendAndConfirmTransaction(connection, tx, [env.keeper], { commitment: "confirmed" });
    const txInfo = await connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (txInfo) {
      slot = txInfo.slot;
      if (txInfo.blockTime) ts = txInfo.blockTime;
    }
    log("flush: tx confirmed", { index: index.toString(), sig, slot });
  } else {
    log("flush: dry run, not sending", { index: index.toString(), root: toHex(root), leaves: leaves.length });
  }

  const payload: FlushPayload = {
    index: Number(index),
    ts,
    slot,
    sig,
    sol_collected: input.solCollected.toString(),
    usdc_received: input.usdcReceived.toString(),
    usdc_to_treasury: split.usdcToTreasury.toString(),
    usdc_to_funding: split.usdcToFunding.toString(),
    watt_for_holders: wattForHolders.toString(),
    merkle_root: toHex(root),
    holder_supply: snapshot.supply.toString(),
    holder_count: snapshot.count,
    holders: leaves.map((l, i) => ({
      wallet: l.wallet.toBase58(),
      amount: l.amount.toString(),
      proof: tree.getProof(i).map(toHex),
    })),
  };
  return payload;
}

/** POST the flush + holder proofs to the web app for indexing (SPEC §3.6). */
export async function indexFlush(env: KeeperEnv, payload: FlushPayload): Promise<void> {
  if (env.dryRun) {
    log("index: dry run, not posting", { url: `${env.webUrl}/api/internal/flush`, holders: payload.holders.length });
    return;
  }
  const url = `${env.webUrl}/api/internal/flush`;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-keeper-secret": env.keeperSecret },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        log("index: posted", { url, status: res.status, holders: payload.holders.length });
        return;
      }
      lastErr = new Error(`POST ${url} -> ${res.status}: ${await res.text()}`);
    } catch (e) {
      lastErr = e;
    }
    log("index: retrying", { attempt, error: String(lastErr) });
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
