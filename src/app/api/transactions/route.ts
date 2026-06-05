import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, newId, selectOne, TX_BOOL_FIELDS, type Transaction } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const b = await req.json()
  const id = newId()

  await db.execute({
    sql: `insert into transactions (
      id, date, description, amount_cents, type, vat_rate,
      category_id, subscription_id, source, external_id,
      ai_categorised, ai_confidence, ai_reasoning, needs_review, notes
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id, b.date, b.description, b.amount_cents, b.type, b.vat_rate ?? 21,
      b.category_id || null, b.subscription_id || null, b.source || 'manual', b.external_id || null,
      b.ai_categorised ? 1 : 0, b.ai_confidence ?? null, b.ai_reasoning ?? null,
      b.needs_review ? 1 : 0, b.notes || null,
    ],
  })

  const transaction = await selectOne<Transaction>('select * from transactions where id = ?', [id], TX_BOOL_FIELDS)
  return NextResponse.json({ transaction })
}
