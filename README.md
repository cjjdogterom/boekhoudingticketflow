# Boekhouding TicketFlow

Persoonlijk boekhoudsysteem voor je TicketFlow-bedrijf met AI-categorisering via Claude.

## Wat het doet

- 📊 **Dashboard** met live overzicht van inkomsten, uitgaven en BTW dit jaar
- 💸 **Transacties** invoeren met automatische AI-categorisering
- 🔁 **Abonnementen** beheren (Supabase, Vercel, Resend, Claude, Upstash, etc.) met één klik betaling registreren
- 📁 **Categorieën** vooringevuld met standaard Nederlands grootboek + BTW-percentages
- 🤖 **Claude AI** categoriseert automatisch nieuwe transacties en vraagt om uitleg bij twijfel

## Setup

### 1. Supabase project

1. Maak een nieuw Supabase project op [supabase.com](https://supabase.com)
2. Open de SQL Editor
3. Plak en run de inhoud van `supabase/schema.sql`
4. Kopieer URL en service role key naar `.env.local`

### 2. Env vars

```bash
cp .env.example .env.local
```

Vul in:
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (van Supabase)
- `JWT_SECRET` (genereer met `openssl rand -base64 32`)
- `ANTHROPIC_API_KEY` (optioneel, anders manueel categoriseren)

### 3. Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) en maak je eerste account aan.

## Deploy naar Vercel

1. Push naar GitHub
2. Importeer in Vercel
3. Zet dezelfde env vars in Vercel Settings → Environment Variables
4. Deploy

## Stack

- **Next.js 15** App Router
- **Supabase** PostgreSQL database + service role auth
- **Claude 3.5 Haiku** voor AI-categorisering (snel & goedkoop)
- **JWT** voor sessies
- **TypeScript** + inline styles (geen tailwind dependency)

## Roadmap

- [ ] Mollie integratie: automatisch betalingen importeren vanuit TicketFlow
- [ ] Excel export voor boekhouder
- [ ] PDF kwitanties uploaden (drag & drop)
- [ ] Maandelijkse BTW-rapportage
- [ ] Automatische scheduled abonnementen (cron job)

## Privacy

Single-user app. Alleen jij hebt toegang. Geen tracking, geen externe dependencies behalve Supabase + Claude.
