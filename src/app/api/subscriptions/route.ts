import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, newId, selectOne, SUB_BOOL_FIELDS, type Subscription } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json()
  const id = newId()
  await db.execute({
    sql: `insert into subscriptions (
      id, name, description, amount_cents, vat_rate, currency, frequency,
      category_id, next_due_date, last_paid_at, provider, is_active, auto_log_payments, notes
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, b.name, b.description ?? null, b.amount_cents, b.vat_rate ?? 21, b.currency ?? 'EUR', b.frequency,
      b.category_id || null, b.next_due_date ?? null, b.last_paid_at ?? null, b.provider ?? null,
      b.is_active === false ? 0 : 1, b.auto_log_payments ? 1 : 0, b.notes ?? null,
    ],
  })

  const subscription = await selectOne<Subscription>('select * from subscriptions where id = ?', [id], SUB_BOOL_FIELDS)
  return NextResponse.json({ subscription })
}
