import Link from "next/link";
import { Logo } from "./logo";
import { docsByGroup } from "@/content/docs";
import { BRAND } from "@/lib/brand";

export function DocsShell({ current, children }: { current?: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur"><div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-4"><Link href="/" className="flex items-center gap-2 font-semibold"><Logo /> {BRAND.name}</Link><span className="text-fg-3">/</span><Link href="/docs" className="text-fg-2 hover:text-fg">Docs</Link><div className="ml-auto flex gap-2"><Link href="/docs/api-reference" className="btn-ghost h-9">API reference</Link><Link href="/overview" className="btn-primary h-9">Open app</Link></div></div></header>
      <div className="mx-auto max-w-6xl px-4 w-full flex-1 grid md:grid-cols-[220px_1fr] gap-10 py-10">
        <nav className="text-sm space-y-6 md:sticky md:top-20 md:self-start">
          {docsByGroup().map(g => <div key={g.group}><p className="label mb-2">{g.group}</p>{g.docs.map(d => <Link key={d.slug} href={`/docs/${d.slug}`} className={`block py-1 ${current === d.slug ? "text-volt" : "text-fg-2 hover:text-fg"}`}>{d.title}</Link>)}</div>)}
          <div><p className="label mb-2">Agents</p><a href="/llms.txt" className="block py-1 text-fg-2 hover:text-fg">llms.txt</a></div>
        </nav>
        <div className="prose-gw min-w-0">{children}</div>
      </div>
    </div>
  );
}
