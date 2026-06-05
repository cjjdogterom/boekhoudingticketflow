import { db, newId, selectAll, selectOne, type JournalEntry, type JournalLine, type LedgerAccount } from './db'

export const ACCOUNTS = {
  mollie: 'acc-mollie',
  debtors: 'acc-debtors',
  bank: 'acc-bank',
  vatReceivable: 'acc-vat-receivable',
  organizerPayable: 'acc-organizer-payable',
  vatPayable: 'acc-vat-payable',
  equity: 'acc-equity',
  revenueFees: 'acc-revenue-fees',
  revenueCustomSites: 'acc-revenue-custom-sites',
  revenueBroadcast: 'acc-revenue-broadcast',
  revenueRefunds: 'acc-revenue-refunds',
  revenueOther: 'acc-revenue-other',
  software: 'acc-software',
  hosting: 'acc-hosting',
  email: 'acc-email',
  aiTools: 'acc-ai-tools',
  bankCosts: 'acc-bank-costs',
} as const

export interface JournalLineInput {
  account_id: string
  description?: string | null
  debit_cents?: number
  credit_cents?: number
}

export interface JournalEntryInput {
  date: string
  description: string
  source?: string | null
  external_id?: string | null
  status?: 'draft' | 'posted'
  notes?: string | null
  lines: JournalLineInput[]
}

const DEFAULT_ACCOUNTS: Array<Omit<LedgerAccount, 'created_at' | 'is_active'> & { is_active?: boolean }> = [
  { id: ACCOUNTS.mollie, code: '1000', name: 'Mollie saldo', type: 'asset', description: 'Geld dat op het TicketFlow Mollie-account staat.' },
  { id: ACCOUNTS.debtors, code: '1100', name: 'Debiteuren openstaande facturen', type: 'asset', description: 'Facturen die verstuurd zijn maar nog niet betaald.' },
  { id: ACCOUNTS.bank, code: '1200', name: 'Bank', type: 'asset', description: 'Zakelijke bankrekening / ontvangen factuurbetalingen.' },
  { id: ACCOUNTS.vatReceivable, code: '1600', name: 'Te ontvangen btw', type: 'asset', description: 'Voorbelasting die nog terug te vragen is.' },
  { id: ACCOUNTS.organizerPayable, code: '2000', name: 'Te betalen aan organisatoren', type: 'liability', description: 'Ticketgelden die TicketFlow nog aan organisatoren moet uitbetalen.' },
  { id: ACCOUNTS.vatPayable, code: '2100', name: 'Te betalen btw', type: 'liability', description: 'BTW over TicketFlow omzet die nog afgedragen moet worden.' },
  { id: ACCOUNTS.equity, code: '3000', name: 'Eigen vermogen', type: 'equity', description: 'Sluitpost voor balans/eigen vermogen.' },
  { id: ACCOUNTS.revenueFees, code: '4000', name: 'Omzet TicketFlow servicekosten', type: 'revenue', description: '€0,85 platformfee en vergelijkbare ticketservicekosten.' },
  { id: ACCOUNTS.revenueCustomSites, code: '4010', name: 'Omzet maatwerksites', type: 'revenue', description: 'Eenmalige maatwerk website/app inkomsten.' },
  { id: ACCOUNTS.revenueBroadcast, code: '4020', name: 'Omzet broadcastmails', type: 'revenue', description: 'Betaalde e-mailbroadcasts vanuit TicketFlow.' },
  { id: ACCOUNTS.revenueRefunds, code: '4030', name: 'Omzet refundkosten', type: 'revenue', description: 'Kosten die TicketFlow rekent voor terugbetalingen.' },
  { id: ACCOUNTS.revenueOther, code: '4090', name: 'Omzet overig TicketFlow', type: 'revenue', description: 'Overige TicketFlow facturen.' },
  { id: ACCOUNTS.software, code: '7000', name: 'Softwareabonnementen', type: 'expense', description: 'SaaS-tools die niet direct hosting/e-mail/AI zijn.' },
  { id: ACCOUNTS.hosting, code: '7010', name: 'Hosting, database en infrastructuur', type: 'expense', description: 'Vercel, Turso, Upstash, domeinen en hosting.' },
  { id: ACCOUNTS.email, code: '7020', name: 'E-mailkosten Resend', type: 'expense', description: 'Resend en mail-gerelateerde kosten.' },
  { id: ACCOUNTS.aiTools, code: '7030', name: 'AI en development tools', type: 'expense', description: 'Claude, OpenAI, GitHub en development tooling.' },
  { id: ACCOUNTS.bankCosts, code: '7040', name: 'Bank- en Mollie kosten', type: 'expense', description: 'Bankkosten en payment-provider kosten indien apart betaald.' },
]

let schemaReady = false

export async function ensureJournalSchema(): Promise<void> {
  if (schemaReady) return
  await db.execute(`create table if not exists ledger_accounts (
    id text primary key,
    code text not null unique,
    name text not null,
    type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
    description text,
    is_active integer not null default 1,
    created_at text not null default current_timestamp
  )`)
  await db.execute(`create table if not exists journal_entries (
    id text primary key,
    date text not null,
    description text not null,
    source text,
    external_id text unique,
    status text not null default 'posted' check (status in ('draft', 'posted')),
    notes text,
    created_at text not null default current_timestamp,
    updated_at text not null default current_timestamp
  )`)
  await db.execute(`create table if not exists journal_lines (
    id text primary key,
    entry_id text not null references journal_entries(id) on delete cascade,
    account_id text not null references ledger_accounts(id),
    description text,
    debit_cents integer not null default 0,
    credit_cents integer not null default 0,
    sort_order integer not null default 0,
    created_at text not null default current_timestamp,
    check (debit_cents >= 0 and credit_cents >= 0),
    check (not (debit_cents > 0 and credit_cents > 0))
  )`)
  await db.execute('create index if not exists journal_entries_date_idx on journal_entries(date desc)')
  await db.execute('create index if not exists journal_entries_source_idx on journal_entries(source, external_id)')
  await db.execute('create index if not exists journal_lines_entry_idx on journal_lines(entry_id)')
  await db.execute('create index if not exists journal_lines_account_idx on journal_lines(account_id)')

  for (const a of DEFAULT_ACCOUNTS) {
    await db.execute({
      sql: `insert or ignore into ledger_accounts (id, code, name, type, description, is_active)
            values (?, ?, ?, ?, ?, ?)`,
      args: [a.id, a.code, a.name, a.type, a.description, a.is_active === false ? 0 : 1],
    })
  }
  schemaReady = true
}

export function splitVatInclusive(grossCents: number, vatRate: number): { net: number; vat: number } {
  if (vatRate <= 0) return { net: grossCents, vat: 0 }
  const vat = Math.round((grossCents * vatRate) / (100 + vatRate))
  return { net: grossCents - vat, vat }
}

export function validateBalanced(lines: JournalLineInput[]): void {
  const debit = lines.reduce((sum, line) => sum + Math.max(0, Number(line.debit_cents || 0)), 0)
  const credit = lines.reduce((sum, line) => sum + Math.max(0, Number(line.credit_cents || 0)), 0)
  if (debit <= 0 || credit <= 0) throw new Error('Journaalpost moet minimaal één debet- en één creditregel hebben.')
  if (debit !== credit) throw new Error(`Journaalpost is niet in balans: debet €${(debit / 100).toFixed(2)} vs credit €${(credit / 100).toFixed(2)}.`)
  for (const line of lines) {
    const d = Math.max(0, Number(line.debit_cents || 0))
    const c = Math.max(0, Number(line.credit_cents || 0))
    if (!line.account_id) throw new Error('Elke journaalregel moet een grootboekrekening hebben.')
    if (d > 0 && c > 0) throw new Error('Een journaalregel mag niet tegelijk debet en credit zijn.')
    if (d === 0 && c === 0) throw new Error('Elke journaalregel moet een bedrag hebben.')
  }
}

export async function createJournalEntry(input: JournalEntryInput): Promise<string> {
  await ensureJournalSchema()
  validateBalanced(input.lines)
  const entryId = newId()
  await db.execute({
    sql: `insert into journal_entries (id, date, description, source, external_id, status, notes)
          values (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      entryId,
      input.date,
      input.description,
      input.source ?? null,
      input.external_id ?? null,
      input.status ?? 'posted',
      input.notes ?? null,
    ],
  })
  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i]
    await db.execute({
      sql: `insert into journal_lines (id, entry_id, account_id, description, debit_cents, credit_cents, sort_order)
            values (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        newId(),
        entryId,
        line.account_id,
        line.description ?? null,
        Math.max(0, Number(line.debit_cents || 0)),
        Math.max(0, Number(line.credit_cents || 0)),
        i,
      ],
    })
  }
  return entryId
}

export async function createJournalEntryIfMissing(input: JournalEntryInput): Promise<boolean> {
  await ensureJournalSchema()
  if (input.external_id) {
    const existing = await selectOne<JournalEntry>('select * from journal_entries where external_id = ?', [input.external_id])
    if (existing) return false
  }
  await createJournalEntry(input)
  return true
}

export async function replaceJournalEntry(id: string, input: Omit<JournalEntryInput, 'external_id' | 'source'> & { source?: string | null; external_id?: string | null }): Promise<void> {
  await ensureJournalSchema()
  validateBalanced(input.lines)
  await db.execute({
    sql: `update journal_entries set date = ?, description = ?, status = ?, notes = ?, updated_at = current_timestamp where id = ?`,
    args: [input.date, input.description, input.status ?? 'posted', input.notes ?? null, id],
  })
  await db.execute({ sql: 'delete from journal_lines where entry_id = ?', args: [id] })
  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i]
    await db.execute({
      sql: `insert into journal_lines (id, entry_id, account_id, description, debit_cents, credit_cents, sort_order)
            values (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        newId(),
        id,
        line.account_id,
        line.description ?? null,
        Math.max(0, Number(line.debit_cents || 0)),
        Math.max(0, Number(line.credit_cents || 0)),
        i,
      ],
    })
  }
}

export async function fetchJournalOverview(limit = 500): Promise<Array<JournalEntry & {
  lines: Array<JournalLine & { account_code: string; account_name: string; account_type: LedgerAccount['type'] }>
  debit_total: number
  credit_total: number
  balanced: boolean
}>> {
  await ensureJournalSchema()
  const entries = await selectAll<JournalEntry>(
    'select * from journal_entries order by date desc, created_at desc limit ?',
    [limit],
  )
  if (entries.length === 0) return []
  const ids = entries.map(e => e.id)
  const placeholders = ids.map(() => '?').join(',')
  const lines = await selectAll<JournalLine & { account_code: string; account_name: string; account_type: LedgerAccount['type'] }>(
    `select jl.*, la.code as account_code, la.name as account_name, la.type as account_type
     from journal_lines jl
     join ledger_accounts la on la.id = jl.account_id
     where jl.entry_id in (${placeholders})
     order by jl.sort_order asc`,
    ids,
  )
  return entries.map(entry => {
    const entryLines = lines.filter(line => line.entry_id === entry.id)
    const debit = entryLines.reduce((sum, line) => sum + line.debit_cents, 0)
    const credit = entryLines.reduce((sum, line) => sum + line.credit_cents, 0)
    return { ...entry, lines: entryLines, debit_total: debit, credit_total: credit, balanced: debit === credit }
  })
}

export async function fetchLedgerAccounts(): Promise<LedgerAccount[]> {
  await ensureJournalSchema()
  return selectAll<LedgerAccount>('select * from ledger_accounts order by code')
}

export function classifyInvoiceRevenueAccount(invoice: { notes: string | null; period_label: string | null; invoice_number: string | null }): string {
  const text = `${invoice.notes || ''} ${invoice.period_label || ''} ${invoice.invoice_number || ''}`.toLowerCase()
  if (text.includes('broadcast') || text.includes('mail')) return ACCOUNTS.revenueBroadcast
  if (text.includes('refund') || text.includes('terugbetaling')) return ACCOUNTS.revenueRefunds
  if (text.includes('maatwerk') || text.includes('custom') || text.includes('site') || text.includes('website')) return ACCOUNTS.revenueCustomSites
  return ACCOUNTS.revenueOther
}
