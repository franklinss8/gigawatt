import { requireWallet } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateKey, keyPrefixOf, sha256Hex } from "@/lib/keys";
import { json } from "@/lib/proxy";
export const dynamic = "force-dynamic";
export async function GET() {
  const w = await requireWallet().catch(r => r as Response); if (w instanceof Response) return w;
  const keys = await db().listKeys(w);
  return json({ keys: keys.map(({ hash: _h, ...k }) => k) });
}
export async function POST(req: Request) {
  const w = await requireWallet().catch(r => r as Response); if (w instanceof Response) return w;
  const { name } = await req.json().catch(() => ({}));
  const active = (await db().listKeys(w)).filter(k => !k.revoked_at);
  if (active.length >= 10) return json({ error: "Key limit reached (10 active keys)" }, 400);
  const raw = generateKey();
  const row = await db().createKey({ id: crypto.randomUUID(), account_wallet: w, hash: await sha256Hex(raw), prefix: keyPrefixOf(raw), name: String(name || "Default").slice(0, 40) });
  return json({ key: raw, id: row.id, prefix: row.prefix, name: row.name, created_at: row.created_at });
}
export async function DELETE(req: Request) {
  const w = await requireWallet().catch(r => r as Response); if (w instanceof Response) return w;
  const { id } = await req.json();
  await db().revokeKey(w, String(id));
  return json({ ok: true });
}
