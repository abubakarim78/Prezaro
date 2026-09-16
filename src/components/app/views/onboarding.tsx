'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  BookPlus,
  Building2,
  Check,
  ChevronDown,
  Loader2,
  Plus,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { api, getErrorMessage } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { Course, CoursesResponse, DepartmentsResponse, TermSystem, User } from '@/lib/types'
import { termBadge } from '@/lib/types'
import { FaceScanMark } from '@/components/brand/face-scan-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

const TITLES = ['None', 'Prof.', 'Dr.', 'Mr.', 'Mrs.', 'Ms.'] as const
const LEVELS = [100, 200, 300, 400, 500, 600] as const
const STEPS = ['Your details', 'Department', 'Your courses'] as const

interface PendingCourse {
  code: string
  title: string
  level: number
  semester: number
  termSystem: TermSystem
}

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

export default function OnboardingView() {
  const user = useAppStore((s) => s.user)
  const setUser = useAppStore((s) => s.setUser)
  const replace = useAppStore((s) => s.replace)

  // First-time setup only — onboarded lecturers manage courses in the
  // dedicated "Your courses" screen instead of this wizard.
  const [step, setStep] = useState(0)

  // Step 1 — details
  const [name, setName] = useState(user?.name ?? '')
  const [title, setTitle] = useState<string>(user?.title ?? 'None')

  // Step 2 — department
  const [departments, setDepartments] = useState<DepartmentsResponse['departments'] | null>(null)
  const [deptError, setDeptError] = useState<string | null>(null)
  const [deptId, setDeptId] = useState<string>(user?.departmentId ?? '')
  const [newDeptOpen, setNewDeptOpen] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [newDeptCode, setNewDeptCode] = useState('')

  // Step 3 — courses
  const [courses, setCourses] = useState<Course[] | null>(null)
  const [pendingCourses, setPendingCourses] = useState<PendingCourse[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [cCode, setCCode] = useState('')
  const [cTitle, setCTitle] = useState('')
  const [cLevel, setCLevel] = useState<string>('100')
  const [cTerm, setCTerm] = useState<string>('S1')

  // Finish
  const [finishing, setFinishing] = useState(false)
  const [done, setDone] = useState(false)

  // Manual retry (event-handler context — sync setState is fine here).
  const loadDepartments = useCallback(async () => {
    setDeptError(null)
    try {
      const d = await api<DepartmentsResponse>('/api/departments')
      setDepartments(d.departments ?? [])
    } catch (e) {
      setDeptError(getErrorMessage(e))
    }
  }, [])

  // Initial load — inline async so setState only fires after an await.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const d = await api<DepartmentsResponse>('/api/departments')
        if (!cancelled) {
          setDepartments(d.departments ?? [])
          setDeptError(null)
        }
      } catch (e) {
        if (!cancelled) setDeptError(getErrorMessage(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    api<CoursesResponse>('/api/courses')
      .then((c) => setCourses(c.courses ?? []))
      .catch(() => setCourses([])) // non-fatal — courses can be added later
  }, [])

  const usingNewDept = newDeptOpen && newDeptName.trim().length > 0

  const step1Valid = name.trim().length > 0
  const step2Valid = usingNewDept || Boolean(deptId)
  const canAddCourse = cCode.trim().length > 0 && cTitle.trim().length > 0

  const addCourse = () => {
    if (!canAddCourse) return
    const { semester, termSystem } = parseTerm(cTerm)
    setPendingCourses((p) => [
      ...p,
      {
        code: cCode.trim().toUpperCase(),
        title: cTitle.trim(),
        level: Number(cLevel) || 100,
        semester,
        termSystem,
      },
    ])
    setCCode('')
    setCTitle('')
    setCLevel('100')
    setCTerm('S1')
    setAddOpen(false)
    toast.success('Course added to your profile')
  }

  const finish = async () => {
    if (finishing) return
    if (!step1Valid) {
      setStep(0)
      return
    }
    if (!step2Valid) {
      setStep(1)
      return
    }
    setFinishing(true)
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        title: title === 'None' ? null : title,
      }
      if (usingNewDept) {
        body.departmentNew = {
          name: newDeptName.trim(),
          code:
            newDeptCode.trim() ||
            newDeptName
              .trim()
              .split(/\s+/)
              .map((w) => w[0])
              .join('')
              .toUpperCase()
              .slice(0, 5),
        }
      } else {
        body.departmentId = deptId
      }
      const { user: updated } = await api<{ user: User }>('/api/profile', {
        method: 'POST',
        body,
      })

      for (const c of pendingCourses) {
        try {
          await api('/api/courses', { method: 'POST', body: c })
        } catch (e) {
          // one bad course (e.g. duplicate code) shouldn't block the rest
          toast.error(`${c.code}: ${getErrorMessage(e)}`)
        }
      }

      setUser(updated)
      setDone(true)
      setTimeout(() => replace('home'), 950)
    } catch (e) {
      toast.error(getErrorMessage(e))
      setFinishing(false)
    }
  }

  const next = () => {
    if (step === 0 && !step1Valid) return
    if (step === 1 && !step2Valid) return
    setStep((s) => Math.min(2, s + 1))
  }

  const back = () => setStep((s) => Math.max(0, s - 1))

  if (done) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 18 }}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl shadow-primary/30"
        >
          <Check className="h-10 w-10" strokeWidth={3} />
        </motion.div>
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.25 }}
          className="mt-5 text-lg font-semibold tracking-tight"
        >
          You&apos;re all set
        </motion.p>
        <p className="mt-1 text-sm text-muted-foreground">Taking you to your dashboard…</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <FaceScanMark className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <p className="font-semibold tracking-tight">Rollmark</p>
            <p className="text-[11px] text-muted-foreground">
              Set up your lecturer profile
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-6 flex items-center gap-2" aria-label={`Step ${step + 1} of 3`}>
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col gap-1.5">
              <div
                className={cn(
                  'h-1.5 rounded-full transition-colors duration-300',
                  i <= step ? 'bg-primary' : 'bg-muted'
                )}
              />
              <span
                className={cn(
                  'text-[10px] font-medium',
                  i === step ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {/* Steps */}
        <div className="mt-6 min-h-[22rem]">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div
                key="s0"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="space-y-5"
              >
                <StepCard step={1} title="Your details" hint="How students see you in the app.">
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-name">Full name</Label>
                    <Input
                      id="ob-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Ama Mensah"
                      className="h-11"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-title">Title (optional)</Label>
                    <Select value={title} onValueChange={setTitle}>
                      <SelectTrigger id="ob-title" className="h-11 w-full">
                        <SelectValue placeholder="Select a title" />
                      </SelectTrigger>
                      <SelectContent>
                        {TITLES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t === 'None' ? 'None' : t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      Shown as “{title === 'None' ? '' : `${title} `}
                      {name.trim().split(/\s+/).slice(-1)[0] || 'Name'}” on greetings.
                    </p>
                  </div>
                </StepCard>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div
                key="s1"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="space-y-4"
              >
                <StepCard
                  step={2}
                  title="Department"
                  hint="Your courses and students are scoped to your department."
                >
                  {deptError ? (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                      <p className="text-sm font-medium text-destructive">Couldn&apos;t load departments</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{deptError}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 min-h-9"
                        onClick={loadDepartments}
                      >
                        Try again
                      </Button>
                    </div>
                  ) : departments === null ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading departments…
                    </div>
                  ) : (
                    <div
                      role="radiogroup"
                      aria-label="Choose department"
                      className="max-h-64 space-y-2 overflow-y-auto scrollbar-thin pr-0.5"
                    >
                      {departments.length === 0 && (
                        <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
                          No departments yet — create yours below.
                        </p>
                      )}
                      {departments.map((d) => {
                        const selected = !usingNewDept && deptId === d.id
                        return (
                          <button
                            key={d.id}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => {
                              setDeptId(d.id)
                              setNewDeptOpen(false)
                            }}
                            className={cn(
                              'flex min-h-11 w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors',
                              selected
                                ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                                : 'bg-card hover:bg-accent/60'
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                                selected
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground'
                              )}
                            >
                              <Building2 className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1 leading-tight">
                              <span className="block truncate text-sm font-medium">{d.name}</span>
                              <span className="block text-[11px] font-mono text-muted-foreground">
                                {d.code}
                              </span>
                            </span>
                            {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <Collapsible
                    open={newDeptOpen}
                    onOpenChange={setNewDeptOpen}
                  >
                    <CollapsibleTrigger className="group flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
                      <Plus className="h-4 w-4" />
                      Create new department
                      <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-3 rounded-xl border bg-muted/40 p-3.5">
                      <div className="space-y-1.5">
                        <Label htmlFor="nd-name">Department name</Label>
                        <Input
                          id="nd-name"
                          value={newDeptName}
                          onChange={(e) => setNewDeptName(e.target.value)}
                          placeholder="e.g. Computer Science"
                          className="h-11"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="nd-code">Short code (optional)</Label>
                        <Input
                          id="nd-code"
                          value={newDeptCode}
                          onChange={(e) => setNewDeptCode(e.target.value.toUpperCase())}
                          placeholder="e.g. CS"
                          className="h-11 font-mono uppercase"
                        />
                      </div>
                    </CollapsibleContent>
                  </Collapsible>

                  {!step2Valid && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      Pick a department or create a new one to continue.
                    </p>
                  )}
                </StepCard>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="s2"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                className="space-y-4"
              >
                <StepCard
                  step={3}
                  title="Your courses"
                  hint="Courses you take attendance for. You can skip this and add them later."
                >
                  {courses === null ? (
                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading your courses…
                    </div>
                  ) : (
                    <Chips
                      existing={courses}
                      pending={pendingCourses}
                      onRemovePending={(i) =>
                        setPendingCourses((p) => p.filter((_, idx) => idx !== i))
                      }
                    />
                  )}

                  <Collapsible open={addOpen} onOpenChange={setAddOpen}>
                    <CollapsibleTrigger className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-dashed px-3.5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
                      <BookPlus className="h-4 w-4" />
                      Add course
                      <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-3 rounded-xl border bg-muted/40 p-3.5">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="nc-code">Code</Label>
                          <Input
                            id="nc-code"
                            value={cCode}
                            onChange={(e) => setCCode(e.target.value.toUpperCase())}
                            placeholder="CS301"
                            className="h-11 font-mono uppercase"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="nc-level">Level</Label>
                          <Select value={cLevel} onValueChange={setCLevel}>
                            <SelectTrigger id="nc-level" className="h-11 w-full">
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
                        <Label htmlFor="nc-title">Title</Label>
                        <Input
                          id="nc-title"
                          value={cTitle}
                          onChange={(e) => setCTitle(e.target.value)}
                          placeholder="e.g. Software Engineering"
                          className="h-11"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="nc-term">Term</Label>
                        <Select value={cTerm} onValueChange={setCTerm}>
                          <SelectTrigger id="nc-term" className="h-11 w-full">
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
                      <Button
                        type="button"
                        className="min-h-11 w-full"
                        disabled={!canAddCourse}
                        onClick={addCourse}
                      >
                        <Plus className="h-4 w-4" /> Add course
                      </Button>
                    </CollapsibleContent>
                  </Collapsible>

                  {(courses ?? []).length === 0 && pendingCourses.length === 0 && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      No courses yet — you can skip and add them later.
                    </p>
                  )}
                </StepCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer nav */}
        <div className="mt-6 flex items-center gap-3">
          {step > 0 ? (
            <Button
              variant="outline"
              className="min-h-11 flex-1"
              onClick={back}
              disabled={finishing}
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          ) : (
            <div className="flex-1" />
          )}
          {step < 2 ? (
            <Button className="min-h-11 flex-1" onClick={next}>
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button className="min-h-11 flex-1" onClick={finish} disabled={finishing}>
              {finishing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" /> Finish
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------- pieces ----------

function StepCard({
  step,
  title,
  hint,
  children,
}: {
  step: number
  title: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
        Step {step} of 3
      </p>
      <h2 className="mt-0.5 text-lg font-bold tracking-tight">{title}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  )
}

function Chips({
  existing,
  pending,
  onRemovePending,
}: {
  existing: Course[]
  pending: PendingCourse[]
  onRemovePending: (index: number) => void
}) {
  const empty = existing.length === 0 && pending.length === 0
  if (empty)
    return (
      <p className="rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
        No courses on your profile yet.
      </p>
    )
  return (
    <div className="flex flex-wrap gap-2">
      {existing.map((c) => (
        <span
          key={c.id}
          className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 py-1 pl-2.5 pr-3 text-xs"
        >
          <span className="font-mono font-semibold text-primary">{c.code}</span>
          <span className="max-w-40 truncate text-muted-foreground">{c.title}</span>
          <span className="rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">
            L{c.level}
          </span>
          <span className="rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">
            {termBadge(c)}
          </span>
        </span>
      ))}
      {pending.map((c, i) => (
        <span
          key={`pending-${c.code}-${i}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 py-1 pl-2.5 pr-1.5 text-xs"
        >
          <span className="font-mono font-semibold text-primary">{c.code}</span>
          <span className="max-w-40 truncate text-muted-foreground">{c.title}</span>
          <span className="rounded bg-primary/15 px-1 py-px text-[10px] text-primary">new</span>
          <button
            type="button"
            onClick={() => onRemovePending(i)}
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Remove ${c.code}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  )
}
