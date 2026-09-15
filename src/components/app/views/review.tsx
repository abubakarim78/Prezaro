'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/lib/store'
import { api, getErrorMessage } from '@/lib/api'
import { getCachedRoster, pendingForSession } from '@/lib/offline'
import type { AttendanceRecord, AttendanceStatus, RosterEntry, SessionDetail } from '@/lib/types'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { AttendanceRing, IdentityAvatar, LoadingBlock } from '@/components/app/shared'

type RowStatus = AttendanceStatus

interface Row {
  studentId: string // DB id
  code: string // index number
  name: string
  status: RowStatus
  confidence?: number | null
  markedAt: string
}

export default function ReviewView() {
  const { params, back, replace, setOpenSession } = useAppStore()
  const sessionId = params.sessionId

  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [session, setSession] = useState<SessionDetail | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [query, setQuery] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [rosterMissing, setRosterMissing] = useState(false)

  const submittedRef = useRef(false)

  // ---------- load ----------
  const load = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    setOffline(false)
    try {
      const { session: s } = await api<{ session: SessionDetail }>(`/api/sessions/${sessionId}`)
      setSession(s)

      // roster: cache first (works offline), else network
      let roster: RosterEntry[] = []
      const cached = getCachedRoster(s.courseId)
      if (cached && cached.roster.length > 0) {
        roster = cached.roster
      } else {
        try {
          const r = await api<{ roster: RosterEntry[] }>(`/api/courses/${s.courseId}/roster`)
          roster = r.roster
        } catch {
          setRosterMissing(true)
        }
      }

      // server records keyed by studentId
      const byStudent = new Map<string, AttendanceRecord>()
      for (const rec of s.records) byStudent.set(rec.studentId, rec)

      // merge offline queue (queue wins if newer)
      for (const p of pendingForSession(sessionId)) {
        const existing = byStudent.get(p.studentId)
        if (!existing || new Date(p.markedAt) >= new Date(existing.markedAt)) {
          byStudent.set(p.studentId, {
            studentId: p.studentId,
            name: p.name,
            status: p.status,
            confidence: p.confidence ?? null,
            markedAt: p.markedAt,
          })
        }
      }

      const nowISO = new Date().toISOString()
      const next: Row[] = roster.map((st) => {
        const rec = byStudent.get(st.id)
        return {
          studentId: st.id,
          code: st.studentId,
          name: `${st.firstName} ${st.lastName}`,
          status: rec ? rec.status : 'ABSENT',
          confidence: rec?.confidence ?? null,
          markedAt: rec?.markedAt ?? nowISO,
        }
      })

      // students not in roster but with records (defensive)
      const rosterIds = new Set(roster.map((r) => r.id))
      for (const [sid, rec] of byStudent) {
        if (!rosterIds.has(sid)) {
          next.push({
            studentId: sid,
            code: rec.code ?? rec.studentId,
            name: rec.name ?? rec.studentId,
            status: rec.status,
            confidence: rec.confidence ?? null,
            markedAt: rec.markedAt,
          })
        }
      }

      next.sort((a, b) => a.name.localeCompare(b.name))
      setRows(next)
    } catch (e) {
      if (getErrorMessage(e).toLowerCase().includes('offline')) {
        setOffline(true)
        toast.error('You are offline — reconnect to review this session')
      } else {
        toast.error(getErrorMessage(e))
        back()
      }
    } finally {
      setLoading(false)
    }
  }, [sessionId, back])

  useEffect(() => {
    void load()
     
  }, [])

  // ---------- derived ----------
  const present = rows.filter((r) => r.status === 'PRESENT').length
  const late = rows.filter((r) => r.status === 'LATE').length
  const absent = rows.filter((r) => r.status === 'ABSENT').length
  const rosterSize = rows.length
  const percent = rosterSize > 0 ? ((present + late) / rosterSize) * 100 : 0

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)
    )
  }, [rows, query])

  const completed = session?.status === 'COMPLETED' || session?.status === 'CANCELLED'

  // ---------- actions ----------
  const setStatus = (studentId: string, status: RowStatus) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.studentId !== studentId) return r
        if (r.status === status) return r
        return { ...r, status }
      })
    )
  }

  const submit = async () => {
    if (!session || submitting || submittedRef.current) return
    setSubmitting(true)
    try {
      const records: AttendanceRecord[] = rows.map((r) => ({
        studentId: r.studentId,
        status: r.status,
        confidence: r.confidence ?? null,
        markedAt: r.markedAt,
      }))
      await api(`/api/sessions/${session.id}/finalize`, {
        method: 'POST',
        body: { records },
      })
      submittedRef.current = true
      setOpenSession(null)
      toast.success('Attendance submitted', {
        description: `${present + late} of ${rosterSize} present for ${session.courseCode}`,
      })
      replace('home')
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  const discard = async () => {
    if (!session) return
    try {
      await api(`/api/sessions/${session.id}`, { method: 'DELETE' })
      setOpenSession(null)
      toast('Session discarded')
      replace('home')
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  // ---------- render ----------
  if (loading) {
    return (
      <div className="min-h-dvh bg-background">
        <header className="flex items-center gap-3 px-4 h-14 pt-safe border-b">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-medium text-muted-foreground">Review session</p>
        </header>
        <LoadingBlock label="Loading attendance…" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 bg-background">
        <Card className="p-6 max-w-sm text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
          <p className="mt-3 font-semibold">Session unavailable</p>
          <p className="text-sm text-muted-foreground mt-1">
            {offline ? 'Reconnect to load this session.' : 'This session could not be found.'}
          </p>
          <Button className="mt-4 w-full" variant="outline" onClick={back}>
            Go back
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      {/* header */}
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b pt-safe">
        <div className="flex items-center gap-3 px-4 h-14">
          <button
            onClick={back}
            className="h-10 w-10 -ml-2 rounded-xl flex items-center justify-center hover:bg-accent"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="font-semibold tracking-tight text-sm truncate">
              {session.courseCode} · {session.courseTitle}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {format(new Date(session.startedAt), 'EEE d MMM yyyy · h:mm a')}
            </p>
          </div>
          <a
            href={`/api/export/session/${session.id}`}
            download
            className="h-10 px-3 rounded-xl border flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent"
          >
            <Download className="h-3.5 w-3.5" />
            CSV
          </a>
        </div>
      </header>

      <div className="flex-1 pb-36">
        {/* stats */}
        <div className="px-4 lg:px-8 pt-5">
          <Card className="p-4 flex items-center gap-5">
            <AttendanceRing percent={percent} size={64} stroke={7} />
            <div className="flex-1 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {present}
                </p>
                <p className="text-[11px] text-muted-foreground font-medium flex items-center justify-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Present
                </p>
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums text-amber-500">{late}</p>
                <p className="text-[11px] text-muted-foreground font-medium flex items-center justify-center gap-1">
                  <Clock className="h-3 w-3" /> Late
                </p>
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums text-rose-500">{absent}</p>
                <p className="text-[11px] text-muted-foreground font-medium flex items-center justify-center gap-1">
                  <X className="h-3 w-3" /> Absent
                </p>
              </div>
            </div>
          </Card>

          {completed && (
            <div className="mt-3 rounded-xl border border-emerald-600/20 bg-emerald-600/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400 font-medium">
              This session was already submitted — records are read-only.
            </div>
          )}
          {offline && !completed && (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Offline — reconnect to submit. Your scanned records are safe on this device.
            </div>
          )}
          {rosterMissing && rows.length === 0 && (
            <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-700 dark:text-rose-400 font-medium">
              Roster could not be loaded. Submit needs the class roster.
            </div>
          )}
        </div>

        {/* search */}
        <div className="px-4 lg:px-8 mt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or student ID…"
              className="pl-9 h-11 rounded-xl bg-card"
              inputMode="search"
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground px-1">
            Unmarked students are automatically marked absent when you submit.
          </p>
        </div>

        {/* roster */}
        <div className="px-4 lg:px-8 mt-3">
          <Card className="divide-y overflow-hidden">
            {filtered.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No students match “{query}”.
              </div>
            )}
            {filtered.map((r) => (
              <div
                key={r.studentId}
                className={cn(
                  'flex items-center gap-3 p-3',
                  completed && 'opacity-90'
                )}
              >
                <IdentityAvatar name={r.name} className="h-9 w-9" />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] text-muted-foreground font-mono">{r.code}</span>
                  </div>
                </div>
                <StatusSegment
                  value={r.status}
                  disabled={completed || offline}
                  onChange={(s) => setStatus(r.studentId, s)}
                />
              </div>
            ))}
          </Card>
        </div>
      </div>

      {/* bottom bar */}
      {!completed && (
        <div className="fixed bottom-0 inset-x-0 z-30 border-t bg-background/95 backdrop-blur pb-safe">
          <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 py-3">
            <Button
              variant="outline"
              className="h-12 text-destructive hover:text-destructive"
              onClick={() => setDiscardOpen(true)}
              disabled={submitting}
            >
              <Trash2 className="h-4 w-4" />
              Discard
            </Button>
            <Button
              className="flex-1 h-12 font-semibold"
              onClick={submit}
              disabled={submitting || offline || rows.length === 0}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Submit attendance
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this session?</AlertDialogTitle>
            <AlertDialogDescription>
              All {rows.length > 0 ? present + late : ''} check-ins for {session.courseCode} will be
              permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep session</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={discard}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ---------- per-row segmented control ----------

function StatusSegment({
  value,
  onChange,
  disabled,
}: {
  value: RowStatus
  onChange: (s: RowStatus) => void
  disabled?: boolean
}) {
  const options: { v: RowStatus; label: string; on: string }[] = [
    { v: 'PRESENT', label: 'P', on: 'bg-emerald-600 text-white border-emerald-600' },
    { v: 'LATE', label: 'L', on: 'bg-amber-500 text-white border-amber-500' },
    { v: 'ABSENT', label: 'A', on: 'bg-rose-500 text-white border-rose-500' },
  ]
  return (
    <div
      className="flex rounded-lg border bg-muted/40 p-0.5 gap-0.5"
      role="radiogroup"
      aria-label="Attendance status"
    >
      {options.map((o) => (
        <button
          key={o.v}
          role="radio"
          aria-checked={value === o.v}
          aria-label={o.v.charAt(0) + o.v.slice(1).toLowerCase()}
          disabled={disabled}
          onClick={() => onChange(o.v)}
          className={cn(
            'h-8 w-8 rounded-md text-xs font-bold transition-colors min-h-8',
            value === o.v
              ? o.on
              : 'text-muted-foreground hover:bg-accent',
            disabled && 'opacity-60'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
