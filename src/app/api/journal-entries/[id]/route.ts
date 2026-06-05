import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { db, selectOne, type JournalEntry } from '@/lib/db'
import { fetchJournalOverview, replaceJournalEntry } from '@/lib/journal'

export const runtime = 'nodejs'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()

  try {
    await replaceJournalEntry(id, {
      date: String(body.date || '').slice(0, 10),
      description: String(body.description || '').trim(),
      status: body.status === 'draft' ? 'draft' : 'posted',
      notes: body.notes ? String(body.notes) : null,
      lines: Array.isArray(body.lines) ? body.lines : [],
    })
    const [entry] = (await fetchJournalOverview(1000)).filter(e => e.id === id)
    return NextResponse.json({ ok: true, entry })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Opslaan mislukt' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const existing = await selectOne<JournalEntry>('select * from journal_entries where id = ?', [id])
  if (!existing) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
  await db.execute({ sql: 'delete from journal_entries where id = ?', args: [id] })
  return NextResponse.json({ ok: true })
}
