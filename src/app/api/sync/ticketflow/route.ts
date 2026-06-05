import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, newId } from '@/lib/db'
import { fetchOwnerOrgId, fetchPayouts, fetchInvoices } from '@/lib/ticketflow'

export const runtime = 'nodejs'

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const orgId = await fetchOwnerOrgId()
    if (!orgId) {
      return NextResponse.json({ error: 'Geen TicketFlow organisatie gevonden voor dogteromc03@gmail.com' }, { status: 404 })
    }

    // Already-synced external IDs
    const syncedRes = await db.execute('select external_id from ticketflow_sync')
    const synced = new Set(syncedRes.rows.map(r => (r as unknown as { external_id: string }).external_id))

    let payoutsAdded = 0
    let invoicesAdded = 0

    // ── Payouts (uitbetalingen → uitgaven categorie "Privé-onttrekking") ──
    const payouts = await fetchPayouts(orgId)
    for (const p of payouts) {
      if (p.status !== 'paid') continue
      const extId = `payout-${p.id}`
      if (synced.has(extId)) continue
      const amount = Number(p.amount_paid || p.amount || 0)
      if (amount <= 0) continue

      const date = (p.transferred_at || p.created_at).slice(0, 10)
      const txId = newId()
      await db.execute({
        sql: `insert into transactions (id, date, description, amount_cents, type, vat_rate, category_id, source, external_id, ai_categorised, notes)
              values (?, ?, ?, ?, 'expense', 0, 'cat-prive', 'ticketflow', ?, 0, ?)`,
        args: [
          txId,
          date,
          `TicketFlow uitbetaling${p.reference ? ` ${p.reference}` : ''}${p.period_label ? ` — ${p.period_label}` : ''}`,
          amount,
          extId,
          p.note || null,
        ],
      })
      await db.execute({
        sql: `insert into ticketflow_sync (external_id, kind, transaction_id) values (?, 'payout', ?)`,
        args: [extId, txId],
      })
      payoutsAdded++
    }

    // ── Invoices (facturen van TicketFlow aan organisatoren) ──
    // Voor de owner-org zelf: dit zijn KOSTEN (servicekosten die TicketFlow rekent).
    const invoices = await fetchInvoices(orgId)
    for (const inv of invoices) {
      const extId = `invoice-${inv.id}`
      if (synced.has(extId)) continue
      const amount = Number(inv.amount || 0)
      if (amount <= 0) continue

      const date = (inv.paid_at || inv.due_date || inv.created_at).slice(0, 10)
      const vatTotal = Number(inv.vat_amount || 0)
      const vatRate = vatTotal > 0 && amount > vatTotal ? 21 : 0

      const txId = newId()
      await db.execute({
        sql: `insert into transactions (id, date, description, amount_cents, type, vat_rate, category_id, source, external_id, ai_categorised, notes)
              values (?, ?, ?, ?, 'expense', ?, 'cat-software', 'ticketflow', ?, 0, ?)`,
        args: [
          txId,
          date,
          `TicketFlow factuur ${inv.invoice_number || inv.id.slice(0, 8)}${inv.description ? ` — ${inv.description}` : ''}`,
          amount,
          vatRate,
          extId,
          `Status: ${inv.status}`,
        ],
      })
      await db.execute({
        sql: `insert into ticketflow_sync (external_id, kind, transaction_id) values (?, 'invoice', ?)`,
        args: [extId, txId],
      })
      invoicesAdded++
    }

    return NextResponse.json({
      ok: true,
      payoutsAdded,
      invoicesAdded,
      message: `${payoutsAdded} uitbetalingen en ${invoicesAdded} facturen geïmporteerd.`,
    })
  } catch (err) {
    console.error('ticketflow sync failed', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync mislukt' }, { status: 500 })
  }
}
