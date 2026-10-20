import { PublicPage, PageHero } from "@/components/public-page";
import { Section, H2, Feature, Cta, Arrow } from "@/components/ui";
import { BRAND } from "@/lib/brand";

export const metadata = { title: "MCP" };
export default function Page() {
  const cfg = `{
  "mcpServers": {
    "${BRAND.name.toLowerCase()}": {
      "type": "http",
      "url": "https://${BRAND.domain}/api/mcp",
      "headers": { "Authorization": "Bearer ${BRAND.keyPrefix}…" }
    }
  }
}`;
  return (
    <PublicPage>
      <PageHero eyebrow="Product" title={<>Agents over MCP.</>} sub="Your coding agent checks credit, picks models and runs them, through one MCP server that any client can connect to.">
        <Cta href="/overview/api-keys">Get a key</Cta><Cta href="/docs/mcp" ghost>Server docs <Arrow /></Cta>
      </PageHero>
      <Section>
        <div className="grid lg:grid-cols-2 gap-10 items-start">
          <div>
            <H2 sub="Streamable HTTP, Bearer auth with your key. Add it to Claude Code, Cursor, Codex or anything that speaks MCP.">One endpoint.</H2>
            <pre className="card p-4 num text-[13px] leading-6 overflow-x-auto"><code>{cfg}</code></pre>
            <p className="text-sm text-fg-2 mt-3">Claude Code: <code className="num text-volt-2">claude mcp add --transport http {BRAND.name.toLowerCase()} https://{BRAND.domain}/api/mcp --header &quot;Authorization: Bearer {BRAND.keyPrefix}…&quot;</code></p>
          </div>
          <div className="grid gap-3">
            <Feature title="credit" text="Returns your credit in USD and your last requests, so the agent knows what it can afford." />
            <Feature title="models" text="Searches the catalog by lab or name and returns ids, context and prices per million tokens." />
            <Feature title="run" text="Runs a prompt on any model and returns the text. Billed per request like the API." />
          </div>
        </div>
      </Section>
    </PublicPage>
  );
}
