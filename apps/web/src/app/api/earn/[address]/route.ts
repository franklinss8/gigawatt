import { PublicKey } from "@solana/web3.js";
import { db } from "@/lib/db";
import { gwattBalance, readConfig, isClaimed } from "@/lib/chain";
import { json } from "@/lib/proxy";
import { chainConfigured } from "@/lib/env";
export const dynamic = "force-dynamic";
export async function GET(_: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  try { new PublicKey(address); } catch { return json({ error: "invalid address" }, 400); }
  if (!chainConfigured()) return json({ status: "not_configured" }, 200);
  let cfg; let balance = 0;
  try { [cfg, balance] = await Promise.all([readConfig(), gwattBalance(address)]); } catch { return json({ status: "chain_unavailable" }, 503); }
  const rows = await db().holderFlushes(address);
  // Reconcile claim status with chain for rows not yet marked claimed.
  const payouts = await Promise.all(rows.map(async r => {
    const claimed = !!r.claimed_sig || await isClaimed(r.flush_index, address).catch(() => false);
    return { flush_index: r.flush_index, amount: r.amount, claimed, claimed_sig: r.claimed_sig, ts: r.flush.ts, watt_for_holders: r.flush.watt_for_holders, sig: r.flush.sig };
  }));
  const accumulative = payouts.reduce((s, p) => s + p.amount, 0);
  const claimed = payouts.filter(p => p.claimed).reduce((s, p) => s + p.amount, 0);
  const now = Math.floor(Date.now() / 1000);
  return json({
    status: "ok", address, balance, claimable: accumulative - claimed, claimed, accumulative,
    hook_state: cfg && { flush_interval: cfg.flushInterval, last_flush: cfg.lastFlushTs, next_eligible: cfg.lastFlushTs + cfg.flushInterval, min_flush_usdc: cfg.minFlushUsdc, treasury_share_bps: cfg.treasuryShareBps, flush_count: cfg.flushCount, now },
    totals: cfg && { total_rewards: cfg.totalRewards, total_claimed: cfg.totalClaimed },
    payouts: payouts.sort((a, b) => b.flush_index - a.flush_index),
  });
}
