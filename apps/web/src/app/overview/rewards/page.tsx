"use client";
import { PageTitle } from "@/components/app-shell";
import { useJson, useMe, useSendTx } from "@/components/hooks";
import { Stat, atoms, Pill } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { explorerUrl } from "@/lib/env";

type Earn = { status: string; balance: number; claimable: number; claimed: number; accumulative: number; hook_state?: { flush_interval: number; last_flush: number; next_eligible: number; flush_count: number; treasury_share_bps: number; now: number }; payouts: { flush_index: number; amount: number; claimed: boolean; claimed_sig: string | null; ts: string; watt_for_holders: number; sig: string }[] };

export default function Page() {
  const { me, refresh } = useMe();
  const addr = me?.wallet;
  const { data, reload } = useJson<Earn>(addr ? `/api/earn/${addr}` : null, [addr]);
  const tx = useSendTx();
  const claim = async (idx: number, toCredit: boolean) => { await tx.send(toCredit ? "claim-activate" : "claim", { flushIndex: idx }, "/api/claim/confirm"); reload(); refresh(); };
  const hs = data?.hook_state;
  return (
    <>
      <PageTitle title="Rewards" sub={`Hold ${BRAND.launchToken} and claim ${BRAND.creditToken} from its creator fees.`} />
      {data?.status === "not_configured" && <p className="card p-4 text-sm text-fg-2 mb-6">Holder rewards run where the {BRAND.launchToken} program is configured. This deployment isn&apos;t linked to a program yet.</p>}
      <div className="grid sm:grid-cols-4 gap-3">
        <Stat label="Claimable" value={atoms(data?.claimable ?? 0)} unit={BRAND.creditToken} />
        <Stat label="Claimed" value={atoms(data?.claimed ?? 0)} unit={BRAND.creditToken} />
        <Stat label="Total assigned" value={atoms(data?.accumulative ?? 0)} unit={BRAND.creditToken} />
        <Stat label={`${BRAND.launchToken} balance`} value={atoms(data?.balance ?? 0, 0)} />
      </div>
      {hs && <p className="text-xs text-fg-3 mt-3 num">Flushes: {hs.flush_count} · every {Math.round(hs.flush_interval / 3600)}h · next eligible {hs.last_flush ? new Date(hs.next_eligible * 1000).toLocaleString() : "now"} · treasury share {hs.treasury_share_bps / 100}%</p>}
      {tx.error && <p className="text-bad text-sm mt-4">{tx.error}</p>}
      {tx.busy && <p className="text-fg-2 text-sm mt-4">{tx.step}…</p>}
      <h2 className="font-medium mt-10 mb-3">Payouts</h2>
      <div className="card divide-y divide-line">
        {!data?.payouts?.length && <p className="p-4 text-sm text-fg-3">No payouts for this wallet yet. Hold {BRAND.launchToken} at the time of a flush to be included.</p>}
        {data?.payouts?.map(p => (
          <div key={p.flush_index} className="p-4 flex flex-wrap items-center gap-4 text-sm">
            <div className="flex-1 min-w-40"><p className="font-medium">Payout {p.flush_index} {p.claimed ? <Pill tone="ok">Claimed</Pill> : <Pill tone="volt">Claimable</Pill>}</p><p className="text-xs text-fg-3 num">{new Date(p.ts).toLocaleString()} · pool {atoms(p.watt_for_holders)} {BRAND.creditToken} · <a className="underline" href={explorerUrl("tx", p.sig)} target="_blank">flush tx</a></p></div>
            <span className="num text-lg">{atoms(p.amount)} <span className="text-fg-3 text-xs">{BRAND.creditToken}</span></span>
            {p.claimed ? (p.claimed_sig && <a className="text-xs underline text-fg-3" href={explorerUrl("tx", p.claimed_sig)} target="_blank">claim tx</a>) : (
              <div className="flex gap-2"><button className="btn-ghost h-8 text-xs" disabled={tx.busy} onClick={() => claim(p.flush_index, false)}>To wallet</button><button className="btn-primary h-8 text-xs" disabled={tx.busy} onClick={() => claim(p.flush_index, true)}>To credit</button></div>)}
          </div>))}
      </div>
    </>
  );
}
