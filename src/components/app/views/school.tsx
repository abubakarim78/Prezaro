'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  GraduationCap,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  Mail,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  Ticket,
  Trash2,
  TriangleAlert,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import type { AccessCode, Department, EnrollmentSubmission } from '@/lib/types'
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
  EmptyState,
  IdentityAvatar,
  LoadingBlock,
  PageHeader,
  StatCard,
} from '@/components/app/shared'

export default function SchoolView() {
  const { user } = useAppStore()

  const [activeTab, setActiveTab] = useState<'overview' | 'approvals' | 'access'>('overview')
  const [departments, setDepartments] = useState<Department[]>([])
  const [deptsLoading, setDeptsLoading] = useState(false)
  const [deptsError, setDeptsError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // School-wide submission queue
  const [submissions, setSubmissions] = useState<EnrollmentSubmission[]>([])
  const [submissionsLoading, setSubmissionsLoading] = useState(false)
  const [submissionQuery, setSubmissionQuery] = useState('')
  const [selectedPhoto, setSelectedPhoto] = useState<{ name: string; photoData: string } | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)

  // School access codes (invite HoDs / lecturers)
  const [codes, setCodes] = useState<AccessCode[]>([])
  const [codesLoading, setCodesLoading] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteRole, setInviteRole] = useState<'LECTURER' | 'ADMIN'>('ADMIN')
  const [inviteDeptId, setInviteDeptId] = useState('')
  const [inviteMaxUses, setInviteMaxUses] = useState(1)
  const [inviteExpiryDays, setInviteExpiryDays] = useState(30)
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteSendEmail, setInviteSendEmail] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [invitedCode, setInvitedCode] = useState<AccessCode | null>(null)
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null)
  const [sendingEmailCodeId, setSendingEmailCodeId] = useState<string | null>(null)

  // Load school departments
  const loadDepartments = useCallback(async () => {
    setDeptsLoading(true)
    try {
      const data = await api<{ departments: Department[] }>('/api/departments')
      setDepartments(data.departments)
      setDeptsError(null)
    } catch (e) {
      setDeptsError(getErrorMessage(e))
    } finally {
      setDeptsLoading(false)
    }
  }, [])

  // Load school-wide submissions
  const loadSubmissions = useCallback(async () => {
    setSubmissionsLoading(true)
    try {
      const data = await api<{ submissions: EnrollmentSubmission[] }>('/api/departments/enrollment-submissions')
      setSubmissions(data.submissions)
    } catch (e) {
      toast.error('Failed to load submissions: ' + getErrorMessage(e))
    } finally {
      setSubmissionsLoading(false)
    }
  }, [])

  // Load school access codes
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
    void loadDepartments()
  }, [loadDepartments, tick])

  useEffect(() => {
    if (activeTab === 'approvals') void loadSubmissions()
    if (activeTab === 'access') void loadCodes()
  }, [activeTab, loadSubmissions, loadCodes])

  // Invite HoD / lecturer action (DEAN codes mint ADMIN/LECTURER within the school)
  const handleInvite = async () => {
    if (!inviteDeptId) {
      toast.error('Please choose the department this person will lead or teach in')
      return
    }
    setInviting(true)
    try {
      const res = await api<{ code: AccessCode }>('/api/departments/codes', {
        method: 'POST',
        body: {
          role: inviteRole,
          departmentId: inviteDeptId,
          maxUses: inviteMaxUses,
          expiresInDays: inviteExpiryDays === 0 ? undefined : inviteExpiryDays,
          designatedName: inviteName.trim() || undefined,
          designatedEmail: inviteEmail.trim() || undefined,
          sendEmailImmediately: inviteSendEmail && Boolean(inviteEmail.trim()),
        },
      })
      if (inviteSendEmail && inviteEmail.trim()) {
        toast.success(`Access code ${res.code.code} generated and invitation emailed to ${inviteEmail}!`)
      } else {
        toast.success(`Access code ${res.code.code} generated successfully`)
      }
      setInvitedCode(res.code)
      setInviteName('')
      setInviteEmail('')
      void loadCodes()
      setTick((t) => t + 1)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setInviting(false)
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
        toast.success(`Access code sent to ${email}!`)
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

  // Review submission action (Dean approval)
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

  const getSchoolEnrollUrl = () => {
    if (typeof window === 'undefined') return '/enroll'
    const token = user?.schoolCode || user?.schoolId
    return token ? `${window.location.origin}/enroll?school=${token}` : `${window.location.origin}/enroll`
  }

  const totals = useMemo(() => {
    const courseCount = departments.reduce((a, d) => a + (d.courseCount ?? 0), 0)
    const studentCount = departments.reduce((a, d) => a + (d.studentCount ?? 0), 0)
    const staffCount = departments.reduce((a, d) => a + (d.userCount ?? 0), 0)
    return { courseCount, studentCount, staffCount }
  }, [departments])

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

  if (!user?.schoolId) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        <PageHeader title="School Control" subtitle="Dean's Office" />
        <div className="px-4 lg:px-8 pb-10">
          <div className="rounded-2xl border bg-card">
            <EmptyState
              icon={Building2}
              title="No school assigned to your account"
              description="Your account is missing a School/Faculty. Ask the platform super administrator to re-issue your Dean access code with the school attached."
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl">
      <PageHeader
        title={user?.schoolName ?? 'School'}
        subtitle="School Control — Dean's Office"
      />

      <div className="px-4 lg:px-8 pb-10 space-y-5">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid grid-cols-3 w-full h-11 bg-muted/70 p-1 rounded-xl">
            <TabsTrigger
              value="overview"
              className="flex min-w-0 items-center justify-center gap-1.5 px-1 text-xs font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs"
            >
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">School</span>
            </TabsTrigger>
            <TabsTrigger
              value="approvals"
              className="flex min-w-0 items-center justify-center gap-1.5 px-1 text-xs font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs"
            >
              <UserCheck className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">Approvals</span>
              {pendingSubmissions.length > 0 && (
                <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                  {pendingSubmissions.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="access"
              className="flex min-w-0 items-center justify-center gap-1.5 px-1 text-xs font-semibold rounded-lg data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-xs"
            >
              <Ticket className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">Access</span>
              {codes.filter((c) => c.status === 'ACTIVE').length > 0 && (
                <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                  {codes.filter((c) => c.status === 'ACTIVE').length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: SCHOOL OVERVIEW */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Departments" value={departments.length} sub="in school" icon={Building2} />
              <StatCard label="Courses" value={totals.courseCount} sub="all departments" icon={BookOpen} />
              <StatCard label="Students" value={totals.studentCount} sub="enrolled total" icon={GraduationCap} />
              <StatCard label="Staff" value={totals.staffCount} sub="HoDs & lecturers" icon={Users} />
            </div>

            {/* School enrollment link */}
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-primary" />
                  School Enrollment Link
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 gap-1.5 text-xs font-semibold"
                  onClick={() => copyText(getSchoolEnrollUrl(), 'School Enrollment Link')}
                >
                  <Copy className="h-3.5 w-3.5" /> Copy Link
                </Button>
              </div>
              <p className="min-w-0 rounded-lg border bg-muted/40 px-3 py-2.5 font-mono text-xs break-all">
                {getSchoolEnrollUrl()}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Students who open this link land on the school preselected. They pick their level and register courses from any department in the school; submissions arrive in your Approvals queue.
              </p>
            </div>

            {/* Departments */}
            <div className="rounded-2xl border bg-card">
              <div className="flex items-center justify-between gap-2 p-4 pb-3">
                <p className="text-sm font-semibold tracking-tight">Departments in your school</p>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setTick((t) => t + 1)} title="Refresh">
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
              {deptsLoading ? (
                <LoadingBlock label="Loading departments…" />
              ) : deptsError ? (
                <div className="border-t">
                  <EmptyState
                    icon={TriangleAlert}
                    title="Couldn't load departments"
                    description={deptsError}
                    action={
                      <Button variant="outline" className="min-h-11" onClick={() => setTick((t) => t + 1)}>
                        Try again
                      </Button>
                    }
                  />
                </div>
              ) : departments.length === 0 ? (
                <div className="border-t">
                  <EmptyState
                    icon={Building2}
                    title="No departments yet"
                    description="Departments appear here once the platform administrator adds them to your school."
                  />
                </div>
              ) : (
                <div className="divide-y border-t">
                  {departments.map((d) => (
                    <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{d.name}</p>
                        <span className="mt-0.5 inline-block rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                          {d.code}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                        <span className="tabular-nums">{d.courseCount ?? 0} courses</span>
                        <span className="tabular-nums">{d.studentCount ?? 0} students</span>
                        <span className="tabular-nums hidden sm:inline">{d.userCount ?? 0} staff</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB 2: ENROLLMENT APPROVALS (school-wide) */}
          <TabsContent value="approvals" className="mt-4 space-y-4">
            {/* Search filter */}
            <div className="relative">
              <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={submissionQuery}
                onChange={(e) => setSubmissionQuery(e.target.value)}
                placeholder="Search submissions by student name, index number, or email…"
                className="pl-9 h-11 rounded-xl bg-card"
              />
            </div>

            {submissionsLoading ? (
              <LoadingBlock label="Loading enrollment submissions…" />
            ) : filteredSubmissions.length === 0 ? (
              <div className="rounded-2xl border bg-card">
                <EmptyState
                  icon={UserCheck}
                  title="No enrollment submissions"
                  description="Share the school enrollment link with your students. Their submissions arrive here for school-wide approval."
                />
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
                            {sub.email} • Level {sub.level} • Home: {sub.departmentName ?? '—'} • {sub.descriptorsCount || 3} Poses
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
                                    · {c.departmentName ? `${c.departmentName} — ` : ''}{c.title}
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

          {/* TAB 3: SCHOOL ACCESS CODES */}
          <TabsContent value="access" className="mt-4 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border bg-card p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-primary" />
                  School Access Codes
                </h3>
                <p className="text-xs text-muted-foreground">
                  Invite department heads and lecturers across your school. They claim their code to activate their account instantly.
                </p>
              </div>
              <Button onClick={() => { setInvitedCode(null); setInviteOpen(true) }} className="h-10 text-xs font-semibold gap-1.5">
                <Plus className="h-4 w-4" /> Invite Staff
              </Button>
            </div>

            {codesLoading ? (
              <LoadingBlock label="Loading access codes…" />
            ) : codes.length === 0 ? (
              <div className="rounded-2xl border bg-card">
                <EmptyState
                  icon={Ticket}
                  title="No access codes created yet"
                  description="Invite a department head (HoD) to manage their department, or a lecturer to take attendance in their courses."
                />
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
                          {c.departmentName && (
                            <span>Dept: <strong className="text-foreground">{c.departmentName}</strong></span>
                          )}
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
                              title={c.designatedEmail ? `Email access code directly to ${c.designatedEmail}` : 'Send access code via email'}
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
        </Tabs>
      </div>

      {/* DIALOG: INVITE HoD / LECTURER */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto scrollbar-thin sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Invite School Staff
            </DialogTitle>
            <DialogDescription>
              Create a designated access code for a department head or lecturer within your school.
            </DialogDescription>
          </DialogHeader>

          {invitedCode ? (
            <div className="space-y-4 py-2">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
                <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Access code created
                </p>
                <p className="font-mono text-2xl font-bold tracking-widest text-foreground break-all">
                  {invitedCode.code}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {invitedCode.role === 'ADMIN' ? 'Department Admin / HoD' : 'Lecturer'} — share this code or the invite link. The recipient claims it on first login.
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full gap-1.5"
                onClick={() => copyText(invitedCode.code, 'Access Code')}
              >
                <Copy className="h-4 w-4" /> Copy Code
              </Button>
              <DialogFooter>
                <Button className="w-full" onClick={() => { setInvitedCode(null); setInviteOpen(false) }}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Role</label>
                  <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as typeof inviteRole)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">Department Admin / HoD (Full Management)</SelectItem>
                      <SelectItem value="LECTURER">Lecturer (Course &amp; Attendance Access)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Department (within your school)</label>
                  <Select value={inviteDeptId} onValueChange={setInviteDeptId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Max Uses</label>
                    <Select value={String(inviteMaxUses)} onValueChange={(v) => setInviteMaxUses(Number(v))}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 (Single invite)</SelectItem>
                        <SelectItem value="5">5 (Small team)</SelectItem>
                        <SelectItem value="20">20 (Department cohort)</SelectItem>
                        <SelectItem value="100">100 (Unrestricted)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">Expires In</label>
                    <Select value={String(inviteExpiryDays)} onValueChange={(v) => setInviteExpiryDays(Number(v))}>
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
                  <label className="text-xs font-semibold text-foreground">Name (Optional)</label>
                  <Input
                    placeholder={inviteRole === 'ADMIN' ? 'e.g. Dr. Ama Mensah (HoD)' : 'e.g. Dr. Kwame Osei'}
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Assigned Email (Optional - Restricts to this email)
                  </label>
                  <Input
                    type="email"
                    placeholder="e.g. amensah@university.edu"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                </div>

                {inviteEmail.trim() && (
                  <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 p-3">
                    <div className="space-y-0.5">
                      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-primary" />
                        Dispatch Invitation Email
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Send join link &amp; code directly to {inviteEmail}
                      </p>
                    </div>
                    <Switch
                      checked={inviteSendEmail}
                      onCheckedChange={setInviteSendEmail}
                    />
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setInviteOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleInvite} disabled={inviting || departments.length === 0}>
                  {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate Access Code'}
                </Button>
              </DialogFooter>
            </>
          )}
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
    </div>
  )
}
