'use client'

import { useState } from 'react'
import { UI, inputStyle, labelStyle, primaryButtonStyle, formatEuro, fontStack } from '@/lib/ui'
import type { Subscription, Category } from '@/lib/supabase'

interface Props {
  initialSubscriptions: Subscription[]
  categories: Category[]
}

export default function SubscriptionsClient({ initialSubscriptions, categories }: Props) {
  const [subs, setSubs] = useState(initialSubscriptions)
  const [editing, setEditing] = useState<Subscription | null>(null)
  const [showNew, setShowNew] = useState(false)

  const totalMonthly = subs.filter(s => s.is_active).reduce((sum, s) => {
    const m = s.frequency === 'monthly' ? s.amount_cents
      : s.frequency === 'yearly' ? s.amount_cents / 12
      : s.frequency === 'quarterly' ? s.amount_cents / 3
      : s.amount_cents * 4
    return sum + m
  }, 0)

  async function logPayment(sub: Subscription) {
    if (!confirm(`Betaling van ${sub.name} (${formatEuro(sub.amount_cents)}) registreren als transactie van vandaag?`)) return
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        description: `${sub.name}${sub.provider ? ` (${sub.provider})` : ''}`,
        amount_cents: sub.amount_cents,
        type: 'expense',
        vat_rate: sub.vat_rate,
        category_id: sub.category_id,
        subscription_id: sub.id,
        source: 'subscription',
      }),
    })
    if (res.ok) {
      // Update last_paid_at
      await fetch(`/api/subscriptions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ last_paid_at: new Date().toISOString().slice(0, 10) }),
      })
      alert('✅ Geregistreerd!')
    }
  }

  async function deleteSubscription(id: string) {
    if (!confirm('Abonnement verwijderen?')) return
    const res = await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' })
    if (res.ok) setSubs(s => s.filter(x => x.id !== id))
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 4px' }}>Abonnementen</h1>
          <p style={{ color: UI.textMuted, fontSize: 14, margin: 0 }}>
            Vaste lasten: <strong style={{ color: UI.warning }}>{formatEuro(totalMonthly)}</strong> / maand
          </p>
        </div>
        <button onClick={() => setShowNew(true)} style={primaryButtonStyle}>+ Nieuw abonnement</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {subs.map(sub => (
          <div key={sub.id} style={{ background: UI.card, border: `1px solid ${UI.borderSoft}`, borderRadius: UI.radius, padding: 18, opacity: sub.is_active ? 1 : 0.5 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{sub.name}</div>
                {sub.provider && <div style={{ color: UI.textFaint, fontSize: 12 }}>{sub.provider}</div>}
              </div>
              <span style={{ background: sub.is_active ? UI.successSoft : UI.cardSoft, color: sub.is_active ? UI.success : UI.textFaint, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 99 }}>
                {sub.is_active ? 'ACTIEF' : 'GESTOPT'}
              </span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: UI.text, marginBottom: 4 }}>
              {formatEuro(sub.amount_cents)} <span style={{ fontSize: 13, color: UI.textMuted, fontWeight: 500 }}>/ {sub.frequency === 'monthly' ? 'mnd' : sub.frequency === 'yearly' ? 'jaar' : sub.frequency}</span>
            </div>
            {sub.last_paid_at && (
              <div style={{ fontSize: 11, color: UI.textFaint, marginBottom: 12 }}>
                Laatst betaald: {new Date(sub.last_paid_at).toLocaleDateString('nl-NL')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {sub.is_active && (
                <button onClick={() => logPayment(sub)} style={{ background: UI.primarySoft, color: UI.primary, border: 'none', padding: '6px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: fontStack }}>
                  💸 Betaling registreren
                </button>
              )}
              <button onClick={() => setEditing(sub)} style={{ background: UI.cardSoft, border: `1px solid ${UI.border}`, padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: fontStack }}>
                Bewerken
              </button>
              <button onClick={() => deleteSubscription(sub.id)} style={{ background: 'none', border: 'none', color: UI.danger, padding: '6px 8px', cursor: 'pointer', fontSize: 12, fontFamily: fontStack }}>
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>

      {(showNew || editing) && (
        <SubscriptionForm
          categories={categories}
          existing={editing}
          onClose={() => { setShowNew(false); setEditing(null) }}
          onSaved={(s) => {
            if (editing) setSubs(arr => arr.map(x => x.id === s.id ? s : x))
            else setSubs(arr => [s, ...arr])
            setShowNew(false); setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function SubscriptionForm({
  categories, existing, onClose, onSaved,
}: {
  categories: Category[]
  existing: Subscription | null
  onClose: () => void
  onSaved: (s: Subscription) => void
}) {
  const [name, setName] = useState(existing?.name || '')
  const [provider, setProvider] = useState(existing?.provider || '')
  const [amount, setAmount] = useState(existing ? (existing.amount_cents / 100).toFixed(2).replace('.', ',') : '')
  const [frequency, setFrequency] = useState<Subscription['frequency']>(existing?.frequency || 'monthly')
  const [vatRate, setVatRate] = useState(existing?.vat_rate ?? 21)
  const [categoryId, setCategoryId] = useState(existing?.category_id || '')
  const [isActive, setIsActive] = useState(existing?.is_active ?? true)
  const [notes, setNotes] = useState(existing?.notes || '')
  const [loading, setLoading] = useState(false)

  async function save() {
    setLoading(true)
    const payload = {
      name,
      provider: provider || null,
      amount_cents: Math.round(parseFloat(amount.replace(',', '.')) * 100),
      frequency,
      vat_rate: vatRate,
      category_id: categoryId || null,
      is_active: isActive,
      notes: notes || null,
    }
    const url = existing ? `/api/subscriptions/${existing.id}` : '/api/subscriptions'
    const method = existing ? 'PATCH' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json()
    setLoading(false)
    if (res.ok) onSaved(data.subscription)
    else alert(data.error)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}>
      <div style={{ background: UI.card, borderRadius: UI.radius, padding: 28, maxWidth: 520, width: '100%' }}>
        <h2 style={{ margin: '0 0 18px', fontSize: 18, fontWeight: 800 }}>{existing ? 'Abonnement bewerken' : 'Nieuw abonnement'}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label style={labelStyle}>Naam</label><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} /></div>
          <div><label style={labelStyle}>Provider (optioneel)</label><input style={inputStyle} value={provider} onChange={e => setProvider(e.target.value)} placeholder="bv. Resend, Supabase" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={labelStyle}>Bedrag (€)</label><input style={inputStyle} value={amount} onChange={e => setAmount(e.target.value)} /></div>
            <div><label style={labelStyle}>Frequentie</label>
              <select style={inputStyle} value={frequency} onChange={e => setFrequency(e.target.value as Subscription['frequency'])}>
                <option value="monthly">Per maand</option>
                <option value="quarterly">Per kwartaal</option>
                <option value="yearly">Per jaar</option>
                <option value="weekly">Per week</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label style={labelStyle}>BTW</label>
              <select style={inputStyle} value={vatRate} onChange={e => setVatRate(parseInt(e.target.value))}>
                <option value={21}>21%</option><option value={9}>9%</option><option value={0}>0% / vrijgesteld</option>
              </select>
            </div>
            <div><label style={labelStyle}>Categorie</label>
              <select style={inputStyle} value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                <option value="">— selecteer —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            Actief
          </label>
          <div><label style={labelStyle}>Notities</label><textarea style={{ ...inputStyle, minHeight: 60, fontFamily: fontStack }} value={notes} onChange={e => setNotes(e.target.value)} /></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: UI.cardSoft, border: `1px solid ${UI.border}`, padding: '10px 18px', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontFamily: fontStack }}>Annuleer</button>
          <button onClick={save} disabled={loading || !name || !amount} style={{ ...primaryButtonStyle, opacity: (loading || !name || !amount) ? 0.6 : 1 }}>{loading ? 'Opslaan...' : 'Opslaan'}</button>
        </div>
      </div>
    </div>
  )
}
