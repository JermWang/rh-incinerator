-- Incinerator sponsor persistence. Only operationally necessary state.
-- No private keys, no user profiles, no raw signatures.

create table if not exists sponsored_operations (
  id text primary key,
  chain_id integer not null,
  wallet text not null,
  user_op_hash text unique,
  tx_hash text,
  kinds text[] not null default '{}',
  call_count integer not null default 0,
  gas_limit numeric(78,0) not null default 0,
  max_fee_per_gas numeric(78,0) not null default 0,
  reserved_cost_wei numeric(78,0) not null default 0,
  actual_cost_wei numeric(78,0),
  status text not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
create index if not exists sponsored_operations_wallet_idx on sponsored_operations (wallet, created_at desc);
create index if not exists sponsored_operations_created_idx on sponsored_operations (created_at desc);

create table if not exists wallet_daily_usage (
  wallet text not null,
  day date not null,
  ops integer not null default 0,
  gas numeric(78,0) not null default 0,
  failed_sims integer not null default 0,
  failed_sim_timestamps bigint[] not null default '{}',
  cooldown_until timestamptz,
  primary key (wallet, day)
);

create table if not exists contract_risk_state (
  address text primary key,
  failure_timestamps bigint[] not null default '{}',
  successes integer not null default 0,
  gas_samples integer not null default 0,
  gas_total numeric(78,0) not null default 0,
  deny_until timestamptz,
  manual_deny boolean not null default false,
  reason text,
  updated_at timestamptz not null default now()
);

create table if not exists failed_simulations (
  id text primary key,
  chain_id integer not null,
  wallet text not null,
  token text not null,
  kind text not null,
  reason text not null,
  created_at timestamptz not null default now()
);
create index if not exists failed_simulations_created_idx on failed_simulations (created_at desc);

create table if not exists sponsor_refills (
  tx_hash text primary key,
  chain_id integer not null,
  amount_wei numeric(78,0) not null,
  hot_balance_after numeric(78,0) not null,
  keeper text not null,
  block_number bigint not null,
  created_at timestamptz not null default now()
);

create table if not exists cleanup_transactions (
  id text primary key,
  chain_id integer not null,
  wallet text not null,
  tx_hash text,
  user_op_hash text,
  kinds text[] not null default '{}',
  sponsored boolean not null default false,
  status text not null,
  created_at timestamptz not null default now()
);
create index if not exists cleanup_transactions_wallet_idx on cleanup_transactions (wallet, created_at desc);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists siwe_nonces (
  nonce text primary key,
  expires_at timestamptz not null
);

create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null default 0
);
