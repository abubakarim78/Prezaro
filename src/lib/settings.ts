// ============================================================
// ClassCheck — per-user app settings (stored as JSON on User)
// Defaults: { atRiskThreshold: 75, liveness: true, defaultMode: 'WALKTHROUGH' }
// ============================================================
import { db } from '@/lib/db'
import type { AppSettings } from '@/lib/types'

export const DEFAULT_SETTINGS: AppSettings = {
  atRiskThreshold: 75,
  liveness: true,
  defaultMode: 'WALKTHROUGH',
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function parseSettings(raw: string | null | undefined): AppSettings {
  if (!raw) return { ...DEFAULT_SETTINGS }
  try {
    const obj: unknown = JSON.parse(raw)
    if (typeof obj !== 'object' || obj === null) return { ...DEFAULT_SETTINGS }
    const o = obj as Record<string, unknown>
    return {
      atRiskThreshold: clampNumber(o.atRiskThreshold, 1, 100, DEFAULT_SETTINGS.atRiskThreshold),
      liveness: typeof o.liveness === 'boolean' ? o.liveness : DEFAULT_SETTINGS.liveness,
      defaultMode: o.defaultMode === 'KIOSK' ? 'KIOSK' : 'WALKTHROUGH',
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function getUserSettings(userId: string): Promise<AppSettings> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { settingsJson: true },
  })
  return parseSettings(user?.settingsJson)
}

export async function saveUserSettings(
  userId: string,
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const current = await getUserSettings(userId)
  const next: AppSettings = { ...current, ...patch }
  await db.user.update({
    where: { id: userId },
    data: { settingsJson: JSON.stringify(next) },
  })
  return next
}
