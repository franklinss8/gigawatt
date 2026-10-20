"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageTitle } from "@/components/app-shell";
import { useMe, useSendTx } from "@/components/hooks";
import { BRAND } from "@/lib/brand";
import { explorerUrl } from "@/lib/env";
import { fmt } from "@/components/ui";

export default function Page() { return <Suspense><Money /></Suspense>; }

function Money() {
  const initial = useSearchParams().get("action") === "activate" ? "activate" : "buy";
  const [tab, setTab] = useState<"buy" | "activate">(initial);
  const { me, refresh } = useMe();
  const tx = useSendTx();
  const [amount, setAmount] = useState("100");
  const n = Number(amount) || 0;
  const pf = BRAND.purchaseFeeBps / 1e4, af = BRAND.activationFeeBps / 1e4;
  const run = async () => {
    const atoms = Math.round(n * 1e6);
    if (tab === "buy") await tx.send("buy", { usdc: atoms });
    else await tx.send("activate", { amount: atoms }, "/api/activate/confirm");
    refresh();
  };
  return (
    <>
      <PageTitle title="Money" sub={<>Credit: <b className="num text-fg">${fmt(me?.credit_usd ?? 0, 4)}</b></>} />
      <div className="flex gap-1 mb-6 border-b border-line">
        {(["buy", "activate"] as const).map(t => <button key={t} onClick={() => setTab(t)} className={`px-4 h-10 text-sm capitalize border-b-2 -mb-px ${tab === t ? "border-volt text-fg" : "border-transparent text-fg-2"}`}>{t === "buy" ? `Buy ${BRAND.creditToken}` : `Activate ${BRAND.creditToken}`}</button>)}
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card p-5">
          <label className="label">{tab === "buy" ? "You pay (USDC)" : `Amount (${BRAND.creditToken})`}</label>
          <input className="input mt-2 num text-lg h-12" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
          <div className="mt-4 text-sm space-y-2 text-fg-2">
            {tab === "buy" ? (<>
              <Row k="Purchase fee" v={`${fmt(n * pf)} USDC`} /><Row k="To funding wallet" v={`${fmt(n * (1 - pf))} USDC`} /><Row k="You get" v={`${fmt(n * (1 - pf))} ${BRAND.creditToken}`} strong />
            </>) : (<>
              <Row k="Activation fee" v={`${fmt(n * af)} ${BRAND.creditToken}`} /><Row k="Burned" v={`${fmt(n * (1 - af))} ${BRAND.creditToken}`} /><Row k="You get" v={`$${fmt(n * (1 - af))} credit`} strong />
            </>)}
          </div>
          <button className="btn-primary w-full mt-5 disabled:opacity-50" disabled={tx.busy || n <= 0} onClick={run}>{tx.busy ? tx.step + "…" : tab === "buy" ? "Buy" : "Activate"}</button>
          {tx.error && <p className="text-bad text-sm mt-3">{tx.error}</p>}
          {tx.sig && tx.step === "Done" && <p className="text-ok text-sm mt-3">Confirmed · <a className="underline" href={explorerUrl("tx", tx.sig)} target="_blank">view transaction</a></p>}
        </div>
        <div className="text-sm text-fg-2 space-y-3 leading-6">
          {tab === "buy" ? (<>
            <p>Each sale sends the net USDC to the funding wallet and mints the same amount of {BRAND.creditToken} to your wallet, so every {BRAND.creditToken} in circulation is backed 1:1.</p>
            <p>You need USDC on {process.env.NEXT_PUBLIC_CLUSTER === "mainnet-beta" ? "Solana mainnet" : "devnet (the mock USDC mint of this deployment)"} and a little SOL for fees.</p>
          </>) : (<>
            <p>Activation burns {BRAND.creditToken} and credits your account in dollars. The fee goes to the treasury. Credit is spent per request and cannot be turned back into tokens.</p>
            <p>If you&apos;d rather keep tokens liquid, <a className="text-volt" href="/sell">sell them on the book</a> instead.</p>
          </>)}
        </div>
      </div>
    </>
  );
}
function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) { return <div className="flex justify-between"><span>{k}</span><span className={`num ${strong ? "text-fg font-medium" : ""}`}>{v}</span></div>; }
