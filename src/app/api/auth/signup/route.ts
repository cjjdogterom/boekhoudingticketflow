import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db, newId } from '@/lib/db'
import { signSession, setSessionCookie } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { email, password } = await req.json()
  if (!email || !password || password.length < 8) {
    return NextResponse.json({ error: 'E-mail en wachtwoord (min. 8 tekens) verplicht' }, { status: 400 })
  }
  const cleanEmail = String(email).trim().toLowerCase()

  const existing = await db.execute('select count(*) as c from users')
  const count = (existing.rows[0] as unknown as { c: number }).c
  if (count > 0) {
    return NextResponse.json({ error: 'Er is al een account — gebruik login' }, { status: 400 })
  }

  const hash = await bcrypt.hash(password, 10)
  const id = newId()
  await db.execute({
    sql: 'insert into users (id, email, password_hash) values (?, ?, ?)',
    args: [id, cleanEmail, hash],
  })

  const token = await signSession({ userId: id, email: cleanEmail })
  await setSessionCookie(token)
  return NextResponse.json({ ok: true })
}
