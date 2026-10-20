import { Legal } from "@/components/legal";
export const metadata = { title: "Cookies and storage" };
export default function Page() { return (<Legal title="Cookies and storage">
<p>We set one cookie, <code>gw_session</code>, after you sign a message with your wallet. It is a signed token that identifies your wallet for 30 days and is required for the dashboard. There are no analytics or advertising cookies.</p>
<p>Your wallet extension may keep its own local storage for auto-connect; that is managed by the wallet, not by us.</p>
</Legal>); }
