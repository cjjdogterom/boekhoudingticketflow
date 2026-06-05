import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .insert({
      date: body.date,
      description: body.description,
      amount_cents: body.amount_cents,
      type: body.type,
      vat_rate: body.vat_rate ?? 21,
      category_id: body.category_id || null,
      subscription_id: body.subscription_id || null,
      source: body.source || 'manual',
      external_id: body.external_id || null,
      ai_categorised: !!body.ai_categorised,
      ai_confidence: body.ai_confidence,
      ai_reasoning: body.ai_reasoning,
      needs_review: !!body.needs_review,
      notes: body.notes || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transaction: data })
}
