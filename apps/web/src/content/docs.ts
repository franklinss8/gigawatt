import { BRAND } from "@/lib/brand";
const N = BRAND.name, L = BRAND.launchToken, W = BRAND.creditToken, D = BRAND.domain, K = BRAND.keyPrefix;

export type Doc = { slug: string; title: string; group: string; summary: string; body: string };

export const DOC_GROUPS = ["Get started", "Coding tools", "Concepts", "Dashboard", "Reference"];

export const DOCS: Doc[] = [
  { slug: "quickstart", group: "Get started", title: "Quickstart", summary: `Get a key, add credit, make a call.`, body: `
Three steps from zero to a model answer.

## 1. Sign in and create a key
Open [the app](/overview), connect Phantom or Solflare and sign the message. Under **API keys**, create a key. It starts with \`${K}\` and is shown once.

## 2. Add credit
Credit is dollars on your account, spent per request. Get it two ways:
- **Buy ${W}** with USDC on **Money**, then **Activate** it. Activation burns the tokens and credits your account, minus the ${BRAND.activationFeeBps / 100}% activation fee.
- **Hold ${L}** and claim rewards on **Rewards** straight into credit.

## 3. Call a model
\`\`\`bash
curl https://${D}/v1/chat/completions \\
  -H "Authorization: Bearer ${K}…" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"anthropic/claude-sonnet-4.5","messages":[{"role":"user","content":"Say hi"}]}'
\`\`\`
The same key works on the Anthropic-compatible \`/v1/messages\` endpoint and on the [MCP server](/docs/mcp). See [Coding tools](/docs/coding-tools) to plug it into Claude Code, Codex or Cursor.
` },
  { slug: "models", group: "Get started", title: "Choose a model", summary: "Ids, prices and how to pick.", body: `
Every model has an id of the form \`lab/name\`, for example \`anthropic/claude-sonnet-4.5\` or \`openai/gpt-5\`. Pass it as \`model\`. The full list, with prices per million tokens, is on [Models](/models) and from \`GET /v1/models\`.

## Suffixes
- \`:overdrive\` routes to the fastest provider. See [Overdrive](/docs/overdrive).

## Picking
- Coding agents: a frontier model for planning (Claude Sonnet, GPT-5), a cheap fast one for edits (Haiku, Gemini Flash, Qwen3 Coder).
- Long documents: check the context column on [Models](/models).
- Cost: price is OpenRouter's list price plus its 5% platform fee. ${N} adds no markup. Your [Usage](/overview/usage) page shows the real cost of each request.
` },
  { slug: "what-you-can-do", group: "Get started", title: "What your key can do", summary: "Endpoints and clients the key works with.", body: `
One \`${K}\` key gives you:
- **\`POST /v1/chat/completions\`** — OpenAI-compatible, streaming included.
- **\`POST /v1/messages\`** — Anthropic-compatible, so Claude Code works by setting \`ANTHROPIC_BASE_URL\`.
- **\`GET /v1/models\`** — the catalog.
- **\`POST /api/mcp\`** — an MCP server with \`credit\`, \`models\` and \`run\` tools.

A key cannot move tokens or credit. It only spends credit on requests. Revoke it any time on [API keys](/overview/api-keys).
` },
  { slug: "incognito", group: "Get started", title: "Incognito", summary: "Zero-retention routing and a nameless log.", body: `
${N} never stores prompts or completions; the gateway keeps tokens and cost for metering and nothing else.

Send the header \`x-gw-incognito: 1\` and two more things happen:
1. The upstream provider policy is set to **deny data collection**, so only providers that don't retain or train on requests may serve it.
2. Your Activity log records the request as \`incognito\` with its cost, without the model name.

Some models are only served by providers that retain data; incognito requests to those fail with a routing error. Pick another model.
` },
  { slug: "overdrive", group: "Get started", title: "Overdrive", summary: "Route to the fastest provider with fallbacks.", body: `
Append \`:overdrive\` to any model id, or send \`x-gw-overdrive: 1\`.

The gateway then sorts eligible providers by measured throughput instead of price and enables automatic fallback: if the first provider errors or rate-limits, the request is retried on the next one.

You pay the price of the provider that actually served the request, plus OpenRouter's 5%. That can be higher than the cheapest provider's price; Usage shows what you paid.
` },
  { slug: "coding-tools", group: "Coding tools", title: "Coding tools", summary: "Claude Code, Codex, Cursor and the rest.", body: `
Any tool that lets you set a base URL and key works. The common ones:

| Tool | Setting |
|---|---|
| Claude Code | \`ANTHROPIC_BASE_URL=https://${D}\`, \`ANTHROPIC_AUTH_TOKEN=${K}…\` |
| Codex CLI | \`OPENAI_BASE_URL=https://${D}/v1\`, \`OPENAI_API_KEY=${K}…\` |
| Cursor | Settings → Models → OpenAI API key, base URL \`https://${D}/v1\` |
| OpenCode, Cline, Zed, Kilo Code, Continue, Goose, Crush | Add an OpenAI-compatible provider with the same base URL and key |

Detailed pages: [Claude Code](/docs/claude-code), [Codex](/docs/codex), [Cursor](/docs/cursor), [MCP server](/docs/mcp).
` },
  { slug: "claude-code", group: "Coding tools", title: "Claude Code", summary: "Point Claude Code at the gateway.", body: `
\`\`\`bash
export ANTHROPIC_BASE_URL=https://${D}
export ANTHROPIC_AUTH_TOKEN=${K}…
claude
\`\`\`
Claude Code talks to \`/v1/messages\`, which the gateway serves in Anthropic's format. To use a non-Anthropic model, set \`ANTHROPIC_MODEL\` to any catalog id, e.g. \`ANTHROPIC_MODEL=openai/gpt-5\`.

Add the MCP server so Claude can check your credit and pick models:
\`\`\`bash
claude mcp add --transport http ${N.toLowerCase()} https://${D}/api/mcp --header "Authorization: Bearer ${K}…"
\`\`\`
` },
  { slug: "codex", group: "Coding tools", title: "Codex", summary: "Codex CLI with an OpenAI-compatible base URL.", body: `
\`\`\`bash
export OPENAI_BASE_URL=https://${D}/v1
export OPENAI_API_KEY=${K}…
codex --model openai/gpt-5
\`\`\`
Streaming responses and tool calls go through unchanged. Every request appears on [Usage](/overview/usage).
` },
  { slug: "cursor", group: "Coding tools", title: "Cursor", summary: "Use the gateway from Cursor.", body: `
In **Settings → Models**, turn on *Override OpenAI Base URL* and set it to \`https://${D}/v1\`. Paste your \`${K}\` key as the OpenAI API key and add the model ids you want to use (for example \`anthropic/claude-sonnet-4.5\`). Cursor's own models keep using Cursor's billing; only the custom ids go through ${N}.
` },
  { slug: "mcp", group: "Coding tools", title: "MCP server", summary: "The Streamable HTTP MCP server and its tools.", body: `
Endpoint: \`https://${D}/api/mcp\` (Streamable HTTP, JSON responses). Authenticate with \`Authorization: Bearer ${K}…\`.

## Tools
| Tool | Input | Returns |
|---|---|---|
| \`credit\` | – | credit in USD and the last 20 requests |
| \`models\` | \`query?\`, \`limit?\` | matching models with prices per million tokens |
| \`run\` | \`model\`, \`prompt\`, \`system?\`, \`max_tokens?\` | the model's text; costs credit |

## Client config
\`\`\`json
{ "mcpServers": { "${N.toLowerCase()}": { "type": "http", "url": "https://${D}/api/mcp", "headers": { "Authorization": "Bearer ${K}…" } } } }
\`\`\`
` },
  { slug: "credit", group: "Concepts", title: "Credit and activation", summary: "What credit is and how activation makes it.", body: `
Credit is a dollar balance on your account. Each request draws its cost from it. Credit is not a token: it cannot be transferred or turned back into ${W}.

**Activation** is the only way credit is created. You send an \`activate\` transaction that burns ${W}; the ${BRAND.activationFeeBps / 100}% activation fee goes to the treasury as ${W}, the rest is burned, and the gateway credits your account with the burned amount in dollars once it has verified the transaction on chain.

Claiming rewards *as credit* does both steps in one transaction (\`claim_and_activate\`).
` },
  { slug: "free-credit", group: "Concepts", title: "Free credit", summary: "How holders get credit without buying.", body: `
Holding ${L} is the free path to credit: every flush assigns ${W} to each holder in proportion to their balance, and **Claim as credit** activates it in one transaction. There is no faucet and no signup bonus; the rewards program is the free credit.
` },
  { slug: "pricing", group: "Concepts", title: "Pricing and metering", summary: "What a request costs and how it's measured.", body: `
\`cost = (input_tokens × input_price + output_tokens × output_price) × 1.05\`

Prices are OpenRouter's list prices for the model (or the provider that served it under Overdrive). The 1.05 is OpenRouter's platform fee. ${N} adds no markup.

Token counts come from the upstream response's \`usage\` field, for both streamed and non-streamed requests. Requests with zero credit are rejected with HTTP 402 before reaching a provider. A request that overruns your last cents still completes; your balance floors at zero.
` },
  { slug: "inference", group: "Concepts", title: W, summary: `The USDC-backed credit token.`, body: `
${W} is an SPL token on Solana with 6 decimals. Its mint authority is the ${N} program, which only mints in two cases:
- **Sale**: a buyer sends USDC; ${BRAND.purchaseFeeBps / 100}% goes to the treasury, the rest to the funding wallet, and the same number of ${W} is minted to the buyer.
- **Flush**: the keeper deposits USDC from creator fees into the funding wallet and the same amount of ${W} is minted into the rewards vault for holders.

So the funding wallet's USDC always equals the ${W} ever minted, minus what was burned by activation. [Stats](/stats) shows both at the same slot.

${W} is a normal token: send it, hold it, [sell it on the book](/sell), or [activate it](/docs/credit).
` },
  { slug: "selling", group: "Concepts", title: "Selling", summary: "Turn rewards into USDC.", body: `
Holders who won't spend their ${W} can list it on the [order book](/sell). Place an ask with a price in USDC per ${W} and an amount; the program escrows your tokens. When a buyer fills it, the USDC goes straight to your wallet. Cancel any time to get unfilled tokens back.

The book is on chain and permissionless: anyone can read it from the program's \`Ask\` accounts.
` },
  { slug: "order-book", group: "Concepts", title: "Order book", summary: "Asks only, cheapest first, buyer fee.", body: `
- The book holds **asks** only (sell orders). Buyers fill them.
- Asks sort by price, then by time.
- The buyer pays \`price × amount\` USDC to the seller plus a **${BRAND.buyerFeeBps / 100}% buyer fee** to the treasury, and receives ${W} from escrow.
- Partial fills are allowed; an ask stays listed with its remaining amount.
- Book prices and amounts exclude the buyer fee.
` },
  { slug: "rewards", group: "Concepts", title: "Holder rewards", summary: `Hold ${L} and claim ${W} from its creator fees.`, body: `
${L} is the launch token, created on pump.fun. Trades on pump.fun and PumpSwap pay a creator fee to the token's creator wallet. ${N}'s keeper owns that wallet and turns the fees into ${W} for holders.

## The program
| Rule | Detail |
|---|---|
| Who receives | Every wallet holding ${L} at flush time, except excluded system addresses (the bonding curve, the pool, the keeper, the treasury) |
| What you receive | The ${W} the flush mints for holders |
| When | Each time the keeper flushes: once the interval has passed and the fees reach the minimum |
| Your share | \`watt_for_holders × your_balance / counted_supply\`, rounded down |
| Delivery | Claim to your wallet, or activate as credit in one transaction |

Nothing needs staking or locking, and there is no minimum.

## How a flush works
1. The keeper collects the creator fees (SOL) and swaps them to USDC.
2. It sends the treasury share to the treasury and the rest to the funding wallet.
3. It snapshots every ${L} holder, builds a Merkle tree of \`(wallet, amount)\` and calls \`flush\`, which mints the holders' ${W} into the vault and records the root, the amounts and the slot.
4. Your proof is published to the site; **Rewards** shows your payouts and lets you claim.

## Check the numbers
Every flush and claim is a transaction. Open the program on [Stats](/stats); each \`Flush\` account holds the amounts and the root, and each \`ClaimStatus\` account proves a claim. For scripts, \`GET /api/earn/<address>\` returns \`claimable\`, \`claimed\`, \`accumulative\`, \`balance\`, \`hook_state\` and the wallet's payouts.
` },
  { slug: "stats", group: "Concepts", title: "Stats", summary: "What the Stats page reads and from where.", body: `
Token numbers (supply, funding USDC, vault balance) are read from Solana at one slot. Rewards numbers come from the program's config account. Usage numbers (accounts, requests, spend) come from the gateway's database. Contract addresses are listed at the bottom; every one links to the explorer.
` },
  { slug: "glossary", group: "Concepts", title: "Glossary", summary: "Terms used across the site.", body: `
- **${L}** — the launch token on pump.fun. Holding it earns rewards.
- **${W}** — the USDC-backed credit token. Buy it, earn it, sell it or activate it.
- **Activation** — burning ${W} for dollar credit.
- **Credit** — the dollar balance a key spends.
- **Flush** — one payout: fees collected, swapped, and minted as ${W} for holders.
- **Funding wallet** — holds the USDC that backs ${W}.
- **Treasury** — receives fees.
- **Keeper** — the service that runs flushes.
- **Ask** — a sell order on the book.
` },
  { slug: "dashboard", group: "Dashboard", title: "Dashboard", summary: "What each page of the app does.", body: `
- **Home** — credit, ${L} balance, claimable ${W}, recent activity.
- **Activity** — the ledger (activations, claims, spend) and every request.
- **Usage** — daily spend and totals by model.
- **API keys** — create and revoke keys. Keys are hashed; a lost key can only be revoked.
- **Models** — the catalog with search.
- **Rewards** — your payouts, with *To wallet* and *To credit* buttons.
- **Money** — buy and activate ${W}.
- **Settings** — your wallet, the cluster and the addresses this deployment uses.

Keys and security: sessions are a signed cookie tied to your wallet, valid 30 days. Signing in never sends a transaction.
` },
  { slug: "api-reference", group: "Reference", title: "API reference", summary: "Every endpoint.", body: `
Base URL: \`https://${D}\`. Auth for \`/v1/*\` and \`/api/mcp\`: \`Authorization: Bearer ${K}…\`.

## Models
| Method | Path | Notes |
|---|---|---|
| POST | \`/v1/chat/completions\` | OpenAI format. \`stream: true\` supported. Headers \`x-gw-overdrive\`, \`x-gw-incognito\`. |
| POST | \`/v1/messages\` | Anthropic format. |
| POST | \`/v1/completions\` | Legacy completions. |
| GET | \`/v1/models\` | Catalog. |
| POST | \`/api/mcp\` | MCP, Streamable HTTP. |

Errors: 401 bad key, 402 no credit, 503 gateway not configured, upstream errors pass through with their status.

## Public
| GET | \`/api/earn/<address>\` | Rewards state for a wallet |
|---|---|---|
| GET | \`/api/stats\` | Site and chain stats |
| GET | \`/api/orderbook\` | Asks and recent fills |
| GET | \`/api/flushes\` | Last 48 flushes |
| GET | \`/api/models\` | Catalog with lab and prices per million |

## Account (cookie session)
\`/api/me\`, \`/api/keys\` (GET/POST/DELETE), \`/api/usage\`, \`/api/activity\`, \`/api/tx/<kind>\` (builds an unsigned transaction: buy, activate, claim, claim-activate, place-ask, cancel-ask, fill-ask), \`/api/activate/confirm\`, \`/api/claim/confirm\`.
` },
  { slug: "docs-for-agents", group: "Reference", title: "Docs for agents", summary: "A single file an agent can read.", body: `
Everything an agent needs is at [\`/llms.txt\`](/llms.txt): endpoints, headers, model id format and the MCP tools. Point your agent at it, or add the [MCP server](/docs/mcp) and let it discover the tools itself.
` },
];

export const docBySlug = (slug: string) => DOCS.find(d => d.slug === slug);
export const docsByGroup = () => DOC_GROUPS.map(g => ({ group: g, docs: DOCS.filter(d => d.group === g) }));
