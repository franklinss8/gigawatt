import { db } from "./db";
import { listModels } from "./openrouter";
import { readChainStats } from "./chain";

export async function siteStats() {
  const [g, models, chain] = await Promise.all([
    db().globalStats().catch(() => ({ accounts: 0, requests: 0, spend_usd: 0, activated_usd: 0, flushes: 0, rewards_watt: 0, claimed_watt: 0 })),
    listModels().catch(() => []),
    readChainStats().catch(() => null),
  ]);
  return { ...g, models: models.length, chain };
}
export type SiteStats = Awaited<ReturnType<typeof siteStats>>;
