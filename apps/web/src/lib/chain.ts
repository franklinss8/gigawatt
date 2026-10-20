import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";
import { BorshCoder, EventParser, Idl } from "@coral-xyz/anchor";
import { env, chainConfigured } from "./env";
import { IDL, PROGRAM_ID, findConfig, findFlush, findClaimStatus, rewardsVault, getReadonlyProgram } from "./sdk";

export const connection = () => new Connection(env.rpcUrl, "confirmed");

export const program = () => getReadonlyProgram(connection());

export type ConfigView = {
  admin: string; keeper: string; gwattMint: string; wattMint: string; usdcMint: string; treasury: string; fundingWallet: string;
  purchaseFeeBps: number; activationFeeBps: number; buyerFeeBps: number; treasuryShareBps: number;
  flushInterval: number; minFlushUsdc: number; lastFlushTs: number; flushCount: number;
  totalMinted: number; totalBurned: number; totalRewards: number; totalClaimed: number; totalUsdcIn: number;
};

const n = (v: unknown) => Number(v?.toString?.() ?? 0);
const s = (v: unknown) => (v as PublicKey)?.toBase58?.() ?? String(v);

export async function readConfig(): Promise<ConfigView | null> {
  if (!chainConfigured()) return null;
  const p = program();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = await (p.account as any).config.fetch(findConfig()[0]);
  return {
    admin: s(c.admin), keeper: s(c.keeper), gwattMint: s(c.gwattMint), wattMint: s(c.wattMint), usdcMint: s(c.usdcMint), treasury: s(c.treasury), fundingWallet: s(c.fundingWallet),
    purchaseFeeBps: n(c.purchaseFeeBps), activationFeeBps: n(c.activationFeeBps), buyerFeeBps: n(c.buyerFeeBps), treasuryShareBps: n(c.treasuryShareBps),
    flushInterval: n(c.flushInterval), minFlushUsdc: n(c.minFlushUsdc), lastFlushTs: n(c.lastFlushTs), flushCount: n(c.flushCount),
    totalMinted: n(c.totalMinted), totalBurned: n(c.totalBurned), totalRewards: n(c.totalRewards), totalClaimed: n(c.totalClaimed), totalUsdcIn: n(c.totalUsdcIn),
  };
}

export async function readChainStats() {
  if (!chainConfigured()) return null;
  const conn = connection();
  const cfg = await readConfig(); if (!cfg) return null;
  const [slot, wattSupply, fundingUsdc, vaultWatt] = await Promise.all([
    conn.getSlot().then(Number),
    conn.getTokenSupply(new PublicKey(env.wattMint)).then(r => Number(r.value.amount)).catch(() => 0),
    tokenBalance(conn, new PublicKey(env.usdcMint), new PublicKey(cfg.fundingWallet)),
    conn.getTokenAccountBalance(rewardsVault(new PublicKey(env.wattMint))).then(r => Number(r.value.amount)).catch(() => 0),
  ]);
  return { slot, wattSupply, fundingUsdc, vaultWatt, ...cfg, programId: PROGRAM_ID.toBase58() };
}

async function tokenBalance(conn: Connection, mint: PublicKey, owner: PublicKey) {
  const r = await conn.getTokenAccountsByOwner(owner, { mint }).catch(() => ({ value: [] }));
  let total = 0;
  for (const a of r.value) { const b = await conn.getTokenAccountBalance(a.pubkey).catch(() => null); total += Number(b?.value.amount || 0); }
  return total;
}

export type AskView = { address: string; seller: string; nonce: number; price: number; amount: number; remaining: number; ts: number };
export async function readOrderBook(): Promise<{ asks: AskView[]; fills: { price: number; amount: number; sig: string; ts: number }[]; slot: number }> {
  if (!chainConfigured()) return { asks: [], fills: [], slot: 0 };
  const p = program();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = await (p.account as any).ask.all();
  const asks: AskView[] = all
    .map((a: { publicKey: PublicKey; account: Record<string, unknown> }) => ({ address: a.publicKey.toBase58(), seller: s(a.account.seller), nonce: n(a.account.nonce), price: n(a.account.price), amount: n(a.account.amount), remaining: n(a.account.remaining), ts: n(a.account.ts) }))
    .filter((a: AskView) => a.remaining > 0)
    .sort((a: AskView, b: AskView) => a.price - b.price || a.ts - b.ts);
  const slot = Number(await connection().getSlot());
  return { asks, fills: await recentFills(), slot };
}

export async function recentFills() {
  const conn = connection();
  const sigs = await conn.getSignaturesForAddress(PROGRAM_ID, { limit: 40 }).catch(() => []);
  const parser = new EventParser(PROGRAM_ID, new BorshCoder(IDL as Idl));
  const out: { price: number; amount: number; sig: string; ts: number }[] = [];
  for (const sg of sigs) {
    if (out.length >= 10) break;
    const tx = await conn.getTransaction(sg.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
    if (!tx?.meta?.logMessages) continue;
    for (const ev of parser.parseLogs(tx.meta.logMessages)) if (ev.name === "filled") out.push({ price: n(ev.data.price), amount: n(ev.data.amount), sig: sg.signature, ts: Number(sg.blockTime || 0) });
  }
  return out;
}

export type FlushView = { address: string; index: number; ts: number; slot: number; solCollected: number; usdcReceived: number; usdcToTreasury: number; usdcToFunding: number; wattForHolders: number; merkleRoot: string; holderSupply: number; holderCount: number; claimed: number };
export async function readFlushes(limit = 48): Promise<FlushView[]> {
  if (!chainConfigured()) return [];
  const p = program();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all = await (p.account as any).flush.all();
  return all.map((f: { publicKey: PublicKey; account: Record<string, unknown> }) => ({
    address: f.publicKey.toBase58(), index: n(f.account.index), ts: n(f.account.ts), slot: n(f.account.slot), solCollected: n(f.account.solCollected), usdcReceived: n(f.account.usdcReceived), usdcToTreasury: n(f.account.usdcToTreasury), usdcToFunding: n(f.account.usdcToFunding), wattForHolders: n(f.account.wattForHolders), merkleRoot: Buffer.from(f.account.merkleRoot as number[]).toString("hex"), holderSupply: n(f.account.holderSupply), holderCount: n(f.account.holderCount), claimed: n(f.account.claimed),
  })).sort((a: FlushView, b: FlushView) => b.index - a.index).slice(0, limit);
}

export async function isClaimed(flushIndex: number, wallet: string) {
  const [cs] = findClaimStatus(findFlush(flushIndex)[0], new PublicKey(wallet));
  const info = await connection().getAccountInfo(cs);
  return !!info;
}

export async function gwattBalance(wallet: string) {
  if (!env.gwattMint) return 0;
  return tokenBalance(connection(), new PublicKey(env.gwattMint), new PublicKey(wallet));
}
export async function wattBalance(wallet: string) {
  if (!env.wattMint) return 0;
  return tokenBalance(connection(), new PublicKey(env.wattMint), new PublicKey(wallet));
}

/** Verifies an on-chain `activate` (or claim_and_activate) transaction and returns the decoded event. */
export async function verifyActivation(sig: string, wallet: string) {
  const conn = connection();
  const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  if (!tx || tx.meta?.err) throw new Error("Transaction not found or failed");
  const parser = new EventParser(PROGRAM_ID, new BorshCoder(IDL as Idl));
  for (const ev of parser.parseLogs(tx.meta?.logMessages || [])) {
    if (ev.name === "activated" && s(ev.data.owner) === wallet) return { amount: n(ev.data.amount), net: n(ev.data.net), slot: Number(tx.slot), blockTime: Number(tx.blockTime || 0) };
  }
  throw new Error("No activation for this wallet in that transaction");
}
export async function verifyClaim(sig: string, wallet: string) {
  const conn = connection();
  const tx = await conn.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
  if (!tx || tx.meta?.err) throw new Error("Transaction not found or failed");
  const parser = new EventParser(PROGRAM_ID, new BorshCoder(IDL as Idl));
  const out: { flushIndex: number; amount: number }[] = [];
  for (const ev of parser.parseLogs(tx.meta?.logMessages || [])) if (ev.name === "claimed" && s(ev.data.claimant) === wallet) out.push({ flushIndex: n(ev.data.flushIndex), amount: n(ev.data.amount) });
  return out;
}
