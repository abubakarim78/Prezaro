'use client'

// ============================================================
// Rollmark — Scan view (the hero screen)
// select → loading → live. Full-screen, no app shell.
// Face check-ins — walkthrough or kiosk, single-capture verification.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  CameraOff,
  Check,
  LogOut,
  RefreshCw,
  ScanFace,
  Search,
  SwitchCamera,
  UserPlus,
  WifiOff,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { IdentityAvatar } from '@/components/app/shared'

import { OfflineError, api, getErrorMessage } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import {
  cacheRoster,
  getCachedRoster,
  pendingCount,
  pendingForSession,
  queueRecord,
  removeQueued,
} from '@/lib/offline'
import type { PendingRecord } from '@/lib/offline'
import type {
  AppSettings,
  AttendanceRecord,
  Course,
  RosterEntry,
  SessionDetail,
  SessionMode,
  SessionSummary,
} from '@/lib/types'
import { bestMatch } from '@/lib/face/match'
import {
  detectAll,
  detectSingle,
  drawOverlay,
  enhanceForDetection,
  loadFaceEngine,
  startCamera,
  stopCamera,
  type FaceApi,
  type FaceMatchInfo,
} from '@/lib/face/engine'

// ---------- Tunables ----------------------------------------

const DETECT_INTERVAL_MS = 166 // ~6 fps
// Thresholds: face-api same-person distances sit ~0.30–0.45, different
// people ~0.52+. Kiosk (one-at-a-time, higher-res detection) runs tighter
// than walkthrough to block impostors; both use an ambiguity margin so a
// face that sits between two students never picks the wrong one.
const WALKTHROUGH_THRESHOLD = 0.48
const KIOSK_THRESHOLD = 0.42
const MATCH_MARGIN = 0.04
const CONSECUTIVE_FRAMES = 2
const SYNC_DEBOUNCE_MS = 15000
const RECENT_MAX = 24

// ---------- Local shapes ------------------------------------

interface RecentChip {
  key: string
  entryId: string
  name: string
  time: string
}

interface KioskUI {
  phase: 'idle' | 'success' | 'info'
  name?: string
  studentId?: string
  message?: string
}

const nameOf = (r: RosterEntry) => `${r.firstName} ${r.lastName}`.trim()

const confidenceOf = (distance: number) =>
  Math.max(0, Math.min(0.999, 1 - distance))

// ============================================================
// ScanView
// ============================================================

export default function ScanView() {
  const navigate = useAppStore((s) => s.navigate)
  const online = useAppStore((s) => s.online)

  const [phase, setPhase] = useState<'select' | 'loading' | 'live'>('select')
  const [courses, setCourses] = useState<Course[] | null>(null)
  const [coursesError, setCoursesError] = useState<string | null>(null)
  const [, setSettings] = useState<AppSettings | null>(null)
  const [mode, setMode] = useState<SessionMode>('WALKTHROUGH')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [faceCount, setFaceCount] = useState<number | null>(null)
  const [loadStage, setLoadStage] = useState('Preparing…')
  const [bootError, setBootError] = useState<{ title: string; message: string } | null>(null)
  const [live, setLive] = useState<{
    session: Pick<SessionSummary, 'id' | 'courseId' | 'courseCode'> & { mode: SessionMode }
    roster: RosterEntry[]
    checkedEntryIds: string[]
    recent: RecentChip[]
  } | null>(null)

  const rosterToken = useRef(0)
  const bootToken = useRef(0)
  const engineRef = useRef<FaceApi | null>(null)

  // ---- courses + settings ----
  useEffect(() => {
    let alive = true
    api<{ courses: Course[] }>('/api/courses')
      .then((d) => {
        if (alive) setCourses(d.courses)
      })
      .catch((e) => {
        if (alive) setCoursesError(getErrorMessage(e))
      })
    api<{ settings: AppSettings }>('/api/settings')
      .then((d) => {
        if (alive) {
          setSettings(d.settings)
          setMode(d.settings.defaultMode)
        }
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // ---- roster count on course select ----
  const selectCourse = useCallback(
    async (courseId: string) => {
      setSelectedId(courseId)
      setFaceCount(null)
      const course = courses?.find((c) => c.id === courseId)
      const token = ++rosterToken.current
      try {
        const d = await api<{ roster: RosterEntry[] }>(`/api/courses/${courseId}/roster`)
        if (rosterToken.current !== token) return
        setFaceCount(d.roster.filter((r) => r.descriptors.length > 0).length)
        cacheRoster({
          savedAt: new Date().toISOString(),
          course: {
            id: courseId,
            code: course?.code ?? '',
            title: course?.title ?? '',
          },
          roster: d.roster,
        })
      } catch (e) {
      if (rosterToken.current !== token) return
        const cached = getCachedRoster(courseId)
        if (cached) setFaceCount(cached.roster.filter((r) => r.descriptors.length > 0).length)
        else if (e instanceof OfflineError) setFaceCount(-1)
      }
    },
    [courses]
  )

  // ---- session ensure (GET open → POST) ----
  const ensureSession = useCallback(
    async (course: Course, sessionMode: SessionMode): Promise<SessionDetail> => {
      const store = useAppStore.getState()
      if (!store.online) {
        const open = store.openSession
        if (open && open.courseId === course.id) {
          // resume the open session offline
          const pending = pendingForSession(open.id)
          return {
            id: open.id,
            courseId: course.id,
            courseCode: course.code,
            courseTitle: course.title,
            mode: open.mode,
            status: 'OPEN',
            startedAt: new Date().toISOString(),
            presentCount: pending.length,
            rosterSize: course.studentCount,
            lecturerName: store.user?.name ?? '',
            records: pending.map<AttendanceRecord>((p) => ({
              studentId: p.studentId,
              name: p.name,
              status: p.status,
              confidence: p.confidence ?? null,
              markedAt: p.markedAt,
            })),
          }
        }
        throw new Error('Starting a new scan needs a connection — reconnect and try again.')
      }

      const { sessions } = await api<{ sessions: SessionSummary[] }>(
        `/api/sessions?courseId=${encodeURIComponent(course.id)}&status=OPEN`
      )
      let summary = sessions[0] ?? null
      if (!summary) {
        const created = await api<{ session: SessionSummary }>('/api/sessions', {
          method: 'POST',
          body: { courseId: course.id, mode: sessionMode },
        })
        summary = created.session
      }
      // Pull detail for seeding existing check-ins (best effort)
      try {
        const detail = await api<{ session: SessionDetail }>(`/api/sessions/${summary.id}`)
        return detail.session
      } catch {
        return {
          ...summary,
          lecturerName: store.user?.name ?? '',
          records: [],
        }
      }
    },
    []
  )

  // ---- start scanning ----
  const startScan = useCallback(async () => {
    const course = courses?.find((c) => c.id === selectedId)
    if (!course) return
    const token = ++bootToken.current
    setPhase('loading')
    setBootError(null)
    setLoadStage('Fetching roster…')

    try {
      // 1. roster
      let roster: RosterEntry[] | null = null
      try {
        const d = await api<{ course: { id: string; code: string; title: string }; roster: RosterEntry[] }>(
          `/api/courses/${course.id}/roster`
        )
        roster = d.roster
        cacheRoster({
          savedAt: new Date().toISOString(),
          course: d.course,
          roster: d.roster,
        })
      } catch (e) {
        const cached = getCachedRoster(course.id)
        if (cached) roster = cached.roster
        else if (!(e instanceof OfflineError)) throw e
      }
      if (bootToken.current !== token) return
      if (!roster) {
        throw new Error(
          'You are offline and this course has no cached roster. Reconnect and try again.'
        )
      }

      // 2. face engine
      setLoadStage('Loading face engine…')
      const faceapi = await loadFaceEngine((s) => {
        if (bootToken.current === token) setLoadStage(s)
      })
      if (bootToken.current !== token) return
      engineRef.current = faceapi

      // 3. session (create / resume)
      setLoadStage('Preparing session…')
      const session = await ensureSession(course, mode)
      if (bootToken.current !== token) return

      // 4. seed existing check-ins (resume case)
      const byStudent = new Map(roster.map((r) => [r.studentId, r]))
      const checkedEntryIds = new Set<string>()
      const recent: RecentChip[] = []
      const records = [...session.records].sort(
        (a, b) => new Date(b.markedAt).getTime() - new Date(a.markedAt).getTime()
      )
      for (const rec of records) {
        if (rec.status === 'ABSENT') continue
        const entry = byStudent.get(rec.studentId)
        if (!entry) continue
        checkedEntryIds.add(entry.id)
        if (recent.length < 8) {
          recent.push({
            key: `${entry.id}-${rec.markedAt}`,
            entryId: entry.id,
            name: rec.name ?? nameOf(entry),
            time: format(new Date(rec.markedAt), 'h:mm a'),
          })
        }
      }

      useAppStore.getState().setOpenSession({
        id: session.id,
        courseId: course.id,
        courseCode: course.code,
        mode: mode === 'KIOSK' ? 'KIOSK' : 'WALKTHROUGH',
      })

      setLive({
        session: {
          id: session.id,
          courseId: course.id,
          courseCode: course.code,
          mode: mode === 'KIOSK' ? 'KIOSK' : 'WALKTHROUGH',
        },
        roster,
        checkedEntryIds: [...checkedEntryIds],
        recent,
      })
      setLoadStage('Starting camera…')
      setPhase('live')
    } catch (e) {
      if (bootToken.current !== token) return
      setBootError({
        title: 'Could not start scanning',
        message: getErrorMessage(e),
      })
    }
  }, [courses, selectedId, mode, ensureSession])

  // ---- render ----
  if (phase === 'live' && live) {
    return (
      <LiveScreen
        session={live.session}
        roster={live.roster}
        initialChecked={live.checkedEntryIds}
        initialRecent={live.recent}
        engine={engineRef.current}
      />
    )
  }

  if (phase === 'loading') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="relative flex h-16 w-16 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <ScanFace className="h-7 w-7" />
          </span>
        </div>
        <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
          {loadStage}
        </p>
        {bootError && (
          <div className="w-full max-w-sm rounded-2xl border bg-card p-4 text-left">
            <p className="font-semibold">{bootError.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{bootError.message}</p>
            <div className="mt-4 flex gap-2">
              <Button className="flex-1" onClick={startScan}>
                <RefreshCw className="h-4 w-4" /> Retry
              </Button>
              <Button variant="outline" onClick={() => setPhase('select')}>
                Back
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---- select ----
  const selected = courses?.find((c) => c.id === selectedId) ?? null
  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="flex items-center gap-3 px-4 pt-safe lg:px-8" style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)', paddingBottom: 12 }}>
        <Button
          variant="ghost"
          size="icon"
          className="size-9"
          onClick={() => (useAppStore.getState().openSession ? replaceHomeSafely() : useAppStore.getState().back())}
          aria-label="Close scanner"
        >
          <X className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold tracking-tight">Take attendance</h1>
          <p className="text-xs text-muted-foreground">Choose a course to scan</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto scrollbar-thin px-4 pb-6">
        {coursesError && (
          <div className="rounded-2xl border bg-card p-4 text-sm">
            <p className="font-semibold">Couldn&apos;t load courses</p>
            <p className="mt-1 text-muted-foreground">{coursesError}</p>
          </div>
        )}

        {!courses && !coursesError && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[72px] animate-pulse rounded-2xl bg-muted" />
            ))}
          </div>
        )}

        {courses && courses.length === 0 && (
          <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
            No courses yet — create one from the Home screen first.
          </div>
        )}

        {courses && courses.length > 0 && (
          <div className="space-y-3">
            <div className="space-y-2" role="radiogroup" aria-label="Course">
              {courses.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={selectedId === c.id}
                  onClick={() => void selectCourse(c.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border bg-card p-4 text-left transition-all min-h-11 ${
                    selectedId === c.id
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'hover:bg-accent/50'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-semibold tracking-tight">{c.code}</p>
                    <p className="truncate text-sm text-muted-foreground">{c.title}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium tabular-nums text-muted-foreground">
                    {c.studentCount} students
                  </span>
                </button>
              ))}
            </div>

            {selected && faceCount === 0 && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                No students in {selected.code} have enrolled their face yet — you can
                still mark students present manually during review.
              </div>
            )}
            {selected && (faceCount ?? 0) > 0 && (
              <p className="px-1 text-xs text-muted-foreground">
                {faceCount} of {selected.studentCount} students face-enrolled · roster cached
                for offline scanning
              </p>
            )}
            {selected && faceCount === -1 && (
              <p className="px-1 text-xs text-muted-foreground">
                Roster unavailable offline — face matching may be limited.
              </p>
            )}

            {/* Scan mode comes from Settings → Default scan mode (read-only here) */}
            <p className="rounded-xl border bg-card px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              Mode:{' '}
              <span className="font-semibold text-foreground">
                {mode === 'WALKTHROUGH' ? 'Walkthrough' : 'Kiosk'}
              </span>{' '}
              — change it in Settings.{' '}
              {mode === 'WALKTHROUGH'
                ? 'Walk around the hall — the app recognises each student automatically.'
                : 'Students come to the camera one at a time — a single glance checks them in.'}
            </p>
          </div>
        )}
      </main>

      <footer className="border-t bg-card px-4 pb-safe lg:px-8" style={{ paddingTop: 12, paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
        <Button
          className="h-12 w-full text-base font-semibold"
          disabled={!selectedId}
          onClick={() => void startScan()}
        >
          Start scanning
        </Button>
      </footer>
    </div>
  )
}

/** Leaving scan via X while a session is open → go home without ending it. */
function replaceHomeSafely(): void {
  // keep the open session in the store so it can be resumed later
  useAppStore.getState().replace('home')
}

// ============================================================
// LiveScreen — camera + detection loop + fallbacks
// ============================================================

interface LiveScreenProps {
  session: { id: string; courseId: string; courseCode: string; mode: SessionMode }
  roster: RosterEntry[]
  initialChecked: string[]
  initialRecent: RecentChip[]
  engine: FaceApi | null
}

function LiveScreen({
  session,
  roster,
  initialChecked,
  initialRecent,
  engine: initialEngine,
}: LiveScreenProps) {
  const navigate = useAppStore((s) => s.navigate)
  const replace = useAppStore((s) => s.replace)
  const online = useAppStore((s) => s.online)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const [facing, setFacing] = useState<'user' | 'environment'>(
    session.mode === 'KIOSK' ? 'user' : 'environment'
  )
  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'error' | 'off'>('starting')
  const [cameraError, setCameraError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [exitOpen, setExitOpen] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const [engine, setEngine] = useState<FaceApi | null>(initialEngine)

  // check-in state
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set(initialChecked))
  const [recent, setRecent] = useState<RecentChip[]>(initialRecent)
  const [glowId, setGlowId] = useState<string | null>(null)
  const [kiosk, setKiosk] = useState<KioskUI>({ phase: 'idle' })

  // manual check-in
  const [manualOpen, setManualOpen] = useState(false)
  const [manualQuery, setManualQuery] = useState('')

  // ---- refs used inside the detection loop ----
  const checkedRef = useRef<Set<string>>(new Set(initialChecked))
  const rosterByIdRef = useRef<Map<string, RosterEntry>>(new Map())
  const matchersRef = useRef<{ id: string; descriptors: number[][] }[]>([])
  const hitsRef = useRef<Map<string, number>>(new Map())
  const kioskRef = useRef<KioskUI>(kiosk)
  const mirrorRef = useRef(facing === 'user')
  const busyRef = useRef(false)
  const aliveRef = useRef(true)
  const streamRef = useRef<MediaStream | null>(null)

  // sync machinery
  const bufferRef = useRef<Map<string, AttendanceRecord>>(new Map())
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncingRef = useRef(false)
  const dirtyRef = useRef(false)
  const glowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const kioskTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---------- static maps ----------
  useEffect(() => {
    rosterByIdRef.current = new Map(roster.map((r) => [r.id, r]))
    matchersRef.current = roster
      .filter((r) => r.descriptors.length > 0)
      .map((r) => ({ id: r.id, descriptors: r.descriptors }))
  }, [roster])

  useEffect(() => {
    mirrorRef.current = facing === 'user'
  }, [facing])

  // engine (singleton — resolves instantly if already loaded)
  useEffect(() => {
    let alive = true
    loadFaceEngine()
      .then((f) => {
        if (alive) setEngine(f)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  // ---------- camera ----------
  useEffect(() => {
    let cancelled = false
    let localStream: MediaStream | null = null
    const video = videoRef.current
    if (!video) return

    setCameraState('starting')
    startCamera(video, facing)
      .then((s) => {
        if (cancelled) {
          stopCamera(s)
          return
        }
        localStream = s
        streamRef.current = s
        setCameraState('ready')
      })
      .catch((e) => {
        if (cancelled) return
        setCameraError(getErrorMessage(e))
        setCameraState('error')
      })

    return () => {
      cancelled = true
      if (localStream) {
        stopCamera(localStream, videoRef.current)
        if (streamRef.current === localStream) streamRef.current = null
      }
    }
  }, [facing, retryKey])

  // ---------- check-in + sync ----------
  const flushSync = useCallback(async () => {
    if (syncingRef.current) {
      dirtyRef.current = true
      return
    }
    const records = [...bufferRef.current.values()]
    if (records.length === 0) return
    syncingRef.current = true
    try {
      await api<{ saved: number }>(`/api/sessions/${session.id}/sync`, {
        method: 'POST',
        body: {
          records: records.map<AttendanceRecord>((r) => ({
            studentId: r.studentId,
            name: r.name,
            status: r.status,
            confidence: r.confidence ?? null,
            markedAt: r.markedAt,
          })),
        },
      })
      for (const r of records) {
        bufferRef.current.delete(r.studentId)
        removeQueued(session.id, r.studentId)
      }
      useAppStore.getState().setPendingSync(pendingCount())
    } catch {
      // stay queued — global flushQueue retries on reconnect
    } finally {
      syncingRef.current = false
      if (dirtyRef.current) {
        dirtyRef.current = false
        setTimeout(() => void flushSyncRef.current(), 1000)
      }
    }
  }, [session.id])

  const flushSyncRef = useRef(flushSync)
  flushSyncRef.current = flushSync

  const scheduleSync = useCallback((rec: PendingRecord) => {
    bufferRef.current.set(rec.studentId, {
      studentId: rec.studentId,
      name: rec.name,
      status: rec.status,
      confidence: rec.confidence ?? null,
      markedAt: rec.markedAt,
    })
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => void flushSyncRef.current(), SYNC_DEBOUNCE_MS)
  }, [])

  const glow = useCallback((entryId: string) => {
    setGlowId(entryId)
    if (glowTimerRef.current) clearTimeout(glowTimerRef.current)
    glowTimerRef.current = setTimeout(() => setGlowId(null), 1600)
  }, [])

  const checkIn = useCallback(
    (entry: RosterEntry, distance?: number): boolean => {
      if (checkedRef.current.has(entry.id)) {
        glow(entry.id)
        return false
      }
      checkedRef.current.add(entry.id)
      const rec: PendingRecord = {
        sessionId: session.id,
        studentId: entry.id, // DB id — matches sync API + review merge
        name: nameOf(entry),
        status: 'PRESENT',
        confidence: distance != null ? confidenceOf(distance) : null,
        markedAt: new Date().toISOString(),
      }
      queueRecord(rec)
      scheduleSync(rec)
      setCheckedIds((prev) => {
        const next = new Set(prev)
        next.add(entry.id)
        return next
      })
      setRecent((prev) =>
        [
          {
            key: `${entry.id}-${rec.markedAt}`,
            entryId: entry.id,
            name: rec.name ?? '',
            time: format(new Date(rec.markedAt), 'h:mm a'),
          },
          ...prev,
        ].slice(0, RECENT_MAX)
      )
      navigator.vibrate?.(60)
      return true
    },
    [session.id, scheduleSync, glow]
  )

  const manualCheckIn = useCallback(
    (entry: RosterEntry) => {
      if (checkIn(entry)) {
        toast.success(`${nameOf(entry)} marked present`)
      } else {
        toast.info(`${nameOf(entry)} was already checked in`)
      }
    },
    [checkIn]
  )

  const fnRef = useRef({ checkIn, flushSync })
  fnRef.current = { checkIn, flushSync }

  // ---------- kiosk UI helpers ----------
  const setKioskBoth = useCallback((ui: KioskUI) => {
    kioskRef.current = ui
    setKiosk(ui)
  }, [])

  const kioskCelebrate = useCallback(
    (entry: RosterEntry, distance?: number) => {
      fnRef.current.checkIn(entry, distance)
      setKioskBoth({
        phase: 'success',
        name: entry.firstName,
        studentId: entry.studentId,
      })
      if (kioskTimerRef.current) clearTimeout(kioskTimerRef.current)
      kioskTimerRef.current = setTimeout(() => {
        setKioskBoth({ phase: 'idle' })
      }, 2200)
    },
    [setKioskBoth]
  )

  // ---------- detection loop ----------
  useEffect(() => {
    aliveRef.current = true
    if (cameraState !== 'ready' || !engine) return
    let raf = 0
    let last = 0

    const walkthroughStep = async () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return
      // low-light lift: detect on an enhanced canvas when the room is dim
      const { source } = enhanceForDetection(video)
      const faces = await detectAll(engine, source, 256)
      if (!aliveRef.current) return
      const matches: (FaceMatchInfo | null)[] = faces.map((f) => {
        const m = bestMatch(f.descriptor, matchersRef.current, WALKTHROUGH_THRESHOLD, {
          margin: MATCH_MARGIN,
        })
        if (!m) return null
        const entry = rosterByIdRef.current.get(m.id)
        return entry ? { id: m.id, name: nameOf(entry), distance: m.distance } : null
      })
      drawOverlay(canvas, video, faces, matches, { mirror: mirrorRef.current })

      const seen = new Set<string>()
      faces.forEach((_, i) => {
        const m = matches[i]
        if (!m) return
        seen.add(m.id)
        const hits = (hitsRef.current.get(m.id) ?? 0) + 1
        hitsRef.current.set(m.id, hits)
        if (hits >= CONSECUTIVE_FRAMES) {
          hitsRef.current.delete(m.id)
          const entry = rosterByIdRef.current.get(m.id)
          if (entry) fnRef.current.checkIn(entry, m.distance)
        }
      })
      for (const key of [...hitsRef.current.keys()]) {
        if (!seen.has(key)) hitsRef.current.delete(key)
      }
    }

    const kioskStep = async () => {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return
      // low-light lift: detect on an enhanced canvas when the room is dim
      const { source } = enhanceForDetection(video)
      const face = await detectSingle(engine, source, 320)
      if (!aliveRef.current) return
      const ui = kioskRef.current

      if (!face) {
        drawOverlay(canvas, video, [], [], { mirror: mirrorRef.current })
        return
      }

      // Strict matching with ambiguity margin — a face that sits between
      // two students (or was fraudulently enrolled twice) never passes.
      const m = bestMatch(face.descriptor, matchersRef.current, KIOSK_THRESHOLD, {
        margin: MATCH_MARGIN,
      })
      const matchInfo: FaceMatchInfo | null = m
        ? (() => {
            const entry = rosterByIdRef.current.get(m.id)
            return entry ? { id: m.id, name: nameOf(entry), distance: m.distance } : null
          })()
        : null
      drawOverlay(canvas, video, [face], [matchInfo], { mirror: mirrorRef.current })

      // Single-capture verification: the first frontal frame that matches
      // the roster checks the student in — no head turns, no waiting.
      if (ui.phase === 'idle') {
        if (!matchInfo) return
        const entry = rosterByIdRef.current.get(matchInfo.id)
        if (!entry) return
        if (checkedRef.current.has(entry.id)) {
          glow(entry.id)
          setKioskBoth({
            phase: 'info',
            name: nameOf(entry),
            studentId: entry.studentId,
          })
          if (kioskTimerRef.current) clearTimeout(kioskTimerRef.current)
          kioskTimerRef.current = setTimeout(() => setKioskBoth({ phase: 'idle' }), 2200)
          return
        }
        kioskCelebrate(entry, matchInfo.distance)
      }
      // 'success' | 'info' — just keep boxes drawn
    }

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      if (t - last < DETECT_INTERVAL_MS) return
      last = t
      if (busyRef.current) return
      const video = videoRef.current
      if (!video || video.readyState < 2) return
      busyRef.current = true
      const step = session.mode === 'KIOSK' ? kioskStep() : walkthroughStep()
      void step
        .catch(() => {})
        .finally(() => {
          busyRef.current = false
        })
    }
    raf = requestAnimationFrame(tick)

    return () => {
      aliveRef.current = false
      cancelAnimationFrame(raf)
    }
  }, [
    cameraState,
    engine,
    session.mode,
    setKioskBoth,
    glow,
    kioskCelebrate,
  ])

  // ---------- lifecycle cleanup ----------
  useEffect(() => {
    return () => {
      aliveRef.current = false
      stopCamera(streamRef.current, videoRef.current)
      streamRef.current = null
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
      if (glowTimerRef.current) clearTimeout(glowTimerRef.current)
      if (kioskTimerRef.current) clearTimeout(kioskTimerRef.current)
      void flushSyncRef.current()
    }
  }, [])

  // ---------- end / discard ----------
  const endAndReview = useCallback(() => {
    setExitOpen(false)
    void flushSyncRef.current()
    navigate('review', { sessionId: session.id })
  }, [navigate, session.id])

  const discardSession = useCallback(async () => {
    setExitOpen(false)
    setDiscarding(true)
    try {
      await api<{ ok: boolean }>(`/api/sessions/${session.id}`, { method: 'DELETE' })
      for (const rec of pendingForSession(session.id)) {
        removeQueued(session.id, rec.studentId)
      }
      useAppStore.getState().setPendingSync(pendingCount())
      useAppStore.getState().setOpenSession(null)
      replace('home')
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setDiscarding(false)
    }
  }, [replace, session.id])

  const cameraUnavailable = cameraState === 'error' || cameraState === 'off'

  // ---------- manual add list ----------
  const mq = manualQuery.trim().toLowerCase()
  const manualCandidates = roster.filter(
    (r) =>
      !checkedIds.has(r.id) &&
      (mq === '' ||
        nameOf(r).toLowerCase().includes(mq) ||
        r.studentId.toLowerCase().includes(mq))
  )

  // ---------- render ----------
  return (
    <div className="fixed inset-0 flex h-dvh flex-col bg-black text-white">
      {/* top bar */}
      <header className="flex items-center gap-2 bg-black/80 px-3 pt-safe" style={{ paddingTop: 'max(env(safe-area-inset-top), 10px)', paddingBottom: 10 }}>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 shrink-0 text-white hover:bg-white/15"
          onClick={() => setExitOpen(true)}
          aria-label="End scanning"
        >
          <X className="h-5 w-5" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold tracking-wide">
            {session.courseCode}
          </span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
              checkedIds.size > 0 ? 'bg-emerald-500 text-emerald-950' : 'bg-white/10 text-white/80'
            }`}
            aria-label={`${checkedIds.size} of ${roster.length} checked in`}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            {checkedIds.size} / {roster.length}
          </span>
          {!online && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-1 text-[10px] font-semibold text-amber-300">
              <WifiOff className="h-3 w-3" /> Offline — saving on device
            </span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 shrink-0 text-white hover:bg-white/15"
          onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
          aria-label="Flip camera"
          disabled={cameraState === 'off'}
        >
          <SwitchCamera className="h-5 w-5" />
        </Button>
      </header>

      {/* video area */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }}
          playsInline
          muted
          autoPlay
        />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

        {cameraState === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            <p className="text-sm text-white/80">Starting camera…</p>
          </div>
        )}

        {cameraUnavailable && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-950 p-6">
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400">
                <CameraOff className="h-6 w-6" />
              </div>
              <p className="mt-3 font-semibold">Camera unavailable</p>
              <p className="mt-1 text-sm text-white/70">
                {cameraError || 'Check the browser permission and try again.'}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Button
                  className="h-11"
                  onClick={() => {
                    setCameraError('')
                    setCameraState('starting')
                    setRetryKey((k) => k + 1)
                  }}
                >
                  <RefreshCw className="h-4 w-4" /> Retry camera
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* kiosk giant state machine */}
        {session.mode === 'KIOSK' && cameraState === 'ready' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-6 pb-8 pt-16 text-center">
            <KioskOverlay ui={kiosk} />
          </div>
        )}
      </div>

      {/* bottom panel */}
      {session.mode === 'KIOSK' ? (
        <footer className="bg-background pb-safe text-foreground" style={{ paddingTop: 10, paddingBottom: 'max(env(safe-area-inset-bottom), 10px)' }}>
          <div className="flex gap-2 px-4">
            <Button
              variant="outline"
              className="h-12 shrink-0 gap-2"
              onClick={() => setManualOpen(true)}
            >
              <UserPlus className="h-4 w-4" /> Add manually
            </Button>
            <Button className="h-12 flex-1 text-base font-semibold" onClick={endAndReview}>
              End &amp; review
            </Button>
          </div>
        </footer>
      ) : (
        <footer className="border-t bg-background pb-safe text-foreground" style={{ paddingTop: 10, paddingBottom: 'max(env(safe-area-inset-bottom), 10px)' }}>
          <div className="no-scrollbar mb-2.5 flex gap-2 overflow-x-auto px-4" aria-live="polite">
            <AnimatePresence initial={false} mode="popLayout">
              {recent.length === 0 && (
                <motion.span
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="py-1 text-xs text-muted-foreground"
                >
                  Check-ins will appear here…
                </motion.span>
              )}
              {recent.map((chip) => (
                <motion.span
                  key={chip.key}
                  layout
                  initial={{ opacity: 0, scale: 0.7, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                  className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
                    glowId === chip.entryId
                      ? 'border-emerald-400 ring-2 ring-emerald-400/60'
                      : 'border-border'
                  }`}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-400">
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span className="max-w-36 truncate font-semibold">{chip.name}</span>
                  <span className="tabular-nums text-muted-foreground">{chip.time}</span>
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
          <div className="flex gap-2 px-4">
            <Button
              variant="outline"
              className="h-12 shrink-0 gap-2"
              onClick={() => setManualOpen(true)}
            >
              <UserPlus className="h-4 w-4" /> Add manually
            </Button>
            <Button className="h-12 flex-1 text-base font-semibold" onClick={endAndReview}>
              End &amp; review
            </Button>
          </div>
        </footer>
      )}

      {/* exit dialog */}
      <AlertDialog open={exitOpen} onOpenChange={setExitOpen}>
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogTitle>End scanning?</AlertDialogTitle>
          <AlertDialogDescription>
            {checkedIds.size > 0
              ? `${checkedIds.size} of ${roster.length} students checked in this session.`
              : 'No one has checked in yet.'}
          </AlertDialogDescription>
          <AlertDialogFooter className="flex-col gap-2">
            <Button className="h-11 w-full" onClick={endAndReview} disabled={discarding}>
              End &amp; review
            </Button>
            <Button
              variant="outline"
              className="h-11 w-full"
              onClick={() => setExitOpen(false)}
              disabled={discarding}
            >
              Keep scanning
            </Button>
            <Button
              variant="ghost"
              className="h-11 w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void discardSession()}
              disabled={discarding}
            >
              <LogOut className="h-4 w-4" /> Discard session
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* manual check-in sheet */}
      <Sheet open={manualOpen} onOpenChange={setManualOpen}>
        <SheetContent side="bottom" className="flex max-h-[85dvh] flex-col gap-0 rounded-t-3xl p-0">
          <SheetHeader className="shrink-0 border-b px-4 pb-3 pt-5 text-left">
            <SheetTitle>Add student manually</SheetTitle>
            <SheetDescription>
              For students who opted out of face scans or whose face didn&apos;t match.
            </SheetDescription>
          </SheetHeader>
          <div className="shrink-0 px-4 pt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                placeholder="Search name or student ID…"
                className="h-11 rounded-xl bg-card pl-9"
                inputMode="search"
              />
            </div>
            <p className="mt-2 px-1 text-[11px] text-muted-foreground" aria-live="polite">
              {roster.length - checkedIds.size} of {roster.length} still to check in · tap a name
              to mark present
            </p>
          </div>
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto scrollbar-thin px-4 pb-2">
            {manualCandidates.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {checkedIds.size === roster.length
                  ? 'Everyone is checked in.'
                  : `No students match “${manualQuery}”.`}
              </div>
            ) : (
              <div className="divide-y overflow-hidden rounded-2xl border bg-card">
                {manualCandidates.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => manualCheckIn(r)}
                    className="flex min-h-11 w-full items-center gap-3 p-3 text-left transition-colors hover:bg-accent/60 active:bg-accent"
                  >
                    <IdentityAvatar name={nameOf(r)} className="h-9 w-9" />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm font-medium">{nameOf(r)}</span>
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {r.studentId}
                      </span>
                    </span>
                    <UserPlus className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div
            className="shrink-0 border-t bg-background px-4"
            style={{ paddingTop: 12, paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
          >
            <Button variant="outline" className="h-11 w-full" onClick={() => setManualOpen(false)}>
              Done
            </Button>
          </div>
        </SheetContent>
      </Sheet>

    </div>
  )
}

// ---------- Kiosk overlay ----------

function KioskOverlay({ ui }: { ui: KioskUI }) {
  if (ui.phase === 'success') {
    return (
      <motion.div
        key="success"
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
        className="flex flex-col items-center gap-3"
      >
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.08 }}
          className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 shadow-xl shadow-emerald-500/40"
        >
          <Check className="h-14 w-14 text-emerald-950" strokeWidth={3.5} />
        </motion.div>
        <p className="text-4xl font-extrabold tracking-tight">Welcome, {ui.name}</p>
        <p className="text-xl font-semibold tabular-nums text-white/80">{ui.studentId}</p>
      </motion.div>
    )
  }

  if (ui.phase === 'info') {
    return (
      <motion.div
        key="info"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-2"
      >
        <p className="text-3xl font-bold text-amber-400">{ui.name}</p>
        <p className="text-xl font-semibold text-white/85">Already checked in ✓</p>
      </motion.div>
    )
  }

  return (
    <div key="idle" className="flex flex-col items-center gap-1.5">
      <p className="text-3xl font-bold tracking-tight sm:text-4xl">
        {ui.message ?? 'Look at the camera'}
      </p>
      {!ui.message && (
        <p className="text-base text-white/70">
          Stand about an arm&apos;s length away — you&apos;ll be checked in automatically
        </p>
      )}
    </div>
  )
}
