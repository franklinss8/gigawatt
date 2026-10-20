/**
 * pump.fun creator-fee collection for the GWATT mint (mainnet).
 *
 * Facts relied on (verified 2026-10-20 against the published IDLs in
 * github.com/pump-fun/pump-public-docs `idl/pump.json` / `idl/pump_amm.json`
 * and the npm packages @pump-fun/pump-sdk@4.2.0 / @pump-fun/pump-swap-sdk@2.2.0):
 *
 *  pump (bonding curve)   6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P
 *    collect_creator_fee  disc [20,22,86,123,198,28,219,132], no args
 *      accounts: creator(w), creator_vault(w) = PDA["creator-vault", creator],
 *                system_program, event_authority = PDA["__event_authority"], program
 *      -> moves the SOL lamports held by creator_vault to `creator`. Permissionless
 *         (no signer in the IDL); the SDK README calls it "permissionless".
 *    sweep_creator_fee    disc [32,246,191,52,8,201,73,186], no args (v3 trades
 *      leave creator fees on the curve in `BondingCurve.creator_fee` until swept)
 *      accounts: payer(w,s), global = PDA["global"], base_mint, quote_mint,
 *                quote_token_program, associated_token_program, system_program,
 *                bonding_curve(w) = PDA["bonding-curve", mint],
 *                associated_quote_bonding_curve(w) = ATA(bonding_curve, quote),
 *                recipient(w) = creator_vault PDA, associated_quote_recipient(w) =
 *                ATA(recipient, quote), event_authority, program
 *    BondingCurve layout (after 8-byte disc): virtual_token_reserves u64,
 *      virtual_quote_reserves u64, real_token_reserves u64, real_quote_reserves u64,
 *      token_total_supply u64, complete bool, creator pubkey, ...
 *
 *  pump-amm (PumpSwap)    pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA
 *    collect_coin_creator_fee disc [160,57,89,42,181,139,43,66], no args
 *      accounts: quote_mint, quote_token_program, coin_creator,
 *                coin_creator_vault_authority = PDA["creator_vault", coin_creator],
 *                coin_creator_vault_ata(w) = ATA(vault_authority, quote),
 *                coin_creator_token_account(w) = creator's quote ATA,
 *                event_authority, program
 *      -> transfers the WSOL held in the vault ATA to the creator's WSOL ATA; the
 *         keeper then closes the WSOL ATA to unwrap (as the official SDK does).
 *    sweep_creator_fee        disc [32,246,191,52,8,201,73,186], no args
 *      accounts: payer(w,s), global_config = PDA["global_config"], pool(w),
 *                quote_mint, quote_token_program, pool_quote_token_account(w),
 *                recipient = coin_creator_vault_authority,
 *                recipient_token_account(w) = ATA(recipient, quote),
 *                system_program, associated_token_program, event_authority, program
 *    canonical pool = PDA["pool", index u16 LE (0), PDA_pump["pool-authority", mint],
 *                         base_mint, quote_mint(WSOL)]
 *    Pool layout (after disc): pool_bump u8, index u16, creator pk, base_mint pk,
 *      quote_mint pk, lp_mint pk, pool_base_token_account pk,
 *      pool_quote_token_account pk, lp_supply u64, coin_creator pk, ...
 *
 * The keeper must be (or control) the coin creator: the lamports land on
 * `creator`, so KEEPER_KEYPAIR is expected to be the wallet that created GWATT.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { log } from "./config.js";

export const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
export const PUMP_AMM_PROGRAM_ID = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");

const DISC_COLLECT_CREATOR_FEE = Buffer.from([20, 22, 86, 123, 198, 28, 219, 132]);
const DISC_COLLECT_COIN_CREATOR_FEE = Buffer.from([160, 57, 89, 42, 181, 139, 43, 66]);
const DISC_SWEEP_CREATOR_FEE = Buffer.from([32, 246, 191, 52, 8, 201, 73, 186]); // same on both programs

const pda = (seeds: (Buffer | Uint8Array)[], program: PublicKey) => PublicKey.findProgramAddressSync(seeds, program)[0];

export const pumpGlobalPda = () => pda([Buffer.from("global")], PUMP_PROGRAM_ID);
export const pumpEventAuthority = () => pda([Buffer.from("__event_authority")], PUMP_PROGRAM_ID);
export const pumpAmmEventAuthority = () => pda([Buffer.from("__event_authority")], PUMP_AMM_PROGRAM_ID);
export const pumpAmmGlobalConfig = () => pda([Buffer.from("global_config")], PUMP_AMM_PROGRAM_ID);
export const bondingCurvePda = (mint: PublicKey) => pda([Buffer.from("bonding-curve"), mint.toBuffer()], PUMP_PROGRAM_ID);
export const creatorVaultPda = (creator: PublicKey) => pda([Buffer.from("creator-vault"), creator.toBuffer()], PUMP_PROGRAM_ID);
export const coinCreatorVaultAuthorityPda = (creator: PublicKey) =>
  pda([Buffer.from("creator_vault"), creator.toBuffer()], PUMP_AMM_PROGRAM_ID);
export const pumpPoolAuthorityPda = (mint: PublicKey) => pda([Buffer.from("pool-authority"), mint.toBuffer()], PUMP_PROGRAM_ID);
export function canonicalPoolPda(mint: PublicKey, quoteMint: PublicKey = NATIVE_MINT): PublicKey {
  const idx = Buffer.alloc(2); // CANONICAL_POOL_INDEX = 0
  idx.writeUInt16LE(0);
  return pda([Buffer.from("pool"), idx, pumpPoolAuthorityPda(mint).toBuffer(), mint.toBuffer(), quoteMint.toBuffer()], PUMP_AMM_PROGRAM_ID);
}

export interface BondingCurveState {
  complete: boolean;
  creator: PublicKey;
  creatorFeeBucket: bigint | null;
}

/** Decodes the fields the keeper needs from a `BondingCurve` account. */
export function decodeBondingCurve(data: Buffer): BondingCurveState {
  // disc(8) + 5*u64(40) = 48 -> complete(bool) at 48, creator at 49..81
  const complete = data.readUInt8(48) === 1;
  const creator = new PublicKey(data.subarray(49, 81));
  // Post-v3 layout: is_mayhem_mode(81) is_cashback_coin(82) quote_mint(83..115)
  // creator_fee_bps u64(115..123) can_edit_creator_fee(123) is_holder_reward(124)
  // creator_fee u64 (125..133)
  const creatorFeeBucket = data.length >= 133 ? data.readBigUInt64LE(125) : null;
  return { complete, creator, creatorFeeBucket };
}

/** Decodes `coin_creator` + creator_fees bucket from a pump-amm `Pool` account. */
export function decodePool(data: Buffer): { coinCreator: PublicKey; creatorFeesBucket: bigint | null } {
  // disc(8) pool_bump(1) index(2) creator(32) base(32) quote(32) lp(32) pbta(32) pqta(32) lp_supply(8) coin_creator(32)
  const o = 8 + 1 + 2 + 32 * 6 + 8; // 211
  const coinCreator = new PublicKey(data.subarray(o, o + 32));
  // then is_mayhem_mode(1) is_cashback_coin(1) virtual_quote_reserves i128(16) creator_fee_bps u64(8)
  // can_edit_creator_fee(1) is_holder_reward(1) protocol_fees u64(8) creator_fees u64(8)
  const feesOff = o + 32 + 1 + 1 + 16 + 8 + 1 + 1 + 8;
  const creatorFeesBucket = data.length >= feesOff + 8 ? data.readBigUInt64LE(feesOff) : null;
  return { coinCreator, creatorFeesBucket };
}

// ---------------------------------------------------------------------------
// Instruction builders
// ---------------------------------------------------------------------------

export function collectCreatorFeeIx(creator: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    programId: PUMP_PROGRAM_ID,
    data: DISC_COLLECT_CREATOR_FEE,
    keys: [
      { pubkey: creator, isSigner: false, isWritable: true },
      { pubkey: creatorVaultPda(creator), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: pumpEventAuthority(), isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });
}

export function sweepBondingCurveCreatorFeeIx(payer: PublicKey, mint: PublicKey, creator: PublicKey): TransactionInstruction {
  const bondingCurve = bondingCurvePda(mint);
  const recipient = creatorVaultPda(creator);
  return new TransactionInstruction({
    programId: PUMP_PROGRAM_ID,
    data: DISC_SWEEP_CREATOR_FEE,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: pumpGlobalPda(), isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: NATIVE_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: getAssociatedTokenAddressSync(NATIVE_MINT, bondingCurve, true), isSigner: false, isWritable: true },
      { pubkey: recipient, isSigner: false, isWritable: true },
      { pubkey: getAssociatedTokenAddressSync(NATIVE_MINT, recipient, true), isSigner: false, isWritable: true },
      { pubkey: pumpEventAuthority(), isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });
}

export function collectCoinCreatorFeeIx(coinCreator: PublicKey): TransactionInstruction {
  const vaultAuthority = coinCreatorVaultAuthorityPda(coinCreator);
  return new TransactionInstruction({
    programId: PUMP_AMM_PROGRAM_ID,
    data: DISC_COLLECT_COIN_CREATOR_FEE,
    keys: [
      { pubkey: NATIVE_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: coinCreator, isSigner: false, isWritable: false },
      { pubkey: vaultAuthority, isSigner: false, isWritable: false },
      { pubkey: getAssociatedTokenAddressSync(NATIVE_MINT, vaultAuthority, true), isSigner: false, isWritable: true },
      { pubkey: getAssociatedTokenAddressSync(NATIVE_MINT, coinCreator, true), isSigner: false, isWritable: true },
      { pubkey: pumpAmmEventAuthority(), isSigner: false, isWritable: false },
      { pubkey: PUMP_AMM_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });
}

export function sweepPoolCreatorFeeIx(payer: PublicKey, mint: PublicKey, coinCreator: PublicKey): TransactionInstruction {
  const pool = canonicalPoolPda(mint);
  const recipient = coinCreatorVaultAuthorityPda(coinCreator);
  return new TransactionInstruction({
    programId: PUMP_AMM_PROGRAM_ID,
    data: DISC_SWEEP_CREATOR_FEE,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: pumpAmmGlobalConfig(), isSigner: false, isWritable: false },
      { pubkey: pool, isSigner: false, isWritable: true },
      { pubkey: NATIVE_MINT, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: getAssociatedTokenAddressSync(NATIVE_MINT, pool, true), isSigner: false, isWritable: true },
      { pubkey: recipient, isSigner: false, isWritable: false },
      { pubkey: getAssociatedTokenAddressSync(NATIVE_MINT, recipient, true), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: pumpAmmEventAuthority(), isSigner: false, isWritable: false },
      { pubkey: PUMP_AMM_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
  });
}

// ---------------------------------------------------------------------------
// High-level: collect everything into the keeper wallet
// ---------------------------------------------------------------------------

export interface CollectResult {
  lamports: bigint;
  signature: string | null;
  details: Record<string, unknown>;
}

/**
 * Collects pump.fun creator fees for `mint` into `keeper` (who must be the
 * coin creator) and returns the lamports gained. Builds, in one transaction:
 *   1. sweep_creator_fee on the bonding curve (when its creator bucket > 0)
 *   2. collect_creator_fee (lamport vault -> creator)
 *   3. after graduation: sweep_creator_fee on the canonical pool (bucket > 0),
 *      create creator WSOL ATA (idempotent), collect_coin_creator_fee,
 *      close the WSOL ATA to unwrap into SOL.
 * Returns 0 without sending when nothing is claimable.
 */
export async function collectCreatorFees(connection: Connection, keeper: Keypair, mint: PublicKey): Promise<CollectResult> {
  const creator = keeper.publicKey;
  const bondingCurve = bondingCurvePda(mint);
  const vault = creatorVaultPda(creator);
  const ammVaultAuth = coinCreatorVaultAuthorityPda(creator);
  const ammVaultAta = getAssociatedTokenAddressSync(NATIVE_MINT, ammVaultAuth, true);
  const creatorWsolAta = getAssociatedTokenAddressSync(NATIVE_MINT, creator, true);
  const pool = canonicalPoolPda(mint);

  const [bcInfo, vaultInfo, ammVaultAtaInfo, poolInfo, creatorWsolInfo] = await connection.getMultipleAccountsInfo([
    bondingCurve,
    vault,
    ammVaultAta,
    pool,
    creatorWsolAta,
  ]);

  const ixs: TransactionInstruction[] = [];
  const details: Record<string, unknown> = {};

  let bc: BondingCurveState | null = null;
  if (bcInfo) {
    bc = decodeBondingCurve(bcInfo.data);
    details.bondingCurveCreator = bc.creator.toBase58();
    details.bondingCurveComplete = bc.complete;
    if (!bc.creator.equals(creator)) {
      log("pumpfun: keeper is not the bonding-curve creator; fees would go to the creator wallet", {
        creator: bc.creator.toBase58(),
        keeper: creator.toBase58(),
      });
    }
    if (bc.creatorFeeBucket && bc.creatorFeeBucket > 0n) {
      ixs.push(sweepBondingCurveCreatorFeeIx(creator, mint, bc.creator));
      details.curveBucketLamports = bc.creatorFeeBucket.toString();
    }
  }

  // Lamport vault: only collect when above rent-exempt minimum (what is claimable).
  const rentMin = BigInt(await connection.getMinimumBalanceForRentExemption(0));
  const vaultLamports = BigInt(vaultInfo?.lamports ?? 0);
  const vaultClaimable = vaultLamports > rentMin ? vaultLamports - rentMin : 0n;
  details.curveVaultClaimable = vaultClaimable.toString();
  if (vaultClaimable > 0n || ixs.length > 0) ixs.push(collectCreatorFeeIx(creator));

  // PumpSwap leg (graduated coins).
  if (poolInfo) {
    const p = decodePool(poolInfo.data);
    details.poolCoinCreator = p.coinCreator.toBase58();
    const ammBucket = p.creatorFeesBucket ?? 0n;
    if (ammBucket > 0n) {
      ixs.push(sweepPoolCreatorFeeIx(creator, mint, p.coinCreator));
      details.poolBucketLamports = ammBucket.toString();
    }
    let ammVaultAmount = 0n;
    if (ammVaultAtaInfo && ammVaultAtaInfo.data.length >= 72) {
      ammVaultAmount = ammVaultAtaInfo.data.readBigUInt64LE(64);
    }
    details.ammVaultWsol = ammVaultAmount.toString();
    if ((ammVaultAmount > 0n || ammBucket > 0n) && p.coinCreator.equals(creator)) {
      if (!creatorWsolInfo) {
        ixs.push(createAssociatedTokenAccountIdempotentInstruction(creator, creatorWsolAta, creator, NATIVE_MINT));
      }
      ixs.push(collectCoinCreatorFeeIx(creator));
      ixs.push(createCloseAccountInstruction(creatorWsolAta, creator, creator));
    }
  }

  if (ixs.length === 0) {
    log("pumpfun: nothing to collect", details);
    return { lamports: 0n, signature: null, details };
  }

  const before = BigInt(await connection.getBalance(creator, "confirmed"));
  const tx = new Transaction().add(...ixs);
  tx.feePayer = creator;
  const signature = await sendAndConfirmTransaction(connection, tx, [keeper], { commitment: "confirmed" });
  const after = BigInt(await connection.getBalance(creator, "confirmed"));
  // Net of the tx fee; clamp at 0 if a sweep's rent cost exceeded the fees.
  const gained = after > before ? after - before : 0n;
  log("pumpfun: collected", { ...details, signature, lamports: gained.toString() });
  return { lamports: gained, signature, details };
}
