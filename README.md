# Gigawatt

> Hold the token. Own the compute.

Port Solana / pump.fun du mécanisme « holders → crédit d'inférence » : les creator fees du token **GWATT** (pump.fun) sont converties en **WATT** (token adossé à l'USDC) réparti entre les holders, qui l'activent en crédit pour appeler n'importe quel modèle d'IA via une clé `sk-gw-`, ou le revendent sur un order book on-chain.

## Structure

| Dossier | Rôle |
|---|---|
| `programs/gigawatt` | Programme Solana (Anchor) : mint WATT, achat, activation, flush, claim Merkle, order book |
| `packages/sdk` | SDK TypeScript : IDL, PDAs, Merkle, constructeurs d'instructions |
| `apps/web` | Site + dashboard + API IA (Next.js, Vercel, Supabase) |
| `apps/keeper` | Service horaire : collecte des creator fees pump.fun → swap USDC → flush |
| `scripts/` | Bootstrap devnet, flush de test, claim de test |
| `SPEC.md` | Spec commune (économie, comptes, instructions, API) |

## Démarrer en local

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # remplir les NEXT_PUBLIC_* depuis deployments/devnet.json
pnpm dev                                        # http://localhost:3000
```
Sans Supabase, le site tourne avec un stockage en mémoire (remis à zéro à chaque redémarrage) : suffisant pour tester.

## Déployer

1. **Programme** : `anchor build && anchor deploy --provider.cluster devnet`, puis `pnpm tsx scripts/devnet-bootstrap.ts` (voir `BUILD.md`).
2. **Supabase** : créer un projet, coller `apps/web/supabase/schema.sql` dans le SQL Editor, récupérer l'URL et la clé *service_role*.
3. **Vercel** : importer le repo, root directory `apps/web`, variables d'environnement de `apps/web/.env.example`.
4. **Keeper** : secrets GitHub Actions (`.github/workflows/keeper.yml`) ou crontab, voir `apps/keeper/README.md`.

## Passage en mainnet

- Lancer GWATT sur pump.fun **depuis le wallet du keeper** (les creator fees sont payées au créateur).
- `NEXT_PUBLIC_CLUSTER=mainnet-beta`, USDC = `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`, RPC Helius ou équivalent.
- Redéployer le programme sur mainnet et refaire `initialize` avec les vraies adresses ; `EXCLUDED_ADDRESSES` = bonding curve, pool PumpSwap, treasury, funding wallet, vault.
