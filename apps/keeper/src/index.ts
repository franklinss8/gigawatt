/**
 * Gigawatt keeper — one run = one flush attempt (SPEC §3).
 *
 *   1. read Config; skip unless flush_interval has elapsed since last_flush_ts
 *   2. collect pump.fun creator fees (SOL)            [MOCK_FEES=1 on devnet]
 *   3. swap SOL -> USDC via Jupiter                   [MOCK_SWAP=1 on devnet]
 *   4. split USDC: treasury_share_bps -> treasury, rest -> funding wallet
 *   5. snapshot GWATT holders, build merkle tree
 *   6. send `flush`, POST to ${WEB_URL}/api/internal/flush
 *
 * Exits 0 on skip/success, 1 on error. Prints one JSON summary line at the end.
 */
import { loadEnv, log, makeConnection } from "./config.js";
import { collectCreatorFees } from "./pumpfun.js";
import { swapSolToUsdc } from "./swap.js";
import { snapshotHolders } from "./snapshot.js";
import { indexFlush, runFlush, splitUsdc } from "./flush.js";
import { decodeConfig, findConfig } from "./sdk.js";

async function main(): Promise<void> {
  const env = loadEnv();
  const connection = makeConnection(env);
  const keeperPk = env.keeper.publicKey;
  log("keeper: start", {
    cluster: env.cluster,
    rpc: env.rpcUrl,
    keeper: keeperPk.toBase58(),
    programId: env.programId.toBase58(),
    gwattMint: env.gwattMint.toBase58(),
    mockFees: env.mockFees,
    mockSwap: env.mockSwap,
    dryRun: env.dryRun,
  });

  // 1. Config
  const [configPda] = findConfig(env.programId);
  const configInfo = await connection.getAccountInfo(configPda, "confirmed");
  if (!configInfo) throw new Error(`Config account ${configPda.toBase58()} not found (program not initialized?)`);
  const config = decodeConfig(configInfo.data);
  if (!config.keeper.equals(keeperPk)) {
    throw new Error(`Config.keeper is ${config.keeper.toBase58()}, but KEEPER_KEYPAIR is ${keeperPk.toBase58()}`);
  }
  if (!config.gwattMint.equals(env.gwattMint)) {
    log("keeper: warning, NEXT_PUBLIC_GWATT_MINT differs from Config.gwatt_mint; using on-chain value", {
      env: env.gwattMint.toBase58(),
      chain: config.gwattMint.toBase58(),
    });
    env.gwattMint = config.gwattMint;
  }
  if (!config.usdcMint.equals(env.usdcMint)) {
    log("keeper: warning, NEXT_PUBLIC_USDC_MINT differs from Config.usdc_mint; using on-chain value", {
      env: env.usdcMint.toBase58(),
      chain: config.usdcMint.toBase58(),
    });
    env.usdcMint = config.usdcMint;
  }

  const now = BigInt(Math.floor(Date.now() / 1000));
  const nextAllowed = config.lastFlushTs + config.flushInterval;
  if (!env.force && now < nextAllowed) {
    const summary = {
      status: "skipped",
      reason: "interval not elapsed",
      lastFlushTs: config.lastFlushTs.toString(),
      flushInterval: config.flushInterval.toString(),
      nextAllowedTs: nextAllowed.toString(),
      inSeconds: (nextAllowed - now).toString(),
      flushCount: config.flushCount.toString(),
    };
    console.log(JSON.stringify({ summary }));
    return;
  }

  // 2. Creator fees
  let solCollected: bigint;
  let collectSig: string | null = null;
  if (env.mockFees) {
    solCollected = env.mockFeesLamports;
    log("fees: MOCK_FEES, using MOCK_FEES_LAMPORTS", { lamports: solCollected.toString() });
  } else {
    const r = await collectCreatorFees(connection, env.keeper, env.gwattMint);
    solCollected = r.lamports;
    collectSig = r.signature;
  }

  // 3. Swap
  const swap = await swapSolToUsdc(connection, env, solCollected);
  const usdcReceived = swap.usdcReceived;

  if (usdcReceived < config.minFlushUsdc) {
    const summary = {
      status: "skipped",
      reason: "below min_flush_usdc",
      solCollected: solCollected.toString(),
      usdcReceived: usdcReceived.toString(),
      minFlushUsdc: config.minFlushUsdc.toString(),
      collectSig,
      swapSig: swap.signature,
      note: "USDC stays in the keeper wallet and is included in the next flush",
    };
    console.log(JSON.stringify({ summary }));
    return;
  }

  // 4. Split
  const split = await splitUsdc(connection, env, config, usdcReceived);

  // 5. Snapshot
  const snapshot = await snapshotHolders(connection, env.gwattMint, {
    excluded: env.excludedAddresses,
    heliusApiKey: env.heliusApiKey,
    cluster: env.cluster,
  });
  if (snapshot.count === 0) throw new Error("snapshot returned no eligible holders; refusing to flush");

  // 6. Flush + index
  const payload = await runFlush(connection, env, { solCollected, usdcReceived, snapshot, config, configPda }, split);
  await indexFlush(env, payload);

  const summary = {
    status: env.dryRun ? "dry-run" : "flushed",
    index: payload.index,
    sig: payload.sig,
    slot: payload.slot,
    ts: payload.ts,
    sol_collected: payload.sol_collected,
    usdc_received: payload.usdc_received,
    usdc_to_treasury: payload.usdc_to_treasury,
    usdc_to_funding: payload.usdc_to_funding,
    watt_for_holders: payload.watt_for_holders,
    merkle_root: payload.merkle_root,
    holder_supply: payload.holder_supply,
    holder_count: payload.holder_count,
    leaves: payload.holders.length,
    snapshotSource: snapshot.source,
    swapMode: swap.mode,
    collectSig,
    swapSig: swap.signature,
    splitSig: split.signature,
  };
  console.log(JSON.stringify({ summary }));
}

main().catch((e) => {
  console.error(JSON.stringify({ summary: { status: "error", error: e instanceof Error ? e.message : String(e) } }));
  if (e instanceof Error && e.stack) console.error(e.stack);
  process.exit(1);
});
