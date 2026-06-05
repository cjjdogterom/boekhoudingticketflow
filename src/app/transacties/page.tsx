import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { selectAll, CAT_BOOL_FIELDS, TX_BOOL_FIELDS, type Category, type Transaction } from '@/lib/db'
import { Shell } from '../Shell'
import TransactionsClient from './TransactionsClient'

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ review?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')
  const { review } = await searchParams

  const [transactions, categories, subscriptions] = await Promise.all([
    selectAll<Transaction>('select * from transactions order by date desc limit 500', [], TX_BOOL_FIELDS),
    selectAll<Category>('select * from categories order by type, group_name, name', [], CAT_BOOL_FIELDS),
    selectAll<{ id: string; name: string; provider: string | null }>(
      'select id, name, provider from subscriptions where is_active = 1 order by name'),
  ])

  return (
    <Shell active="/transacties" email={session.email}>
      <TransactionsClient
        initialTransactions={transactions}
        categories={categories}
        subscriptions={subscriptions}
        initialReviewFilter={review === '1'}
      />
    </Shell>
  )
}
