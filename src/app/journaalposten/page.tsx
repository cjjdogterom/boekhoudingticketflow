import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { fetchJournalOverview, fetchLedgerAccounts } from '@/lib/journal'
import { Shell } from '../Shell'
import JournalEntriesClient from './JournalEntriesClient'

export default async function JournalEntriesPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const [entries, accounts] = await Promise.all([
    fetchJournalOverview(500),
    fetchLedgerAccounts(),
  ])

  return (
    <Shell active="/journaalposten" email={session.email}>
      <JournalEntriesClient initialEntries={entries} accounts={accounts} />
    </Shell>
  )
}
