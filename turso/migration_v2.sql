-- Migratie v2: per-ticket service fees en Mollie kosten via sync ticketflow,
-- plus opslag van verplichting aan organisatoren (niet-uitbetaald saldo).

-- ── Constants ──────────────────────────────────────────────────────────────
-- Service fee TicketFlow rekent per ticket: €0,85 (in centen)
-- Mollie transactiekost per ticket: €0,32 (in centen)
-- (Worden hard-coded in code, niet in tabel)

-- ── Balance snapshots: snapshot van verplichting aan organisatoren ─────────
-- Bij elke sync wordt het huidige openstaande saldo per organisator
-- bijgewerkt. De waarde komt overeen met "geld op Mollie dat nog niet
-- uitbetaald is" minus servicekosten en Mollie kosten.
create table if not exists payable_snapshot (
  id              text primary key,
  snapshot_at     text not null default current_timestamp,
  total_cents     integer not null,            -- totaal aan organisatoren verschuldigd
  mollie_balance  integer not null,            -- geld op Mollie account (alle paid tickets - alle payouts)
  org_count       integer not null
);

-- ── Sync log: extra kolommen om aggregaten-IDs te onderscheiden ────────────
-- (Bestaande ticketflow_sync tabel wordt hergebruikt; nieuwe external_id
--  formaten:
--    "fees-{orgId}-{ticketId}"       — service fee voor 1 ticket
--    "mollie-{orgId}-{ticketId}"     — Mollie kost voor 1 ticket
--    "invoice-{invoiceId}"           — bestaand
-- )
