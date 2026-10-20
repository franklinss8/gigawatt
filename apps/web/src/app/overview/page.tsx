"use client";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { PageTitle } from "@/components/app-shell";
import { useJson, useMe } from "@/components/hooks";
import { Stat, atoms, fmt, Pill } from "@/components/ui";
import { BRAND } from "@/lib/brand";

type Earn = { status: string; balance?: number; claimable?: number; payouts?: { flush_index: number; amount: number; claimed: boolean }[] };
type Act = { ledger: { id: string; kind: string; amount: number; ref: string | null; ts: string }[] };

export default function Home() {
  const { me } = useMe();
  const { publicKey } = useWallet();
  const addr = me?.wallet;
  const { data: earn } = useJson<Earn>(addr ? `/api/earn/${addr}` : null, [addr]);
  const { data: act } = useJson<Act>(addr ? "/api/activity" : null, [addr]);
  const walletMismatch = publicKey && addr && publicKey.toBase58() !== addr;
  return (
    <>
      <PageTitle title="Home" sub={addr && <span className="num">{addr}</span>} right={walletMismatch ? <Pill tone="bad">Connected wallet differs from signed-in wallet</Pill> : null} />
      <div className="grid sm:grid-cols-3 gap-3">
        <Stat label="Credit" value={`$${fmt(me?.credit_usd ?? 0, 4)}`} hint="Spent per request" />
        <Stat label={`${BRAND.launchToken} held`} value={earn?.balance != null ? atoms(earn.balance, 0) : "–"} hint="Qualifies you for payouts" />
        <Stat label="Claimable" value={earn?.claimable != null ? atoms(earn.claimable) : "–"} unit={BRAND.creditToken} hint={earn?.status === "not_configured" ? "Program not configured" : "From payouts"} />
      </div>
      <div className="grid md:grid-cols-3 gap-3 mt-3">
        {[["/overview/money?action=buy", `Buy ${BRAND.creditToken}`, "USDC in, tokens out."], ["/overview/money?action=activate", "Activate", "Burn tokens into credit."], ["/overview/rewards", "Claim rewards", "Take payouts to wallet or credit."]].map(([h, t, d]) => (
          <Link key={h} href={h} className="card p-4 hover:border-line-2"><p className="font-medium">{t}</p><p className="text-sm text-fg-2 mt-1">{d}</p></Link>))}
      </div>
      <h2 className="font-medium mt-10 mb-3">Recent</h2>
      <div className="card divide-y divide-line">
        {!act?.ledger?.length && <p className="p-4 text-sm text-fg-3">Nothing yet. Create an API key, add credit, and your activity shows up here.</p>}
        {act?.ledger?.slice(0, 12).map(l => (
          <div key={l.id} className="flex items-center justify-between p-4 text-sm">
            <div><span className="capitalize">{l.kind}</span> <span className="text-fg-3">{l.ref && l.kind !== "spend" ? l.ref.slice(0, 8) + "…" : l.ref}</span><p className="text-xs text-fg-3">{new Date(l.ts).toLocaleString()}</p></div>
            <span className={`num ${l.amount >= 0 ? "text-ok" : "text-fg-2"}`}>{l.amount >= 0 ? "+" : ""}{fmt(l.amount, 4)}{l.kind === "claim" ? ` ${BRAND.creditToken}` : " $"}</span>
          </div>))}
      </div>
    </>
  );
}
