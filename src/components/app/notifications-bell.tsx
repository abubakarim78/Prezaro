'use client'

import { useState } from 'react'
import {
  Bell,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  GraduationCap,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserPlus,
} from 'lucide-react'
import type { NotificationItem, NotificationType } from '@/lib/types'
import type { ViewName } from '@/lib/store'
import { useAppStore } from '@/lib/store'
import { useNotifications } from '@/lib/use-notifications'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'

const TYPE_META: Record<NotificationType, { icon: typeof Bell; className: string }> = {
  ENROLLMENT_SUBMITTED: { icon: UserPlus, className: 'bg-amber-500/10 text-amber-600' },
  ENROLLMENT_DECIDED: { icon: CheckCircle2, className: 'bg-emerald-500/10 text-emerald-600' },
  SLICE_DECIDED: { icon: UserCheck, className: 'bg-blue-500/10 text-blue-600' },
  STAFF_JOINED: { icon: UserCheck, className: 'bg-emerald-500/10 text-emerald-600' },
  ROLE_UPDATED: { icon: ShieldCheck, className: 'bg-indigo-500/10 text-indigo-600' },
  STUDENT_ENROLLED: { icon: GraduationCap, className: 'bg-primary/10 text-primary' },
  CLASS_REMINDER: { icon: CalendarDays, className: 'bg-amber-500/10 text-amber-600' },
  POLICY_UPDATED: { icon: SlidersHorizontal, className: 'bg-purple-500/10 text-purple-600' },
}

// Only navigate for views that actually exist in the single-route shell.
const VIEWS = new Set<string>([
  'login',
  'onboarding',
  'courses',
  'home',
  'students',
  'student',
  'enroll',
  'scan',
  'review',
  'sessions',
  'session',
  'reports',
  'admin',
  'school',
  'settings',
  'schedule',
  'platform',
])

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(iso).toLocaleDateString()
}

/**
 * Bell with unread badge + in-app notification panel. Reads the shared
 * polling hook, so one poller serves every bell instance on screen.
 */
export function NotificationsBell() {
  const { navigate } = useAppStore()
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)

  const openNotification = (n: NotificationItem) => {
    if (!n.readAt) void markRead(n.id)
    setOpen(false)
    if (n.view && VIEWS.has(n.view)) {
      navigate(n.view as ViewName, n.params ?? {})
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          aria-label="Notifications"
          className="relative h-9 w-9 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[92vw] max-w-[92vw] p-0 sm:w-96">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs font-semibold text-primary"
              onClick={() => void markAllRead()}
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-[60dvh] overflow-y-auto scrollbar-thin sm:max-h-96">
          {notifications.length === 0 ? (
            <div className="space-y-1 px-4 py-10 text-center">
              <Bell className="mx-auto h-6 w-6 text-muted-foreground/60" />
              <p className="text-sm font-medium">You&apos;re all caught up</p>
              <p className="text-xs text-muted-foreground">
                Enrollment requests, staff changes and policy updates land here.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => {
                const meta = TYPE_META[n.type] ?? TYPE_META.ROLE_UPDATED
                const Icon = meta.icon

                return (
                  <button
                    key={n.id}
                    onClick={() => openNotification(n)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50',
                      !n.readAt && 'bg-primary/[0.03]'
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        meta.className
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">{n.title}</span>
                        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                          {relativeTime(n.createdAt)}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                        {n.body}
                      </span>
                    </span>
                    {!n.readAt && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
