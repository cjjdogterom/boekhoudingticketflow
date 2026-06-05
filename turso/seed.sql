-- Seed data — Nederlandse boekhoudcategorieën met BTW
insert or ignore into categories (id, name, type, group_name, vat_rate, ai_hint) values
  ('cat-omzet-tickets',   'Omzet ticketverkoop',          'income',  'Omzet',           9,  'Inkomsten uit ticketverkoop, ook via Mollie of Stripe.'),
  ('cat-omzet-fees',      'Omzet servicekosten',          'income',  'Omzet',           21, 'Platform fees, servicekosten, transactiekosten doorberekend aan klant.'),
  ('cat-omzet-overig',    'Omzet overig',                 'income',  'Omzet',           21, 'Andere inkomsten (consulting, advies, etc.).'),
  ('cat-software',        'Softwareabonnementen',         'expense', 'Bedrijfskosten',  21, 'SaaS abonnementen: Vercel, Resend, Upstash, Claude, OpenAI, GitHub, Notion, Turso, etc.'),
  ('cat-hosting',         'Hosting & domein',             'expense', 'Bedrijfskosten',  21, 'Domeinnaam registratie/verlenging, hosting (Vercel, Cloudflare).'),
  ('cat-bank',            'Bankkosten & transactiekosten','expense', 'Financieel',      0,  'Mollie transactiekosten, Stripe fees, bankkosten zakelijke rekening.'),
  ('cat-marketing',       'Marketing & advertenties',     'expense', 'Marketing',       21, 'Google Ads, Meta Ads, sponsored posts, ontwerpsoftware.'),
  ('cat-kantoor',         'Kantoorbenodigdheden',         'expense', 'Kantoor',         21, 'Pen, papier, kantoormeubilair, kleine tools.'),
  ('cat-telefoon',        'Telefoon & internet',          'expense', 'Kantoor',         21, 'Zakelijke telefoon, internetabonnement.'),
  ('cat-reizen',          'Reiskosten zakelijk',          'expense', 'Reizen',          21, 'OV, parkeren, brandstof voor zakelijke ritten.'),
  ('cat-eten',            'Eten & drinken',               'expense', 'Representatie',   9,  'Zakelijk eten met klanten, beperkt aftrekbaar.'),
  ('cat-verzekering',     'Verzekeringen',                'expense', 'Verzekeringen',   0,  'Aansprakelijkheidsverzekering, cyberverzekering.'),
  ('cat-advies',          'Boekhouder & advies',          'expense', 'Externe diensten',21, 'Boekhoudpakket, fiscalist, jurist, accountant.'),
  ('cat-belastingen',     'Belastingen',                  'expense', 'Belastingen',     0,  'BTW-afdracht, inkomstenbelasting, vennootschapsbelasting.'),
  ('cat-prive',           'Privé-onttrekking',            'expense', 'Eigenaar',        0,  'Geldopnames door eigenaar uit zakelijke rekening.'),
  ('cat-overig',          'Overig',                       'expense', 'Overig',          21, 'Niet-gecategoriseerde uitgaven.');

update categories set is_default = 1 where id = 'cat-overig';

-- Common subscriptions for TicketFlow (amounts are placeholders, update via UI)
insert or ignore into subscriptions (id, name, provider, amount_cents, frequency, category_id, notes) values
  ('sub-turso',    'Turso Scaler',  'Turso',      900,  'monthly', 'cat-software', 'Database hosting'),
  ('sub-vercel',   'Vercel Pro',    'Vercel',     2000, 'monthly', 'cat-software', 'Hosting + serverless functions'),
  ('sub-resend',   'Resend Pro',    'Resend',     2000, 'monthly', 'cat-software', '50.000 emails per maand'),
  ('sub-upstash',  'Upstash Redis', 'Upstash',    1000, 'monthly', 'cat-software', 'Wachtrij + caching voor TicketFlow'),
  ('sub-claude',   'Claude API',    'Anthropic',  2000, 'monthly', 'cat-software', 'AI categorisering + ondersteuning'),
  ('sub-github',   'GitHub Pro',    'GitHub',     400,  'monthly', 'cat-software', 'Private repos + Actions');
