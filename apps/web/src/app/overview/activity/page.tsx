"use client";
import { PageTitle } from "@/components/app-shell";
import { useJson } from "@/components/hooks";
import { fmt } from "@/components/ui";
import { explorerUrl } from "@/lib/env";

type A = { ledger: { id: string; kind: string; amount: number; ref: string | null; ts: string }[]; requests: { id: string; model: string; input_tokens: number; output_tokens: number; cost_usd: number; ts: string; status: number }[] };
export default function Page() {
  const { data } = useJson<A>("/api/activity");
  return (
    <>
      <PageTitle title="Activity" sub="Every credit movement and every request." />
      <h2 className="font-medium mb-3">Ledger</h2>
      <div className="card divide-y divide-line">
        {!data?.ledger?.length && <p className="p-4 text-sm text-fg-3">Empty.</p>}
        {data?.ledger?.map(l => <div key={l.id} className="p-3 px-4 flex justify-between text-sm"><div><span className="capitalize">{l.kind}</span>{l.ref && l.kind !== "spend" && <a className="text-xs text-fg-3 ml-2 underline" href={explorerUrl("tx", l.ref)} target="_blank">tx</a>}{l.kind === "spend" && <span className="text-xs text-fg-3 ml-2">{l.ref}</span>}<p className="text-xs text-fg-3">{new Date(l.ts).toLocaleString()}</p></div><span className={`num ${l.amount >= 0 ? "text-ok" : "text-fg-2"}`}>{l.amount >= 0 ? "+" : ""}{fmt(l.amount, 6)}</span></div>)}
      </div>
      <h2 className="font-medium mt-10 mb-3">Requests</h2>
      <div className="card overflow-x-auto"><table className="w-full text-sm"><thead><tr className="label text-left"><th className="p-3 font-normal">When</th><th className="p-3 font-normal">Model</th><th className="p-3 font-normal text-right">In</th><th className="p-3 font-normal text-right">Out</th><th className="p-3 font-normal text-right">Cost</th></tr></thead>
        <tbody className="num">{data?.requests?.map(r => <tr key={r.id} className="border-t border-line"><td className="p-3 text-fg-3">{new Date(r.ts).toLocaleString()}</td><td className="p-3 font-sans">{r.model}</td><td className="p-3 text-right">{r.input_tokens.toLocaleString()}</td><td className="p-3 text-right">{r.output_tokens.toLocaleString()}</td><td className="p-3 text-right">${fmt(r.cost_usd, 6)}</td></tr>)}
        {!data?.requests?.length && <tr><td className="p-4 text-fg-3 font-sans" colSpan={5}>No requests yet.</td></tr>}</tbody></table></div>
    </>
  );
}
