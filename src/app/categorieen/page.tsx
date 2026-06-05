import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { selectAll, CAT_BOOL_FIELDS, type Category } from '@/lib/db'
import { UI } from '@/lib/ui'
import { Shell } from '../Shell'

export default async function CategoriesPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const categories = await selectAll<Category>(
    'select * from categories order by type, group_name, name', [], CAT_BOOL_FIELDS)
  const income = categories.filter(c => c.type === 'income')
  const expense = categories.filter(c => c.type === 'expense')

  return (
    <Shell active="/categorieen" email={session.email}>
      <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 4px' }}>Categorieën (Grootboek)</h1>
      <p style={{ color: UI.textMuted, fontSize: 14, margin: '0 0 24px' }}>
        De rekeningen waarop transacties worden geboekt. De AI gebruikt deze lijst om transacties automatisch toe te wijzen.
      </p>

      <Section title="💰 Inkomsten" cats={income} />
      <Section title="💸 Uitgaven" cats={expense} />
    </Shell>
  )
}

function Section({ title, cats }: { title: string; cats: Category[] }) {
  return (
    <div style={{ marginBottom: 30 }}>
      <h2 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 12px' }}>{title}</h2>
      <div style={{ background: UI.card, border: `1px solid ${UI.borderSoft}`, borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: UI.cardSoft, borderBottom: `1px solid ${UI.borderSoft}` }}>
              <th style={th}>Naam</th><th style={th}>Groep</th><th style={th}>BTW</th><th style={th}>AI-hint</th>
            </tr>
          </thead>
          <tbody>
            {cats.map(c => (
              <tr key={c.id} style={{ borderBottom: `1px solid ${UI.borderSoft}` }}>
                <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600 }}>{c.name}</td>
                <td style={{ padding: '11px 16px', fontSize: 12, color: UI.textMuted }}>{c.group_name || '—'}</td>
                <td style={{ padding: '11px 16px', fontSize: 12 }}>{c.vat_rate}%</td>
                <td style={{ padding: '11px 16px', fontSize: 11, color: UI.textFaint, lineHeight: 1.5 }}>{c.ai_hint || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const th: React.CSSProperties = { padding: '10px 16px', textAlign: 'left', fontSize: 11, color: UI.textMuted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }
