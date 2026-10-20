import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { Logo } from "./logo";

const cols: [string, [string, string][]][] = [
  ["Product", [["Models", "/models"], ["MCP", "/mcp"], ["Incognito", "/incognito"], ["Overdrive", "/overdrive"]]],
  ["Network", [["Rewards", "/rewards"], ["Sell", "/sell"], ["Stats", "/stats"], ["Status", "/status"]]],
  ["Developers", [["Docs", "/docs"], ["Quickstart", "/docs/quickstart"], ["API reference", "/docs/api-reference"], ["MCP server", "/docs/mcp"], ["Docs for agents", "/llms.txt"]]],
  ["Tokens", [[BRAND.creditToken, "/inference"], [BRAND.launchToken, "/docs/rewards"]]],
  ["Legal", [["Terms", "/terms"], ["Privacy", "/privacy"], ["Cookies and storage", "/cookies"], ["Acceptable use", "/acceptable-use"]]],
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line mt-24">
      <div className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex flex-col md:flex-row gap-10">
          <div className="md:w-64">
            <div className="flex items-center gap-2 font-semibold"><Logo /> {BRAND.name}</div>
            <p className="text-sm text-fg-3 mt-3">Find us on</p>
            <ul className="mt-2 space-y-1 text-sm">
              <li><a className="text-fg-2 hover:text-fg" href={BRAND.x}>X</a></li>
              <li><a className="text-fg-2 hover:text-fg" href={BRAND.telegram}>Telegram</a></li>
            </ul>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-8 flex-1">
            {cols.map(([t, items]) => (
              <div key={t}>
                <p className="label mb-3">{t}</p>
                <ul className="space-y-2 text-sm">{items.map(([l, h]) => <li key={h}><Link href={h} className="text-fg-2 hover:text-fg">{l}</Link></li>)}</ul>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-fg-3 mt-12">© {new Date().getFullYear()} {BRAND.name} · Built on Solana · Tokens launched on pump.fun</p>
      </div>
    </footer>
  );
}
