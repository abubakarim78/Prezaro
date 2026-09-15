'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import {
  Building2,
  ChevronDown,
  Eye,
  Footprints,
  Monitor,
  MonitorSmartphone,
  Moon,
  Package,
  Pencil,
  ShieldCheck,
  Smartphone,
  Sun,
  UserRound,
} from 'lucide-react'
import type { AppSettings, LoginResponse, SettingsResponse } from '@/lib/types'
import { api, getErrorMessage } from '@/lib/api'
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
    desc: 'Start a session and walk through with your phone, or let students check in at a kiosk with face, QR or PIN.',
  },
  {
    title: 'Review & export',
    desc: 'Check the list, mark late arrivals, finalize the session and download the CSV.',
  },
]

const PRIVACY_POINTS = [
  'We store a numeric face template — never a photo.',
  'Templates are used for one thing only: marking attendance.',
  'Students can opt out of face check-in at any time and use a QR code or PIN instead — no penalty, no questions asked.',
  'Lecturers can delete any student’s face template from their profile in one tap.',
  'Face templates never leave your department’s devices and servers.',
]

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
    setUser(null)
    replace('login')
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

        {/* ---------- Account ---------- */}
        <section className="rounded-2xl border bg-card p-4 sm:p-6" aria-label="Account">
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
    </div>
  )
}
