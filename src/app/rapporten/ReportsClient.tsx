'use client'

import { useState, useCallback, useEffect } from 'react'
import type React from 'react'
import { UI, formatEuro, fontStack, inputStyle, labelStyle, primaryButtonStyle } from '@/lib/ui'
import type { ProfitLossReport, BalanceSheetReport, CashFlowReport } from '@/lib/reports'
import type { JournalEntry, JournalLine, LedgerAccount } from '@/lib/db'

type EntryWithLines = JournalEntry & {
  lines: Array<JournalLine & { account_code: string; account_name: string; account_type: LedgerAccount['type'] }>
  debit_total: number
  credit_total: number
  balanced: boolean
}

type DraftLine = {
  account_id: string
  description: string
  debit: string
  credit: string
}

interface Props {
  pl: ProfitLossReport
  bs: BalanceSheetReport
  cf: CashFlowReport
  yearNum: number
}

export default function ReportsClient({ pl, bs, cf, yearNum }: Props) {
  const balanceOk = bs.difference === 0
  const from = `${yearNum}-01-01`
  const to = `${yearNum}-12-31`

  const [modal, setModal] = useState<{ accountId: string; accountName: string } | null>(null)

  function openModal(accountId: string | undefined, accountName: string) {
    if (!accountId) return
    setModal({ accountId, accountName })
  }

  return (
    <div>
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

      <p style={{ color: UI.textMuted, fontSize: 12, marginBottom: 16 }}>
        Klik op een regel om de bijbehorende journaalposten te bekijken en aan te passen.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 16 }}>
        <ReportCard title="Winst- en verliesrekening" pdfHref={`/api/reports/pdf?type=pl&year=${yearNum}`}>
          <ReportSection title="Omzet">
            {pl.revenue.length === 0 && <Empty />}
            {pl.revenue.map(line => (
              <ClickableLine
                key={line.accountCode || line.categoryName}
                code={line.accountCode}
                label={line.categoryName}
                amount={line.amount}
                positive
                onClick={() => openModal(line.accountId, line.categoryName)}
              />
            ))}
            <Total label="Totaal omzet" amount={pl.totalRevenue} positive />
          </ReportSection>
          <ReportSection title="Kosten">
            {pl.expenses.length === 0 && <Empty />}
            {pl.expenses.map(line => (
              <ClickableLine
                key={line.accountCode || line.categoryName}
                code={line.accountCode}
                label={line.categoryName}
                amount={line.amount}
                onClick={() => openModal(line.accountId, line.categoryName)}
              />
            ))}
            <Total label="Totaal kosten" amount={pl.totalExpenses} />
          </ReportSection>
          <GrandTotal label="Netto resultaat" amount={pl.netResult} />
        </ReportCard>

        <ReportCard title="Balans" pdfHref={`/api/reports/pdf?type=bs&year=${yearNum}`}>
          <ReportSection title="Activa">
            {bs.assets.length === 0 && <Empty />}
            {bs.assets.map(line => (
              <ClickableLine
                key={line.accountId}
                code={line.accountCode}
                label={line.accountName}
                amount={line.amount}
                positive={line.amount >= 0}
                onClick={() => openModal(line.accountId, line.accountName)}
              />
            ))}
            <Total label="Totaal activa" amount={bs.totalAssets} positive />
          </ReportSection>
          <ReportSection title="Passiva">
            {bs.liabilities.length === 0 && <Empty />}
            {bs.liabilities.map(line => (
              <ClickableLine
                key={line.accountId}
                code={line.accountCode}
                label={line.accountName}
                amount={line.amount}
                onClick={() => openModal(line.accountId, line.accountName)}
              />
            ))}
            <Total label="Totaal passiva" amount={bs.totalLiabilities} />
          </ReportSection>
          <ReportSection title="Eigen vermogen">
            {bs.equityLines.map(line => (
              <ClickableLine
                key={line.accountId}
                code={line.accountCode}
                label={line.accountName}
                amount={line.amount}
                positive={line.amount >= 0}
                onClick={() => openModal(line.accountId, line.accountName)}
              />
            ))}
            <Line label="Resultaat tot en met balansdatum" amount={bs.equity - bs.equityLines.reduce((t, l) => t + l.amount, 0)} positive={bs.equity >= 0} />
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

      {modal && (
        <AccountEntriesModal
          accountId={modal.accountId}
          accountName={modal.accountName}
          from={from}
          to={to}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  )
}

// ── Account entries modal ──────────────────────────────────────────────────

function AccountEntriesModal({
  accountId,
  accountName,
  from,
  to,
  onClose,
}: {
  accountId: string
  accountName: string
  from: string
  to: string
  onClose: () => void
}) {
  const [entries, setEntries] = useState<EntryWithLines[] | null>(null)
  const [accounts, setAccounts] = useState<LedgerAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EntryWithLines | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/journal-entries/by-account?accountId=${encodeURIComponent(accountId)}&from=${from}&to=${to}`)
    const data = await res.json()
    setEntries(data.entries ?? [])
    setAccounts(data.accounts ?? [])
    setLoading(false)
  }, [accountId, from, to])

  // Load on mount
  useEffect(() => { load() }, [load])

  function updateEntry(next: EntryWithLines) {
    setEntries(list => list ? list.map(e => e.id === next.id ? next : e) : list)
    setEditing(null)
  }

  async function deleteEntry(entry: EntryWithLines) {
    if (!confirm(`Journaalpost "${entry.description}" verwijderen?`)) return
    const res = await fetch(`/api/journal-entries/${entry.id}`, { method: 'DELETE' })
    if (res.ok) setEntries(list => list ? list.filter(e => e.id !== entry.id) : list)
    else alert((await res.json()).error || 'Verwijderen mislukt')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '36px 16px', overflowY: 'auto' }}>
      <div style={{ background: UI.card, borderRadius: UI.radius, width: '100%', maxWidth: 900, padding: 24, boxShadow: '0 20px 60px rgba(15,23,42,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 12 }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 900 }}>Journaalposten — {accountName}</h2>
            <p style={{ margin: 0, color: UI.textMuted, fontSize: 13 }}>Periode {from} t/m {to}</p>
          </div>
          <button onClick={onClose} style={smallButton}>Sluiten ✕</button>
        </div>

        {loading && <div style={{ color: UI.textMuted, fontSize: 14, padding: 24, textAlign: 'center' }}>Laden…</div>}

        {!loading && entries && entries.length === 0 && (
          <div style={{ color: UI.textMuted, fontSize: 14, padding: 24, textAlign: 'center' }}>Geen geboekte journaalposten gevonden voor deze rekening in deze periode.</div>
        )}

        {!loading && entries && entries.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {entries.map(entry => (
              <div key={entry.id} style={{ background: UI.cardSoft, border: `1px solid ${entry.balanced ? UI.borderSoft : UI.danger}`, borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', gap: 10, borderBottom: `1px solid ${UI.borderSoft}`, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: 14 }}>{entry.description}</span>
                      <Badge color={entry.source === 'ticketflow' ? UI.primary : UI.textMuted}>{entry.source || 'handmatig'}</Badge>
                      <Badge color={entry.status === 'posted' ? UI.success : UI.warning}>{entry.status === 'posted' ? 'Geboekt' : 'Concept'}</Badge>
                    </div>
                    <div style={{ color: UI.textFaint, fontSize: 12, marginTop: 3 }}>
                      {new Date(entry.date).toLocaleDateString('nl-NL')} · {entry.external_id || 'geen externe id'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: UI.textMuted, fontSize: 12 }}>D {formatEuro(entry.debit_total)} / C {formatEuro(entry.credit_total)}</span>
                    <button onClick={() => setEditing(entry)} style={smallButton}>Bewerk</button>
                    <button onClick={() => deleteEntry(entry)} style={{ ...smallButton, color: UI.danger }}>Verwijder</button>
                  </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: UI.card }}>
                      <Th>Rekening</Th><Th>Omschrijving</Th><Th right>Debet</Th><Th right>Credit</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {entry.lines.map(line => (
                      <tr key={line.id} style={{ borderTop: `1px solid ${UI.borderSoft}` }}>
                        <td style={td}><strong>{line.account_code}</strong> · {line.account_name}</td>
                        <td style={{ ...td, color: UI.textMuted }}>{line.description || '—'}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: line.debit_cents ? 800 : 400 }}>{line.debit_cents ? formatEuro(Number(line.debit_cents)) : '—'}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: line.credit_cents ? 800 : 400 }}>{line.credit_cents ? formatEuro(Number(line.credit_cents)) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {editing && (
          <EntryEditor
            entry={editing}
            accounts={accounts}
            onClose={() => setEditing(null)}
            onSaved={updateEntry}
          />
        )}
      </div>
    </div>
  )
}

// ── Entry editor (inline copy for modal use) ───────────────────────────────

function EntryEditor({
  entry,
  accounts,
  onClose,
  onSaved,
}: {
  entry: EntryWithLines
  accounts: LedgerAccount[]
  onClose: () => void
  onSaved: (entry: EntryWithLines) => void
}) {
  const [date, setDate] = useState(entry.date.slice(0, 10))
  const [description, setDescription] = useState(entry.description)
  const [status, setStatus] = useState<'draft' | 'posted'>(entry.status)
  const [notes, setNotes] = useState(entry.notes || '')
  const [lines, setLines] = useState<DraftLine[]>(entry.lines.map(line => ({
    account_id: line.account_id,
    description: line.description || '',
    debit: line.debit_cents ? (Number(line.debit_cents) / 100).toFixed(2).replace('.', ',') : '',
    credit: line.credit_cents ? (Number(line.credit_cents) / 100).toFixed(2).replace('.', ',') : '',
  })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const totals = lines.reduce((acc, line) => {
    acc.debit += parseEuro(line.debit)
    acc.credit += parseEuro(line.credit)
    return acc
  }, { debit: 0, credit: 0 })

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines(list => list.map((line, i) => i === index ? { ...line, ...patch } : line))
  }

  async function save() {
    setSaving(true)
    setError('')
    const res = await fetch(`/api/journal-entries/${entry.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        description,
        status,
        notes,
        lines: lines.map(line => ({
          account_id: line.account_id,
          description: line.description || null,
          debit_cents: parseEuro(line.debit),
          credit_cents: parseEuro(line.credit),
        })),
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (res.ok) onSaved(data.entry)
    else setError(data.error || 'Opslaan mislukt')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,42,0.65)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '36px 16px', overflowY: 'auto' }}>
      <div style={{ background: UI.card, borderRadius: UI.radius, width: '100%', maxWidth: 860, padding: 24, boxShadow: '0 20px 50px rgba(15,23,42,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 900 }}>Journaalpost bewerken</h2>
            <p style={{ margin: 0, color: UI.textMuted, fontSize: 13 }}>Pas regels aan, maar houd debet en credit gelijk.</p>
          </div>
          <button onClick={onClose} style={smallButton}>Sluiten</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 160px', gap: 10, marginBottom: 12 }}>
          <div><label style={labelStyle}>Datum</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Omschrijving</label><input value={description} onChange={e => setDescription(e.target.value)} style={inputStyle} /></div>
          <div><label style={labelStyle}>Status</label><select value={status} onChange={e => setStatus(e.target.value as 'draft' | 'posted')} style={inputStyle}><option value="posted">Geboekt</option><option value="draft">Concept</option></select></div>
        </div>
        <div style={{ marginBottom: 16 }}><label style={labelStyle}>Notities</label><textarea value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, minHeight: 70 }} /></div>

        <div style={{ border: `1px solid ${UI.borderSoft}`, borderRadius: 10, overflow: 'hidden', marginBottom: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: UI.cardSoft }}><Th>Rekening</Th><Th>Omschrijving</Th><Th right>Debet</Th><Th right>Credit</Th><Th></Th></tr></thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index} style={{ borderTop: `1px solid ${UI.borderSoft}` }}>
                  <td style={td}>
                    <select value={line.account_id} onChange={e => updateLine(index, { account_id: e.target.value })} style={{ ...inputStyle, padding: '8px 9px', fontSize: 12 }}>
                      <option value="">— rekening —</option>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                    </select>
                  </td>
                  <td style={td}><input value={line.description} onChange={e => updateLine(index, { description: e.target.value })} style={{ ...inputStyle, padding: '8px 9px', fontSize: 12 }} /></td>
                  <td style={td}><input value={line.debit} onChange={e => updateLine(index, { debit: e.target.value, credit: e.target.value ? '' : line.credit })} style={{ ...inputStyle, padding: '8px 9px', fontSize: 12, textAlign: 'right' }} placeholder="0,00" /></td>
                  <td style={td}><input value={line.credit} onChange={e => updateLine(index, { credit: e.target.value, debit: e.target.value ? '' : line.debit })} style={{ ...inputStyle, padding: '8px 9px', fontSize: 12, textAlign: 'right' }} placeholder="0,00" /></td>
                  <td style={td}><button onClick={() => setLines(list => list.filter((_, i) => i !== index))} style={{ ...smallButton, color: UI.danger }}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button onClick={() => setLines(list => [...list, { account_id: '', description: '', debit: '', credit: '' }])} style={smallButton}>+ Regel</button>
          <div style={{ fontSize: 13, color: totals.debit === totals.credit ? UI.success : UI.danger, fontWeight: 800 }}>
            Debet {formatEuro(totals.debit)} · Credit {formatEuro(totals.credit)}
          </div>
          <button onClick={save} disabled={saving} style={{ ...primaryButtonStyle, opacity: saving ? 0.6 : 1 }}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
        </div>
        {error && <div style={{ marginTop: 12, color: UI.danger, fontSize: 13, fontWeight: 700 }}>{error}</div>}
      </div>
    </div>
  )
}

// ── Presentational components ──────────────────────────────────────────────

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

function ClickableLine({ label, amount, positive, code, onClick }: { label: string; amount: number; positive?: boolean; code?: string; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        gridTemplateColumns: code ? '52px minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto',
        gap: 10,
        alignItems: 'baseline',
        fontSize: 13,
        padding: '5px 6px',
        borderRadius: 6,
        cursor: 'pointer',
        background: hover ? UI.primarySoft : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      {code && <span style={{ color: UI.textFaint, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 }}>{code}</span>}
      <span style={{ color: hover ? UI.primary : UI.text, fontWeight: 600 }}>{label}</span>
      <Amount amount={amount} positive={positive} />
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

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return <span style={{ background: `${color}18`, color, borderRadius: 99, padding: '3px 8px', fontSize: 11, fontWeight: 800 }}>{children}</span>
}

function Empty() {
  return <div style={{ color: UI.textFaint, fontSize: 12, fontStyle: 'italic', padding: '6px 0' }}>Geen geboekte posten</div>
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th style={{ padding: '8px 12px', textAlign: right ? 'right' : 'left', fontSize: 11, color: UI.textMuted, fontWeight: 800, textTransform: 'uppercase' }}>{children}</th>
}

function formatSignedEuro(cents: number): string {
  if (cents < 0) return `-${formatEuro(Math.abs(cents))}`
  return formatEuro(cents)
}

function parseEuro(value: string): number {
  const n = Number(value.replace(',', '.').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

const td: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'top' }
const navLink: React.CSSProperties = { background: UI.cardSoft, border: `1px solid ${UI.border}`, padding: '8px 11px', borderRadius: 7, fontSize: 12, color: UI.text, textDecoration: 'none', fontWeight: 800, fontFamily: fontStack }
const primaryLink: React.CSSProperties = { ...navLink, background: UI.primary, border: `1px solid ${UI.primary}`, color: '#fff' }
const pdfLink: React.CSSProperties = { background: UI.primarySoft, color: UI.primary, border: `1px solid ${UI.primaryBorder}`, padding: '7px 12px', borderRadius: 7, fontSize: 12, fontWeight: 900, textDecoration: 'none', fontFamily: fontStack }
const smallButton: React.CSSProperties = { background: UI.cardSoft, border: `1px solid ${UI.border}`, color: UI.text, padding: '7px 10px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: fontStack }
