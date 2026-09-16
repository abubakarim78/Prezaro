'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  BadgeCheck,
  Loader2,
  Pencil,
  ScanFace,
  SearchX,
  UserRound,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError, getErrorMessage } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type {
  Course,
  CoursesResponse,
  StudentDetail,
  StudentDetailResponse,
} from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AttendanceBar,
  AttendanceRing,
  EmptyState,
  IdentityAvatar,
} from '@/components/app/shared'
import { cn } from '@/lib/utils'

const LEVELS = [100, 200, 300, 400, 500, 600] as const

export default function StudentView() {
  const studentIdParam = useAppStore((s) => s.params.studentId)
  const navigate = useAppStore((s) => s.navigate)
  const goBack = useAppStore((s) => s.back)

  const [student, setStudent] = useState<StudentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  // courses for "add to course"
  const [myCourses, setMyCourses] = useState<Course[]>([])
  const [addCourse, setAddCourse] = useState('')
  const [courseBusy, setCourseBusy] = useState(false)

  const [editOpen, setEditOpen] = useState(false)

  // No synchronous setState so this can be safely triggered from effects;
  // retry handlers set loading themselves first.
  const load = useCallback(async () => {
    if (!studentIdParam) return
    try {
      const d = await api<StudentDetailResponse>(`/api/students/${studentIdParam}`)
      setStudent(d.student)
      setNotFound(false)
      setError(null)
      setLoading(false)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true)
      else setError(getErrorMessage(e))
      setLoading(false)
    }
  }, [studentIdParam])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    api<CoursesResponse>('/api/courses')
      .then((c) => setMyCourses(c.courses ?? []))
      .catch(() => setMyCourses([]))
  }, [])

  const unenroll = async (courseId: string, code: string) => {
    if (!student) return
    try {
      await api(`/api/courses/${courseId}/students?studentId=${student.id}`, { method: 'DELETE' })
      toast.success(`Removed from ${code}`)
      load()
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  const enrollInCourse = async (courseId: string) => {
    if (!student || !courseId) return
    setCourseBusy(true)
    try {
      const r = await api<{ enrolled: number }>(`/api/courses/${courseId}/students`, {
        method: 'POST',
        body: { studentIds: [student.id] },
      })
      toast.success(`Enrolled in course (+${r.enrolled ?? 1})`)
      setAddCourse('')
      load()
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setCourseBusy(false)
    }
  }

  const removeFace = async () => {
    if (!studentIdParam) return
    try {
      await api(`/api/students/${studentIdParam}/face`, { method: 'DELETE' })
      toast.success('Face data removed')
      load()
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  const availableCourses = useMemo(() => {
    if (!student) return []
    return myCourses.filter((c) => !student.courses.some((sc) => sc.id === c.id))
  }, [myCourses, student])

  const fullName = student ? `${student.firstName} ${student.lastName}` : ''

  const retry = () => {
    setError(null)
    setNotFound(false)
    setLoading(true)
    load()
  }

  const notFoundUi = (
    <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-5 lg:px-8 lg:pt-8">
      <BackButton onClick={goBack} />
      <div className="mt-4 rounded-2xl border bg-card">
        <EmptyState
          icon={SearchX}
          title="Student not found"
          description="This student may have been removed or the link is out of date."
          action={
            <Button className="min-h-11" onClick={goBack}>
              <ArrowLeft className="h-4 w-4" /> Go back
            </Button>
          }
        />
      </div>
    </div>
  )

  // ---------- missing param ----------
  if (!studentIdParam) return notFoundUi

  // ---------- loading ----------
  if (loading) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-5 lg:px-8 lg:pt-8">
        <Skeleton className="h-11 w-11 rounded-xl" />
        <div className="mt-4 flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <Skeleton className="mt-5 h-32 rounded-2xl" />
        <Skeleton className="mt-4 h-28 rounded-2xl" />
        <Skeleton className="mt-4 h-28 rounded-2xl" />
      </div>
    )
  }

  // ---------- error (before not-found so real failures surface properly) ----------
  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-5 lg:px-8 lg:pt-8">
        <BackButton onClick={goBack} />
        <div className="mt-4 rounded-2xl border bg-card">
          <EmptyState
            icon={UserRound}
            title="Couldn't load student"
            description={error}
            action={
              <Button className="min-h-11" onClick={retry}>
                Try again
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  // ---------- not found ----------
  if (notFound || !student) return notFoundUi

  const att = student.attendance ?? { present: 0, late: 0, total: 0, percent: 0 }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mx-auto w-full max-w-3xl px-4 pb-6 pt-4 lg:px-8 lg:pt-6"
    >
      <BackButton onClick={goBack} />

      {/* ---------- Identity ---------- */}
      <div className="mt-4 flex items-center gap-4">
        <IdentityAvatar name={fullName} className="h-16 w-16 text-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold tracking-tight">{toTitle(fullName)}</h1>
          <p className="font-mono text-xs text-muted-foreground">{student.studentId}</p>
          <Badge variant="outline" className="mt-1.5 border-primary/30 bg-primary/5 text-primary">
            Level {student.level}
          </Badge>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={() => setEditOpen(true)}
          aria-label="Edit student"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      <div className="mt-5 space-y-4">
        {/* ---------- Attendance ---------- */}
        <section className="rounded-2xl border bg-card p-4">
          <SectionTitle icon={BadgeCheck} title="Attendance" />
          {att.total === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">No sessions yet.</p>
          ) : (
            <>
              <div className="mt-3 flex items-center gap-4">
                <AttendanceRing percent={att.percent} size={64} stroke={6} />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="text-sm font-semibold">
                    {att.present} of {att.total} session{att.total === 1 ? '' : 's'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Late arrivals: <span className="font-medium text-foreground">{att.late}</span>
                  </p>
                  {att.percent < 75 && (
                    <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                      Below the 75% threshold
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <AttendanceBar percent={att.percent} />
              </div>
            </>
          )}
        </section>

        {/* ---------- Face enrollment ---------- */}
        <section className="rounded-2xl border bg-card p-4">
          <SectionTitle icon={ScanFace} title="Face enrollment" />
          <div className="mt-3 flex items-center gap-2.5">
            <span
              className={cn(
                'h-2.5 w-2.5 shrink-0 rounded-full',
                student.faceEnrolled ? 'bg-emerald-500' : 'bg-muted-foreground/40'
              )}
            />
            {student.faceEnrolled ? (
              <p className="text-sm">
                <span className="font-medium text-emerald-700 dark:text-emerald-400">Enrolled</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {student.descriptorsCount} template
                  {student.descriptorsCount === 1 ? '' : 's'}
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Not enrolled</p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              className="min-h-11 flex-1 sm:flex-none"
              onClick={() => navigate('enroll', { studentId: student.id })}
            >
              <ScanFace className="h-4 w-4" />
              {student.faceEnrolled ? 'Re-enroll face' : 'Enroll face'}
            </Button>
            {student.faceEnrolled && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="min-h-11 flex-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:flex-none"
                  >
                    Remove face data
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="sm:max-w-sm">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove face data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Deletes the stored face template. The student can re-enroll anytime.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="gap-2">
                    <AlertDialogCancel className="min-h-11 flex-1 sm:flex-none">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      className="min-h-11 flex-1 bg-destructive text-white hover:bg-destructive/90 sm:flex-none"
                      onClick={removeFace}
                    >
                      Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </section>

        {/* ---------- Courses ---------- */}
        <section className="rounded-2xl border bg-card p-4">
          <SectionTitle icon={BadgeCheck} title="Courses" />
          <div className="mt-3 flex flex-wrap gap-2">
            {student.courses.length === 0 && (
              <p className="text-sm text-muted-foreground">Not enrolled in any course yet.</p>
            )}
            {student.courses.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 py-1.5 pl-3 pr-1.5 text-xs"
              >
                <span className="font-mono font-semibold text-primary">{c.code}</span>
                <span className="max-w-36 truncate text-muted-foreground">{c.title}</span>
                <button
                  type="button"
                  disabled={courseBusy}
                  onClick={() => unenroll(c.id, c.code)}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                  aria-label={`Remove from ${c.code}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
          {availableCourses.length > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <Select
                value={addCourse}
                onValueChange={(v) => {
                  setAddCourse(v)
                  enrollInCourse(v)
                }}
                disabled={courseBusy}
              >
                <SelectTrigger className="h-11 w-full sm:w-72">
                  <SelectValue placeholder="Add to course…" />
                </SelectTrigger>
                <SelectContent>
                  {availableCourses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {courseBusy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          )}
        </section>
      </div>

      {/* ---------- Edit dialog ---------- */}
      <EditStudentDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        student={student}
        onSaved={(s) => setStudent(s)}
      />
    </motion.div>
  )
}

// ---------- pieces ----------

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> Students
    </button>
  )
}

function SectionTitle({ icon: Icon, title }: { icon: typeof ScanFace; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
    </div>
  )
}

function toTitle(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function EditStudentDialog({
  open,
  onOpenChange,
  student,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  student: StudentDetail
  onSaved: (s: StudentDetail) => void
}) {
  const [firstName, setFirstName] = useState(student.firstName)
  const [lastName, setLastName] = useState(student.lastName)
  const [level, setLevel] = useState(String(student.level))
  const [email, setEmail] = useState(student.email ?? '')
  const [phone, setPhone] = useState(student.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)

  // re-sync fields each time the dialog opens
  useEffect(() => {
    if (open) {
      setFirstName(student.firstName)
      setLastName(student.lastName)
      setLevel(String(student.level))
      setEmail(student.email ?? '')
      setPhone(student.phone ?? '')
      setFieldError(null)
    }
  }, [open, student])

  const submit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setFieldError('First and last name are required')
      return
    }
    setSaving(true)
    setFieldError(null)
    try {
      const d = await api<StudentDetailResponse>(`/api/students/${student.id}`, {
        method: 'PATCH',
        body: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          level: Number(level) || student.level,
          email: email.trim() || null,
          phone: phone.trim() || null,
        },
      })
      toast.success('Student updated')
      onSaved(d.student)
      onOpenChange(false)
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
          <DialogTitle>Edit student</DialogTitle>
          <DialogDescription>
            Student ID <span className="font-mono">{student.studentId}</span> can&apos;t be changed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="es-first">First name</Label>
              <Input
                id="es-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-last">Last name</Label>
              <Input
                id="es-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="es-level">Level</Label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger id="es-level" className="h-11 w-full">
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
              <Label htmlFor="es-email">Email</Label>
              <Input
                id="es-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="es-phone">Phone</Label>
            <Input
              id="es-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-11"
            />
          </div>
          {fieldError && <p className="text-sm font-medium text-destructive">{fieldError}</p>}
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="min-h-11 flex-1 sm:flex-none"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button className="min-h-11 flex-1 sm:flex-none" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
