import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'
import { fetchJournalEntriesByAccount, fetchLedgerAccounts } from '@/lib/journal'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const accountId = searchParams.get('accountId')
  const from = searchParams.get('from') ?? undefined
  const to = searchParams.get('to') ?? undefined

  if (!accountId) return NextResponse.json({ error: 'accountId vereist' }, { status: 400 })

  const [entries, accounts] = await Promise.all([
    fetchJournalEntriesByAccount(accountId, from, to),
    fetchLedgerAccounts(),
  ])
  return NextResponse.json({ entries, accounts })
}
