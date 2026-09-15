'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BarChart3,
  CalendarDays,
  Download,
  Gauge,
  SlidersHorizontal,
  TrendingUp,
  TriangleAlert,
  UserX,
} from 'lucide-react'
import type { Course, CourseReport, CoursesResponse } from '@/lib/types'
import { api, getErrorMessage } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import {
  AttendanceBar,
  EmptyState,
  IdentityAvatar,
  LoadingBlock,
  PageHeader,
  StatCard,
} from '@/components/app/shared'

export default function ReportsView() {
  const { params } = useAppStore()

  const [courses, setCourses] = useState<Course[]>([])
  const [coursesError, setCoursesError] = useState<string | null>(null)
  const [courseId, setCourseId] = useState<string | null>(() => params.courseId || null)

  const [report, setReport] = useState<CourseReport | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const [threshold, setThreshold] = useState<number | null>(null)
  const thresholdRef = useRef<number | null>(null)
  const [draftThreshold, setDraftThreshold] = useState(75)
  const [thresholdOpen, setThresholdOpen] = useState(false)
  const [savingThreshold, setSavingThreshold] = useState(false)

  const [atRiskOnly, setAtRiskOnly] = useState(false)

  // ---- Courses ------------------------------------------------
  const loadCourses = useCallback(async () => {
    setCoursesError(null)
    try {
      const d = await api<CoursesResponse>('/api/courses')
      setCourses(d.courses)
      setCourseId((cur) => cur ?? d.courses[0]?.id ?? null)
    } catch (e) {
      setCoursesError(getErrorMessage(e))
    }
  }, [])

  useEffect(() => {
    void loadCourses()
  }, [loadCourses])

  // ---- Report -------------------------------------------------
  const loadReport = useCallback(async () => {
    if (!courseId) return
    setReport(null)
    setReportError(null)
    try {
      const qs = thresholdRef.current !== null ? `?threshold=${thresholdRef.current}` : ''
      const d = await api<{ report: CourseReport }>(`/api/reports/course/${courseId}${qs}`)
      thresholdRef.current = d.report.threshold
      setThreshold(d.report.threshold)
      setDraftThreshold(d.report.threshold)
      setReport(d.report)
    } catch (e) {
      setReportError(getErrorMessage(e))
    }
  }, [courseId])

  useEffect(() => {
    void loadReport()
  }, [loadReport, reload])

  const saveThreshold = async () => {
    setSavingThreshold(true)
    try {
      await api('/api/settings', {
        method: 'PUT',
        body: { atRiskThreshold: draftThreshold },
      })
      toast.success('At-risk threshold updated')
      setThresholdOpen(false)
      thresholdRef.current = draftThreshold
      setReload((r) => r + 1)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setSavingThreshold(false)
    }
  }

  // ---- Derived ------------------------------------------------
  const avgPercent = useMemo(() => {
    if (!report || report.sessionCount === 0) return null
    if (report.students.length > 0) {
      return Math.round(
        report.students.reduce((a, s) => a + s.percent, 0) / report.students.length
      )
    }
    if (report.trend.length > 0) {
      return Math.round(
        report.trend.reduce((a, t) => a + t.presentPercent, 0) / report.trend.length
      )
    }
    return null
  }, [report])

  const atRiskCount = useMemo(
    () => (report?.students ?? []).filter((s) => s.atRisk).length,
    [report]
  )

  const trendData = useMemo(
    () =>
      (report?.trend ?? []).map((t) => ({
        label: format(parseISO(t.date), 'd MMM'),
        presentPercent: t.presentPercent,
      })),
    [report]
  )

  const students = useMemo(() => {
    const list = [...(report?.students ?? [])]
    if (atRiskOnly) {
      return list.filter((s) => s.atRisk).sort((a, b) => a.percent - b.percent)
    }
    return list.sort((a, b) => a.name.localeCompare(b.name))
  }, [report, atRiskOnly])

  const activeThreshold = threshold ?? report?.threshold ?? 75

  // ---- Body ---------------------------------------------------
  let body: React.ReactNode = null
  if (coursesError) {
    body = (
      <div className="rounded-2xl border bg-card">
        <EmptyState
          icon={BarChart3}
          title="Couldn't load courses"
          description={coursesError}
          action={
            <Button variant="outline" className="min-h-11" onClick={() => void loadCourses()}>
              Try again
            </Button>
          }
        />
      </div>
    )
  } else if (courses.length === 0) {
    body = (
      <div className="rounded-2xl border bg-card">
        <EmptyState
          icon={BarChart3}
          title="No courses yet"
          description="Create a course and take attendance to see reports here."
        />
      </div>
    )
  } else {
    body = (
      <>
        <CourseSelector
          courses={courses}
          courseId={courseId}
          onSelect={(id) => setCourseId(id)}
        />

        {report === null && !reportError ? <LoadingBlock label="Crunching attendance…" /> : null}
        {reportError ? (
          <div className="rounded-2xl border bg-card">
            <EmptyState
              icon={TriangleAlert}
              title="Couldn't load report"
              description={reportError}
              action={
                <Button
                  variant="outline"
                  className="min-h-11"
                  onClick={() => setReload((r) => r + 1)}
                >
                  Try again
                </Button>
              }
            />
          </div>
        ) : null}
        {report && report.sessionCount === 0 ? (
          <div className="rounded-2xl border bg-card">
            <EmptyState
              icon={TrendingUp}
              title="No attendance data yet"
              description={`Run a scan for ${report.course.code} and the report will build itself here.`}
            />
          </div>
        ) : null}
        {report && report.sessionCount > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Sessions"
                value={report.sessionCount}
                sub="recorded"
                icon={CalendarDays}
              />
              <StatCard
                label="Avg attendance"
                value={avgPercent !== null ? `${avgPercent}%` : '—'}
                sub="across students"
                icon={Gauge}
                tone="primary"
              />
              <StatCard
                label="At-risk"
                value={atRiskCount}
                sub={`below ${activeThreshold}%`}
                icon={UserX}
                tone={atRiskCount > 0 ? 'danger' : 'default'}
              />
            </div>

            <ThresholdRow
              threshold={activeThreshold}
              draft={draftThreshold}
              onDraftChange={setDraftThreshold}
              open={thresholdOpen}
              onOpenChange={setThresholdOpen}
              saving={savingThreshold}
              onSave={() => void saveThreshold()}
            />

            <TrendCard data={trendData} sessionCount={report.trend.length} />

            <StudentsCard
              students={students}
              atRiskOnly={atRiskOnly}
              onToggleAtRisk={() => setAtRiskOnly((v) => !v)}
            />
          </>
        ) : null}
      </>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Reports"
        subtitle="Attendance per course"
        right={
          report ? (
            <Button asChild variant="outline" className="min-h-11">
              <a href={`/api/export/course/${courseId}`} download>
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export CSV</span>
                <span className="sm:hidden">Export</span>
              </a>
            </Button>
          ) : undefined
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="px-4 lg:px-8 pb-10 space-y-4"
      >
        {body}
      </motion.div>
    </div>
  )
}

// ---- Course selector chips -----------------------------------

function CourseSelector({
  courses,
  courseId,
  onSelect,
}: {
  courses: Course[]
  courseId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <div
      className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1"
      role="tablist"
      aria-label="Choose course"
    >
      {courses.map((c) => (
        <button
          key={c.id}
          role="tab"
          aria-selected={courseId === c.id}
          onClick={() => onSelect(c.id)}
          className={cn(
            'min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold font-mono transition-colors',
            courseId === c.id
              ? 'border-primary bg-primary text-primary-foreground'
              : 'bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          {c.code}
        </button>
      ))}
    </div>
  )
}

// ---- Threshold popover row -----------------------------------

function ThresholdRow({
  threshold,
  draft,
  onDraftChange,
  open,
  onOpenChange,
  saving,
  onSave,
}: {
  threshold: number
  draft: number
  onDraftChange: (v: number) => void
  open: boolean
  onOpenChange: (v: boolean) => void
  saving: boolean
  onSave: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <p className="text-xs text-muted-foreground">
        Students under{' '}
        <span className="font-semibold text-foreground">{threshold}%</span> are flagged
        at-risk.
      </p>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="min-h-11 shrink-0">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Threshold
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 rounded-2xl">
          <Label className="text-sm font-semibold">Flag below {draft}%</Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Students under this attendance rate are marked at-risk.
          </p>
          <Slider
            min={50}
            max={90}
            step={1}
            value={[draft]}
            onValueChange={(v) => onDraftChange(v[0] ?? draft)}
            className="mt-4"
            aria-label="At-risk threshold"
          />
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>50%</span>
            <span>90%</span>
          </div>
          <Button
            size="sm"
            className="mt-3 min-h-11 w-full"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? 'Saving…' : 'Save threshold'}
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  )
}

// ---- Trend chart card ----------------------------------------

function TrendCard({
  data,
  sessionCount,
}: {
  data: { label: string; presentPercent: number }[]
  sessionCount: number
}) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold tracking-tight">Attendance trend</p>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {sessionCount} session{sessionCount === 1 ? '' : 's'}
        </span>
      </div>
      {data.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No sessions recorded yet — the trend will appear here.
        </p>
      ) : (
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              />
              <YAxis
                domain={[0, 100]}
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
              />
              <Tooltip
                cursor={{ fill: 'var(--accent)', opacity: 0.5 }}
                formatter={(value) => [`${value}%`, 'Present']}
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  fontSize: 12,
                  color: 'var(--card-foreground)',
                }}
                labelStyle={{ color: 'var(--muted-foreground)' }}
              />
              <Bar
                dataKey="presentPercent"
                fill="var(--chart-1, #059669)"
                radius={[6, 6, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ---- Students card -------------------------------------------

function AtRiskBadge() {
  return (
    <span className="shrink-0 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-700 dark:text-rose-400">
      At risk
    </span>
  )
}

function StudentsCard({
  students,
  atRiskOnly,
  onToggleAtRisk,
}: {
  students: CourseReport['students']
  atRiskOnly: boolean
  onToggleAtRisk: () => void
}) {
  return (
    <div className="rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 p-4">
        <p className="text-sm font-semibold tracking-tight">
          Students{' '}
          <span className="font-normal text-muted-foreground">({students.length})</span>
        </p>
        <button
          onClick={onToggleAtRisk}
          aria-pressed={atRiskOnly}
          className={cn(
            'inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-xs font-semibold transition-colors',
            atRiskOnly
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400'
              : 'bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <UserX className="h-3.5 w-3.5" />
          At-risk only
        </button>
      </div>

      {students.length === 0 ? (
        <div className="border-t">
          <EmptyState
            icon={UserX}
            title={atRiskOnly ? 'No at-risk students' : 'No students enrolled'}
            description={
              atRiskOnly
                ? 'Everyone is above the threshold — well done.'
                : 'Enroll students into this course to track their attendance.'
            }
          />
        </div>
      ) : (
        <div className="border-t">
          {/* Desktop header */}
          <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(8rem,1.3fr)_3.5rem] gap-3 border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Student</span>
            <span className="text-right">Present</span>
            <span>Attendance</span>
            <span className="text-right">%</span>
          </div>
          <div className="divide-y">
            {students.map((st) => (
              <div key={st.id}>
                {/* Desktop row */}
                <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(8rem,1.3fr)_3.5rem] items-center gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <IdentityAvatar name={st.name} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{st.name}</p>
                        {st.atRisk ? <AtRiskBadge /> : null}
                      </div>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {st.studentId}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground text-right">
                    {st.present}/{st.total}
                  </span>
                  <div className="flex items-center gap-2">
                    <AttendanceBar percent={st.percent} />
                  </div>
                  <span
                    className={cn(
                      'text-sm font-bold tabular-nums text-right',
                      st.atRisk && 'text-rose-600 dark:text-rose-400'
                    )}
                  >
                    {st.percent}%
                  </span>
                </div>

                {/* Mobile stacked row */}
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:hidden">
                  <div className="flex min-w-0 items-center gap-3">
                    <IdentityAvatar name={st.name} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{st.name}</p>
                        {st.atRisk ? <AtRiskBadge /> : null}
                      </div>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {st.studentId} · {st.present}/{st.total}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-base font-bold tabular-nums',
                      st.atRisk && 'text-rose-600 dark:text-rose-400'
                    )}
                  >
                    {st.percent}%
                  </span>
                  <div className="col-span-2">
                    <AttendanceBar percent={st.percent} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
