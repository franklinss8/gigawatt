import { NextRequest } from "next/server";
import { authenticateKey } from "./keys";
import { db } from "./db";
import { env } from "./env";
import { OPENROUTER, costOf, listModels } from "./openrouter";
import { BRAND } from "./brand";

type Usage = { input: number; output: number };

export async function proxyToOpenRouter(req: NextRequest, path: "chat/completions" | "messages" | "completions") {
  const key = await authenticateKey(req);
  if (!key) return json({ error: { message: `Missing or invalid API key. Keys look like ${BRAND.keyPrefix}…`, type: "authentication_error" } }, 401);
  if (!env.openrouterKey) return json({ error: { message: "Model gateway not configured (OPENROUTER_API_KEY missing)", type: "server_error" } }, 503);

  const account = await db().ensureAccount(key.account_wallet);
  if (account.credit_usd <= 0) return json({ error: { message: "Insufficient credit. Activate WATT on your dashboard to add credit.", type: "insufficient_quota" } }, 402);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: { message: "Invalid JSON body", type: "invalid_request_error" } }, 400); }
  let model = String(body.model || "");
  const stream = body.stream === true;

  // Overdrive: ":overdrive" suffix or header → fastest provider, fallbacks on.
  const overdrive = model.endsWith(":overdrive") || req.headers.get("x-gw-overdrive") === "1";
  if (model.endsWith(":overdrive")) model = model.slice(0, -":overdrive".length);
  // Incognito: header → providers that don't retain data, and no model name in your usage log.
  const incognito = req.headers.get("x-gw-incognito") === "1";
  const provider = { ...(body.provider as object || {}) } as Record<string, unknown>;
  if (overdrive) Object.assign(provider, { sort: "throughput", allow_fallbacks: true });
  if (incognito) Object.assign(provider, { data_collection: "deny" });
  if (overdrive || incognito) body.provider = provider;
  body.model = model;
  if (path === "chat/completions" && stream) body.stream_options = { include_usage: true, ...(body.stream_options as object || {}) };

  const upstream = await fetch(`${OPENROUTER}/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.openrouterKey}`,
      "HTTP-Referer": env.siteUrl,
      "X-Title": BRAND.name,
      ...(path === "messages" ? { "anthropic-version": req.headers.get("anthropic-version") || "2023-06-01" } : {}),
    },
    body: JSON.stringify(body),
  });

  db().touchKey(key.id).catch(() => {});
  const models = await listModels();
  const modelInfo = models.find(m => m.id === model);
  const charge = async (u: Usage, status: number) => {
    const cost = costOf(modelInfo, u.input, u.output);
    await db().addRequest({ account_wallet: key.account_wallet, key_id: key.id, model: incognito ? "incognito" : model, input_tokens: u.input, output_tokens: u.output, cost_usd: cost, status });
    if (cost > 0) { await db().spendCredit(key.account_wallet, cost); await db().addLedger({ wallet: key.account_wallet, kind: "spend", amount: -cost, ref: model }); }
  };

  if (!upstream.ok || !stream) {
    const text = await upstream.text();
    let u: Usage = { input: 0, output: 0 };
    try { u = extractUsage(JSON.parse(text), path); } catch {}
    if (upstream.ok) await charge(u, upstream.status);
    return new Response(text, { status: upstream.status, headers: passHeaders(upstream.headers) });
  }

  // Streaming: tee the SSE stream, parse usage from the final events, charge when done.
  const decoder = new TextDecoder();
  let buffer = ""; const usage: Usage = { input: 0, output: 0 };
  const transformed = upstream.body!.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctrl) {
      ctrl.enqueue(chunk);
      buffer += decoder.decode(chunk, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, idx).trim(); buffer = buffer.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim(); if (!payload || payload === "[DONE]") continue;
        try { const u = extractUsage(JSON.parse(payload), path); if (u.input) usage.input = u.input; if (u.output) usage.output = u.output; } catch {}
      }
    },
    async flush() { await charge(usage, 200); },
  }));
  return new Response(transformed, { status: 200, headers: { ...passHeaders(upstream.headers), "content-type": "text/event-stream", "cache-control": "no-cache" } });
}

function extractUsage(j: Record<string, unknown>, path: string): Usage {
  const u = (j.usage ?? (j as { message?: { usage?: unknown } }).message?.usage) as Record<string, number> | undefined;
  if (!u) return { input: 0, output: 0 };
  if (path === "messages") return { input: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0), output: u.output_tokens || 0 };
  return { input: u.prompt_tokens || 0, output: u.completion_tokens || 0 };
}
function passHeaders(h: Headers) {
  const out: Record<string, string> = { "content-type": h.get("content-type") || "application/json" };
  for (const k of ["x-request-id", "anthropic-request-id"]) { const v = h.get(k); if (v) out[k] = v; }
  return out;
}
export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });
}
