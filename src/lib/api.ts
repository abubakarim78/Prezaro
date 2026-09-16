// ============================================================
// Rollmark — API client (fetch wrapper)
//
// Auth strategy (dual-mode):
//   • Bearer token in localStorage — works everywhere, including
//     cross-origin preview iframes where browsers block cookies.
//   • httpOnly cookie — set by the server as a bonus for contexts
//     where cookies work (installed PWA, top-level browsing).
// ============================================================

const TOKEN_KEY = 'cc_auth_token'

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAuthToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // storage unavailable (private mode) — cookie auth may still work
  }
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

type UnauthorizedHandler = () => void
let unauthorizedHandler: UnauthorizedHandler | null = null

/** Register a global handler fired once per 401 response (session expired). */
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null): void {
  unauthorizedHandler = fn
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export class OfflineError extends Error {
  constructor() {
    super('You appear to be offline')
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body } = opts
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getAuthToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
    })
  } catch {
    throw new OfflineError()
  }

  let data: unknown = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: text }
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      // Session is no longer valid — drop the stale token and notify.
      clearAuthToken()
      unauthorizedHandler?.()
    }
    const msg =
      (data as { error?: string } | null)?.error ||
      `Request failed (${res.status})`
    throw new ApiError(msg, res.status)
  }
  return data as T
}

export function getErrorMessage(e: unknown): string {
  if (e instanceof OfflineError) return 'You are offline — changes will sync when reconnected'
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return 'Something went wrong'
}
