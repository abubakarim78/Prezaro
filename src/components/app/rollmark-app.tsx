'use client'

import { useEffect } from 'react'
import { ThemeProvider } from 'next-themes'
import { useAppStore } from '@/lib/store'
import { api, getErrorMessage, clearAuthToken, getAuthToken, setUnauthorizedHandler, OfflineError } from '@/lib/api'
import { flushQueue, pendingCount } from '@/lib/offline'
import { clearCachedUser, readCachedUser, writeCachedUser } from '@/lib/session-cache'
import { toast } from 'sonner'
import { Loader2, RefreshCw, WifiOff } from 'lucide-react'
import { FaceScanMark } from '@/components/brand/face-scan-mark'
import { watchForUpdates } from '@/lib/pwa'

import LoginView from '@/components/app/views/login'
import OnboardingView from '@/components/app/views/onboarding'
import CoursesView from '@/components/app/views/courses'
import HomeView from '@/components/app/views/home'
import StudentsView from '@/components/app/views/students'
import StudentView from '@/components/app/views/student'
import EnrollView from '@/components/app/views/enroll'
import ScanView from '@/components/app/views/scan'
import ReviewView from '@/components/app/views/review'
import SessionsView from '@/components/app/views/sessions'
import SessionView from '@/components/app/views/session'
import ReportsView from '@/components/app/views/reports'
import AdminView from '@/components/app/views/admin'
import SettingsView from '@/components/app/views/settings'
import { AppShell } from '@/components/app/shell'

/** Views rendered full-screen without the nav shell */
const IMMERSIVE_VIEWS = new Set(['login', 'onboarding', 'scan', 'enroll', 'review'])

export default function RollmarkApp() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <RollmarkInner />
    </ThemeProvider>
  )
}

function RollmarkInner() {
  const {
    booted,
    user,
    view,
    setBooted,
    setUser,
    setOnline,
    setPendingSync,
    setOpenSession,
    replace,
  } = useAppStore()

  // ---- Boot: SW registration, connectivity, auth check ----
  useEffect(() => {
    let alive = true

    // PWA updates: when a newly deployed service worker activates, prompt
    // the user to restart so they are running the latest version immediately.
    const unwatchUpdates = watchForUpdates(() => {
      toast('New version ready', {
        description: 'Restart to pick up the latest improvements.',
        icon: <RefreshCw className="h-4 w-4 text-primary" />,
        action: { label: 'Restart', onClick: () => window.location.reload() },
        duration: Infinity,
      })
    })

    const updateOnline = () => {
      const online = navigator.onLine
      setOnline(online)
      if (online) {
        flushQueue()
          .then((n) => {
            if (!alive) return
            setPendingSync(pendingCount())
            if (n > 0) toast.success(`Synced ${n} offline record${n === 1 ? '' : 's'}`)
          })
          .catch(() => {})
      }
    }

    updateOnline()
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)

    // Any 401 means the session is gone — return to the login screen.
    setUnauthorizedHandler(() => {
      const hadUser = useAppStore.getState().user !== null
      clearAuthToken()
      clearCachedUser()
      const s = useAppStore.getState()
      s.setUser(null)
      s.setOpenSession(null)
      s.replace('login')
      if (hadUser) toast.error('Your session has expired — please sign in again')
    })

    ;(async () => {
      try {
        const { user } = await api<{ user: import('@/lib/types').User | null }>('/api/auth/me')
        if (!alive) return
        if (user) {
          setUser(user)
          writeCachedUser(user)
          replace(user.onboarded ? 'home' : 'onboarding')
        } else {
          // No valid session (cookie blocked / token expired) — clean slate.
          clearAuthToken()
          replace('login')
        }
      } catch (e) {
        if (!alive) return
        // Server unreachable: fall back to the cached session when one
        // exists, so attendance keeps working from an offline PWA launch.
        if (e instanceof OfflineError && getAuthToken()) {
          const cached = readCachedUser()
          if (cached) {
            setUser(cached)
            replace(cached.onboarded ? 'home' : 'onboarding')
            toast('Offline — using your saved session', {
              description: `Signed in as ${cached.email}. Attendance marked now syncs once you reconnect.`,
              icon: <WifiOff className="h-4 w-4 text-primary" />,
            })
            return
          }
        }
        replace('login')
        if (!(e instanceof OfflineError)) {
          console.warn(getErrorMessage(e))
        }
      } finally {
        if (alive) setBooted(true)
      }
    })()

    return () => {
      alive = false
      unwatchUpdates()
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
      setUnauthorizedHandler(null)
    }
  }, [setBooted, setUser, setOnline, setPendingSync, replace, setOpenSession])

  if (!booted) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-background">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
          <FaceScanMark className="h-8 w-8" />
        </div>
        <p className="text-sm text-muted-foreground font-medium">Rollmark</p>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/60" />
      </div>
    )
  }

  if (IMMERSIVE_VIEWS.has(view) || !user) {
    switch (view) {
      case 'onboarding':
        return <OnboardingView />
      case 'scan':
        return <ScanView />
      case 'enroll':
        return <EnrollView />
      case 'review':
        return <ReviewView />
      default:
        return <LoginView />
    }
  }

  switch (view) {
    case 'students':
    case 'student':
      return (
        <AppShell>
          {view === 'students' ? <StudentsView /> : <StudentView />}
        </AppShell>
      )
    case 'courses':
      return (
        <AppShell>
          <CoursesView />
        </AppShell>
      )
    case 'sessions':
    case 'session':
      return (
        <AppShell>
          {view === 'sessions' ? <SessionsView /> : <SessionView />}
        </AppShell>
      )
    case 'reports':
      return (
        <AppShell>
          <ReportsView />
        </AppShell>
      )
    case 'admin':
      return (
        <AppShell>
          <AdminView />
        </AppShell>
      )
    case 'settings':
      return (
        <AppShell>
          <SettingsView />
        </AppShell>
      )
    case 'home':
    default:
      return (
        <AppShell>
          <HomeView />
        </AppShell>
      )
  }
}
