import "dotenv/config";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync } from "node:fs";

/** Keeper runtime configuration, read once from the environment (SPEC §5). */
export interface KeeperEnv {
  rpcUrl: string;
  cluster: "devnet" | "mainnet-beta" | "localnet";
  programId: PublicKey;
  gwattMint: PublicKey;
  usdcMint: PublicKey;
  keeper: Keypair;
  webUrl: string;
  keeperSecret: string;
  excludedAddresses: Set<string>;
  mockFees: boolean;
  mockFeesLamports: bigint;
  mockSwap: boolean;
  mockSolPriceUsd: number;
  mockUsdcAuthorityKeypair: Keypair | null;
  jupApi: string;
  jupApiKey: string | undefined;
  jupSlippageBps: number;
  heliusApiKey: string | undefined;
  /** Dry run: do everything except sending the flush tx / POST. */
  dryRun: boolean;
  /** Ignore the flush interval check (manual run). */
  force: boolean;
}

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing env ${name}`);
  return v;
}

/** Accepts a JSON byte array, a base58 secret, or a path to a keypair .json file. */
export function parseKeypair(raw: string): Keypair {
  const s = raw.trim();
  if (s.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(s) as number[]));
  if (s.endsWith(".json")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(s, "utf8")) as number[]));
  }
  return Keypair.fromSecretKey(bs58.decode(s));
}

export function loadEnv(): KeeperEnv {
  const cluster = (process.env.NEXT_PUBLIC_CLUSTER ?? process.env.CLUSTER ?? "devnet") as KeeperEnv["cluster"];
  const rpcUrl = process.env.RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
  const mockFees = process.env.MOCK_FEES === "1" || process.env.MOCK_FEES === "true";
  const mockSwap =
    process.env.MOCK_SWAP === "1" || process.env.MOCK_SWAP === "true" || (process.env.MOCK_SWAP === undefined && cluster !== "mainnet-beta");
  const mockAuthRaw = process.env.MOCK_USDC_AUTHORITY_KEYPAIR;

  return {
    rpcUrl,
    cluster,
    programId: new PublicKey(req("NEXT_PUBLIC_PROGRAM_ID", process.env.PROGRAM_ID)),
    gwattMint: new PublicKey(req("NEXT_PUBLIC_GWATT_MINT", process.env.GWATT_MINT)),
    usdcMint: new PublicKey(req("NEXT_PUBLIC_USDC_MINT", process.env.USDC_MINT)),
    keeper: parseKeypair(req("KEEPER_KEYPAIR")),
    webUrl: (process.env.WEB_URL ?? "http://localhost:3000").replace(/\/$/, ""),
    keeperSecret: req("KEEPER_SECRET", "dev-secret"),
    excludedAddresses: new Set(
      (process.env.EXCLUDED_ADDRESSES ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
    mockFees,
    mockFeesLamports: BigInt(process.env.MOCK_FEES_LAMPORTS ?? "50000000"), // 0.05 SOL
    mockSwap,
    mockSolPriceUsd: Number(process.env.MOCK_SOL_PRICE_USD ?? "150"),
    mockUsdcAuthorityKeypair: mockAuthRaw ? parseKeypair(mockAuthRaw) : null,
    jupApi: (process.env.JUP_API ?? "https://api.jup.ag/swap/v2").replace(/\/$/, ""),
    jupApiKey: process.env.JUPITER_API_KEY || undefined,
    jupSlippageBps: Number(process.env.JUP_SLIPPAGE_BPS ?? "100"),
    heliusApiKey: process.env.HELIUS_API_KEY || undefined,
    dryRun: process.env.DRY_RUN === "1",
    force: process.env.FORCE_FLUSH === "1",
  };
}

export function makeConnection(env: KeeperEnv): Connection {
  return new Connection(env.rpcUrl, { commitment: "confirmed" });
}

export const log = (msg: string, extra?: Record<string, unknown>) => {
  // One JSON line per event: easy to grep in cron / GitHub Actions logs.
  console.log(JSON.stringify({ ts: new Date().toISOString(), msg, ...extra }));
};
