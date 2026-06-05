import type React from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { Shell } from '../Shell'
import { UI, formatEuro, fontStack } from '@/lib/ui'
import { buildBalanceSheet, buildCashFlow, buildProfitLoss } from '@/lib/reports'

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

  const balanceOk = bs.difference === 0

  return (
    <Shell active="/rapporten" email={session.email}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 4px' }}>Rapporten {yearNum}</h1>
          <p style={{ color: UI.textMuted, fontSize: 14, margin: 0 }}>
            Gebaseerd op geboekte journaalposten. Conceptposten tellen niet mee.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={`/rapporten?year=${yearNum - 1}`} style={navLink}>Vorig jaar</a>
          <a href={`/rapporten?year=${yearNum + 1}`} style={navLink}>Volgend jaar</a>
          <a href="/journaalposten" style={primaryLink}>Journaalposten</a>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Kpi label="Omzet" amount={pl.totalRevenue} tone="good" />
        <Kpi label="Kosten" amount={pl.totalExpenses} />
        <Kpi label="Resultaat" amount={pl.netResult} tone={pl.netResult >= 0 ? 'good' : 'danger'} />
        <Kpi label="Balansverschil" amount={bs.difference} tone={balanceOk ? 'good' : 'danger'} />
      </div>

      <div style={{ background: balanceOk ? UI.successSoft : UI.dangerSoft, border: `1px solid ${balanceOk ? '#86efac' : '#fecaca'}`, color: balanceOk ? '#166534' : UI.danger, borderRadius: UI.radius, padding: '12px 14px', fontSize: 13, fontWeight: 800, marginBottom: 16 }}>
        {balanceOk
          ? 'Balans sluit: activa zijn gelijk aan passiva plus eigen vermogen.'
          : `Balans sluit nog niet. Verschil: ${formatSignedEuro(bs.difference)}. Controleer ontbrekende of ongebalanceerde journaalposten.`}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 16 }}>
        <ReportCard title="Winst- en verliesrekening" pdfHref={`/api/reports/pdf?type=pl&year=${yearNum}`}>
          <ReportSection title="Omzet">
            {pl.revenue.length === 0 && <Empty />}
            {pl.revenue.map(line => <Line key={line.accountCode || line.categoryName} code={line.accountCode} label={line.categoryName} amount={line.amount} positive />)}
            <Total label="Totaal omzet" amount={pl.totalRevenue} positive />
          </ReportSection>
          <ReportSection title="Kosten">
            {pl.expenses.length === 0 && <Empty />}
            {pl.expenses.map(line => <Line key={line.accountCode || line.categoryName} code={line.accountCode} label={line.categoryName} amount={line.amount} />)}
            <Total label="Totaal kosten" amount={pl.totalExpenses} />
          </ReportSection>
          <GrandTotal label="Netto resultaat" amount={pl.netResult} />
        </ReportCard>

        <ReportCard title="Balans" pdfHref={`/api/reports/pdf?type=bs&year=${yearNum}`}>
          <ReportSection title="Activa">
            {bs.assets.length === 0 && <Empty />}
            {bs.assets.map(line => <Line key={line.accountId} code={line.accountCode} label={line.accountName} amount={line.amount} positive={line.amount >= 0} />)}
            <Total label="Totaal activa" amount={bs.totalAssets} positive />
          </ReportSection>
          <ReportSection title="Passiva">
            {bs.liabilities.length === 0 && <Empty />}
            {bs.liabilities.map(line => <Line key={line.accountId} code={line.accountCode} label={line.accountName} amount={line.amount} />)}
            <Total label="Totaal passiva" amount={bs.totalLiabilities} />
          </ReportSection>
          <ReportSection title="Eigen vermogen">
            {bs.equityLines.map(line => <Line key={line.accountId} code={line.accountCode} label={line.accountName} amount={line.amount} positive={line.amount >= 0} />)}
            <Line label="Resultaat tot en met balansdatum" amount={bs.equity - bs.equityLines.reduce((total, line) => total + line.amount, 0)} positive={bs.equity >= 0} />
            <Total label="Totaal eigen vermogen" amount={bs.totalEquity} positive={bs.totalEquity >= 0} />
          </ReportSection>
          <GrandTotal label="Passiva + eigen vermogen" amount={bs.totalLiabilitiesEquity} neutral />
        </ReportCard>
      </div>

      <ReportCard title="Kasmutatie" pdfHref={`/api/reports/pdf?type=cf&year=${yearNum}`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          <MiniPanel label="Kas begin" amount={cf.cashStart} />
          <MiniPanel label="Ontvangsten op Bank/Mollie" amount={cf.receipts} tone="good" />
          <MiniPanel label="Betalingen vanaf Bank/Mollie" amount={cf.payments} />
          <MiniPanel label="Kas eind" amount={cf.cashEnd} tone={cf.cashEnd >= 0 ? 'good' : 'danger'} />
        </div>
      </ReportCard>
    </Shell>
  )
}

function ReportCard({ title, pdfHref, children }: { title: string; pdfHref: string; children: React.ReactNode }) {
  return (
    <section style={{ background: UI.card, border: `1px solid ${UI.borderSoft}`, borderRadius: UI.radius, padding: 18, marginBottom: 16, boxShadow: UI.shadow }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <h2 style={{ fontSize: 17, fontWeight: 900, margin: 0 }}>{title}</h2>
        <a href={pdfHref} target="_blank" rel="noreferrer" style={pdfLink}>PDF</a>
      </div>
      {children}
    </section>
  )
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <h3 style={{ fontSize: 12, fontWeight: 800, color: UI.textMuted, textTransform: 'uppercase', letterSpacing: 0, margin: '0 0 8px' }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>
    </div>
  )
}

function Line({ label, amount, positive, code }: { label: string; amount: number; positive?: boolean; code?: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: code ? '52px minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto', gap: 10, alignItems: 'baseline', fontSize: 13, padding: '5px 0' }}>
      {code && <span style={{ color: UI.textFaint, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>{code}</span>}
      <span style={{ color: UI.text, fontWeight: 600 }}>{label}</span>
      <Amount amount={amount} positive={positive} />
    </div>
  )
}

function Total({ label, amount, positive }: { label: string; amount: number; positive?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 14, padding: '9px 0 4px', borderTop: `1px solid ${UI.borderSoft}`, marginTop: 6 }}>
      <span style={{ fontWeight: 900, color: UI.text }}>{label}</span>
      <Amount amount={amount} positive={positive} strong />
    </div>
  )
}

function GrandTotal({ label, amount, neutral }: { label: string; amount: number; neutral?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: `2px solid ${UI.border}`, marginTop: 12, paddingTop: 12 }}>
      <span style={{ fontWeight: 900, color: UI.text }}>{label}</span>
      <Amount amount={amount} positive={neutral ? undefined : amount >= 0} strong large />
    </div>
  )
}

function Amount({ amount, positive, strong, large }: { amount: number; positive?: boolean; strong?: boolean; large?: boolean }) {
  return (
    <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontWeight: strong ? 900 : 700, fontSize: large ? 17 : 13, color: positive ? UI.success : amount < 0 ? UI.danger : UI.text, whiteSpace: 'nowrap' }}>
      {formatSignedEuro(amount)}
    </span>
  )
}

function Kpi({ label, amount, tone }: { label: string; amount: number; tone?: 'good' | 'danger' }) {
  const color = tone === 'good' ? UI.success : tone === 'danger' ? UI.danger : UI.text
  return (
    <div style={{ background: UI.card, border: `1px solid ${UI.borderSoft}`, borderRadius: UI.radius, padding: '13px 14px', boxShadow: UI.shadow }}>
      <div style={{ color: UI.textMuted, fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0 }}>{label}</div>
      <div style={{ color, fontSize: 20, fontWeight: 900, marginTop: 6, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{formatSignedEuro(amount)}</div>
    </div>
  )
}

function MiniPanel({ label, amount, tone }: { label: string; amount: number; tone?: 'good' | 'danger' }) {
  return (
    <div style={{ background: UI.cardSoft, border: `1px solid ${UI.borderSoft}`, borderRadius: 10, padding: 13 }}>
      <div style={{ color: UI.textMuted, fontSize: 12, fontWeight: 800 }}>{label}</div>
      <div style={{ marginTop: 5 }}><Amount amount={amount} positive={tone === 'good' ? true : undefined} strong /></div>
    </div>
  )
}

function Empty() {
  return <div style={{ color: UI.textFaint, fontSize: 12, fontStyle: 'italic', padding: '6px 0' }}>Geen geboekte posten</div>
}

function formatSignedEuro(cents: number): string {
  if (cents < 0) return `-${formatEuro(Math.abs(cents))}`
  return formatEuro(cents)
}

const navLink: React.CSSProperties = { background: UI.cardSoft, border: `1px solid ${UI.border}`, padding: '8px 11px', borderRadius: 7, fontSize: 12, color: UI.text, textDecoration: 'none', fontWeight: 800, fontFamily: fontStack }
const primaryLink: React.CSSProperties = { ...navLink, background: UI.primary, border: `1px solid ${UI.primary}`, color: '#fff' }
const pdfLink: React.CSSProperties = { background: UI.primarySoft, color: UI.primary, border: `1px solid ${UI.primaryBorder}`, padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 900, textDecoration: 'none', fontFamily: fontStack }
