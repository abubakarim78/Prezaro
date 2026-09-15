'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { format, isThisWeek, isToday, isYesterday, parseISO } from 'date-fns'
import {
  CalendarX2,
  Check,
  Footprints,
  History,
  MonitorSmartphone,
  ScanFace,
  UserRound,
} from 'lucide-react'
import type {
  Course,
  CoursesResponse,
  SessionMode,
  SessionSummary,
  SessionsResponse,
} from '@/lib/types'
import { api, getErrorMessage } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState, LoadingBlock, PageHeader, StatusPill } from '@/components/app/shared'

const MODE_ICON: Record<SessionMode, typeof History> = {
  WALKTHROUGH: Footprints,
  KIOSK: MonitorSmartphone,
  MANUAL: UserRound,
}

const STATUS_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'COMPLETED', label: 'Completed' },
] as const

type StatusFilter = (typeof STATUS_FILTERS)[number]['key']

interface DateGroup {
  label: string
  sessions: SessionSummary[]
}

function groupByDate(sessions: SessionSummary[]): DateGroup[] {
  const buckets: Record<string, SessionSummary[]> = {
    Today: [],
    Yesterday: [],
    'This week': [],
    Earlier: [],
  }
  for (const s of sessions) {
    const d = parseISO(s.startedAt)
    if (isToday(d)) buckets['Today'].push(s)
    else if (isYesterday(d)) buckets['Yesterday'].push(s)
    else if (isThisWeek(d)) buckets['This week'].push(s)
    else buckets['Earlier'].push(s)
  }
  return (['Today', 'Yesterday', 'This week', 'Earlier'] as const)
    .map((label) => ({ label, sessions: buckets[label] }))
    .filter((g) => g.sessions.length > 0)
}

export default function SessionsView() {
  const navigate = useAppStore((s) => s.navigate)
  const [courses, setCourses] = useState<Course[]>([])
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [courseFilter, setCourseFilter] = useState<string>('ALL')
  const [tick, setTick] = useState(0)

  // Course list for the filter select — degrade gracefully if it fails
  useEffect(() => {
    api<CoursesResponse>('/api/courses')
      .then((d) => setCourses(d.courses))
      .catch(() => {})
  }, [])

  // Refetch whenever filters change (or after a manual retry)
  useEffect(() => {
    ;(async () => {
      try {
        const qs = new URLSearchParams({ limit: '100' })
        if (courseFilter !== 'ALL') qs.set('courseId', courseFilter)
        if (statusFilter !== 'ALL') qs.set('status', statusFilter)
        const d = await api<SessionsResponse>(`/api/sessions?${qs.toString()}`)
        setSessions(d.sessions)
        setError(null)
      } catch (e) {
        setError(getErrorMessage(e))
      }
    })()
  }, [courseFilter, statusFilter, tick])

  const groups = useMemo(() => groupByDate(sessions ?? []), [sessions])
  const filtered = statusFilter !== 'ALL' || courseFilter !== 'ALL'

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Sessions"
        subtitle="Your attendance history"
        right={
          <Button className="min-h-11" onClick={() => navigate('scan')}>
            <ScanFace className="h-4 w-4" />
            New scan
          </Button>
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="px-4 lg:px-8 pb-10 space-y-4"
      >
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-1 rounded-full border bg-card p-1"
            role="group"
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                aria-pressed={statusFilter === f.key}
                className={cn(
                  'h-9 rounded-full px-3.5 text-xs font-semibold transition-colors min-h-9',
                  statusFilter === f.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger
              aria-label="Filter by course"
              className="h-11 flex-1 min-w-[9rem] rounded-full bg-card text-sm sm:flex-none sm:w-52"
            >
              <SelectValue placeholder="All courses" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="ALL">All courses</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.code} · {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Body */}
        {sessions === null && !error ? (
          <LoadingBlock label="Loading sessions…" />
        ) : error ? (
          <div className="rounded-2xl border bg-card">
            <EmptyState
              icon={History}
              title="Couldn't load sessions"
              description={error}
              action={
                <Button variant="outline" className="min-h-11" onClick={() => setTick((t) => t + 1)}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-2xl border bg-card">
            <EmptyState
              icon={filtered ? CalendarX2 : History}
              title={filtered ? 'Nothing matches these filters' : 'No sessions yet'}
              description={
                filtered
                  ? 'Try a different status or course to find what you are looking for.'
                  : 'Your attendance scans will appear here once you take your first session.'
              }
              action={
                <Button className="min-h-11" onClick={() => navigate('scan')}>
                  <ScanFace className="h-4 w-4" />
                  Take attendance
                </Button>
              }
            />
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <section key={g.label} aria-label={g.label} className="space-y-2">
                <h2 className="px-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {g.label}
                </h2>
                <div className="space-y-2">
                  {g.sessions.map((s) => (
                    <SessionRow
                      key={s.id}
                      session={s}
                      onClick={() => navigate('session', { sessionId: s.id })}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  )
}

function SessionRow({
  session,
  onClick,
}: {
  session: SessionSummary
  onClick: () => void
}) {
  const ModeIcon = MODE_ICON[session.mode] ?? History
  return (
    <button
      onClick={onClick}
      className="w-full min-h-11 rounded-2xl border bg-card p-4 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center gap-3">
        <span className="shrink-0 rounded-lg bg-primary/10 px-2 py-1 font-mono text-[11px] font-bold text-primary">
          {session.courseCode}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold tracking-tight">{session.courseTitle}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ModeIcon className="h-3.5 w-3.5" />
            {format(parseISO(session.startedAt), 'h:mm a')}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums">
            <Check className="h-3.5 w-3.5 text-primary" />
            {session.presentCount}/{session.rosterSize}
          </span>
          <StatusPill status={session.status} />
        </div>
      </div>
    </button>
  )
}
