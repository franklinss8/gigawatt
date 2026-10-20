import { PublicPage, PageHero } from "@/components/public-page";
import { Section, H2, Cta, Arrow, atoms, short } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { readChainStats } from "@/lib/chain";
import { env, explorerUrl } from "@/lib/env";

export const metadata = { title: `${BRAND.creditToken}: the token that pays for model calls` };
export const revalidate = 60;

export default async function Page() {
  const c = await readChainStats().catch(() => null);
  const pf = (c?.purchaseFeeBps ?? BRAND.purchaseFeeBps) / 100, af = (c?.activationFeeBps ?? BRAND.activationFeeBps) / 100;
  return (
    <PublicPage>
      <PageHero eyebrow={`The ${BRAND.creditToken} token`} title={<>Turn USDC into<br />model answers.</>} sub={`${BRAND.creditToken} is a USDC-backed SPL token on Solana. Buy it, activate it as credit, and call OpenAI- and Anthropic-compatible models with one key.`}>
        <Cta href="/overview?action=buy">Buy {BRAND.creditToken}</Cta>
        <Cta href="/docs/inference" ghost>Read the guide <Arrow /></Cta>
      </PageHero>

      <Section>
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <H2 sub={`Each sale sends net USDC to a funding wallet, then mints matching ${BRAND.creditToken} to you.`}>USDC in. {BRAND.creditToken} out.</H2>
            <Flow steps={["100 USDC", "Sale", `${100 - pf} USDC → funding wallet`, `${100 - pf} ${BRAND.creditToken} → your wallet`, `${pf} USDC → treasury`]} />
          </div>
          <Calc title={`Buy ${BRAND.creditToken}`} a={["You pay", "100", "USDC"]} b={["You get", String(100 - pf), BRAND.creditToken]} fee={[`Purchase fee`, `${pf.toFixed(2)} USDC`]} cta="Buy" />
        </div>
      </Section>

      <Section className="border-t border-line">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <H2 sub={`Activation burns ${BRAND.creditToken} into dollar credit on your account. Credit cannot become tokens again.`}>Burn tokens. Get credit.</H2>
            <ul className="text-sm text-fg-2 space-y-2 mt-2">
              <li>• The activation fee ({af}%) goes to the treasury; the rest is burned.</li>
              <li>• Credit is metered per request at OpenRouter&apos;s price plus its 5% platform fee.</li>
              <li>• Every activation is a transaction on chain: your dashboard links to it.</li>
            </ul>
          </div>
          <Calc title={`Activate ${BRAND.creditToken}`} a={["Amount", String(100 - pf), BRAND.creditToken]} b={["You get", `$${((100 - pf) * (1 - af / 100)).toFixed(2)}`, ""]} fee={["Activation fee", `${((100 - pf) * af / 100).toFixed(2)} ${BRAND.creditToken}`]} cta="Activate" />
        </div>
      </Section>

      <Section className="border-t border-line">
        <H2 sub="One key works with OpenAI- and Anthropic-compatible clients. Each request draws from your credit.">Spend credit across the catalog.</H2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="label text-left"><th className="p-4 font-normal">Model</th><th className="p-4 font-normal text-right">Input</th><th className="p-4 font-normal text-right">Output</th><th className="p-4 font-normal text-right">Cost</th></tr></thead>
            <tbody className="num">
              {[["Claude Sonnet", 1240, 380, 0.0066], ["GPT-5 Codex", 18400, 2150, 0.0654], ["Gemini Flash", 6200, 940, 0.0186], ["Qwen3 Coder", 22000, 3100, 0.0102], ["Kimi K2", 4800, 1200, 0.0057], ["Claude Haiku", 3300, 420, 0.0006]].map(([m, i, o, c]) => (
                <tr key={String(m)} className="border-t border-line"><td className="p-4 font-sans">{m}</td><td className="p-4 text-right text-fg-2">{Number(i).toLocaleString()}</td><td className="p-4 text-right text-fg-2">{Number(o).toLocaleString()}</td><td className="p-4 text-right">${Number(c).toFixed(4)}</td></tr>))}
            </tbody>
          </table>
        </div>
        <div className="mt-6"><Cta href="/models" ghost>Browse models <Arrow /></Cta></div>
      </Section>

      <Section className="border-t border-line">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          <div>
            <H2 sub={`${BRAND.launchToken} creator fees turn into USDC, and ${BRAND.launchToken} holders claim their share as ${BRAND.creditToken}.`}>Creator fees become claimable {BRAND.creditToken}.</H2>
            <Flow steps={["pump.fun creator fees (SOL)", "Swap → USDC", `${BRAND.launchToken} holders`, "Treasury"]} />
            <div className="mt-6"><Cta href="/rewards" ghost>Claim on Rewards <Arrow /></Cta></div>
          </div>
          <div className="card p-5">
            <p className="label">Available to claim</p><p className="text-xs text-fg-3">Across linked wallets</p>
            <p className="num text-4xl mt-3">12.40 <span className="text-base text-fg-3">{BRAND.creditToken}</span></p>
            <div className="grid grid-cols-2 gap-3 mt-5 text-sm"><div><p className="label">Total rewards</p><p className="num mt-1">18.60</p></div><div><p className="label">Claimed</p><p className="num mt-1">6.20</p></div></div>
            <div className="mt-5 flex gap-2"><span className="btn-primary flex-1">Claim as credit</span><span className="btn-ghost flex-1">Claim to wallet</span></div>
          </div>
        </div>
      </Section>

      <Section className="border-t border-line">
        <H2 sub={`Funding wallet USDC and ${BRAND.creditToken} supply, read at the same slot. Both are on Solana Explorer.`}>Check it on chain.</H2>
        {c ? (
          <div className="grid md:grid-cols-2 gap-4">
            <a className="card p-5 hover:border-line-2" href={explorerUrl("address", c.fundingWallet)}><p className="label">Funding wallet</p><p className="num text-sm text-fg-3 mt-1">{short(c.fundingWallet)}</p><p className="num text-3xl mt-3">{atoms(c.fundingUsdc)} <span className="text-base text-fg-3">USDC</span></p></a>
            <a className="card p-5 hover:border-line-2" href={explorerUrl("address", env.wattMint)}><p className="label">Supply</p><p className="num text-sm text-fg-3 mt-1">{short(env.wattMint)}</p><p className="num text-3xl mt-3">{atoms(c.wattSupply)} <span className="text-base text-fg-3">{BRAND.creditToken}</span></p></a>
            <div className="md:col-span-2 flex flex-wrap gap-x-8 gap-y-2 text-sm text-fg-2"><span>Purchase fee <b className="text-fg num">{pf}%</b></span><span>Activation fee <b className="text-fg num">{af}%</b></span><span className="num">Slot {c.slot.toLocaleString()}</span><span>{new Date().toUTCString().slice(5, 16)}</span></div>
          </div>
        ) : <p className="card p-5 text-fg-2 text-sm">The program is not configured on this deployment yet. Deploy the program and set the NEXT_PUBLIC_* variables to read live numbers.</p>}
        <div className="mt-6"><Cta href="/stats" ghost>Stats <Arrow /></Cta></div>
      </Section>

      <Section className="border-t border-line text-center">
        <h2 className="text-4xl md:text-5xl font-semibold tracking-tight">Your next call,<br />paid in {BRAND.creditToken}.</h2>
        <div className="mt-8 flex justify-center gap-3"><Cta href="/overview?action=buy">Get {BRAND.creditToken}</Cta><Cta href="/docs/inference" ghost>Read the guide</Cta></div>
      </Section>
    </PublicPage>
  );
}

function Flow({ steps }: { steps: string[] }) {
  return (<div className="flex flex-wrap items-center gap-2 text-sm mt-2">{steps.map((s, i) => (<span key={i} className="contents"><span className="rounded-md border border-line-2 bg-bg-1 px-3 py-1.5 num text-fg-2">{s}</span>{i < steps.length - 1 && <Arrow />}</span>))}</div>);
}
function Calc({ title, a, b, fee, cta }: { title: string; a: string[]; b: string[]; fee: string[]; cta: string }) {
  return (
    <div className="card p-5 glow">
      <p className="font-medium">{title}</p>
      <div className="mt-5 space-y-3">
        <div className="rounded-md border border-line bg-bg p-4"><p className="label">{a[0]}</p><p className="num text-3xl mt-1">{a[1]} <span className="text-base text-fg-3">{a[2]}</span></p></div>
        <div className="rounded-md border border-line bg-bg p-4"><p className="label">{b[0]}</p><p className="num text-3xl mt-1">{b[1]} <span className="text-base text-fg-3">{b[2]}</span></p></div>
      </div>
      <div className="flex justify-between text-sm mt-4 text-fg-2"><span>{fee[0]}</span><span className="num">{fee[1]}</span></div>
      <span className="btn-primary w-full mt-4">{cta}</span>
    </div>
  );
}
