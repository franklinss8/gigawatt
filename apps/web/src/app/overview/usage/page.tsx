"use client";
import { PageTitle } from "@/components/app-shell";
import { useJson } from "@/components/hooks";
import { Stat, fmt } from "@/components/ui";

type U = { days: { day: string; cost_usd: number; requests: number; tokens: number }[]; byModel: Record<string, { requests: number; tokens: number; cost_usd: number }> };
export default function Page() {
  const { data } = useJson<U>("/api/usage?days=30");
  const days = data?.days ?? []; const max = Math.max(1e-9, ...days.map(d => d.cost_usd));
  const tot = days.reduce((a, d) => ({ cost: a.cost + d.cost_usd, req: a.req + d.requests, tok: a.tok + d.tokens }), { cost: 0, req: 0, tok: 0 });
  return (
    <>
      <PageTitle title="Usage" sub="Last 30 days. Each request's model, tokens and cost." />
      <div className="grid sm:grid-cols-3 gap-3"><Stat label="Spent" value={`$${fmt(tot.cost, 4)}`} /><Stat label="Requests" value={tot.req.toLocaleString()} /><Stat label="Tokens" value={tot.tok.toLocaleString()} /></div>
      <div className="card p-5 mt-6">
        <p className="label mb-4">Daily spend</p>
        <div className="flex items-end gap-[3px] h-32">{days.map(d => <div key={d.day} title={`${d.day}: $${fmt(d.cost_usd, 4)}`} className="flex-1 bg-volt/70 hover:bg-volt rounded-t-sm" style={{ height: `${Math.max(2, (d.cost_usd / max) * 100)}%` }} />)}</div>
        <div className="flex justify-between text-xs text-fg-3 mt-2 num"><span>{days[0]?.day}</span><span>{days[days.length - 1]?.day}</span></div>
      </div>
      <h2 className="font-medium mt-10 mb-3">By model</h2>
      <div className="card overflow-x-auto"><table className="w-full text-sm"><thead><tr className="label text-left"><th className="p-3 font-normal">Model</th><th className="p-3 font-normal text-right">Requests</th><th className="p-3 font-normal text-right">Tokens</th><th className="p-3 font-normal text-right">Cost</th></tr></thead>
        <tbody className="num">{Object.entries(data?.byModel ?? {}).sort((a, b) => b[1].cost_usd - a[1].cost_usd).map(([m, v]) => <tr key={m} className="border-t border-line"><td className="p-3 font-sans">{m}</td><td className="p-3 text-right">{v.requests}</td><td className="p-3 text-right">{v.tokens.toLocaleString()}</td><td className="p-3 text-right">${fmt(v.cost_usd, 4)}</td></tr>)}
        {!Object.keys(data?.byModel ?? {}).length && <tr><td className="p-4 text-fg-3 font-sans" colSpan={4}>No requests yet.</td></tr>}</tbody></table></div>
    </>
  );
}
