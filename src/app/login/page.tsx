'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UI, inputStyle, labelStyle, primaryButtonStyle, fontStack } from '@/lib/ui'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const res = await fetch(`/api/auth/${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error || 'Mislukt')
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', background: UI.bg, fontFamily: fontStack, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: UI.card, border: `1px solid ${UI.borderSoft}`, borderRadius: UI.radius, padding: 32, maxWidth: 380, width: '100%', boxShadow: UI.shadow }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 4px', color: UI.text }}>Boekhouding TicketFlow</h1>
          <p style={{ color: UI.textMuted, fontSize: 13, margin: 0 }}>{mode === 'login' ? 'Log in om verder te gaan' : 'Account aanmaken'}</p>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>E-mail</label>
            <input style={inputStyle} type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </div>
          <div>
            <label style={labelStyle}>Wachtwoord</label>
            <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
          </div>
          {error && <div style={{ color: UI.danger, fontSize: 13, background: UI.dangerSoft, padding: '8px 12px', borderRadius: 8 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Bezig...' : mode === 'login' ? 'Inloggen' : 'Account maken'}
          </button>
        </form>

        <button
          onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError('') }}
          style={{ background: 'none', border: 'none', color: UI.primary, fontSize: 13, marginTop: 16, cursor: 'pointer', width: '100%', fontFamily: fontStack }}
        >
          {mode === 'login' ? 'Nog geen account? Maak er een' : 'Al een account? Log in'}
        </button>
      </div>
    </div>
  )
}
