/* Shared helpers for devnet scripts. Run with: pnpm exec tsx scripts/<name>.ts */
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getProgram } from "../packages/sdk/src/index.ts";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const KEYS_DIR = path.join(ROOT, "scripts", ".keys");
export const DEPLOYMENTS_DIR = path.join(ROOT, "deployments");
export const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";

export function loadOrCreateKeypair(name: string): Keypair {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
  const file = path.join(KEYS_DIR, `${name}.json`);
  if (fs.existsSync(file)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(file, "utf8"))));
  }
  const kp = Keypair.generate();
  fs.writeFileSync(file, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  console.log(`generated keypair ${name}: ${kp.publicKey.toBase58()}`);
  return kp;
}

export function connection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

export function providerFor(kp: Keypair): AnchorProvider {
  return new AnchorProvider(connection(), new Wallet(kp), { commitment: "confirmed" });
}

export function programFor(kp: Keypair) {
  return getProgram(providerFor(kp));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Airdrop with backoff. Returns true when the balance reaches `minSol`. */
export async function ensureFunded(
  conn: Connection,
  pubkey: PublicKey,
  minSol: number,
  opts: { attempts?: number; perAirdropSol?: number } = {},
): Promise<boolean> {
  const attempts = opts.attempts ?? 8;
  const per = opts.perAirdropSol ?? 1;
  for (let i = 0; i < attempts; i++) {
    const bal = (await conn.getBalance(pubkey)) / LAMPORTS_PER_SOL;
    if (bal >= minSol) return true;
    try {
      const sig = await conn.requestAirdrop(pubkey, per * LAMPORTS_PER_SOL);
      await conn.confirmTransaction(sig, "confirmed");
      console.log(`airdropped ${per} SOL to ${pubkey.toBase58()}`);
    } catch (e: any) {
      const wait = Math.min(60_000, 5_000 * 2 ** i);
      console.log(`airdrop attempt ${i + 1}/${attempts} failed (${e?.message ?? e}); retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  const bal = (await conn.getBalance(pubkey)) / LAMPORTS_PER_SOL;
  if (bal >= minSol) return true;
  console.log(
    `\n!! Could not airdrop. Fund ${pubkey.toBase58()} with at least ${minSol} SOL at https://faucet.solana.com (balance: ${bal} SOL)\n`,
  );
  return false;
}

export async function createMockMint(conn: Connection, payer: Keypair, decimals = 6): Promise<PublicKey> {
  return createMint(conn, payer, payer.publicKey, null, decimals);
}

/** Mint `amount` atoms of `mint` to `to` (creates the ATA if needed). Payer must be the mint authority. */
export async function mintMockTo(
  conn: Connection,
  payer: Keypair,
  mint: PublicKey,
  to: PublicKey,
  amount: bigint,
): Promise<PublicKey> {
  const ata = await getOrCreateAssociatedTokenAccount(conn, payer, mint, to, true);
  await mintTo(conn, payer, mint, ata.address, payer, amount);
  return ata.address;
}

export interface Deployment {
  cluster: string;
  rpcUrl: string;
  programId: string;
  deployer: string;
  admin: string;
  keeper: string;
  treasury: string;
  fundingWallet: string;
  config: string;
  gwattMint: string;
  wattMint: string;
  usdcMint: string;
  rewardsVault: string;
  testHolders: string[];
  params: Record<string, number | string>;
  initializeSig?: string;
  createdAt: string;
}

export function readDeployment(): Deployment {
  const file = path.join(DEPLOYMENTS_DIR, "devnet.json");
  if (!fs.existsSync(file)) throw new Error(`missing ${file}: run scripts/devnet-bootstrap.ts first`);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  console.log(`wrote ${path.relative(ROOT, file)}`);
}
