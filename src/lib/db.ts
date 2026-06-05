import { createClient, type Client } from '@libsql/client'
import { randomUUID } from 'node:crypto'

let _db: Client | null = null

function getClient(): Client {
  if (_db) return _db
  const url = process.env.TURSO_DATABASE_URL
  if (!url) throw new Error('TURSO_DATABASE_URL ontbreekt — zet hem in .env.local of Vercel env vars')
  _db = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  })
  return _db
}

// Proxy that lazily creates the client on first use.
export const db = new Proxy({} as Client, {
  get(_target, prop: keyof Client) {
    const client = getClient()
    const value = client[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})

// ── Helpers ────────────────────────────────────────────────────────────────
export function newId(): string {
  return randomUUID()
}

// Convert SQLite row (which uses 0/1 for booleans, strings for dates) to
// a richer JS-friendly object for the front-end.
export type Row = Record<string, unknown>

export function rowToObject<T>(row: Row, booleanFields: string[] = []): T {
  const result: Row = {}
  for (const key in row) {
    if (booleanFields.includes(key) && (row[key] === 0 || row[key] === 1)) {
      result[key] = row[key] === 1
    } else {
      result[key] = row[key]
    }
  }
  return result as T
}

export async function selectAll<T>(sql: string, args: (string | number | null)[] = [], booleanFields: string[] = []): Promise<T[]> {
  const result = await db.execute({ sql, args })
  return result.rows.map(r => rowToObject<T>(r as Row, booleanFields))
}

export async function selectOne<T>(sql: string, args: (string | number | null)[] = [], booleanFields: string[] = []): Promise<T | null> {
  const result = await db.execute({ sql, args })
  if (result.rows.length === 0) return null
  return rowToObject<T>(result.rows[0] as Row, booleanFields)
}

export async function execute(sql: string, args: (string | number | null)[] = []): Promise<void> {
  await db.execute({ sql, args })
}

// ── Domain types (front-end) ───────────────────────────────────────────────
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

// Helpful constants for boolean field conversion
export const SUB_BOOL_FIELDS = ['is_active', 'auto_log_payments']
export const TX_BOOL_FIELDS = ['ai_categorised', 'needs_review']
export const CAT_BOOL_FIELDS = ['is_default']
