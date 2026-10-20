import { notFound } from "next/navigation";
import { marked } from "marked";
import { DocsShell } from "@/components/docs-shell";
import { DOCS, docBySlug } from "@/content/docs";
export const dynamicParams = false;
export function generateStaticParams() { return DOCS.map(d => ({ slug: [d.slug] })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }) { const d = docBySlug((await params).slug.join("/")); return { title: d ? `${d.title} · Docs` : "Docs" }; }
export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {
  const d = docBySlug((await params).slug.join("/")); if (!d) notFound();
  const html = await marked.parse(d.body, { gfm: true });
  return (<DocsShell current={d.slug}><p className="label mb-2">{d.group}</p><h1>{d.title}</h1><p className="text-lg">{d.summary}</p><div dangerouslySetInnerHTML={{ __html: html }} /></DocsShell>);
}
