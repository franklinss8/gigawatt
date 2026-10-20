import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { env } from "./env";
import { BRAND } from "./brand";

const COOKIE = "gw_session";
const secret = () => new TextEncoder().encode(env.jwtSecret);

export const loginMessage = (wallet: string, nonce: string) =>
  `${BRAND.name} sign-in\n\nWallet: ${wallet}\nNonce: ${nonce}\n\nThis signature only proves you own this wallet. It costs nothing.`;

export async function issueNonce(wallet: string) {
  const nonce = bs58.encode(crypto.getRandomValues(new Uint8Array(16)));
  const token = await new SignJWT({ wallet, nonce, kind: "nonce" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("10m").sign(secret());
  return { nonce, token, message: loginMessage(wallet, nonce) };
}

export async function verifyLogin(wallet: string, nonceToken: string, signatureB58: string) {
  const { payload } = await jwtVerify(nonceToken, secret());
  if (payload.kind !== "nonce" || payload.wallet !== wallet) throw new Error("bad nonce");
  const msg = new TextEncoder().encode(loginMessage(wallet, String(payload.nonce)));
  const ok = nacl.sign.detached.verify(msg, bs58.decode(signatureB58), bs58.decode(wallet));
  if (!ok) throw new Error("bad signature");
  const session = await new SignJWT({ wallet, kind: "session" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("30d").sign(secret());
  (await cookies()).set(COOKIE, session, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 });
}

export async function logout() { (await cookies()).delete(COOKIE); }

export async function currentWallet(): Promise<string | null> {
  const c = (await cookies()).get(COOKIE)?.value;
  if (!c) return null;
  try { const { payload } = await jwtVerify(c, secret()); return payload.kind === "session" ? String(payload.wallet) : null; } catch { return null; }
}

export async function requireWallet() {
  const w = await currentWallet();
  if (!w) throw new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  return w;
}
