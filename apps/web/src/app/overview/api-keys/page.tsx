"use client";
import { useState } from "react";
import { PageTitle } from "@/components/app-shell";
import { useJson } from "@/components/hooks";
import { BRAND } from "@/lib/brand";

type K = { id: string; prefix: string; name: string; created_at: string; revoked_at: string | null; last_used_at: string | null };
export default function Page() {
  const { data, reload } = useJson<{ keys: K[] }>("/api/keys");
  const [name, setName] = useState("Default"); const [fresh, setFresh] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const create = async () => { setBusy(true); const r = await (await fetch("/api/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) })).json(); setBusy(false); if (r.key) { setFresh(r.key); reload(); } };
  const revoke = async (id: string) => { if (!confirm("Revoke this key? Clients using it will stop working.")) return; await fetch("/api/keys", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }); reload(); };
  const base = typeof window !== "undefined" ? window.location.origin : `https://${BRAND.domain}`;
  return (
    <>
      <PageTitle title="API keys" sub={`One ${BRAND.keyPrefix} key works with OpenAI- and Anthropic-compatible clients.`} />
      <div className="card p-5 flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1"><label className="label">Name</label><input className="input mt-2" value={name} onChange={e => setName(e.target.value)} /></div>
        <button className="btn-primary" disabled={busy} onClick={create}>Create key</button>
      </div>
      {fresh && (
        <div className="card p-5 mt-4 border-volt/40">
          <p className="font-medium">Copy your key now. It won&apos;t be shown again.</p>
          <div className="flex gap-2 mt-3"><code className="num text-sm flex-1 rounded-md border border-line bg-bg px-3 py-2 overflow-x-auto">{fresh}</code><button className="btn-ghost" onClick={() => navigator.clipboard.writeText(fresh)}>Copy</button></div>
          <pre className="num text-xs text-fg-2 mt-4 overflow-x-auto">{`# Claude Code\nexport ANTHROPIC_BASE_URL=${base}\nexport ANTHROPIC_AUTH_TOKEN=${fresh}\n\n# OpenAI SDK\nOPENAI_BASE_URL=${base}/v1\nOPENAI_API_KEY=${fresh}`}</pre>
        </div>)}
      <div className="card divide-y divide-line mt-6">
        {!data?.keys?.length && <p className="p-4 text-sm text-fg-3">No keys yet.</p>}
        {data?.keys?.map(k => (
          <div key={k.id} className="p-4 flex items-center gap-4 text-sm">
            <div className="flex-1"><p className="font-medium">{k.name} {k.revoked_at && <span className="text-fg-3">(revoked)</span>}</p><p className="num text-xs text-fg-3">{k.prefix} · created {new Date(k.created_at).toLocaleDateString()}{k.last_used_at && ` · last used ${new Date(k.last_used_at).toLocaleString()}`}</p></div>
            {!k.revoked_at && <button className="btn-ghost h-8 text-xs" onClick={() => revoke(k.id)}>Revoke</button>}
          </div>))}
      </div>
    </>
  );
}
