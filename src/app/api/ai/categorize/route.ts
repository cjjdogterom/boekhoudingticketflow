import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { categorizeTransaction } from '@/lib/ai'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { description, amount_cents, date, type } = await req.json()
  if (!description || !amount_cents || !date || !type) {
    return NextResponse.json({ error: 'description, amount_cents, date en type verplicht' }, { status: 400 })
  }

  const { data: categories } = await supabaseAdmin.from('categories').select('*')
  const result = await categorizeTransaction(description, amount_cents, date, type, categories || [])
  return NextResponse.json(result)
}
