# Gigawatt — spec commune

> "Hold the token. Own the compute." — port Solana / pump.fun du mécanisme de Deference.
> Marque : **Gigawatt**. Token de lancement : **GWATT** (token pump.fun, SPL classique, 6 décimales, mint fixé en config).
> Token de crédit : **WATT** (SPL, 6 décimales, adossé 1:1 à l'USDC dans un *funding wallet*, mint authority = PDA `config`).
> Clés API : préfixe `sk-gw-`.

Toutes les valeurs en *atoms* (6 décimales) côté chaîne. Les bps : 500 = 5 %.

## 1. Économie

| Flux | Règle |
|---|---|
| Achat WATT | L'utilisateur paie N USDC → `purchase_fee_bps` (500) vers `treasury_usdc`, le reste vers `funding_usdc`, et il reçoit (N − fee) WATT fraîchement mintés. |
| Activation | Brûle `amount` WATT (moins `activation_fee_bps` envoyé au `treasury_watt`) → crédit dollars off-chain = `net / 1e6` $. Irréversible. |
| Rewards | Les *creator fees* pump.fun du GWATT (SOL) sont collectées par le keeper → swap USDC → `treasury_share_bps` vers treasury, le reste vers funding wallet → même quantité de WATT mintée dans `rewards_vault` → un `Flush` est enregistré avec la racine Merkle des holders GWATT (snapshot au moment du flush). Chaque holder non exclu reçoit `watt_for_holders × balance / supply_comptée`. |
| Claim | Preuve Merkle → WATT transféré du `rewards_vault` au wallet (`claim`) ou activé directement (`claim_and_activate`). Rien n'expire. |
| Order book | Asks on-chain : vendeur escrow WATT à un prix en USDC ; acheteur paie prix × qté + `buyer_fee_bps` (100) vers treasury. Pas de bids. |

## 2. Programme Solana (Anchor, `programs/gigawatt`)

Program ID : généré ; stocké dans `Anchor.toml`, `target/idl/gigawatt.json`, et exporté par `packages/sdk`.

### PDAs
- `config` = `["config"]`
- `rewards_vault` = ATA(WATT, owner = config)
- `flush` = `["flush", config, index: u64 LE]`
- `claim_status` = `["claim", flush, claimant]`
- `ask` = `["ask", seller, nonce: u64 LE]` ; `ask_escrow` = ATA(WATT, owner = ask)

### Comptes
```
Config {
  admin: Pubkey, keeper: Pubkey,
  gwatt_mint: Pubkey, watt_mint: Pubkey, usdc_mint: Pubkey,
  treasury: Pubkey, funding_wallet: Pubkey,        // owners des ATAs USDC/WATT
  purchase_fee_bps: u16, activation_fee_bps: u16, buyer_fee_bps: u16, treasury_share_bps: u16,
  flush_interval: i64, min_flush_usdc: u64,
  last_flush_ts: i64, flush_count: u64,
  total_minted: u64, total_burned: u64,            // WATT
  total_rewards: u64, total_claimed: u64,           // WATT holders
  total_usdc_in: u64,                               // USDC entré au funding wallet
  bump: u8,
}
Flush { index: u64, ts: i64, slot: u64, sol_collected: u64, usdc_received: u64, usdc_to_treasury: u64,
        usdc_to_funding: u64, watt_for_holders: u64, merkle_root: [u8;32], holder_supply: u64, holder_count: u32, claimed: u64 }
ClaimStatus { flush: Pubkey, claimant: Pubkey, amount: u64, ts: i64 }
Ask { seller: Pubkey, nonce: u64, price: u64 /* USDC atoms par 1 WATT (1e6) */, amount: u64, remaining: u64, ts: i64, bump: u8 }
```

### Instructions
```
initialize(params: InitParams)                    // admin ; crée config, watt_mint (authority=config), rewards_vault
set_params(params: Option<...>)                   // admin
set_keeper(keeper)                                 // admin
buy_watt(usdc_amount)                              // user : USDC → funding + treasury, mint WATT
activate(amount)                                   // user : fee → treasury_watt, burn net ; emit Activated{owner, amount, net}
flush(sol_collected, usdc_received, usdc_to_treasury, watt_for_holders, merkle_root, holder_supply, holder_count)
                                                   // keeper : vérifie interval, mint watt_for_holders → rewards_vault, crée Flush ; emit Flushed{...}
claim(flush_index, amount, proof: Vec<[u8;32]>)    // vault → ATA claimant ; crée ClaimStatus ; emit Claimed
claim_and_activate(flush_index, amount, proof)     // vault → burn net, fee → treasury_watt ; emit Claimed + Activated
place_ask(nonce, price, amount)                    // escrow WATT
cancel_ask()                                       // retour escrow
fill_ask(amount)                                   // buyer paie USDC (prix×qté) au seller + buyer_fee au treasury, reçoit WATT ; emit Filled
```

### Merkle
Feuille = `keccak256(0x00 || claimant_pubkey(32) || amount_u64_le(8))`, nœuds = `keccak256(0x01 || min(a,b) || max(a,b))` (tri des paires → preuve sans index). Lib partagée dans `packages/sdk/src/merkle.ts`.

### Events
`Flushed`, `Claimed`, `Activated`, `Bought`, `AskPlaced`, `AskCancelled`, `Filled`.

## 3. Keeper (`apps/keeper`, Node/TS, cron horaire)
1. `collectCreatorFee` sur le programme pump.fun pour le GWATT mint (mainnet) — sur devnet : `MOCK_FEES=1` simule des SOL reçus.
2. Swap SOL → USDC via Jupiter (`JUP_API`) — mock sur devnet (mint d'USDC factice).
3. Split : treasury_share → treasury ATA, reste → funding ATA.
4. Snapshot holders GWATT (RPC `getTokenLargestAccounts` + `getProgramAccounts` filtré par mint ; exclut `EXCLUDED_ADDRESSES`, dont la bonding curve pump.fun et le pool).
5. Merkle → `flush(...)`.
6. POST `${WEB_URL}/api/internal/flush` avec `KEEPER_SECRET` pour indexer (holders list + proofs stockés en DB pour que le site serve `GET /api/earn/:address`).

## 4. Web (`apps/web`, Next.js App Router, Tailwind, Supabase)
Pages publiques : `/`, `/inference` (WATT), `/rewards`, `/sell` (order book), `/models`, `/stats`, `/status`, `/mcp`, `/incognito`, `/overdrive`, `/docs/*`, `/terms`, `/privacy`, `/cookies`, `/acceptable-use`.
App (wallet connecté) : `/overview` (home), `/overview/activity`, `/overview/usage`, `/overview/api-keys`, `/overview/models`, `/overview/rewards`, `/overview/money`, `/overview/settings`.
Auth : `POST /api/auth/nonce` → sign message (Phantom/Solflare) → `POST /api/auth/verify` → cookie session (JWT).
API IA : `POST /v1/chat/completions`, `POST /v1/messages`, `GET /v1/models` → proxy OpenRouter, métrage, débit du crédit (prix OpenRouter + 5 % OpenRouter, 0 markup).
API publique : `GET /api/earn/:address`, `GET /api/stats`, `GET /api/orderbook`, `GET /api/activity`, `GET /api/models`.
Interne : `POST /api/internal/flush` (keeper), `POST /api/activate/confirm` (client envoie la signature de tx `activate` → vérif on-chain → crédit).

Tables Supabase : `accounts(wallet pk, credit_usd numeric, created_at)`, `api_keys(id, account_wallet, hash, prefix, name, created_at, revoked_at)`, `requests(id, account_wallet, key_id, model, input_tokens, output_tokens, cost_usd, ts)`, `activations(sig pk, wallet, amount, net, credit_usd, ts)`, `flushes(index pk, ...)`, `flush_holders(flush_index, wallet, amount, proof jsonb, claimed_sig)`, `ledger(id, wallet, kind, amount, ref, ts)`.

## 5. Env
```
NEXT_PUBLIC_RPC_URL, NEXT_PUBLIC_CLUSTER=devnet, NEXT_PUBLIC_PROGRAM_ID, NEXT_PUBLIC_GWATT_MINT, NEXT_PUBLIC_WATT_MINT, NEXT_PUBLIC_USDC_MINT
SUPABASE_URL, SUPABASE_SERVICE_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
OPENROUTER_API_KEY, JWT_SECRET, KEEPER_SECRET
KEEPER_KEYPAIR (json array), RPC_URL, WEB_URL, MOCK_FEES, EXCLUDED_ADDRESSES
```
