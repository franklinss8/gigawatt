import { requireWallet } from "@/lib/auth";
import { buildTx, TxKind } from "@/lib/tx";
import { json } from "@/lib/proxy";
import { chainConfigured } from "@/lib/env";
export const dynamic = "force-dynamic";
export async function POST(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const w = await requireWallet().catch(r => r as Response); if (w instanceof Response) return w;
  if (!chainConfigured()) return json({ error: "Program not configured on this deployment" }, 503);
  const { kind } = await params;
  try { return json(await buildTx(kind as TxKind, w, await req.json().catch(() => ({})))); }
  catch (e) { return json({ error: (e as Error).message }, 400); }
}
