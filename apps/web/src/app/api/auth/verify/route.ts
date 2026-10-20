import { verifyLogin } from "@/lib/auth";
import { db } from "@/lib/db";
import { json } from "@/lib/proxy";
export async function POST(req: Request) {
  const { wallet, token, signature } = await req.json();
  try { await verifyLogin(wallet, token, signature); await db().ensureAccount(wallet); return json({ ok: true }); }
  catch (e) { return json({ error: (e as Error).message }, 401); }
}
