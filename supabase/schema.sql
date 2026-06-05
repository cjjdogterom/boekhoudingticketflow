-- ── Boekhouding TicketFlow — Database schema ────────────────────────────────
-- Run this in your Supabase SQL Editor on a fresh project.

-- ── Categories (chart of accounts / grootboek) ──────────────────────────────
create table if not exists categories (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  type            text not null check (type in ('income', 'expense')),
  -- Optional sub-grouping ("Diensten", "Software", "Reiskosten" etc.)
  group_name      text,
  -- BTW percentage for this category (0, 9 or 21)
  vat_rate        int not null default 21 check (vat_rate in (0, 9, 21)),
  -- True if this is the default category for AI categorisation when uncertain
  is_default      boolean not null default false,
  -- Free text hint sent to the AI to help categorisation
  ai_hint         text,
  created_at      timestamptz not null default now()
);

-- Seed common Dutch bookkeeping categories
insert into categories (name, type, group_name, vat_rate, ai_hint) values
  ('Omzet ticketverkoop',         'income',  'Omzet',           9,  'Inkomsten uit ticketverkoop, ook via Mollie of Stripe.'),
  ('Omzet servicekosten',         'income',  'Omzet',           21, 'Platform fees, servicekosten, transactiekosten doorberekend aan klant.'),
  ('Omzet overig',                'income',  'Omzet',           21, 'Andere inkomsten (consulting, advies, etc.).'),
  ('Softwareabonnementen',        'expense', 'Bedrijfskosten',  21, 'SaaS abonnementen: Supabase, Vercel, Resend, Upstash, Claude, OpenAI, GitHub, Notion, etc.'),
  ('Hosting & domein',            'expense', 'Bedrijfskosten',  21, 'Domeinnaam registratie/verlenging, hosting (Vercel, Cloudflare).'),
  ('Bankkosten & transactiekosten','expense', 'Financiële kosten', 0, 'Mollie transactiekosten, Stripe fees, bankkosten zakelijke rekening.'),
  ('Marketing & advertenties',    'expense', 'Marketing',       21, 'Google Ads, Meta Ads, sponsored posts, ontwerpsoftware.'),
  ('Kantoorbenodigdheden',        'expense', 'Kantoor',         21, 'Pen, papier, kantoormeubilair, kleine tools.'),
  ('Telefoon & internet',         'expense', 'Kantoor',         21, 'Zakelijke telefoon, internetabonnement.'),
  ('Reiskosten zakelijk',         'expense', 'Reizen',          21, 'OV, parkeren, brandstof voor zakelijke ritten.'),
  ('Eten & drinken',              'expense', 'Representatie',   9,  'Zakelijk eten met klanten, beperkt aftrekbaar.'),
  ('Verzekeringen',               'expense', 'Verzekeringen',   0,  'Aansprakelijkheidsverzekering, cyberverzekering, beroep.'),
  ('Boekhouder & advies',         'expense', 'Externe diensten', 21, 'Boekhoudpakket, fiscalist, jurist, accountant.'),
  ('Belastingen',                 'expense', 'Belastingen',     0,  'BTW-afdracht, inkomstenbelasting, vennootschapsbelasting.'),
  ('Privé-onttrekking',           'expense', 'Eigenaar',        0,  'Geldopnames door eigenaar uit zakelijke rekening.'),
  ('Overig',                      'expense', 'Overig',          21, 'Niet-gecategoriseerde uitgaven.')
on conflict (name) do nothing;

update categories set is_default = true where name = 'Overig';

-- ── Subscriptions (recurring expenses) ──────────────────────────────────────
create table if not exists subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  description         text,
  amount_cents        int not null,
  vat_rate            int not null default 21 check (vat_rate in (0, 9, 21)),
  currency            text not null default 'EUR',
  -- 'monthly', 'yearly', 'quarterly', 'weekly'
  frequency           text not null check (frequency in ('monthly', 'quarterly', 'yearly', 'weekly')),
  category_id         uuid references categories(id),
  next_due_date       date,
  last_paid_at        date,
  provider            text,                -- e.g. 'Resend', 'Supabase'
  is_active           boolean not null default true,
  auto_log_payments   boolean not null default false,  -- if true, transactions are created automatically on due date
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Seed common TicketFlow subscriptions (amounts are placeholders)
insert into subscriptions (name, provider, amount_cents, frequency, category_id, notes) values
  ('Supabase Pro',     'Supabase',   2500, 'monthly', (select id from categories where name = 'Softwareabonnementen'), 'Database hosting, gratis tier vol'),
  ('Vercel Pro',       'Vercel',     2000, 'monthly', (select id from categories where name = 'Softwareabonnementen'), 'Hosting + serverless functions'),
  ('Resend Pro',       'Resend',     2000, 'monthly', (select id from categories where name = 'Softwareabonnementen'), '50.000 emails per maand'),
  ('Upstash Redis',    'Upstash',    1000, 'monthly', (select id from categories where name = 'Softwareabonnementen'), 'Wachtrij + caching'),
  ('Claude API',       'Anthropic',  2000, 'monthly', (select id from categories where name = 'Softwareabonnementen'), 'AI categorisering + ondersteuning'),
  ('GitHub Pro',       'GitHub',      400, 'monthly', (select id from categories where name = 'Softwareabonnementen'), 'Private repos + Actions')
on conflict do nothing;

-- ── Transactions (kasboek) ──────────────────────────────────────────────────
create table if not exists transactions (
  id                  uuid primary key default gen_random_uuid(),
  date                date not null,
  description         text not null,
  amount_cents        int not null,           -- always positive; type determines direction
  type                text not null check (type in ('income', 'expense')),
  vat_rate            int not null default 21 check (vat_rate in (0, 9, 21)),
  category_id         uuid references categories(id),
  subscription_id     uuid references subscriptions(id),  -- if this transaction is for a known subscription
  source              text,                   -- e.g. 'bank', 'mollie', 'manual', 'invoice'
  external_id         text,                   -- external reference (Mollie payment ID, invoice number)
  -- AI categorisation metadata
  ai_categorised      boolean not null default false,
  ai_confidence       int,                    -- 0-100
  ai_reasoning        text,
  needs_review        boolean not null default false,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists transactions_date_idx on transactions(date desc);
create index if not exists transactions_category_idx on transactions(category_id);
create index if not exists transactions_subscription_idx on transactions(subscription_id);
create index if not exists transactions_review_idx on transactions(needs_review) where needs_review = true;

-- ── Users (one owner, simple auth) ──────────────────────────────────────────
create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  password_hash   text not null,
  created_at      timestamptz not null default now()
);
