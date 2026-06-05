import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db, newId } from '@/lib/db'
import { buildOrgSnapshots, fetchAllInvoices, fetchAllPaidTickets, fetchAllPayouts, REFUND_FEE_CENTS } from '@/lib/ticketflow'
import { ACCOUNTS, classifyInvoiceRevenueAccount, createJournalEntryIfMissing, ensureJournalSchema, splitVatInclusive } from '@/lib/journal'

export const runtime = 'nodejs'

// Sync-model voor TicketFlow platform — boekhoudkundig schoon:
//
// W&V (winst en verlies) — TicketFlow omzet:
//   ✓ Service fee €0,85 per ticket → Omzet servicekosten
//   ✓ Refund fee €0,50 per refund → Omzet servicekosten
//   ✓ Facturen (maatwerk + broadcasts + refunds) → Debiteuren + omzet + btw
//   ✗ Mollie kosten worden NIET geboekt (al door Mollie verrekend op het
//     Mollie-account vóór jij het geld ziet — geen apart in/uit van jouw kas)
//
// Balans:
//   Activa:
//     Saldo Mollie = bruto tickets − Mollie kosten − uitbetalingen
//     Debiteuren = som open facturen
//   Passiva:
//     Verplichting aan organisatoren = bruto − service fees − Mollie − refunds − uitbetaald

function invoiceLabel(inv: { invoice_number: string | null; id: string }) {
  return inv.invoice_number || inv.id.slice(0, 8)
}

function revenueLines(grossCents: number, accountId: string, description: string) {
  const { net, vat } = splitVatInclusive(grossCents, 21)
  return [
    { account_id: accountId, credit_cents: net, description },
    ...(vat > 0 ? [{ account_id: ACCOUNTS.vatPayable, credit_cents: vat, description: 'BTW 21%' }] : []),
  ]
}

export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    await ensureJournalSchema()
    const { snapshots, rates } = await buildOrgSnapshots()
    const syncedRes = await db.execute('select external_id from ticketflow_sync')
    const synced = new Set(syncedRes.rows.map(r => (r as unknown as { external_id: string }).external_id))

    const today = new Date().toISOString().slice(0, 10)
    let feesAdded = 0
    let refundAdded = 0
    let invoicesAdded = 0
    let journalAdded = 0

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

    // ── Journaalposten: echte TicketFlow feiten, per item idempotent ──────
    // Ticketbetaling: Dr Mollie, Cr verplichting aan organisator.
    // TicketFlow fee: Dr verplichting organisator, Cr omzet + btw.
    // Mollie cost: Dr verplichting organisator, Cr Mollie.
    // Refund: Dr verplichting organisator, Cr Mollie.
    // Payout: Dr verplichting organisator, Cr Mollie.
    const [tickets, payouts] = await Promise.all([
      fetchAllPaidTickets(),
      fetchAllPayouts(),
    ])
    const orderIds = new Set<string>()
    for (const ticket of tickets) {
      if (ticket.price_paid > 0) {
        const ticketDate = ticket.created_at.slice(0, 10)
        if (await createJournalEntryIfMissing({
          date: ticketDate,
          description: `Ticketbetaling ${ticket.org_name}`,
          source: 'ticketflow',
          external_id: `ticket-payment-${ticket.id}`,
          notes: `Ticket ${ticket.id} · Event ${ticket.event_id}`,
          lines: [
            { account_id: ACCOUNTS.mollie, debit_cents: ticket.price_paid, description: 'Ontvangen op Mollie' },
            { account_id: ACCOUNTS.organizerPayable, credit_cents: ticket.price_paid, description: `Verschuldigd aan ${ticket.org_name}` },
          ],
        })) journalAdded++
      }

      if (await createJournalEntryIfMissing({
        date: ticket.created_at.slice(0, 10),
        description: `TicketFlow servicefee ${ticket.org_name}`,
        source: 'ticketflow',
        external_id: `ticket-service-fee-${ticket.id}`,
        notes: `Ticket ${ticket.id} · ${formatCents(rates.serviceFee)} incl. btw`,
        lines: [
          { account_id: ACCOUNTS.organizerPayable, debit_cents: rates.serviceFee, description: `Ingehouden op saldo ${ticket.org_name}` },
          ...revenueLines(rates.serviceFee, ACCOUNTS.revenueFees, 'TicketFlow servicekosten'),
        ],
      })) journalAdded++

      if (ticket.mollie_payment_id && !orderIds.has(ticket.mollie_payment_id)) {
        orderIds.add(ticket.mollie_payment_id)
        if (rates.mollieCost > 0 && await createJournalEntryIfMissing({
          date: ticket.created_at.slice(0, 10),
          description: `Mollie transactiekosten order ${ticket.mollie_payment_id.slice(0, 8)}`,
          source: 'ticketflow',
          external_id: `mollie-cost-${ticket.mollie_payment_id}`,
          notes: `Mollie kosten worden niet extra als TicketFlow fee gerekend; ze verlagen Mollie saldo en organisatorverplichting.`,
          lines: [
            { account_id: ACCOUNTS.organizerPayable, debit_cents: rates.mollieCost, description: 'Kosten verrekend met organisator' },
            { account_id: ACCOUNTS.mollie, credit_cents: rates.mollieCost, description: 'Door Mollie ingehouden' },
          ],
        })) journalAdded++
      }

      if (ticket.refunded_at && ticket.price_paid > 0) {
        const refundDate = ticket.refunded_at.slice(0, 10)
        if (await createJournalEntryIfMissing({
          date: refundDate,
          description: `Refund ticket ${ticket.org_name}`,
          source: 'ticketflow',
          external_id: `ticket-refund-${ticket.id}`,
          notes: `Terugbetaling ticket ${ticket.id}`,
          lines: [
            { account_id: ACCOUNTS.organizerPayable, debit_cents: ticket.price_paid, description: `Minder verschuldigd aan ${ticket.org_name}` },
            { account_id: ACCOUNTS.mollie, credit_cents: ticket.price_paid, description: 'Terugbetaald via Mollie' },
          ],
        })) journalAdded++

        if (await createJournalEntryIfMissing({
          date: refundDate,
          description: `TicketFlow refundfee ${ticket.org_name}`,
          source: 'ticketflow',
          external_id: `ticket-refund-fee-${ticket.id}`,
          notes: `Refund fee ${formatCents(REFUND_FEE_CENTS)} incl. btw`,
          lines: [
            { account_id: ACCOUNTS.organizerPayable, debit_cents: REFUND_FEE_CENTS, description: `Ingehouden op saldo ${ticket.org_name}` },
            ...revenueLines(REFUND_FEE_CENTS, ACCOUNTS.revenueRefunds, 'TicketFlow refundkosten'),
          ],
        })) journalAdded++
      }
    }

    for (const payout of payouts) {
      if (payout.status !== 'paid') continue
      const amount = Number(payout.amount_paid || payout.amount || 0)
      if (amount <= 0) continue
      if (await createJournalEntryIfMissing({
        date: payout.created_at.slice(0, 10),
        description: `Uitbetaling organisator`,
        source: 'ticketflow',
        external_id: `payout-${payout.id}`,
        notes: `Organisator ${payout.org_id}`,
        lines: [
          { account_id: ACCOUNTS.organizerPayable, debit_cents: amount, description: 'Verplichting afgeboekt' },
          { account_id: ACCOUNTS.mollie, credit_cents: amount, description: 'Uitbetaald vanaf Mollie' },
        ],
      })) journalAdded++
    }

    // ── Facturen ─────────────────────────────────────────────────────────
    // Journaal: factuur verstuurd = debiteuren + omzet/btw. Betaling boekt
    // debiteuren af naar bank. De oude simpele transaction-lijst blijft
    // cash-basis en maakt alleen een income-transactie als de factuur betaald is.
    const invoices = await fetchAllInvoices()
    for (const inv of invoices) {
      const amount = Number(inv.amount || 0)
      if (amount > 0) {
        const revenueAccount = classifyInvoiceRevenueAccount(inv)
        if (await createJournalEntryIfMissing({
          date: inv.created_at.slice(0, 10),
          description: `Factuur ${invoiceLabel(inv)} verstuurd`,
          source: 'ticketflow',
          external_id: `invoice-issued-${inv.id}`,
          notes: [
            inv.status !== 'paid' ? 'Openstaande factuur' : 'Factuur geboekt; betaling apart verwerkt',
            inv.period_label ? `Periode: ${inv.period_label}` : null,
            inv.org_name ? `Klant: ${inv.org_name}` : null,
            inv.notes,
          ].filter(Boolean).join(' · '),
          lines: [
            { account_id: ACCOUNTS.debtors, debit_cents: amount, description: inv.org_name || 'Debiteur' },
            ...revenueLines(amount, revenueAccount, `Factuur ${invoiceLabel(inv)}`),
          ],
        })) journalAdded++
      }

      if (inv.status === 'paid') {
        const paidAmount = Number(inv.amount_paid || inv.amount || 0)
        if (paidAmount > 0 && await createJournalEntryIfMissing({
          date: inv.created_at.slice(0, 10),
          description: `Factuur ${invoiceLabel(inv)} betaald`,
          source: 'ticketflow',
          external_id: `invoice-payment-${inv.id}`,
          notes: inv.org_name ? `Klant: ${inv.org_name}` : null,
          lines: [
            { account_id: ACCOUNTS.bank, debit_cents: paidAmount, description: 'Ontvangen betaling' },
            { account_id: ACCOUNTS.debtors, credit_cents: paidAmount, description: 'Debiteur afgeboekt' },
          ],
        })) journalAdded++
      }

      const isPaid = inv.status === 'paid'
      const extId = isPaid ? `invoice-paid-${inv.id}` : null   // open facturen: geen tx maken
      if (!extId) continue
      if (synced.has(extId)) continue
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
      feesAdded, refundAdded, invoicesAdded, journalAdded,
      orgsProcessed: snapshots.length,
      totalPayable, mollieBalance, totalDebtors,
      rates,
      message: `${feesAdded} servicekosten + ${refundAdded} refunds + ${invoicesAdded} betaalde facturen + ${journalAdded} journaalposten voor ${snapshots.length} organisator(en). Mollie saldo: €${(mollieBalance / 100).toFixed(2)} · Debiteuren: €${(totalDebtors / 100).toFixed(2)} · Verplichting aan orgs: €${(totalPayable / 100).toFixed(2)}`,
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
  await ensureJournalSchema()
  await db.execute({ sql: `delete from journal_entries where source = ?`, args: ['ticketflow'] })
  return NextResponse.json({ ok: true, deleted: ids.length, message: `${ids.length} TicketFlow-transacties en alle TicketFlow-journaalposten gewist.` })
}

function formatCents(cents: number) {
  return `€${(cents / 100).toFixed(2).replace('.', ',')}`
}
