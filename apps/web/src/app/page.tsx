import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { Section, H2, Feature, Arrow, Cta, atoms, fmt } from "@/components/ui";
import { BRAND, LABS } from "@/lib/brand";
import { siteStats } from "@/lib/stats";
import { OrderBookPreview } from "@/components/orderbook-preview";

export const revalidate = 60;

export default async function Home() {
  const s = await siteStats();
  const toHolders = s.chain ? atoms(s.chain.totalRewards) : fmt(s.rewards_watt / 1e6);
  return (
    <>
      <SiteNav />
      <main className="flex-1">
        {/* Hero */}
        <div className="relative overflow-hidden">
          <div className="grid-bg absolute inset-0 -z-10" />
          <div className="mx-auto max-w-6xl px-4 pt-24 pb-16 grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-[1.02]">Hold the token.<br />Own the compute.</h1>
              <p className="text-fg-2 text-lg mt-6 max-w-md">Holders claim {BRAND.creditToken} from {BRAND.launchToken} trading fees. Spend it on any model or sell it.</p>
              <div className="mt-8 flex gap-3">
                <Cta href="/overview">Open app</Cta>
                <Cta href="/overdrive" ghost>Introducing Overdrive <Arrow /></Cta>
              </div>
            </div>
            <DashboardMock />
          </div>
        </div>

        {/* Labs marquee */}
        <div className="border-y border-line py-6 overflow-hidden">
          <p className="label text-center mb-4">Models from every major lab</p>
          <div className="flex whitespace-nowrap marquee w-max">
            {[...LABS, ...LABS].map((l, i) => <span key={i} className="px-7 text-fg-2 text-sm">{l}</span>)}
          </div>
        </div>

        {/* Order book + routes */}
        <Section>
          <H2 sub={`Holders sell the ${BRAND.creditToken} they won't spend. Builders buy it to run models, cheapest ask first.`}>A market for compute.</H2>
          <div className="grid lg:grid-cols-[1fr_320px] gap-6">
            <OrderBookPreview />
            <div className="space-y-3">
              {[["/rewards", "Hold and claim", "Hold the token and claim your share of trading fees."], ["/sell", "Sell on the book", "Set a price and let builders buy it."], ["/models", "Spend on any model", "Run Claude, GPT, Gemini and the rest."]].map(([h, t, d]) => (
                <Link key={h} href={h} className="card p-5 block hover:border-line-2">
                  <p className="num text-xs text-fg-3">{h}</p>
                  <p className="font-medium mt-1">{t}</p>
                  <p className="text-sm text-fg-2 mt-1">{d}</p>
                </Link>
              ))}
            </div>
          </div>
        </Section>

        {/* Rewards */}
        <Section className="border-t border-line">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div>
              <H2 sub={`Trading fees on ${BRAND.launchToken} fund holder rewards. Claim your share after each flush.`}>Trading fees become compute.</H2>
              <Cta href="/docs/rewards" ghost>How rewards work <Arrow /></Cta>
              <div className="grid sm:grid-cols-2 gap-3 mt-10">
                <Feature title="Hold to qualify" text={`Hold any ${BRAND.launchToken} balance. No staking, no lockups, no minimum.`} />
                <Feature title="Funded flushes" text={`Each flush turns the creator fees into ${BRAND.creditToken} for holders, by balance.`} />
                <Feature title="Claim either way" text={`Take ${BRAND.creditToken} to your wallet, or straight into credit.`} />
                <Feature title="Nothing expires" text={`Unclaimed ${BRAND.creditToken} waits in the vault until you claim it.`} />
              </div>
            </div>
            <PayoutMock />
          </div>
        </Section>

        {/* One key */}
        <Section className="border-t border-line">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div>
              <H2 sub={`Turn ${BRAND.creditToken} into credit and run any model from Claude Code, Codex or Cursor. One ${BRAND.keyPrefix} key does it all.`}>One key. Every model.</H2>
              <Cta href="/docs/quickstart" ghost>Read the quickstart <Arrow /></Cta>
              <div className="grid sm:grid-cols-2 gap-3 mt-10">
                <Feature title="Agents over MCP" text="Your coding agent checks credit, picks models and runs them." />
                <Feature title="Every lab" text="Anthropic, OpenAI, Google, xAI, DeepSeek and the rest." />
                <Feature title="Pay per request" text={`OpenRouter's price plus OpenRouter's 5% platform fee. ${BRAND.name} adds no markup.`} />
                <Feature title="Usage in one place" text="See each request's model, tokens and cost on your dashboard." />
              </div>
            </div>
            <div className="card p-5 glow">
              <div className="flex items-center justify-between"><p className="font-medium">Claude Code</p><span className="text-xs text-ok">● Connected</span></div>
              <pre className="num text-[13px] leading-6 mt-4 text-fg-2 overflow-x-auto"><code>{`export ANTHROPIC_BASE_URL=https://${BRAND.domain}\nexport ANTHROPIC_AUTH_TOKEN=${BRAND.keyPrefix}••••7Q2\n$ claude`}</code></pre>
            </div>
          </div>
        </Section>

        {/* Totals */}
        <Section className="border-t border-line text-center">
          <p className="text-fg-2">Trading fees from {BRAND.launchToken} fund {BRAND.creditToken} for its holders.</p>
          <p className="num text-5xl md:text-6xl mt-4">{toHolders} <span className="text-2xl text-fg-3">{BRAND.creditToken}</span></p>
          <p className="label mt-2">To holders so far</p>
          <p className="text-fg-2 mt-12">{BRAND.name} serves <b className="text-fg">{s.models}</b> models and counting.</p>
          <div className="mt-4"><Cta href="/models" ghost>Browse models <Arrow /></Cta></div>
        </Section>
      </main>
      <SiteFooter />
    </>
  );
}

function DashboardMock() {
  const rows = [["Claimed", "Payout 7", "+12.40", "ok"], ["Spent", "Claude Haiku", "−3.18", ""], ["Activated", "To credit", "−50.00", ""], ["Claimed", "Payout 6", "+11.85", "ok"]];
  return (
    <div className="card glow overflow-hidden">
      <div className="flex">
        <aside className="hidden sm:block w-36 border-r border-line p-3 text-sm">
          <p className="font-medium px-2 mb-2">{BRAND.name}</p>
          {["Home", "Activity", "Usage", "API keys", "Models"].map((i, k) => <p key={i} className={`px-2 py-1.5 rounded ${k === 0 ? "bg-bg-2 text-fg" : "text-fg-3"}`}>{i}</p>)}
        </aside>
        <div className="flex-1 p-5">
          <p className="label">{BRAND.creditToken}</p>
          <p className="num text-3xl mt-1">1,284.50 <span className="text-ok text-base">+12.40</span></p>
          <ul className="mt-5 divide-y divide-line text-sm">
            {rows.map(([a, b, c, t]) => <li key={a + b} className="flex justify-between py-2"><span>{a} <span className="text-fg-3">{b}</span></span><span className={`num ${t === "ok" ? "text-ok" : "text-fg-2"}`}>{c}</span></li>)}
          </ul>
        </div>
      </div>
    </div>
  );
}
function PayoutMock() {
  return (
    <div className="card p-5">
      <div className="flex justify-between text-sm"><span className="font-medium">Payouts</span><span className="text-fg-3">Each flush</span></div>
      <div className="mt-6 flex items-end justify-between"><div><p className="label">Claimable · Payout 7</p><p className="num text-4xl mt-1">12.40 <span className="text-base text-fg-3">{BRAND.creditToken}</span></p></div></div>
      <div className="mt-5 flex gap-2"><span className="btn-primary flex-1">To wallet</span><span className="btn-ghost flex-1">To credit</span></div>
    </div>
  );
}
