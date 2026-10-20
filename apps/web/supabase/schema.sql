-- Gigawatt — schéma Supabase. À coller dans SQL Editor du projet Supabase.
create table if not exists accounts (
  wallet text primary key,
  credit_usd numeric(18,6) not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  account_wallet text not null references accounts(wallet) on delete cascade,
  hash text not null unique,
  prefix text not null,
  name text not null default 'Default',
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz
);
create index if not exists api_keys_wallet on api_keys(account_wallet);
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  account_wallet text not null,
  key_id uuid,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric(18,8) not null default 0,
  status int not null default 200,
  ts timestamptz not null default now()
);
create index if not exists requests_wallet_ts on requests(account_wallet, ts desc);
create table if not exists activations (
  sig text primary key,
  wallet text not null,
  amount bigint not null,
  net bigint not null,
  credit_usd numeric(18,6) not null,
  ts timestamptz not null default now()
);
create table if not exists flushes (
  index bigint primary key,
  ts timestamptz not null,
  slot bigint not null,
  sig text not null,
  sol_collected bigint not null default 0,
  usdc_received bigint not null default 0,
  usdc_to_treasury bigint not null default 0,
  usdc_to_funding bigint not null default 0,
  watt_for_holders bigint not null default 0,
  merkle_root text not null,
  holder_supply bigint not null default 0,
  holder_count int not null default 0
);
create table if not exists flush_holders (
  flush_index bigint not null references flushes(index) on delete cascade,
  wallet text not null,
  amount bigint not null,
  proof jsonb not null,
  claimed_sig text,
  claimed_at timestamptz,
  primary key (flush_index, wallet)
);
create index if not exists flush_holders_wallet on flush_holders(wallet);
create table if not exists ledger (
  id uuid primary key default gen_random_uuid(),
  wallet text not null,
  kind text not null,
  amount numeric(18,6) not null,
  ref text,
  ts timestamptz not null default now()
);
create index if not exists ledger_wallet_ts on ledger(wallet, ts desc);

create or replace function add_credit(p_wallet text, p_usd numeric) returns numeric language plpgsql as $$
declare v numeric;
begin
  insert into accounts(wallet, credit_usd) values (p_wallet, 0) on conflict (wallet) do nothing;
  update accounts set credit_usd = greatest(0, credit_usd + p_usd) where wallet = p_wallet returning credit_usd into v;
  return v;
end $$;

create or replace function global_stats() returns json language sql as $$
  select json_build_object(
    'accounts', (select count(*) from accounts),
    'requests', (select count(*) from requests),
    'spend_usd', coalesce((select sum(cost_usd) from requests),0),
    'activated_usd', coalesce((select sum(credit_usd) from activations),0),
    'flushes', (select count(*) from flushes),
    'rewards_watt', coalesce((select sum(watt_for_holders) from flushes),0),
    'claimed_watt', coalesce((select sum(amount) from flush_holders where claimed_sig is not null),0)
  );
$$;

-- Le site utilise la clé service côté serveur uniquement : RLS activé, aucune policy publique.
alter table accounts enable row level security;
alter table api_keys enable row level security;
alter table requests enable row level security;
alter table activations enable row level security;
alter table flushes enable row level security;
alter table flush_holders enable row level security;
alter table ledger enable row level security;
