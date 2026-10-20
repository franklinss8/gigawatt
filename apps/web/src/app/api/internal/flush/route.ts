import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { json } from "@/lib/proxy";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
/** Called by the keeper after a successful on-chain flush. Body: see SPEC §3 step 6. */
export async function POST(req: Request) {
  if (!env.keeperSecret || req.headers.get("x-keeper-secret") !== env.keeperSecret) return json({ error: "forbidden" }, 403);
  const b = await req.json();
  const holders = (b.holders as { wallet: string; amount: number | string; proof: string[] }[]).map(h => ({ flush_index: Number(b.index), wallet: h.wallet, amount: Number(h.amount), proof: h.proof }));
  await db().addFlush({
    index: Number(b.index), ts: new Date(Number(b.ts) * 1000).toISOString(), slot: Number(b.slot), sig: String(b.sig),
    sol_collected: Number(b.sol_collected), usdc_received: Number(b.usdc_received), usdc_to_treasury: Number(b.usdc_to_treasury), usdc_to_funding: Number(b.usdc_to_funding),
    watt_for_holders: Number(b.watt_for_holders), merkle_root: String(b.merkle_root), holder_supply: Number(b.holder_supply), holder_count: Number(b.holder_count),
  }, holders);
  return json({ ok: true, holders: holders.length });
}
