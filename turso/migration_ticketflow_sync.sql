-- Track which TicketFlow transactions have already been imported so we never duplicate.
create table if not exists ticketflow_sync (
  external_id    text primary key,        -- e.g. "payout-{uuid}" or "invoice-{uuid}"
  kind           text not null,           -- 'payout' | 'invoice'
  synced_at      text not null default current_timestamp,
  transaction_id text references transactions(id)
);
