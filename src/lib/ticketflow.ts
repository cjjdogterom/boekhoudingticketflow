// TicketFlow data fetcher — reads from TicketFlow's Supabase for ALL orgs.
// This account is the PLATFORM owner (dogteromc03@gmail.com), so we sync
// everything across all organisations as the TicketFlow business.
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

// Fallback constants — overridden by platform_settings if present in TicketFlow.
const DEFAULT_SERVICE_FEE_CENTS = 85
const DEFAULT_MOLLIE_TRANSACTION_COST_CENTS = 29
export const REFUND_FEE_CENTS = 50

// ── Fee rates uit platform_settings ────────────────────────────────────────
export async function fetchFeeRates(): Promise<{ serviceFee: number; mollieCost: number }> {
  const client = tfClient()
  const { data } = await client
    .from('platform_settings')
    .select('key, value')
    .in('key', ['fee_platform_mollie', 'fee_mollie_transaction'])
  const map: Record<string, number> = {}
  for (const r of (data ?? []) as Array<{ key: string; value: string }>) {
    map[r.key] = parseInt(r.value, 10)
  }
  return {
    serviceFee: map['fee_platform_mollie'] ?? DEFAULT_SERVICE_FEE_CENTS,
    mollieCost: map['fee_mollie_transaction'] ?? DEFAULT_MOLLIE_TRANSACTION_COST_CENTS,
  }
}

// ── Tickets per organisator (paid + refunded) ──────────────────────────────
export interface TFTicketRow {
  id: string
  event_id: string
  org_id: string
  org_name: string
  price_paid: number
  status: string
  refunded_at: string | null
  mollie_payment_id: string | null
  created_at: string
}

export async function fetchAllPaidTickets(): Promise<TFTicketRow[]> {
  const client = tfClient()
  const { data, error } = await client
    .from('tickets')
    .select(`
      id, event_id, price_paid, status, refunded_at, mollie_payment_id, created_at,
      events!inner ( org_id, organizations!inner ( name ) )
    `)
    .eq('status', 'paid')
    // TESTTICKETS UITSLUITEN: echte Mollie-betalingen hebben een
    // mollie_payment_id. Test/handmatige tickets hebben dit niet en
    // tellen dus niet mee in de boekhouding.
    .not('mollie_payment_id', 'is', null)
    .order('created_at', { ascending: true })

  if (error) throw new Error(`tickets fetch: ${error.message}`)
  type Row = {
    id: string; event_id: string; price_paid: number; status: string
    refunded_at: string | null; mollie_payment_id: string | null; created_at: string
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
    mollie_payment_id: r.mollie_payment_id,
    created_at: r.created_at,
  }))
}

// ── Payouts ────────────────────────────────────────────────────────────────
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

// ── Invoices (maatwerk + refund + broadcast facturen) ──────────────────────
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

// ── Aggregaat per organisator ──────────────────────────────────────────────
export interface OrgSnapshot {
  org_id: string
  org_name: string
  tickets_sold: number
  unique_orders: number        // unieke mollie_payment_id's (voor Mollie kosten)
  refunds: number
  gross_revenue: number
  service_fees: number
  mollie_costs: number          // per ORDER, niet per ticket
  refund_fees: number
  payouts_total: number
  payable: number
}

export async function buildOrgSnapshots(): Promise<{
  snapshots: OrgSnapshot[]
  rates: { serviceFee: number; mollieCost: number }
}> {
  const [tickets, payouts, rates] = await Promise.all([
    fetchAllPaidTickets(),
    fetchAllPayouts(),
    fetchFeeRates(),
  ])

  const map: Record<string, OrgSnapshot & { orderIds: Set<string> }> = {}

  for (const t of tickets) {
    if (!map[t.org_id]) {
      map[t.org_id] = {
        org_id: t.org_id,
        org_name: t.org_name,
        tickets_sold: 0,
        unique_orders: 0,
        refunds: 0,
        gross_revenue: 0,
        service_fees: 0,
        mollie_costs: 0,
        refund_fees: 0,
        payouts_total: 0,
        payable: 0,
        orderIds: new Set<string>(),
      }
    }
    const m = map[t.org_id]
    m.tickets_sold++
    m.gross_revenue += t.price_paid
    m.service_fees += rates.serviceFee
    if (t.mollie_payment_id) m.orderIds.add(t.mollie_payment_id)
    if (t.refunded_at) {
      m.refunds++
      m.refund_fees += REFUND_FEE_CENTS
    }
  }
  for (const m of Object.values(map)) {
    m.unique_orders = m.orderIds.size
    m.mollie_costs = m.unique_orders * rates.mollieCost
  }
  for (const p of payouts) {
    if (p.status !== 'paid') continue
    if (!map[p.org_id]) continue
    map[p.org_id].payouts_total += p.amount
  }
  for (const k in map) {
    const s = map[k]
    s.payable = s.gross_revenue - s.service_fees - s.mollie_costs - s.refund_fees - s.payouts_total
  }
  const snapshots = Object.values(map).map(({ orderIds: _o, ...rest }) => rest)
  snapshots.sort((a, b) => b.tickets_sold - a.tickets_sold)
  return { snapshots, rates }
}
