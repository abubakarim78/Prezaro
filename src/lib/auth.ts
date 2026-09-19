// ============================================================
// Prezaro — server-only auth helpers
// JWT (jose, HS256) + httpOnly cookie `cc_token` + guards.
// ============================================================
import { SignJWT, jwtVerify } from 'jose'
import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import type { Department, User } from '@prisma/client'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const AUTH_COOKIE_NAME = 'cc_token'
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
export class BadRequestError extends ApiError {
  constructor(message = 'Bad request') {
    super(400, message)
  }
}
export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, message)
  }
}
export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, message)
  }
}
export class NotFoundError extends ApiError {
  constructor(message = 'Not found') {
    super(404, message)
  }
}
export class ConflictError extends ApiError {
  constructor(message = 'Conflict') {
    super(409, message)
  }
}

const SECRET_FILE = path.join(process.cwd(), 'db', '.auth-secret')
let cachedSecret: string | null = null

/**
 * Resolve the JWT signing secret, resilient to sandbox `.env` resets:
 * 1. `AUTH_SECRET` from the environment (if the platform provides one)
 * 2. A persisted secret file (db/.auth-secret) — stable across restarts
 * 3. Generate + persist a new random secret as a last resort
 * Never throws, so login can't 500 over missing config.
 */
function resolveSecret(): string {
  if (cachedSecret) return cachedSecret
  const fromEnv = process.env.AUTH_SECRET
  if (fromEnv) {
    cachedSecret = fromEnv
    return cachedSecret
  }
  try {
    const saved = fs.readFileSync(SECRET_FILE, 'utf8').trim()
    if (saved) {
      cachedSecret = saved
      return cachedSecret
    }
  } catch {
    // file missing — fall through to generation
  }
  try {
    const generated = randomBytes(32).toString('hex')
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true })
    fs.writeFileSync(SECRET_FILE, generated, { encoding: 'utf8', mode: 0o600 })
    cachedSecret = generated
    return cachedSecret
  } catch {
    // Read-only fs — derive a stable fallback rather than crashing logins.
    cachedSecret = 'prezaro-derived-' + (process.env.DATABASE_URL ?? 'local')
    return cachedSecret
  }
}

function getSecret(): Uint8Array {
  return new TextEncoder().encode(resolveSecret())
}

export interface TokenPayload {
  sub: string
}

export async function signToken(payload: TokenPayload): Promise<string> {
  return await new SignJWT({ sub: payload.sub })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(getSecret())
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (typeof payload.sub !== 'string') return null
    return { sub: payload.sub }
  } catch {
    return null
  }
}

export type AuthUser = User & { department: Department | null }

/** Minimal cookie parser for `req.headers.get('cookie')`. */
export function parseCookieHeader(header: string | null): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (key) out[key] = decodeURIComponent(value)
  }
  return out
}

/** Load the authenticated user (incl. department) from the request, or null. */
export async function getSessionUser(req: Request): Promise<AuthUser | null> {
  // 1) Authorization: Bearer <jwt> — required inside cross-origin preview
  //    iframes, where browsers block SameSite cookies entirely.
  const authHeader = req.headers.get('authorization')
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    const payload = await verifyToken(authHeader.slice(7).trim())
    if (!payload) return null
    return await db.user.findUnique({
      where: { id: payload.sub },
      include: { department: true },
    })
  }
  // 2) httpOnly cookie — used by the installed PWA / top-level browsing.
  const token = parseCookieHeader(req.headers.get('cookie'))[AUTH_COOKIE_NAME]
  if (!token) return null
  const payload = await verifyToken(token)
  if (!payload) return null
  return await db.user.findUnique({
    where: { id: payload.sub },
    include: { department: true },
  })
}

/** Throws 401 if unauthenticated — routes: `const user = await requireUser(req)`. */
export async function requireUser(req: Request): Promise<AuthUser> {
  const user = await getSessionUser(req)
  if (!user) throw new UnauthorizedError()
  return user
}

/** Attach the auth cookie onto a NextResponse (httpOnly, lax, path=/, 30d). */
export function setAuthCookie(res: NextResponse, token: string): NextResponse {
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
  return res
}

/** Expire the auth cookie on a NextResponse. */
export function clearAuthCookie(res: NextResponse): NextResponse {
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
