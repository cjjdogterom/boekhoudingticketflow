import Anthropic from '@anthropic-ai/sdk'
import type { Category } from './supabase'

const apiKey = process.env.ANTHROPIC_API_KEY

const client = apiKey ? new Anthropic({ apiKey }) : null

export interface AICategoryResult {
  categoryId: string | null
  categoryName: string
  confidence: number       // 0-100
  reasoning: string
  needsReview: boolean
  vatRate: number
  // If AI is unsure and wants more info, it can ask a clarifying question
  question?: string
}

const SYSTEM_PROMPT = `Je bent een Nederlandse boekhouder die transacties categoriseert voor een klein softwarebedrijf (TicketFlow — ticketverkoop platform).

Je krijgt een transactie (omschrijving + bedrag + datum) en een lijst categorieën uit het grootboek.
Antwoord ALTIJD met geldig JSON volgens dit schema:

{
  "category_name": "exacte naam uit de lijst",
  "confidence": 0-100,
  "reasoning": "korte uitleg waarom",
  "vat_rate": 0|9|21,
  "question": "optionele vraag aan de gebruiker als je twijfelt"
}

Regels:
- Confidence >85 = zeker, <60 = vraag om verduidelijking via "question"
- Software/SaaS abonnementen → "Softwareabonnementen"
- Mollie/Stripe transacties → "Bankkosten & transactiekosten"
- Hosting (Vercel, Cloudflare, AWS) → "Hosting & domein"
- Inkomsten van Mollie/payments → "Omzet ticketverkoop" of "Omzet servicekosten"
- Domeinregistratie (TransIP, GoDaddy) → "Hosting & domein"
- Onbekend? Gebruik "Overig" met confidence 30 en stel een vraag.`

export async function categorizeTransaction(
  description: string,
  amountCents: number,
  date: string,
  type: 'income' | 'expense',
  categories: Category[],
): Promise<AICategoryResult> {
  if (!client) {
    // Fallback when no API key configured
    const defaultCat = categories.find(c => c.is_default && c.type === type) || categories.find(c => c.type === type)
    return {
      categoryId: defaultCat?.id || null,
      categoryName: defaultCat?.name || 'Overig',
      confidence: 0,
      reasoning: 'AI niet geconfigureerd — handmatig categoriseren.',
      needsReview: true,
      vatRate: defaultCat?.vat_rate ?? 21,
    }
  }

  const categoryList = categories
    .filter(c => c.type === type)
    .map(c => `- ${c.name} (${c.group_name || 'Overig'}, BTW ${c.vat_rate}%)${c.ai_hint ? ` — ${c.ai_hint}` : ''}`)
    .join('\n')

  const userMessage = `
Categorieën beschikbaar (alleen ${type === 'income' ? 'inkomsten' : 'uitgaven'}):
${categoryList}

Transactie:
- Datum: ${date}
- Omschrijving: ${description}
- Bedrag: €${(amountCents / 100).toFixed(2)}
- Type: ${type === 'income' ? 'inkomst' : 'uitgave'}

Geef je JSON-antwoord:`.trim()

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = response.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map(b => b.text)
      .join('')

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in AI response')
    const parsed = JSON.parse(jsonMatch[0]) as {
      category_name: string
      confidence: number
      reasoning: string
      vat_rate: number
      question?: string
    }

    const matchedCat = categories.find(c => c.name === parsed.category_name && c.type === type)
    return {
      categoryId: matchedCat?.id || null,
      categoryName: matchedCat?.name || parsed.category_name,
      confidence: Math.max(0, Math.min(100, parsed.confidence)),
      reasoning: parsed.reasoning,
      needsReview: parsed.confidence < 70 || !!parsed.question,
      vatRate: parsed.vat_rate || matchedCat?.vat_rate || 21,
      question: parsed.question,
    }
  } catch (err) {
    console.error('AI categorize failed', err)
    const defaultCat = categories.find(c => c.is_default && c.type === type) || categories.find(c => c.type === type)
    return {
      categoryId: defaultCat?.id || null,
      categoryName: defaultCat?.name || 'Overig',
      confidence: 0,
      reasoning: 'AI-fout — handmatig categoriseren.',
      needsReview: true,
      vatRate: defaultCat?.vat_rate ?? 21,
    }
  }
}
