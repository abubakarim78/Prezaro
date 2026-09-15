// ============================================================
// ClassCheck — Offline-first sync queue
// Attendance records created while offline are queued in
// localStorage and flushed to /api/sessions/:id/sync when
// connectivity returns.
// ============================================================

import { api } from './api'
import type { AttendanceRecord, AttendanceStatus } from './types'

const KEY = 'classcheck.pending.v1'

export interface PendingRecord {
  sessionId: string
  studentId: string
  name?: string
  status: AttendanceStatus
  confidence?: number | null
  markedAt: string
}

export function queueRecord(rec: PendingRecord): void {
  if (typeof window === 'undefined') return
  const items = readAll()
  // replace any existing record for same student+session
  const idx = items.findIndex(
    (i) => i.sessionId === rec.sessionId && i.studentId === rec.studentId
  )
  if (idx >= 0) items[idx] = rec
  else items.push(rec)
  writeAll(items)
}

export function removeQueued(sessionId: string, studentId: string): void {
  const items = readAll().filter(
    (i) => !(i.sessionId === sessionId && i.studentId === studentId)
  )
  writeAll(items)
}

export function readAll(): PendingRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as PendingRecord[]) : []
  } catch {
    return []
  }
}

function writeAll(items: PendingRecord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // storage full — ignore
  }
}

export function pendingCount(): number {
  return readAll().length
}

export function pendingForSession(sessionId: string): PendingRecord[] {
  return readAll().filter((i) => i.sessionId === sessionId)
}

/** Push all queued records to the server. Returns number synced. */
export async function flushQueue(): Promise<number> {
  const items = readAll()
  if (items.length === 0) return 0

  const bySession = new Map<string, PendingRecord[]>()
  for (const item of items) {
    const list = bySession.get(item.sessionId) ?? []
    list.push(item)
    bySession.set(item.sessionId, list)
  }

  let synced = 0
  for (const [sessionId, records] of bySession) {
    try {
      await api(`/api/sessions/${sessionId}/sync`, {
        method: 'POST',
        body: {
          records: records.map<AttendanceRecord>((r) => ({
            studentId: r.studentId,
            status: r.status,
            confidence: r.confidence ?? null,
            markedAt: r.markedAt,
          })),
        },
      })
      synced += records.length
      for (const r of records) removeQueued(sessionId, r.studentId)
    } catch {
      // keep in queue; will retry on next flush
    }
  }
  return synced
}

/** Local roster cache so face scanning works offline. */
const ROSTER_KEY = 'classcheck.roster.v1'

export interface CachedRoster {
  savedAt: string
  course: { id: string; code: string; title: string }
  roster: {
    id: string
    studentId: string
    firstName: string
    lastName: string
    level: number
    descriptors: number[][]
  }[]
}

export function cacheRoster(data: CachedRoster): void {
  try {
    localStorage.setItem(`${ROSTER_KEY}:${data.course.id}`, JSON.stringify(data))
  } catch {
    // ignore quota errors
  }
}

export function getCachedRoster(courseId: string): CachedRoster | null {
  try {
    const raw = localStorage.getItem(`${ROSTER_KEY}:${courseId}`)
    return raw ? (JSON.parse(raw) as CachedRoster) : null
  } catch {
    return null
  }
}

export function clearRosterCache(): void {
  if (typeof window === 'undefined') return
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith(ROSTER_KEY)) keys.push(k)
  }
  keys.forEach((k) => localStorage.removeItem(k))
}
