'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Info,
  ShieldCheck,
  TriangleAlert,
  TrendingUp,
  UserX,
  Users,
} from 'lucide-react'
import type { DepartmentReport } from '@/lib/types'
import { api, getErrorMessage } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  AttendanceBar,
  EmptyState,
  IdentityAvatar,
  LoadingBlock,
  PageHeader,
  StatCard,
} from '@/components/app/shared'

const CHART_LINE = 'var(--chart-1, #059669)'

export default function AdminView() {
  const { user, navigate } = useAppStore()

  const [report, setReport] = useState<DepartmentReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    ;(async () => {
      try {
        const d = await api<{ report: DepartmentReport }>('/api/reports/department')
        setReport(d.report)
        setError(null)
      } catch (e) {
        setError(getErrorMessage(e))
      }
    })()
  }, [tick])

  const totals = useMemo(() => {
    if (!report) return null
    const studentCount = report.courses.reduce((a, c) => a + c.studentCount, 0)
    const sessionCount = report.courses.reduce((a, c) => a + c.sessionCount, 0)
    const deptAvg =
      studentCount > 0
        ? Math.round(
            report.courses.reduce((a, c) => a + c.avgAttendance * c.studentCount, 0) /
              studentCount
          )
        : null
    return { studentCount, sessionCount, deptAvg }
  }, [report])

  const coursesSorted = useMemo(
    () => (report ? [...report.courses].sort((a, b) => a.avgAttendance - b.avgAttendance) : []),
    [report]
  )

  const trendData = useMemo(() => report?.trend ?? [], [report])

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title={report?.departmentName ?? 'Department'}
        subtitle="Department dashboard"
      />

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="px-4 lg:px-8 pb-10 space-y-4"
      >
        {user && user.role !== 'ADMIN' && (
          <div className="flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" />
            Aggregated view of your department
          </div>
        )}

        {report === null && !error ? (
          <LoadingBlock label="Loading department data…" />
        ) : error ? (
          <div className="rounded-2xl border bg-card">
            <EmptyState
              icon={TriangleAlert}
              title="Couldn't load dashboard"
              description={error}
              action={
                <Button variant="outline" className="min-h-11" onClick={() => setTick((t) => t + 1)}>
                  Try again
                </Button>
              }
            />
          </div>
        ) : report && totals ? (
          <>
            {/* Header stats */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="Courses"
                value={report.courses.length}
                sub="in department"
                icon={BookOpen}
              />
              <StatCard
                label="Students"
                value={totals.studentCount}
                sub="enrolled total"
                icon={Users}
              />
              <StatCard
                label="Sessions"
                value={totals.sessionCount}
                sub="all courses"
                icon={CalendarDays}
              />
              <StatCard
                label="Dept average"
                value={totals.deptAvg !== null ? `${totals.deptAvg}%` : '—'}
                sub="weighted by size"
                icon={ShieldCheck}
                tone="primary"
              />
            </div>

            {/* Course table */}
            <div className="rounded-2xl border bg-card">
              <div className="flex items-center justify-between gap-2 p-4 pb-3">
                <p className="text-sm font-semibold tracking-tight">Courses by attendance</p>
                <span className="text-[11px] text-muted-foreground">worst first</span>
              </div>
              {coursesSorted.length === 0 ? (
                <div className="border-t">
                  <EmptyState
                    icon={BookOpen}
                    title="No courses yet"
                    description="Courses in your department will show their attendance here."
                  />
                </div>
              ) : (
                <div className="border-t">
                  {/* Desktop header */}
                  <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_5rem_5rem_minmax(8rem,1.2fr)] gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Course</span>
                    <span className="text-right">Students</span>
                    <span className="text-right">Sessions</span>
                    <span>Avg attendance</span>
                  </div>
                  <div className="divide-y">
                    {coursesSorted.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => navigate('reports', { courseId: c.id })}
                        className="block w-full text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {/* Desktop row */}
                        <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_5rem_5rem_minmax(8rem,1.2fr)] items-center gap-3 px-4 py-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="shrink-0 rounded-lg bg-primary/10 px-2 py-1 font-mono text-[11px] font-bold text-primary">
                              {c.code}
                            </span>
                            <p className="truncate text-sm font-medium">{c.title}</p>
                          </div>
                          <span className="text-sm tabular-nums text-muted-foreground text-right">
                            {c.studentCount}
                          </span>
                          <span className="text-sm tabular-nums text-muted-foreground text-right">
                            {c.sessionCount}
                          </span>
                          <div className="flex items-center gap-2">
                            <AttendanceBar percent={c.avgAttendance} />
                            <span className="w-10 shrink-0 text-sm font-bold tabular-nums text-right">
                              {c.avgAttendance}%
                            </span>
                          </div>
                        </div>

                        {/* Mobile row */}
                        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:hidden">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="shrink-0 rounded-lg bg-primary/10 px-2 py-1 font-mono text-[11px] font-bold text-primary">
                                {c.code}
                              </span>
                              <p className="truncate text-sm font-medium">{c.title}</p>
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                              {c.studentCount} students · {c.sessionCount} session
                              {c.sessionCount === 1 ? '' : 's'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'text-base font-bold tabular-nums',
                                c.avgAttendance < 50 && 'text-rose-600 dark:text-rose-400'
                              )}
                            >
                              {c.avgAttendance}%
                            </span>
                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                          </div>
                          <div className="col-span-2">
                            <AttendanceBar percent={c.avgAttendance} />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Weekly trend */}
            <div className="rounded-2xl border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold tracking-tight">Weekly trend</p>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  average attendance
                </span>
              </div>
              {trendData.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Not enough sessions yet — the weekly trend will appear here.
                </p>
              ) : (
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
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
                        formatter={(value) => [`${value}%`, 'Avg attendance']}
                        contentStyle={{
                          background: 'var(--card)',
                          border: '1px solid var(--border)',
                          borderRadius: 12,
                          fontSize: 12,
                          color: 'var(--card-foreground)',
                        }}
                        labelStyle={{ color: 'var(--muted-foreground)' }}
                      />
                      <Line
                        type="monotone"
                        dataKey="avgPercent"
                        stroke={CHART_LINE}
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: CHART_LINE, strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* At-risk students */}
            <div className="rounded-2xl border bg-card">
              <div className="flex items-center justify-between gap-2 p-4 pb-3">
                <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                  <UserX className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                  At-risk students
                </p>
                <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-400 tabular-nums">
                  {report.atRisk.length}
                </span>
              </div>
              {report.atRisk.length === 0 ? (
                <div className="border-t px-4 py-10 text-center">
                  <p className="text-sm font-medium">No at-risk students</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Everyone is keeping up — nice work.
                  </p>
                </div>
              ) : (
                <div className="max-h-96 divide-y border-t overflow-y-auto scrollbar-thin">
                  {report.atRisk.map((st) => (
                    <button
                      key={`${st.studentId}-${st.courseCode}`}
                      onClick={() => navigate('student', { studentId: st.studentId })}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-11"
                    >
                      <IdentityAvatar name={st.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{st.name}</p>
                        <span className="mt-0.5 inline-block rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                          {st.courseCode}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-bold tabular-nums text-rose-600 dark:text-rose-400">
                          {st.percent}%
                        </span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </motion.div>
    </div>
  )
}
