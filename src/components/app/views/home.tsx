'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { format, isToday, isYesterday } from 'date-fns'
import {
  BarChart3,
  BookPlus,
  ChevronRight,
  Download,
  Play,
  ScanFace,
  UserPlus,
  Users,
  WifiOff,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getErrorMessage } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type {
  CoursesResponse,
  DepartmentReport,
  SessionsResponse,
} from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, StatCard, StatusPill } from '@/components/app/shared'
import { cn } from '@/lib/utils'

const INSTALL_DISMISS_KEY = 'classcheck.installDismissed.v1'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function HomeView() {
  const user = useAppStore((s) => s.user)
  const online = useAppStore((s) => s.online)
  const openSession = useAppStore((s) => s.openSession)
  const navigate = useAppStore((s) => s.navigate)

  const coursesBlock = useApiBlock<CoursesResponse>('/api/courses')
  const reportBlock = useApiBlock<{ report: DepartmentReport }>('/api/reports/department')
  const sessionsBlock = useApiBlock<SessionsResponse>('/api/sessions?limit=5')

  // ---- install prompt ----
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installDismissed, setInstallDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    try {
      return localStorage.getItem(INSTALL_DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallEvt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const tryInstall = async () => {
    if (!installEvt) {
      toast.info('Use your browser menu → “Add to Home Screen” to install.')
      return
    }
    await installEvt.prompt()
    setInstallEvt(null)
  }

  const dismissInstall = () => {
    setInstallDismissed(true)
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, '1')
    } catch {
      // ignore
    }
  }

  // ---- derived ----
  const courses = coursesBlock.data?.courses ?? []
  const totalStudents = useMemo(
    () => courses.reduce((sum, c) => sum + (c.studentCount ?? 0), 0),
    [courses]
  )

  const weekAvg = useMemo(() => {
    const list = reportBlock.data?.report?.courses ?? []
    const totalSessions = list.reduce((s, c) => s + (c.sessionCount ?? 0), 0)
    if (totalSessions === 0) return null
    const weighted = list.reduce((s, c) => s + c.avgAttendance * (c.sessionCount ?? 0), 0)
    return weighted / totalSessions
  }, [reportBlock.data])

  const sessions = sessionsBlock.data?.sessions ?? []

  const firstName = user?.name?.trim().split(/\s+/)[0] ?? 'there'
  const lastName = user?.name?.trim().split(/\s+/).slice(-1)[0] ?? ''
  const displayLast = user?.title ? `${user.title} ${lastName}` : user?.name ?? ''
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const todayLabel = format(new Date(), 'EEEE, d MMMM')

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="px-4 lg:px-8 pb-6 pt-5 lg:pt-8">
        {/* ---------- Greeting ---------- */}
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-balance">
            {greeting}, {displayLast || firstName}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{todayLabel}</p>
        </motion.header>

        <div className="mt-4 space-y-4">
          {/* ---------- Offline banner ---------- */}
          {!online && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm"
              role="status"
            >
              <WifiOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-amber-800 dark:text-amber-200">
                Offline — attendance will sync automatically.
              </p>
            </motion.div>
          )}

          {/* ---------- Open session banner ---------- */}
          {openSession && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-primary/10 to-violet-500/10 p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                <ScanFace className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-semibold">
                  Attendance in progress — {openSession.courseCode}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Resume scanning to continue marking students.
                </p>
              </div>
              <Button className="min-h-11 shrink-0" onClick={() => navigate('scan')}>
                <Play className="h-4 w-4" /> Resume
              </Button>
            </motion.div>
          )}

          {/* ---------- Hero: take attendance ---------- */}
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.05 }}
            onClick={() => navigate('scan')}
            className="group flex h-24 w-full items-center gap-4 rounded-2xl bg-primary p-5 text-primary-foreground shadow-sm transition-transform active:scale-[0.98] sm:p-6"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-foreground/15">
              <ScanFace className="h-6 w-6" />
            </div>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-lg font-bold tracking-tight">Take attendance</span>
              <span className="mt-0.5 block text-xs text-primary-foreground/75">
                Scan faces
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-primary-foreground/70 transition-transform group-hover:translate-x-0.5" />
          </motion.button>

          {/* ---------- Stat row ---------- */}
          <div className="grid grid-cols-3 gap-3">
            {coursesBlock.loading ? (
              <>
                <Skeleton className="h-[86px] rounded-2xl" />
                <Skeleton className="h-[86px] rounded-2xl" />
                <Skeleton className="h-[86px] rounded-2xl" />
              </>
            ) : coursesBlock.error ? (
              <div className="col-span-3">
                <BlockError message={coursesBlock.error} onRetry={coursesBlock.reload} />
              </div>
            ) : (
              <>
                <StatCard
                  label="Students"
                  value={totalStudents}
                  sub="across courses"
                  icon={Users}
                  tone="default"
                />
                <StatCard
                  label="Courses"
                  value={courses.length}
                  sub="this semester"
                  icon={BookPlus}
                  tone="primary"
                />
                <StatCard
                  label="This week"
                  value={weekAvg === null ? '—' : `${Math.round(weekAvg)}%`}
                  sub={weekAvg === null ? 'no sessions yet' : 'avg attendance'}
                  icon={BarChart3}
                  tone={weekAvg !== null && weekAvg < 75 ? 'warning' : 'default'}
                />
              </>
            )}
          </div>

          {/* ---------- Quick actions ---------- */}
          <div className="grid grid-cols-3 gap-3">
            <QuickAction icon={UserPlus} label="Add student" onClick={() => navigate('students')} />
            <QuickAction icon={BookPlus} label="New course" onClick={() => navigate('onboarding')} />
            <QuickAction icon={BarChart3} label="Reports" onClick={() => navigate('reports')} />
          </div>

          {/* ---------- Recent sessions ---------- */}
          <section aria-label="Recent sessions">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold tracking-tight">Recent sessions</h2>
              <button
                onClick={() => navigate('sessions')}
                className="flex min-h-11 items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80 sm:min-h-0"
              >
                View all <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            {sessionsBlock.loading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 rounded-2xl" />
                <Skeleton className="h-16 rounded-2xl" />
                <Skeleton className="h-16 rounded-2xl" />
              </div>
            ) : sessionsBlock.error ? (
              <BlockError message={sessionsBlock.error} onRetry={sessionsBlock.reload} />
            ) : sessions.length === 0 ? (
              <div className="rounded-2xl border bg-card">
                <EmptyState
                  icon={ScanFace}
                  title="No sessions yet"
                  description="Start your first attendance session and it will appear here."
                  action={
                    <Button className="min-h-11" onClick={() => navigate('scan')}>
                      <ScanFace className="h-4 w-4" /> Take attendance
                    </Button>
                  }
                />
              </div>
            ) : (
              <div className="divide-y divide-border overflow-hidden rounded-2xl border bg-card">
                {sessions.map((s, i) => (
                  <motion.button
                    key={s.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(i * 0.04, 0.2) }}
                    onClick={() => navigate('session', { sessionId: s.id })}
                    className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                  >
                    <Badge
                      variant="outline"
                      className="shrink-0 border-primary/30 bg-primary/5 font-mono text-[10px] font-bold text-primary"
                    >
                      {s.courseCode}
                    </Badge>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm font-medium">{s.courseTitle}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {formatSessionDate(s.startedAt)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right leading-tight">
                      <span className="block text-xs font-semibold tabular-nums">
                        {s.presentCount}/{s.rosterSize}
                      </span>
                      <span className="mt-1 block">
                        <StatusPill status={s.status} />
                      </span>
                    </span>
                  </motion.button>
                ))}
              </div>
            )}
          </section>

          {/* ---------- Install banner ---------- */}
          {!installDismissed && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.1 }}
              className="flex items-center gap-3 rounded-2xl border bg-card p-4"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Download className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-sm font-semibold">Install ClassCheck on your phone</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Works offline, opens full-screen, no app store needed.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button size="sm" className="min-h-11 sm:min-h-9" onClick={tryInstall}>
                  Install
                </Button>
                <button
                  onClick={dismissInstall}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent sm:h-9 sm:w-9"
                  aria-label="Dismiss install banner"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- helpers ----------

function useApiBlock<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Initial + path-change load: setState only fires after an await, so the
  // effect never updates state synchronously.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const d = await api<T>(path)
        if (!cancelled) {
          setData(d)
          setError(null)
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError(getErrorMessage(e))
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [path])

  // Manual reload from retry buttons (event-handler context — sync setState is fine here).
  const reload = useCallback(() => {
    setLoading(true)
    ;(async () => {
      try {
        const d = await api<T>(path)
        setData(d)
        setError(null)
        setLoading(false)
      } catch (e) {
        setError(getErrorMessage(e))
        setLoading(false)
      }
    })()
  }, [path])

  return { data, loading, error, reload }
}

function BlockError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3.5">
      <p className="text-sm font-medium text-destructive">Couldn&apos;t load data</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" className="mt-2.5 min-h-9" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof ScanFace
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-3',
        'text-foreground shadow-sm transition-all hover:bg-accent/60 active:scale-[0.97]'
      )}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="text-xs font-medium leading-none">{label}</span>
    </button>
  )
}

function formatSessionDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (isToday(d)) return `Today ${format(d, 'HH:mm')}`
  if (isYesterday(d)) return `Yesterday ${format(d, 'HH:mm')}`
  return format(d, 'EEE d MMM, HH:mm')
}
