import { selectAll, type LedgerAccount } from './db'
import { ACCOUNTS, ensureJournalSchema } from './journal'

export interface ReportPeriod {
  from: string
  to: string
}

export function currentYearPeriod(): ReportPeriod {
  const y = new Date().getFullYear()
  return { from: `${y}-01-01`, to: `${y}-12-31` }
}

export interface ProfitLossLine {
  categoryName: string
  amount: number
  accountCode?: string
}

export interface ProfitLossReport {
  period: ReportPeriod
  revenue: ProfitLossLine[]
  totalRevenue: number
  expenses: ProfitLossLine[]
  totalExpenses: number
  netResult: number
  source: 'journal'
}

export interface BalanceLine {
  accountId: string
  accountCode: string
  accountName: string
  amount: number
}

export interface BalanceSheetReport {
  asOf: string
  assets: BalanceLine[]
  liabilities: BalanceLine[]
  equityLines: BalanceLine[]
  currentYearResult: number
  mollieBalance: number
  bankBalance: number
  debtors: number
  vatReceivable: number
  payableToOrgs: number
  vatPayable: number
  equity: number
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  totalLiabilitiesEquity: number
  difference: number
  source: 'journal'
}

export interface CashFlowReport {
  period: ReportPeriod
  cashStart: number
  receipts: number
  payments: number
  netCashFlow: number
  cashEnd: number
  operatingIncome: number
  operatingExpenses: number
  netOperatingCashFlow: number
  privateWithdrawals: number
  source: 'journal'
}

type AccountBalance = LedgerAccount & {
  debit: number
  credit: number
  normalBalance: number
}

type LedgerLine = {
  account_id: string
  code: string
  name: string
  type: LedgerAccount['type']
  debit_cents: number
  credit_cents: number
}

async function ledgerLines(whereSql: string, args: Array<string | number | null>): Promise<LedgerLine[]> {
  await ensureJournalSchema()
  return selectAll<LedgerLine>(
    `select la.id as account_id, la.code, la.name, la.type, jl.debit_cents, jl.credit_cents
     from journal_lines jl
     join journal_entries je on je.id = jl.entry_id
     join ledger_accounts la on la.id = jl.account_id
     where je.status = 'posted' ${whereSql}`,
    args,
  )
}

function balancesFromLines(lines: LedgerLine[]): AccountBalance[] {
  const byAccount = new Map<string, AccountBalance>()
  for (const line of lines) {
    const current = byAccount.get(line.account_id) || {
      id: line.account_id,
      code: line.code,
      name: line.name,
      type: line.type,
      description: null,
      is_active: true,
      created_at: '',
      debit: 0,
      credit: 0,
      normalBalance: 0,
    }
    current.debit += Number(line.debit_cents || 0)
    current.credit += Number(line.credit_cents || 0)
    current.normalBalance = normalBalance(current.type, current.debit, current.credit)
    byAccount.set(line.account_id, current)
  }
  return [...byAccount.values()].sort((a, b) => a.code.localeCompare(b.code))
}

function normalBalance(type: LedgerAccount['type'], debit: number, credit: number): number {
  if (type === 'asset' || type === 'expense') return debit - credit
  return credit - debit
}

function nonZeroLine(account: AccountBalance): BalanceLine | null {
  if (account.normalBalance === 0) return null
  return {
    accountId: account.id,
    accountCode: account.code,
    accountName: account.name,
    amount: account.normalBalance,
  }
}

function sum(lines: Array<{ amount: number }>): number {
  return lines.reduce((total, line) => total + line.amount, 0)
}

export async function buildProfitLoss(period: ReportPeriod): Promise<ProfitLossReport> {
  const lines = await ledgerLines('and je.date >= ? and je.date <= ?', [period.from, period.to])
  const balances = balancesFromLines(lines)

  const revenue = balances
    .filter(account => account.type === 'revenue' && account.normalBalance !== 0)
    .map(account => ({
      accountCode: account.code,
      categoryName: account.name,
      amount: account.normalBalance,
    }))
    .sort((a, b) => b.amount - a.amount)

  const expenses = balances
    .filter(account => account.type === 'expense' && account.normalBalance !== 0)
    .map(account => ({
      accountCode: account.code,
      categoryName: account.name,
      amount: account.normalBalance,
    }))
    .sort((a, b) => b.amount - a.amount)

  const totalRevenue = sum(revenue)
  const totalExpenses = sum(expenses)
  return {
    period,
    revenue,
    totalRevenue,
    expenses,
    totalExpenses,
    netResult: totalRevenue - totalExpenses,
    source: 'journal',
  }
}

export async function buildBalanceSheet(asOf: string): Promise<BalanceSheetReport> {
  const balanceLines = await ledgerLines('and je.date <= ?', [asOf])
  const yearStart = `${asOf.slice(0, 4)}-01-01`
  const yearLines = await ledgerLines('and je.date >= ? and je.date <= ?', [yearStart, asOf])
  const balances = balancesFromLines(balanceLines)
  const yearBalances = balancesFromLines(yearLines)

  const assetAccounts = balances.filter(account => account.type === 'asset')
  const liabilityAccounts = balances.filter(account => account.type === 'liability')
  const equityAccounts = balances.filter(account => account.type === 'equity')

  const assets = assetAccounts.map(nonZeroLine).filter(Boolean) as BalanceLine[]
  const liabilities = liabilityAccounts.map(nonZeroLine).filter(Boolean) as BalanceLine[]
  const equityLines = equityAccounts.map(nonZeroLine).filter(Boolean) as BalanceLine[]

  const revenueToDate = balances.filter(account => account.type === 'revenue').reduce((total, account) => total + account.normalBalance, 0)
  const expensesToDate = balances.filter(account => account.type === 'expense').reduce((total, account) => total + account.normalBalance, 0)
  const currentYearRevenue = yearBalances.filter(account => account.type === 'revenue').reduce((total, account) => total + account.normalBalance, 0)
  const currentYearExpenses = yearBalances.filter(account => account.type === 'expense').reduce((total, account) => total + account.normalBalance, 0)

  const totalAssets = sum(assets)
  const totalLiabilities = sum(liabilities)
  const equityAccountTotal = sum(equityLines)
  const retainedResult = revenueToDate - expensesToDate
  const currentYearResult = currentYearRevenue - currentYearExpenses
  const totalEquity = equityAccountTotal + retainedResult
  const totalLiabilitiesEquity = totalLiabilities + totalEquity

  const accountAmount = (accountId: string) => balances.find(account => account.id === accountId)?.normalBalance ?? 0
  const vatReceivable = Math.max(0, accountAmount(ACCOUNTS.vatReceivable))
  const vatPayable = Math.max(0, accountAmount(ACCOUNTS.vatPayable))

  return {
    asOf,
    assets,
    liabilities,
    equityLines,
    currentYearResult,
    mollieBalance: accountAmount(ACCOUNTS.mollie),
    bankBalance: accountAmount(ACCOUNTS.bank),
    debtors: accountAmount(ACCOUNTS.debtors),
    vatReceivable,
    payableToOrgs: accountAmount(ACCOUNTS.organizerPayable),
    vatPayable,
    equity: totalEquity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalLiabilitiesEquity,
    difference: totalAssets - totalLiabilitiesEquity,
    source: 'journal',
  }
}

export async function buildCashFlow(period: ReportPeriod): Promise<CashFlowReport> {
  const cashAccountIds: string[] = [ACCOUNTS.mollie, ACCOUNTS.bank]
  const [beforeLines, periodLines] = await Promise.all([
    ledgerLines('and je.date < ?', [period.from]),
    ledgerLines('and je.date >= ? and je.date <= ?', [period.from, period.to]),
  ])
  const beforeBalances = balancesFromLines(beforeLines)
  const periodCashLines = periodLines.filter(line => cashAccountIds.includes(line.account_id))

  const cashStart = beforeBalances
    .filter(account => cashAccountIds.includes(account.id))
    .reduce((total, account) => total + account.normalBalance, 0)
  const receipts = periodCashLines.reduce((total, line) => total + Number(line.debit_cents || 0), 0)
  const payments = periodCashLines.reduce((total, line) => total + Number(line.credit_cents || 0), 0)
  const netCashFlow = receipts - payments
  const cashEnd = cashStart + netCashFlow

  return {
    period,
    cashStart,
    receipts,
    payments,
    netCashFlow,
    cashEnd,
    operatingIncome: receipts,
    operatingExpenses: payments,
    netOperatingCashFlow: netCashFlow,
    privateWithdrawals: 0,
    source: 'journal',
  }
}
