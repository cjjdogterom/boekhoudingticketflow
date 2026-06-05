import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, selectOne, TX_BOOL_FIELDS, type Transaction } from '@/lib/db'

const ALLOWED = ['date', 'description', 'amount_cents', 'type', 'vat_rate', 'category_id', 'subscription_id', 'needs_review', 'notes'] as const
const BOOLEAN_KEYS = new Set(['needs_review', 'ai_categorised'])

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
  await db.execute({ sql: `update transactions set ${sets.join(', ')} where id = ?`, args })

  const transaction = await selectOne<Transaction>('select * from transactions where id = ?', [id], TX_BOOL_FIELDS)
  return NextResponse.json({ transaction })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  await db.execute({ sql: 'delete from transactions where id = ?', args: [id] })
  return NextResponse.json({ ok: true })
}
