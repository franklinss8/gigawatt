/**
 * Devnet bootstrap:
 *  1. load/generate keypairs in scripts/.keys (deployer=admin, keeper, treasury, funding, holder-1..3)
 *  2. airdrop devnet SOL (with retries)
 *  3. create mock GWATT mint (6 dec), mint 1,000,000,000 GWATT to deployer, spread some to 3 holders
 *  4. create mock USDC mint (6 dec)
 *  5. call `initialize`
 *  6. write deployments/devnet.json + print NEXT_PUBLIC_* env lines
 *
 * Run: pnpm exec tsx scripts/devnet-bootstrap.ts
 */
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";
import {
  findConfig,
  findWattMint,
  rewardsVault,
  initialize,
  fetchConfigNullable,
  PROGRAM_ID,
} from "../packages/sdk/src/index.ts";
import {
  DEPLOYMENTS_DIR,
  RPC_URL,
  connection,
  createMockMint,
  ensureFunded,
  loadOrCreateKeypair,
  mintMockTo,
  programFor,
  writeJson,
  type Deployment,
} from "./lib.ts";

const PARAMS = {
  purchaseFeeBps: 500,
  activationFeeBps: 500,
  buyerFeeBps: 100,
  treasuryShareBps: 2000,
  flushInterval: Number(process.env.FLUSH_INTERVAL ?? 60), // seconds; keep short on devnet for testing
  minFlushUsdc: 0,
};

const GWATT_TOTAL = 1_000_000_000n * 1_000_000n; // 1e9 GWATT, 6 decimals
const HOLDER_GWATT = [50_000_000n, 30_000_000n, 20_000_000n].map((n) => n * 1_000_000n);

async function main() {
  const conn = connection();
  const deployer = loadOrCreateKeypair("deployer");
  const keeper = loadOrCreateKeypair("keeper");
  const treasury = loadOrCreateKeypair("treasury");
  const funding = loadOrCreateKeypair("funding");
  const holders = [1, 2, 3].map((i) => loadOrCreateKeypair(`holder-${i}`));

  console.log(`rpc       ${RPC_URL}`);
  console.log(`program   ${PROGRAM_ID.toBase58()}`);
  console.log(`deployer  ${deployer.publicKey.toBase58()}`);
  console.log(`keeper    ${keeper.publicKey.toBase58()}`);

  const programInfo = await conn.getAccountInfo(PROGRAM_ID);
  if (!programInfo?.executable) {
    throw new Error(
      `program ${PROGRAM_ID.toBase58()} is not deployed on ${RPC_URL}. Run: anchor deploy --provider.cluster devnet`,
    );
  }

  if (!(await ensureFunded(conn, deployer.publicKey, 1.5))) process.exit(1);
  // Keeper needs a little SOL to pay for Flush accounts; holders for claim rent.
  for (const kp of [keeper, ...holders]) {
    const bal = await conn.getBalance(kp.publicKey);
    if (bal < 0.05 * LAMPORTS_PER_SOL) {
      const { SystemProgram, Transaction, sendAndConfirmTransaction } = await import("@solana/web3.js");
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: deployer.publicKey,
          toPubkey: kp.publicKey,
          lamports: 0.1 * LAMPORTS_PER_SOL,
        }),
      );
      await sendAndConfirmTransaction(conn, tx, [deployer]);
      console.log(`sent 0.1 SOL to ${kp.publicKey.toBase58()}`);
    }
  }

  // Mock GWATT
  const existing = (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(DEPLOYMENTS_DIR, "devnet.json"), "utf8")) as Deployment;
    } catch {
      return null;
    }
  })();

  let gwattMint: PublicKey;
  let usdcMint: PublicKey;
  if (existing?.gwattMint && existing?.usdcMint && (await conn.getAccountInfo(new PublicKey(existing.gwattMint)))) {
    gwattMint = new PublicKey(existing.gwattMint);
    usdcMint = new PublicKey(existing.usdcMint);
    console.log(`reusing mocks GWATT=${gwattMint.toBase58()} USDC=${usdcMint.toBase58()}`);
  } else {
    gwattMint = await createMockMint(conn, deployer, 6);
    console.log(`mock GWATT mint ${gwattMint.toBase58()}`);
    await mintMockTo(conn, deployer, gwattMint, deployer.publicKey, GWATT_TOTAL);
    console.log(`minted 1,000,000,000 GWATT to deployer`);
    // Spread to holders (mint authority is deployer, so simply mint extra to them: same economic effect for a mock).
    for (let i = 0; i < holders.length; i++) {
      await mintMockTo(conn, deployer, gwattMint, holders[i].publicKey, HOLDER_GWATT[i]);
      console.log(`holder-${i + 1} ${holders[i].publicKey.toBase58()} ← ${HOLDER_GWATT[i] / 1_000_000n} GWATT`);
    }
    usdcMint = await createMockMint(conn, deployer, 6);
    console.log(`mock USDC mint ${usdcMint.toBase58()}`);
  }

  // Initialize
  const program = programFor(deployer);
  const [config] = findConfig();
  const [wattMint] = findWattMint();
  let initializeSig = existing?.initializeSig;
  const cfg = await fetchConfigNullable(program);
  if (cfg) {
    console.log(`config already initialized (watt_mint=${cfg.wattMint.toBase58()})`);
  } else {
    const ix = await initialize(program, {
      admin: deployer.publicKey,
      gwattMint,
      usdcMint,
      params: {
        keeper: keeper.publicKey,
        treasury: treasury.publicKey,
        fundingWallet: funding.publicKey,
        ...PARAMS,
      },
    });
    const { Transaction, sendAndConfirmTransaction } = await import("@solana/web3.js");
    initializeSig = await sendAndConfirmTransaction(conn, new Transaction().add(ix), [deployer]);
    console.log(`initialize ✓ ${initializeSig}`);
  }

  const deployment: Deployment = {
    cluster: "devnet",
    rpcUrl: RPC_URL,
    programId: PROGRAM_ID.toBase58(),
    deployer: deployer.publicKey.toBase58(),
    admin: deployer.publicKey.toBase58(),
    keeper: keeper.publicKey.toBase58(),
    treasury: treasury.publicKey.toBase58(),
    fundingWallet: funding.publicKey.toBase58(),
    config: config.toBase58(),
    gwattMint: gwattMint.toBase58(),
    wattMint: wattMint.toBase58(),
    usdcMint: usdcMint.toBase58(),
    rewardsVault: rewardsVault(wattMint).toBase58(),
    testHolders: holders.map((h) => h.publicKey.toBase58()),
    params: PARAMS,
    initializeSig,
    createdAt: new Date().toISOString(),
  };
  writeJson(path.join(DEPLOYMENTS_DIR, "devnet.json"), deployment);

  console.log(`
# ---- apps/web .env (SPEC §5) ----
NEXT_PUBLIC_RPC_URL=${RPC_URL}
NEXT_PUBLIC_CLUSTER=devnet
NEXT_PUBLIC_PROGRAM_ID=${deployment.programId}
NEXT_PUBLIC_GWATT_MINT=${deployment.gwattMint}
NEXT_PUBLIC_WATT_MINT=${deployment.wattMint}
NEXT_PUBLIC_USDC_MINT=${deployment.usdcMint}
# ---- apps/keeper ----
RPC_URL=${RPC_URL}
KEEPER_KEYPAIR=<contents of scripts/.keys/keeper.json>
MOCK_FEES=1
EXCLUDED_ADDRESSES=${deployment.deployer}
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
