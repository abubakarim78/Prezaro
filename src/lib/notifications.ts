// ============================================================
// Prezaro — Mobile PWA & Browser Notifications
// Supports native Web Notifications API + Service Worker push + vibration
// ============================================================

import type { ClassSchedule } from './types'

const NOTIFIED_KEY_PREFIX = 'prezaro.notified_classes.'

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false
  try {
    const perm = await Notification.requestPermission()
    return perm === 'granted'
  } catch {
    return false
  }
}

export async function showLocalNotification(
  title: string,
  options?: NotificationOptions & { vibrate?: number[] }
): Promise<boolean> {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return false
  }

  // Trigger device vibration if supported (great for mobile)
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(options?.vibrate || [200, 100, 200])
    } catch {
      // ignore
    }
  }

  // Try service worker notification first (better on mobile Android/PWA)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, {
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          ...options,
        })
        return true
      }
    } catch {
      // fallback to new Notification
    }
  }

  // Fallback to desktop / standard Notification
  try {
    new Notification(title, {
      icon: '/icon-192.png',
      ...options,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Check if a class schedule needs an immediate notification on this device.
 * Returns the schedule if it is due and hasn't been notified today.
 */
export function checkUpcomingClass(
  schedules: ClassSchedule[]
): { schedule: ClassSchedule; minutesLeft: number; isOngoing: boolean } | null {
  if (typeof window === 'undefined') return null

  const now = new Date()
  const jsDay = now.getDay()
  const currentDayOfWeek = jsDay === 0 ? 7 : jsDay // 1=Mon .. 7=Sun
  const todayDateStr = now.toISOString().slice(0, 10) // YYYY-MM-DD
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const storageKey = `${NOTIFIED_KEY_PREFIX}${todayDateStr}`
  let notifiedSet = new Set<string>()
  try {
    const raw = localStorage.getItem(storageKey)
    if (raw) notifiedSet = new Set(JSON.parse(raw))
  } catch {
    // ignore
  }

  for (const s of schedules) {
    if (s.dayOfWeek !== currentDayOfWeek) continue

    const [startH, startM] = s.startTime.split(':').map(Number)
    const [endH, endM] = s.endTime.split(':').map(Number)
    const startMins = startH * 60 + startM
    const endMins = endH * 60 + endM

    const isOngoing = currentMinutes >= startMins && currentMinutes < endMins
    const minutesLeft = startMins - currentMinutes

    const lead = s.reminderLeadMinutes || 30

    // If starting soon within lead window and hasn't been alerted yet today
    if ((isOngoing || (minutesLeft > 0 && minutesLeft <= lead)) && !notifiedSet.has(s.id)) {
      // Mark as notified in storage
      notifiedSet.add(s.id)
      try {
        localStorage.setItem(storageKey, JSON.stringify(Array.from(notifiedSet)))
      } catch {
        // ignore
      }

      return { schedule: s, minutesLeft, isOngoing }
    }
  }

  return null
}
