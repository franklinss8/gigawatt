import { BN, type Program } from "@coral-xyz/anchor";
import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import type { Gigawatt } from "./types.js";
import { findAsk, findConfig, findFlush, findClaimStatus, findWattMint } from "./pda.js";

export type GigawattProgram = Program<Gigawatt>;

const bn = (v: bigint | number | BN): BN => (BN.isBN(v) ? (v as BN) : new BN(v.toString()));
const bytes32 = (v: Uint8Array | number[]): number[] => {
  const arr = Array.from(v);
  if (arr.length !== 32) throw new Error("expected 32 bytes");
  return arr;
};

export interface InitializeParams {
  keeper: PublicKey;
  treasury: PublicKey;
  fundingWallet: PublicKey;
  purchaseFeeBps: number;
  activationFeeBps: number;
  buyerFeeBps: number;
  treasuryShareBps: number;
  flushInterval: bigint | number;
  minFlushUsdc: bigint | number;
}

export interface ParamsUpdate {
  treasury?: PublicKey | null;
  fundingWallet?: PublicKey | null;
  purchaseFeeBps?: number | null;
  activationFeeBps?: number | null;
  buyerFeeBps?: number | null;
  treasuryShareBps?: number | null;
  flushInterval?: bigint | number | null;
  minFlushUsdc?: bigint | number | null;
}

/** Context the caller must know to build user-facing instructions (all from Config). */
export interface ProgramContext {
  wattMint: PublicKey;
  usdcMint: PublicKey;
  treasury: PublicKey;
  fundingWallet: PublicKey;
}

export async function initialize(
  program: GigawattProgram,
  args: {
    admin: PublicKey;
    gwattMint: PublicKey;
    usdcMint: PublicKey;
    params: InitializeParams;
  },
): Promise<TransactionInstruction> {
  const [wattMint] = findWattMint(program.programId);
  return program.methods
    .initialize({
      keeper: args.params.keeper,
      treasury: args.params.treasury,
      fundingWallet: args.params.fundingWallet,
      purchaseFeeBps: args.params.purchaseFeeBps,
      activationFeeBps: args.params.activationFeeBps,
      buyerFeeBps: args.params.buyerFeeBps,
      treasuryShareBps: args.params.treasuryShareBps,
      flushInterval: bn(args.params.flushInterval),
      minFlushUsdc: bn(args.params.minFlushUsdc),
    })
    .accountsPartial({
      admin: args.admin,
      gwattMint: args.gwattMint,
      usdcMint: args.usdcMint,
      wattMint,
    })
    .instruction();
}

export async function setParams(
  program: GigawattProgram,
  args: { admin: PublicKey; params: ParamsUpdate },
): Promise<TransactionInstruction> {
  const p = args.params;
  return program.methods
    .setParams({
      treasury: p.treasury ?? null,
      fundingWallet: p.fundingWallet ?? null,
      purchaseFeeBps: p.purchaseFeeBps ?? null,
      activationFeeBps: p.activationFeeBps ?? null,
      buyerFeeBps: p.buyerFeeBps ?? null,
      treasuryShareBps: p.treasuryShareBps ?? null,
      flushInterval: p.flushInterval == null ? null : bn(p.flushInterval),
      minFlushUsdc: p.minFlushUsdc == null ? null : bn(p.minFlushUsdc),
    })
    .accountsPartial({ admin: args.admin })
    .instruction();
}

export async function setKeeper(
  program: GigawattProgram,
  args: { admin: PublicKey; keeper: PublicKey },
): Promise<TransactionInstruction> {
  return program.methods.setKeeper(args.keeper).accountsPartial({ admin: args.admin }).instruction();
}

export async function buyWatt(
  program: GigawattProgram,
  args: { buyer: PublicKey; usdcAmount: bigint | number; ctx: ProgramContext },
): Promise<TransactionInstruction> {
  return program.methods
    .buyWatt(bn(args.usdcAmount))
    .accountsPartial({
      buyer: args.buyer,
      wattMint: args.ctx.wattMint,
      usdcMint: args.ctx.usdcMint,
      treasury: args.ctx.treasury,
      fundingWallet: args.ctx.fundingWallet,
    })
    .instruction();
}

export async function activate(
  program: GigawattProgram,
  args: { owner: PublicKey; amount: bigint | number; ctx: ProgramContext },
): Promise<TransactionInstruction> {
  return program.methods
    .activate(bn(args.amount))
    .accountsPartial({
      owner: args.owner,
      wattMint: args.ctx.wattMint,
      treasury: args.ctx.treasury,
    })
    .instruction();
}

export interface FlushArgs {
  keeper: PublicKey;
  wattMint: PublicKey;
  flushIndex: bigint | number; // = config.flushCount at the time of the call
  solCollected: bigint | number;
  usdcReceived: bigint | number;
  usdcToTreasury: bigint | number;
  wattForHolders: bigint | number;
  merkleRoot: Uint8Array | number[];
  holderSupply: bigint | number;
  holderCount: number;
}

export async function flush(program: GigawattProgram, args: FlushArgs): Promise<TransactionInstruction> {
  const [flushPda] = findFlush(args.flushIndex, program.programId);
  return program.methods
    .flush(
      bn(args.solCollected),
      bn(args.usdcReceived),
      bn(args.usdcToTreasury),
      bn(args.wattForHolders),
      bytes32(args.merkleRoot),
      bn(args.holderSupply),
      args.holderCount,
    )
    .accountsPartial({
      keeper: args.keeper,
      wattMint: args.wattMint,
      flush: flushPda,
    })
    .instruction();
}

export interface ClaimArgs {
  claimant: PublicKey;
  wattMint: PublicKey;
  flushIndex: bigint | number;
  amount: bigint | number;
  proof: (Uint8Array | number[])[];
}

export async function claim(program: GigawattProgram, args: ClaimArgs): Promise<TransactionInstruction> {
  const [flushPda] = findFlush(args.flushIndex, program.programId);
  const [claimStatus] = findClaimStatus(flushPda, args.claimant, program.programId);
  return program.methods
    .claim(bn(args.flushIndex), bn(args.amount), args.proof.map(bytes32))
    .accountsPartial({
      claimant: args.claimant,
      wattMint: args.wattMint,
      flush: flushPda,
      claimStatus,
    })
    .instruction();
}

export async function claimAndActivate(
  program: GigawattProgram,
  args: ClaimArgs & { treasury: PublicKey },
): Promise<TransactionInstruction> {
  const [flushPda] = findFlush(args.flushIndex, program.programId);
  const [claimStatus] = findClaimStatus(flushPda, args.claimant, program.programId);
  return program.methods
    .claimAndActivate(bn(args.flushIndex), bn(args.amount), args.proof.map(bytes32))
    .accountsPartial({
      claimant: args.claimant,
      wattMint: args.wattMint,
      flush: flushPda,
      claimStatus,
      treasury: args.treasury,
    })
    .instruction();
}

export async function placeAsk(
  program: GigawattProgram,
  args: {
    seller: PublicKey;
    wattMint: PublicKey;
    nonce: bigint | number;
    price: bigint | number;
    amount: bigint | number;
  },
): Promise<TransactionInstruction> {
  const [ask] = findAsk(args.seller, args.nonce, program.programId);
  return program.methods
    .placeAsk(bn(args.nonce), bn(args.price), bn(args.amount))
    .accountsPartial({ seller: args.seller, wattMint: args.wattMint, ask })
    .instruction();
}

export async function cancelAsk(
  program: GigawattProgram,
  args: { seller: PublicKey; wattMint: PublicKey; nonce: bigint | number },
): Promise<TransactionInstruction> {
  const [ask] = findAsk(args.seller, args.nonce, program.programId);
  return program.methods
    .cancelAsk()
    .accountsPartial({ seller: args.seller, wattMint: args.wattMint, ask })
    .instruction();
}

export async function fillAsk(
  program: GigawattProgram,
  args: {
    buyer: PublicKey;
    seller: PublicKey;
    nonce: bigint | number;
    amount: bigint | number;
    ctx: ProgramContext;
  },
): Promise<TransactionInstruction> {
  const [ask] = findAsk(args.seller, args.nonce, program.programId);
  return program.methods
    .fillAsk(bn(args.amount))
    .accountsPartial({
      buyer: args.buyer,
      wattMint: args.ctx.wattMint,
      usdcMint: args.ctx.usdcMint,
      ask,
      sellerAccount: args.seller,
      treasury: args.ctx.treasury,
    })
    .instruction();
}

export { findConfig };
