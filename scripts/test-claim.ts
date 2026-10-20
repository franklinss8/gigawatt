/**
 * Claim rewards for one test holder on devnet.
 *
 * Run: pnpm exec tsx scripts/test-claim.ts [flushIndex] [holderName]
 *   flushIndex defaults to the latest deployments/devnet-flush-*.json; holderName defaults to holder-1.
 *   ACTIVATE=1 uses claim_and_activate instead of claim.
 */
import { Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import fs from "node:fs";
import path from "node:path";
import {
  ata,
  claim,
  claimAndActivate,
  fetchConfig,
  fetchFlush,
  findClaimStatus,
  findFlush,
  fromHex,
} from "../packages/sdk/src/index.ts";
import { DEPLOYMENTS_DIR, connection, loadOrCreateKeypair, programFor } from "./lib.ts";

function latestFlushIndex(): number {
  const idx = fs
    .readdirSync(DEPLOYMENTS_DIR)
    .map((f) => /^devnet-flush-(\d+)\.json$/.exec(f)?.[1])
    .filter((x): x is string => !!x)
    .map(Number);
  if (idx.length === 0) throw new Error("no deployments/devnet-flush-*.json: run scripts/mock-flush.ts first");
  return Math.max(...idx);
}

async function main() {
  const flushIndex = process.argv[2] ? Number(process.argv[2]) : latestFlushIndex();
  const holderName = process.argv[3] ?? "holder-1";
  const holder = loadOrCreateKeypair(holderName);
  const conn = connection();
  const program = programFor(holder);
  const cfg = await fetchConfig(program);

  const data = JSON.parse(fs.readFileSync(path.join(DEPLOYMENTS_DIR, `devnet-flush-${flushIndex}.json`), "utf8"));
  const entry = data.holders.find((h: any) => h.wallet === holder.publicKey.toBase58());
  if (!entry) throw new Error(`${holderName} (${holder.publicKey.toBase58()}) not in flush ${flushIndex}`);

  const [flushPda] = findFlush(flushIndex);
  const [claimStatus] = findClaimStatus(flushPda, holder.publicKey);
  if (await conn.getAccountInfo(claimStatus)) {
    console.log(`already claimed flush ${flushIndex} for ${holderName} (${claimStatus.toBase58()})`);
    return;
  }

  const amount = BigInt(entry.amount);
  const proof = (entry.proof as string[]).map(fromHex);
  const activate = process.env.ACTIVATE === "1";
  console.log(`${activate ? "claim_and_activate" : "claim"} flush ${flushIndex} for ${holderName}: ${Number(amount) / 1e6} WATT (proof len ${proof.length})`);

  const ix = activate
    ? await claimAndActivate(program, {
        claimant: holder.publicKey,
        wattMint: cfg.wattMint,
        flushIndex,
        amount,
        proof,
        treasury: cfg.treasury,
      })
    : await claim(program, { claimant: holder.publicKey, wattMint: cfg.wattMint, flushIndex, amount, proof });
  const sig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [holder]);
  console.log(`✓ ${sig}`);

  const f = await fetchFlush(program, flushIndex);
  console.log(`flush claimed total: ${f?.claimed.toString()} / ${f?.wattForHolders.toString()}`);
  if (!activate) {
    const bal = await getAccount(conn, ata(cfg.wattMint, holder.publicKey));
    console.log(`${holderName} WATT balance: ${Number(bal.amount) / 1e6}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
