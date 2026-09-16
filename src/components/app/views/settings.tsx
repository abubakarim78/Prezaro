'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from 'next-themes'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  Building2,
  ChevronDown,
  Eye,
  Footprints,
  KeyRound,
  Loader2,
  Mail,
  Monitor,
  MonitorSmartphone,
  Moon,
  Package,
  Pencil,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Sun,
  UserRound,
} from 'lucide-react'
import type {
  AppSettings,
  EmailLogItem,
  EmailsResponse,
  LoginResponse,
  SettingsResponse,
  TestEmailResponse,
} from '@/lib/types'
import { api, getErrorMessage, clearAuthToken } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { IdentityAvatar, LoadingBlock } from '@/components/app/shared'

const DEFAULTS: AppSettings = { atRiskThreshold: 75, liveness: true, defaultMode: 'WALKTHROUGH' }

const MODE_OPTIONS: { value: 'WALKTHROUGH' | 'KIOSK'; label: string; desc: string; icon: typeof Footprints }[] = [
  {
    value: 'WALKTHROUGH',
    label: 'Walkthrough',
    desc: 'Walk the room with your phone — faces check in as you pass.',
    icon: Footprints,
  },
  {
    value: 'KIOSK',
    label: 'Kiosk',
    desc: 'Students walk past a fixed tablet at the door and check themselves in.',
    icon: MonitorSmartphone,
  },
]

const THEME_OPTIONS: { value: 'light' | 'dark' | 'system'; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

const SCAN_STEPS = [
  {
    title: 'Enroll faces',
    desc: 'Capture a short face scan per student — it becomes a numeric template, not a photo.',
  },
  {
    title: 'Scan the room',
    desc: 'Start a session and walk through the hall — faces are matched on-device in seconds.',
  },
  {
    title: 'Review & export',
    desc: 'Check the list, mark late arrivals, finalize the session and download the CSV.',
  },
]

const PRIVACY_POINTS = [
  'We store a numeric face template — never a photo.',
  'Templates are used for one thing only: marking attendance.',
  'Students who prefer not to enrol can still be marked present manually during review.',
  'Lecturers can delete any student’s face template from their profile in one tap.',
  'Face templates never leave your department’s devices and servers.',
]

const EMAIL_TYPE_LABEL: Record<string, string> = {
  WELCOME: 'Welcome',
  ACCOUNT_ALERT: 'Account alert',
  STUDENT_REGISTERED: 'Student registered',
  COURSE_ENROLLMENT: 'Course enrollment',
  TEST: 'Test',
}

const EMAIL_STATUS_STYLE: Record<string, string> = {
  SENT: 'border-emerald-600/20 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400',
  SIMULATED: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  FAILED: 'border-destructive/30 bg-destructive/10 text-destructive',
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function SettingsView() {
  const { user, setUser, replace } = useAppStore()

  // ---- Profile ------------------------------------------------
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  // ---- Attendance settings (autosave) ------------------------
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [threshold, setThreshold] = useState(DEFAULTS.atRiskThreshold)
  const [liveness, setLiveness] = useState(DEFAULTS.liveness)
  const [defaultMode, setDefaultMode] = useState<'WALKTHROUGH' | 'KIOSK'>(DEFAULTS.defaultMode)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const savedRef = useRef<AppSettings | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadSettings = useCallback(async () => {
    setSettingsError(null)
    setSettingsLoaded(false)
    try {
      const d = await api<SettingsResponse>('/api/settings')
      savedRef.current = d.settings
      setThreshold(d.settings.atRiskThreshold)
      setLiveness(d.settings.liveness)
      setDefaultMode(d.settings.defaultMode)
      setSettingsLoaded(true)
    } catch (e) {
      setSettingsError(getErrorMessage(e))
    }
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  // Debounced autosave — only fires when values differ from the last saved snapshot
  useEffect(() => {
    if (!settingsLoaded) return
    const saved = savedRef.current
    if (
      saved &&
      saved.atRiskThreshold === threshold &&
      saved.liveness === liveness &&
      saved.defaultMode === defaultMode
    ) {
      return
    }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        const d = await api<SettingsResponse>('/api/settings', {
          method: 'PUT',
          body: { atRiskThreshold: threshold, liveness, defaultMode },
        })
        savedRef.current = d.settings
        toast.success('Settings saved')
      } catch (e) {
        toast.error(getErrorMessage(e))
      }
    }, 600)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [threshold, liveness, defaultMode, settingsLoaded])

  // ---- Appearance ---------------------------------------------
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // ---- Install ------------------------------------------------
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallEvt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const tryInstall = async () => {
    if (!installEvt) {
      toast.info('Use your browser menu → “Add to Home Screen” to install.')
      return
    }
    await installEvt.prompt()
    setInstallEvt(null)
  }

  // ---- Actions ------------------------------------------------
  const openEdit = () => {
    if (!user) return
    setEditName(user.name)
    setEditTitle(user.title ?? '')
    setEditOpen(true)
  }

  const saveProfile = async () => {
    setSavingProfile(true)
    try {
      const d = await api<LoginResponse>('/api/profile', {
        method: 'POST',
        body: { name: editName.trim(), title: editTitle.trim() },
      })
      setUser(d.user)
      toast.success('Profile updated')
      setEditOpen(false)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setSavingProfile(false)
    }
  }

  const signOut = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore — clear local session regardless
    }
    clearAuthToken()
    setUser(null)
    replace('login')
  }

  // ---- Change password ----------------------------------------
  const [pwOpen, setPwOpen] = useState(false)
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)

  const changePassword = async () => {
    if (pwSaving) return
    if (pwNew.length < 8) {
      setPwError('New password must be at least 8 characters')
      return
    }
    if (pwNew !== pwConfirm) {
      setPwError('New passwords do not match')
      return
    }
    setPwSaving(true)
    setPwError(null)
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: pwCurrent, newPassword: pwNew },
      })
      toast.success('Password updated')
      setPwOpen(false)
      setPwCurrent('')
      setPwNew('')
      setPwConfirm('')
    } catch (e) {
      setPwError(getErrorMessage(e))
    } finally {
      setPwSaving(false)
    }
  }

  // ---- Email notifications (admin) -----------------------------
  const [emailsLoaded, setEmailsLoaded] = useState(false)
  const [emailsError, setEmailsError] = useState<string | null>(null)
  const [emailConfig, setEmailConfig] = useState<EmailsResponse['config'] | null>(null)
  const [emailLog, setEmailLog] = useState<EmailLogItem[]>([])
  const [emailPreview, setEmailPreview] = useState<EmailLogItem | null>(null)
  const [testSending, setTestSending] = useState(false)

  const loadEmails = useCallback(async () => {
    setEmailsError(null)
    try {
      const d = await api<EmailsResponse>('/api/emails')
      setEmailConfig(d.config)
      setEmailLog(d.emails)
      setEmailsLoaded(true)
    } catch (e) {
      setEmailsError(getErrorMessage(e))
    }
  }, [])

  useEffect(() => {
    if (user?.role !== 'ADMIN') return
    void loadEmails()
  }, [user?.role, loadEmails])

  const sendTest = async () => {
    if (testSending) return
    setTestSending(true)
    try {
      const d = await api<TestEmailResponse>('/api/emails/test', { method: 'POST' })
      if (d.status === 'SENT') toast.success('Test email delivered to your inbox')
      else if (d.status === 'SIMULATED') toast.info('Recorded in the outbox — configure SMTP to deliver for real')
      else toast.error('Delivery failed — open the entry below for details')
      await loadEmails()
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setTestSending(false)
    }
  }

  if (!user) return null

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-start justify-between gap-3 px-4 lg:px-8 pt-5 lg:pt-8 pb-4">
        <div className="min-w-0">
          <h1 className="text-xl lg:text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Profile, attendance &amp; app preferences
          </p>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="px-4 lg:px-8 pb-10 space-y-5"
      >
        {/* ---------- Profile ---------- */}
        <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-label="Profile">
          <div className="flex items-center gap-4">
            <IdentityAvatar name={user.name} className="h-14 w-14" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold tracking-tight">{user.name}</p>
              <p className="truncate text-sm text-muted-foreground">
                {user.title || (user.role === 'ADMIN' ? 'Administrator' : 'Lecturer')}
              </p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 shrink-0"
              onClick={openEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </div>
          <Separator className="my-4" />
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Department</span>
            <span className="ml-auto truncate font-medium">
              {user.departmentName ?? 'Not set'}
            </span>
          </div>
        </section>

        {/* ---------- Attendance ---------- */}
        <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-label="Attendance settings">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold tracking-tight">Attendance</h2>
          </div>

          {!settingsLoaded && !settingsError ? (
            <LoadingBlock label="Loading settings…" />
          ) : settingsError ? (
            <div className="mt-4">
              <p className="text-sm text-destructive">{settingsError}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2 min-h-11"
                onClick={() => void loadSettings()}
              >
                Try again
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-5">
              {/* At-risk threshold */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="at-risk-threshold" className="text-sm font-medium">
                    At-risk threshold
                  </Label>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary tabular-nums">
                    {threshold}%
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Students whose attendance falls below this are flagged in reports.
                </p>
                <Slider
                  id="at-risk-threshold"
                  min={50}
                  max={90}
                  step={1}
                  value={[threshold]}
                  onValueChange={(v) => setThreshold(v[0] ?? threshold)}
                  className="mt-3"
                  aria-label="At-risk threshold percentage"
                />
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>50%</span>
                  <span>90%</span>
                </div>
              </div>

              {/* Liveness */}
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <Label htmlFor="liveness" className="flex items-center gap-1.5 text-sm font-medium">
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                    Liveness check
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Require head-turn check in kiosk mode to stop photo spoofs.
                  </p>
                </div>
                <Switch
                  id="liveness"
                  checked={liveness}
                  onCheckedChange={setLiveness}
                  className="shrink-0"
                />
              </div>

              {/* Default mode */}
              <div>
                <p className="text-sm font-medium">Default scan mode</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Used when you start a new attendance session.
                </p>
                <RadioGroup
                  value={defaultMode}
                  onValueChange={(v) => setDefaultMode(v as 'WALKTHROUGH' | 'KIOSK')}
                  className="mt-2.5 gap-2"
                >
                  {MODE_OPTIONS.map((m) => (
                    <Label
                      key={m.value}
                      htmlFor={`mode-${m.value}`}
                      className={cn(
                        'flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors',
                        defaultMode === m.value
                          ? 'border-primary/40 bg-primary/5'
                          : 'bg-background hover:bg-accent/50'
                      )}
                    >
                      <RadioGroupItem id={`mode-${m.value}`} value={m.value} />
                      <m.icon className="h-4 w-4 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{m.label}</span>
                        <span className="block text-xs font-normal text-muted-foreground">
                          {m.desc}
                        </span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>
            </div>
          )}
        </section>

        {/* ---------- Appearance ---------- */}
        <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-label="Appearance">
          <div className="flex items-center gap-2">
            <Sun className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold tracking-tight">Appearance</h2>
          </div>
          {mounted ? (
            <RadioGroup
              value={theme ?? 'system'}
              onValueChange={setTheme}
              className="mt-3 grid grid-cols-3 gap-2"
            >
              {THEME_OPTIONS.map((t) => (
                <Label
                  key={t.value}
                  htmlFor={`theme-${t.value}`}
                  className={cn(
                    'flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border p-3 transition-colors',
                    (theme ?? 'system') === t.value
                      ? 'border-primary/40 bg-primary/5 text-primary'
                      : 'bg-background hover:bg-accent/50'
                  )}
                >
                  <RadioGroupItem id={`theme-${t.value}`} value={t.value} className="sr-only" />
                  <t.icon className="h-5 w-5" />
                  <span className="text-xs font-medium">{t.label}</span>
                </Label>
              ))}
            </RadioGroup>
          ) : (
            <div className="mt-3 grid h-20 grid-cols-3 gap-2" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-xl bg-muted/60" />
              ))}
            </div>
          )}
        </section>

        {/* ---------- App ---------- */}
        <section className="rounded-2xl border bg-card p-4 sm:p-6 space-y-4" aria-label="App">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold tracking-tight">App</h2>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Install on this device</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Works offline and opens straight to scanning.
              </p>
            </div>
            <Button variant="outline" size="sm" className="min-h-11 shrink-0" onClick={() => void tryInstall()}>
              <Package className="h-3.5 w-3.5" />
              Install
            </Button>
          </div>

          <Separator />

          <Collapsible>
            <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between gap-2 text-left">
              <span className="text-sm font-medium">How scanning works</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-3">
              {SCAN_STEPS.map((s, i) => (
                <div key={s.title} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{s.desc}</p>
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>

          <Separator />

          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Package className="h-3.5 w-3.5" />
            ClassCheck v1.0 · PWA
          </p>
        </section>

        {/* ---------- Data & privacy ---------- */}
        <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-label="Data and privacy">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold tracking-tight">Data &amp; privacy</h2>
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Face data deserves care. Here is exactly what ClassCheck does with it:
          </p>
          <ul className="mt-3 space-y-2.5">
            {PRIVACY_POINTS.map((point) => (
              <li key={point} className="flex gap-2.5 text-sm">
                <span
                  className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60"
                  aria-hidden="true"
                />
                <span className="text-foreground/90">{point}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- Email notifications (admin) ---------- */}
        {user.role === 'ADMIN' && (
          <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-label="Email notifications">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold tracking-tight">Email notifications</h2>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Welcome and registration alerts, sent from your instance.
            </p>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border bg-background p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Delivery mode</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {emailConfig?.smtpConfigured
                    ? `SMTP · ${emailConfig.host}${emailConfig.from ? ` · from ${emailConfig.from}` : ''}`
                    : 'Set SMTP_HOST, SMTP_PORT, SMTP_USER & SMTP_PASS to deliver for real.'}
                </p>
              </div>
              <span
                className={cn(
                  'shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide',
                  emailConfig?.smtpConfigured
                    ? EMAIL_STATUS_STYLE.SENT
                    : EMAIL_STATUS_STYLE.SIMULATED,
                )}
              >
                {emailConfig?.smtpConfigured ? 'LIVE' : 'SIMULATED'}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={testSending}
                onClick={() => void sendTest()}
              >
                {testSending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Send test email
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11"
                onClick={() => void loadEmails()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </Button>
            </div>

            <Separator className="my-4" />
            <p className="text-sm font-medium">Delivery log</p>
            {!emailsLoaded && !emailsError ? (
              <LoadingBlock label="Loading emails…" />
            ) : emailsError ? (
              <div className="mt-2">
                <p className="text-sm text-destructive">{emailsError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 min-h-11"
                  onClick={() => void loadEmails()}
                >
                  Try again
                </Button>
              </div>
            ) : emailLog.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No emails yet — they appear here as accounts and students are registered.
              </p>
            ) : (
              <div className="mt-2 max-h-96 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
                {emailLog.map((mail) => (
                  <button
                    key={mail.id}
                    type="button"
                    onClick={() => setEmailPreview(mail)}
                    className="w-full rounded-xl border bg-background p-3 text-left transition-colors hover:bg-accent/50"
                    aria-label={`Open email: ${mail.subject}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                        {EMAIL_TYPE_LABEL[mail.type] ?? mail.type}
                      </span>
                      <span
                        className={cn(
                          'rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide',
                          EMAIL_STATUS_STYLE[mail.status] ?? '',
                        )}
                      >
                        {mail.status}
                      </span>
                      <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {format(new Date(mail.createdAt), 'MMM d · HH:mm')}
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-sm font-medium">{mail.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">To {mail.to}</p>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* ---------- Account ---------- */}
        <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-label="Account">
          <Button
            variant="outline"
            className="min-h-11 w-full"
            onClick={() => {
              setPwError(null)
              setPwOpen(true)
            }}
          >
            <KeyRound className="h-4 w-4" />
            Change password
          </Button>
          <Separator className="my-4" />
          <Button
            variant="outline"
            className="min-h-11 w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            You will need your email and password to sign back in.
          </p>
        </section>
      </motion.div>

      {/* ---------- Edit profile dialog ---------- */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit profile</DialogTitle>
            <DialogDescription>
              Update how your name appears across ClassCheck.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Full name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-11 rounded-xl"
                placeholder="Dr. Ama Mensah"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="h-11 rounded-xl"
                placeholder="e.g. Senior Lecturer"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="min-h-11" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              className="min-h-11"
              disabled={savingProfile || !editName.trim()}
              onClick={() => void saveProfile()}
            >
              {savingProfile ? 'Saving…' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ---------- Change password dialog ---------- */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>
              Use at least 8 characters. You stay signed in on this device.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pw-current">Current password</Label>
              <Input
                id="pw-current"
                type="password"
                autoComplete="current-password"
                value={pwCurrent}
                onChange={(e) => {
                  setPwCurrent(e.target.value)
                  if (pwError) setPwError(null)
                }}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-new">New password</Label>
              <Input
                id="pw-new"
                type="password"
                autoComplete="new-password"
                value={pwNew}
                onChange={(e) => {
                  setPwNew(e.target.value)
                  if (pwError) setPwError(null)
                }}
                className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-confirm">Confirm new password</Label>
              <Input
                id="pw-confirm"
                type="password"
                autoComplete="new-password"
                value={pwConfirm}
                onChange={(e) => {
                  setPwConfirm(e.target.value)
                  if (pwError) setPwError(null)
                }}
                className="h-11"
              />
            </div>
            {pwError && (
              <p className="text-sm font-medium text-destructive" role="alert">
                {pwError}
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" className="min-h-11" onClick={() => setPwOpen(false)}>
              Cancel
            </Button>
            <Button
              className="min-h-11"
              disabled={pwSaving || !pwCurrent || !pwNew || !pwConfirm}
              onClick={() => void changePassword()}
            >
              {pwSaving ? 'Updating…' : 'Update password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ---------- Email preview dialog ---------- */}
      <Dialog open={emailPreview !== null} onOpenChange={(open) => !open && setEmailPreview(null)}>
        <DialogContent className="max-w-md rounded-2xl p-0">
          <DialogHeader className="space-y-1 border-b px-5 py-4">
            <DialogTitle className="text-base">{emailPreview?.subject}</DialogTitle>
            <DialogDescription className="truncate">
              To {emailPreview?.to} · {emailPreview ? format(new Date(emailPreview.createdAt), 'MMM d, yyyy HH:mm') : ''}
            </DialogDescription>
          </DialogHeader>
          {emailPreview && (
            <iframe
              title="Email preview"
              srcDoc={emailPreview.bodyHtml}
              sandbox=""
              className="h-[380px] w-full rounded-b-2xl border-0 bg-white"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
