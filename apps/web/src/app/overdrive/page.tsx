import { PublicPage, PageHero } from "@/components/public-page";
import { Section, H2, Feature, Cta, Arrow } from "@/components/ui";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "Overdrive" };
export default function Page() {
  return (
    <PublicPage>
      <PageHero eyebrow="Introducing" title={<>Overdrive.<br />Fastest provider, every time.</>} sub="Append :overdrive to any model id and the gateway routes to the highest-throughput provider serving it, with automatic fallback if one stalls. Same price, no markup.">
        <Cta href="/overview/api-keys">Get a key</Cta><Cta href="/docs/overdrive" ghost>Docs <Arrow /></Cta>
      </PageHero>
      <Section>
        <H2>Works with every client.</H2>
        <pre className="card p-4 num text-[13px] leading-6 overflow-x-auto max-w-2xl"><code>{`# Any OpenAI- or Anthropic-compatible client
model = "openai/gpt-5:overdrive"

# Or a header, if your client can't change the model id
x-gw-overdrive: 1`}</code></pre>
        <div className="grid sm:grid-cols-3 gap-3 mt-8">
          <Feature title="Throughput first" text="Providers are sorted by measured tokens per second for that model instead of price." />
          <Feature title="Fallbacks on" text="If the fastest provider errors or rate-limits, the request moves to the next one without you retrying." />
          <Feature title="Honest billing" text={`You pay the price of the provider that actually served you, plus OpenRouter's 5%. ${BRAND.name} adds nothing.`} />
        </div>
      </Section>
    </PublicPage>
  );
}
