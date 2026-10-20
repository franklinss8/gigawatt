import Link from "next/link";

export function Section({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`mx-auto max-w-6xl px-4 py-20 ${className}`}>{children}</section>;
}
export function H2({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (<div className="mb-10"><h2 className="text-3xl md:text-4xl font-semibold tracking-tight">{children}</h2>{sub && <p className="text-fg-2 mt-3 max-w-xl">{sub}</p>}</div>);
}
export function Feature({ title, text }: { title: string; text: string }) {
  return (<div className="card p-5"><p className="font-medium">{title}</p><p className="text-sm text-fg-2 mt-1.5 leading-6">{text}</p></div>);
}
export function Stat({ label, value, unit, hint }: { label: string; value: React.ReactNode; unit?: string; hint?: string }) {
  return (<div className="card p-5"><p className="label">{label}</p><p className="num text-2xl md:text-3xl mt-2">{value}{unit && <span className="text-fg-3 text-base ml-1.5">{unit}</span>}</p>{hint && <p className="text-xs text-fg-3 mt-1">{hint}</p>}</div>);
}
export function Arrow() { return <span aria-hidden className="text-fg-3">→</span>; }
export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "ok" | "bad" | "volt" }) {
  const t = { neutral: "border-line-2 text-fg-2", ok: "border-ok/40 text-ok", bad: "border-bad/40 text-bad", volt: "border-volt/40 text-volt" }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2 h-5 text-[11px] ${t}`}>{children}</span>;
}
export function Cta({ href, children, ghost }: { href: string; children: React.ReactNode; ghost?: boolean }) {
  return <Link href={href} className={ghost ? "btn-ghost" : "btn-primary"}>{children}</Link>;
}
export const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const atoms = (n: number | bigint | string, d = 2) => fmt(Number(n) / 1e6, d);
export const short = (s: string) => (s ? `${s.slice(0, 4)}…${s.slice(-4)}` : "");
