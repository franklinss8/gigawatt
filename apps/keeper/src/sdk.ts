// Single import point for the on-chain SDK: adapts @gigawatt/sdk to the shapes the keeper uses.
import { BorshCoder } from "@coral-xyz/anchor";
import { Connection, PublicKey, type TransactionInstruction } from "@solana/web3.js";
import {
  IDL, PROGRAM_ID, findConfig, findFlush as sdkFindFlush, getReadonlyProgram,
  buildTree as sdkBuildTree, leafHash, nodeHash, flush as sdkFlush,
} from "@gigawatt/sdk";

export { PROGRAM_ID, IDL, findConfig };
export const findFlush = (_config: PublicKey, index: bigint, programId: PublicKey = PROGRAM_ID) => sdkFindFlush(index, programId);
export const hashLeaf = leafHash;
export const hashNode = nodeHash;

export interface ConfigAccount {
  admin: PublicKey; keeper: PublicKey; gwattMint: PublicKey; wattMint: PublicKey; usdcMint: PublicKey; treasury: PublicKey; fundingWallet: PublicKey;
  purchaseFeeBps: number; activationFeeBps: number; buyerFeeBps: number; treasuryShareBps: number;
  flushInterval: bigint; minFlushUsdc: bigint; lastFlushTs: bigint; flushCount: bigint;
  totalMinted: bigint; totalBurned: bigint; totalRewards: bigint; totalClaimed: bigint; totalUsdcIn: bigint; bump: number;
}
const coder = new BorshCoder(IDL);
export function decodeConfig(data: Buffer | Uint8Array): ConfigAccount {
  const c = coder.accounts.decode("config", Buffer.from(data)) as Record<string, { toString(): string }>;
  const big = (k: string) => BigInt(c[k]!.toString());
  const num = (k: string) => Number(c[k]!.toString());
  const pk = (k: string) => c[k] as unknown as PublicKey;
  return {
    admin: pk("admin"), keeper: pk("keeper"), gwattMint: pk("gwattMint"), wattMint: pk("wattMint"), usdcMint: pk("usdcMint"), treasury: pk("treasury"), fundingWallet: pk("fundingWallet"),
    purchaseFeeBps: num("purchaseFeeBps"), activationFeeBps: num("activationFeeBps"), buyerFeeBps: num("buyerFeeBps"), treasuryShareBps: num("treasuryShareBps"),
    flushInterval: big("flushInterval"), minFlushUsdc: big("minFlushUsdc"), lastFlushTs: big("lastFlushTs"), flushCount: big("flushCount"),
    totalMinted: big("totalMinted"), totalBurned: big("totalBurned"), totalRewards: big("totalRewards"), totalClaimed: big("totalClaimed"), totalUsdcIn: big("totalUsdcIn"), bump: num("bump"),
  };
}

export interface MerkleLeafInput { wallet: PublicKey; amount: bigint }
export interface MerkleTree { root: Uint8Array; leaves: Uint8Array[]; getProof(index: number): Uint8Array[]; verify(leaf: Uint8Array, proof: Uint8Array[]): boolean }
export function buildTree(inputs: MerkleLeafInput[]): MerkleTree {
  const t = sdkBuildTree(inputs.map(l => ({ claimant: l.wallet, amount: l.amount })));
  const leaves = inputs.map(l => leafHash(l.wallet, l.amount));
  return {
    root: t.root, leaves,
    getProof: (i) => t.getProof(inputs[i]!.wallet) ?? [],
    verify: (leaf, proof) => { let h = leaf; for (const p of proof) h = nodeHash(h, p); return Buffer.from(h).equals(Buffer.from(t.root)); },
  };
}

export interface FlushArgs { solCollected: bigint; usdcReceived: bigint; usdcToTreasury: bigint; wattForHolders: bigint; merkleRoot: Uint8Array; holderSupply: bigint; holderCount: number }
export interface ProgramLike { programId: PublicKey; wattMint: PublicKey; rewardsVault: PublicKey; flushIndex: bigint; connection?: Connection }
export async function buildFlushIx(program: ProgramLike, keeper: PublicKey, args: FlushArgs): Promise<TransactionInstruction> {
  const p = getReadonlyProgram(program.connection ?? new Connection("http://127.0.0.1:8899"));
  return sdkFlush(p, { keeper, wattMint: program.wattMint, flushIndex: program.flushIndex, ...args });
}
