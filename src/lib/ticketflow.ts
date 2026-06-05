// TicketFlow data fetcher — reads from TicketFlow's Supabase for ALL orgs
// (this account = the platform owner = dogteromc03@gmail.com).
import { createClient } from '@supabase/supabase-js'

let _client: ReturnType<typeof createClient> | null = null

function tfClient() {
  if (_client) return _client
  const url = process.env.TICKETFLOW_SUPABASE_URL
  const key = process.env.TICKETFLOW_SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('TICKETFLOW_SUPABASE_URL en TICKETFLOW_SUPABASE_SERVICE_KEY ontbreken')
  _client = createClient(url, key, { auth: { persistSession: false } })
  return _client
}

// Platform constants — match TicketFlow's lib/fees.ts
export const SERVICE_FEE_CENTS = 85    // €0,85 per ticket (TicketFlow inkomst)
export const MOLLIE_COST_CENTS = 32    // €0,32 per ticket (Mollie kost TicketFlow eet)
export const REFUND_FEE_CENTS = 50     // €0,50 per refund (TicketFlow inkomst)

// ── Owner account check ────────────────────────────────────────────────────
const OWNER_EMAIL = 'dogteromc03@gmail.com'

export async function fetchOwnerOrgId(): Promise<string | null> {
  const client = tfClient()
  const { data, error } = await client
    .from('organizations')
    .select('id')
    .eq('owner_email', OWNER_EMAIL)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as { id: string } | null)?.id ?? null
}

// ── Tickets per organisator ────────────────────────────────────────────────
// Voor de boekhouding van het PLATFORM tellen we alle paid tickets van ALLE
// organisatoren — TicketFlow is het platform, niet zelf organisator.
export interface TFTicketRow {
  id: string
  event_id: string
  org_id: string
  org_name: string
  price_paid: number    // cents
  status: string
  refunded_at: string | null
  created_at: string
}

export async function fetchAllPaidTickets(): Promise<TFTicketRow[]> {
  const client = tfClient()
  // events → organizations join for the org name
  const { data, error } = await client
    .from('tickets')
    .select(`
      id, event_id, price_paid, status, refunded_at, created_at,
      events!inner ( org_id, organizations!inner ( name ) )
    `)
    .eq('status', 'paid')
    .order('created_at', { ascending: true })

  if (error) throw new Error(`tickets fetch: ${error.message}`)
  type Row = {
    id: string; event_id: string; price_paid: number; status: string
    refunded_at: string | null; created_at: string
    events: { org_id: string; organizations: { name: string } }
  }
  const rows = (data ?? []) as unknown as Row[]
  return rows.map(r => ({
    id: r.id,
    event_id: r.event_id,
    org_id: r.events.org_id,
    org_name: r.events.organizations?.name ?? '(onbekend)',
    price_paid: r.price_paid,
    status: r.status,
    refunded_at: r.refunded_at,
    created_at: r.created_at,
  }))
}

// ── Refunded tickets (€0,50 fee elk) ───────────────────────────────────────
export async function fetchRefundedTickets(): Promise<TFTicketRow[]> {
  const all = await fetchAllPaidTickets()
  return all.filter(t => t.refunded_at !== null)
}

// ── Payouts per organisator ────────────────────────────────────────────────
export interface TFPayout {
  id: string
  org_id: string
  amount: number
  amount_paid: number
  status: string
  created_at: string
}

export async function fetchAllPayouts(): Promise<TFPayout[]> {
  const client = tfClient()
  const { data, error } = await client
    .from('payouts')
    .select('id, org_id, amount, amount_paid, status, created_at')
    .order('created_at', { ascending: true })
  if (error) throw new Error(`payouts fetch: ${error.message}`)
  return (data ?? []) as unknown as TFPayout[]
}

// ── Invoices (alleen voor maatwerksites + refunds) ─────────────────────────
export interface TFInvoice {
  id: string
  invoice_number: string | null
  amount: number
  amount_paid: number
  org_id: string | null
  org_name: string | null
  notes: string | null
  period_label: string | null
  created_at: string
  status: string
}

export async function fetchAllInvoices(): Promise<TFInvoice[]> {
  const client = tfClient()
  const { data, error } = await client
    .from('invoices')
    .select('id, invoice_number, amount, amount_paid, org_id, org_name, notes, period_label, created_at, status')
    .order('created_at', { ascending: true })
  if (error) {
    console.warn('invoices fetch failed:', error.message)
    return []
  }
  return (data ?? []) as unknown as TFInvoice[]
}

// ── Aggregated per-organisation snapshot ───────────────────────────────────
export interface OrgSnapshot {
  org_id: string
  org_name: string
  tickets_sold: number
  refunds: number
  gross_revenue: number       // som van price_paid
  service_fees: number        // tickets × 0,85
  mollie_costs: number        // tickets × 0,32
  refund_fees: number         // refunds × 0,50
  payouts_total: number       // som van payouts.amount (status=paid)
  payable: number             // gross_revenue − service_fees − mollie_costs − refund_fees − payouts_total
}

export async function buildOrgSnapshots(): Promise<OrgSnapshot[]> {
  const [tickets, payouts] = await Promise.all([fetchAllPaidTickets(), fetchAllPayouts()])
  const map: Record<string, OrgSnapshot> = {}
  for (const t of tickets) {
    if (!map[t.org_id]) {
      map[t.org_id] = {
        org_id: t.org_id,
        org_name: t.org_name,
        tickets_sold: 0,
        refunds: 0,
        gross_revenue: 0,
        service_fees: 0,
        mollie_costs: 0,
        refund_fees: 0,
        payouts_total: 0,
        payable: 0,
      }
    }
    map[t.org_id].tickets_sold++
    map[t.org_id].gross_revenue += t.price_paid
    map[t.org_id].service_fees += SERVICE_FEE_CENTS
    map[t.org_id].mollie_costs += MOLLIE_COST_CENTS
    if (t.refunded_at) {
      map[t.org_id].refunds++
      map[t.org_id].refund_fees += REFUND_FEE_CENTS
    }
  }
  for (const p of payouts) {
    if (p.status !== 'paid') continue
    if (!map[p.org_id]) continue
    map[p.org_id].payouts_total += p.amount
  }
  for (const k in map) {
    const s = map[k]
    // Wat we de organisator nog schuldig zijn = bruto omzet − onze fees − Mollie kosten − refund fees − al uitbetaald
    s.payable = s.gross_revenue - s.service_fees - s.mollie_costs - s.refund_fees - s.payouts_total
  }
  return Object.values(map).sort((a, b) => b.tickets_sold - a.tickets_sold)
}
