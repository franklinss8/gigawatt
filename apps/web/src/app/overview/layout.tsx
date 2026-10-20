import { redirect } from "next/navigation";
import { currentWallet } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
export const dynamic = "force-dynamic";
export default async function Layout({ children }: { children: React.ReactNode }) {
  const wallet = await currentWallet();
  if (!wallet) redirect("/sign-in?next=/overview");
  return <AppShell wallet={wallet}>{children}</AppShell>;
}
