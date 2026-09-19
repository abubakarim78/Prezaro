// ============================================================
// Prezaro — Offline-tolerant session cache
//
// Remembers the last user that signed in on this device so the app
// can keep working when the server is unreachable at boot (offline
// PWA launch, dead-zone lecture hall). The auth token itself is
// managed by lib/api.ts; this only caches the non-sensitive profile
// shown in the UI. Restored sessions are re-verified by the server
// as soon as connectivity returns — an invalid token clears both
// via the global 401 handler.
// ============================================================

import type { User } from './types'

const KEY = 'prezaro.lastUser.v1'

export function readCachedUser(): User | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as User
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.email !== 'string') {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function writeCachedUser(user: User): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(user))
  } catch {
    /* storage unavailable (private mode) — offline restore just won't work */
  }
}

export function clearCachedUser(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
