import { BRAND } from "./brand";
import { db } from "./db";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}
export function generateKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let body = ""; for (const b of bytes) body += ALPHABET[b % ALPHABET.length];
  return `${BRAND.keyPrefix}${body}`;
}
export const keyPrefixOf = (k: string) => k.slice(0, BRAND.keyPrefix.length + 4) + "…" + k.slice(-4);

/** Resolves an sk-gw- key from an Authorization / x-api-key header. */
export async function authenticateKey(req: Request) {
  const h = req.headers.get("authorization") || "";
  const raw = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : (req.headers.get("x-api-key") || "").trim();
  if (!raw.startsWith(BRAND.keyPrefix)) return null;
  const key = await db().findKeyByHash(await sha256Hex(raw));
  if (!key || key.revoked_at) return null;
  return key;
}
