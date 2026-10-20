import { requireWallet } from "@/lib/auth";
import { db } from "@/lib/db";
import { json } from "@/lib/proxy";
export const dynamic = "force-dynamic";
export async function GET() {
  const w = await requireWallet().catch(r => r as Response); if (w instanceof Response) return w;
  const [ledger, requests, activations] = await Promise.all([db().listLedger(w, 100), db().listRequests(w, 100), db().listActivations(w)]);
  return json({ ledger, requests, activations });
}
