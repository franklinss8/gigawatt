import { PublicPage, PageHero } from "@/components/public-page";
import { Section, H2, Feature, Cta, Arrow } from "@/components/ui";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Incognito" };
export default function Page() {
  return (
    <PublicPage>
      <PageHero eyebrow="Product" title={<>Incognito.<br />Nothing to remember.</>} sub={`${BRAND.name} never stores prompts or completions. Incognito goes further: requests only route to providers that don't retain data, and your usage log keeps the cost but drops the model name.`}>
        <Cta href="/docs/incognito">How to enable it <Arrow /></Cta>
      </PageHero>
      <Section>
        <H2>One header.</H2>
        <pre className="card p-4 num text-[13px] leading-6 overflow-x-auto max-w-2xl"><code>{`curl https://${BRAND.domain}/v1/chat/completions \\
  -H "Authorization: Bearer ${BRAND.keyPrefix}…" \\
  -H "x-gw-incognito: 1" \\
  -d '{"model":"anthropic/claude-sonnet-4.5","messages":[{"role":"user","content":"hi"}]}'`}</code></pre>
        <div className="grid sm:grid-cols-3 gap-3 mt-8">
          <Feature title="No prompt storage" text="The gateway proxies the request and keeps only tokens and cost for metering. Always, not just in incognito." />
          <Feature title="Zero-retention providers" text="Incognito sets the upstream provider policy to deny data collection, so only providers that don't train on or retain requests are eligible." />
          <Feature title="Nameless log" text='Your Activity page records the request as "incognito" with its cost, and nothing else.' />
        </div>
      </Section>
    </PublicPage>
  );
}
