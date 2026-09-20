'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import {
  AlertCircle,
  ArrowLeft,
  CalendarX2,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Footprints,
  Loader2,
  MonitorSmartphone,
  MoreVertical,
  Play,
  ScanFace,
  Search,
  Trash2,
  TriangleAlert,
  UserPlus,
  UserRound,
  Users,
} from 'lucide-react'
import type {
  AttendanceRecord,
  AttendanceStatus,
  RosterEntry,
  SessionDetail,
  SessionMode,
  SessionResponse,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  EmptyState,
  IdentityAvatar,
  LoadingBlock,
  StatCard,
  StatusPill,
} from '@/components/app/shared'

const MODE_META: Record<SessionMode, { icon: typeof ScanFace; label: string }> = {
  WALKTHROUGH: { icon: Footprints, label: 'Walkthrough' },
  KIOSK: { icon: MonitorSmartphone, label: 'Kiosk' },
  MANUAL: { icon: UserRound, label: 'Manual' },
}

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
  const [reopening, setReopening] = useState(false)

  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<RecordFilter>('ALL')

  // ---- Latecomers Drawer State ----
  const [lateDrawerOpen, setLateDrawerOpen] = useState(false)
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [loadingRoster, setLoadingRoster] = useState(false)
  const [lateQuery, setLateQuery] = useState('')
  const [markingId, setMarkingId] = useState<string | null>(null)

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

  // Load roster when opening latecomers drawer
  useEffect(() => {
    if (!lateDrawerOpen || !session) return
    let alive = true
    setLoadingRoster(true)
    api<{ roster: RosterEntry[] }>(`/api/courses/${session.courseId}/roster`)
      .then((d) => {
        if (alive) setRoster(d.roster)
      })
      .catch((e) => {
        toast.error('Failed to load roster: ' + getErrorMessage(e))
      })
      .finally(() => {
        if (alive) setLoadingRoster(false)
      })
    return () => {
      alive = false
    }
  }, [lateDrawerOpen, session])

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

  // Absent students for late drawer
  const absentStudents = useMemo(() => {
    if (!session) return []
    const presentIds = new Set(
      session.records.filter((r) => r.status !== 'ABSENT').map((r) => r.studentId)
    )
    const q = lateQuery.trim().toLowerCase()
    return roster.filter((st) => {
      if (presentIds.has(st.id)) return false
      if (!q) return true
      const fullName = `${st.firstName} ${st.lastName}`.toLowerCase()
      return fullName.includes(q) || st.studentId.toLowerCase().includes(q)
    })
  }, [roster, session, lateQuery])

  // Quick mark student as LATE or PRESENT
  const handleMarkStudent = async (studentId: string, status: 'LATE' | 'PRESENT') => {
    if (!session || markingId) return
    setMarkingId(studentId)
    try {
      const res = await api<{ session: SessionDetail }>(`/api/sessions/${session.id}/records`, {
        method: 'POST',
        body: { studentId, status },
      })
      setSession(res.session)
      const st = roster.find((r) => r.id === studentId)
      toast.success(
        `${st ? `${st.firstName} ${st.lastName}` : 'Student'} marked ${status.toLowerCase()}`
      )
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setMarkingId(null)
    }
  }

  // Update existing record status
  const handleUpdateRecordStatus = async (studentId: string, status: AttendanceStatus) => {
    if (!session) return
    try {
      const res = await api<{ session: SessionDetail }>(`/api/sessions/${session.id}/records`, {
        method: 'POST',
        body: { studentId, status },
      })
      setSession(res.session)
      toast.success(`Status changed to ${status.toLowerCase()}`)
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  // Delete record from session
  const handleDeleteRecord = async (studentId: string) => {
    if (!session) return
    try {
      const res = await api<{ session: SessionDetail }>(
        `/api/sessions/${session.id}/records?studentId=${encodeURIComponent(studentId)}`,
        { method: 'DELETE' }
      )
      setSession(res.session)
      toast.success('Record removed')
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  // Resume camera scanning (reopens session if completed, activates Late Mode)
  const handleResumeScan = async (lateMode = true) => {
    if (!session) return
    setReopening(true)
    try {
      if (session.status !== 'OPEN') {
        await api(`/api/sessions/${session.id}/reopen`, { method: 'POST' })
      }
      setOpenSession({
        id: session.id,
        courseId: session.courseId,
        courseCode: session.courseCode,
        mode: session.mode,
      })
      navigate('scan', {
        courseId: session.courseId,
        sessionId: session.id,
        lateMode: lateMode ? '1' : '0',
      })
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setReopening(false)
    }
  }

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
        <div className="min-w-0 flex-1 pt-0.5">
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
        {/* Open session banner */}
        {isOpen ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
              <TriangleAlert className="h-4 w-4" />
              Session in progress
            </div>
            <p className="mt-1 text-xs text-amber-700/85 dark:text-amber-400/85">
              Attendance scanner is active. You can add late arrivals or finalize when class finishes.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                className="min-h-11"
                disabled={reopening}
                onClick={() => handleResumeScan(false)}
              >
                <ScanFace className="h-4 w-4" />
                Resume scanner
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="min-h-11 border-amber-600/30 bg-background/60"
                onClick={() => setLateDrawerOpen(true)}
              >
                <UserPlus className="h-4 w-4" />
                Add latecomers
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
        ) : (
          /* Completed Session: Quick Action Bar for Late Arrivals */
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
            <div>
              <p className="text-sm font-semibold tracking-tight">Need to add late arrivals?</p>
              <p className="text-xs text-muted-foreground">
                Add students who came in late without creating a new session.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="min-h-10 gap-1.5"
                onClick={() => setLateDrawerOpen(true)}
              >
                <UserPlus className="h-4 w-4" />
                Quick add latecomers
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="min-h-10 gap-1.5"
                disabled={reopening}
                onClick={() => handleResumeScan(true)}
              >
                {reopening ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ScanFace className="h-4 w-4" />
                )}
                Resume camera scan
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

        {/* Records */}
        <div className="rounded-2xl border bg-card">
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold tracking-tight">
                Check-ins{' '}
                <span className="font-normal text-muted-foreground">({visibleRecords.length})</span>
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLateDrawerOpen(true)}
                className="h-8 gap-1.5 text-xs text-primary"
              >
                <UserPlus className="h-3.5 w-3.5" />
                + Add student
              </Button>
            </div>
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
              visibleRecords.map((r) => (
                <RecordRow
                  key={r.id ?? r.studentId}
                  record={r}
                  onUpdateStatus={(status) => handleUpdateRecordStatus(r.studentId, status)}
                  onDelete={() => handleDeleteRecord(r.studentId)}
                />
              ))
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

      {/* ---------- Latecomers Quick Add Sheet ---------- */}
      <Sheet open={lateDrawerOpen} onOpenChange={setLateDrawerOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] rounded-t-3xl pb-safe flex flex-col">
          <SheetHeader className="text-left pb-2">
            <SheetTitle className="flex items-center gap-2 text-lg">
              <UserPlus className="h-5 w-5 text-primary" />
              Add Latecomers to Session
            </SheetTitle>
            <SheetDescription>
              Mark absent students who arrived late to this class without creating a new session.
            </SheetDescription>
          </SheetHeader>

          <div className="relative my-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={lateQuery}
              onChange={(e) => setLateQuery(e.target.value)}
              placeholder="Search by student name or index number…"
              className="h-11 rounded-xl pl-9"
            />
          </div>

          <div className="flex-1 overflow-y-auto divide-y border rounded-xl max-h-[50vh] scrollbar-thin">
            {loadingRoster ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-xs">Loading course roster…</p>
              </div>
            ) : absentStudents.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground px-4">
                {roster.length === 0
                  ? 'No students enrolled in this course.'
                  : lateQuery
                  ? 'No absent students match your search.'
                  : 'All enrolled students are already marked present or late! 🎉'}
              </div>
            ) : (
              absentStudents.map((st) => (
                <div key={st.id} className="flex items-center justify-between p-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <IdentityAvatar name={`${st.firstName} ${st.lastName}`} />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {st.firstName} {st.lastName}
                      </p>
                      <p className="text-xs font-mono text-muted-foreground">{st.studentId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 px-3 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10 font-semibold text-xs"
                      disabled={markingId === st.id}
                      onClick={() => handleMarkStudent(st.id, 'LATE')}
                    >
                      {markingId === st.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 mr-1" />
                      )}
                      Mark Late
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                      disabled={markingId === st.id}
                      onClick={() => handleMarkStudent(st.id, 'PRESENT')}
                    >
                      Present
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
            <span>{absentStudents.length} currently unmarked</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleResumeScan(true)}
              className="h-8 gap-1.5 text-xs"
            >
              <ScanFace className="h-3.5 w-3.5" />
              Scan with camera instead
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function RecordRow({
  record,
  onUpdateStatus,
  onDelete,
}: {
  record: AttendanceRecord
  onUpdateStatus: (status: AttendanceStatus) => void
  onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-accent/40 transition-colors">
      <IdentityAvatar name={record.name ?? record.studentId} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{record.name ?? 'Unknown student'}</p>
        <p className="font-mono text-[11px] text-muted-foreground">{record.code ?? record.studentId}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <div className="flex flex-col items-end gap-1">
          <StatusPill status={record.status} />
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {format(parseISO(record.markedAt), 'h:mm a')}
          </span>
        </div>

        {/* Quick status edit dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="h-8 w-8 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground"
              aria-label="Change record status"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => onUpdateStatus('PRESENT')} className="gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Mark Present
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onUpdateStatus('LATE')} className="gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              Mark Late
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
