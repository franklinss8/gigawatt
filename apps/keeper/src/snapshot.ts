/**
 * GWATT holder snapshot.
 *
 * Sources (in order of preference):
 *   1. Helius DAS `getTokenAccounts` (paginated, cursor-based) when HELIUS_API_KEY
 *      is set — cheap for large holder sets.
 *   2. `getProgramAccounts` on the SPL Token program (dataSize 165, memcmp
 *      offset 0 = mint), with a Token-2022 fallback (same memcmp, no dataSize
 *      filter because extensions change the account size).
 *
 * Balances are aggregated per owner; EXCLUDED_ADDRESSES (owners or token
 * accounts, e.g. the pump.fun bonding curve and the PumpSwap pool) and zero
 * balances are dropped.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { log } from "./config.js";

export interface Holder {
  owner: string;
  amount: bigint;
}

export interface Snapshot {
  holders: Holder[];
  supply: bigint;
  count: number;
  slot: number;
  source: "helius" | "rpc";
}

export interface SnapshotOptions {
  excluded?: Set<string>;
  heliusApiKey?: string;
  cluster?: string;
}

const ACCOUNT_LEN = 165; // SPL token account size
const OFFSET_MINT = 0;
const OFFSET_OWNER = 32;
const OFFSET_AMOUNT = 64;

/** Raw (token account -> owner, amount) rows from `getProgramAccounts`. */
async function rpcTokenAccounts(connection: Connection, mint: PublicKey): Promise<{ address: string; owner: string; amount: bigint }[]> {
  const rows: { address: string; owner: string; amount: bigint }[] = [];
  const query = async (programId: PublicKey, withSize: boolean) => {
    const filters: ({ dataSize: number } | { memcmp: { offset: number; bytes: string } })[] = [
      { memcmp: { offset: OFFSET_MINT, bytes: mint.toBase58() } },
    ];
    if (withSize) filters.unshift({ dataSize: ACCOUNT_LEN });
    const accounts = await connection.getProgramAccounts(programId, { commitment: "confirmed", filters, encoding: "base64" });
    for (const { pubkey, account } of accounts) {
      const data = account.data;
      if (data.length < OFFSET_AMOUNT + 8) continue;
      rows.push({
        address: pubkey.toBase58(),
        owner: new PublicKey(data.subarray(OFFSET_OWNER, OFFSET_OWNER + 32)).toBase58(),
        amount: data.readBigUInt64LE(OFFSET_AMOUNT),
      });
    }
  };
  await query(TOKEN_PROGRAM_ID, true);
  // Token-2022 fallback: GWATT is a classic SPL mint, so this normally returns nothing.
  try {
    await query(TOKEN_2022_PROGRAM_ID, false);
  } catch (e) {
    log("snapshot: token-2022 query failed (ignored)", { error: String(e) });
  }
  return rows;
}

interface HeliusTokenAccount {
  address: string;
  mint: string;
  owner: string;
  amount: number | string;
  frozen: boolean;
}

/** Helius DAS getTokenAccounts, cursor-paginated. */
async function heliusTokenAccounts(
  apiKey: string,
  mint: PublicKey,
  cluster: string | undefined,
): Promise<{ address: string; owner: string; amount: bigint }[]> {
  const host = cluster === "devnet" ? "https://devnet.helius-rpc.com" : "https://mainnet.helius-rpc.com";
  const url = `${host}/?api-key=${apiKey}`;
  const rows: { address: string; owner: string; amount: bigint }[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10_000; page++) {
    const params: Record<string, unknown> = { mint: mint.toBase58(), limit: 1000, options: { showZeroBalance: false } };
    if (cursor) params.cursor = cursor;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "keeper", method: "getTokenAccounts", params }),
    });
    if (!res.ok) throw new Error(`Helius getTokenAccounts ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { result?: { token_accounts?: HeliusTokenAccount[]; cursor?: string }; error?: unknown };
    if (json.error) throw new Error(`Helius error: ${JSON.stringify(json.error)}`);
    const accounts = json.result?.token_accounts ?? [];
    for (const a of accounts) rows.push({ address: a.address, owner: a.owner, amount: BigInt(a.amount) });
    cursor = json.result?.cursor;
    if (!cursor || accounts.length === 0) break;
  }
  return rows;
}

export async function snapshotHolders(connection: Connection, mint: PublicKey, opts: SnapshotOptions = {}): Promise<Snapshot> {
  const excluded = opts.excluded ?? new Set<string>();
  const slot = await connection.getSlot("confirmed");

  let rows: { address: string; owner: string; amount: bigint }[];
  let source: Snapshot["source"] = "rpc";
  if (opts.heliusApiKey) {
    try {
      rows = await heliusTokenAccounts(opts.heliusApiKey, mint, opts.cluster);
      source = "helius";
    } catch (e) {
      log("snapshot: helius failed, falling back to getProgramAccounts", { error: String(e) });
      rows = await rpcTokenAccounts(connection, mint);
    }
  } else {
    rows = await rpcTokenAccounts(connection, mint);
  }

  const byOwner = new Map<string, bigint>();
  let excludedAmount = 0n;
  for (const r of rows) {
    if (r.amount === 0n) continue;
    if (excluded.has(r.owner) || excluded.has(r.address)) {
      excludedAmount += r.amount;
      continue;
    }
    byOwner.set(r.owner, (byOwner.get(r.owner) ?? 0n) + r.amount);
  }

  // Deterministic order: by amount desc, then owner asc — same list every run for the same state.
  const holders: Holder[] = [...byOwner.entries()]
    .map(([owner, amount]) => ({ owner, amount }))
    .sort((a, b) => (a.amount === b.amount ? a.owner.localeCompare(b.owner) : a.amount > b.amount ? -1 : 1));
  const supply = holders.reduce((s, h) => s + h.amount, 0n);

  log("snapshot: done", {
    source,
    slot,
    tokenAccounts: rows.length,
    holders: holders.length,
    supply: supply.toString(),
    excludedAmount: excludedAmount.toString(),
  });
  return { holders, supply, count: holders.length, slot, source };
}

// `pnpm snapshot` — print the holder list as JSON without flushing.
if (process.argv[1] && /snapshot\.ts$/.test(process.argv[1])) {
  const { loadEnv, makeConnection } = await import("./config.js");
  const env = loadEnv();
  const snap = await snapshotHolders(makeConnection(env), env.gwattMint, {
    excluded: env.excludedAddresses,
    heliusApiKey: env.heliusApiKey,
    cluster: env.cluster,
  });
  console.log(
    JSON.stringify(
      { ...snap, supply: snap.supply.toString(), holders: snap.holders.map((h) => ({ ...h, amount: h.amount.toString() })) },
      null,
      2,
    ),
  );
}
