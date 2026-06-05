import { selectAll, CAT_BOOL_FIELDS, TX_BOOL_FIELDS, type Category, type Transaction } from './db'

export interface ReportPeriod {
  from: string  // YYYY-MM-DD
  to: string    // YYYY-MM-DD
}

export function currentYearPeriod(): ReportPeriod {
  const y = new Date().getFullYear()
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

export interface ProfitLossLine {
  categoryName: string
  amount: number   // cents
}

export interface ProfitLossReport {
  period: ReportPeriod
  revenue: ProfitLossLine[]
  totalRevenue: number
  expenses: ProfitLossLine[]
  totalExpenses: number
  netResult: number
}

export async function buildProfitLoss(period: ReportPeriod): Promise<ProfitLossReport> {
  const [categories, transactions] = await Promise.all([
    selectAll<Category>('select * from categories', [], CAT_BOOL_FIELDS),
    selectAll<Transaction>('select * from transactions where date >= ? and date <= ?', [period.from, period.to], TX_BOOL_FIELDS),
  ])

  const catName = (id: string | null) => id ? (categories.find(c => c.id === id)?.name ?? 'Onbekend') : 'Niet gecategoriseerd'

  const aggregate = (type: 'income' | 'expense'): ProfitLossLine[] => {
    const byCat: Record<string, number> = {}
    for (const t of transactions) {
      if (t.type !== type) continue
      const name = catName(t.category_id)
      byCat[name] = (byCat[name] || 0) + t.amount_cents
    }
    return Object.entries(byCat).map(([categoryName, amount]) => ({ categoryName, amount })).sort((a, b) => b.amount - a.amount)
  }

  const revenue = aggregate('income')
  const expenses = aggregate('expense')
  const totalRevenue = revenue.reduce((s, l) => s + l.amount, 0)
  const totalExpenses = expenses.reduce((s, l) => s + l.amount, 0)

  return {
    period,
    revenue, totalRevenue,
    expenses, totalExpenses,
    netResult: totalRevenue - totalExpenses,
  }
}

// Balance Sheet
// Activa = Mollie-saldo + BTW te ontvangen
// Passiva = Verplichting aan organisatoren + BTW af te dragen + eigen vermogen
export interface BalanceSheetReport {
  asOf: string
  mollieBalance: number       // totaal geld op Mollie account
  vatReceivable: number       // BTW betaald > BTW geïnd
  payableToOrgs: number       // wat we organisatoren nog schuldig zijn
  vatPayable: number          // BTW geïnd > BTW betaald
  equity: number              // = activa − vreemd vermogen
  totalAssets: number
  totalLiabilitiesEquity: number
}

export async function buildBalanceSheet(asOf: string): Promise<BalanceSheetReport> {
  const transactions = await selectAll<Transaction>(
    'select * from transactions where date <= ?', [asOf], TX_BOOL_FIELDS,
  )

  // Mollie saldo + verplichting uit laatste snapshot van payable_snapshot
  const { selectOne } = await import('./db')
  const snap = await selectOne<{ total_cents: number; mollie_balance: number }>(
    'select total_cents, mollie_balance from payable_snapshot order by snapshot_at desc limit 1',
  )
  const mollieBalance = snap?.mollie_balance ?? 0
  const payableToOrgs = snap?.total_cents ?? 0

  // BTW berekening uit alle transacties (boekhouding tot asOf)
  const vatCollected = transactions.filter(t => t.type === 'income').reduce((s, t) => s + Math.round((t.amount_cents * t.vat_rate) / (100 + t.vat_rate)), 0)
  const vatPaid = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + Math.round((t.amount_cents * t.vat_rate) / (100 + t.vat_rate)), 0)
  const vatNet = vatCollected - vatPaid
  const vatPayable = Math.max(0, vatNet)
  const vatReceivable = Math.max(0, -vatNet)

  const totalAssets = mollieBalance + vatReceivable
  const equity = totalAssets - payableToOrgs - vatPayable

  return {
    asOf, mollieBalance, vatReceivable, payableToOrgs, vatPayable, equity,
    totalAssets,
    totalLiabilitiesEquity: payableToOrgs + vatPayable + equity,
  }
}

// Cash flow statement (indirect, vereenvoudigd):
// Operationeel = netto resultaat van P&L
// Investeren = (later: nog niet bijgehouden)
// Financiering = privé-onttrekkingen
export interface CashFlowReport {
  period: ReportPeriod
  operatingIncome: number
  operatingExpenses: number
  netOperatingCashFlow: number
  privateWithdrawals: number   // cat-prive in uitgaven
  netCashFlow: number
  cashStart: number
  cashEnd: number
}

export async function buildCashFlow(period: ReportPeriod): Promise<CashFlowReport> {
  const transactions = await selectAll<Transaction>(
    'select * from transactions where date >= ? and date <= ?', [period.from, period.to], TX_BOOL_FIELDS,
  )
  const operatingIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount_cents, 0)
  const allExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount_cents, 0)
  const privateWithdrawals = transactions.filter(t => t.type === 'expense' && t.category_id === 'cat-prive').reduce((s, t) => s + t.amount_cents, 0)
  const operatingExpenses = allExpenses - privateWithdrawals
  const netOperatingCashFlow = operatingIncome - operatingExpenses

  // Cash start = balance before period
  const before = await selectAll<Transaction>('select * from transactions where date < ?', [period.from], TX_BOOL_FIELDS)
  const cashStart = before.reduce((s, t) => s + (t.type === 'income' ? t.amount_cents : -t.amount_cents), 0)
  const netCashFlow = netOperatingCashFlow - privateWithdrawals
  const cashEnd = cashStart + netCashFlow

  return {
    period, operatingIncome, operatingExpenses, netOperatingCashFlow,
    privateWithdrawals, netCashFlow, cashStart, cashEnd,
  }
}
