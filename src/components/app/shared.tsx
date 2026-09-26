'use client'

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScanFace, UserRound, Camera, Check, Clock3, Eye, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { EnrollmentSubmission } from '@/lib/types'

// ---------- Page header ----------

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 px-4 lg:px-8 pt-5 lg:pt-8 pb-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl lg:text-2xl font-bold tracking-tight text-balance">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {right && (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
          {right}
        </div>
      )}
    </div>
  )
}

// ---------- Stat card ----------

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: string | number
  sub?: string
  icon: typeof ScanFace
  tone?: 'default' | 'primary' | 'warning' | 'danger'
}) {
  const tones: Record<string, string> = {
    default: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    warning: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
    danger: 'bg-destructive/10 text-destructive',
  }
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <div className={cn('flex h-7 w-7 items-center justify-center rounded-lg', tones[tone])}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

// ---------- Identity avatar (initials, deterministic tone) ----------

const AVATAR_TONES = [
  'bg-emerald-600/12 text-emerald-700 dark:text-emerald-400',
  'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  'bg-rose-500/12 text-rose-700 dark:text-rose-400',
  'bg-teal-600/12 text-teal-700 dark:text-teal-400',
  'bg-lime-600/15 text-lime-700 dark:text-lime-400',
  'bg-stone-500/15 text-stone-700 dark:text-stone-300',
]

export function IdentityAvatar({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const hash = [...name].reduce((a, c) => a + c.charCodeAt(0), 0)
  const tone = AVATAR_TONES[hash % AVATAR_TONES.length]
  const ini = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  return (
    <Avatar className={cn('h-10 w-10', className)}>
      <AvatarFallback className={cn('text-xs font-semibold', tone)}>
        {ini || '?'}
      </AvatarFallback>
    </Avatar>
  )
}

// ---------- Empty state ----------

export function EmptyState({
  icon: Icon = UserRound,
  title,
  description,
  action,
}: {
  icon?: typeof ScanFace
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="mt-4 font-semibold tracking-tight">{title}</p>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground max-w-xs text-balance">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

// ---------- Loading block ----------

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {label}
    </div>
  )
}

// ---------- Camera badge ----------

export function CameraBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-emerald-600/10 text-emerald-700 dark:text-emerald-400">
      <Camera className="h-3 w-3" />
      Camera
    </span>
  )
}

// ---------- Attendance ring ----------

export function AttendanceRing({
  percent,
  size = 44,
  stroke = 5,
}: {
  percent: number
  size?: number
  stroke?: number
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(100, percent))
  const color =
    clamped >= 75 ? 'text-emerald-600' : clamped >= 50 ? 'text-amber-500' : 'text-rose-500'
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (clamped / 100) * c}
          className={cn(color, 'transition-all duration-700')}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums"
        aria-label={`${Math.round(clamped)} percent`}
      >
        {Math.round(clamped)}%
      </span>
    </div>
  )
}

// ---------- Attendance bar ----------

export function AttendanceBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent))
  const color = clamped >= 75 ? 'bg-emerald-600' : clamped >= 50 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all duration-700', color)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

// ---------- Status pill ----------

export function StatusPill({
  status,
}: {
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED' | 'PRESENT' | 'LATE' | 'ABSENT'
}) {
  const map: Record<string, string> = {
    OPEN: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20',
    COMPLETED: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border-emerald-600/20',
    CANCELLED: 'bg-muted text-muted-foreground border-transparent',
    PRESENT: 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400 border-emerald-600/20',
    LATE: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/20',
    ABSENT: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20',
  }
  return (
    <Badge variant="outline" className={cn('text-[10px] font-semibold px-2', map[status])}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  )
}

// ---------- Enrollment request card (shared Dean / HoD queue) ----------

const ENROLLMENT_STATUS_STYLE: Record<string, string> = {
  PENDING: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  APPROVED: 'border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  REJECTED: 'border-destructive/30 bg-destructive/10 text-destructive',
}

const SLICE_CHIP_STYLE: Record<string, string> = {
  PENDING: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  APPROVED: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  REJECTED: 'border-destructive/30 bg-destructive/10 text-destructive',
}

/**
 * Vertical mobile-first card for a student self-enrollment submission.
 * Courses are grouped by owning department as scrollable rows (survives 6+
 * courses), with per-department approval progress chips and a footer action
 * slot rendered inside a 2-column grid.
 */
export function EnrollmentRequestCard({
  submission,
  actions,
}: {
  submission: EnrollmentSubmission
  /** Footer action slot — rendered inside a grid-cols-2 container. */
  actions?: React.ReactNode
}) {
  const [zoomOpen, setZoomOpen] = useState(false)

  // Group requested courses by their owning department.
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; courses: { id: string; code: string; title: string }[] }>()
    for (const c of submission.courses ?? []) {
      const key = c.departmentId ?? '_none'
      const name = c.departmentName ?? 'Other courses'
      const group = map.get(key) ?? { key, name, courses: [] }
      group.courses.push({ id: c.id, code: c.code, title: c.title })
      map.set(key, group)
    }
    return Array.from(map.values())
  }, [submission.courses])

  return (
    <div className="min-w-0 rounded-2xl border bg-card p-4">
      {/* Header: photo, identity, status badge */}
      <div className="flex min-w-0 items-start gap-3">
        {submission.photoData ? (
          <button
            type="button"
            onClick={() => setZoomOpen(true)}
            className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-primary/20 shadow-xs focus-visible:ring-2"
            title="Tap to view full photo"
          >
            <img
              src={submission.photoData}
              alt={submission.firstName}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
              <Eye className="h-4 w-4 text-white" />
            </div>
          </button>
        ) : (
          <IdentityAvatar name={`${submission.firstName} ${submission.lastName}`} className="h-12 w-12" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {submission.firstName} {submission.lastName}
              </p>
              <p className="truncate font-mono text-xs text-muted-foreground">{submission.studentId}</p>
            </div>
            <Badge
              variant="outline"
              className={cn('shrink-0 px-1.5 py-0 text-[10px] font-semibold uppercase', ENROLLMENT_STATUS_STYLE[submission.status])}
            >
              {submission.status}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">{submission.email}</p>
          <p className="truncate text-xs text-muted-foreground">
            Level {submission.level} · {submission.descriptorsCount || 3} poses ·{' '}
            {new Date(submission.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Per-department progress chips */}
      {(submission.approvals?.length ?? 0) > 0 && (
        <div className="mt-3 flex min-w-0 flex-wrap gap-1.5">
          {submission.approvals!.map((a) => (
            <span
              key={a.id}
              className={cn(
                'inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                SLICE_CHIP_STYLE[a.status],
              )}
              title={a.status === 'REJECTED' && a.rejectionReason ? a.rejectionReason : a.departmentName ?? undefined}
            >
              {a.status === 'APPROVED' ? (
                <Check className="h-3 w-3 shrink-0" />
              ) : a.status === 'REJECTED' ? (
                <X className="h-3 w-3 shrink-0" />
              ) : (
                <Clock3 className="h-3 w-3 shrink-0" />
              )}
              <span className="truncate">{a.departmentCode || a.departmentName || 'Department'}</span>
            </span>
          ))}
        </div>
      )}

      {/* Requested courses grouped by owning department */}
      {groups.length > 0 ? (
        <div className="mt-3 min-w-0 rounded-xl border bg-muted/30">
          <div className="max-h-56 divide-y overflow-y-auto scrollbar-thin">
            {groups.map((g) => (
              <div key={g.key} className="min-w-0 space-y-1 px-3 py-2">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {g.name}
                </p>
                {g.courses.map((c) => (
                  <div key={c.id} className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 font-mono text-[11px] font-bold text-foreground">{c.code}</span>
                    <span className="min-w-0 truncate text-xs text-muted-foreground">{c.title}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : submission.courseIds.length > 0 ? (
        <div className="mt-3 flex min-w-0 flex-wrap gap-1">
          {submission.courseIds.map((cId) => (
            <span
              key={cId}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground"
            >
              {cId.slice(-6).toUpperCase()}
            </span>
          ))}
        </div>
      ) : null}

      {/* Footer action slot */}
      {actions && <div className="mt-3 grid grid-cols-2 gap-2">{actions}</div>}

      {/* Photo zoom dialog */}
      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{submission.firstName} {submission.lastName}</DialogTitle>
            <DialogDescription>Student enrollment facial capture preview</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center p-2">
            {submission.photoData && (
              <img
                src={submission.photoData}
                alt={`${submission.firstName} ${submission.lastName}`}
                className="max-h-72 w-auto rounded-2xl object-cover border shadow-md"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="w-full" onClick={() => setZoomOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
