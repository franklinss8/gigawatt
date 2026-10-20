/**
 * Mock keeper flush on devnet:
 *  1. pretend `MOCK_SOL` SOL of creator fees were swapped to `MOCK_USDC` USDC
 *  2. mint mock USDC: treasury_share → treasury ATA, rest → funding ATA (this is the "swap" on devnet)
 *  3. snapshot GWATT holders (getProgramAccounts filtered by mint, excluding EXCLUDED_ADDRESSES)
 *  4. build the merkle tree (pro-rata), call `flush`
 *  5. write deployments/devnet-flush-<index>.json with holders + proofs
 *
 * Run: pnpm exec tsx scripts/mock-flush.ts            (env: MOCK_USDC=1000 to override the USDC amount)
 */
import { PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, AccountLayout } from "@solana/spl-token";
import path from "node:path";
import {
  buildTree,
  computeDistribution,
  fetchConfig,
  flush,
  findFlush,
  toHex,
  BPS_DENOMINATOR,
} from "../packages/sdk/src/index.ts";
import {
  DEPLOYMENTS_DIR,
  connection,
  loadOrCreateKeypair,
  mintMockTo,
  programFor,
  readDeployment,
  writeJson,
} from "./lib.ts";

export async function snapshotHolders(
  conn: ReturnType<typeof connection>,
  mint: PublicKey,
  excluded: Set<string>,
): Promise<{ owner: PublicKey; balance: bigint }[]> {
  const accounts = await conn.getProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [{ dataSize: 165 }, { memcmp: { offset: 0, bytes: mint.toBase58() } }],
  });
  const byOwner = new Map<string, bigint>();
  for (const { account } of accounts) {
    const data = AccountLayout.decode(account.data);
    const owner = new PublicKey(data.owner).toBase58();
    const amount = BigInt(data.amount.toString());
    if (amount === 0n || excluded.has(owner)) continue;
    byOwner.set(owner, (byOwner.get(owner) ?? 0n) + amount);
  }
  return [...byOwner.entries()].map(([o, b]) => ({ owner: new PublicKey(o), balance: b }));
}

async function main() {
  const conn = connection();
  const dep = readDeployment();
  const deployer = loadOrCreateKeypair("deployer"); // mint authority of mock USDC
  const keeper = loadOrCreateKeypair("keeper");
  const program = programFor(keeper);
  const cfg = await fetchConfig(program);

  const mockSol = BigInt(Math.round(Number(process.env.MOCK_SOL ?? "2.5") * 1e9));
  const usdcReceived = BigInt(Math.round(Number(process.env.MOCK_USDC ?? "500") * 1e6));
  const usdcToTreasury = (usdcReceived * BigInt(cfg.treasuryShareBps)) / BPS_DENOMINATOR;
  const usdcToFunding = usdcReceived - usdcToTreasury;
  const wattForHolders = usdcToFunding; // 1:1

  console.log(`flush #${cfg.flushCount.toString()}  mock ${Number(mockSol) / 1e9} SOL → ${Number(usdcReceived) / 1e6} USDC`);
  console.log(`  treasury ${Number(usdcToTreasury) / 1e6}  funding ${Number(usdcToFunding) / 1e6}  watt_for_holders ${Number(wattForHolders) / 1e6}`);

  // 2. "swap" = mint mock USDC
  await mintMockTo(conn, deployer, cfg.usdcMint, cfg.treasury, usdcToTreasury);
  await mintMockTo(conn, deployer, cfg.usdcMint, cfg.fundingWallet, usdcToFunding);
  console.log(`  minted mock USDC to treasury + funding`);

  // 3. snapshot
  const excluded = new Set(
    (process.env.EXCLUDED_ADDRESSES ?? dep.deployer).split(",").map((s) => s.trim()).filter(Boolean),
  );
  const holders = await snapshotHolders(conn, cfg.gwattMint, excluded);
  console.log(`  ${holders.length} GWATT holders after exclusions (${[...excluded].join(", ")})`);

  // 4. merkle
  const { leaves, holderSupply, totalAllocated } = computeDistribution(holders, wattForHolders);
  if (leaves.length === 0) throw new Error("no eligible holders");
  const tree = buildTree(leaves);
  console.log(`  holder_supply ${holderSupply}  allocated ${totalAllocated}  root ${tree.rootHex}`);

  const flushIndex = BigInt(cfg.flushCount.toString());
  const ix = await flush(program, {
    keeper: keeper.publicKey,
    wattMint: cfg.wattMint,
    flushIndex,
    solCollected: mockSol,
    usdcReceived,
    usdcToTreasury,
    wattForHolders,
    merkleRoot: tree.root,
    holderSupply,
    holderCount: leaves.length,
  });
  const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [keeper]);
  const [flushPda] = findFlush(flushIndex);
  console.log(`  flush ✓ ${sig}  (${flushPda.toBase58()})`);

  // 5. write holders + proofs
  const out = {
    index: Number(flushIndex),
    flush: flushPda.toBase58(),
    sig,
    merkleRoot: tree.rootHex,
    solCollected: mockSol.toString(),
    usdcReceived: usdcReceived.toString(),
    usdcToTreasury: usdcToTreasury.toString(),
    usdcToFunding: usdcToFunding.toString(),
    wattForHolders: wattForHolders.toString(),
    holderSupply: holderSupply.toString(),
    holderCount: leaves.length,
    holders: tree.leaves.map((l) => ({
      wallet: l.claimant.toBase58(),
      amount: l.amount.toString(),
      proof: tree.getProof(l.claimant)!.map(toHex),
    })),
    createdAt: new Date().toISOString(),
  };
  writeJson(path.join(DEPLOYMENTS_DIR, `devnet-flush-${flushIndex}.json`), out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
