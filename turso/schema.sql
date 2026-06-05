-- ── Boekhouding TicketFlow — Turso (libSQL/SQLite) schema ──────────────────
-- Run with: turso db shell <database-name> < turso/schema.sql
-- Or via the npm script: npm run db:init

-- ── Categories (chart of accounts / grootboek) ──────────────────────────────
create table if not exists categories (
  id          text primary key,
  name        text not null unique,
  type        text not null check (type in ('income', 'expense')),
  group_name  text,
  vat_rate    integer not null default 21 check (vat_rate in (0, 9, 21)),
  is_default  integer not null default 0,
  ai_hint     text,
  created_at  text not null default current_timestamp
);

-- ── Subscriptions (recurring expenses) ──────────────────────────────────────
create table if not exists subscriptions (
  id                 text primary key,
  name               text not null,
  description        text,
  amount_cents       integer not null,
  vat_rate           integer not null default 21 check (vat_rate in (0, 9, 21)),
  currency           text not null default 'EUR',
  frequency          text not null check (frequency in ('monthly', 'quarterly', 'yearly', 'weekly')),
  category_id        text references categories(id),
  next_due_date      text,
  last_paid_at       text,
  provider           text,
  is_active          integer not null default 1,
  auto_log_payments  integer not null default 0,
  notes              text,
  created_at         text not null default current_timestamp,
  updated_at         text not null default current_timestamp
);

-- ── Transactions (kasboek) ──────────────────────────────────────────────────
create table if not exists transactions (
  id               text primary key,
  date             text not null,
  description      text not null,
  amount_cents     integer not null,
  type             text not null check (type in ('income', 'expense')),
  vat_rate         integer not null default 21 check (vat_rate in (0, 9, 21)),
  category_id      text references categories(id),
  subscription_id  text references subscriptions(id),
  source           text,
  external_id      text,
  ai_categorised   integer not null default 0,
  ai_confidence    integer,
  ai_reasoning     text,
  needs_review     integer not null default 0,
  notes            text,
  created_at       text not null default current_timestamp,
  updated_at       text not null default current_timestamp
);

create index if not exists transactions_date_idx on transactions(date desc);
create index if not exists transactions_category_idx on transactions(category_id);
create index if not exists transactions_review_idx on transactions(needs_review);

-- ── Users (single-owner auth) ───────────────────────────────────────────────
create table if not exists users (
  id             text primary key,
  email          text not null unique,
  password_hash  text not null,
  created_at     text not null default current_timestamp
);
