import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

export type Account = { wallet: string; credit_usd: number; created_at: string };
export type ApiKey = { id: string; account_wallet: string; hash: string; prefix: string; name: string; created_at: string; revoked_at: string | null; last_used_at: string | null };
export type RequestRow = { id: string; account_wallet: string; key_id: string | null; model: string; input_tokens: number; output_tokens: number; cost_usd: number; ts: string; status: number };
export type Activation = { sig: string; wallet: string; amount: number; net: number; credit_usd: number; ts: string };
export type Flush = { index: number; ts: string; slot: number; sig: string; sol_collected: number; usdc_received: number; usdc_to_treasury: number; usdc_to_funding: number; watt_for_holders: number; merkle_root: string; holder_supply: number; holder_count: number };
export type FlushHolder = { flush_index: number; wallet: string; amount: number; proof: string[]; claimed_sig: string | null; claimed_at: string | null };
export type Ledger = { id: string; wallet: string; kind: "activation" | "spend" | "claim" | "purchase" | "sale" | "fill"; amount: number; ref: string | null; ts: string };

export interface Store {
  getAccount(wallet: string): Promise<Account | null>;
  ensureAccount(wallet: string): Promise<Account>;
  addCredit(wallet: string, usd: number): Promise<number>;
  spendCredit(wallet: string, usd: number): Promise<number>;
  listKeys(wallet: string): Promise<ApiKey[]>;
  createKey(k: Omit<ApiKey, "created_at" | "revoked_at" | "last_used_at">): Promise<ApiKey>;
  revokeKey(wallet: string, id: string): Promise<void>;
  findKeyByHash(hash: string): Promise<ApiKey | null>;
  touchKey(id: string): Promise<void>;
  addRequest(r: Omit<RequestRow, "id" | "ts">): Promise<void>;
  listRequests(wallet: string, limit?: number): Promise<RequestRow[]>;
  usageSummary(wallet: string, days: number): Promise<{ day: string; cost_usd: number; requests: number; tokens: number }[]>;
  getActivation(sig: string): Promise<Activation | null>;
  addActivation(a: Omit<Activation, "ts">): Promise<void>;
  listActivations(wallet: string): Promise<Activation[]>;
  addFlush(f: Flush, holders: Omit<FlushHolder, "claimed_sig" | "claimed_at">[]): Promise<void>;
  listFlushes(limit?: number): Promise<Flush[]>;
  holderFlushes(wallet: string): Promise<(FlushHolder & { flush: Flush })[]>;
  markClaimed(flushIndex: number, wallet: string, sig: string): Promise<void>;
  addLedger(l: Omit<Ledger, "id" | "ts">): Promise<void>;
  listLedger(wallet: string, limit?: number): Promise<Ledger[]>;
  globalStats(): Promise<{ accounts: number; requests: number; spend_usd: number; activated_usd: number; flushes: number; rewards_watt: number; claimed_watt: number }>;
}

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

/* ---------------- In-memory store (dev / no Supabase) ---------------- */
class MemoryStore implements Store {
  accounts = new Map<string, Account>();
  keys: ApiKey[] = [];
  requests: RequestRow[] = [];
  activations: Activation[] = [];
  flushes: Flush[] = [];
  holders: FlushHolder[] = [];
  ledger: Ledger[] = [];

  async getAccount(w: string) { return this.accounts.get(w) ?? null; }
  async ensureAccount(w: string) {
    let a = this.accounts.get(w);
    if (!a) { a = { wallet: w, credit_usd: 0, created_at: now() }; this.accounts.set(w, a); }
    return a;
  }
  async addCredit(w: string, usd: number) { const a = await this.ensureAccount(w); a.credit_usd = round6(a.credit_usd + usd); return a.credit_usd; }
  async spendCredit(w: string, usd: number) { const a = await this.ensureAccount(w); a.credit_usd = round6(Math.max(0, a.credit_usd - usd)); return a.credit_usd; }
  async listKeys(w: string) { return this.keys.filter(k => k.account_wallet === w); }
  async createKey(k: Omit<ApiKey, "created_at" | "revoked_at" | "last_used_at">) { const row = { ...k, created_at: now(), revoked_at: null, last_used_at: null }; this.keys.push(row); return row; }
  async revokeKey(w: string, id: string) { const k = this.keys.find(k => k.id === id && k.account_wallet === w); if (k) k.revoked_at = now(); }
  async findKeyByHash(h: string) { return this.keys.find(k => k.hash === h) ?? null; }
  async touchKey(id: string) { const k = this.keys.find(k => k.id === id); if (k) k.last_used_at = now(); }
  async addRequest(r: Omit<RequestRow, "id" | "ts">) { this.requests.unshift({ ...r, id: uid(), ts: now() }); }
  async listRequests(w: string, limit = 50) { return this.requests.filter(r => r.account_wallet === w).slice(0, limit); }
  async usageSummary(w: string, days: number) { return summarize(this.requests.filter(r => r.account_wallet === w), days); }
  async getActivation(sig: string) { return this.activations.find(a => a.sig === sig) ?? null; }
  async addActivation(a: Omit<Activation, "ts">) { this.activations.unshift({ ...a, ts: now() }); }
  async listActivations(w: string) { return this.activations.filter(a => a.wallet === w); }
  async addFlush(f: Flush, hs: Omit<FlushHolder, "claimed_sig" | "claimed_at">[]) {
    this.flushes = this.flushes.filter(x => x.index !== f.index); this.flushes.unshift(f);
    this.holders = this.holders.filter(h => h.flush_index !== f.index);
    this.holders.push(...hs.map(h => ({ ...h, claimed_sig: null, claimed_at: null })));
  }
  async listFlushes(limit = 48) { return [...this.flushes].sort((a, b) => b.index - a.index).slice(0, limit); }
  async holderFlushes(w: string) { return this.holders.filter(h => h.wallet === w).map(h => ({ ...h, flush: this.flushes.find(f => f.index === h.flush_index)! })).filter(h => h.flush); }
  async markClaimed(i: number, w: string, sig: string) { const h = this.holders.find(h => h.flush_index === i && h.wallet === w); if (h) { h.claimed_sig = sig; h.claimed_at = now(); } }
  async addLedger(l: Omit<Ledger, "id" | "ts">) { this.ledger.unshift({ ...l, id: uid(), ts: now() }); }
  async listLedger(w: string, limit = 50) { return this.ledger.filter(l => l.wallet === w).slice(0, limit); }
  async globalStats() {
    return {
      accounts: this.accounts.size,
      requests: this.requests.length,
      spend_usd: round6(this.requests.reduce((s, r) => s + r.cost_usd, 0)),
      activated_usd: round6(this.activations.reduce((s, a) => s + a.credit_usd, 0)),
      flushes: this.flushes.length,
      rewards_watt: this.flushes.reduce((s, f) => s + f.watt_for_holders, 0),
      claimed_watt: this.holders.filter(h => h.claimed_sig).reduce((s, h) => s + h.amount, 0),
    };
  }
}

/* ---------------- Supabase store ---------------- */
class SupabaseStore implements Store {
  constructor(private sb: SupabaseClient) {}
  async getAccount(w: string) { const { data } = await this.sb.from("accounts").select("*").eq("wallet", w).maybeSingle(); return (data as Account) ?? null; }
  async ensureAccount(w: string) {
    const a = await this.getAccount(w); if (a) return a;
    const { data, error } = await this.sb.from("accounts").insert({ wallet: w, credit_usd: 0 }).select().single(); if (error) throw error; return data as Account;
  }
  async addCredit(w: string, usd: number) { const { data, error } = await this.sb.rpc("add_credit", { p_wallet: w, p_usd: usd }); if (error) throw error; return Number(data); }
  async spendCredit(w: string, usd: number) { const { data, error } = await this.sb.rpc("add_credit", { p_wallet: w, p_usd: -usd }); if (error) throw error; return Number(data); }
  async listKeys(w: string) { const { data } = await this.sb.from("api_keys").select("*").eq("account_wallet", w).order("created_at", { ascending: false }); return (data as ApiKey[]) ?? []; }
  async createKey(k: Omit<ApiKey, "created_at" | "revoked_at" | "last_used_at">) { const { data, error } = await this.sb.from("api_keys").insert(k).select().single(); if (error) throw error; return data as ApiKey; }
  async revokeKey(w: string, id: string) { await this.sb.from("api_keys").update({ revoked_at: now() }).eq("id", id).eq("account_wallet", w); }
  async findKeyByHash(h: string) { const { data } = await this.sb.from("api_keys").select("*").eq("hash", h).maybeSingle(); return (data as ApiKey) ?? null; }
  async touchKey(id: string) { await this.sb.from("api_keys").update({ last_used_at: now() }).eq("id", id); }
  async addRequest(r: Omit<RequestRow, "id" | "ts">) { await this.sb.from("requests").insert(r); }
  async listRequests(w: string, limit = 50) { const { data } = await this.sb.from("requests").select("*").eq("account_wallet", w).order("ts", { ascending: false }).limit(limit); return (data as RequestRow[]) ?? []; }
  async usageSummary(w: string, days: number) {
    const since = new Date(Date.now() - days * 86400e3).toISOString();
    const { data } = await this.sb.from("requests").select("*").eq("account_wallet", w).gte("ts", since).limit(5000);
    return summarize((data as RequestRow[]) ?? [], days);
  }
  async getActivation(sig: string) { const { data } = await this.sb.from("activations").select("*").eq("sig", sig).maybeSingle(); return (data as Activation) ?? null; }
  async addActivation(a: Omit<Activation, "ts">) { await this.sb.from("activations").insert(a); }
  async listActivations(w: string) { const { data } = await this.sb.from("activations").select("*").eq("wallet", w).order("ts", { ascending: false }); return (data as Activation[]) ?? []; }
  async addFlush(f: Flush, hs: Omit<FlushHolder, "claimed_sig" | "claimed_at">[]) {
    await this.sb.from("flushes").upsert(f);
    await this.sb.from("flush_holders").delete().eq("flush_index", f.index);
    for (let i = 0; i < hs.length; i += 500) await this.sb.from("flush_holders").insert(hs.slice(i, i + 500));
  }
  async listFlushes(limit = 48) { const { data } = await this.sb.from("flushes").select("*").order("index", { ascending: false }).limit(limit); return (data as Flush[]) ?? []; }
  async holderFlushes(w: string) {
    const { data } = await this.sb.from("flush_holders").select("*, flush:flushes(*)").eq("wallet", w);
    return ((data as unknown as (FlushHolder & { flush: Flush })[]) ?? []).filter(h => h.flush);
  }
  async markClaimed(i: number, w: string, sig: string) { await this.sb.from("flush_holders").update({ claimed_sig: sig, claimed_at: now() }).eq("flush_index", i).eq("wallet", w); }
  async addLedger(l: Omit<Ledger, "id" | "ts">) { await this.sb.from("ledger").insert(l); }
  async listLedger(w: string, limit = 50) { const { data } = await this.sb.from("ledger").select("*").eq("wallet", w).order("ts", { ascending: false }).limit(limit); return (data as Ledger[]) ?? []; }
  async globalStats() { const { data, error } = await this.sb.rpc("global_stats"); if (error) throw error; return data as Awaited<ReturnType<Store["globalStats"]>>; }
}

function summarize(rows: RequestRow[], days: number) {
  const out: Record<string, { day: string; cost_usd: number; requests: number; tokens: number }> = {};
  for (let i = days - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 86400e3).toISOString().slice(0, 10); out[d] = { day: d, cost_usd: 0, requests: 0, tokens: 0 }; }
  for (const r of rows) { const d = r.ts.slice(0, 10); if (!out[d]) continue; out[d].cost_usd = round6(out[d].cost_usd + r.cost_usd); out[d].requests++; out[d].tokens += r.input_tokens + r.output_tokens; }
  return Object.values(out);
}
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

declare global { var __gwStore: Store | undefined; }
export function db(): Store {
  if (globalThis.__gwStore) return globalThis.__gwStore;
  const s: Store = env.supabaseUrl && env.supabaseServiceKey
    ? new SupabaseStore(createClient(env.supabaseUrl, env.supabaseServiceKey, { auth: { persistSession: false } }))
    : new MemoryStore();
  globalThis.__gwStore = s;
  return s;
}
export const dbMode = () => (env.supabaseUrl && env.supabaseServiceKey ? "supabase" : "memory");
