import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { Shell } from '../Shell'
import { UI, formatEuro } from '@/lib/ui'
import { buildBalanceSheet, buildCashFlow, buildProfitLoss, currentYearPeriod } from '@/lib/reports'

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
  const asOf = period.to

  const [pl, bs, cf] = await Promise.all([
    buildProfitLoss(period),
    buildBalanceSheet(asOf),
    buildCashFlow(period),
  ])

  return (
    <Shell active="/rapporten" email={session.email}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 4px' }}>Rapporten {yearNum}</h1>
          <p style={{ color: UI.textMuted, fontSize: 14, margin: 0 }}>Financiële overzichten — downloadbaar als PDF.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={`/rapporten?year=${yearNum - 1}`} style={navLink}>← {yearNum - 1}</a>
          <a href={`/rapporten?year=${yearNum + 1}`} style={navLink}>{yearNum + 1} →</a>
        </div>
      </div>

      {/* ── Profit & Loss ── */}
      <ReportCard title="📈 Winst- en Verliesrekening (P&L)" pdfHref={`/api/reports/pdf?type=pl&year=${yearNum}`}>
        <ReportSection title="Inkomsten">
          {pl.revenue.length === 0 && <Empty />}
          {pl.revenue.map((l, i) => <Line key={i} label={l.categoryName} amount={l.amount} positive />)}
          <Total label="Totaal inkomsten" amount={pl.totalRevenue} positive />
        </ReportSection>
        <ReportSection title="Uitgaven">
          {pl.expenses.length === 0 && <Empty />}
          {pl.expenses.map((l, i) => <Line key={i} label={l.categoryName} amount={l.amount} />)}
          <Total label="Totaal uitgaven" amount={pl.totalExpenses} />
        </ReportSection>
        <div style={{ borderTop: `2px solid ${UI.border}`, marginTop: 10, paddingTop: 10 }}>
          <Total label="Netto resultaat" amount={pl.netResult} positive={pl.netResult >= 0} bold />
        </div>
      </ReportCard>

      {/* ── Balance Sheet ── */}
      <ReportCard title="📊 Balans per 31-12" pdfHref={`/api/reports/pdf?type=bs&year=${yearNum}`}>
        <ReportSection title="Activa">
          <Line label="Liquide middelen (kas/bank)" amount={bs.cash} positive />
          {bs.vatReceivable > 0 && <Line label="BTW te ontvangen" amount={bs.vatReceivable} positive />}
          <Total label="Totaal activa" amount={bs.totalAssets} positive bold />
        </ReportSection>
        <ReportSection title="Passiva &amp; Eigen Vermogen">
          {bs.vatPayable > 0 && <Line label="BTW af te dragen" amount={bs.vatPayable} />}
          <Line label="Eigen vermogen" amount={bs.equity} positive={bs.equity >= 0} />
          <Total label="Totaal passiva" amount={bs.totalLiabilitiesEquity} bold />
        </ReportSection>
      </ReportCard>

      {/* ── Cash Flow ── */}
      <ReportCard title="💰 Kasstroomoverzicht" pdfHref={`/api/reports/pdf?type=cf&year=${yearNum}`}>
        <ReportSection title="Operationele activiteiten">
          <Line label="Inkomsten" amount={cf.operatingIncome} positive />
          <Line label="Uitgaven (operationeel)" amount={-cf.operatingExpenses} />
          <Total label="Netto operationele kasstroom" amount={cf.netOperatingCashFlow} positive={cf.netOperatingCashFlow >= 0} />
        </ReportSection>
        <ReportSection title="Financieringsactiviteiten">
          <Line label="Privé-onttrekkingen" amount={-cf.privateWithdrawals} />
        </ReportSection>
        <div style={{ borderTop: `2px solid ${UI.border}`, marginTop: 10, paddingTop: 10 }}>
          <Line label="Kasstand begin" amount={cf.cashStart} positive={cf.cashStart >= 0} />
          <Line label="Netto kasstroom" amount={cf.netCashFlow} positive={cf.netCashFlow >= 0} />
          <Total label="Kasstand eind" amount={cf.cashEnd} positive={cf.cashEnd >= 0} bold />
        </div>
      </ReportCard>
    </Shell>
  )
}

function ReportCard({ title, pdfHref, children }: { title: string; pdfHref: string; children: React.ReactNode }) {
  return (
    <div style={{ background: UI.card, border: `1px solid ${UI.borderSoft}`, borderRadius: 12, padding: 22, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{title}</h2>
        <a href={pdfHref} target="_blank" rel="noreferrer" style={{ background: UI.primarySoft, color: UI.primary, border: `1px solid ${UI.primaryBorder}`, padding: '6px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
          📄 PDF
        </a>
      </div>
      {children}
    </div>
  )
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h3 style={{ fontSize: 12, fontWeight: 700, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, margin: '0 0 8px' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
  )
}

function Line({ label, amount, positive, bold }: { label: string; amount: number; positive?: boolean; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13, padding: '4px 0' }}>
      <span style={{ color: UI.text, fontWeight: bold ? 700 : 500 }}>{label}</span>
      <span style={{ fontFamily: 'monospace', fontWeight: bold ? 800 : 600, color: positive ? UI.success : amount < 0 ? UI.danger : UI.text }}>
        {amount < 0 ? '−' : ''}{formatEuro(Math.abs(amount))}
      </span>
    </div>
  )
}

function Total({ label, amount, positive, bold }: { label: string; amount: number; positive?: boolean; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 14, padding: '8px 0 4px', borderTop: `1px solid ${UI.borderSoft}`, marginTop: 6 }}>
      <span style={{ fontWeight: 800, color: UI.text }}>{label}</span>
      <span style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: bold ? 16 : 14, color: positive ? UI.success : amount < 0 ? UI.danger : UI.text }}>
        {amount < 0 ? '−' : ''}{formatEuro(Math.abs(amount))}
      </span>
    </div>
  )
}

function Empty() {
  return <div style={{ color: UI.textFaint, fontSize: 12, fontStyle: 'italic', padding: '6px 0' }}>Geen posten in deze periode</div>
}

const navLink: React.CSSProperties = { background: UI.cardSoft, border: `1px solid ${UI.border}`, padding: '6px 12px', borderRadius: 7, fontSize: 12, color: UI.text, textDecoration: 'none', fontWeight: 600 }
