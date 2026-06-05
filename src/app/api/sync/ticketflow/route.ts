import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, newId } from '@/lib/db'
import { fetchOwnerOrgId, fetchInvoices } from '@/lib/ticketflow'

export const runtime = 'nodejs'

// POST /api/sync/ticketflow
//
// Synchronisation logic (netto-model):
// - INVOICES: facturen die TicketFlow stuurt naar organisatoren →
//   dit is JOUW omzet (servicekosten). Geboekt als income onder
//   "Omzet servicekosten". Open facturen krijgen needs_review = 1.
// - PAYOUTS: uitbetalingen aan organisatoren worden NIET geïmporteerd.
//   Dit is geld dat door TicketFlow heen loopt naar de klant — geen
//   boekhoudkundige impact voor TicketFlow zelf, de €0,85 service fee
//   per ticket is al in de facturen verwerkt.
export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const orgId = await fetchOwnerOrgId()
    if (!orgId) {
      return NextResponse.json({ error: 'Geen TicketFlow organisatie gevonden voor dogteromc03@gmail.com' }, { status: 404 })
    }

    const syncedRes = await db.execute('select external_id from ticketflow_sync')
    const synced = new Set(syncedRes.rows.map(r => (r as unknown as { external_id: string }).external_id))

    let invoicesAdded = 0

    const invoices = await fetchInvoices(orgId)
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
      // Facturen → income, categorie "Omzet servicekosten" (21% BTW)
      await db.execute({
        sql: `insert into transactions (id, date, description, amount_cents, type, vat_rate, category_id, source, external_id, ai_categorised, needs_review, notes)
              values (?, ?, ?, ?, 'income', 21, 'cat-omzet-fees', 'ticketflow', ?, 0, ?, ?)`,
        args: [
          txId,
          date,
          `TicketFlow factuur ${inv.invoice_number || inv.id.slice(0, 8)} — ${statusLabel}`,
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

    return NextResponse.json({
      ok: true,
      invoicesAdded,
      message: `${invoicesAdded} facturen geïmporteerd als omzet. Open facturen staan in "Te beoordelen" tot je ze als ontvangen markeert.`,
    })
  } catch (err) {
    console.error('ticketflow sync failed', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync mislukt' }, { status: 500 })
  }
}

// DELETE /api/sync/ticketflow — wist alle eerder geïmporteerde TicketFlow
// transacties zodat een verse sync gedaan kan worden (na een logica-fix).
export async function DELETE() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const synced = await db.execute('select transaction_id from ticketflow_sync where transaction_id is not null')
  const ids = synced.rows.map(r => (r as unknown as { transaction_id: string }).transaction_id).filter(Boolean)

  for (const id of ids) {
    await db.execute({ sql: 'delete from transactions where id = ?', args: [id] })
  }
  await db.execute('delete from ticketflow_sync')

  return NextResponse.json({ ok: true, deleted: ids.length, message: `${ids.length} TicketFlow-transacties gewist.` })
}
