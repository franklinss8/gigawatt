import { SiteNav } from "./site-nav";
import { SiteFooter } from "./site-footer";
export function PublicPage({ children }: { children: React.ReactNode }) {
  return (<><SiteNav /><main className="flex-1">{children}</main><SiteFooter /></>);
}
export function PageHero({ eyebrow, title, sub, children }: { eyebrow?: string; title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden border-b border-line">
      <div className="grid-bg absolute inset-0 -z-10" />
      <div className="mx-auto max-w-6xl px-4 pt-20 pb-14">
        {eyebrow && <p className="label mb-4">{eyebrow}</p>}
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05] max-w-2xl">{title}</h1>
        {sub && <p className="text-fg-2 text-lg mt-5 max-w-xl">{sub}</p>}
        {children && <div className="mt-8 flex gap-3">{children}</div>}
      </div>
    </div>
  );
}
