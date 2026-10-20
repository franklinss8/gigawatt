# Gigawatt keeper

Hourly job that turns GWATT pump.fun creator fees into WATT rewards for holders
(SPEC §3). One run = one flush attempt:

1. Read on-chain `Config`; exit early if `flush_interval` has not elapsed since `last_flush_ts`.
2. Collect pump.fun creator fees for the GWATT mint (SOL) — `MOCK_FEES=1` on devnet.
3. Swap SOL → USDC via Jupiter — mocked on devnet (mints fake USDC).
4. Split USDC: `treasury_share_bps` → treasury ATA, rest → funding-wallet ATA (ATAs created if missing).
5. Snapshot GWATT holders (excluding `EXCLUDED_ADDRESSES` and zero balances), build the merkle tree
   (`amount_i = floor(watt_for_holders × balance_i / supply)`, `watt_for_holders = usdc_to_funding`).
6. Send `flush(...)`, then `POST ${WEB_URL}/api/internal/flush` (header `x-keeper-secret`) with the
   flush row and every holder's `{wallet, amount, proof}`.

The last line of stdout is a JSON `{"summary": {...}}` (`status`: `flushed` | `skipped` | `dry-run` | `error`).
Exit code 1 on error, 0 otherwise.

## Run

```bash
cp .env.example .env      # fill it in
pnpm install
pnpm start                # one flush attempt
pnpm snapshot             # print the holder snapshot only, no tx
pnpm typecheck
```

Useful switches: `DRY_RUN=1` (compute + log, send nothing), `FORCE_FLUSH=1` (ignore the interval).

## Environment

| Var | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_CLUSTER` | yes | `devnet` or `mainnet-beta`. Mocks default on unless mainnet. |
| `RPC_URL` / `NEXT_PUBLIC_RPC_URL` | yes | RPC endpoint (needs `getProgramAccounts` unless `HELIUS_API_KEY` is set). |
| `NEXT_PUBLIC_PROGRAM_ID` | yes | Gigawatt program id. |
| `NEXT_PUBLIC_GWATT_MINT`, `NEXT_PUBLIC_USDC_MINT` | yes | Cross-checked against `Config`; on-chain value wins. |
| `NEXT_PUBLIC_WATT_MINT` | no | Informational; the keeper reads `Config.watt_mint`. |
| `KEEPER_KEYPAIR` | yes | JSON byte array, base58 secret or path to a `.json`. Must equal `Config.keeper`. On mainnet it must be the pump.fun **creator** of GWATT (fees are paid to the creator wallet). |
| `WEB_URL`, `KEEPER_SECRET` | yes | Indexer endpoint + shared secret. |
| `EXCLUDED_ADDRESSES` | yes | Comma list of owners *or* token accounts: pump.fun bonding curve, PumpSwap pool, treasury, funding wallet, etc. |
| `HELIUS_API_KEY` | no | Use Helius DAS `getTokenAccounts` (paginated) instead of `getProgramAccounts`. |
| `MOCK_FEES`, `MOCK_FEES_LAMPORTS` | devnet | Skip pump.fun; pretend `MOCK_FEES_LAMPORTS` (default 0.05 SOL) were collected. |
| `MOCK_SWAP`, `MOCK_USDC_AUTHORITY_KEYPAIR`, `MOCK_SOL_PRICE_USD` | devnet | Mint `lamports × price` of mock USDC to the keeper instead of swapping (refused on mainnet). |
| `JUP_API`, `JUPITER_API_KEY`, `JUP_SLIPPAGE_BPS` | mainnet | Jupiter base URL (default `https://api.jup.ag/swap/v2`); a base ending in `/swap/v1` uses the legacy `/quote` + `/swap` flow. |
| `DRY_RUN`, `FORCE_FLUSH` | no | See above. |

## Cron

### crontab (any VPS)

```cron
# hourly at :07, log to a file, keep the last run's output
7 * * * * cd /srv/gigawatt/apps/keeper && /usr/bin/env -S bash -lc 'pnpm start' >> /var/log/gigawatt-keeper.log 2>&1
```

The keeper is idempotent at the hour level: if the interval has not elapsed it exits with
`status: "skipped"`, so running it more often than `flush_interval` is harmless.

### GitHub Actions

`.github/workflows/keeper.yml` (repo root) runs hourly and on manual dispatch (with `force` /
`dry_run` toggles). Configure in repo settings:

- **Secrets**: `RPC_URL`, `KEEPER_KEYPAIR`, `KEEPER_SECRET`, `HELIUS_API_KEY`, `JUPITER_API_KEY`,
  `MOCK_USDC_AUTHORITY_KEYPAIR` (devnet only).
- **Variables**: `CLUSTER`, `PROGRAM_ID`, `GWATT_MINT`, `WATT_MINT`, `USDC_MINT`, `WEB_URL`,
  `EXCLUDED_ADDRESSES`, `MOCK_FEES`, `MOCK_SWAP`, `MOCK_SOL_PRICE_USD`, `JUP_API`.

Note: GitHub schedules can be delayed by several minutes under load and are disabled after 60 days of
repo inactivity on public repos; for mainnet prefer a VPS cron or a dedicated scheduler.

### Vercel cron alternative

Vercel Cron Jobs can hit an HTTP route on a schedule but each invocation is bounded by the function's
max duration (and Hobby plans only allow daily crons). The pattern is: add a `GET /api/cron/keeper`
route in `apps/web` that re-exports the pipeline from this package (it is plain TypeScript with no
process-level state), guarded by the `CRON_SECRET` header Vercel sends, and declare in `vercel.json`:

```json
{ "crons": [{ "path": "/api/cron/keeper", "schedule": "7 * * * *" }] }
```

Keep in mind `getProgramAccounts` over a large holder set plus two or three confirmed transactions can
exceed serverless limits; set `HELIUS_API_KEY` and a Pro/Enterprise plan `maxDuration` if you go that way.

## pump.fun fee collection (mainnet)

`src/pumpfun.ts` builds, in one transaction signed by the keeper (= creator):

| Program | Instruction | Discriminator | When |
|---|---|---|---|
| pump `6EF8rr…F6P` | `sweep_creator_fee` | `[32,246,191,52,8,201,73,186]` | `BondingCurve.creator_fee` bucket > 0 (v3 trades leave fees on the curve) |
| pump | `collect_creator_fee` | `[20,22,86,123,198,28,219,132]` | lamports in `["creator-vault", creator]` above rent |
| pump-amm `pAMMBay6…XEA` | `sweep_creator_fee` | `[32,246,191,52,8,201,73,186]` | `Pool.creator_fees` bucket > 0 on the canonical pool |
| pump-amm | `collect_coin_creator_fee` | `[160,57,89,42,181,139,43,66]` | WSOL in `ATA(["creator_vault", creator], WSOL)`; the keeper creates its own WSOL ATA (idempotent) and closes it afterwards to unwrap |

Sources: `idl/pump.json` and `idl/pump_amm.json` in `github.com/pump-fun/pump-public-docs`,
`@pump-fun/pump-sdk@4.2.0` (`collectCoinCreatorFeeInstructions`, `sweepCreatorFeeInstruction`,
`sweepPoolCreatorFeeInstruction`) and `@pump-fun/pump-swap-sdk@2.2.0` (`collectCoinCreatorFee`).
The canonical pool is `PDA_amm["pool", u16 0, PDA_pump["pool-authority", mint], mint, WSOL]`.

## SDK

`src/sdk.ts` is the single import point for the on-chain SDK. Until `packages/sdk` (`@gigawatt/sdk`)
is published in the workspace it re-exports `src/sdk-stub.ts` (same merkle hashing as SPEC §2, PDAs,
`Config` decoder, `flush` instruction builder). See the `// TODO sdk` comments.
