import { PublicPage } from "./public-page";
export function Legal({ title, children }: { title: string; children: React.ReactNode }) {
  return (<PublicPage><div className="mx-auto max-w-3xl px-4 py-16 prose-gw"><h1>{title}</h1><p className="text-xs text-fg-3">Last updated {new Date().toISOString().slice(0, 10)}</p>{children}</div></PublicPage>);
}
