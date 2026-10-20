import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PROGRAM_ID } from "./constants.js";

export const CONFIG_SEED = Buffer.from("config");
export const WATT_MINT_SEED = Buffer.from("watt_mint");
export const FLUSH_SEED = Buffer.from("flush");
export const CLAIM_SEED = Buffer.from("claim");
export const ASK_SEED = Buffer.from("ask");

export function u64le(n: bigint | number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}

export function findConfig(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
}

/** WATT mint is a PDA created in `initialize` (decimals 6, authority = config). */
export function findWattMint(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([WATT_MINT_SEED], programId);
}

export function findFlush(
  index: bigint | number,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  const [config] = findConfig(programId);
  return PublicKey.findProgramAddressSync(
    [FLUSH_SEED, config.toBuffer(), u64le(index)],
    programId,
  );
}

export function findClaimStatus(
  flush: PublicKey,
  claimant: PublicKey,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CLAIM_SEED, flush.toBuffer(), claimant.toBuffer()],
    programId,
  );
}

export function findAsk(
  seller: PublicKey,
  nonce: bigint | number,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ASK_SEED, seller.toBuffer(), u64le(nonce)],
    programId,
  );
}

/** rewards_vault = ATA(WATT, owner = config PDA). */
export function rewardsVault(wattMint: PublicKey, programId: PublicKey = PROGRAM_ID): PublicKey {
  const [config] = findConfig(programId);
  return getAssociatedTokenAddressSync(wattMint, config, true);
}

/** ask_escrow = ATA(WATT, owner = ask PDA). */
export function askEscrow(wattMint: PublicKey, ask: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(wattMint, ask, true);
}

export function ata(mint: PublicKey, owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, true);
}
