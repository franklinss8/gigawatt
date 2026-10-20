import "server-only";
import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { connection, program } from "./chain";
import { db } from "./db";
import { findConfig, contextFromConfig, buyWatt, activate, claim, claimAndActivate, placeAsk, cancelAsk, fillAsk } from "./sdk";

export type TxKind = "buy" | "activate" | "claim" | "claim-activate" | "place-ask" | "cancel-ask" | "fill-ask";

/** Builds an unsigned transaction for the wallet to sign. Amounts are in atoms (6 decimals). */
export async function buildTx(kind: TxKind, wallet: string, body: Record<string, unknown>): Promise<{ tx: string; summary: string }> {
  const user = new PublicKey(wallet);
  const p = program();
  const cfg = await p.account.config.fetch(findConfig()[0]);
  const ctx = contextFromConfig(cfg);
  const askInfo = async (addr: string) => { const a = await p.account.ask.fetch(new PublicKey(addr)); return { seller: a.seller, nonce: BigInt(a.nonce.toString()) }; };
  const ixs: TransactionInstruction[] = [];
  let summary = "";
  const amt = (k: string) => { const v = BigInt(Math.floor(Number(body[k] ?? 0))); if (v <= 0n) throw new Error(`${k} must be positive`); return v; };

  switch (kind) {
    case "buy": { const a = amt("usdc"); ixs.push(await buyWatt(p, { buyer: user, usdcAmount: a, ctx })); summary = `Buy WATT with ${Number(a) / 1e6} USDC`; break; }
    case "activate": { const a = amt("amount"); ixs.push(await activate(p, { owner: user, amount: a, ctx })); summary = `Activate ${Number(a) / 1e6} WATT`; break; }
    case "claim":
    case "claim-activate": {
      const idx = Number(body.flushIndex);
      const rows = await db().holderFlushes(wallet);
      const row = rows.find(r => r.flush_index === idx);
      if (!row) throw new Error("Nothing to claim for this flush");
      const proof = row.proof.map(h => Buffer.from(h.replace(/^0x/, ""), "hex"));
      const ca = { claimant: user, wattMint: ctx.wattMint, flushIndex: BigInt(idx), amount: BigInt(row.amount), proof };
      ixs.push(kind === "claim" ? await claim(p, ca) : await claimAndActivate(p, { ...ca, treasury: ctx.treasury }));
      summary = `${kind === "claim" ? "Claim" : "Claim and activate"} ${row.amount / 1e6} WATT from payout ${idx}`; break;
    }
    case "place-ask": { const price = amt("price"), amount = amt("amount"); const nonce = BigInt(Date.now()); ixs.push(await placeAsk(p, { seller: user, wattMint: ctx.wattMint, nonce, price, amount })); summary = `Sell ${Number(amount) / 1e6} WATT at $${Number(price) / 1e6}`; break; }
    case "cancel-ask": { { const a = await askInfo(String(body.ask)); ixs.push(await cancelAsk(p, { seller: user, wattMint: ctx.wattMint, nonce: a.nonce })); } summary = "Cancel ask"; break; }
    case "fill-ask": { const amount = amt("amount"); const a = await askInfo(String(body.ask)); ixs.push(await fillAsk(p, { buyer: user, seller: a.seller, nonce: a.nonce, amount, ctx })); summary = `Buy ${Number(amount) / 1e6} WATT from the book`; break; }
  }
  const conn = connection();
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: user, blockhash, lastValidBlockHeight }).add(...ixs);
  return { tx: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"), summary };
}
