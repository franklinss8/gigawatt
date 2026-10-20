"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Logo } from "@/components/logo";
import { useMe, useSignIn } from "@/components/hooks";
import { BRAND } from "@/lib/brand";
import Link from "next/link";
import { Suspense } from "react";

export default function Page() { return <Suspense><SignIn /></Suspense>; }

function SignIn() {
  const { connected } = useWallet();
  const { signIn, busy, error } = useSignIn();
  const { me } = useMe();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/overview";
  useEffect(() => { if (me?.wallet) router.replace(next); }, [me, router, next]);
  return (
    <div className="flex-1 flex items-center justify-center p-6 grid-bg">
      <div className="card p-8 w-full max-w-sm glow">
        <Link href="/" className="flex items-center gap-2 font-semibold"><Logo /> {BRAND.name}</Link>
        <h1 className="text-2xl font-semibold mt-6">Sign in</h1>
        <p className="text-sm text-fg-2 mt-2">Connect a Solana wallet and sign a message. No transaction, no fee. Your wallet is your account.</p>
        <div className="mt-6 space-y-3">
          <WalletMultiButton className="w-full" />
          <button className="btn-primary w-full disabled:opacity-50" disabled={!connected || busy} onClick={async () => { if (await signIn()) router.replace(next); }}>{busy ? "Check your wallet…" : "Sign message"}</button>
        </div>
        {error && <p className="text-bad text-sm mt-3">{error}</p>}
        <p className="text-xs text-fg-3 mt-6">Phantom and Solflare are supported. Set the wallet to {process.env.NEXT_PUBLIC_CLUSTER === "mainnet-beta" ? "Mainnet" : "Devnet"}.</p>
      </div>
    </div>
  );
}
