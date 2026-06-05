import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!url) console.warn('NEXT_PUBLIC_SUPABASE_URL is missing')
if (!serviceKey) console.warn('SUPABASE_SERVICE_ROLE_KEY is missing')

// Service-role client — bypasses RLS. Server-side only.
export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ── Types ──────────────────────────────────────────────────────────────────
export type Category = {
  id: string
  name: string
  type: 'income' | 'expense'
  group_name: string | null
  vat_rate: number
  is_default: boolean
  ai_hint: string | null
  created_at: string
}

export type Subscription = {
  id: string
  name: string
  description: string | null
  amount_cents: number
  vat_rate: number
  currency: string
  frequency: 'monthly' | 'quarterly' | 'yearly' | 'weekly'
  category_id: string | null
  next_due_date: string | null
  last_paid_at: string | null
  provider: string | null
  is_active: boolean
  auto_log_payments: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export type Transaction = {
  id: string
  date: string
  description: string
  amount_cents: number
  type: 'income' | 'expense'
  vat_rate: number
  category_id: string | null
  subscription_id: string | null
  source: string | null
  external_id: string | null
  ai_categorised: boolean
  ai_confidence: number | null
  ai_reasoning: string | null
  needs_review: boolean
  notes: string | null
  created_at: string
  updated_at: string
}
