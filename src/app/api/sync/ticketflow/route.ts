import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, newId } from '@/lib/db'
import { buildOrgSnapshots, fetchAllInvoices } from '@/lib/ticketflow'

export const runtime = 'nodejs'

// Sync-model — boekhoudkundig correct voor TicketFlow platform:
//
// INKOMSTEN (op moment van ticket-verkoop):
//   - Service fee: €0,85 per VERKOCHT TICKET → Omzet servicekosten (21% BTW)
//   - Refund fee:  €0,50 per TERUGBETAALD TICKET → Omzet servicekosten
//   - Facturen (maatwerksites, refund-facturen, broadcast-facturen):
//       Open factuur  → omzet + debiteur
//       Betaalde fact → omzet (geld is binnen)
//
// UITGAVEN (op moment van ticket-verkoop):
//   - Mollie kost: €0,29 per UNIEKE MOLLIE ORDER (niet per ticket!)
//     → Bankkosten & transactiekosten (0% BTW)
//
// BALANS:
//   - Activa: Saldo Mollie (bruto - uitbetaald), Debiteuren (open facturen)
//   - Passiva: Verplichting aan organisatoren
//
// Bedragen komen uit TicketFlow platform_settings (fallback hardcoded).

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { snapshots, rates } = await buildOrgSnapshots()
    const syncedRes = await db.execute('select external_id from ticketflow_sync')
    const synced = new Set(syncedRes.rows.map(r => (r as unknown as { external_id: string }).external_id))

    const today = new Date().toISOString().slice(0, 10)
    let feesAdded = 0
    let mollieAdded = 0
    let refundAdded = 0
    let invoicesAdded = 0

    function previousCount(prefix: string): number {
      return [...synced]
        .filter(k => k.startsWith(prefix))
        .map(k => parseInt(k.split('-').pop() || '0', 10))
        .reduce((max, n) => Math.max(max, n), 0)
    }

    for (const s of snapshots) {
      // ── Service fees per verkochte ticket ──────────────────────────────
      if (s.tickets_sold > 0) {
        const key = `fees-${s.org_id}-${s.tickets_sold}`
        if (!synced.has(key)) {
          const delta = s.tickets_sold - previousCount(`fees-${s.org_id}-`)
          if (delta > 0) {
            const txId = newId()
            await db.execute({
              sql: `insert into transactions (id, date, description, amount_cents, type, vat_rate, category_id, source, external_id, ai_categorised, needs_review, notes)
                    values (?, ?, ?, ?, 'income', 21, 'cat-omzet-fees', 'ticketflow', ?, 0, 0, ?)`,
              args: [txId, today, `Servicekosten ${s.org_name} — ${delta} ticket${delta === 1 ? '' : 's'}`,
                delta * rates.serviceFee, key,
                `Org: ${s.org_name} · ${delta} tickets × €${(rates.serviceFee / 100).toFixed(2)}`],
            })
            await db.execute({ sql: `insert into ticketflow_sync (external_id, kind, transaction_id) values (?, 'service-fee', ?)`, args: [key, txId] })
            feesAdded++
          }
        }
      }

      // ── Mollie transactiekosten per UNIEKE ORDER (niet per ticket) ─────
      if (s.unique_orders > 0) {
        const key = `mollie-${s.org_id}-${s.unique_orders}`
        if (!synced.has(key)) {
          const delta = s.unique_orders - previousCount(`mollie-${s.org_id}-`)
          if (delta > 0) {
            const txId = newId()
            await db.execute({
              sql: `insert into transactions (id, date, description, amount_cents, type, vat_rate, category_id, source, external_id, ai_categorised, needs_review, notes)
                    values (?, ?, ?, ?, 'expense', 0, 'cat-bank', 'ticketflow', ?, 0, 0, ?)`,
              args: [txId, today, `Mollie transactiekosten ${s.org_name} — ${delta} order${delta === 1 ? '' : 's'}`,
                delta * rates.mollieCost, key,
                `Org: ${s.org_name} · ${delta} orders × €${(rates.mollieCost / 100).toFixed(2)}`],
            })
            await db.execute({ sql: `insert into ticketflow_sync (external_id, kind, transaction_id) values (?, 'mollie-cost', ?)`, args: [key, txId] })
            mollieAdded++
          }
        }
      }

      // ── Refund fees ────────────────────────────────────────────────────
      if (s.refunds > 0) {
        const key = `refund-${s.org_id}-${s.refunds}`
        if (!synced.has(key)) {
          const delta = s.refunds - previousCount(`refund-${s.org_id}-`)
          if (delta > 0) {
            const txId = newId()
            await db.execute({
              sql: `insert into transactions (id, date, description, amount_cents, type, vat_rate, category_id, source, external_id, ai_categorised, needs_review, notes)
                    values (?, ?, ?, ?, 'income', 21, 'cat-omzet-fees', 'ticketflow', ?, 0, 0, ?)`,
              args: [txId, today, `Refund fees ${s.org_name} — ${delta} terugbetaling${delta === 1 ? '' : 'en'}`,
                delta * 50, key, `Org: ${s.org_name} · ${delta} refunds × €0,50`],
            })
            await db.execute({ sql: `insert into ticketflow_sync (external_id, kind, transaction_id) values (?, 'refund-fee', ?)`, args: [key, txId] })
            refundAdded++
          }
        }
      }
    }

    // ── Facturen: open = debiteur, paid = omzet (al geboekt) ─────────────
    const invoices = await fetchAllInvoices()
    for (const inv of invoices) {
      const extId = `invoice-${inv.id}`
      if (synced.has(extId)) continue
      const amount = Number(inv.amount || 0)
      if (amount <= 0) continue

      const date = inv.created_at.slice(0, 10)
      const isPaid = inv.status === 'paid'
      const statusLabel = isPaid ? '✓ Betaald' : '⏳ Openstaand (debiteur)'
      const noteParts = [
        `Status: ${inv.status}`,
        inv.period_label ? `Periode: ${inv.period_label}` : null,
        inv.org_name ? `Klant: ${inv.org_name}` : null,
        inv.notes,
      ].filter(Boolean)

      const txId = newId()
      await db.execute({
        sql: `insert into transactions (id, date, description, amount_cents, type, vat_rate, category_id, source, external_id, ai_categorised, needs_review, notes)
              values (?, ?, ?, ?, 'income', 21, 'cat-omzet-overig', 'ticketflow', ?, 0, ?, ?)`,
        args: [txId, date, `Factuur ${inv.invoice_number || inv.id.slice(0, 8)} — ${statusLabel}`,
          amount, extId, isPaid ? 0 : 1, noteParts.join(' · ')],
      })
      await db.execute({ sql: `insert into ticketflow_sync (external_id, kind, transaction_id) values (?, 'invoice', ?)`, args: [extId, txId] })
      invoicesAdded++
    }

    // ── Balans-snapshot ────────────────────────────────────────────────────
    const totalPayable = snapshots.reduce((s, o) => s + o.payable, 0)
    const mollieBalance = snapshots.reduce((s, o) => s + o.gross_revenue - o.payouts_total, 0)
    const totalDebtors = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + Number(i.amount || 0), 0)
    await db.execute({
      sql: 'insert into payable_snapshot (id, total_cents, mollie_balance, org_count, debtors_cents) values (?, ?, ?, ?, ?)',
      args: [newId(), totalPayable, mollieBalance, snapshots.length, totalDebtors],
    })

    return NextResponse.json({
      ok: true,
      feesAdded, mollieAdded, refundAdded, invoicesAdded,
      orgsProcessed: snapshots.length,
      totalPayable, mollieBalance, totalDebtors,
      rates,
      message: `${feesAdded} servicekosten + ${mollieAdded} Mollie-kosten + ${refundAdded} refunds + ${invoicesAdded} facturen voor ${snapshots.length} organisator(en). Mollie saldo: €${(mollieBalance / 100).toFixed(2)} · Debiteuren: €${(totalDebtors / 100).toFixed(2)} · Verplichting aan orgs: €${(totalPayable / 100).toFixed(2)}`,
    })
  } catch (err) {
    console.error('ticketflow sync failed', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync mislukt' }, { status: 500 })
  }
}

export async function DELETE() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const synced = await db.execute('select transaction_id from ticketflow_sync where transaction_id is not null')
  const ids = synced.rows.map(r => (r as unknown as { transaction_id: string }).transaction_id).filter(Boolean)
  for (const id of ids) {
    await db.execute({ sql: 'delete from transactions where id = ?', args: [id] })
  }
  await db.execute('delete from ticketflow_sync')
  await db.execute('delete from payable_snapshot')
  return NextResponse.json({ ok: true, deleted: ids.length, message: `${ids.length} TicketFlow-transacties gewist.` })
}
