'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UI, primaryButtonStyle, fontStack } from '@/lib/ui'

export default function SyncButton() {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function call(method: 'POST' | 'DELETE', confirmMessage?: string) {
    if (confirmMessage && !confirm(confirmMessage)) return
    setLoading(method)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/sync/ticketflow', { method })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Mislukt')
      else {
        setResult(data.message)
        router.refresh()
      }
    } catch {
      setError('Verbindingsfout')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={() => call('POST')}
          disabled={loading !== null}
          style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1, fontFamily: fontStack }}
        >
          {loading === 'POST' ? '⏳ Synchroniseren...' : '🔄 Nu synchroniseren'}
        </button>
        <button
          onClick={() => call('DELETE', 'Alle eerder geïmporteerde TicketFlow-transacties wissen? Daarna kun je opnieuw synchroniseren met de juiste boekingen.')}
          disabled={loading !== null}
          style={{
            background: UI.dangerSoft, color: UI.danger, border: `1px solid ${UI.danger}55`,
            padding: '10px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            cursor: loading ? 'default' : 'pointer', fontFamily: fontStack,
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading === 'DELETE' ? '⏳ Wissen...' : '🗑 Wis & sync opnieuw'}
        </button>
      </div>
      {result && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: UI.successSoft, color: UI.success, borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
          ✅ {result}
        </div>
      )}
      {error && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: UI.dangerSoft, color: UI.danger, borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
          ❌ {error}
        </div>
      )}
    </div>
  )
}
