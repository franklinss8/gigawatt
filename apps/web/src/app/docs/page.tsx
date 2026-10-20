import Link from "next/link";
import { DocsShell } from "@/components/docs-shell";
import { docsByGroup } from "@/content/docs";
import { BRAND } from "@/lib/brand";
export const metadata = { title: "Docs" };
export default function Page() {
  return (<DocsShell><h1>{BRAND.name} docs</h1><p>Hold {BRAND.launchToken}, claim {BRAND.creditToken}, spend it on any model. Start with the quickstart, or read the concepts to see how the money moves.</p>
    {docsByGroup().map(g => <div key={g.group}><h2>{g.group}</h2><div className="grid sm:grid-cols-2 gap-3 not-prose">{g.docs.map(d => <Link key={d.slug} href={`/docs/${d.slug}`} className="card p-4 hover:border-line-2 block"><p className="font-medium text-fg">{d.title}</p><p className="text-sm text-fg-2 mt-1">{d.summary}</p></Link>)}</div></div>)}
  </DocsShell>);
}
