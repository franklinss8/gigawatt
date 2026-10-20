import { PublicPage, PageHero } from "@/components/public-page";
import { Section, Pill } from "@/components/ui";
import { env, chainConfigured } from "@/lib/env";
import { connection } from "@/lib/chain";
import { dbMode } from "@/lib/db";
import { OPENROUTER } from "@/lib/openrouter";

export const metadata = { title: "Status" };
export const dynamic = "force-dynamic";
export default async function Page() {
  const t0 = Date.now();
  const rpc = await connection().getSlot().then(s => ({ ok: true, info: `slot ${s.toLocaleString()} · ${Date.now() - t0} ms` })).catch(e => ({ ok: false, info: String(e.message) }));
  const t1 = Date.now();
  const or = await fetch(`${OPENROUTER}/models`, { cache: "no-store" }).then(r => ({ ok: r.ok, info: `${r.status} · ${Date.now() - t1} ms` })).catch(e => ({ ok: false, info: String(e.message) }));
  const rows: [string, { ok: boolean; info: string }][] = [
    ["Solana RPC", rpc], ["Model gateway (OpenRouter)", or],
    ["Gateway key", { ok: !!env.openrouterKey, info: env.openrouterKey ? "configured" : "OPENROUTER_API_KEY missing" }],
    ["Program", { ok: chainConfigured(), info: chainConfigured() ? env.programId : "not configured" }],
    ["Storage", { ok: dbMode() === "supabase", info: dbMode() === "supabase" ? "Supabase" : "in-memory (resets on deploy)" }],
  ];
  return (
    <PublicPage>
      <PageHero eyebrow="Network" title="Status" sub="Live checks run on each page load." />
      <Section><div className="card divide-y divide-line text-sm">{rows.map(([k, v]) => <div key={k} className="p-4 flex items-center justify-between"><span>{k}</span><span className="flex items-center gap-3 num text-fg-3">{v.info}<Pill tone={v.ok ? "ok" : "bad"}>{v.ok ? "OK" : "Down"}</Pill></span></div>)}</div></Section>
    </PublicPage>
  );
}
