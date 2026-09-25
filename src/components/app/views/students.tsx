'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowUpDown,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  FileUp,
  Loader2,
  MoreVertical,
  Plus,
  ScanFace,
  Search,
  Trash2,
  UserMinus,
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
import { compareStudentIds } from '@/lib/student-sort'
import { ImportRosterDialog } from '@/components/app/roster-import-dialog'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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

const LEVELS = [100, 200, 300, 400, 500, 600] as const

export default function StudentsView() {
  const navigate = useAppStore((s) => s.navigate)
  // Lecturers get a read-only roster; only HoDs / the super admin add students.
  const canManage =
    useAppStore((s) => s.user?.role === 'ADMIN' || s.user?.role === 'SUPERADMIN')

  // ---- data ----
  const [students, setStudents] = useState<StudentListItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [courseFilter, setCourseFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [sortBy, setSortBy] = useState<'year-asc' | 'year-desc' | 'name-asc' | 'level'>('year-asc')

  // ---- dialogs ----
  const [newOpen, setNewOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [unenrollTarget, setUnenrollTarget] = useState<{
    student: StudentListItem
    courseId: string
    courseCode?: string
  } | null>(null)
  const [unenrollBusy, setUnenrollBusy] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StudentListItem | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const handleUnenroll = async () => {
    if (!unenrollTarget) return
    setUnenrollBusy(true)
    try {
      await api(
        `/api/courses/${unenrollTarget.courseId}/students?studentId=${unenrollTarget.student.id}`,
        { method: 'DELETE' }
      )
      toast.success(
        `Removed ${unenrollTarget.student.firstName} ${unenrollTarget.student.lastName} from ${
          unenrollTarget.courseCode || 'class'
        }`
      )
      setStudents((prev) => (prev ? prev.filter((s) => s.id !== unenrollTarget.student.id) : null))
      setUnenrollTarget(null)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setUnenrollBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    try {
      await api(`/api/students/${deleteTarget.id}`, { method: 'DELETE' })
      toast.success(
        `Student ${deleteTarget.firstName} ${deleteTarget.lastName} permanently deleted`
      )
      setStudents((prev) => (prev ? prev.filter((s) => s.id !== deleteTarget.id) : null))
      setDeleteTarget(null)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setDeleteBusy(false)
    }
  }

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
    let list = students ?? []
    if (query) {
      list = list.filter((s) => {
        const hay = `${s.firstName} ${s.lastName} ${s.studentId}`.toLowerCase()
        return hay.includes(query)
      })
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'year-asc') {
        return compareStudentIds(a.studentId, b.studentId, 'asc')
      }
      if (sortBy === 'year-desc') {
        return compareStudentIds(a.studentId, b.studentId, 'desc')
      }
      if (sortBy === 'name-asc') {
        return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
      }
      if (sortBy === 'level') {
        return a.level - b.level || compareStudentIds(a.studentId, b.studentId, 'asc')
      }
      return compareStudentIds(a.studentId, b.studentId, 'asc')
    })
  }, [students, query, sortBy])

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
          canManage ? (
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
                <DropdownMenuItem onClick={() => setImportOpen(true)}>
                  <FileSpreadsheet className="h-4 w-4" /> Import roster (Excel, Word, CSV)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : undefined
        }
      />

      <div className="px-4 pb-6 lg:px-8">
        {/* ---------- Search & Sort ---------- */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or student ID…"
              className="h-11 pl-9"
              aria-label="Search students"
            />
          </div>
          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="h-11 w-44 sm:w-52 text-xs font-medium shrink-0" aria-label="Sort students">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground mr-1.5 shrink-0" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="year-asc" className="text-xs">
                Year & ID (Earliest first)
              </SelectItem>
              <SelectItem value="year-desc" className="text-xs">
                Year & ID (Latest first)
              </SelectItem>
              <SelectItem value="name-asc" className="text-xs">
                Name (A–Z)
              </SelectItem>
              <SelectItem value="level" className="text-xs">
                Level (100–600)
              </SelectItem>
            </SelectContent>
          </Select>
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
                  description={
                    canManage
                      ? 'Add students one by one or import an Excel, Word, or CSV roster.'
                      : 'Students added by your department head will appear here.'
                  }
                  action={
                    canManage ? (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button className="min-h-11" onClick={() => setNewOpen(true)}>
                          <UserRoundPlus className="h-4 w-4" /> Add student
                        </Button>
                        <Button variant="outline" className="min-h-11" onClick={() => setImportOpen(true)}>
                          <FileSpreadsheet className="h-4 w-4" /> Import roster
                        </Button>
                      </div>
                    ) : undefined
                  }
                />
              )}
            </div>
          ) : (
            <div className="max-h-[32rem] divide-y divide-border rounded-2xl border bg-card overflow-y-auto scrollbar-thin">
              {filtered.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.25) }}
                  className="flex min-h-16 w-full items-center gap-2 px-4 py-3 transition-colors hover:bg-accent/40 group"
                >
                  <button
                    type="button"
                    onClick={() => navigate('student', { studentId: s.id })}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none"
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
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                        aria-label={`Options for ${s.firstName} ${s.lastName}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => navigate('student', { studentId: s.id })}>
                        <Eye className="h-4 w-4 mr-2" /> View details
                      </DropdownMenuItem>
                      {canManage && courseFilter !== 'all' && (
                        <DropdownMenuItem
                          onClick={() =>
                            setUnenrollTarget({
                              student: s,
                              courseId: courseFilter,
                              courseCode: courses.find((c) => c.id === courseFilter)?.code,
                            })
                          }
                          className="text-amber-600 dark:text-amber-400 focus:text-amber-600 dark:focus:text-amber-400"
                        >
                          <UserMinus className="h-4 w-4 mr-2" /> Remove from class
                        </DropdownMenuItem>
                      )}
                      {canManage && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget(s)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete student
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </motion.div>
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
      <ImportRosterDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        courses={courses}
        defaultCourseId={courseFilter !== 'all' ? courseFilter : undefined}
        onImported={refresh}
      />

      {/* ---------- Remove from Class (Unenroll) Confirmation ---------- */}
      <AlertDialog
        open={!!unenrollTarget}
        onOpenChange={(open) => !open && !unenrollBusy && setUnenrollTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from class?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{' '}
              <span className="font-semibold text-foreground">
                {unenrollTarget?.student.firstName} {unenrollTarget?.student.lastName} (
                {unenrollTarget?.student.studentId})
              </span>{' '}
              from{' '}
              <span className="font-semibold text-foreground">
                {unenrollTarget?.courseCode || 'this class'}
              </span>
              ? Their general student profile and enrollment in any other courses will be kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unenrollBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnenroll}
              disabled={unenrollBusy}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {unenrollBusy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Removing…
                </>
              ) : (
                'Remove from class'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------- Delete Student Confirmation ---------- */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && !deleteBusy && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete student?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete{' '}
              <span className="font-semibold text-foreground">
                {deleteTarget?.firstName} {deleteTarget?.lastName} ({deleteTarget?.studentId})
              </span>
              ? This will permanently delete their attendance records, face enrollment, and all
              course memberships. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteBusy}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteBusy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Deleting…
                </>
              ) : (
                'Delete student'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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


