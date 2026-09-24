'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronRight,
  Database,
  ExternalLink,
  Filter,
  Globe2,
  GraduationCap,
  KeyRound,
  Layers,
  Mail,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  SlidersHorizontal,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  Wifi,
  Zap,
} from 'lucide-react'
import type {
  Department,
  Institution,
  InstitutionInput,
  PlatformInstitutionsResponse,
  PlatformStats,
  PlatformUsersResponse,
  Role,
  User,
} from '@/lib/types'
import { api, getErrorMessage } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  PageHeader,
  StatCard,
  EmptyState,
  LoadingBlock,
  IdentityAvatar,
} from '@/components/app/shared'

const PLAN_BADGES: Record<Institution['plan'], { label: string; className: string }> = {
  TRIAL: {
    label: 'Free Pilot / Trial',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  FACULTY: {
    label: 'Faculty Tier',
    className: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  },
  CAMPUS_ANNUAL: {
    label: 'Campus Annual',
    className: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  },
  ENTERPRISE: {
    label: 'Enterprise Sovereign',
    className: 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400',
  },
}

const ROLE_BADGES: Record<Role, { label: string; className: string }> = {
  SUPERADMIN: {
    label: 'Super Admin',
    className: 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400',
  },
  ADMIN: {
    label: 'Dept Admin / HOD',
    className: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  },
  LECTURER: {
    label: 'Lecturer',
    className: 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  },
}

export default function PlatformAdminView() {
  const { user, navigate } = useAppStore()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [stats, setStats] = useState<PlatformStats | null>(null)

  // Users state
  const [platformUsers, setPlatformUsers] = useState<User[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState<string>('ALL')
  const [userInstFilter, setUserInstFilter] = useState<string>('ALL')

  // Institutions Filters & search
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL')
  const [planFilter, setPlanFilter] = useState<string>('ALL')

  // Modals state
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Institution | null>(null)
  const [logsOpen, setLogsOpen] = useState(false)
  const [logs, setLogs] = useState<any[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)

  // User modals state
  const [addUserOpen, setAddUserOpen] = useState(false)
  const [editUserTarget, setEditUserTarget] = useState<User | null>(null)
  const [newUserData, setNewUserData] = useState({
    name: '',
    email: '',
    title: '',
    role: 'LECTURER' as Role,
    password: '',
    institutionId: '',
    departmentId: '',
  })
  const [editUserData, setEditUserData] = useState({
    name: '',
    title: '',
    role: 'LECTURER' as Role,
    password: '',
    institutionId: '',
    departmentId: '',
  })

  // Provisioning form state
  const [formData, setFormData] = useState<InstitutionInput>({
    name: '',
    code: '',
    slug: '',
    plan: 'TRIAL',
    status: 'ACTIVE',
    maxStudents: 1000,
    maxCourses: 100,
    allowedModes: 'ALL',
    confidenceThreshold: 0.48,
    lateGraceMinutes: 15,
    termSystem: 'SEMESTER',
    atRiskThreshold: 75,
    contactEmail: '',
    contactPhone: '',
    primaryColor: '#059669',
  })
  const [saving, setSaving] = useState(false)

  // Load platform data
  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    else setRefreshing(true)
    try {
      const [resInst, resUsers, resDepts] = await Promise.all([
        api<PlatformInstitutionsResponse>('/api/platform/institutions'),
        api<PlatformUsersResponse>('/api/platform/users'),
        api<{ departments: Department[] }>('/api/departments').catch(() => ({ departments: [] })),
      ])
      setInstitutions(resInst.institutions)
      setStats(resInst.stats)
      setPlatformUsers(resUsers.users)
      setDepartments(resDepts.departments)
      setError(null)
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filtered institutions
  const filteredInstitutions = useMemo(() => {
    return institutions.filter((inst) => {
      const matchesSearch =
        inst.name.toLowerCase().includes(search.toLowerCase()) ||
        inst.code.toLowerCase().includes(search.toLowerCase()) ||
        inst.slug.toLowerCase().includes(search.toLowerCase())

      const matchesStatus = statusFilter === 'ALL' || inst.status === statusFilter
      const matchesPlan = planFilter === 'ALL' || inst.plan === planFilter

      return matchesSearch && matchesStatus && matchesPlan
    })
  }, [institutions, search, statusFilter, planFilter])

  // Filtered users
  const filteredUsers = useMemo(() => {
    return platformUsers.filter((u) => {
      const matchesSearch =
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.departmentName && u.departmentName.toLowerCase().includes(userSearch.toLowerCase())) ||
        (u.institutionName && u.institutionName.toLowerCase().includes(userSearch.toLowerCase()))

      const matchesRole = userRoleFilter === 'ALL' || u.role === userRoleFilter
      const matchesInst = userInstFilter === 'ALL' || u.institutionId === userInstFilter

      return matchesSearch && matchesRole && matchesInst
    })
  }, [platformUsers, userSearch, userRoleFilter, userInstFilter])

  // Auto-generate slug from name
  const handleNameChange = (val: string) => {
    const slug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    setFormData((prev) => ({ ...prev, name: val, slug: prev.slug ? prev.slug : slug }))
  }

  // Submit Create Institution
  const handleCreateInstitution = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.code.trim() || !formData.slug.trim()) {
      toast.error('Please fill in institution name, code, and slug')
      return
    }

    setSaving(true)
    try {
      await api('/api/platform/institutions', {
        method: 'POST',
        body: JSON.stringify(formData),
      })
      toast.success(`Institution "${formData.name}" provisioned successfully`)
      setCreateOpen(false)
      setFormData({
        name: '',
        code: '',
        slug: '',
        plan: 'TRIAL',
        status: 'ACTIVE',
        maxStudents: 1000,
        maxCourses: 100,
        allowedModes: 'ALL',
        confidenceThreshold: 0.48,
        lateGraceMinutes: 15,
        termSystem: 'SEMESTER',
        atRiskThreshold: 75,
        contactEmail: '',
        contactPhone: '',
        primaryColor: '#059669',
      })
      loadData(true)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  // Submit Edit Target Policies
  const handleUpdatePolicies = async () => {
    if (!editTarget) return
    setSaving(true)
    try {
      await api(`/api/platform/institutions/${editTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editTarget.name,
          code: editTarget.code,
          plan: editTarget.plan,
          status: editTarget.status,
          maxStudents: editTarget.maxStudents,
          maxCourses: editTarget.maxCourses,
          allowedModes: editTarget.allowedModes,
          confidenceThreshold: editTarget.confidenceThreshold,
          lateGraceMinutes: editTarget.lateGraceMinutes,
          termSystem: editTarget.termSystem,
          atRiskThreshold: editTarget.atRiskThreshold,
          contactEmail: editTarget.contactEmail,
          contactPhone: editTarget.contactPhone,
          primaryColor: editTarget.primaryColor,
          featuresJson: editTarget.featuresJson,
        }),
      })
      toast.success(`Policies updated for ${editTarget.name} without code changes`)
      setEditTarget(null)
      loadData(true)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  // Toggle active/suspend directly
  const handleToggleStatus = async (inst: Institution) => {
    const nextStatus = inst.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'
    try {
      await api(`/api/platform/institutions/${inst.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      })
      toast.success(`${inst.name} is now ${nextStatus}`)
      loadData(true)
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  // Load audit logs
  const handleOpenLogs = async () => {
    setLogsOpen(true)
    setLoadingLogs(true)
    try {
      const res = await api<{ logs: any[] }>('/api/platform/logs')
      setLogs(res.logs)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setLoadingLogs(false)
    }
  }

  // Submit Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUserData.name.trim() || !newUserData.email.trim() || !newUserData.password) {
      toast.error('Name, email, and password are required')
      return
    }

    setSaving(true)
    try {
      await api('/api/platform/users', {
        method: 'POST',
        body: JSON.stringify(newUserData),
      })
      toast.success(`User ${newUserData.email} created successfully`)
      setAddUserOpen(false)
      setNewUserData({
        name: '',
        email: '',
        title: '',
        role: 'LECTURER',
        password: '',
        institutionId: institutions[0]?.id ?? '',
        departmentId: departments[0]?.id ?? '',
      })
      loadData(true)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  // Open Edit User modal
  const openEditUser = (u: User) => {
    setEditUserTarget(u)
    setEditUserData({
      name: u.name,
      title: u.title ?? '',
      role: u.role,
      password: '',
      institutionId: u.institutionId ?? '',
      departmentId: u.departmentId ?? '',
    })
  }

  // Submit Edit User
  const handleUpdateUser = async () => {
    if (!editUserTarget) return
    setSaving(true)
    try {
      const payload: Record<string, any> = {
        name: editUserData.name,
        title: editUserData.title || null,
        role: editUserData.role,
        institutionId: editUserData.institutionId || null,
        departmentId: editUserData.departmentId || null,
      }
      if (editUserData.password.trim()) {
        payload.password = editUserData.password.trim()
      }

      await api(`/api/platform/users/${editUserTarget.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      toast.success(`User ${editUserTarget.email} updated successfully`)
      setEditUserTarget(null)
      loadData(true)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  // Delete User
  const handleDeleteUser = async (u: User) => {
    if (!confirm(`Are you sure you want to remove user "${u.name}" (${u.email})?`)) return
    try {
      await api(`/api/platform/users/${u.id}`, { method: 'DELETE' })
      toast.success(`User ${u.email} removed`)
      loadData(true)
    } catch (e) {
      toast.error(getErrorMessage(e))
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 lg:px-8 py-10">
        <LoadingBlock label="Loading platform control center..." />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl pb-16">
      {/* Header */}
      <PageHeader
        title="Platform Control Center"
        subtitle="Manage institutions, global users, dynamic policies, capacity quotas, and edge AI configurations."
        right={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="gap-2"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenLogs}
              className="gap-2"
            >
              <Mail className="h-3.5 w-3.5" />
              Outbox Audit
            </Button>
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              Provision Institution
            </Button>
          </div>
        }
      />

      <div className="px-4 lg:px-8 space-y-6">
        {/* KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:gap-4">
          <StatCard
            label="Active Tenants"
            value={`${stats?.activeInstitutionsCount ?? 0} / ${stats?.institutionsCount ?? 0}`}
            sub="Institutions on platform"
            icon={Globe2}
            tone="primary"
          />
          <StatCard
            label="Platform Users"
            value={platformUsers.length.toLocaleString()}
            sub="Lecturers & Administrators"
            icon={Users}
          />
          <StatCard
            label="Enrolled Students"
            value={stats?.studentsCount.toLocaleString() ?? '0'}
            sub="Across all campuses"
            icon={GraduationCap}
          />
          <StatCard
            label="Facial Verifications"
            value={stats?.recordsCount.toLocaleString() ?? '0'}
            sub="Zero-proxy attendance marks"
            icon={Zap}
            tone="primary"
          />
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="institutions" className="w-full">
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="institutions" className="gap-2">
              <Building2 className="h-3.5 w-3.5" />
              Institutions ({institutions.length})
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-3.5 w-3.5" />
              Users ({platformUsers.length})
            </TabsTrigger>
            <TabsTrigger value="policies" className="gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Dynamic Policies
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Institutions List & Management */}
          <TabsContent value="institutions" className="mt-4 space-y-4">
            {/* Filter toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between rounded-xl border bg-card p-3 shadow-xs">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, code (e.g. UDS), or slug..."
                  className="pl-9 h-9 text-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <Select
                  value={statusFilter}
                  onValueChange={(v: any) => setStatusFilter(v)}
                >
                  <SelectTrigger className="h-9 text-xs w-[130px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Status</SelectItem>
                    <SelectItem value="ACTIVE">Active Only</SelectItem>
                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={planFilter} onValueChange={(v) => setPlanFilter(v)}>
                  <SelectTrigger className="h-9 text-xs w-[150px]">
                    <SelectValue placeholder="Subscription" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Plans</SelectItem>
                    <SelectItem value="TRIAL">Trial / Pilot</SelectItem>
                    <SelectItem value="FACULTY">Faculty Tier</SelectItem>
                    <SelectItem value="CAMPUS_ANNUAL">Campus Annual</SelectItem>
                    <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Institutions Grid */}
            {filteredInstitutions.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No institutions match your search"
                description="Try clearing your filters or provision a new institution."
                action={
                  <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2">
                    <Plus className="h-3.5 w-3.5" /> Provision Institution
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredInstitutions.map((inst) => {
                  const planMeta = PLAN_BADGES[inst.plan] || PLAN_BADGES.TRIAL
                  const studentCapacityPercent = Math.min(
                    100,
                    Math.round(((inst.studentCount ?? 0) / inst.maxStudents) * 100)
                  )

                  return (
                    <motion.div
                      key={inst.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        'rounded-2xl border bg-card p-5 shadow-xs transition-all hover:border-primary/40 flex flex-col justify-between gap-4',
                        inst.status === 'SUSPENDED' && 'opacity-70 bg-muted/20'
                      )}
                    >
                      <div>
                        {/* Title & Status */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-base tracking-tight truncate">
                                {inst.name}
                              </h3>
                              <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0">
                                {inst.code}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                              slug: <span className="text-foreground font-medium">{inst.slug}</span>
                              {inst.contactEmail ? ` · ${inst.contactEmail}` : ''}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <Badge className={cn('text-[11px] font-medium border', planMeta.className)}>
                              {planMeta.label}
                            </Badge>
                          </div>
                        </div>

                        {/* Capacity Progress */}
                        <div className="mt-4 p-3 rounded-xl bg-accent/40 border border-border/50 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Student Capacity Quota</span>
                            <span className="font-semibold tabular-nums">
                              {inst.studentCount ?? 0} / {inst.maxStudents.toLocaleString()}{' '}
                              <span className="text-muted-foreground font-normal">
                                ({studentCapacityPercent}%)
                              </span>
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn(
                                'h-full transition-all rounded-full',
                                studentCapacityPercent > 90 ? 'bg-amber-500' : 'bg-primary'
                              )}
                              style={{ width: `${studentCapacityPercent}%` }}
                            />
                          </div>
                        </div>

                        {/* Configured Policies Chips */}
                        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-muted-foreground font-medium">
                            <GraduationCap className="h-3 w-3 text-primary" />
                            {inst.termSystem === 'TRIMESTER' ? 'Trimester System' : 'Semester System'}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-muted-foreground font-medium">
                            <Shield className="h-3 w-3 text-emerald-600" />
                            {inst.atRiskThreshold}% Minimum Attendance
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-muted-foreground font-medium">
                            <Zap className="h-3 w-3 text-amber-600" />
                            {inst.lateGraceMinutes}m Late Grace
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-muted-foreground font-medium">
                            <Sparkles className="h-3 w-3 text-purple-600" />
                            Edge Match: {inst.confidenceThreshold.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="pt-3 border-t flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Switch
                            checked={inst.status === 'ACTIVE'}
                            onCheckedChange={() => handleToggleStatus(inst)}
                          />
                          <span className="text-xs text-muted-foreground">
                            {inst.status === 'ACTIVE' ? 'Active' : 'Suspended'}
                          </span>
                        </div>

                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setEditTarget(inst)}
                          className="gap-2 text-xs font-medium"
                        >
                          <Sliders className="h-3.5 w-3.5" />
                          Adjust Policies & Quotas
                        </Button>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </TabsContent>

          {/* TAB 2: Users Management across Platform */}
          <TabsContent value="users" className="mt-4 space-y-4">
            {/* User Filter Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between rounded-xl border bg-card p-3 shadow-xs">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search user by name, email, department..."
                  className="pl-9 h-9 text-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <Select value={userInstFilter} onValueChange={(v) => setUserInstFilter(v)}>
                  <SelectTrigger className="h-9 text-xs w-[160px]">
                    <SelectValue placeholder="Institution" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Institutions</SelectItem>
                    {institutions.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.code} - {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={userRoleFilter} onValueChange={(v) => setUserRoleFilter(v)}>
                  <SelectTrigger className="h-9 text-xs w-[130px]">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Roles</SelectItem>
                    <SelectItem value="SUPERADMIN">Super Admin</SelectItem>
                    <SelectItem value="ADMIN">Dept Admin</SelectItem>
                    <SelectItem value="LECTURER">Lecturer</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  size="sm"
                  onClick={() => {
                    setNewUserData((prev) => ({
                      ...prev,
                      institutionId: institutions[0]?.id ?? '',
                      departmentId: departments[0]?.id ?? '',
                    }))
                    setAddUserOpen(true)
                  }}
                  className="gap-2 h-9 text-xs"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Add User
                </Button>
              </div>
            </div>

            {/* Users List */}
            {filteredUsers.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No users found"
                description="Try clearing your filters or create a new user."
                action={
                  <Button size="sm" onClick={() => setAddUserOpen(true)} className="gap-2">
                    <UserPlus className="h-3.5 w-3.5" /> Add User
                  </Button>
                }
              />
            ) : (
              <div className="rounded-2xl border bg-card overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/40 text-muted-foreground font-medium">
                      <tr>
                        <th className="py-3 px-4">User</th>
                        <th className="py-3 px-4">Institution & Dept</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Activity</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {filteredUsers.map((u) => {
                        const roleMeta = ROLE_BADGES[u.role] || ROLE_BADGES.LECTURER
                        return (
                          <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <IdentityAvatar name={u.name} className="h-8 w-8" />
                                <div className="min-w-0">
                                  <p className="font-semibold text-foreground truncate">{u.name}</p>
                                  <p className="text-[11px] text-muted-foreground font-mono truncate">
                                    {u.email}
                                  </p>
                                  {u.title && (
                                    <p className="text-[10px] text-muted-foreground/80">{u.title}</p>
                                  )}
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1 font-medium text-foreground">
                                  <Building2 className="h-3 w-3 text-muted-foreground" />
                                  <span>{u.institutionName ?? 'Unassigned'}</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  {u.departmentName ?? 'No Department'}
                                </p>
                              </div>
                            </td>

                            <td className="py-3 px-4">
                              <Badge className={cn('text-[10px] font-medium border', roleMeta.className)}>
                                {roleMeta.label}
                              </Badge>
                            </td>

                            <td className="py-3 px-4">
                              <div className="text-[11px] text-muted-foreground space-y-0.5">
                                <div>
                                  <strong className="text-foreground">{u.courseCount ?? 0}</strong> courses
                                </div>
                                <div>
                                  <strong className="text-foreground">{u.sessionCount ?? 0}</strong> sessions taken
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditUser(u)}
                                  className="h-8 px-2.5 text-xs gap-1"
                                >
                                  <UserCog className="h-3.5 w-3.5" />
                                  Manage
                                </Button>
                                {user?.id !== u.id && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteUser(u)}
                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>

          {/* TAB 3: Dynamic Policy Engine Explanation & Global Configuration */}
          <TabsContent value="policies" className="mt-4 space-y-4">
            <div className="rounded-2xl border bg-card p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <SlidersHorizontal className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg tracking-tight">
                    Zero-Code Dynamic Configuration Engine
                  </h3>
                  <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">
                    Institutions operate under vastly different academic regulations. Rather than modifying source code,
                    all verification rules, latecomer policies, calendar term systems, and biometric confidence margins
                    are dynamically resolved at runtime from the institution's record.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="rounded-xl border p-4 bg-accent/20 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <GraduationCap className="h-4 w-4 text-primary" />
                    Academic Term Systems
                  </div>
                  <p className="text-xs text-muted-foreground leading-normal">
                    Supports <strong>Semester (S1/S2)</strong> and <strong>Trimester (T1/T2/T3)</strong> models. Switching
                    a university from Semester to Trimester automatically adjusts the course creation forms, timetable
                    selectors, and accreditation reports without database migrations.
                  </p>
                </div>

                <div className="rounded-xl border p-4 bg-accent/20 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    75% Rule & Exam Eligibility
                  </div>
                  <p className="text-xs text-muted-foreground leading-normal">
                    Configurable from 50% to 90%. Any student whose attendance falls below this threshold is flagged
                    automatically in the Lecturer and Departmental dashboards for exam disbarment.
                  </p>
                </div>

                <div className="rounded-xl border p-4 bg-accent/20 space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <Zap className="h-4 w-4 text-amber-600" />
                    Edge Face Ambiguity Margins
                  </div>
                  <p className="text-xs text-muted-foreground leading-normal">
                    Adjusts Euclidean distance threshold (0.40 – 0.60). Institutions with dim lighting can relax the margin
                    to 0.52; high-security exam halls can tighten to 0.44 for zero-tolerance impersonation protection.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ---------- MODAL: Add User to Platform ---------- */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add User to Platform</DialogTitle>
            <DialogDescription>
              Create a lecturer or administrator account and assign them to an institution.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateUser} className="space-y-4 pt-2">
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Full Name <span className="text-destructive">*</span></Label>
                <Input
                  value={newUserData.name}
                  onChange={(e) => setNewUserData((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Dr. Kwame Mensah"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Email Address <span className="text-destructive">*</span></Label>
                <Input
                  type="email"
                  value={newUserData.email}
                  onChange={(e) => setNewUserData((p) => ({ ...p, email: e.target.value }))}
                  placeholder="lecturer@institution.edu"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Academic Title</Label>
                  <Input
                    value={newUserData.title}
                    onChange={(e) => setNewUserData((p) => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. Senior Lecturer"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Platform Role</Label>
                  <Select
                    value={newUserData.role}
                    onValueChange={(v: any) => setNewUserData((p) => ({ ...p, role: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LECTURER">Lecturer</SelectItem>
                      <SelectItem value="ADMIN">Department Admin</SelectItem>
                      <SelectItem value="SUPERADMIN">Platform Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Assign Institution</Label>
                <Select
                  value={newUserData.institutionId}
                  onValueChange={(v) => setNewUserData((p) => ({ ...p, institutionId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Institution" />
                  </SelectTrigger>
                  <SelectContent>
                    {institutions.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name} ({i.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Assign Department</Label>
                <Select
                  value={newUserData.departmentId}
                  onValueChange={(v) => setNewUserData((p) => ({ ...p, departmentId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Initial Password <span className="text-destructive">*</span></Label>
                <Input
                  type="password"
                  value={newUserData.password}
                  onChange={(e) => setNewUserData((p) => ({ ...p, password: e.target.value }))}
                  placeholder="Min 6 characters"
                  required
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setAddUserOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Creating...' : 'Create User'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------- MODAL: Manage User (Role / Institution / Password) ---------- */}
      <Dialog open={!!editUserTarget} onOpenChange={(open) => !open && setEditUserTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage User: {editUserTarget?.name}</DialogTitle>
            <DialogDescription>
              Update platform permissions, assign institution or reset password.
            </DialogDescription>
          </DialogHeader>

          {editUserTarget && (
            <div className="space-y-4 pt-2">
              <div className="space-y-1">
                <Label className="text-xs">Full Name</Label>
                <Input
                  value={editUserData.name}
                  onChange={(e) => setEditUserData((p) => ({ ...p, name: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Academic Title</Label>
                  <Input
                    value={editUserData.title}
                    onChange={(e) => setEditUserData((p) => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. Senior Lecturer"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Role</Label>
                  <Select
                    value={editUserData.role}
                    onValueChange={(v: any) => setEditUserData((p) => ({ ...p, role: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LECTURER">Lecturer</SelectItem>
                      <SelectItem value="ADMIN">Department Admin</SelectItem>
                      <SelectItem value="SUPERADMIN">Platform Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Assigned Institution</Label>
                <Select
                  value={editUserData.institutionId}
                  onValueChange={(v) => setEditUserData((p) => ({ ...p, institutionId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Institution" />
                  </SelectTrigger>
                  <SelectContent>
                    {institutions.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name} ({i.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Assigned Department</Label>
                <Select
                  value={editUserData.departmentId}
                  onValueChange={(v) => setEditUserData((p) => ({ ...p, departmentId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="p-3 rounded-xl border bg-muted/30 space-y-2">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-primary" />
                  Reset Password (leave empty to keep current)
                </Label>
                <Input
                  type="password"
                  placeholder="Enter new password (optional)"
                  value={editUserData.password}
                  onChange={(e) => setEditUserData((p) => ({ ...p, password: e.target.value }))}
                />
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button variant="outline" onClick={() => setEditUserTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateUser} disabled={saving}>
              {saving ? 'Updating...' : 'Save User Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- MODAL: Provision New Institution ---------- */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Provision New Institution</DialogTitle>
            <DialogDescription>
              Create a tenant profile with tailored quotas and academic policies.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateInstitution} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="inst-name" className="text-xs">
                  Institution Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="inst-name"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Kwame Nkrumah University of Science & Tech"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="inst-code" className="text-xs">
                  Institutional Code / Acronym <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="inst-code"
                  value={formData.code}
                  onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                  placeholder="e.g. KNUST"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="inst-slug" className="text-xs">
                  Subdomain / Slug <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="inst-slug"
                  value={formData.slug}
                  onChange={(e) => setFormData((p) => ({ ...p, slug: e.target.value.toLowerCase() }))}
                  placeholder="e.g. knust"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="inst-plan" className="text-xs">
                  Subscription Plan Tier
                </Label>
                <Select
                  value={formData.plan}
                  onValueChange={(v: any) => setFormData((p) => ({ ...p, plan: v }))}
                >
                  <SelectTrigger id="inst-plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRIAL">Trial / Free Pilot</SelectItem>
                    <SelectItem value="FACULTY">Faculty Tier</SelectItem>
                    <SelectItem value="CAMPUS_ANNUAL">Campus Annual</SelectItem>
                    <SelectItem value="ENTERPRISE">Enterprise Sovereign</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="inst-term" className="text-xs">
                  Academic Calendar Model
                </Label>
                <Select
                  value={formData.termSystem}
                  onValueChange={(v: any) => setFormData((p) => ({ ...p, termSystem: v }))}
                >
                  <SelectTrigger id="inst-term">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SEMESTER">Semester System (S1, S2)</SelectItem>
                    <SelectItem value="TRIMESTER">Trimester System (T1, T2, T3)</SelectItem>
                    <SelectItem value="QUARTER">Quarter System</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="inst-students" className="text-xs">
                  Max Students Quota
                </Label>
                <Input
                  id="inst-students"
                  type="number"
                  value={formData.maxStudents}
                  onChange={(e) => setFormData((p) => ({ ...p, maxStudents: Number(e.target.value) }))}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="inst-courses" className="text-xs">
                  Max Courses Limit
                </Label>
                <Input
                  id="inst-courses"
                  type="number"
                  value={formData.maxCourses}
                  onChange={(e) => setFormData((p) => ({ ...p, maxCourses: Number(e.target.value) }))}
                />
              </div>

              <div className="col-span-2 space-y-1">
                <Label htmlFor="inst-email" className="text-xs">
                  Contact / Administrative Email
                </Label>
                <Input
                  id="inst-email"
                  type="email"
                  value={formData.contactEmail}
                  onChange={(e) => setFormData((p) => ({ ...p, contactEmail: e.target.value }))}
                  placeholder="ict-admin@institution.edu"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Provisioning...' : 'Provision Institution'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ---------- MODAL: Adjust Policies & Quotas (The Zero-Code Customizer) ---------- */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Configure Policies: {editTarget?.name}</DialogTitle>
            <DialogDescription>
              Changes take effect dynamically for all lecturers, courses, and sessions under this institution.
            </DialogDescription>
          </DialogHeader>

          {editTarget && (
            <div className="space-y-5 py-2 max-h-[70vh] overflow-y-auto pr-1">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Institution Name</Label>
                  <Input
                    value={editTarget.name}
                    onChange={(e) => setEditTarget({ ...editTarget, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Institutional Code</Label>
                  <Input
                    value={editTarget.code}
                    onChange={(e) => setEditTarget({ ...editTarget, code: e.target.value.toUpperCase() })}
                  />
                </div>
              </div>

              {/* Commercial Quotas & Plan */}
              <div className="rounded-xl border bg-accent/20 p-4 space-y-3">
                <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                  Subscription & Capacity Quotas
                </h4>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Plan Tier</Label>
                    <Select
                      value={editTarget.plan}
                      onValueChange={(v: any) => setEditTarget({ ...editTarget, plan: v })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TRIAL">Trial / Pilot</SelectItem>
                        <SelectItem value="FACULTY">Faculty Tier</SelectItem>
                        <SelectItem value="CAMPUS_ANNUAL">Campus Annual</SelectItem>
                        <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Student Capacity</Label>
                    <Input
                      type="number"
                      value={editTarget.maxStudents}
                      onChange={(e) =>
                        setEditTarget({ ...editTarget, maxStudents: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Course Limit</Label>
                    <Input
                      type="number"
                      value={editTarget.maxCourses}
                      onChange={(e) =>
                        setEditTarget({ ...editTarget, maxCourses: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Academic Regulation Policies */}
              <div className="rounded-xl border bg-accent/20 p-4 space-y-4">
                <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                  Academic Regulation & Exam Rules
                </h4>

                <div className="space-y-1">
                  <Label className="text-xs">Academic Calendar System</Label>
                  <Select
                    value={editTarget.termSystem}
                    onValueChange={(v: any) => setEditTarget({ ...editTarget, termSystem: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SEMESTER">Semester System (Semester 1 / Semester 2)</SelectItem>
                      <SelectItem value="TRIMESTER">Trimester System (Trimester 1 / 2 / 3)</SelectItem>
                      <SelectItem value="QUARTER">Quarter System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <Label>Exam Clearance Threshold (75% Rule)</Label>
                    <span className="font-bold text-primary">{editTarget.atRiskThreshold}%</span>
                  </div>
                  <Slider
                    value={[editTarget.atRiskThreshold]}
                    min={50}
                    max={95}
                    step={5}
                    onValueChange={([val]) => setEditTarget({ ...editTarget, atRiskThreshold: val })}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Students below this percentage will be marked "At Risk / Ineligible for Exams".
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <Label>Latecomer Grace Period</Label>
                    <span className="font-bold text-amber-600">{editTarget.lateGraceMinutes} mins</span>
                  </div>
                  <Slider
                    value={[editTarget.lateGraceMinutes]}
                    min={0}
                    max={45}
                    step={5}
                    onValueChange={([val]) => setEditTarget({ ...editTarget, lateGraceMinutes: val })}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Minutes after scheduled class start before a student's check-in is logged as LATE.
                  </p>
                </div>
              </div>

              {/* Edge AI Biometric Configuration */}
              <div className="rounded-xl border bg-accent/20 p-4 space-y-3">
                <h4 className="font-semibold text-xs text-muted-foreground uppercase tracking-wider">
                  Edge AI Biometric Verification
                </h4>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <Label>Face Match Distance Margin (Sensitivity)</Label>
                    <span className="font-bold text-purple-600">
                      {editTarget.confidenceThreshold.toFixed(2)}
                    </span>
                  </div>
                  <Slider
                    value={[Math.round(editTarget.confidenceThreshold * 100)]}
                    min={35}
                    max={65}
                    step={1}
                    onValueChange={([val]) =>
                      setEditTarget({ ...editTarget, confidenceThreshold: val / 100 })
                    }
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Strict (0.35 — High Security)</span>
                    <span>Standard (0.48)</span>
                    <span>Relaxed (0.65 — Low Light)</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Allowed Attendance Scanning Modes</Label>
                  <Select
                    value={editTarget.allowedModes}
                    onValueChange={(v: any) => setEditTarget({ ...editTarget, allowedModes: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Modes (Walkthrough & Kiosk)</SelectItem>
                      <SelectItem value="WALKTHROUGH_ONLY">Walkthrough Only (Lecturer mobile)</SelectItem>
                      <SelectItem value="KIOSK_ONLY">Kiosk Only (Doorway tablets)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdatePolicies} disabled={saving} className="gap-2">
              {saving ? 'Applying...' : 'Apply Policies Live'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- MODAL: Outbox Logs Audit ---------- */}
      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Global Outbox & Notification Logs</DialogTitle>
            <DialogDescription>
              Real-time audit log of all class reminders, welcome alerts, and system notices.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto space-y-2 py-2">
            {loadingLogs ? (
              <LoadingBlock label="Loading email logs..." />
            ) : logs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                No notification logs recorded yet.
              </p>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border p-3 bg-card flex items-start justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{log.to}</span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px]',
                          log.status === 'SENT'
                            ? 'text-emerald-600 border-emerald-600/30'
                            : log.status === 'SIMULATED'
                            ? 'text-amber-600 border-amber-600/30'
                            : 'text-destructive border-destructive/30'
                        )}
                      >
                        {log.status}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-0.5">{log.subject}</p>
                    <p className="text-[10px] text-muted-foreground/70 font-mono mt-1">
                      Type: {log.type} · {new Date(log.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
