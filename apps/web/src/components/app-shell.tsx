"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "./logo";
import { BRAND } from "@/lib/brand";
import { short } from "./ui";

const items: [string, string][] = [["Home", "/overview"], ["Activity", "/overview/activity"], ["Usage", "/overview/usage"], ["API keys", "/overview/api-keys"], ["Models", "/overview/models"], ["Rewards", "/overview/rewards"], ["Money", "/overview/money"], ["Settings", "/overview/settings"]];

export function AppShell({ wallet, children }: { wallet: string; children: React.ReactNode }) {
  const path = usePathname(); const router = useRouter();
  return (
    <div className="flex-1 flex flex-col md:flex-row">
      <aside className="md:w-56 border-b md:border-b-0 md:border-r border-line p-4 flex md:flex-col gap-1 md:sticky md:top-0 md:h-screen overflow-x-auto">
        <Link href="/" className="flex items-center gap-2 font-semibold px-2 mb-4 shrink-0"><Logo /> {BRAND.name}</Link>
        {items.map(([l, h]) => <Link key={h} href={h} className={`px-3 py-2 rounded-md text-sm shrink-0 ${path === h ? "bg-bg-2 text-fg" : "text-fg-2 hover:text-fg hover:bg-bg-1"}`}>{l}</Link>)}
        <div className="md:mt-auto flex md:flex-col gap-2 md:pt-4 md:border-t border-line shrink-0">
          <Link href="/docs" className="px-3 py-2 text-sm text-fg-3 hover:text-fg">Docs</Link>
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/"); }} className="px-3 py-2 text-left text-sm text-fg-3 hover:text-fg">Sign out <span className="num">{short(wallet)}</span></button>
        </div>
      </aside>
      <main className="flex-1 p-6 md:p-10 max-w-5xl w-full">{children}</main>
    </div>
  );
}
export function PageTitle({ title, sub, right }: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (<div className="flex items-start justify-between gap-4 mb-8"><div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1>{sub && <p className="text-sm text-fg-2 mt-1">{sub}</p>}</div>{right}</div>);
}
