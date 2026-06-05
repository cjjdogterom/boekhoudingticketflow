-- Migratie: journaalposten voor TicketFlow boekhouding.
-- Kan veilig meerdere keren worden uitgevoerd.

create table if not exists ledger_accounts (
  id          text primary key,
  code        text not null unique,
  name        text not null,
  type        text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  description text,
  is_active   integer not null default 1,
  created_at  text not null default current_timestamp
);

create table if not exists journal_entries (
  id          text primary key,
  date        text not null,
  description text not null,
  source      text,
  external_id text unique,
  status      text not null default 'posted' check (status in ('draft', 'posted')),
  notes       text,
  created_at  text not null default current_timestamp,
  updated_at  text not null default current_timestamp
);

create table if not exists journal_lines (
  id           text primary key,
  entry_id     text not null references journal_entries(id) on delete cascade,
  account_id   text not null references ledger_accounts(id),
  description  text,
  debit_cents  integer not null default 0,
  credit_cents integer not null default 0,
  sort_order   integer not null default 0,
  created_at   text not null default current_timestamp,
  check (debit_cents >= 0 and credit_cents >= 0),
  check (not (debit_cents > 0 and credit_cents > 0))
);

create index if not exists journal_entries_date_idx on journal_entries(date desc);
create index if not exists journal_entries_source_idx on journal_entries(source, external_id);
create index if not exists journal_lines_entry_idx on journal_lines(entry_id);
create index if not exists journal_lines_account_idx on journal_lines(account_id);
