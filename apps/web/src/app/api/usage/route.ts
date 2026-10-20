import { requireWallet } from "@/lib/auth";
import { db } from "@/lib/db";
import { json } from "@/lib/proxy";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const w = await requireWallet().catch(r => r as Response); if (w instanceof Response) return w;
  const days = Math.min(90, Number(new URL(req.url).searchParams.get("days") || 30));
  const [days_, requests] = await Promise.all([db().usageSummary(w, days), db().listRequests(w, 200)]);
  const byModel: Record<string, { requests: number; tokens: number; cost_usd: number }> = {};
  for (const r of requests) { const m = byModel[r.model] ??= { requests: 0, tokens: 0, cost_usd: 0 }; m.requests++; m.tokens += r.input_tokens + r.output_tokens; m.cost_usd += r.cost_usd; }
  return json({ days: days_, byModel });
}
