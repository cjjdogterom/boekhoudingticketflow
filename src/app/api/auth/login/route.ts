import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase'
import { signSession, setSessionCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  if (!email || !password) return NextResponse.json({ error: 'E-mail en wachtwoord verplicht' }, { status: 400 })

  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, email, password_hash')
    .eq('email', String(email).trim().toLowerCase())
    .maybeSingle()

  if (!user) return NextResponse.json({ error: 'Onjuiste inloggegevens' }, { status: 401 })
  const ok = await bcrypt.compare(password, user.password_hash)
  if (!ok) return NextResponse.json({ error: 'Onjuiste inloggegevens' }, { status: 401 })

  const token = await signSession({ userId: user.id, email: user.email })
  await setSessionCookie(token)
  return NextResponse.json({ ok: true })
}
