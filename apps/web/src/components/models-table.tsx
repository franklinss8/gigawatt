"use client";
import { useMemo, useState } from "react";
import { useJson } from "./hooks";

type M = { id: string; name: string; lab: string; context_length?: number; prompt: number; completion: number; modality?: string };
export function ModelsTable({ compact }: { compact?: boolean }) {
  const { data, loading } = useJson<{ count: number; models: M[] }>("/api/models");
  const [q, setQ] = useState(""); const [lab, setLab] = useState("");
  const labs = useMemo(() => Array.from(new Set((data?.models ?? []).map(m => m.lab))).sort(), [data]);
  const rows = useMemo(() => (data?.models ?? []).filter(m => (!lab || m.lab === lab) && (!q || (m.id + m.name).toLowerCase().includes(q.toLowerCase()))), [data, q, lab]);
  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input className="input sm:max-w-xs" placeholder="Search models…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="input sm:max-w-[200px]" value={lab} onChange={e => setLab(e.target.value)}><option value="">All labs</option>{labs.map(l => <option key={l}>{l}</option>)}</select>
        <span className="text-sm text-fg-3 self-center num">{rows.length} of {data?.count ?? 0}</span>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="label text-left"><th className="p-3 font-normal">Model</th><th className="p-3 font-normal">Lab</th>{!compact && <th className="p-3 font-normal text-right">Context</th>}<th className="p-3 font-normal text-right">Input /M</th><th className="p-3 font-normal text-right">Output /M</th></tr></thead>
          <tbody>
            {loading && <tr><td className="p-4 text-fg-3" colSpan={5}>Loading catalog…</td></tr>}
            {rows.slice(0, compact ? 60 : 1000).map(m => (
              <tr key={m.id} className="border-t border-line hover:bg-bg-2/50"><td className="p-3"><p>{m.name.replace(/^[^:]+:\s*/, "")}</p><p className="num text-xs text-fg-3">{m.id}</p></td><td className="p-3 text-fg-2">{m.lab}</td>{!compact && <td className="p-3 text-right num text-fg-2">{m.context_length ? (m.context_length / 1000).toFixed(0) + "k" : "–"}</td>}<td className="p-3 text-right num">${m.prompt.toFixed(2)}</td><td className="p-3 text-right num">${m.completion.toFixed(2)}</td></tr>))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-fg-3 mt-3">Prices are OpenRouter list prices per million tokens. Requests are billed at that price plus OpenRouter&apos;s 5% platform fee. No markup.</p>
    </div>
  );
}
