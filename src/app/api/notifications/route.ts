import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handle, requireUser } from '../_lib/helpers'
import type { NotificationItem, NotificationsResponse } from '@/lib/types'

const MAX_ITEMS = 50

/** Latest notifications for the signed-in user + unread badge count. */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)

    const [rows, unread] = await Promise.all([
      db.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: MAX_ITEMS,
      }),
      db.notification.count({ where: { userId: user.id, readAt: null } }),
    ])

    const notifications: NotificationItem[] = rows.map((n) => {
      let params: Record<string, string> = {}
      try {
        const parsed: unknown = JSON.parse(n.paramsJson)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          params = parsed as Record<string, string>
        }
      } catch {
        // malformed params are ignored
      }
      return {
        id: n.id,
        type: n.type as NotificationItem['type'],
        title: n.title,
        body: n.body,
        view: n.view,
        params,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      }
    })

    const body: NotificationsResponse = { notifications, unreadCount: unread }
    return NextResponse.json(body)
  })
}
