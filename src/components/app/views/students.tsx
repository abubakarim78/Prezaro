'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import QRCode from 'qrcode'
import {
  ChevronRight,
  FileUp,
  Loader2,
  Plus,
  QrCode,
  ScanFace,
  Search,
  UserRoundPlus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getErrorMessage } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type {
  CoursesResponse,
  RosterResponse,
  StudentListItem,
  StudentsResponse,
  Course,
} from '@/lib/types'
import { STUDENT_ID_PATTERN } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState, IdentityAvatar, PageHeader } from '@/components/app/shared'
import { cn } from '@/lib/utils'

const LEVELS = [100, 200, 300, 400, 500] as const

export default function StudentsView() {
  const navigate = useAppStore((s) => s.navigate)

  // ---- data ----
  const [students, setStudents] = useState<StudentListItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [courseFilter, setCourseFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')

  // ---- dialogs ----
  const [newOpen, setNewOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)

  const loadCourses = useCallback(async () => {
    try {
      const c = await api<CoursesResponse>('/api/courses')
      setCourses(c.courses ?? [])
    } catch {
      setCourses([]) // filter row degrades to "All" only
    }
  }, [])

  // No synchronous setState so this can be safely triggered from effects;
  // handlers that need a visible reload set loading themselves first.
  const loadStudents = useCallback(
    async (filter: string) => {
      try {
        const path =
          filter === 'all' ? '/api/students' : `/api/courses/${filter}/students`
        const d = await api<StudentsResponse>(path)
        setStudents(d.students ?? [])
        setError(null)
        setLoading(false)
      } catch (e) {
        setError(getErrorMessage(e))
        setLoading(false)
      }
    },
    []
  )

  // Initial load — inline async so setState only fires after an await.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const c = await api<CoursesResponse>('/api/courses')
        if (!cancelled) setCourses(c.courses ?? [])
      } catch {
        if (!cancelled) setCourses([]) // filter row degrades to "All" only
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Re-run list load whenever the course filter changes — inline async so
  // setState only fires after an await.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const path =
          courseFilter === 'all' ? '/api/students' : `/api/courses/${courseFilter}/students`
        const d = await api<StudentsResponse>(path)
        if (!cancelled) {
          setStudents(d.students ?? [])
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
  }, [courseFilter])

  // ---- debounced search ----
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim().toLowerCase()), 250)
    return () => clearTimeout(t)
  }, [search])

  const filtered = useMemo(() => {
    const list = students ?? []
    if (!query) return list
    return list.filter((s) => {
      const hay = `${s.firstName} ${s.lastName} ${s.studentId}`.toLowerCase()
      return hay.includes(query)
    })
  }, [students, query])

  const refresh = () => {
    setLoading(true)
    loadStudents(courseFilter)
    loadCourses()
  }

  const retry = () => {
    setLoading(true)
    loadStudents(courseFilter)
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Students"
        subtitle={loading ? 'Loading…' : `${filtered.length} student${filtered.length === 1 ? '' : 's'}`}
        right={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="min-h-11">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Add students
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setNewOpen(true)}>
                <UserRoundPlus className="h-4 w-4" /> New student
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCsvOpen(true)}>
                <FileUp className="h-4 w-4" /> Import CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setQrOpen(true)}>
                <QrCode className="h-4 w-4" /> QR code sheets
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="px-4 pb-6 lg:px-8">
        {/* ---------- Search ---------- */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or student ID…"
            className="h-11 pl-9"
            aria-label="Search students"
          />
        </div>

        {/* ---------- Course filter chips ---------- */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-thin" role="tablist" aria-label="Filter by course">
          <FilterChip
            active={courseFilter === 'all'}
            label="All"
            onClick={() => {
              setLoading(true)
              setCourseFilter('all')
            }}
          />
          {courses.map((c) => (
            <FilterChip
              key={c.id}
              active={courseFilter === c.id}
              label={c.code}
              onClick={() => {
                setLoading(true)
                setCourseFilter(c.id)
              }}
            />
          ))}
        </div>

        {/* ---------- List ---------- */}
        <div className="mt-4">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-[68px] rounded-2xl" />
              <Skeleton className="h-[68px] rounded-2xl" />
              <Skeleton className="h-[68px] rounded-2xl" />
              <Skeleton className="h-[68px] rounded-2xl" />
            </div>
          ) : error ? (
            <div className="rounded-2xl border bg-card">
              <EmptyState
                icon={Users}
                title="Couldn't load students"
                description={error}
                action={
                  <Button className="min-h-11" onClick={retry}>
                    Try again
                  </Button>
                }
              />
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border bg-card">
              {query || courseFilter !== 'all' ? (
                <EmptyState
                  icon={Search}
                  title="No matches"
                  description="Try a different search term or clear the course filter."
                />
              ) : (
                <EmptyState
                  icon={Users}
                  title="No students yet"
                  description="Add students one by one, import a CSV list, or share QR sheets."
                  action={
                    <Button className="min-h-11" onClick={() => setNewOpen(true)}>
                      <UserRoundPlus className="h-4 w-4" /> Add student
                    </Button>
                  }
                />
              )}
            </div>
          ) : (
            <div className="max-h-[32rem] divide-y divide-border rounded-2xl border bg-card overflow-y-auto scrollbar-thin">
              {filtered.map((s, i) => (
                <motion.button
                  key={s.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.25) }}
                  onClick={() => navigate('student', { studentId: s.id })}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                >
                  <IdentityAvatar name={`${s.firstName} ${s.lastName}`} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-sm font-medium">
                      {s.firstName} {s.lastName}
                    </span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {s.studentId} · L{s.level}
                    </span>
                  </span>
                  <span
                    title={s.faceEnrolled ? 'Face enrolled' : 'Face not enrolled'}
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                      s.faceEnrolled
                        ? 'bg-emerald-600/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-muted text-muted-foreground/50'
                    )}
                  >
                    <ScanFace className="h-4 w-4" />
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---------- Dialogs ---------- */}
      <NewStudentDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={refresh}
      />
      <ImportCsvDialog open={csvOpen} onOpenChange={setCsvOpen} onImported={refresh} />
      <QrSheetsDialog open={qrOpen} onOpenChange={setQrOpen} courses={courses} />
    </div>
  )
}

// ---------- filter chip ----------

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'min-h-9 shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
      )}
    >
      {label}
    </button>
  )
}

// ---------- new student dialog ----------

function NewStudentDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const [studentId, setStudentId] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [level, setLevel] = useState('100')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)

  const reset = () => {
    setStudentId('')
    setFirstName('')
    setLastName('')
    setLevel('100')
    setEmail('')
    setPhone('')
    setFieldError(null)
  }

  const submit = async () => {
    const sid = studentId.trim()
    if (!STUDENT_ID_PATTERN.test(sid)) {
      setFieldError('Invalid ID — use letters, numbers, / or - (e.g. PHA/0001/26)')
      return
    }
    if (!firstName.trim() || !lastName.trim()) {
      setFieldError('First and last name are required')
      return
    }
    setFieldError(null)
    setSaving(true)
    try {
      await api<StudentsResponse>('/api/students', {
        method: 'POST',
        body: {
          single: {
            studentId: sid,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            level: Number(level) || 100,
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
          },
        },
      })
      toast.success('+1 student')
      onOpenChange(false)
      reset()
      onCreated()
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New student</DialogTitle>
          <DialogDescription>
            Added to your department; enrol them in courses afterwards.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="ns-id">Student ID</Label>
            <Input
              id="ns-id"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value.toUpperCase())}
              placeholder="e.g. PHA/0001/26"
              maxLength={20}
              className="h-11 font-mono"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ns-first">First name</Label>
              <Input
                id="ns-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-last">Last name</Label>
              <Input
                id="ns-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ns-level">Level</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger id="ns-level" className="h-11 w-full">
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
            <div className="space-y-1.5">
              <Label htmlFor="ns-email">
                Email <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="ns-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ns-phone">
              Phone <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="ns-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-11"
            />
          </div>
          {fieldError && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {fieldError}
            </p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button className="min-h-11 flex-1 sm:flex-none" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Add student
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- import CSV dialog ----------

interface CsvRow {
  studentId: string
  firstName: string
  lastName: string
  level: number
  email?: string
  phone?: string
}

function parseCsv(text: string): { rows: CsvRow[]; invalid: number; dupes: number } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const rows: CsvRow[] = []
  let invalid = 0
  for (const line of lines) {
    const parts = line.split(',').map((p) => p.trim())
    if (parts.length < 4) {
      invalid++
      continue
    }
    const [studentId, firstName, lastName, level, email, phone] = parts
    if (
      !studentId ||
      !firstName ||
      !lastName ||
      !/^\d+$/.test(level) ||
      !STUDENT_ID_PATTERN.test(studentId)
    ) {
      invalid++
      continue
    }
    rows.push({
      studentId,
      firstName,
      lastName,
      level: Number(level),
      email: email || undefined,
      phone: phone || undefined,
    })
  }
  const seen = new Set<string>()
  let dupes = 0
  for (const r of rows) {
    if (seen.has(r.studentId)) dupes++
    else seen.add(r.studentId)
  }
  return { rows, invalid, dupes }
}

function ImportCsvDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onImported: () => void
}) {
  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)

  const parsed = useMemo(() => parseCsv(text), [text])

  const submit = async () => {
    if (parsed.rows.length === 0) return
    setImporting(true)
    try {
      const resp = await api<StudentsResponse & { created: number; skipped: number }>(
        '/api/students',
        { method: 'POST', body: { bulk: text } }
      )
      toast.success(`Created ${resp.created ?? parsed.rows.length}, skipped ${resp.skipped ?? 0}`)
      onOpenChange(false)
      setText('')
      onImported()
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
          <DialogDescription>
            Paste one student per line:{' '}
            <span className="font-mono text-xs">studentId,firstName,lastName,level[,email[,phone]]</span>
          </DialogDescription>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'PHA/0001/26,Ama,Mensah,300\nPHA/0002/26,Kofi,Boateng,300,ama@stu.edu'}
          className="min-h-40 font-mono text-xs"
          aria-label="CSV rows"
        />
        {text.trim().length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-medium text-emerald-700 dark:text-emerald-400">
              {parsed.rows.length} row{parsed.rows.length === 1 ? '' : 's'} detected
            </span>
            {parsed.dupes > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {parsed.dupes} duplicate{parsed.dupes === 1 ? '' : 's'} in file
              </span>
            )}
            {parsed.invalid > 0 && (
              <span className="text-destructive">
                {parsed.invalid} invalid line{parsed.invalid === 1 ? '' : 's'}
              </span>
            )}
            <span className="text-muted-foreground">Existing IDs are skipped automatically.</span>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={() => onOpenChange(false)} disabled={importing}>
            Cancel
          </Button>
          <Button
            className="min-h-11 flex-1 sm:flex-none"
            onClick={submit}
            disabled={importing || parsed.rows.length === 0}
          >
            {importing && <Loader2 className="h-4 w-4 animate-spin" />} Import{' '}
            {parsed.rows.length > 0 ? `${parsed.rows.length} students` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- QR sheets dialog ----------

const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  #cc-qr-sheets, #cc-qr-sheets * { visibility: visible !important; }
  #cc-qr-sheets { position: absolute; inset: 0 auto auto 0; width: 100%; max-height: none !important; overflow: visible !important; padding: 8px; }
  #cc-qr-sheets .cc-sheet { break-inside: avoid; page-break-inside: avoid; }
}`

interface Sheet {
  id: string
  name: string
  studentId: string
  pin: string
  dataUrl: string
}

function QrSheetsDialog({
  open,
  onOpenChange,
  courses,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  courses: Course[]
}) {
  const [courseId, setCourseId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheets, setSheets] = useState<Sheet[] | null>(null)
  const [courseLabel, setCourseLabel] = useState('')
  const [nonce, setNonce] = useState(0) // bumped on open / course switch / retry
  const reqRef = useRef(0)

  const effectiveId = courseId || courses[0]?.id || ''

  // Refetch whenever the dialog opens, the course changes, or a retry is
  // requested (nonce). Inline async so setState only fires after an await.
  useEffect(() => {
    if (!open || !effectiveId) return
    let cancelled = false
    const req = ++reqRef.current
    ;(async () => {
      try {
        const d = await api<RosterResponse>(`/api/courses/${effectiveId}/roster`)
        if (cancelled || req !== reqRef.current) return
        const built = await Promise.all(
          (d.roster ?? []).map(async (r) => ({
            id: r.id,
            name: `${r.firstName} ${r.lastName}`,
            studentId: r.studentId,
            pin: r.pin,
            dataUrl: await QRCode.toDataURL(r.qrPayload, { margin: 1, width: 120 }),
          }))
        )
        if (cancelled || req !== reqRef.current) return
        setSheets(built)
        setCourseLabel(d.course ? `${d.course.code} — ${d.course.title}` : '')
        setLoading(false)
      } catch (e) {
        if (cancelled || req !== reqRef.current) return
        setError(getErrorMessage(e))
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, effectiveId, nonce])

  const handleOpenChange = (v: boolean) => {
    onOpenChange(v)
    if (v) {
      setSheets(null)
      setError(null)
      setCourseLabel('')
      setLoading(Boolean(effectiveId))
      setNonce((n) => n + 1)
    }
  }

  const switchCourse = (id: string) => {
    setCourseId(id)
    setSheets(null)
    setError(null)
    setCourseLabel('')
    setLoading(true)
    setNonce((n) => n + 1)
  }

  const retry = () => {
    setError(null)
    setLoading(true)
    setNonce((n) => n + 1)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {open && <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />}
        <DialogHeader>
          <DialogTitle>QR code sheets</DialogTitle>
          <DialogDescription>
            Print QR + PIN cards to stick on student ID cards for opt-out check-ins.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="qr-course">Course</Label>
          <Select
            value={effectiveId}
            onValueChange={switchCourse}
          >
            <SelectTrigger id="qr-course" className="h-11 w-full">
              <SelectValue placeholder={courses.length ? 'Choose a course' : 'No courses yet'} />
            </SelectTrigger>
            <SelectContent>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div
          id="cc-qr-sheets"
          className="max-h-96 overflow-y-auto scrollbar-thin rounded-xl border bg-muted/30 p-3"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating sheets…
            </div>
          ) : error ? (
            <div className="py-8 text-center">
              <p className="text-sm font-medium text-destructive">Couldn&apos;t load roster</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 min-h-9"
                onClick={retry}
              >
                Try again
              </Button>
            </div>
          ) : !sheets || sheets.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {effectiveId
                ? 'No students enrolled in this course.'
                : courses.length
                  ? 'Select a course to generate sheets.'
                  : 'No courses yet — create one first.'}
            </p>
          ) : (
            <>
              {courseLabel && (
                <p className="mb-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground print:hidden">
                  {courseLabel} · {sheets.length} sheet{sheets.length === 1 ? '' : 's'}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {sheets.map((s) => (
                  <div
                    key={s.id}
                    className="cc-sheet flex flex-col items-center gap-1 rounded-xl border bg-card p-2.5 text-center"
                  >
                    <img src={s.dataUrl} alt={`QR code for ${s.name}`} className="h-24 w-24" />
                    <p className="w-full truncate text-[11px] font-semibold leading-tight">{s.name}</p>
                    <p className="font-mono text-[10px] leading-tight text-muted-foreground">
                      {s.studentId}
                    </p>
                    <Badge variant="outline" className="mt-0.5 font-mono text-[10px]">
                      PIN {s.pin}
                    </Badge>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="min-h-11 flex-1 sm:flex-none" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            className="min-h-11 flex-1 sm:flex-none"
            onClick={() => window.print()}
            disabled={!sheets || sheets.length === 0 || loading}
          >
            <QrCode className="h-4 w-4" /> Print sheets
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
