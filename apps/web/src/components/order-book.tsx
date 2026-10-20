"use client";
import { useState } from "react";
import { useJson, useMe, useSendTx } from "./hooks";
import { atoms, short, fmt } from "./ui";
import { BRAND } from "@/lib/brand";
import { explorerUrl } from "@/lib/env";

type Ask = { address: string; seller: string; price: number; remaining: number; ts: number };
type Book = { asks: Ask[]; fills: { price: number; amount: number; sig: string; ts: number }[]; slot: number };

export function OrderBook() {
  const { data, reload } = useJson<Book>("/api/orderbook");
  const { me } = useMe();
  const tx = useSendTx();
  const [price, setPrice] = useState("0.95"); const [amount, setAmount] = useState("10"); const [buyAmt, setBuyAmt] = useState<Record<string, string>>({});
  const place = async () => { await tx.send("place-ask", { price: Math.round(Number(price) * 1e6), amount: Math.round(Number(amount) * 1e6) }); reload(); };
  const fill = async (a: Ask) => { await tx.send("fill-ask", { ask: a.address, amount: Math.round(Number(buyAmt[a.address] || a.remaining / 1e6) * 1e6) }); reload(); };
  const cancel = async (a: Ask) => { await tx.send("cancel-ask", { ask: a.address }); reload(); };
  const mine = me?.wallet;
  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-6">
      <div>
        <div className="flex justify-between text-sm mb-3"><span className="font-medium">Asks</span><span className="text-fg-3 num">{data?.slot ? `slot ${data.slot.toLocaleString()}` : ""}</span></div>
        <div className="card divide-y divide-line">
          {!data?.asks?.length && <p className="p-4 text-sm text-fg-3">No asks yet. Be the first to list.</p>}
          {data?.asks?.map(a => (
            <div key={a.address} className="p-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="num text-lg w-20">${(a.price / 1e6).toFixed(2)}</span>
              <span className="num flex-1">{atoms(a.remaining)} {BRAND.creditToken} <span className="text-fg-3 text-xs">by {short(a.seller)}</span></span>
              {mine && mine === a.seller ? <button className="btn-ghost h-8 text-xs" disabled={tx.busy} onClick={() => cancel(a)}>Cancel</button> : mine ? (
                <div className="flex gap-2 items-center"><input className="input h-8 w-24 num text-xs" placeholder={String(a.remaining / 1e6)} value={buyAmt[a.address] || ""} onChange={e => setBuyAmt({ ...buyAmt, [a.address]: e.target.value })} /><button className="btn-primary h-8 text-xs" disabled={tx.busy} onClick={() => fill(a)}>Buy</button></div>
              ) : <a href="/sign-in?next=/sell" className="text-xs text-fg-3 underline">Sign in to buy</a>}
            </div>))}
        </div>
        <p className="text-xs text-fg-3 mt-2 italic">Book prices and amounts exclude the {BRAND.buyerFeeBps / 100}% buyer fee.</p>
        <p className="font-medium text-sm mt-8 mb-2">Recent fills</p>
        <div className="card divide-y divide-line text-sm">{!data?.fills?.length && <p className="p-4 text-fg-3">No fills yet.</p>}{data?.fills?.map(f => <div key={f.sig} className="p-3 px-4 flex justify-between num"><span>${(f.price / 1e6).toFixed(2)}</span><span>{atoms(f.amount)} {BRAND.creditToken}</span><a className="text-fg-3 underline" href={explorerUrl("tx", f.sig)} target="_blank">{short(f.sig)}</a></div>)}</div>
      </div>
      <div className="card p-5 h-fit">
        <p className="font-medium">Place an ask</p>
        <label className="label block mt-4">Price (USDC per {BRAND.creditToken})</label><input className="input mt-1 num" value={price} onChange={e => setPrice(e.target.value)} />
        <label className="label block mt-3">Amount ({BRAND.creditToken})</label><input className="input mt-1 num" value={amount} onChange={e => setAmount(e.target.value)} />
        <p className="text-sm text-fg-2 mt-3 flex justify-between"><span>You receive if filled</span><span className="num">{fmt(Number(price) * Number(amount))} USDC</span></p>
        {mine ? <button className="btn-primary w-full mt-4" disabled={tx.busy} onClick={place}>{tx.busy ? tx.step + "…" : "Escrow and list"}</button> : <a href="/sign-in?next=/sell" className="btn-primary w-full mt-4">Sign in to sell</a>}
        {tx.error && <p className="text-bad text-sm mt-3">{tx.error}</p>}
        {tx.sig && tx.step === "Done" && <p className="text-ok text-sm mt-3">Confirmed · <a className="underline" href={explorerUrl("tx", tx.sig)} target="_blank">tx</a></p>}
        <p className="text-xs text-fg-3 mt-4">Your {BRAND.creditToken} is held by the program until it fills or you cancel. Fills pay USDC straight to your wallet.</p>
      </div>
    </div>
  );
}
