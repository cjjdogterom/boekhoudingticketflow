import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase'
import { signSession, setSessionCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  if (!email || !password || password.length < 8) {
    return NextResponse.json({ error: 'E-mail en wachtwoord (min. 8 tekens) verplicht' }, { status: 400 })
  }
  const cleanEmail = String(email).trim().toLowerCase()

  // First user only — block subsequent signups (single-user app)
  const { count } = await supabaseAdmin.from('users').select('id', { count: 'exact', head: true })
  if ((count ?? 0) > 0) return NextResponse.json({ error: 'Er is al een account — gebruik login' }, { status: 400 })

  const hash = await bcrypt.hash(password, 10)
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .insert({ email: cleanEmail, password_hash: hash })
    .select('id, email')
    .single()

  if (error || !user) return NextResponse.json({ error: error?.message || 'Account aanmaken mislukt' }, { status: 500 })

  const token = await signSession({ userId: user.id, email: user.email })
  await setSessionCookie(token)
  return NextResponse.json({ ok: true })
}
