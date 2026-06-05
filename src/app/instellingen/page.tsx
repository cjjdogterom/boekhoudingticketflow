import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { Shell } from '../Shell'
import { UI } from '@/lib/ui'
import SyncButton from './SyncButton'

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const aiConfigured = !!process.env.ANTHROPIC_API_KEY
  const tfConfigured = !!process.env.TICKETFLOW_SUPABASE_URL && !!process.env.TICKETFLOW_SUPABASE_SERVICE_KEY

  return (
    <Shell active="/instellingen" email={session.email}>
      <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 4px' }}>Instellingen</h1>
      <p style={{ color: UI.textMuted, fontSize: 14, margin: '0 0 24px' }}>Configuratie en synchronisatie.</p>

      <Card title="Account">
        Ingelogd als: <strong>{session.email}</strong>
      </Card>

      <Card title="🤖 AI-categorisering">
        Status: <strong style={{ color: aiConfigured ? UI.success : UI.danger }}>
          {aiConfigured ? '✓ Geconfigureerd' : '✗ Niet geconfigureerd'}
        </strong>
        {!aiConfigured && (
          <p style={{ fontSize: 12, color: UI.textFaint, marginTop: 8 }}>
            Voeg <code style={code}>ANTHROPIC_API_KEY</code> toe in Vercel env vars.
          </p>
        )}
      </Card>

      <Card title="📥 TicketFlow synchronisatie">
        <p style={{ fontSize: 13, color: UI.textMuted, marginBottom: 8 }}>
          Importeert per organisator geaggregeerd, op moment van ticket-aankoop:
        </p>
        <ul style={{ fontSize: 13, color: UI.text, paddingLeft: 22, lineHeight: 1.8, marginBottom: 10 }}>
          <li><strong>+ €0,85 per verkocht ticket</strong> → Omzet servicekosten</li>
          <li><strong>− €0,29 per unieke Mollie order</strong> (niet per ticket!) → Bankkosten</li>
          <li><strong>+ €0,50 per terugbetaalde ticket</strong> → Omzet servicekosten</li>
          <li><strong>Facturen</strong> (maatwerksites, refund-facturen, broadcast-facturen):
            <ul style={{ paddingLeft: 18, marginTop: 4 }}>
              <li>Open → omzet + <strong>debiteur</strong> op balans</li>
              <li>Betaald → omzet</li>
            </ul>
          </li>
          <li><strong>Mollie saldo + verplichting aan organisatoren</strong> → balans</li>
        </ul>
        <p style={{ fontSize: 11, color: UI.textFaint, marginBottom: 8 }}>
          Tarieven worden opgehaald uit TicketFlow platform_settings. Bedragen kunnen daar aangepast worden.
        </p>
        <p style={{ fontSize: 12, color: UI.textFaint, marginBottom: 12 }}>
          Account: <code style={code}>dogteromc03@gmail.com</code> · Idempotent (dupliacten overgeslagen)
        </p>
        {tfConfigured ? (
          <SyncButton />
        ) : (
          <div style={{ fontSize: 12, color: UI.danger, marginTop: 4 }}>
            ✗ <code style={code}>TICKETFLOW_SUPABASE_URL</code> en <code style={code}>TICKETFLOW_SUPABASE_SERVICE_KEY</code> ontbreken in Vercel env vars.
          </div>
        )}
      </Card>

      <Card title="📊 Rapporten">
        <p style={{ fontSize: 13, color: UI.textMuted }}>
          Balance Sheet, Profit &amp; Loss en Cash Flow rapporten staan op de Rapporten-pagina, downloadbaar als PDF.
        </p>
      </Card>
    </Shell>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: UI.card, border: `1px solid ${UI.borderSoft}`, borderRadius: 12, padding: 22, marginBottom: 14 }}>
      <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 12px' }}>{title}</h2>
      <div style={{ fontSize: 13, color: UI.text }}>{children}</div>
    </div>
  )
}

const code: React.CSSProperties = { background: UI.cardSoft, padding: '1px 6px', borderRadius: 4, fontSize: 11, fontFamily: 'monospace' }
