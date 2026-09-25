'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAppStore, type ViewName } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  Home,
  Users,
  ScanFace,
  History,
  MoreHorizontal,
  BarChart3,
  CalendarDays,
  ShieldCheck,
  Settings,
  WifiOff,
  CloudUpload,
  LogOut,
  Download,
  Smartphone,
  Building2,
  Globe2,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { FaceScanMark } from '@/components/brand/face-scan-mark'
import { BrandIcon } from '@/components/brand/brand-logo'
import { api, clearAuthToken } from '@/lib/api'
import { clearCachedUser } from '@/lib/session-cache'
import { pendingCount } from '@/lib/offline'
import { toast } from 'sonner'

const NAV: { view: ViewName; label: string; icon: typeof Home }[] = [
  { view: 'home', label: 'Home', icon: Home },
  { view: 'schedule', label: 'Timetable', icon: CalendarDays },
  { view: 'students', label: 'Students', icon: Users },
  { view: 'sessions', label: 'Sessions', icon: History },
  { view: 'reports', label: 'Reports', icon: BarChart3 },
]

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, view, navigate, online, pendingSync, setPendingSync, setUser, replace, openSession } =
    useAppStore()
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallEvt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    setPendingSync(pendingCount())
  }, [setPendingSync])

  if (!user) return null

  // Super admin is platform-only: no attendance surfaces anywhere in the shell.
  const isSuperAdmin = user.role === 'SUPERADMIN'
  const sidebarNav = isSuperAdmin ? NAV.filter((n) => n.view === 'home') : NAV

  const logout = async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' })
    } catch {
      // ignore
    }
    clearAuthToken()
    clearCachedUser()
    setUser(null)
    replace('login')
    toast('Signed out')
  }

  const tryInstall = async () => {
    if (!installEvt) {
      toast.info('Use your browser menu → “Add to Home Screen” to install.')
      return
    }
    await installEvt.prompt()
    setInstallEvt(null)
  }

  const navTo = (v: ViewName) => {
    setMoreOpen(false)
    navigate(v)
  }

  const goScan = () => {
    if (openSession) {
      navigate('scan', { courseId: openSession.courseId, sessionId: openSession.id })
    } else {
      navigate('scan')
    }
  }

  return (
    <div className="min-h-dvh flex bg-background">
      {/* ---------- Desktop sidebar ---------- */}
      <aside className="hidden lg:flex w-64 flex-col border-r bg-sidebar sticky top-0 h-dvh">
        <div className="flex items-center gap-2.5 px-5 h-16 border-b">
          <BrandIcon className="h-9 w-9 shadow-sm" />
          <div className="leading-tight">
            <p className="font-semibold tracking-tight">Prezaro</p>
            <p className="text-[11px] text-muted-foreground">Face attendance</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {sidebarNav.map(({ view: v, label, icon: Icon }) => (
            <button
              key={v}
              onClick={() => navigate(v)}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl px-3 h-11 text-sm font-medium transition-colors min-h-11',
                view === v
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground'
              )}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </button>
          ))}
          {(user.role === 'ADMIN' || (isSuperAdmin && user.departmentId)) && (
            <button
              onClick={() => navigate('admin')}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl px-3 h-11 text-sm font-medium transition-colors',
                view === 'admin'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground'
              )}
            >
              <ShieldCheck className="h-[18px] w-[18px]" />
              Department Admin
            </button>
          )}
          {user.role === 'SUPERADMIN' && (
            <button
              onClick={() => navigate('platform')}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl px-3 h-11 text-sm font-medium transition-colors',
                view === 'platform'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground'
              )}
            >
              <Globe2 className="h-[18px] w-[18px]" />
              Platform Admin
            </button>
          )}
          {isSuperAdmin && (
            <button
              onClick={() => navigate('settings')}
              className={cn(
                'w-full flex items-center gap-3 rounded-xl px-3 h-11 text-sm font-medium transition-colors min-h-11',
                view === 'settings'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground'
              )}
            >
              <Settings className="h-[18px] w-[18px]" />
              Settings
            </button>
          )}
        </nav>

        <div className="p-3 border-t">
          {!isSuperAdmin && (
            <div className="rounded-xl bg-accent/60 p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-accent-foreground">
                <ScanFace className="h-4 w-4" />
                {openSession ? 'Attendance in progress' : 'Ready to take attendance'}
              </div>
              <button
                onClick={goScan}
                className="mt-2 w-full h-9 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                {openSession ? 'Resume scan' : 'Start scan'}
              </button>
            </div>
          )}
          <div className={cn('flex items-center gap-3 px-2 pb-1', !isSuperAdmin && 'mt-3')}>
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {user.title ? `${user.title} · ` : ''}
                {user.departmentName ?? 'No department'}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="h-9 w-9 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground" aria-label="Account menu">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs text-muted-foreground">{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('settings')}>
                  <Settings className="h-4 w-4" /> Settings
                </DropdownMenuItem>
                {(user.role === 'ADMIN' || user.role === 'SUPERADMIN') && (
                  <DropdownMenuItem onClick={() => navigate('admin')}>
                    <ShieldCheck className="h-4 w-4" /> Department Admin
                  </DropdownMenuItem>
                )}
                {user.role === 'SUPERADMIN' && (
                  <DropdownMenuItem onClick={() => navigate('platform')}>
                    <Globe2 className="h-4 w-4" /> Platform Admin
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={tryInstall}>
                  <Download className="h-4 w-4" /> Install app
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 bg-background/85 backdrop-blur border-b pt-safe">
          <div className="h-14 flex items-center gap-3 px-4">
            <BrandIcon className="h-8 w-8 shadow-sm" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="font-semibold tracking-tight text-sm">Prezaro</p>
              <p className="text-[10px] text-muted-foreground truncate">
                {user.departmentName ?? 'Set up your department'}
              </p>
            </div>
            {(!online || pendingSync > 0) && (
              <div
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold',
                  online ? 'bg-amber-500/15 text-amber-600' : 'bg-destructive/10 text-destructive'
                )}
              >
                {online ? <CloudUpload className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                {online ? `Sync ${pendingSync}` : 'Offline'}
              </div>
            )}
            {!isSuperAdmin && (
              <button
                onClick={() => navigate('schedule')}
                className="h-9 w-9 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground"
                aria-label="Class Timetable"
              >
                <CalendarDays className="h-[18px] w-[18px]" />
              </button>
            )}
            <button
              onClick={() => navigate('settings')}
              className="h-9 w-9 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground"
              aria-label="Settings"
            >
              <Settings className="h-[18px] w-[18px]" />
            </button>
          </div>
        </header>

        <main className="flex-1 pb-24 lg:pb-10">{children}</main>
      </div>

      {/* ---------- Mobile bottom nav ---------- */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-background/92 backdrop-blur-lg border-t pb-safe">
        <div
          className={cn(
            'grid h-16 max-w-lg mx-auto items-center',
            isSuperAdmin ? 'grid-cols-4' : 'grid-cols-5'
          )}
        >
          {NAV.slice(0, isSuperAdmin ? 1 : 2).map(({ view: v, label, icon: Icon }) => (
            <NavTab key={v} active={view === v} label={label} onClick={() => navigate(v)}>
              <Icon className="h-[22px] w-[22px]" />
            </NavTab>
          ))}

          {!isSuperAdmin && (
            <div className="flex justify-center">
              <button
                onClick={goScan}
                className="-mt-6 flex h-14 w-14 flex-col items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background transition-transform active:scale-95"
                aria-label="Take attendance"
              >
                <FaceScanMark className="h-6 w-6" />
              </button>
            </div>
          )}

          {!isSuperAdmin && (
            <NavTab active={view === 'sessions'} label="Sessions" onClick={() => navigate('sessions')}>
              <History className="h-[22px] w-[22px]" />
            </NavTab>
          )}

          {isSuperAdmin && (
            <NavTab active={view === 'platform'} label="Platform" onClick={() => navTo('platform')}>
              <Globe2 className="h-[22px] w-[22px]" />
            </NavTab>
          )}
          {isSuperAdmin && (
            <NavTab active={view === 'settings'} label="Settings" onClick={() => navTo('settings')}>
              <Settings className="h-[22px] w-[22px]" />
            </NavTab>
          )}

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button className="h-16 flex flex-col items-center justify-center gap-1 text-muted-foreground" aria-label="More">
                <MoreHorizontal className="h-[22px] w-[22px]" />
                <span className="text-[10px] font-medium">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-3xl pb-safe">
              <SheetHeader className="text-left">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                      {initials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  {user.name}
                </SheetTitle>
              </SheetHeader>
              <div className="px-4 pb-6 space-y-1.5">
                {!isSuperAdmin && (
                  <MoreItem icon={CalendarDays} label="Class Timetable" onClick={() => navTo('schedule')} />
                )}
                {(user.role === 'ADMIN' || (isSuperAdmin && user.departmentId)) && (
                  <MoreItem icon={ShieldCheck} label="Department dashboard" onClick={() => navTo('admin')} />
                )}
                {!isSuperAdmin && <MoreItem icon={BarChart3} label="Reports" onClick={() => navTo('reports')} />}
                {!isSuperAdmin && <MoreItem icon={Settings} label="Settings" onClick={() => navTo('settings')} />}
                <MoreItem icon={Smartphone} label="Install app on device" onClick={tryInstall} />
                <MoreItem icon={LogOut} label="Sign out" onClick={logout} destructive />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </div>
  )
}

function NavTab({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'h-16 flex flex-col items-center justify-center gap-1 transition-colors',
        active ? 'text-primary' : 'text-muted-foreground'
      )}
    >
      {children}
      <span className={cn('text-[10px]', active ? 'font-semibold' : 'font-medium')}>{label}</span>
    </button>
  )
}

function MoreItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: typeof Home
  label: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 rounded-xl px-4 h-12 text-sm font-medium transition-colors min-h-12',
        destructive
          ? 'text-destructive hover:bg-destructive/10'
          : 'hover:bg-accent text-foreground'
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
      {label}
    </button>
  )
}
