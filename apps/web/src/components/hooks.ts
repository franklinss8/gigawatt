"use client";
import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import bs58 from "bs58";

export type Me = { wallet: string | null; credit_usd?: number };
export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  const refresh = useCallback(async () => { const r = await fetch("/api/me", { cache: "no-store" }); setMe(await r.json()); }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { me, refresh };
}

export function useSignIn() {
  const { publicKey, signMessage } = useWallet();
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) { setError("Connect a wallet first"); return false; }
    setBusy(true); setError(null);
    try {
      const wallet = publicKey.toBase58();
      const n = await (await fetch("/api/auth/nonce", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet }) })).json();
      const sig = await signMessage(new TextEncoder().encode(n.message)) as Uint8Array;
      const v = await (await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet, token: n.token, signature: bs58.encode(sig) }) })).json();
      if (v.error) throw new Error(v.error);
      return true;
    } catch (e) { setError((e as Error).message); return false; } finally { setBusy(false); }
  }, [publicKey, signMessage]);
  return { signIn, busy, error };
}

/** Builds a tx on the server, signs it with the wallet, sends it and waits for confirmation. */
export function useSendTx() {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [state, setState] = useState<{ busy: boolean; error: string | null; sig: string | null; step: string }>({ busy: false, error: null, sig: null, step: "" });
  const send = useCallback(async (kind: string, body: Record<string, unknown>, confirmPath?: string) => {
    if (!publicKey || !signTransaction) { setState(s => ({ ...s, error: "Connect your wallet" })); return null; }
    setState({ busy: true, error: null, sig: null, step: "Building" });
    try {
      const r = await (await fetch(`/api/tx/${kind}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
      if (r.error) throw new Error(r.error);
      setState(s => ({ ...s, step: "Sign in your wallet" }));
      const tx = Transaction.from(Buffer.from(r.tx, "base64"));
      const signed = await signTransaction(tx);
      setState(s => ({ ...s, step: "Sending" }));
      const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false });
      setState(s => ({ ...s, step: "Confirming", sig }));
      await connection.confirmTransaction({ signature: sig, blockhash: tx.recentBlockhash!, lastValidBlockHeight: tx.lastValidBlockHeight! }, "confirmed");
      let confirm: unknown = null;
      if (confirmPath) { setState(s => ({ ...s, step: "Recording" })); confirm = await (await fetch(confirmPath, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sig }) })).json(); }
      setState({ busy: false, error: null, sig, step: "Done" });
      return { sig, confirm };
    } catch (e) { setState({ busy: false, error: (e as Error).message, sig: null, step: "" }); return null; }
  }, [connection, publicKey, signTransaction]);
  return { send, ...state };
}

export function useJson<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null); const [loading, setLoading] = useState(!!url);
  const reload = useCallback(async () => { if (!url) return; setLoading(true); try { setData(await (await fetch(url, { cache: "no-store" })).json()); } finally { setLoading(false); } }, [url]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { reload(); }, [reload, ...deps]);
  return { data, loading, reload };
}
