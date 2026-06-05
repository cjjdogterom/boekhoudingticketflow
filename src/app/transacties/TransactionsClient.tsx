'use client'

import { useState } from 'react'
import { UI, inputStyle, labelStyle, primaryButtonStyle, formatEuro, fontStack } from '@/lib/ui'
import type { Transaction, Category, Subscription } from '@/lib/supabase'

interface Props {
  initialTransactions: Transaction[]
  categories: Category[]
  subscriptions: Pick<Subscription, 'id' | 'name' | 'provider'>[]
  initialReviewFilter: boolean
}

export default function TransactionsClient({ initialTransactions, categories, subscriptions, initialReviewFilter }: Props) {
  const [transactions, setTransactions] = useState(initialTransactions)
  const [showForm, setShowForm] = useState(false)
  const [reviewOnly, setReviewOnly] = useState(initialReviewFilter)
  const [editingId, setEditingId] = useState<string | null>(null)
  const catMap = Object.fromEntries(categories.map(c => [c.id, c]))

  const filtered = reviewOnly ? transactions.filter(t => t.needs_review) : transactions

  async function deleteTransaction(id: string) {
    if (!confirm('Verwijderen?')) return
    const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    if (res.ok) setTransactions(ts => ts.filter(t => t.id !== id))
  }

  async function updateCategory(id: string, categoryId: string) {
    const res = await fetch(`/api/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category_id: categoryId, needs_review: false }),
    })
    if (res.ok) {
      const data = await res.json()
      setTransactions(ts => ts.map(t => t.id === id ? data.transaction : t))
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 4px' }}>Transacties</h1>
          <p style={{ color: UI.textMuted, fontSize: 14, margin: 0 }}>{filtered.length} transacties</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setReviewOnly(v => !v)}
            style={{ background: reviewOnly ? UI.warningSoft : UI.cardSoft, border: `1px solid ${reviewOnly ? UI.warning : UI.border}`, color: reviewOnly ? UI.warning : UI.text, padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: fontStack }}>
            {reviewOnly ? '✓ Alleen te beoordelen' : 'Alleen te beoordelen'}
          </button>
          <button onClick={() => setShowForm(true)} style={primaryButtonStyle}>
            + Nieuwe transactie
          </button>
        </div>
      </div>

      {showForm && (
        <TransactionForm
          categories={categories}
          subscriptions={subscriptions}
          onClose={() => setShowForm(false)}
          onCreated={tx => { setTransactions(ts => [tx, ...ts]); setShowForm(false) }}
        />
      )}

      <div style={{ background: UI.card, border: `1px solid ${UI.borderSoft}`, borderRadius: UI.radius, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: UI.textFaint }}>
            Geen transacties — voeg er een toe.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: UI.cardSoft, borderBottom: `1px solid ${UI.borderSoft}` }}>
                <Th>Datum</Th><Th>Omschrijving</Th><Th>Categorie</Th><Th right>Bedrag</Th><Th>BTW</Th><Th></Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} style={{ borderBottom: `1px solid ${UI.borderSoft}`, background: t.needs_review ? '#fffbeb' : 'transparent' }}>
                  <td style={{ padding: '12px 16px', color: UI.textMuted, whiteSpace: 'nowrap' }}>
                    {new Date(t.date).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontWeight: 600 }}>{t.description}</div>
                    {t.ai_reasoning && t.ai_categorised && (
                      <div style={{ fontSize: 11, color: UI.textFaint, marginTop: 2 }}>
                        🤖 {t.ai_reasoning} ({t.ai_confidence}%)
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '8px 16px' }}>
                    {editingId === t.id ? (
                      <select
                        defaultValue={t.category_id || ''}
                        onChange={e => { updateCategory(t.id, e.target.value); setEditingId(null) }}
                        onBlur={() => setEditingId(null)}
                        autoFocus
                        style={{ ...inputStyle, padding: '6px 8px', fontSize: 12 }}
                      >
                        <option value="">— selecteer —</option>
                        {categories.filter(c => c.type === t.type).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    ) : (
                      <button
                        onClick={() => setEditingId(t.id)}
                        style={{ background: t.needs_review ? UI.warningSoft : UI.primarySoft, color: t.needs_review ? UI.warning : UI.primary, border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: fontStack }}
                      >
                        {t.category_id ? catMap[t.category_id]?.name : 'Niet gecategoriseerd'}
                      </button>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: t.type === 'income' ? UI.success : UI.danger, whiteSpace: 'nowrap' }}>
                    {t.type === 'income' ? '+' : '−'} {formatEuro(t.amount_cents)}
                  </td>
                  <td style={{ padding: '12px 16px', color: UI.textMuted, fontSize: 12 }}>{t.vat_rate}%</td>
                  <td style={{ padding: '8px 16px', whiteSpace: 'nowrap' }}>
                    <button onClick={() => deleteTransaction(t.id)} style={{ background: 'none', border: 'none', color: UI.danger, cursor: 'pointer', fontSize: 11 }}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th style={{ padding: '10px 16px', textAlign: right ? 'right' : 'left', fontSize: 11, color: UI.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
      {children}
    </th>
  )
}

function TransactionForm({
  categories, subscriptions, onClose, onCreated,
}: {
  categories: Category[]
  subscriptions: Pick<Subscription, 'id' | 'name' | 'provider'>[]
  onClose: () => void
  onCreated: (tx: Transaction) => void
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [type, setType] = useState<'income' | 'expense'>('expense')
  const [vatRate, setVatRate] = useState(21)
  const [subscriptionId, setSubscriptionId] = useState('')
  const [aiSuggestion, setAiSuggestion] = useState<{ categoryName: string; confidence: number; reasoning: string; question?: string } | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [loading, setLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)

  async function askAI() {
    if (!description || !amount) return
    setAiLoading(true)
    const res = await fetch('/api/ai/categorize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description,
        amount_cents: Math.round(parseFloat(amount.replace(',', '.')) * 100),
        date,
        type,
      }),
    })
    const data = await res.json()
    setAiLoading(false)
    if (res.ok) {
      setAiSuggestion(data)
      if (data.categoryId) setSelectedCategoryId(data.categoryId)
      if (data.vatRate) setVatRate(data.vatRate)
    }
  }

  async function save() {
    setLoading(true)
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        description,
        amount_cents: Math.round(parseFloat(amount.replace(',', '.')) * 100),
        type,
        vat_rate: vatRate,
        category_id: selectedCategoryId || null,
        subscription_id: subscriptionId || null,
        ai_categorised: !!aiSuggestion,
        ai_confidence: aiSuggestion?.confidence,
        ai_reasoning: aiSuggestion?.reasoning,
        needs_review: aiSuggestion ? aiSuggestion.confidence < 70 : false,
      }),
    })
    const data = await res.json()
    setLoading(false)
    if (res.ok) onCreated(data.transaction)
    else alert(data.error)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}>
      <div style={{ background: UI.card, borderRadius: UI.radius, padding: 28, maxWidth: 520, width: '100%' }}>
        <h2 style={{ margin: '0 0 18px', fontSize: 18, fontWeight: 800 }}>Nieuwe transactie</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={labelStyle}>Datum</label><input style={inputStyle} type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><label style={labelStyle}>Type</label>
              <select style={inputStyle} value={type} onChange={e => setType(e.target.value as 'income' | 'expense')}>
                <option value="expense">Uitgave</option>
                <option value="income">Inkomst</option>
              </select>
            </div>
          </div>

          <div><label style={labelStyle}>Omschrijving</label>
            <input style={inputStyle} value={description} onChange={e => setDescription(e.target.value)} placeholder="bijv. Supabase Pro abonnement" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={labelStyle}>Bedrag (€)</label>
              <input style={inputStyle} value={amount} onChange={e => setAmount(e.target.value)} placeholder="25,00" />
            </div>
            <div><label style={labelStyle}>BTW</label>
              <select style={inputStyle} value={vatRate} onChange={e => setVatRate(parseInt(e.target.value))}>
                <option value={21}>21%</option>
                <option value={9}>9%</option>
                <option value={0}>0% / vrijgesteld</option>
              </select>
            </div>
          </div>

          <button type="button" onClick={askAI} disabled={!description || !amount || aiLoading}
            style={{ background: '#9333ea', color: '#fff', border: 'none', padding: '10px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: fontStack, opacity: (!description || !amount || aiLoading) ? 0.6 : 1 }}>
            {aiLoading ? '🤖 AI denkt na...' : '🤖 Laat AI categoriseren'}
          </button>

          {aiSuggestion && (
            <div style={{ background: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: 8, padding: 12, fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: '#7e22ce', marginBottom: 4 }}>
                🤖 {aiSuggestion.categoryName} ({aiSuggestion.confidence}% zeker)
              </div>
              <div style={{ color: UI.textMuted }}>{aiSuggestion.reasoning}</div>
              {aiSuggestion.question && (
                <div style={{ marginTop: 6, padding: '6px 8px', background: '#fef3c7', borderRadius: 6, color: '#92400e' }}>
                  ❓ {aiSuggestion.question}
                </div>
              )}
            </div>
          )}

          <div><label style={labelStyle}>Categorie (kun je overrulen)</label>
            <select style={inputStyle} value={selectedCategoryId} onChange={e => setSelectedCategoryId(e.target.value)}>
              <option value="">— selecteer —</option>
              {categories.filter(c => c.type === type).map(c => (
                <option key={c.id} value={c.id}>{c.name} {c.group_name ? `(${c.group_name})` : ''}</option>
              ))}
            </select>
          </div>

          {type === 'expense' && subscriptions.length > 0 && (
            <div><label style={labelStyle}>Koppel aan abonnement (optioneel)</label>
              <select style={inputStyle} value={subscriptionId} onChange={e => setSubscriptionId(e.target.value)}>
                <option value="">— geen —</option>
                {subscriptions.map(s => <option key={s.id} value={s.id}>{s.name}{s.provider ? ` (${s.provider})` : ''}</option>)}
              </select>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: UI.cardSoft, border: `1px solid ${UI.border}`, padding: '10px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: fontStack }}>
            Annuleer
          </button>
          <button onClick={save} disabled={loading || !description || !amount}
            style={{ ...primaryButtonStyle, opacity: (loading || !description || !amount) ? 0.6 : 1 }}>
            {loading ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}
