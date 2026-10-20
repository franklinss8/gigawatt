import { PublicPage, PageHero } from "@/components/public-page";
import { Section, H2, Stat, atoms, fmt } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { siteStats } from "@/lib/stats";
import { env, explorerUrl } from "@/lib/env";

export const metadata = { title: "Stats" };
export const revalidate = 60;
export default async function Page() {
  const s = await siteStats(); const c = s.chain;
  const contracts: [string, string][] = [["Program", env.programId], [`${BRAND.launchToken} mint`, env.gwattMint], [`${BRAND.creditToken} mint`, env.wattMint], ["USDC mint", env.usdcMint], ["Funding wallet", c?.fundingWallet || ""], ["Treasury", c?.treasury || ""], ["Keeper", c?.keeper || ""]];
  return (
    <PublicPage>
      <PageHero eyebrow="Network" title="Stats" sub={`Supply, backing, rewards and usage, read live from ${env.cluster} and the gateway.`} />
      <Section>
        <H2>Tokens</H2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label={`${BRAND.creditToken} supply`} value={c ? atoms(c.wattSupply) : "–"} />
          <Stat label="Funding wallet USDC" value={c ? atoms(c.fundingUsdc) : "–"} hint="Backs the supply 1:1" />
          <Stat label="Minted / burned" value={c ? `${atoms(c.totalMinted, 0)} / ${atoms(c.totalBurned, 0)}` : "–"} />
          <Stat label="In rewards vault" value={c ? atoms(c.vaultWatt) : "–"} unit={BRAND.creditToken} />
        </div>
        <H2 >Rewards</H2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="To holders so far" value={c ? atoms(c.totalRewards) : atoms(s.rewards_watt)} unit={BRAND.creditToken} />
          <Stat label="Claimed" value={c ? atoms(c.totalClaimed) : atoms(s.claimed_watt)} unit={BRAND.creditToken} />
          <Stat label="Flushes" value={c ? c.flushCount : s.flushes} />
          <Stat label="Last flush" value={c?.lastFlushTs ? new Date(c.lastFlushTs * 1000).toLocaleDateString() : "–"} />
        </div>
        <H2>Usage</H2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="Models served" value={s.models} />
          <Stat label="Accounts" value={s.accounts} />
          <Stat label="Requests" value={s.requests.toLocaleString()} />
          <Stat label="Credit spent" value={`$${fmt(s.spend_usd)}`} hint={`$${fmt(s.activated_usd)} activated`} />
        </div>
      </Section>
      <Section className="border-t border-line">
        <H2 sub="Every address this deployment relies on.">Contracts</H2>
        <div className="card divide-y divide-line text-sm">{contracts.map(([k, v]) => <div key={k} className="p-4 grid sm:grid-cols-[180px_1fr] gap-1"><span className="text-fg-3">{k}</span>{v ? <a className="num break-all underline" href={explorerUrl("address", v)} target="_blank">{v}</a> : <span className="text-fg-3">not configured</span>}</div>)}</div>
        <p className="text-xs text-fg-3 mt-3 num">Fees: purchase {(c?.purchaseFeeBps ?? BRAND.purchaseFeeBps) / 100}% · activation {(c?.activationFeeBps ?? BRAND.activationFeeBps) / 100}% · buyer {(c?.buyerFeeBps ?? BRAND.buyerFeeBps) / 100}% · treasury share of flushes {(c?.treasuryShareBps ?? 0) / 100}%{c && ` · slot ${c.slot.toLocaleString()}`}</p>
      </Section>
    </PublicPage>
  );
}
