import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { selectAll, CAT_BOOL_FIELDS, SUB_BOOL_FIELDS, type Category, type Subscription } from '@/lib/db'
import { Shell } from '../Shell'
import SubscriptionsClient from './SubscriptionsClient'

export default async function SubscriptionsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const [subs, categories] = await Promise.all([
    selectAll<Subscription>('select * from subscriptions order by name', [], SUB_BOOL_FIELDS),
    selectAll<Category>("select * from categories where type = 'expense' order by group_name, name", [], CAT_BOOL_FIELDS),
  ])

  return (
    <Shell active="/abonnementen" email={session.email}>
      <SubscriptionsClient initialSubscriptions={subs} categories={categories} />
    </Shell>
  )
}
