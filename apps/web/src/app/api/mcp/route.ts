import { NextRequest } from "next/server";
import { authenticateKey } from "@/lib/keys";
import { db } from "@/lib/db";
import { listModels, costOf, labOf, OPENROUTER } from "@/lib/openrouter";
import { env } from "@/lib/env";
import { BRAND } from "@/lib/brand";
import { json } from "@/lib/proxy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Minimal MCP server (Streamable HTTP, JSON responses). Tools: credit, models, run. Auth: Bearer sk-gw- key. */
const TOOLS = [
  { name: "credit", description: `Return the account's current ${BRAND.name} credit in USD and recent spend.`, inputSchema: { type: "object", properties: {} } },
  { name: "models", description: "List available models, optionally filtered by lab or substring. Returns id, lab, context, prices per million tokens.", inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } } } },
  { name: "run", description: "Run a prompt on a model and return the text. Costs credit.", inputSchema: { type: "object", properties: { model: { type: "string" }, prompt: { type: "string" }, system: { type: "string" }, max_tokens: { type: "number" } }, required: ["model", "prompt"] } },
];

export async function POST(req: NextRequest) {
  const key = await authenticateKey(req);
  if (!key) return json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized: pass your sk-gw- key as a Bearer token" }, id: null }, 401);
  const msg = await req.json().catch(() => null);
  if (!msg || msg.jsonrpc !== "2.0") return json({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid request" }, id: null }, 400);
  const id = msg.id ?? null; const reply = (result: unknown) => json({ jsonrpc: "2.0", id, result });
  switch (msg.method) {
    case "initialize": return reply({ protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: BRAND.name, version: "1.0.0" } });
    case "notifications/initialized": case "ping": return reply({});
    case "tools/list": return reply({ tools: TOOLS });
    case "tools/call": {
      const { name, arguments: a = {} } = msg.params || {};
      try { return reply({ content: [{ type: "text", text: await call(name, a, key.account_wallet) }] }); }
      catch (e) { return reply({ content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true }); }
    }
    default: return json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
  }
}
export async function GET() { return json({ name: BRAND.name, transport: "streamable-http", endpoint: "/api/mcp", tools: TOOLS.map(t => t.name) }); }

async function call(name: string, a: Record<string, unknown>, wallet: string) {
  if (name === "credit") { const acc = await db().ensureAccount(wallet); const reqs = await db().listRequests(wallet, 20); return JSON.stringify({ credit_usd: acc.credit_usd, recent: reqs.map(r => ({ model: r.model, cost_usd: r.cost_usd, ts: r.ts })) }); }
  if (name === "models") { const q = String(a.query || "").toLowerCase(); const ms = (await listModels()).filter(m => !q || (m.id + m.name + labOf(m.id)).toLowerCase().includes(q)).slice(0, Number(a.limit) || 50); return JSON.stringify(ms.map(m => ({ id: m.id, lab: labOf(m.id), context: m.context_length, input_per_m: +(Number(m.pricing.prompt) * 1e6).toFixed(3), output_per_m: +(Number(m.pricing.completion) * 1e6).toFixed(3) }))); }
  if (name === "run") {
    const acc = await db().ensureAccount(wallet); if (acc.credit_usd <= 0) throw new Error("Insufficient credit");
    if (!env.openrouterKey) throw new Error("Gateway not configured");
    const model = String(a.model);
    const r = await fetch(`${OPENROUTER}/chat/completions`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${env.openrouterKey}` }, body: JSON.stringify({ model, max_tokens: Number(a.max_tokens) || 1024, messages: [...(a.system ? [{ role: "system", content: String(a.system) }] : []), { role: "user", content: String(a.prompt) }] }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || `upstream ${r.status}`);
    const u = j.usage || {}; const info = (await listModels()).find(m => m.id === model); const cost = costOf(info, u.prompt_tokens || 0, u.completion_tokens || 0);
    await db().addRequest({ account_wallet: wallet, key_id: null, model, input_tokens: u.prompt_tokens || 0, output_tokens: u.completion_tokens || 0, cost_usd: cost, status: 200 });
    if (cost > 0) { await db().spendCredit(wallet, cost); await db().addLedger({ wallet, kind: "spend", amount: -cost, ref: model }); }
    return j.choices?.[0]?.message?.content ?? "";
  }
  throw new Error(`Unknown tool ${name}`);
}
