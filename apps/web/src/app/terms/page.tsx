import { Legal } from "@/components/legal";
import { BRAND } from "@/lib/brand";
export const metadata = { title: "Terms" };
export default function Page() { return (<Legal title="Terms of service">
<h2>The service</h2><p>{BRAND.name} provides a gateway to third-party AI models, paid with account credit, and an on-chain program that mints {BRAND.creditToken}, distributes holder rewards and runs an order book. You use it at your own risk.</p>
<h2>Tokens</h2><p>{BRAND.launchToken} is a memecoin launched on pump.fun with no promise of value. {BRAND.creditToken} is a utility token redeemable only for service credit through activation; activation is irreversible. Nothing here is investment advice or an offer of securities.</p>
<h2>Credit</h2><p>Credit is not money, cannot be withdrawn, transferred or refunded, and is consumed at the published metering rules. We may suspend keys that abuse the service or violate the acceptable use policy.</p>
<h2>Availability</h2><p>The service depends on Solana, pump.fun, OpenRouter and the model providers. We don&apos;t guarantee uptime, model availability or the accuracy of model output.</p>
<h2>Liability</h2><p>To the fullest extent allowed by law, {BRAND.name} is provided &quot;as is&quot; and our liability is limited to the credit on your account.</p>
</Legal>); }
