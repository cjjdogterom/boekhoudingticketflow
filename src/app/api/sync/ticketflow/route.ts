import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, newId } from '@/lib/db'
import { buildOrgSnapshots, fetchAllInvoices } from '@/lib/ticketflow'

export const runtime = 'nodejs'

// Sync-model voor TicketFlow platform — boekhoudkundig schoon:
//
// W&V (winst en verlies) — alleen werkelijke inkomsten:
//   ✓ Service fee €0,85 per ticket → Omzet servicekosten
//   ✓ Refund fee €0,50 per refund → Omzet servicekosten
//   ✓ BETAALDE facturen (maatwerk + broadcasts + refunds) → Omzet overig
//   ✗ Mollie kosten worden NIET geboekt (al door Mollie verrekend op het
//     Mollie-account vóór jij het geld ziet — geen apart in/uit van jouw kas)
//   ✗ Open facturen NIET als omzet — alleen op balans als debiteur
//
// Balans:
//   Activa:
//     Saldo Mollie = bruto tickets − Mollie kosten − uitbetalingen
//     Debiteuren = som open facturen
//   Passiva:
//     Verplichting aan organisatoren = bruto − service fees − Mollie − refunds − uitbetaald

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { snapshots, rates } = await buildOrgSnapshots()
    const syncedRes = await db.execute('select external_id from ticketflow_sync')
    const synced = new Set(syncedRes.rows.map(r => (r as unknown as { external_id: string }).external_id))

    const today = new Date().toISOString().slice(0, 10)
    let feesAdded = 0
    let refundAdded = 0
    let invoicesAdded = 0

    function previousCount(prefix: string): number {
      return [...synced]
        .filter(k => k.startsWith(prefix))
        .map(k => parseInt(k.split('-').pop() || '0', 10))
        .reduce((max, n) => Math.max(max, n), 0)
    }

    for (const s of snapshots) {
      // ── Service fees per verkochte ticket (omzet) ──────────────────────
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
                `Org: ${s.org_name} · ${delta} tickets × €${(rates.serviceFee / 100).toFixed(2)} servicekosten`],
            })
            await db.execute({ sql: `insert into ticketflow_sync (external_id, kind, transaction_id) values (?, 'service-fee', ?)`, args: [key, txId] })
            feesAdded++
          }
        }
      }

      // ── Refund fees (omzet) ────────────────────────────────────────────
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

    // ── Facturen: ALLEEN betaalde facturen op W&V als omzet ──────────────
    // Open facturen worden NIET als income transactie geboekt — die staan
    // alleen op de balans als Debiteuren. Bij volgende sync, als status
    // verandert naar paid, dan WEL een transactie aanmaken.
    const invoices = await fetchAllInvoices()
    for (const inv of invoices) {
      const isPaid = inv.status === 'paid'
      const extId = isPaid ? `invoice-paid-${inv.id}` : null   // open facturen: geen tx maken
      if (!extId) continue
      if (synced.has(extId)) continue
      const amount = Number(inv.amount || 0)
      if (amount <= 0) continue

      const date = inv.created_at.slice(0, 10)
      const noteParts = [
        inv.period_label ? `Periode: ${inv.period_label}` : null,
        inv.org_name ? `Klant: ${inv.org_name}` : null,
        inv.notes,
      ].filter(Boolean)

      const txId = newId()
      await db.execute({
        sql: `insert into transactions (id, date, description, amount_cents, type, vat_rate, category_id, source, external_id, ai_categorised, needs_review, notes)
              values (?, ?, ?, ?, 'income', 21, 'cat-omzet-overig', 'ticketflow', ?, 0, 0, ?)`,
        args: [txId, date, `Factuur ${inv.invoice_number || inv.id.slice(0, 8)} — ✓ Betaald`,
          amount, extId, noteParts.join(' · ')],
      })
      await db.execute({ sql: `insert into ticketflow_sync (external_id, kind, transaction_id) values (?, 'invoice-paid', ?)`, args: [extId, txId] })
      invoicesAdded++
    }

    // ── Balans-snapshot ────────────────────────────────────────────────────
    // Mollie saldo = bruto tickets − Mollie kosten (al ingehouden) − uitbetalingen
    const mollieBalance = snapshots.reduce(
      (s, o) => s + o.gross_revenue - o.mollie_costs - o.payouts_total,
      0,
    )
    // Verplichting aan organisatoren (al berekend in snapshot)
    const totalPayable = snapshots.reduce((s, o) => s + o.payable, 0)
    // Debiteuren = open facturen
    const totalDebtors = invoices
      .filter(i => i.status !== 'paid')
      .reduce((s, i) => s + Number(i.amount || 0), 0)

    await db.execute({
      sql: 'insert into payable_snapshot (id, total_cents, mollie_balance, org_count, debtors_cents) values (?, ?, ?, ?, ?)',
      args: [newId(), totalPayable, mollieBalance, snapshots.length, totalDebtors],
    })

    return NextResponse.json({
      ok: true,
      feesAdded, refundAdded, invoicesAdded,
      orgsProcessed: snapshots.length,
      totalPayable, mollieBalance, totalDebtors,
      rates,
      message: `${feesAdded} servicekosten + ${refundAdded} refunds + ${invoicesAdded} betaalde facturen voor ${snapshots.length} organisator(en). Mollie saldo: €${(mollieBalance / 100).toFixed(2)} · Debiteuren: €${(totalDebtors / 100).toFixed(2)} · Verplichting aan orgs: €${(totalPayable / 100).toFixed(2)}`,
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
