// Shared design tokens
export const UI = {
  bg: '#f7f8fa',
  card: '#ffffff',
  cardSoft: '#fafafa',
  border: '#e2e8f0',
  borderSoft: '#eef0f4',
  text: '#0f172a',
  textMuted: '#64748b',
  textFaint: '#94a3b8',
  primary: '#0ea5e9',
  primarySoft: '#e0f2fe',
  primaryBorder: '#7dd3fc',
  success: '#16a34a',
  successSoft: '#dcfce7',
  warning: '#d97706',
  warningSoft: '#fef3c7',
  danger: '#dc2626',
  dangerSoft: '#fee2e2',
  shadow: '0 1px 3px rgba(0,0,0,0.05)',
  radius: 12,
} as const

export const fontStack = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'

export const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: '#fff',
  border: `1px solid ${UI.border}`,
  borderRadius: 8,
  fontSize: 14,
  color: UI.text,
  outline: 'none',
  fontFamily: fontStack,
  boxSizing: 'border-box',
}

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: UI.textMuted,
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
}

export const primaryButtonStyle: React.CSSProperties = {
  background: UI.primary,
  color: '#fff',
  border: 'none',
  padding: '10px 18px',
  borderRadius: 8,
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
  fontFamily: fontStack,
}

export function formatEuro(cents: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)
}
