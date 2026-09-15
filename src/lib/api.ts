// ============================================================
// ClassCheck — API client (fetch wrapper)
// ============================================================

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
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
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
