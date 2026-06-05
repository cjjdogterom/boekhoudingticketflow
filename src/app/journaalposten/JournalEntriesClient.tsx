'use client'

import { useMemo, useState } from 'react'
import type React from 'react'
import { UI, formatEuro, fontStack, inputStyle, labelStyle, primaryButtonStyle } from '@/lib/ui'
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

export default function JournalEntriesClient({ initialEntries, accounts }: { initialEntries: EntryWithLines[]; accounts: LedgerAccount[] }) {
  const [entries, setEntries] = useState(initialEntries)
  const [editing, setEditing] = useState<EntryWithLines | null>(null)
  const totals = useMemo(() => {
    const debit = entries.reduce((sum, entry) => sum + entry.debit_total, 0)
    const credit = entries.reduce((sum, entry) => sum + entry.credit_total, 0)
    const unbalanced = entries.filter(entry => !entry.balanced).length
    return { debit, credit, unbalanced }
  }, [entries])

  function updateEntry(next: EntryWithLines) {
    setEntries(list => list.map(entry => entry.id === next.id ? next : entry))
    setEditing(null)
  }

  async function deleteEntry(entry: EntryWithLines) {
    if (!confirm(`Journaalpost "${entry.description}" verwijderen?`)) return
    const res = await fetch(`/api/journal-entries/${entry.id}`, { method: 'DELETE' })
    if (res.ok) setEntries(list => list.filter(e => e.id !== entry.id))
    else alert((await res.json()).error || 'Verwijderen mislukt')
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 4px' }}>Journaalposten</h1>
          <p style={{ color: UI.textMuted, fontSize: 14, margin: 0 }}>
            Dubbel boekhouden voor TicketFlow: debet en credit per feit, inclusief openstaande facturen.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(120px, 1fr))', gap: 8 }}>
          <Kpi label="Debet" value={formatEuro(totals.debit)} />
          <Kpi label="Credit" value={formatEuro(totals.credit)} />
          <Kpi label="Niet in balans" value={String(totals.unbalanced)} danger={totals.unbalanced > 0} />
        </div>
      </div>

      <div style={{ background: UI.primarySoft, border: `1px solid ${UI.primaryBorder}`, borderRadius: UI.radius, padding: 14, marginBottom: 16, color: UI.text, fontSize: 13, lineHeight: 1.55 }}>
        <strong>Boekingsmodel:</strong> ticketgelden komen op <strong>Mollie saldo</strong>, tegenrekening is <strong>Te betalen aan organisatoren</strong>.
        TicketFlow fees worden vanuit die verplichting als omzet geboekt. Open facturen gaan naar <strong>Debiteuren openstaande facturen</strong>, niet naar softwareabonnementen.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {entries.length === 0 ? (
          <div style={{ background: UI.card, border: `1px solid ${UI.borderSoft}`, borderRadius: UI.radius, padding: 48, textAlign: 'center', color: UI.textMuted }}>
            Nog geen journaalposten. Draai de TicketFlow-sync via Instellingen.
          </div>
        ) : entries.map(entry => (
          <div key={entry.id} style={{ background: UI.card, border: `1px solid ${entry.balanced ? UI.borderSoft : UI.danger}`, borderRadius: UI.radius, overflow: 'hidden', boxShadow: UI.shadow }}>
            <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: `1px solid ${UI.borderSoft}`, flexWrap: 'wrap' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 900 }}>{entry.description}</span>
                  <Badge color={entry.source === 'ticketflow' ? UI.primary : UI.textMuted}>{entry.source || 'handmatig'}</Badge>
                  <Badge color={entry.status === 'posted' ? UI.success : UI.warning}>{entry.status === 'posted' ? 'Geboekt' : 'Concept'}</Badge>
                  {!entry.balanced && <Badge color={UI.danger}>Niet in balans</Badge>}
                </div>
                <div style={{ color: UI.textFaint, fontSize: 12, marginTop: 4 }}>
                  {new Date(entry.date).toLocaleDateString('nl-NL')} · {entry.external_id || 'geen externe id'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: UI.textMuted, fontSize: 12 }}>
                  D {formatEuro(entry.debit_total)} / C {formatEuro(entry.credit_total)}
                </span>
                <button onClick={() => setEditing(entry)} style={smallButton}>Bewerk</button>
                <button onClick={() => deleteEntry(entry)} style={{ ...smallButton, color: UI.danger }}>Verwijder</button>
              </div>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: UI.cardSoft }}>
                  <Th>Rekening</Th><Th>Omschrijving</Th><Th right>Debet</Th><Th right>Credit</Th>
                </tr>
              </thead>
              <tbody>
                {entry.lines.map(line => (
                  <tr key={line.id} style={{ borderTop: `1px solid ${UI.borderSoft}` }}>
                    <td style={td}><strong>{line.account_code}</strong> · {line.account_name}</td>
                    <td style={{ ...td, color: UI.textMuted }}>{line.description || '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: line.debit_cents ? 800 : 400 }}>{line.debit_cents ? formatEuro(line.debit_cents) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: line.credit_cents ? 800 : 400 }}>{line.credit_cents ? formatEuro(line.credit_cents) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {editing && (
        <EntryEditor
          entry={editing}
          accounts={accounts}
          onClose={() => setEditing(null)}
          onSaved={updateEntry}
        />
      )}
    </div>
  )
}

function EntryEditor({ entry, accounts, onClose, onSaved }: { entry: EntryWithLines; accounts: LedgerAccount[]; onClose: () => void; onSaved: (entry: EntryWithLines) => void }) {
  const [date, setDate] = useState(entry.date.slice(0, 10))
  const [description, setDescription] = useState(entry.description)
  const [status, setStatus] = useState<'draft' | 'posted'>(entry.status)
  const [notes, setNotes] = useState(entry.notes || '')
  const [lines, setLines] = useState<DraftLine[]>(entry.lines.map(line => ({
    account_id: line.account_id,
    description: line.description || '',
    debit: line.debit_cents ? (line.debit_cents / 100).toFixed(2).replace('.', ',') : '',
    credit: line.credit_cents ? (line.credit_cents / 100).toFixed(2).replace('.', ',') : '',
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '36px 16px', overflowY: 'auto' }}>
      <div style={{ background: UI.card, borderRadius: UI.radius, width: '100%', maxWidth: 860, padding: 24, boxShadow: '0 20px 50px rgba(15,23,42,0.25)' }}>
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
                      {accounts.map(account => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
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

function Kpi({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return <div style={{ background: UI.card, border: `1px solid ${danger ? UI.danger : UI.borderSoft}`, borderRadius: 10, padding: '10px 12px' }}><div style={{ color: UI.textMuted, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>{label}</div><div style={{ color: danger ? UI.danger : UI.text, fontWeight: 900, marginTop: 3 }}>{value}</div></div>
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  return <span style={{ background: `${color}18`, color, borderRadius: 99, padding: '3px 8px', fontSize: 11, fontWeight: 800 }}>{children}</span>
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th style={{ padding: '9px 12px', textAlign: right ? 'right' : 'left', fontSize: 11, color: UI.textMuted, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0 }}>{children}</th>
}

const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top' }
const smallButton: React.CSSProperties = { background: UI.cardSoft, border: `1px solid ${UI.border}`, color: UI.text, padding: '7px 10px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: fontStack }

function parseEuro(value: string): number {
  const n = Number(value.replace(',', '.').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}
