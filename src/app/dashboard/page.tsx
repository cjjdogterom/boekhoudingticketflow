import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { UI, formatEuro } from '@/lib/ui'
import { Shell } from '../Shell'

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  // Current month
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)

  const [{ data: monthTx }, { data: yearTx }, { count: needsReview }, { data: subs }, { data: recent }] = await Promise.all([
    supabaseAdmin.from('transactions').select('type, amount_cents').gte('date', monthStart),
    supabaseAdmin.from('transactions').select('type, amount_cents, vat_rate').gte('date', yearStart),
    supabaseAdmin.from('transactions').select('id', { count: 'exact', head: true }).eq('needs_review', true),
    supabaseAdmin.from('subscriptions').select('id, name, amount_cents, frequency, provider').eq('is_active', true),
    supabaseAdmin.from('transactions').select('id, date, description, amount_cents, type, needs_review').order('date', { ascending: false }).limit(8),
  ])

  const monthIncome = (monthTx || []).filter(t => t.type === 'income').reduce((s, t) => s + t.amount_cents, 0)
  const monthExpense = (monthTx || []).filter(t => t.type === 'expense').reduce((s, t) => s + t.amount_cents, 0)
  const yearIncome = (yearTx || []).filter(t => t.type === 'income').reduce((s, t) => s + t.amount_cents, 0)
  const yearExpense = (yearTx || []).filter(t => t.type === 'expense').reduce((s, t) => s + t.amount_cents, 0)
  // VAT owed = collected on income at 21% rate (simplified)
  const vatCollected = (yearTx || []).filter(t => t.type === 'income').reduce((s, t) => s + Math.round((t.amount_cents * t.vat_rate) / (100 + t.vat_rate)), 0)
  const vatPaid = (yearTx || []).filter(t => t.type === 'expense').reduce((s, t) => s + Math.round((t.amount_cents * t.vat_rate) / (100 + t.vat_rate)), 0)
  const vatOwed = vatCollected - vatPaid

  const monthlyRecurring = (subs || []).reduce((s, sub) => {
    const monthly = sub.frequency === 'monthly' ? sub.amount_cents
      : sub.frequency === 'yearly' ? sub.amount_cents / 12
      : sub.frequency === 'quarterly' ? sub.amount_cents / 3
      : sub.amount_cents * 4
    return s + monthly
  }, 0)

  return (
    <Shell active="/dashboard" email={session.email}>
      <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 4px' }}>Dashboard</h1>
      <p style={{ color: UI.textMuted, fontSize: 14, margin: '0 0 24px' }}>
        Overzicht van inkomsten, uitgaven en BTW dit jaar.
      </p>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Kpi label="Inkomsten deze maand" value={formatEuro(monthIncome)} color={UI.success} />
        <Kpi label="Uitgaven deze maand" value={formatEuro(monthExpense)} color={UI.danger} />
        <Kpi label="Resultaat dit jaar" value={formatEuro(yearIncome - yearExpense)} color={yearIncome - yearExpense >= 0 ? UI.success : UI.danger} />
        <Kpi label="Vaste lasten / mnd" value={formatEuro(monthlyRecurring)} color={UI.warning} detail={`${(subs || []).length} abonnementen`} />
        <Kpi label="Te betalen BTW dit jaar" value={formatEuro(Math.max(0, vatOwed))} color={UI.primary} detail={vatOwed < 0 ? 'Je krijgt terug' : 'Schat per kwartaal'} />
        <Link href="/transacties?review=1" style={{ textDecoration: 'none' }}>
          <Kpi label="Te beoordelen" value={String(needsReview ?? 0)} color={needsReview ? UI.warning : UI.textFaint} detail={needsReview ? 'AI twijfelt' : 'Alles op orde'} />
        </Link>
      </div>

      {/* Recent transactions */}
      <div style={{ background: UI.card, border: `1px solid ${UI.borderSoft}`, borderRadius: UI.radius, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>Recente transacties</h2>
          <Link href="/transacties" style={{ color: UI.primary, fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>
            Alle transacties →
          </Link>
        </div>
        {(recent || []).length === 0 ? (
          <div style={{ color: UI.textFaint, fontSize: 13, textAlign: 'center', padding: 32 }}>
            Nog geen transacties — voeg er een toe via &ldquo;Transacties&rdquo;.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(recent || []).map(t => (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: UI.cardSoft, borderRadius: 8 }}>
                <span style={{ fontSize: 11, color: UI.textMuted, fontWeight: 700, width: 70 }}>{new Date(t.date).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{t.description}</span>
                {t.needs_review && <span style={{ background: UI.warningSoft, color: UI.warning, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99 }}>BEOORDELEN</span>}
                <span style={{ fontSize: 14, fontWeight: 800, color: t.type === 'income' ? UI.success : UI.danger }}>
                  {t.type === 'income' ? '+' : '−'} {formatEuro(t.amount_cents)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  )
}

function Kpi({ label, value, color, detail }: { label: string; value: string; color: string; detail?: string }) {
  return (
    <div style={{ background: UI.card, border: `1px solid ${UI.borderSoft}`, borderRadius: UI.radius, padding: 16, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 11, color: UI.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, marginBottom: 4 }}>{value}</div>
      {detail && <div style={{ fontSize: 11, color: UI.textFaint }}>{detail}</div>}
    </div>
  )
}
