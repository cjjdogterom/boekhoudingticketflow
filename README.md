# Boekhouding TicketFlow

Persoonlijk boekhoudsysteem met **Turso** (libSQL) database en **Claude AI** voor automatische categorisering.

## Wat het doet

- 📊 **Dashboard** met live overzicht van inkomsten, uitgaven en BTW dit jaar
- 💸 **Transacties** invoeren met automatische AI-categorisering via Claude
- 🔁 **Abonnementen** beheren (Supabase, Vercel, Resend, Claude, Upstash, GitHub, etc.) met één klik betaling registreren
- 📁 **Categorieën** vooringevuld met standaard Nederlands grootboek + BTW-percentages
- 🤖 **Claude AI** categoriseert automatisch en vraagt om uitleg bij twijfel

## Setup (lokaal)

### 1. Installeer Turso CLI
```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth login
```

### 2. Maak database
```bash
turso db create boekhouding
turso db show boekhouding --url        # → TURSO_DATABASE_URL
turso db tokens create boekhouding     # → TURSO_AUTH_TOKEN
```

### 3. Env vars
```bash
cp .env.example .env.local
# vul TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, JWT_SECRET, ANTHROPIC_API_KEY in
```

### 4. Database initialiseren
```bash
npm install
npm run db:init        # voert turso/schema.sql + turso/seed.sql uit
```

### 5. Start
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) en maak je eerste account aan.

## Deploy naar Vercel

1. Push naar GitHub (`cjjdogterom/boekhoudingticketflow`)
2. Importeer in Vercel
3. Zet dezelfde env vars in Vercel **Settings → Environment Variables**:
   - `TURSO_DATABASE_URL`
   - `TURSO_AUTH_TOKEN`
   - `JWT_SECRET`
   - `ANTHROPIC_API_KEY`
4. (Optioneel) Voeg subdomein `boekhouding.ticketflowtickets.nl` toe

## Stack

- **Next.js 15** App Router
- **Turso** (libSQL, SQLite at the edge) — gratis tier ruim voldoende
- **Claude 3.5 Haiku** voor AI-categorisering (snel & goedkoop, ~$0.001 per categorisering)
- **JWT** voor sessies
- **TypeScript** + inline styles

## Roadmap

- [ ] Mollie integratie: automatisch betalingen importeren vanuit TicketFlow
- [ ] Excel/CSV export voor boekhouder
- [ ] PDF kwitanties uploaden (drag & drop + AI OCR)
- [ ] Maandelijkse BTW-rapportage
- [ ] Automatische scheduled abonnementen (cron job)

## Privacy

Single-user app. Alleen jij hebt toegang. Geen tracking, geen analytics. Data leeft alleen in Turso (jouw account) en wordt door Claude alleen tijdelijk verwerkt voor categorisering (Anthropic privacy policy van toepassing).
