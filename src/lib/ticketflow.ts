// TicketFlow data fetcher — reads payouts and invoices from TicketFlow's Supabase
// for a specific organisation. Only triggered manually by the owner.
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

// Owner email gates the sync — only this account's data is pulled.
const OWNER_EMAIL = 'dogteromc03@gmail.com'

export interface TFPayout {
  id: string
  amount: number          // cents
  amount_paid: number     // cents
  status: string
  reference: string | null
  note: string | null
  transferred_at: string | null
  created_at: string
  period_label: string | null
  event_id: string | null
}

export interface TFInvoice {
  id: string
  invoice_number: string | null
  amount: number          // cents (total incl BTW)
  amount_paid: number     // cents
  org_name: string | null
  notes: string | null
  period_label: string | null
  created_at: string
  status: string          // 'open' | 'paid'
}

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

export async function fetchPayouts(orgId: string): Promise<TFPayout[]> {
  const client = tfClient()
  const { data, error } = await client
    .from('payouts')
    .select('id, amount, amount_paid, status, reference, note, transferred_at, created_at, period_label, event_id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as TFPayout[]
}

export async function fetchInvoices(orgId: string): Promise<TFInvoice[]> {
  const client = tfClient()
  const { data, error } = await client
    .from('invoices')
    .select('id, invoice_number, amount, amount_paid, org_name, notes, period_label, created_at, status')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  if (error) {
    console.warn('invoices fetch failed:', error.message)
    return []
  }
  return (data ?? []) as unknown as TFInvoice[]
}
