import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { Shell } from '../Shell'
import { buildBalanceSheet, buildCashFlow, buildProfitLoss } from '@/lib/reports'
import ReportsClient from './ReportsClient'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const { year } = await searchParams
  const yearNum = year ? parseInt(year, 10) : new Date().getFullYear()
  const period = { from: `${yearNum}-01-01`, to: `${yearNum}-12-31` }

  const [pl, bs, cf] = await Promise.all([
    buildProfitLoss(period),
    buildBalanceSheet(period.to),
    buildCashFlow(period),
  ])

  return (
    <Shell active="/rapporten" email={session.email}>
      <ReportsClient pl={pl} bs={bs} cf={cf} yearNum={yearNum} />
    </Shell>
  )
}
