import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/auth'

const PROTECTED = ['/dashboard', '/transacties', '/journaalposten', '/abonnementen', '/rapporten', '/categorieen', '/instellingen']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const session = await getSessionFromRequest(req)

  const isProtected = PROTECTED.some(p => pathname.startsWith(p))
  if (isProtected && !session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  if (pathname === '/login' && session) {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
}
