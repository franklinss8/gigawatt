import { PageTitle } from "@/components/app-shell";
import { currentWallet } from "@/lib/auth";
import { env, explorerUrl } from "@/lib/env";
import { dbMode } from "@/lib/db";
import { BRAND } from "@/lib/brand";
export const dynamic = "force-dynamic";
export default async function Page() {
  const w = await currentWallet();
  const rows: [string, React.ReactNode][] = [
    ["Wallet", <a key="w" className="num underline" href={explorerUrl("address", w!)} target="_blank">{w}</a>],
    ["Cluster", env.cluster],
    ["Program", env.programId ? <a key="p" className="num underline" href={explorerUrl("address", env.programId)} target="_blank">{env.programId}</a> : "not configured"],
    [`${BRAND.launchToken} mint`, env.gwattMint || "–"], [`${BRAND.creditToken} mint`, env.wattMint || "–"], ["USDC mint", env.usdcMint || "–"],
    ["Storage", dbMode() === "supabase" ? "Supabase" : "In-memory (dev)"],
  ];
  return (<><PageTitle title="Settings" sub="Your account is your wallet. There is nothing else to set." />
    <div className="card divide-y divide-line text-sm">{rows.map(([k, v]) => <div key={k} className="p-4 grid sm:grid-cols-[160px_1fr] gap-1"><span className="text-fg-3">{k}</span><span className="num break-all">{v}</span></div>)}</div>
    <p className="text-sm text-fg-2 mt-6">Keys and security: keys are stored hashed; a lost key cannot be recovered, only revoked. Sessions last 30 days and are tied to this browser.</p></>);
}
