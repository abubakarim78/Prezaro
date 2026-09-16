'use client'

// ============================================================
// Rollmark — Your courses
// Course management for onboarded lecturers: list, add, edit.
// Deliberately its own screen — NOT the onboarding wizard.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import {
  BookPlus,
  ChevronDown,
  GraduationCap,
  Loader2,
  Pencil,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'

import { api, getErrorMessage } from '@/lib/api'
import { termLabel, type Course, type CoursesResponse, type TermSystem } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState, PageHeader } from '@/components/app/shared'

const LEVELS = [100, 200, 300, 400, 500, 600] as const

/** Term select values: S1/S2 = semesters, T1/T2/T3 = trimesters. */
const TERM_OPTIONS: { value: string; label: string }[] = [
  { value: 'S1', label: 'Semester 1' },
  { value: 'S2', label: 'Semester 2' },
  { value: 'T1', label: 'Trimester 1' },
  { value: 'T2', label: 'Trimester 2' },
  { value: 'T3', label: 'Trimester 3' },
]

function parseTerm(value: string): { semester: number; termSystem: TermSystem } {
  const trimester = value.startsWith('T')
  const n = Number(value.slice(1)) || 1
  return { semester: n, termSystem: trimester ? 'TRIMESTER' : 'SEMESTER' }
}

function termToValue(semester: number, termSystem: TermSystem): string {
  return `${termSystem === 'TRIMESTER' ? 'T' : 'S'}${semester}`
}

// ============================================================

export default function CoursesView() {
  const [courses, setCourses] = useState<Course[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Course | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const c = await api<CoursesResponse>('/api/courses')
      setCourses(c.courses ?? [])
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onCreated = (course: Course) => {
    setCourses((prev) =>
      [...(prev ?? []), course].sort((a, b) => a.code.localeCompare(b.code))
    )
    setFormOpen(false)
    toast.success(`${course.code} added to your courses`)
  }

  const onUpdated = (course: Course) => {
    setCourses((prev) =>
      (prev ?? []).map((c) => (c.id === course.id ? course : c))
    )
    setEditing(null)
    toast.success(`${course.code} updated`)
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Your courses"
        subtitle={
          loading ? 'Loading…' : `${courses?.length ?? 0} course${(courses?.length ?? 0) === 1 ? '' : 's'}`
        }
        right={
          <Button
            className="min-h-11"
            onClick={() => setFormOpen((v) => !v)}
            aria-expanded={formOpen}
          >
            {formOpen ? <ChevronDown className="h-4 w-4" /> : <BookPlus className="h-4 w-4" />}
            {formOpen ? 'Close' : 'Add course'}
          </Button>
        }
      />

      <div className="px-4 pb-6 lg:px-8">
        {/* ---------- Add course form ---------- */}
        {formOpen && (
          <div className="mb-4 rounded-2xl border bg-card p-4 sm:p-5">
            <h2 className="text-sm font-semibold tracking-tight">New course</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Created instantly in your department — students join it from the Students page.
            </p>
            <CourseForm
              className="mt-4"
              submittingLabel="Creating…"
              submitLabel="Create course"
              onSubmit={async (body) => {
                const { course } = await api<{ course: Course }>('/api/courses', {
                  method: 'POST',
                  body,
                })
                onCreated(course)
              }}
            />
          </div>
        )}

        {/* ---------- Course list ---------- */}
        {loading || courses === null ? (
          <div className="space-y-3">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-20 rounded-2xl" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border bg-card p-6 text-center">
            <p className="font-semibold">Couldn&apos;t load your courses</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-4 min-h-10" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : courses.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No courses yet"
            description="Create your first course to start taking attendance for it."
            action={
              <Button className="min-h-11" onClick={() => setFormOpen(true)}>
                <BookPlus className="h-4 w-4" /> Add your first course
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {courses.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-2xl border bg-card p-4 transition-colors hover:bg-accent/40"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 font-mono text-xs font-bold text-primary">
                  {c.code.replace(/\s+/g, '').slice(0, 4)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold tracking-tight">
                    <span className="font-mono text-primary">{c.code}</span>
                    <span className="mx-1.5 text-muted-foreground/50">·</span>
                    {c.title}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-px font-medium">Level {c.level}</span>
                    <span className="rounded bg-muted px-1.5 py-px font-medium">{termLabel(c)}</span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" /> {c.studentCount}
                    </span>
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 shrink-0 text-muted-foreground"
                  onClick={() => setEditing(c)}
                  aria-label={`Edit ${c.code}`}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- Edit course dialog ---------- */}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editing?.code}</DialogTitle>
            <DialogDescription>
              Update the course details. Changes apply everywhere immediately.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <CourseForm
              key={editing.id}
              initial={editing}
              submittingLabel="Saving…"
              submitLabel="Save changes"
              onSubmit={async (body) => {
                const { course } = await api<{ course: Course }>(`/api/courses/${editing.id}`, {
                  method: 'PATCH',
                  body,
                })
                onUpdated(course)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------- shared form (add + edit) ----------

interface CourseBody {
  code: string
  title: string
  level: number
  semester: number
  termSystem: TermSystem
}

function CourseForm({
  initial,
  onSubmit,
  submitLabel,
  submittingLabel,
  className,
}: {
  initial?: Course
  onSubmit: (body: CourseBody) => Promise<void>
  submitLabel: string
  submittingLabel: string
  className?: string
}) {
  const [code, setCode] = useState(initial?.code ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [level, setLevel] = useState(String(initial?.level ?? 100))
  const [term, setTerm] = useState(
    initial ? termToValue(initial.semester, initial.termSystem) : 'S1'
  )
  const [saving, setSaving] = useState(false)

  const valid = code.trim().length > 0 && title.trim().length > 0

  const submit = async () => {
    if (!valid || saving) return
    setSaving(true)
    try {
      const { semester, termSystem } = parseTerm(term)
      await onSubmit({
        code: code.trim().toUpperCase(),
        title: title.trim(),
        level: Number(level) || 100,
        semester,
        termSystem,
      })
    } catch (e) {
      toast.error(getErrorMessage(e))
      setSaving(false)
    }
  }

  return (
    <form
      className={`space-y-3 ${className ?? ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="cf-code">Code</Label>
          <Input
            id="cf-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CS301"
            className="h-11 font-mono uppercase"
            autoFocus={!initial}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cf-level">Level</Label>
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger id="cf-level" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVELS.map((l) => (
                <SelectItem key={l} value={String(l)}>
                  Level {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cf-title">Title</Label>
        <Input
          id="cf-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Software Engineering"
          className="h-11"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cf-term">Term</Label>
        <Select value={term} onValueChange={setTerm}>
          <SelectTrigger id="cf-term" className="h-11 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TERM_OPTIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" className="min-h-11 w-full" disabled={!valid || saving}>
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> {submittingLabel}
          </>
        ) : (
          submitLabel
        )}
      </Button>
    </form>
  )
}
