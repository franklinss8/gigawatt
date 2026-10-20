import { requireWallet } from "@/lib/auth";
import { verifyClaim, verifyActivation } from "@/lib/chain";
import { db } from "@/lib/db";
import { json } from "@/lib/proxy";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const w = await requireWallet().catch(r => r as Response); if (w instanceof Response) return w;
  const { sig } = await req.json();
  if (typeof sig !== "string") return json({ error: "sig required" }, 400);
  try {
    const claims = await verifyClaim(sig, w);
    for (const c of claims) { await db().markClaimed(c.flushIndex, w, sig); await db().addLedger({ wallet: w, kind: "claim", amount: c.amount / 1e6, ref: sig }); }
    // claim_and_activate also emits Activated: credit it once.
    let credited = 0;
    if (!(await db().getActivation(sig))) {
      try { const ev = await verifyActivation(sig, w); credited = ev.net / 1e6; await db().addActivation({ sig, wallet: w, amount: ev.amount, net: ev.net, credit_usd: credited }); await db().addCredit(w, credited); await db().addLedger({ wallet: w, kind: "activation", amount: credited, ref: sig }); } catch {}
    }
    return json({ ok: true, claims, credited });
  } catch (e) { return json({ error: (e as Error).message }, 400); }
}
