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
  AlertCircle,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  Info,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  Trash2,
  TrendingUp,
  TriangleAlert,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  X,
  XCircle,
} from 'lucide-react'
import type { AccessCode, DepartmentReport, EnrollmentSubmission } from '@/lib/types'
import { api, getErrorMessage } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

  const [activeTab, setActiveTab] = useState<'analytics' | 'codes' | 'enrollments'>('analytics')
  const [report, setReport] = useState<DepartmentReport | null>(null)
  const [reportError, setReportError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // Access codes state
  const [codes, setCodes] = useState<AccessCode[]>([])
  const [codesLoading, setCodesLoading] = useState(false)
  const [createCodeOpen, setCreateCodeOpen] = useState(false)
  const [codeRole, setCodeRole] = useState<'LECTURER' | 'ADMIN'>('LECTURER')
  const [codeMaxUses, setCodeMaxUses] = useState(1)
  const [codeExpiryDays, setCodeExpiryDays] = useState(30)
  const [codeDesignatedName, setCodeDesignatedName] = useState('')
  const [codeDesignatedEmail, setCodeDesignatedEmail] = useState('')
  const [generatingCode, setGeneratingCode] = useState(false)
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null)

  // Student submissions state
  const [submissions, setSubmissions] = useState<EnrollmentSubmission[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [submissionQuery, setSubmissionQuery] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState<{ name: string; photoData: string } | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [shareLinkOpen, setShareLinkOpen] = useState(false)
  const [selectedShareCourseId, setSelectedShareCourseId] = useState<string>('all')

  // Load department report
  useEffect(() => {
    ;(async () => {
      try {
        const d = await api<{ report: DepartmentReport }>('/api/reports/department')
        setReport(d.report)
        setReportError(null)
      } catch (e) {
        setReportError(getErrorMessage(e))
      }
    })()
  }, [tick])

  // Load access codes
  const loadCodes = useCallback(async () => {
    setCodesLoading(true)
    try {
      const data = await api<{ codes: AccessCode[] }>('/api/departments/codes')
      setCodes(data.codes)
    } catch (e) {
      toast.error('Failed to load access codes: ' + getErrorMessage(e))
    } finally {
      setCodesLoading(false)
    }
  }, [])

  // Load student submissions
  const loadSubmissions = useCallback(async () => {
    setSubmissionsLoading(true)
    try {
      const data = await api<{ submissions: EnrollmentSubmission[] }>('/api/departments/enrollment-submissions')
      setSubmissions(data.submissions)
    } catch (e) {
      toast.error('Failed to load student submissions: ' + getErrorMessage(e))
    } finally {
      setSubmissionsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'codes') void loadCodes()
    if (activeTab === 'enrollments') void loadSubmissions()
  }, [activeTab, loadCodes, loadSubmissions])

  // Generate code action
  const handleGenerateCode = async () => {
    setGeneratingCode(true)
    try {
      const res = await api<{ code: AccessCode }>('/api/departments/codes', {
        method: 'POST',
        body: {
          role: codeRole,
          maxUses: codeMaxUses,
          expiresInDays: codeExpiryDays === 0 ? undefined : codeExpiryDays,
          designatedName: codeDesignatedName.trim() || undefined,
          designatedEmail: codeDesignatedEmail.trim() || undefined,
        },
      })
      toast.success(`Access code ${res.code.code} generated successfully`)
      setCreateCodeOpen(false)
      setCodeDesignatedName('')
      setCodeDesignatedEmail('')
      void loadCodes()
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setGeneratingCode(false)
    }
  }

  // Revoke code action
  const handleRevokeCode = async (codeId: string) => {
    if (!confirm('Are you sure you want to revoke this access code? Anyone using it will no longer be able to claim access.')) return
    try {
      await api('/api/departments/codes', {
        method: 'DELETE',
        body: { codeId },
      })
      toast.success('Access code revoked')
      void loadCodes()
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  // Approve student submission
  const handleReviewSubmission = async (submissionId: string, action: 'APPROVE' | 'REJECT') => {
    if (action === 'APPROVE') setApprovingId(submissionId)
    else setRejectingId(submissionId)

    try {
      await api('/api/departments/enrollment-submissions', {
        method: 'PATCH',
        body: { submissionId, action },
      })
      toast.success(action === 'APPROVE' ? 'Student verified and enrolled!' : 'Submission rejected')
      void loadSubmissions()
      setTick((t) => t + 1)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setApprovingId(null)
      setRejectingId(null)
    }
  }

  // Copy helper
  const copyText = (text: string, label: string, id?: string) => {
    void navigator.clipboard.writeText(text)
    if (id) {
      setCopiedCodeId(id)
      setTimeout(() => setCopiedCodeId(null), 2000)
    }
    toast.success(`${label} copied to clipboard!`)
  }

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

  const pendingSubmissions = useMemo(
    () => submissions.filter((s) => s.status === 'PENDING'),
    [submissions]
  )

  const filteredSubmissions = useMemo(() => {
    const q = submissionQuery.trim().toLowerCase()
    if (!q) return submissions
    return submissions.filter(
      (s) =>
        s.firstName.toLowerCase().includes(q) ||
        s.lastName.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
    )
  }, [submissions, submissionQuery])

  const getPublicEnrollUrl = () => {
    if (typeof window === 'undefined') return '/enroll'
    const base = `${window.location.origin}/enroll`
    if (selectedShareCourseId && selectedShareCourseId !== 'all') {
      return `${base}?course=${selectedShareCourseId}`
    }
    const deptId = user?.departmentId
    return deptId ? `${base}?dept=${deptId}` : base
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title={report?.departmentName ?? user?.departmentName ?? 'Department'}
        subtitle="Department Administration & Control"
      />

      <div className="px-4 lg:px-8 pb-10 space-y-5">
        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid grid-cols-3 w-full h-11 bg-muted/70 p-1 rounded-xl">
            <TabsTrigger
              value="analytics"
              className="flex items-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs"
            >
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Analytics &amp; Attendance</span>
              <span className="sm:hidden">Analytics</span>
            </TabsTrigger>
            <TabsTrigger
              value="codes"
              className="flex items-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs"
            >
              <Ticket className="h-4 w-4" />
              <span>Lecturer Access</span>
              {codes.filter((c) => c.status === 'ACTIVE').length > 0 && (
                <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.2 text-[10px] text-primary">
                  {codes.filter((c) => c.status === 'ACTIVE').length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="enrollments"
              className="flex items-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs"
            >
              <UserCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Student Self-Enroll</span>
              <span className="sm:hidden">Enrollments</span>
              {pendingSubmissions.length > 0 && (
                <span className="ml-1 rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                  {pendingSubmissions.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: ANALYTICS & ATTENDANCE */}
          <TabsContent value="analytics" className="mt-4 space-y-4">
            {report === null && !reportError ? (
              <LoadingBlock label="Loading department data…" />
            ) : reportError ? (
              <div className="rounded-2xl border bg-card">
                <EmptyState
                  icon={TriangleAlert}
                  title="Couldn't load dashboard"
                  description={reportError}
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

                            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 sm:hidden">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-primary">
                                  {c.code}
                                </span>
                                <p className="truncate text-sm font-medium">{c.title}</p>
                              </div>
                              <span className="text-sm font-bold tabular-nums">{c.avgAttendance}%</span>
                              <div className="col-span-2 flex items-center justify-between text-xs text-muted-foreground">
                                <span>{c.studentCount} students</span>
                                <span>{c.sessionCount} sessions</span>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Trend line */}
                <div className="rounded-2xl border bg-card p-4">
                  <div className="flex items-center justify-between gap-2 pb-3">
                    <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      30-day attendance trend
                    </p>
                    <span className="text-[11px] text-muted-foreground">Daily average</span>
                  </div>
                  {trendData.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      No attendance data recorded in the last 30 days.
                    </div>
                  ) : (
                    <div className="h-48 w-full pt-2">
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
                      At-risk students (&lt; 75% attendance)
                    </p>
                    <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-400 tabular-nums">
                      {report.atRisk.length}
                    </span>
                  </div>
                  {report.atRisk.length === 0 ? (
                    <div className="border-t px-4 py-10 text-center">
                      <p className="text-sm font-medium">No at-risk students</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Everyone is keeping up with university attendance benchmarks.
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
          </TabsContent>

          {/* TAB 2: LECTURER ACCESS CODES */}
          <TabsContent value="codes" className="mt-4 space-y-4">
            {/* Header info & action */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border bg-card p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  Department Access Codes
                </h3>
                <p className="text-xs text-muted-foreground">
                  Generate secure single-use or cohort access codes for your lecturers to join without manual setup.
                </p>
              </div>
              <Button onClick={() => setCreateCodeOpen(true)} className="h-10 text-xs font-semibold gap-1.5">
                <Plus className="h-4 w-4" /> Generate Access Code
              </Button>
            </div>

            {/* Access codes list */}
            {codesLoading ? (
              <LoadingBlock label="Loading access codes…" />
            ) : codes.length === 0 ? (
              <div className="rounded-2xl border bg-card p-8 text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <Ticket className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-sm">No access codes created yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Generate an access code to invite lecturers to your department. Lecturers can claim the code to automatically receive their course rosters and schedules.
                  </p>
                </div>
                <Button onClick={() => setCreateCodeOpen(true)} size="sm">
                  Generate First Code
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl border bg-card divide-y overflow-hidden">
                {codes.map((c) => {
                  const directUrl = typeof window !== 'undefined' ? `${window.location.origin}/?code=${c.code}` : `/?code=${c.code}`
                  const isCopied = copiedCodeId === c.id

                  return (
                    <div key={c.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-base font-bold tracking-wider text-foreground">
                            {c.code}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] font-semibold uppercase px-2 py-0.5',
                              c.status === 'ACTIVE' && 'border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                              c.status === 'EXHAUSTED' && 'border-muted bg-muted text-muted-foreground',
                              c.status === 'REVOKED' && 'border-destructive/30 bg-destructive/10 text-destructive',
                              c.status === 'EXPIRED' && 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                            )}
                          >
                            {c.status}
                          </Badge>
                          <span className="text-[11px] font-medium text-muted-foreground">
                            {c.role === 'ADMIN' ? 'Dept Admin / HOD' : 'Lecturer'}
                          </span>
                        </div>

                        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span>Usage: <strong className="text-foreground">{c.usedCount}/{c.maxUses}</strong></span>
                          {c.designatedName && (
                            <span>For: <strong className="text-foreground">{c.designatedName}</strong></span>
                          )}
                          {c.expiresAt && (
                            <span>Expires: {new Date(c.expiresAt).toLocaleDateString()}</span>
                          )}
                        </div>

                        {c.claimedUsers && c.claimedUsers.length > 0 && (
                          <div className="text-xs text-muted-foreground pt-1 flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            Claimed by: {c.claimedUsers.map((u) => `${u.name} (${u.email})`).join(', ')}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                        {c.status === 'ACTIVE' && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 gap-1.5 text-xs font-semibold"
                              onClick={() => copyText(c.code, 'Access Code', c.id)}
                            >
                              {isCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                              Copy Code
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 gap-1.5 text-xs font-semibold"
                              onClick={() => copyText(directUrl, 'Direct Invite Link')}
                              title="Copy full invite link with code pre-filled"
                            >
                              <LinkIcon className="h-3.5 w-3.5" />
                              Link
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-destructive hover:bg-destructive/10"
                              onClick={() => handleRevokeCode(c.id)}
                              title="Revoke access code"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </TabsContent>

          {/* TAB 3: STUDENT SELF-ENROLLMENTS */}
          <TabsContent value="enrollments" className="mt-4 space-y-4">
            {/* Header info & public link sharing */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border bg-card p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-primary" />
                  Student Self-Enrollment &amp; Face Capture
                </h3>
                <p className="text-xs text-muted-foreground">
                  Students enroll themselves with 3-pose facial scans. Once approved, they appear in their course rosters.
                </p>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  onClick={() => setShareLinkOpen(true)}
                  variant="outline"
                  className="h-10 text-xs font-semibold gap-1.5 flex-1 sm:flex-initial"
                >
                  <QrCode className="h-4 w-4" /> Share Link
                </Button>
                <Button
                  onClick={() => void loadSubmissions()}
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  title="Refresh submissions"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Search filter */}
            {submissions.length > 0 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={submissionQuery}
                  onChange={(e) => setSubmissionQuery(e.target.value)}
                  placeholder="Search submissions by student name, index number, or email…"
                  className="pl-9 h-11 rounded-xl bg-card"
                />
              </div>
            )}

            {/* Submissions list */}
            {submissionsLoading ? (
              <LoadingBlock label="Loading enrollment submissions…" />
            ) : filteredSubmissions.length === 0 ? (
              <div className="rounded-2xl border bg-card p-8 text-center space-y-3">
                <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <UserCheck className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-semibold text-sm">No pending enrollment submissions</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Share the student enrollment link with your students. As soon as they complete their photo capture, their requests will appear here for 1-click verification.
                  </p>
                </div>
                <Button onClick={() => setShareLinkOpen(true)} size="sm">
                  Get Student Enrollment Link
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl border bg-card divide-y overflow-hidden">
                {filteredSubmissions.map((sub) => {
                  const isPending = sub.status === 'PENDING'
                  const isApproving = approvingId === sub.id
                  const isRejecting = rejectingId === sub.id

                  return (
                    <div key={sub.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {/* Student photo preview */}
                        {sub.photoData ? (
                          <button
                            type="button"
                            onClick={() => setSelectedPhoto({ name: `${sub.firstName} ${sub.lastName}`, photoData: sub.photoData! })}
                            className="relative group h-12 w-12 rounded-full overflow-hidden shrink-0 border border-primary/20 shadow-xs focus-visible:ring-2"
                            title="Click to view full photo"
                          >
                            <img
                              src={sub.photoData}
                              alt={sub.firstName}
                              className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                            />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                              <Eye className="h-4 w-4" />
                            </div>
                          </button>
                        ) : (
                          <IdentityAvatar name={`${sub.firstName} ${sub.lastName}`} className="h-12 w-12" />
                        )}

                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-sm truncate">
                              {sub.firstName} {sub.lastName}
                            </p>
                            <span className="font-mono text-xs text-muted-foreground">
                              ({sub.studentId})
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[10px] uppercase font-semibold px-1.5 py-0',
                                sub.status === 'PENDING' && 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
                                sub.status === 'APPROVED' && 'border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                                sub.status === 'REJECTED' && 'border-destructive/30 bg-destructive/10 text-destructive'
                              )}
                            >
                              {sub.status}
                            </Badge>
                          </div>

                          <p className="text-xs text-muted-foreground truncate">
                            {sub.email} • Level {sub.level} • {sub.descriptorsCount || 3} Poses Verified
                          </p>

                          {sub.courses && sub.courses.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {sub.courses.map((c) => (
                                <span
                                  key={c.id}
                                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 font-mono text-[10px] font-semibold text-primary"
                                >
                                  <BookOpen className="h-3 w-3" />
                                  {c.code}
                                  <span className="font-sans font-normal text-muted-foreground truncate max-w-[130px]">
                                    · {c.title}
                                  </span>
                                </span>
                              ))}
                            </div>
                          ) : sub.courseIds && sub.courseIds.length > 0 ? (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {sub.courseIds.map((cId) => (
                                <span
                                  key={cId}
                                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground"
                                >
                                  {cId.slice(-6).toUpperCase()}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                        {isPending ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-9 gap-1 text-xs text-destructive hover:bg-destructive/10"
                              onClick={() => handleReviewSubmission(sub.id, 'REJECT')}
                              disabled={isApproving || isRejecting}
                            >
                              {isRejecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              className="h-9 gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => handleReviewSubmission(sub.id, 'APPROVE')}
                              disabled={isApproving || isRejecting}
                            >
                              {isApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              Approve &amp; Enroll
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {sub.reviewedAt ? new Date(sub.reviewedAt).toLocaleDateString() : 'Reviewed'}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* DIALOG: GENERATE ACCESS CODE */}
      <Dialog open={createCodeOpen} onOpenChange={setCreateCodeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-primary" />
              Generate Lecturer Access Code
            </DialogTitle>
            <DialogDescription>
              Create a designated access code for a lecturer to instantly activate their account and manage their lecture rosters.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Role</label>
              <Select value={codeRole} onValueChange={(v) => setCodeRole(v as typeof codeRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LECTURER">Lecturer (Course &amp; Attendance Access)</SelectItem>
                  <SelectItem value="ADMIN">Department Admin / HOD (Full Management)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Max Uses</label>
                <Select value={String(codeMaxUses)} onValueChange={(v) => setCodeMaxUses(Number(v))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 (Single lecturer invite)</SelectItem>
                    <SelectItem value="5">5 (Small team)</SelectItem>
                    <SelectItem value="20">20 (Department cohort)</SelectItem>
                    <SelectItem value="100">100 (Unrestricted)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Expires In</label>
                <Select value={String(codeExpiryDays)} onValueChange={(v) => setCodeExpiryDays(Number(v))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="0">Never expires</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Lecturer Name (Optional)
              </label>
              <Input
                placeholder="e.g. Dr. Ama Mensah"
                value={codeDesignatedName}
                onChange={(e) => setCodeDesignatedName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Assigned Email (Optional - Restricts to this email)
              </label>
              <Input
                type="email"
                placeholder="e.g. amensah@university.edu"
                value={codeDesignatedEmail}
                onChange={(e) => setCodeDesignatedEmail(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCreateCodeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleGenerateCode} disabled={generatingCode}>
              {generatingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate Code'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: PHOTO ZOOM PREVIEW */}
      <Dialog open={!!selectedPhoto} onOpenChange={(open) => !open && setSelectedPhoto(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{selectedPhoto?.name}</DialogTitle>
            <DialogDescription>Student enrollment facial capture preview</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-center p-2">
            {selectedPhoto && (
              <img
                src={selectedPhoto.photoData}
                alt={selectedPhoto.name}
                className="max-h-72 w-auto rounded-2xl object-cover border shadow-md"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="w-full" onClick={() => setSelectedPhoto(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: SHARE ENROLLMENT LINK */}
      <Dialog open={shareLinkOpen} onOpenChange={setShareLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              Student Self-Enrollment Link
            </DialogTitle>
            <DialogDescription>
              Share this link with students in your department so they can register their face attendance biometric profile.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Target Enrollment Scope (Course or Entire Department)
              </label>
              <Select value={selectedShareCourseId} onValueChange={setSelectedShareCourseId}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    Department-Wide Link (Students select courses)
                  </SelectItem>
                  {report?.courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      Course: {c.code} — {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-xl border bg-muted/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">
                  {selectedShareCourseId === 'all'
                    ? 'Department-Wide Enrollment Link'
                    : 'Specific Course Direct Enrollment Link'}
                </p>
                {selectedShareCourseId !== 'all' && (
                  <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                    Auto-enrolled on approval
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={getPublicEnrollUrl()}
                  className="font-mono text-xs bg-background"
                />
                <Button
                  size="sm"
                  className="shrink-0 gap-1.5 font-semibold"
                  onClick={() => copyText(getPublicEnrollUrl(), selectedShareCourseId === 'all' ? 'Department Enrollment Link' : 'Course Enrollment Link')}
                >
                  <Copy className="h-3.5 w-3.5" /> Copy Link
                </Button>
              </div>
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <Info className="h-4 w-4 text-primary" /> Student Experience:
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Students enter their student ID, full name, and level.</li>
                <li>The browser camera guides them through 3 face poses (center, tilt right, tilt left).</li>
                <li>Face descriptors are computed directly on device for privacy.</li>
                <li>Submissions appear in your queue for 1-click departmental approval.</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button className="w-full" onClick={() => setShareLinkOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
