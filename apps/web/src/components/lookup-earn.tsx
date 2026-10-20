"use client";
import { useState } from "react";
import { atoms } from "./ui";
import { BRAND } from "@/lib/brand";

export function LookupEarn() {
  const [addr, setAddr] = useState(""); const [res, setRes] = useState<Record<string, number | string> | null>(null); const [busy, setBusy] = useState(false);
  const go = async () => { if (!addr) return; setBusy(true); setRes(await (await fetch(`/api/earn/${addr.trim()}`)).json()); setBusy(false); };
  return (
    <div className="card p-5">
      <p className="font-medium">Check a wallet</p>
      <div className="flex gap-2 mt-3"><input className="input num" placeholder="Wallet address" value={addr} onChange={e => setAddr(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} /><button className="btn-ghost" onClick={go} disabled={busy}>{busy ? "…" : "Look up"}</button></div>
      {res && res.status === "ok" && <div className="grid sm:grid-cols-4 gap-3 mt-4 text-sm">{[["Claimable", res.claimable], ["Claimed", res.claimed], ["Assigned", res.accumulative]].map(([k, v]) => <div key={String(k)}><p className="label">{k}</p><p className="num mt-1">{atoms(Number(v))} {BRAND.creditToken}</p></div>)}<div><p className="label">{BRAND.launchToken}</p><p className="num mt-1">{atoms(Number(res.balance), 0)}</p></div></div>}
      {res && res.status !== "ok" && <p className="text-sm text-fg-3 mt-3">{String(res.error || res.status)}</p>}
    </div>
  );
}
