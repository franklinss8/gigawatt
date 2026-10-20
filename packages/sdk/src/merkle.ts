/**
 * Merkle tree matching programs/gigawatt/src/merkle.rs exactly.
 *
 *   leaf = keccak256(0x00 || claimant_pubkey(32) || amount_u64_le(8))
 *   node = keccak256(0x01 || min(a,b) || max(a,b))      (sorted pairs → index-free proof)
 *
 * Odd levels: the last node is promoted as-is to the next level (no duplication).
 */
import { PublicKey } from "@solana/web3.js";
import sha3 from "js-sha3";
const { keccak_256 } = sha3;

export const LEAF_PREFIX = 0x00;
export const NODE_PREFIX = 0x01;

export interface MerkleLeaf {
  claimant: PublicKey;
  amount: bigint;
}

export interface MerkleTree {
  root: Uint8Array;
  rootHex: string;
  leaves: MerkleLeaf[];
  /** Proof (array of 32-byte siblings) for a claimant, or null if absent. */
  getProof(claimant: PublicKey): Uint8Array[] | null;
  /** The amount recorded for a claimant, or null. */
  getAmount(claimant: PublicKey): bigint | null;
  /** Proof as hex strings, convenient for JSON storage. */
  getProofHex(claimant: PublicKey): string[] | null;
}

function keccak(...parts: Uint8Array[]): Uint8Array {
  const h = keccak_256.create();
  for (const p of parts) h.update(p);
  return new Uint8Array(h.arrayBuffer());
}

function u64le(n: bigint): Uint8Array {
  if (n < 0n || n > 0xffff_ffff_ffff_ffffn) throw new Error("amount out of u64 range");
  const b = new Uint8Array(8);
  let v = n;
  for (let i = 0; i < 8; i++) {
    b[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return b;
}

function cmp(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < 32; i++) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
}

export function leafHash(claimant: PublicKey, amount: bigint): Uint8Array {
  return keccak(Uint8Array.of(LEAF_PREFIX), claimant.toBytes(), u64le(amount));
}

export function nodeHash(a: Uint8Array, b: Uint8Array): Uint8Array {
  return cmp(a, b) <= 0
    ? keccak(Uint8Array.of(NODE_PREFIX), a, b)
    : keccak(Uint8Array.of(NODE_PREFIX), b, a);
}

export const toHex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

export function fromHex(h: string): Uint8Array {
  const s = h.startsWith("0x") ? h.slice(2) : h;
  if (s.length !== 64) throw new Error("expected 32-byte hex");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function buildTree(leaves: MerkleLeaf[]): MerkleTree {
  if (leaves.length === 0) throw new Error("buildTree: no leaves");

  // Deduplicate claimants (sum amounts) and sort deterministically by pubkey.
  const merged = new Map<string, MerkleLeaf>();
  for (const l of leaves) {
    const k = l.claimant.toBase58();
    const prev = merged.get(k);
    merged.set(k, prev ? { claimant: l.claimant, amount: prev.amount + l.amount } : { ...l });
  }
  const sorted = [...merged.values()].sort((a, b) => cmp(a.claimant.toBytes(), b.claimant.toBytes()));

  const layers: Uint8Array[][] = [sorted.map((l) => leafHash(l.claimant, l.amount))];
  while (layers[layers.length - 1].length > 1) {
    const prev = layers[layers.length - 1];
    const next: Uint8Array[] = [];
    for (let i = 0; i < prev.length; i += 2) {
      next.push(i + 1 < prev.length ? nodeHash(prev[i], prev[i + 1]) : prev[i]);
    }
    layers.push(next);
  }
  const root = layers[layers.length - 1][0];
  const index = new Map(sorted.map((l, i) => [l.claimant.toBase58(), i]));

  const getProof = (claimant: PublicKey): Uint8Array[] | null => {
    let idx = index.get(claimant.toBase58());
    if (idx === undefined) return null;
    const proof: Uint8Array[] = [];
    for (let level = 0; level < layers.length - 1; level++) {
      const layer = layers[level];
      const sibling = idx % 2 === 0 ? idx + 1 : idx - 1;
      if (sibling < layer.length) proof.push(layer[sibling]);
      idx = Math.floor(idx / 2);
    }
    return proof;
  };

  return {
    root,
    rootHex: toHex(root),
    leaves: sorted,
    getProof,
    getAmount: (c) => {
      const i = index.get(c.toBase58());
      return i === undefined ? null : sorted[i].amount;
    },
    getProofHex: (c) => {
      const p = getProof(c);
      return p ? p.map(toHex) : null;
    },
  };
}

export function verify(
  root: Uint8Array,
  claimant: PublicKey,
  amount: bigint,
  proof: Uint8Array[],
): boolean {
  let h = leafHash(claimant, amount);
  for (const sib of proof) h = nodeHash(h, sib);
  return cmp(h, root) === 0;
}

/**
 * Pro-rata distribution helper: watt_for_holders × balance / holder_supply for each holder.
 * Returns leaves with amount > 0 and the exact counted supply.
 */
export function computeDistribution(
  holders: { owner: PublicKey; balance: bigint }[],
  wattForHolders: bigint,
): { leaves: MerkleLeaf[]; holderSupply: bigint; totalAllocated: bigint } {
  const holderSupply = holders.reduce((s, h) => s + h.balance, 0n);
  const leaves: MerkleLeaf[] = [];
  let totalAllocated = 0n;
  if (holderSupply === 0n) return { leaves, holderSupply, totalAllocated };
  for (const h of holders) {
    const amount = (wattForHolders * h.balance) / holderSupply;
    if (amount > 0n) {
      leaves.push({ claimant: h.owner, amount });
      totalAllocated += amount;
    }
  }
  return { leaves, holderSupply, totalAllocated };
}
