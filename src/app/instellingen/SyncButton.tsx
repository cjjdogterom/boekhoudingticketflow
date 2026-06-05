'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UI, primaryButtonStyle, fontStack } from '@/lib/ui'

export default function SyncButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function sync() {
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/sync/ticketflow', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) setError(data.error || 'Sync mislukt')
      else {
        setResult(data.message)
        router.refresh()
      }
    } catch {
      setError('Verbindingsfout')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button onClick={sync} disabled={loading} style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1, fontFamily: fontStack }}>
        {loading ? '⏳ Synchroniseren...' : '🔄 Nu synchroniseren'}
      </button>
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
