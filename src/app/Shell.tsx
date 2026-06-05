import Link from 'next/link'
import { UI, fontStack } from '@/lib/ui'

const NAV = [
  { href: '/dashboard',     label: '📊 Dashboard' },
  { href: '/transacties',   label: '💸 Transacties' },
  { href: '/abonnementen',  label: '🔁 Abonnementen' },
  { href: '/categorieen',   label: '📁 Categorieën' },
  { href: '/instellingen',  label: '⚙️ Instellingen' },
]

export function Shell({
  active,
  email,
  children,
}: {
  active: string
  email?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ minHeight: '100vh', background: UI.bg, fontFamily: fontStack, color: UI.text }}>
      {/* Top nav */}
      <header style={{
        background: UI.card, borderBottom: `1px solid ${UI.borderSoft}`,
        padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
      }}>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: UI.text }}>
          <span style={{ fontSize: 22 }}>📊</span>
          <span style={{ fontWeight: 900, fontSize: 14 }}>Boekhouding</span>
        </Link>

        <nav style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: active === item.href ? UI.primarySoft : 'transparent',
                color: active === item.href ? UI.primary : UI.textMuted,
                textDecoration: 'none',
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {email && <span style={{ color: UI.textMuted, fontSize: 13 }}>{email}</span>}
          <form action="/api/auth/logout" method="POST">
            <button type="submit" style={{ background: UI.cardSoft, border: `1px solid ${UI.border}`, color: UI.text, padding: '6px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: fontStack }}>
              Uitloggen
            </button>
          </form>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px 60px' }}>
        {children}
      </main>
    </div>
  )
}
