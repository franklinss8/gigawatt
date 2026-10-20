"use client";
import Link from "next/link";
import { useState } from "react";
import { Logo } from "./logo";
import { BRAND } from "@/lib/brand";

const groups = [
  { name: "Product", items: [["Models", "/models"], ["MCP", "/mcp"], ["Incognito", "/incognito"], ["Overdrive", "/overdrive"]] },
  { name: "Network", items: [["Rewards", "/rewards"], ["Sell", "/sell"], ["Stats", "/stats"], ["Status", "/status"]] },
  { name: "Developers", items: [["Docs", "/docs"], ["Quickstart", "/docs/quickstart"], ["API reference", "/docs/api-reference"], ["MCP server", "/docs/mcp"]] },
];

export function SiteNav() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight"><Logo /> {BRAND.name}</Link>
        <nav className="hidden md:flex items-center gap-1 text-sm text-fg-2">
          {groups.map(g => (
            <div key={g.name} className="relative" onMouseEnter={() => setOpen(g.name)} onMouseLeave={() => setOpen(null)}>
              <button className="px-3 h-9 rounded-md hover:text-fg hover:bg-bg-2">{g.name}</button>
              {open === g.name && (
                <div className="absolute left-0 top-9 card p-1.5 w-48 shadow-xl">
                  {g.items.map(([l, h]) => <Link key={h} href={h} className="block px-3 py-2 rounded-md hover:bg-bg-2 hover:text-fg">{l}</Link>)}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/sign-in" className="btn-ghost h-9">Sign in</Link>
          <Link href="/overview" className="btn-primary h-9">Open app</Link>
        </div>
      </div>
    </header>
  );
}
