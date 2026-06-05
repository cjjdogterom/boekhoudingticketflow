import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
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

  const [{ data: transactions }, { data: categories }, { data: subscriptions }] = await Promise.all([
    supabaseAdmin.from('transactions').select('*').order('date', { ascending: false }).limit(500),
    supabaseAdmin.from('categories').select('*').order('type').order('group_name').order('name'),
    supabaseAdmin.from('subscriptions').select('id, name, provider').eq('is_active', true),
  ])

  return (
    <Shell active="/transacties" email={session.email}>
      <TransactionsClient
        initialTransactions={transactions || []}
        categories={categories || []}
        subscriptions={subscriptions || []}
        initialReviewFilter={review === '1'}
      />
    </Shell>
  )
}
