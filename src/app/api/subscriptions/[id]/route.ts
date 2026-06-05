import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, selectOne, SUB_BOOL_FIELDS, type Subscription } from '@/lib/db'

const ALLOWED = ['name', 'description', 'amount_cents', 'vat_rate', 'currency', 'frequency', 'category_id', 'next_due_date', 'last_paid_at', 'provider', 'is_active', 'auto_log_payments', 'notes'] as const
const BOOLEAN_KEYS = new Set(['is_active', 'auto_log_payments'])

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()

  const sets: string[] = []
  const args: (string | number | null)[] = []
  for (const k of ALLOWED) {
    if (k in body) {
      sets.push(`${k} = ?`)
      const v = body[k]
      args.push(BOOLEAN_KEYS.has(k) ? (v ? 1 : 0) : v)
    }
  }
  if (sets.length === 0) return NextResponse.json({ error: 'Geen velden om bij te werken' }, { status: 400 })

  sets.push('updated_at = current_timestamp')
  args.push(id)
  await db.execute({ sql: `update subscriptions set ${sets.join(', ')} where id = ?`, args })

  const subscription = await selectOne<Subscription>('select * from subscriptions where id = ?', [id], SUB_BOOL_FIELDS)
  return NextResponse.json({ subscription })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await db.execute({ sql: 'delete from subscriptions where id = ?', args: [id] })
  return NextResponse.json({ ok: true })
}
