import type { Metadata } from "next";
import "./globals.css";
import { BRAND } from "@/lib/brand";
import { WalletCtx } from "@/components/wallet";


export const metadata: Metadata = {
  title: { default: `${BRAND.name}: hold the token, own the compute`, template: `%s · ${BRAND.name}` },
  description: `Trading fees from ${BRAND.launchToken} fund ${BRAND.creditToken} for its holders. Spend it on any model or sell it.`,
};
export const viewport = { themeColor: "#050507" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head><link rel="preconnect" href="https://fonts.googleapis.com" /><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" /></head>
      <body className="min-h-screen flex flex-col">
        <WalletCtx>{children}</WalletCtx>
      </body>
    </html>
  );
}
