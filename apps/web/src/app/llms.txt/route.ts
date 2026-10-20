import { DOCS } from "@/content/docs";
import { BRAND } from "@/lib/brand";
export const dynamic = "force-static";
export function GET() {
  const body = [`# ${BRAND.name}`, ``, `> ${BRAND.tagline} Holders of ${BRAND.launchToken} claim ${BRAND.creditToken} from its pump.fun creator fees; ${BRAND.creditToken} activates into credit that pays for any model through one ${BRAND.keyPrefix} key.`, ``,
    `Base URL: https://${BRAND.domain}. Auth: Authorization: Bearer ${BRAND.keyPrefix}<key>. OpenAI-compatible POST /v1/chat/completions, Anthropic-compatible POST /v1/messages, GET /v1/models, MCP at POST /api/mcp (tools: credit, models, run). Model ids are lab/name; append :overdrive for fastest routing; header x-gw-incognito: 1 for zero-retention routing.`, ``,
    ...DOCS.map(d => `## ${d.title}\n${d.body.trim()}\n`)].join("\n");
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
