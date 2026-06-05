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
    // Alle facturen (open EN betaald) worden geïmporteerd als uitgave.
    // Open facturen krijgen needs_review = 1 zodat ze opvallen tot ze
    // betaald zijn. Bij volgende sync worden ze niet opnieuw aangemaakt
    // (gededupliceerd via ticketflow_sync).
    const invoices = await fetchInvoices(orgId)
    for (const inv of invoices) {
      const extId = `invoice-${inv.id}`
      if (synced.has(extId)) continue
      const amount = Number(inv.amount || 0)
      if (amount <= 0) continue

      // Datum: bij open factuur de aanmaakdatum, bij betaalde factuur ook (we hebben geen paid_at veld).
      const date = inv.created_at.slice(0, 10)
      const isPaid = inv.status === 'paid'
      const statusLabel = isPaid ? '✓ Betaald' : '⏳ Open / nog niet betaald'
      const noteParts = [
        `Status: ${inv.status}`,
        inv.period_label ? `Periode: ${inv.period_label}` : null,
        inv.notes,
      ].filter(Boolean)

      const txId = newId()
      await db.execute({
        sql: `insert into transactions (id, date, description, amount_cents, type, vat_rate, category_id, source, external_id, ai_categorised, needs_review, notes)
              values (?, ?, ?, ?, 'expense', 21, 'cat-software', 'ticketflow', ?, 0, ?, ?)`,
        args: [
          txId,
          date,
          `TicketFlow factuur ${inv.invoice_number || inv.id.slice(0, 8)} — ${statusLabel}`,
          amount,
          extId,
          isPaid ? 0 : 1,   // needs_review = 1 voor open facturen
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
      payoutsAdded,
      invoicesAdded,
      message: `${payoutsAdded} uitbetalingen en ${invoicesAdded} facturen geïmporteerd.`,
    })
  } catch (err) {
    console.error('ticketflow sync failed', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync mislukt' }, { status: 500 })
  }
}
