import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Boekhouding — TicketFlow',
  description: 'Persoonlijk boekhoudsysteem met AI-categorisering',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}
