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
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  Info,
  Mail,
  Plus,
  QrCode,
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
} from 'lucide-react'
import type { AccessCode, DepartmentReport, EnrollmentSubmission } from '@/lib/types'
import { api, getErrorMessage } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
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
  EnrollmentRequestCard,
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

  // Enrollment share-link state (submission approval moved to the Dean's office)
  const [shareLinkOpen, setShareLinkOpen] = useState(false)
  const [selectedShareCourseId, setSelectedShareCourseId] = useState<string>('all')
  const [codeSendEmailImmediately, setCodeSendEmailImmediately] = useState(true)
  const [sendingEmailCodeId, setSendingEmailCodeId] = useState<string | null>(null)

  // Enrollment requests addressed to this department (slice-based approvals)
  const [submissions, setSubmissions] = useState<EnrollmentSubmission[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [approvingSubId, setApprovingSubId] = useState<string | null>(null)
  const [rejectingSubId, setRejectingSubId] = useState<string | null>(null)

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

  useEffect(() => {
    if (activeTab === 'codes') void loadCodes()
  }, [activeTab, loadCodes])

  // Load enrollment requests addressed to this department
  const loadSubmissions = useCallback(async () => {
    setSubmissionsLoading(true)
    try {
      const data = await api<{ submissions: EnrollmentSubmission[] }>('/api/departments/enrollment-submissions')
      setSubmissions(data.submissions)
    } catch (e) {
      toast.error('Failed to load enrollment requests: ' + getErrorMessage(e))
    } finally {
      setSubmissionsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'enrollments') void loadSubmissions()
  }, [activeTab, loadSubmissions])

  // Accept / decline this department's slice of a request
  const handleReviewSubmission = async (submissionId: string, action: 'APPROVE' | 'REJECT') => {
    if (action === 'APPROVE') setApprovingSubId(submissionId)
    else setRejectingSubId(submissionId)
    try {
      const res = await api<{ finalized?: string }>('/api/departments/enrollment-submissions', {
        method: 'PATCH',
        body: { submissionId, action },
      })
      if (action === 'APPROVE') {
        toast.success(
          res.finalized === 'APPROVED'
            ? 'Accepted — all departments agreed, student fully enrolled!'
            : 'Courses accepted into your department'
        )
      } else {
        toast.success(res.finalized === 'REJECTED' ? 'Request declined' : 'Courses declined for your department')
      }
      void loadSubmissions()
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setApprovingSubId(null)
      setRejectingSubId(null)
    }
  }

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
          sendEmailImmediately: codeSendEmailImmediately && Boolean(codeDesignatedEmail.trim()),
        },
      })
      if (codeSendEmailImmediately && codeDesignatedEmail.trim()) {
        toast.success(`Access code ${res.code.code} generated and invitation emailed to ${codeDesignatedEmail}!`)
      } else {
        toast.success(`Access code ${res.code.code} generated successfully`)
      }
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

  // Send code email action
  const handleSendCodeEmail = async (code: AccessCode) => {
    let email = code.designatedEmail
    if (!email) {
      const prompted = window.prompt(`Enter recipient email for access code ${code.code}:`)
      if (!prompted || !prompted.trim()) return
      email = prompted.trim()
    }
    setSendingEmailCodeId(code.id)
    try {
      const res = await api<{ ok: boolean; deliveredStatus: string; error?: string }>(
        `/api/departments/codes/${code.id}/email`,
        {
          method: 'POST',
          body: { recipientEmail: email, recipientName: code.designatedName || undefined },
        }
      )
      if (res.deliveredStatus === 'SENT') {
        toast.success(`Access code sent to ${email} via Resend!`)
      } else {
        toast.info(`Invitation recorded for ${email} (${res.deliveredStatus})`)
      }
      void loadCodes()
    } catch (e) {
      toast.error('Failed to send email: ' + getErrorMessage(e))
    } finally {
      setSendingEmailCodeId(null)
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

  // Requests still awaiting this department's verdict
  const myQueue = useMemo(
    () => submissions.filter((s) => s.myStatus != null),
    [submissions]
  )
  const pendingCount = useMemo(
    () => myQueue.filter((s) => s.status === 'PENDING' && s.myStatus === 'PENDING').length,
    [myQueue]
  )

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
              className="flex min-w-0 items-center justify-center gap-1.5 px-1 text-xs font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs"
            >
              <BarChart3 className="h-4 w-4 shrink-0" />
              <span className="hidden min-w-0 truncate sm:inline">Analytics &amp; Attendance</span>
              <span className="min-w-0 truncate sm:hidden">Analytics</span>
            </TabsTrigger>
            <TabsTrigger
              value="codes"
              className="flex min-w-0 items-center justify-center gap-1.5 px-1 text-xs font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs"
            >
              <Ticket className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">Lecturer Access</span>
              {codes.filter((c) => c.status === 'ACTIVE').length > 0 && (
                <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                  {codes.filter((c) => c.status === 'ACTIVE').length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="enrollments"
              className="flex min-w-0 items-center justify-center gap-1.5 px-1 text-xs font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs"
            >
              <UserCheck className="h-4 w-4 shrink-0" />
              <span className="hidden min-w-0 truncate sm:inline">Student Self-Enroll</span>
              <span className="min-w-0 truncate sm:hidden">Enrollments</span>
              {pendingCount > 0 && (
                <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                  {pendingCount}
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
                              variant="outline"
                              size="sm"
                              className="h-9 gap-1.5 text-xs font-semibold"
                              disabled={sendingEmailCodeId === c.id}
                              onClick={() => handleSendCodeEmail(c)}
                              title={c.designatedEmail ? `Email access code directly to ${c.designatedEmail}` : 'Send access code to lecturer via email'}
                            >
                              {sendingEmailCodeId === c.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Mail className="h-3.5 w-3.5 text-primary" />
                              )}
                              Send Email
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
              <Button
                onClick={() => setShareLinkOpen(true)}
                variant="outline"
                className="h-10 text-xs font-semibold gap-1.5 w-full sm:w-auto"
              >
                <QrCode className="h-4 w-4" /> Share Link
              </Button>
            </div>

            {/* Live request queue — HoDs act on their own department's slice */}
            {submissionsLoading ? (
              <LoadingBlock label="Loading enrollment requests…" />
            ) : myQueue.length === 0 ? (
              <div className="rounded-2xl border bg-card">
                <EmptyState
                  icon={UserCheck}
                  title="No enrollment requests yet"
                  description="When students request courses owned by your department, their submissions arrive here for you to accept or decline. The Dean's office can still finalize cross-department enrollments."
                />
              </div>
            ) : (
              <div className="space-y-3">
                {myQueue.map((sub) => {
                  const actionable = sub.status === 'PENDING' && sub.myStatus === 'PENDING'
                  const isApproving = approvingSubId === sub.id
                  const isRejecting = rejectingSubId === sub.id

                  return (
                    <EnrollmentRequestCard
                      key={sub.id}
                      submission={sub}
                      actions={
                        actionable ? (
                          <>
                            <Button
                              variant="outline"
                              className="min-h-11 gap-1 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleReviewSubmission(sub.id, 'REJECT')}
                              disabled={isApproving || isRejecting}
                            >
                              {isRejecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                              Decline
                            </Button>
                            <Button
                              className="min-h-11 gap-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => handleReviewSubmission(sub.id, 'APPROVE')}
                              disabled={isApproving || isRejecting}
                            >
                              {isApproving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              Accept into {user?.departmentName ?? 'Dept'}
                            </Button>
                          </>
                        ) : sub.myStatus === 'APPROVED' ? (
                          <div className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl border border-emerald-600/30 bg-emerald-600/10 py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                            Accepted into {user?.departmentName ?? 'your department'}
                          </div>
                        ) : (
                          <div className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl border bg-muted/40 py-2.5 text-xs font-medium text-muted-foreground">
                            <X className="h-3.5 w-3.5 shrink-0" />
                            Declined for your department
                          </div>
                        )
                      }
                    />
                  )
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* DIALOG: GENERATE ACCESS CODE */}
      <Dialog open={createCodeOpen} onOpenChange={setCreateCodeOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto scrollbar-thin sm:max-w-md">
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
                  {/* Only the platform super admin mints HoD codes */}
                  {user?.role === 'SUPERADMIN' && (
                    <SelectItem value="ADMIN">Department Admin / HOD (Full Management)</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

            {codeDesignatedEmail.trim() && (
              <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-primary" />
                    Dispatch Invitation Email
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Send join link &amp; code directly to {codeDesignatedEmail}
                  </p>
                </div>
                <Switch
                  checked={codeSendEmailImmediately}
                  onCheckedChange={setCodeSendEmailImmediately}
                />
              </div>
            )}
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

      {/* DIALOG: SHARE ENROLLMENT LINK */}
      <Dialog open={shareLinkOpen} onOpenChange={setShareLinkOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto scrollbar-thin sm:max-w-md">
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-foreground min-w-0">
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
              <p className="min-w-0 rounded-lg border bg-background px-3 py-2.5 font-mono text-xs break-all">
                {getPublicEnrollUrl()}
              </p>
              <Button
                size="sm"
                className="shrink-0 gap-1.5 font-semibold w-full sm:w-auto"
                onClick={() => copyText(getPublicEnrollUrl(), selectedShareCourseId === 'all' ? 'Department Enrollment Link' : 'Course Enrollment Link')}
              >
                <Copy className="h-3.5 w-3.5" /> Copy Link
              </Button>
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <Info className="h-4 w-4 text-primary" /> Student Experience:
              </p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Students enter their student ID, full name, and level.</li>
                <li>The browser camera guides them through 3 face poses (center, tilt right, tilt left).</li>
                <li>Face descriptors are computed directly on device for privacy.</li>
                <li>Submissions go to the Dean's office (or a super administrator) for approval.</li>
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
