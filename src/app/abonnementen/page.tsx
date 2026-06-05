import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { Shell } from '../Shell'
import SubscriptionsClient from './SubscriptionsClient'

export default async function SubscriptionsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const [{ data: subs }, { data: categories }] = await Promise.all([
    supabaseAdmin.from('subscriptions').select('*').order('name'),
    supabaseAdmin.from('categories').select('*').eq('type', 'expense'),
  ])

  return (
    <Shell active="/abonnementen" email={session.email}>
      <SubscriptionsClient initialSubscriptions={subs || []} categories={categories || []} />
    </Shell>
  )
}
