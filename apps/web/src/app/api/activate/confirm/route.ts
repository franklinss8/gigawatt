import { requireWallet } from "@/lib/auth";
import { verifyActivation } from "@/lib/chain";
import { db } from "@/lib/db";
import { json } from "@/lib/proxy";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const w = await requireWallet().catch(r => r as Response); if (w instanceof Response) return w;
  const { sig } = await req.json();
  if (typeof sig !== "string") return json({ error: "sig required" }, 400);
  if (await db().getActivation(sig)) return json({ ok: true, duplicate: true });
  try {
    const ev = await verifyActivation(sig, w);
    const credit = ev.net / 1e6;
    await db().addActivation({ sig, wallet: w, amount: ev.amount, net: ev.net, credit_usd: credit });
    const balance = await db().addCredit(w, credit);
    await db().addLedger({ wallet: w, kind: "activation", amount: credit, ref: sig });
    return json({ ok: true, credit_usd: credit, balance });
  } catch (e) { return json({ error: (e as Error).message }, 400); }
}
