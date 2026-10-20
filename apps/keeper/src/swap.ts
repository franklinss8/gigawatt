/**
 * SOL -> USDC swap.
 *
 * Mainnet: Jupiter Swap API v2 (developers.jup.ag/docs/swap, verified 2026-10-20):
 *   GET  {JUP_API}/order?inputMint=&outputMint=&amount=&taker=&slippageBps=
 *        -> { transaction: base64 | null | "", requestId, inAmount, outAmount,
 *             lastValidBlockHeight, errorCode?, errorMessage? }
 *   POST {JUP_API}/execute  { signedTransaction: base64, requestId }
 *        -> { status: "Success"|"Failed", signature, code, totalOutputAmount, error? }
 *   Header `x-api-key` optional (keyless = 0.5 req/s). Default JUP_API is
 *   https://api.jup.ag/swap/v2. The v1 `/quote` + `/swap` flow
 *   (https://api.jup.ag/swap/v1, lite-api.jup.ag/swap/v1) is marked superseded
 *   but still served; set JUP_API to a v1 base to use it (auto-detected).
 *
 * Devnet / MOCK_SWAP=1: no Jupiter. We mint mock USDC to the keeper's ATA with
 * the mock USDC mint authority (MOCK_USDC_AUTHORITY_KEYPAIR) at a fixed
 * MOCK_SOL_PRICE_USD, so the rest of the pipeline is exercised end to end.
 */
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  NATIVE_MINT,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import type { KeeperEnv } from "./config.js";
import { log } from "./config.js";

export interface SwapResult {
  usdcReceived: bigint;
  signature: string | null;
  mode: "jupiter-v2" | "jupiter-v1" | "mock";
}

async function usdcBalance(connection: Connection, owner: PublicKey, usdcMint: PublicKey): Promise<bigint> {
  const ata = getAssociatedTokenAddressSync(usdcMint, owner, true);
  try {
    return (await getAccount(connection, ata, "confirmed")).amount;
  } catch {
    return 0n;
  }
}

export async function swapSolToUsdc(connection: Connection, env: KeeperEnv, lamports: bigint): Promise<SwapResult> {
  if (lamports <= 0n) return { usdcReceived: 0n, signature: null, mode: env.mockSwap ? "mock" : "jupiter-v2" };
  if (env.mockSwap) return mockSwap(connection, env, lamports);
  if (/\/swap\/v1$/.test(env.jupApi)) return jupiterV1(connection, env, lamports);
  return jupiterV2(connection, env, lamports);
}

// ---------------------------------------------------------------------------
// Mock (devnet)
// ---------------------------------------------------------------------------

async function mockSwap(connection: Connection, env: KeeperEnv, lamports: bigint): Promise<SwapResult> {
  if (env.cluster === "mainnet-beta") throw new Error("MOCK_SWAP is not allowed on mainnet");
  const authority = env.mockUsdcAuthorityKeypair;
  if (!authority) throw new Error("MOCK_SWAP requires MOCK_USDC_AUTHORITY_KEYPAIR (devnet mock USDC mint authority)");
  // usdc atoms = lamports / 1e9 * price * 1e6
  const priceMicro = BigInt(Math.round(env.mockSolPriceUsd * 1_000_000));
  const usdc = (lamports * priceMicro) / BigInt(LAMPORTS_PER_SOL);
  const ata = getAssociatedTokenAddressSync(env.usdcMint, env.keeper.publicKey, true);
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(env.keeper.publicKey, ata, env.keeper.publicKey, env.usdcMint),
    createMintToInstruction(env.usdcMint, ata, authority.publicKey, usdc),
  );
  tx.feePayer = env.keeper.publicKey;
  const signature = await sendAndConfirmTransaction(connection, tx, [env.keeper, authority], { commitment: "confirmed" });
  log("swap: mock USDC minted", { lamports: lamports.toString(), usdc: usdc.toString(), price: env.mockSolPriceUsd, signature });
  return { usdcReceived: usdc, signature, mode: "mock" };
}

// ---------------------------------------------------------------------------
// Jupiter v2 (/order + /execute)
// ---------------------------------------------------------------------------

function jupHeaders(env: KeeperEnv, json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h["Content-Type"] = "application/json";
  if (env.jupApiKey) h["x-api-key"] = env.jupApiKey;
  return h;
}

interface JupOrder {
  transaction: string | null;
  requestId: string;
  inAmount: string;
  outAmount: string;
  lastValidBlockHeight?: number;
  errorCode?: string;
  errorMessage?: string;
}

async function jupiterV2(connection: Connection, env: KeeperEnv, lamports: bigint): Promise<SwapResult> {
  const params = new URLSearchParams({
    inputMint: NATIVE_MINT.toBase58(),
    outputMint: env.usdcMint.toBase58(),
    amount: lamports.toString(),
    taker: env.keeper.publicKey.toBase58(),
    slippageBps: String(env.jupSlippageBps),
  });
  const orderRes = await fetch(`${env.jupApi}/order?${params}`, { headers: jupHeaders(env) });
  if (!orderRes.ok) throw new Error(`Jupiter /order ${orderRes.status}: ${await orderRes.text()}`);
  const order = (await orderRes.json()) as JupOrder;
  if (!order.transaction) throw new Error(`Jupiter /order: no transaction (${order.errorCode ?? "?"}: ${order.errorMessage ?? "?"})`);

  const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, "base64"));
  tx.sign([env.keeper]);
  const signedTransaction = Buffer.from(tx.serialize()).toString("base64");

  const before = await usdcBalance(connection, env.keeper.publicKey, env.usdcMint);
  const execRes = await fetch(`${env.jupApi}/execute`, {
    method: "POST",
    headers: jupHeaders(env, true),
    body: JSON.stringify({ signedTransaction, requestId: order.requestId }),
  });
  if (!execRes.ok) throw new Error(`Jupiter /execute ${execRes.status}: ${await execRes.text()}`);
  const exec = (await execRes.json()) as { status: string; signature?: string; totalOutputAmount?: string; error?: string; code?: number };
  if (exec.status !== "Success") throw new Error(`Jupiter execute failed: ${exec.error ?? exec.code} sig=${exec.signature ?? "-"}`);

  const after = await usdcBalance(connection, env.keeper.publicKey, env.usdcMint);
  const usdcReceived = after > before ? after - before : BigInt(exec.totalOutputAmount ?? order.outAmount);
  log("swap: jupiter v2 done", { lamports: lamports.toString(), usdc: usdcReceived.toString(), signature: exec.signature });
  return { usdcReceived, signature: exec.signature ?? null, mode: "jupiter-v2" };
}

// ---------------------------------------------------------------------------
// Jupiter v1 (/quote + /swap) — legacy path, kept for lite-api.jup.ag/swap/v1
// ---------------------------------------------------------------------------

async function jupiterV1(connection: Connection, env: KeeperEnv, lamports: bigint): Promise<SwapResult> {
  const q = new URLSearchParams({
    inputMint: NATIVE_MINT.toBase58(),
    outputMint: env.usdcMint.toBase58(),
    amount: lamports.toString(),
    slippageBps: String(env.jupSlippageBps),
    restrictIntermediateTokens: "true",
  });
  const quoteRes = await fetch(`${env.jupApi}/quote?${q}`, { headers: jupHeaders(env) });
  if (!quoteRes.ok) throw new Error(`Jupiter /quote ${quoteRes.status}: ${await quoteRes.text()}`);
  const quoteResponse = (await quoteRes.json()) as { outAmount: string };

  const swapRes = await fetch(`${env.jupApi}/swap`, {
    method: "POST",
    headers: jupHeaders(env, true),
    body: JSON.stringify({
      quoteResponse,
      userPublicKey: env.keeper.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      dynamicSlippage: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 1_000_000, priorityLevel: "high" } },
    }),
  });
  if (!swapRes.ok) throw new Error(`Jupiter /swap ${swapRes.status}: ${await swapRes.text()}`);
  const { swapTransaction, lastValidBlockHeight } = (await swapRes.json()) as { swapTransaction: string; lastValidBlockHeight: number };

  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
  tx.sign([env.keeper]);
  const before = await usdcBalance(connection, env.keeper.publicKey, env.usdcMint);
  const signature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  const blockhash = tx.message.recentBlockhash;
  await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  const after = await usdcBalance(connection, env.keeper.publicKey, env.usdcMint);
  const usdcReceived = after > before ? after - before : BigInt(quoteResponse.outAmount);
  log("swap: jupiter v1 done", { lamports: lamports.toString(), usdc: usdcReceived.toString(), signature });
  return { usdcReceived, signature, mode: "jupiter-v1" };
}
