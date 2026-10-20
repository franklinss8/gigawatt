import { currentWallet } from "@/lib/auth";
import { db } from "@/lib/db";
import { json } from "@/lib/proxy";
export const dynamic = "force-dynamic";
export async function GET() {
  const w = await currentWallet();
  if (!w) return json({ wallet: null });
  const a = await db().ensureAccount(w);
  return json({ wallet: w, credit_usd: a.credit_usd, created_at: a.created_at });
}
