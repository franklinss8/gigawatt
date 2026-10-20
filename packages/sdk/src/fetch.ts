import type { IdlAccounts } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import type { Gigawatt } from "./types.js";
import type { GigawattProgram, ProgramContext } from "./instructions.js";
import { findConfig, findFlush } from "./pda.js";

export type ConfigAccount = IdlAccounts<Gigawatt>["config"];
export type FlushAccount = IdlAccounts<Gigawatt>["flush"];
export type AskAccount = IdlAccounts<Gigawatt>["ask"];
export type ClaimStatusAccount = IdlAccounts<Gigawatt>["claimStatus"];

export async function fetchConfig(program: GigawattProgram): Promise<ConfigAccount> {
  const [config] = findConfig(program.programId);
  return program.account.config.fetch(config);
}

export async function fetchConfigNullable(program: GigawattProgram): Promise<ConfigAccount | null> {
  const [config] = findConfig(program.programId);
  return program.account.config.fetchNullable(config);
}

export function contextFromConfig(c: ConfigAccount): ProgramContext {
  return {
    wattMint: c.wattMint,
    usdcMint: c.usdcMint,
    treasury: c.treasury,
    fundingWallet: c.fundingWallet,
  };
}

export async function fetchFlush(
  program: GigawattProgram,
  index: bigint | number,
): Promise<FlushAccount | null> {
  const [pda] = findFlush(index, program.programId);
  return program.account.flush.fetchNullable(pda);
}

export async function fetchAllFlushes(
  program: GigawattProgram,
): Promise<{ publicKey: PublicKey; account: FlushAccount }[]> {
  const all = await program.account.flush.all();
  return all.sort((a, b) => a.account.index.cmp(b.account.index));
}

export interface AskWithKey {
  publicKey: PublicKey;
  account: AskAccount;
}

/** All open asks, sorted by price ascending then time ascending. Optionally filtered by seller. */
export async function fetchAsks(program: GigawattProgram, seller?: PublicKey): Promise<AskWithKey[]> {
  const filters = seller ? [{ memcmp: { offset: 8, bytes: seller.toBase58() } }] : [];
  const all = await program.account.ask.all(filters);
  return all
    .filter((a) => !a.account.remaining.isZero())
    .sort((a, b) => {
      const p = a.account.price.cmp(b.account.price);
      return p !== 0 ? p : a.account.ts.cmp(b.account.ts);
    });
}

export async function fetchClaimStatus(
  program: GigawattProgram,
  claimStatus: PublicKey,
): Promise<ClaimStatusAccount | null> {
  return program.account.claimStatus.fetchNullable(claimStatus);
}
