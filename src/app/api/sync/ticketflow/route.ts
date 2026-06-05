import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, newId } from '@/lib/db'
import { buildOrgSnapshots, fetchAllInvoices } from '@/lib/ticketflow'

export const runtime = 'nodejs'

// POST /api/sync/ticketflow
//
// Sync-model (per organisator geaggregeerd, boeking op moment van ticket-aankoop):
// - €0,85 per verkocht ticket = inkomst "Omzet servicekosten"
// - €0,32 per verkocht ticket = uitgave "Bankkosten & transactiekosten" (Mollie)
// - €0,50 per terugbetaald ticket = inkomst "Omzet servicekosten"
// - Facturen = inkomst "Omzet overig" (maatwerksites / refund facturen)
// - Verplichting aan organisatoren = bruto - fees - Mollie - uitbetaald → balans-snapshot
//
// Dedup: per (org_id + tickets-aantal-tot-nu-toe) zodat we incrementeel kunnen syncen
// zonder dubbel te boeken.
export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const snapshots = await buildOrgSnapshots()
    const syncedRes = await db.execute('select external_id from ticketflow_sync')
    const synced = new Set(syncedRes.rows.map(r => (r as unknown as { external_id: string }).external_id))

    const today = new Date().toISOString().slice(0, 10)
    let feesAdded = 0
    let mollieAdded = 0
    let refundAdded = 0
    let invoicesAdded = 0

    // ── Per organisator: bereken delta sinds laatste sync ─────────────────
    for (const s of snapshots) {
      // Service fees
      const feeKey = `fees-${s.org_id}-${s.tickets_sold}`
      if (!synced.has(feeKey) && s.tickets_sold > 0) {
        // Bepaal welk aantal tickets al gesynced is voor deze org (laatste fees-key)
        const prev = [...synced].filter(k => k.startsWith(`fees-${s.org_id}-`))
          .map(k => parseInt(k.split('-').pop() || '0', 10))
          .reduce((max, n) => Math.max(max, n), 0)
        const delta = s.tickets_sold - prev
        if (delta > 0) {
          const txId = newId()
          await db.execute({
            sql: `insert into transactions (id, date, description, amount_cents, type, vat_rate, category_id, source, external_id, ai_categorised, needs_review, notes)
                  values (?, ?, ?, ?, 'income', 21, 'cat-omzet-fees', 'ticketflow', ?, 0, 0, ?)`,
            args: [
              txId,
              today,
              `Servicekosten ${s.org_name} — ${delta} ticket${delta === 1 ? '' : 's'}`,
              delta * 85,
              feeKey,
              `Org: ${s.org_name} · ${delta} tickets × €0,85`,
            ],
          })
          await db.execute({
            sql: `insert into ticketflow_sync (external_id, kind, transaction_id) values (?, 'service-fee', ?)`,
            args: [feeKey, txId],
          })
          feesAdded++
        }
      }

      // Mollie kosten (€0,32 per ticket)
      const mollieKey = `mollie-${s.org_id}-${s.tickets_sold}`
      if (!synced.has(mollieKey) && s.tickets_sold > 0) {
        const prev = [...synced].filter(k => k.startsWith(`mollie-${s.org_id}-`))
          .map(k => parseInt(k.split('-').pop() || '0', 10))
          .reduce((max, n) => Math.max(max, n), 0)
        const delta = s.tickets_sold - prev
        if (delta > 0) {
          const txId = newId()
          await db.execute({
            sql: `insert into transactions (id, date, description, amount_cents, type, vat_rate, category_id, source, external_id, ai_categorised, needs_review, notes)
                  values (?, ?, ?, ?, 'expense', 0, 'cat-bank', 'ticketflow', ?, 0, 0, ?)`,
            args: [
              txId,
              today,
              `Mollie transactiekosten ${s.org_name} — ${delta} ticket${delta === 1 ? '' : 's'}`,
              delta * 32,
              mollieKey,
              `Org: ${s.org_name} · ${delta} tickets × €0,32`,
            ],
          })
          await db.execute({
            sql: `insert into ticketflow_sync (external_id, kind, transaction_id) values (?, 'mollie-cost', ?)`,
            args: [mollieKey, txId],
          })
          mollieAdded++
        }
      }

      // Refund fees (€0,50 per terugbetaald ticket)
      if (s.refunds > 0) {
        const refundKey = `refund-${s.org_id}-${s.refunds}`
        if (!synced.has(refundKey)) {
          const prev = [...synced].filter(k => k.startsWith(`refund-${s.org_id}-`))
            .map(k => parseInt(k.split('-').pop() || '0', 10))
            .reduce((max, n) => Math.max(max, n), 0)
          const delta = s.refunds - prev
          if (delta > 0) {
            const txId = newId()
            await db.execute({
              sql: `insert into transactions (id, date, description, amount_cents, type, vat_rate, category_id, source, external_id, ai_categorised, needs_review, notes)
                    values (?, ?, ?, ?, 'income', 21, 'cat-omzet-fees', 'ticketflow', ?, 0, 0, ?)`,
              args: [
                txId,
                today,
                `Refund fees ${s.org_name} — ${delta} terugbetaling${delta === 1 ? '' : 'en'}`,
                delta * 50,
                refundKey,
                `Org: ${s.org_name} · ${delta} refunds × €0,50`,
              ],
            })
            await db.execute({
              sql: `insert into ticketflow_sync (external_id, kind, transaction_id) values (?, 'refund-fee', ?)`,
              args: [refundKey, txId],
            })
            refundAdded++
          }
        }
      }
    }

    // ── Facturen (maatwerksites + refund-facturen) als inkomst ────────────
    const invoices = await fetchAllInvoices()
    for (const inv of invoices) {
      const extId = `invoice-${inv.id}`
      if (synced.has(extId)) continue
      const amount = Number(inv.amount || 0)
      if (amount <= 0) continue

      const date = inv.created_at.slice(0, 10)
      const isPaid = inv.status === 'paid'
      const statusLabel = isPaid ? '✓ Betaald' : '⏳ Open / nog niet ontvangen'
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
        args: [
          txId,
          date,
          `Factuur ${inv.invoice_number || inv.id.slice(0, 8)} — ${statusLabel}`,
          amount,
          extId,
          isPaid ? 0 : 1,
          noteParts.join(' · '),
        ],
      })
      await db.execute({
        sql: `insert into ticketflow_sync (external_id, kind, transaction_id) values (?, 'invoice', ?)`,
        args: [extId, txId],
      })
      invoicesAdded++
    }

    // ── Balance snapshot opslaan ───────────────────────────────────────────
    const totalPayable = snapshots.reduce((s, o) => s + o.payable, 0)
    const mollieBalance = snapshots.reduce((s, o) => s + o.gross_revenue - o.payouts_total, 0)
    // Open facturen = debiteuren (geboekt maar nog niet ontvangen)
    const totalDebtors = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + Number(i.amount || 0), 0)
    await db.execute({
      sql: 'insert into payable_snapshot (id, total_cents, mollie_balance, org_count, debtors_cents) values (?, ?, ?, ?, ?)',
      args: [newId(), totalPayable, mollieBalance, snapshots.length, totalDebtors],
    })

    return NextResponse.json({
      ok: true,
      feesAdded, mollieAdded, refundAdded, invoicesAdded,
      orgsProcessed: snapshots.length,
      totalPayable,
      mollieBalance,
      message: `${feesAdded} servicekosten + ${mollieAdded} Mollie-kosten + ${refundAdded} refunds + ${invoicesAdded} facturen geboekt voor ${snapshots.length} organisator(en).`,
    })
  } catch (err) {
    console.error('ticketflow sync failed', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync mislukt' }, { status: 500 })
  }
}

// DELETE /api/sync/ticketflow — wist alle eerder geïmporteerde transacties
// + balance snapshots zodat een schone sync gedaan kan worden.
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
