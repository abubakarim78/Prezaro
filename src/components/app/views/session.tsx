'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import {
  ArrowLeft,
  CalendarX2,
  Check,
  Clock,
  Download,
  Footprints,
  MonitorSmartphone,
  ScanFace,
  Search,
  Trash2,
  TriangleAlert,
  UserRound,
  Users,
} from 'lucide-react'
import type {
  AttendanceRecord,
  AttendanceStatus,
  CheckInMethod,
  SessionDetail,
  SessionResponse,
  SessionMode,
} from '@/lib/types'
import { api, getErrorMessage } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  EmptyState,
  IdentityAvatar,
  LoadingBlock,
  MethodBadge,
  StatCard,
  StatusPill,
} from '@/components/app/shared'

const MODE_META: Record<SessionMode, { icon: typeof ScanFace; label: string }> = {
  WALKTHROUGH: { icon: Footprints, label: 'Walkthrough' },
  KIOSK: { icon: MonitorSmartphone, label: 'Kiosk' },
  MANUAL: { icon: UserRound, label: 'Manual' },
}

const METHOD_ORDER: CheckInMethod[] = ['FACE', 'QR', 'PIN', 'MANUAL']

const RECORD_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'PRESENT', label: 'Present' },
  { key: 'LATE', label: 'Late' },
  { key: 'ABSENT', label: 'Absent' },
] as const

type RecordFilter = (typeof RECORD_FILTERS)[number]['key']

export default function SessionView() {
  const { params, back, navigate, openSession, setOpenSession } = useAppStore()
  const sessionId = params.sessionId

  const [session, setSession] = useState<SessionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [deleting, setDeleting] = useState(false)

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<RecordFilter>('ALL')

  const load = useCallback(async () => {
    if (!sessionId) return
    setSession(null)
    setError(null)
    try {
      const d = await api<SessionResponse>(`/api/sessions/${sessionId}`)
      setSession(d.session)
    } catch (e) {
      setError(getErrorMessage(e))
    }
  }, [sessionId])

  useEffect(() => {
    void load()
  }, [load, tick])

  const methodCounts = useMemo(() => {
    const counts: Record<CheckInMethod, number> = { FACE: 0, QR: 0, PIN: 0, MANUAL: 0 }
    for (const r of session?.records ?? []) counts[r.method] = (counts[r.method] ?? 0) + 1
    return counts
  }, [session])

  const lateCount = useMemo(
    () => (session?.records ?? []).filter((r) => r.status === 'LATE').length,
    [session]
  )

  const attendancePercent =
    session && session.rosterSize > 0
      ? Math.round((session.presentCount / session.rosterSize) * 100)
      : null

  const visibleRecords = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = [...(session?.records ?? [])]
    if (q) {
      list = list.filter(
        (r) =>
          (r.name ?? '').toLowerCase().includes(q) ||
          r.code?.toLowerCase().includes(q) ||
          r.studentId.toLowerCase().includes(q)
      )
    }
    if (statusFilter !== 'ALL') list = list.filter((r) => r.status === statusFilter)
    list.sort((a, b) => parseISO(b.markedAt).getTime() - parseISO(a.markedAt).getTime())
    return list
  }, [session, query, statusFilter])

  const handleDelete = async () => {
    if (!sessionId) return
    setDeleting(true)
    try {
      await api(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      toast.success('Session deleted')
      if (openSession?.id === sessionId) setOpenSession(null)
      back()
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setDeleting(false)
    }
  }

  // ---- States -------------------------------------------------
  if (!sessionId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14">
        <EmptyState
          icon={CalendarX2}
          title="No session selected"
          description="Pick a session from your history to see its details."
          action={
            <Button variant="outline" className="min-h-11" onClick={() => back()}>
              Go back
            </Button>
          }
        />
      </div>
    )
  }

  if (!session && !error) {
    return (
      <div className="mx-auto max-w-3xl">
        <LoadingBlock label="Loading session…" />
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-14">
        <EmptyState
          icon={TriangleAlert}
          title="Couldn't load session"
          description={error ?? 'This session may have been deleted.'}
          action={
            <div className="flex gap-2">
              <Button variant="outline" className="min-h-11" onClick={() => setTick((t) => t + 1)}>
                Try again
              </Button>
              <Button className="min-h-11" onClick={() => back()}>
                Go back
              </Button>
            </div>
          }
        />
      </div>
    )
  }

  const ModeIcon = MODE_META[session.mode]?.icon ?? UserRound
  const modeLabel = MODE_META[session.mode]?.label ?? session.mode
  const isOpen = session.status === 'OPEN'

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Header */}
      <div className="flex items-start gap-1.5 px-3 lg:px-6 pt-4 lg:pt-6 pb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => back()}
          aria-label="Go back"
          className="h-10 w-10 shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 pt-0.5">
          <p className="font-mono text-[11px] font-bold text-primary">{session.courseCode}</p>
          <h1 className="truncate text-xl lg:text-2xl font-bold tracking-tight">
            {session.courseTitle}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {format(parseISO(session.startedAt), 'EEE d MMM yyyy · h:mm a')}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium">
              <ModeIcon className="h-3.5 w-3.5" />
              {modeLabel}
            </span>
            <StatusPill status={session.status} />
            <span className="truncate">{session.lecturerName}</span>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="px-4 lg:px-8 pb-10 space-y-4"
      >
        {/* Open-session banner */}
        {isOpen && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
              <TriangleAlert className="h-4 w-4" />
              Session still open
            </div>
            <p className="mt-1 text-xs text-amber-700/85 dark:text-amber-400/85">
              Students can still check in. Finalize when the room is done.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" className="min-h-11" onClick={() => navigate('scan')}>
                <ScanFace className="h-4 w-4" />
                Resume scan
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 bg-background/60"
                onClick={() => navigate('review', { sessionId })}
              >
                Review &amp; finalize
              </Button>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Present"
            value={session.presentCount}
            sub={`of ${session.rosterSize} roster`}
            icon={Users}
            tone="primary"
          />
          <StatCard
            label="Attendance"
            value={attendancePercent !== null ? `${attendancePercent}%` : '—'}
            sub="of roster"
            icon={Check}
          />
          <StatCard
            label="Late"
            value={lateCount}
            sub="marked late"
            icon={Clock}
            tone={lateCount > 0 ? 'warning' : 'default'}
          />
        </div>

        {/* Method breakdown */}
        <div className="flex flex-wrap items-center gap-2">
          {METHOD_ORDER.map((m) => (
            <span
              key={m}
              className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs"
            >
              <MethodBadge method={m} />
              <span className="font-semibold tabular-nums">{methodCounts[m]}</span>
            </span>
          ))}
        </div>

        {/* Records */}
        <div className="rounded-2xl border bg-card">
          <div className="space-y-3 p-4">
            <p className="text-sm font-semibold tracking-tight">
              Check-ins{' '}
              <span className="font-normal text-muted-foreground">({visibleRecords.length})</span>
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or student ID"
                aria-label="Search records"
                className="h-11 rounded-xl pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter records by status">
              {RECORD_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  aria-pressed={statusFilter === f.key}
                  className={cn(
                    'h-9 rounded-full border px-3.5 text-xs font-semibold transition-colors',
                    statusFilter === f.key
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-h-[28rem] divide-y border-t overflow-y-auto scrollbar-thin">
            {visibleRecords.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {session.records.length === 0
                  ? 'No check-ins recorded yet.'
                  : 'No records match this search.'}
              </p>
            ) : (
              visibleRecords.map((r) => <RecordRow key={r.id ?? r.studentId} record={r} />)
            )}
          </div>
        </div>

        <p className="px-1 text-xs text-muted-foreground">
          Roster size {session.rosterSize} · not marked = absent
        </p>

        {/* Footer actions */}
        <div className="flex gap-2 pt-1">
          <Button asChild className="min-h-11 flex-1">
            <a href={`/api/export/session/${sessionId}`} download>
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="min-h-11 flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Delete session
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-sm rounded-2xl">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this session?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the session and all its attendance records. This
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="min-h-11 rounded-xl">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleting}
                  onClick={(e) => {
                    e.preventDefault()
                    void handleDelete()
                  }}
                  className="min-h-11 rounded-xl bg-destructive text-white hover:bg-destructive/90"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </motion.div>
    </div>
  )
}

function RecordRow({ record }: { record: AttendanceRecord }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <IdentityAvatar name={record.name ?? record.studentId} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{record.name ?? 'Unknown student'}</p>
        <p className="font-mono text-[11px] text-muted-foreground">{record.code ?? record.studentId}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="flex items-center gap-1.5">
          <StatusPill status={record.status} />
          <MethodBadge method={record.method} />
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {format(parseISO(record.markedAt), 'h:mm a')}
        </span>
      </div>
    </div>
  )
}
