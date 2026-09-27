'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { NotificationItem, NotificationsResponse } from '@/lib/types'

/**
 * In-app notifications for the signed-in user.
 *
 * Polls `GET /api/notifications` every 30s and on window focus; emission
 * happens server-side (see src/app/api/_lib/notify.ts), this hook only
 * reads and marks. Marking is optimistic — the next poll reconciles.
 */
export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const aliveRef = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const res = await api<NotificationsResponse>('/api/notifications')
      if (!aliveRef.current) return
      setNotifications(res.notifications)
      setUnreadCount(res.unreadCount)
    } catch {
      // Silent — the bell is a background surface, never nag about it.
    } finally {
      if (aliveRef.current) setLoaded(true)
    }
  }, [])

  useEffect(() => {
    aliveRef.current = true
    void refresh()
    const interval = setInterval(() => void refresh(), 30_000)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      aliveRef.current = false
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [refresh])

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n))
    )
    setUnreadCount((c) => Math.max(0, c - 1))
    try {
      await api('/api/notifications/read', { method: 'POST', body: { id } })
    } catch {
      // optimistic — next poll reconciles
    }
  }, [])

  const markAllRead = useCallback(async () => {
    setNotifications((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() }))
    )
    setUnreadCount(0)
    try {
      await api('/api/notifications/read', { method: 'POST', body: { all: true } })
    } catch {
      // optimistic — next poll reconciles
    }
  }, [])

  return { notifications, unreadCount, loaded, markRead, markAllRead, refresh }
}
