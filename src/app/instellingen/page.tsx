import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { Shell } from '../Shell'
import { UI } from '@/lib/ui'

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <Shell active="/instellingen" email={session.email}>
      <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 4px' }}>Instellingen</h1>
      <p style={{ color: UI.textMuted, fontSize: 14, margin: '0 0 24px' }}>Configuratie van het boekhoudsysteem.</p>

      <div style={{ background: UI.card, border: `1px solid ${UI.borderSoft}`, borderRadius: 12, padding: 22, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>Account</h2>
        <div style={{ fontSize: 13, color: UI.textMuted }}>Ingelogd als: <strong style={{ color: UI.text }}>{session.email}</strong></div>
      </div>

      <div style={{ background: UI.card, border: `1px solid ${UI.borderSoft}`, borderRadius: 12, padding: 22, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>🤖 AI-categorisering</h2>
        <p style={{ fontSize: 13, color: UI.textMuted, marginBottom: 12 }}>
          Status van de AI: <strong style={{ color: process.env.ANTHROPIC_API_KEY ? UI.success : UI.danger }}>
            {process.env.ANTHROPIC_API_KEY ? '✓ Geconfigureerd' : '✗ Niet geconfigureerd'}
          </strong>
        </p>
        {!process.env.ANTHROPIC_API_KEY && (
          <p style={{ fontSize: 12, color: UI.textFaint }}>
            Voeg <code style={code}>ANTHROPIC_API_KEY</code> toe aan je Vercel env vars om Claude AI te activeren voor automatische categorisering.
          </p>
        )}
      </div>

      <div style={{ background: UI.card, border: `1px solid ${UI.borderSoft}`, borderRadius: 12, padding: 22, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>📥 Import vanuit TicketFlow</h2>
        <p style={{ fontSize: 13, color: UI.textMuted, marginBottom: 12 }}>
          (Nog te implementeren) Automatisch importeren van Mollie-betalingen, uitbetalingen en facturen vanuit je TicketFlow account.
        </p>
        <button disabled style={{ background: UI.cardSoft, color: UI.textFaint, border: `1px solid ${UI.border}`, padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'not-allowed' }}>
          Synchroniseren (binnenkort)
        </button>
      </div>

      <div style={{ background: UI.card, border: `1px solid ${UI.borderSoft}`, borderRadius: 12, padding: 22 }}>
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>📤 Export</h2>
        <p style={{ fontSize: 13, color: UI.textMuted, marginBottom: 12 }}>
          (Nog te implementeren) Exporteer transacties naar Excel of CSV voor je boekhouder.
        </p>
        <button disabled style={{ background: UI.cardSoft, color: UI.textFaint, border: `1px solid ${UI.border}`, padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'not-allowed' }}>
          Excel export (binnenkort)
        </button>
      </div>
    </Shell>
  )
}

const code: React.CSSProperties = { background: UI.cardSoft, padding: '1px 6px', borderRadius: 4, fontSize: 11, fontFamily: 'monospace' }
