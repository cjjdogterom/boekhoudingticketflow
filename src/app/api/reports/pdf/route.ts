import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import { buildBalanceSheet, buildCashFlow, buildProfitLoss, type ReportPeriod } from '@/lib/reports'

export const runtime = 'nodejs'

function fmt(cents: number): string {
  const neg = cents < 0
  const v = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Math.abs(cents) / 100)
  return neg ? `−${v}` : v
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })

  const url = new URL(req.url)
  const type = url.searchParams.get('type') || 'pl'
  const year = parseInt(url.searchParams.get('year') || String(new Date().getFullYear()), 10)
  const period: ReportPeriod = { from: `${year}-01-01`, to: `${year}-12-31` }

  let body = ''
  let title = ''

  if (type === 'pl') {
    const pl = await buildProfitLoss(period)
    title = `Winst- en Verliesrekening ${year}`
    body = `
      <h2>Inkomsten</h2>
      <table>${pl.revenue.map(l => `<tr><td>${l.categoryName}</td><td class="num">${fmt(l.amount)}</td></tr>`).join('')}
      <tr class="total"><td>Totaal inkomsten</td><td class="num">${fmt(pl.totalRevenue)}</td></tr></table>
      <h2>Uitgaven</h2>
      <table>${pl.expenses.map(l => `<tr><td>${l.categoryName}</td><td class="num">${fmt(l.amount)}</td></tr>`).join('')}
      <tr class="total"><td>Totaal uitgaven</td><td class="num">${fmt(pl.totalExpenses)}</td></tr></table>
      <table class="result"><tr class="grand"><td>Netto resultaat</td><td class="num">${fmt(pl.netResult)}</td></tr></table>
    `
  } else if (type === 'bs') {
    const bs = await buildBalanceSheet(period.to)
    title = `Balans per 31 december ${year}`
    body = `
      <h2>Activa</h2>
      <table>
        <tr><td>Saldo Mollie account</td><td class="num">${fmt(bs.mollieBalance)}</td></tr>
        ${bs.vatReceivable > 0 ? `<tr><td>BTW te ontvangen</td><td class="num">${fmt(bs.vatReceivable)}</td></tr>` : ''}
        <tr class="total"><td>Totaal activa</td><td class="num">${fmt(bs.totalAssets)}</td></tr>
      </table>
      <h2>Passiva &amp; Eigen Vermogen</h2>
      <table>
        <tr><td>Verplichting aan organisatoren</td><td class="num">${fmt(bs.payableToOrgs)}</td></tr>
        ${bs.vatPayable > 0 ? `<tr><td>BTW af te dragen</td><td class="num">${fmt(bs.vatPayable)}</td></tr>` : ''}
        <tr><td>Eigen vermogen</td><td class="num">${fmt(bs.equity)}</td></tr>
        <tr class="total"><td>Totaal passiva</td><td class="num">${fmt(bs.totalLiabilitiesEquity)}</td></tr>
      </table>
    `
  } else if (type === 'cf') {
    const cf = await buildCashFlow(period)
    title = `Kasstroomoverzicht ${year}`
    body = `
      <h2>Operationele activiteiten</h2>
      <table>
        <tr><td>Inkomsten</td><td class="num">${fmt(cf.operatingIncome)}</td></tr>
        <tr><td>Uitgaven (operationeel)</td><td class="num">${fmt(-cf.operatingExpenses)}</td></tr>
        <tr class="total"><td>Netto operationele kasstroom</td><td class="num">${fmt(cf.netOperatingCashFlow)}</td></tr>
      </table>
      <h2>Financieringsactiviteiten</h2>
      <table>
        <tr><td>Privé-onttrekkingen</td><td class="num">${fmt(-cf.privateWithdrawals)}</td></tr>
      </table>
      <h2>Mutatie kasstand</h2>
      <table>
        <tr><td>Kasstand begin ${year}</td><td class="num">${fmt(cf.cashStart)}</td></tr>
        <tr><td>Netto kasstroom</td><td class="num">${fmt(cf.netCashFlow)}</td></tr>
        <tr class="grand"><td>Kasstand eind ${year}</td><td class="num">${fmt(cf.cashEnd)}</td></tr>
      </table>
    `
  }

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  @page { size: A4; margin: 16mm 14mm 18mm; }
  @media print { .no-print { display: none !important; } body { background: #fff !important; } }
  html, body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; color: #0f172a; background: #f7f8fa; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { max-width: 760px; margin: 0 auto; padding: 32px 40px; background: #fff; }
  @media print { .page { max-width: none; padding: 0; } }
  .toolbar { position: sticky; top: 0; background: #0c4a6e; color: #fff; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; }
  .btn { background: #fff; color: #0c4a6e; padding: 7px 16px; border-radius: 7px; text-decoration: none; font-weight: 700; font-size: 13px; }
  h1 { font-size: 22px; margin: 0 0 6px; letter-spacing: -0.3px; }
  .subtitle { color: #64748b; font-size: 12px; margin-bottom: 26px; }
  h2 { font-size: 14px; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #0ea5e9; color: #0c4a6e; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 8px; }
  td { padding: 6px 8px; }
  .num { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; text-align: right; font-variant-numeric: tabular-nums; }
  tr.total td { border-top: 1px solid #cbd5e1; padding-top: 8px; font-weight: 700; }
  tr.grand td { border-top: 2px solid #0f172a; padding: 10px 8px; font-weight: 800; font-size: 14px; }
  table.result { margin-top: 14px; }
  .meta { color: #64748b; font-size: 11px; margin-top: 30px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 14px; }
</style>
</head>
<body>
  <div class="no-print toolbar">
    <span style="font-size:14px;font-weight:700">📄 ${title}</span>
    <a class="btn" href="javascript:window.print()">⬇ Opslaan als PDF</a>
  </div>
  <div class="page">
    <h1>${title}</h1>
    <div class="subtitle">Boekjaar ${year} · Gegenereerd op ${new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
    ${body}
    <div class="meta">Boekhouding TicketFlow · enkelvoudige boekhouding · alle bedragen in EUR incl. BTW tenzij anders vermeld</div>
  </div>
  <script>
    if (window.location.search.includes('print=1')) setTimeout(() => window.print(), 400);
  </script>
</body>
</html>`

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
