import Link from "next/link";
import { PublicPage, PageHero } from "@/components/public-page";
import { Section, H2, Feature, Cta, Arrow, Stat, atoms, short } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { readChainStats, readFlushes } from "@/lib/chain";
import { explorerUrl } from "@/lib/env";
import { db } from "@/lib/db";
import { LookupEarn } from "@/components/lookup-earn";

export const metadata = { title: "Rewards" };
export const revalidate = 60;

export default async function Page() {
  const [c, chainFlushes, dbFlushes] = await Promise.all([readChainStats().catch(() => null), readFlushes(48).catch(() => []), db().listFlushes(48)]);
  const sigByIndex = new Map(dbFlushes.map(f => [f.index, f.sig]));
  return (
    <PublicPage>
      <PageHero eyebrow="Network" title={<>Hold {BRAND.launchToken}.<br />Claim {BRAND.creditToken}.</>} sub={`${BRAND.launchToken} is the launch token. Its pump.fun creator fees are flushed into ${BRAND.creditToken} for every holder, by balance. Claim to your wallet or straight into credit.`}>
        <Cta href="/overview/rewards">Claim on your dashboard</Cta>
        <Cta href="/docs/rewards" ghost>How rewards work <Arrow /></Cta>
      </PageHero>
      <Section>
        {c ? (
          <div className="grid sm:grid-cols-4 gap-3">
            <Stat label="To holders so far" value={atoms(c.totalRewards)} unit={BRAND.creditToken} />
            <Stat label="Claimed" value={atoms(c.totalClaimed)} unit={BRAND.creditToken} />
            <Stat label="Flushes" value={c.flushCount} hint={`every ${Math.round(c.flushInterval / 3600)}h, min ${atoms(c.minFlushUsdc)} USDC`} />
            <Stat label="Treasury share" value={`${c.treasuryShareBps / 100}%`} hint="of each flush" />
          </div>
        ) : <p className="card p-5 text-sm text-fg-2">Holder rewards run where the {BRAND.launchToken} token and program are configured. This deployment isn&apos;t linked to a program yet, so there is nothing to claim here.</p>}
        <div className="mt-8"><LookupEarn /></div>
      </Section>
      <Section className="border-t border-line">
        <H2 sub="Each flush is a transaction on chain. The explorer holds the whole record.">Payouts</H2>
        <div className="card overflow-x-auto"><table className="w-full text-sm"><thead><tr className="label text-left"><th className="p-3 font-normal">#</th><th className="p-3 font-normal">When</th><th className="p-3 font-normal text-right">SOL collected</th><th className="p-3 font-normal text-right">USDC received</th><th className="p-3 font-normal text-right">Treasury</th><th className="p-3 font-normal text-right">To holders</th><th className="p-3 font-normal text-right">Holders</th><th className="p-3 font-normal">Tx</th></tr></thead>
          <tbody className="num">{chainFlushes.map(f => <tr key={f.index} className="border-t border-line"><td className="p-3">{f.index}</td><td className="p-3 text-fg-2 font-sans">{new Date(f.ts * 1000).toLocaleString()}</td><td className="p-3 text-right">{(f.solCollected / 1e9).toFixed(4)}</td><td className="p-3 text-right">{atoms(f.usdcReceived)}</td><td className="p-3 text-right">{atoms(f.usdcToTreasury)}</td><td className="p-3 text-right text-volt">{atoms(f.wattForHolders)} {BRAND.creditToken}</td><td className="p-3 text-right">{f.holderCount}</td><td className="p-3">{sigByIndex.get(f.index) ? <a className="underline text-fg-3" href={explorerUrl("tx", sigByIndex.get(f.index)!)} target="_blank">{short(sigByIndex.get(f.index)!)}</a> : <a className="underline text-fg-3" href={explorerUrl("address", f.address)} target="_blank">account</a>}</td></tr>)}
          {!chainFlushes.length && <tr><td className="p-4 text-fg-3 font-sans" colSpan={8}>No flushes yet.</td></tr>}</tbody></table></div>
      </Section>
      <Section className="border-t border-line">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Feature title="Hold to qualify" text={`Hold any ${BRAND.launchToken} balance at flush time. No staking, no lockups, no minimum.`} />
          <Feature title="Funded flushes" text={`The keeper claims creator fees once the interval has passed and they reach the minimum, swaps them to USDC and mints ${BRAND.creditToken} into the vault.`} />
          <Feature title="Claim either way" text="To your wallet as transferable tokens, or activated as service credit in one transaction." />
          <Feature title="Nothing expires" text="Unclaimed rewards wait in the vault, tied to your wallet by the flush's Merkle root." />
        </div>
        <p className="text-sm text-fg-2 mt-8">Contracts and mints are listed on <Link className="text-volt" href="/stats">Stats</Link>. For scripts, <code className="num text-volt-2">GET /api/earn/&lt;address&gt;</code> returns a wallet&apos;s claimable, claimed, balance and payouts.</p>
      </Section>
    </PublicPage>
  );
}
