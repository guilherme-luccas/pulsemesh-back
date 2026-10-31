import { createHmac, timingSafeEqual } from 'node:crypto'

export interface Session {
  sub: string
  role: 'citizen' | 'admin'
}

const CITIZEN_TTL_SECONDS = 60 * 60 * 24 * 30
const ADMIN_TTL_SECONDS = 60 * 60 * 12

export function signSession(session: Session, secret: string): string {
  const ttl = session.role === 'admin' ? ADMIN_TTL_SECONDS : CITIZEN_TTL_SECONDS
  const body = Buffer.from(
    JSON.stringify({
      sub: session.sub,
      role: session.role,
      exp: Math.floor(Date.now() / 1000) + ttl,
    }),
  ).toString('base64url')
  const signature = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${signature}`
}

export function readSession(token: string, secret: string): Session | null {
  const [body, signature] = token.split('.')
  if (!body || !signature) {
    return null
  }

  const expected = createHmac('sha256', secret).update(body).digest('base64url')
  const received = Buffer.from(signature)
  const wanted = Buffer.from(expected)
  if (received.length !== wanted.length || !timingSafeEqual(received, wanted)) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString())
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('sub' in parsed) ||
      !('role' in parsed) ||
      !('exp' in parsed) ||
      typeof parsed.sub !== 'string' ||
      (parsed.role !== 'citizen' && parsed.role !== 'admin') ||
      typeof parsed.exp !== 'number' ||
      parsed.exp < Math.floor(Date.now() / 1000)
    ) {
      return null
    }

    return { sub: parsed.sub, role: parsed.role }
  } catch {
    return null
  }
}
