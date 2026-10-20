import { Legal } from "@/components/legal";
import { BRAND } from "@/lib/brand";
export const metadata = { title: "Privacy" };
export default function Page() { return (<Legal title="Privacy">
<h2>What we store</h2><p>Your wallet address, hashed API keys, and per-request metadata: model id, token counts, cost and time. We never store prompts or completions.</p>
<h2>What leaves the service</h2><p>Requests are forwarded to OpenRouter and the provider serving the model. Their retention policies apply; incognito mode restricts routing to providers that deny data collection.</p>
<h2>On chain</h2><p>Purchases, activations, flushes, claims and fills are public Solana transactions tied to your wallet.</p>
<h2>Contact</h2><p>Reach us on X or Telegram, linked in the footer. {BRAND.name} does not sell personal data.</p>
</Legal>); }
