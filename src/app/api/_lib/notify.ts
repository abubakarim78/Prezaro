// ============================================================
// Prezaro — in-app notification emitter (server-only)
// Fire-and-forget helpers: notification failures must NEVER
// break the request that produced the activity, so every call
// swallows its own errors.
// ============================================================
import { db } from '@/lib/db'
import type { NotificationType } from '@/lib/types'

export interface NotifyInput {
  type: NotificationType
  title: string
  body: string
  /** Client view-router view to open when the notification is tapped. */
  view?: string
  /** View params for the deep link. */
  params?: Record<string, string>
}

/** Create one notification row per recipient (deduplicated). */
export async function notifyUsers(
  userIds: (string | null | undefined)[],
  input: NotifyInput,
): Promise<void> {
  const recipients = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))))
  if (recipients.length === 0) return
  try {
    await db.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        view: input.view ?? null,
        paramsJson: JSON.stringify(input.params ?? {}),
      })),
    })
  } catch (err) {
    console.error('[notify] failed to create notifications:', err)
  }
}

/**
 * Everyone who should hear about activity in a school: the Dean
 * (school-homed) plus the HoD (ADMIN) of every department in the school.
 */
export async function schoolAudience(schoolId: string | null | undefined): Promise<string[]> {
  if (!schoolId) return []
  try {
    const users = await db.user.findMany({
      where: {
        OR: [{ schoolId }, { department: { schoolId } }],
        role: { in: ['DEAN', 'ADMIN'] },
      },
      select: { id: true },
    })
    return users.map((u) => u.id)
  } catch (err) {
    console.error('[notify] failed to resolve school audience:', err)
    return []
  }
}

/** HoDs (ADMIN) of the given departments. */
export async function departmentAdmins(
  departmentIds: (string | null | undefined)[],
): Promise<string[]> {
  const ids = Array.from(new Set(departmentIds.filter((id): id is string => Boolean(id))))
  if (ids.length === 0) return []
  try {
    const users = await db.user.findMany({
      where: { departmentId: { in: ids }, role: 'ADMIN' },
      select: { id: true },
    })
    return users.map((u) => u.id)
  } catch (err) {
    console.error('[notify] failed to resolve department admins:', err)
    return []
  }
}

/** Institution-level admins (DEAN + ADMIN) — used for policy change alerts. */
export async function institutionAdmins(
  institutionId: string | null | undefined,
): Promise<string[]> {
  if (!institutionId) return []
  try {
    const users = await db.user.findMany({
      where: {
        role: { in: ['DEAN', 'ADMIN'] },
        OR: [
          { institutionId },
          { department: { institutionId } },
          { school: { institutionId } },
        ],
      },
      select: { id: true },
    })
    return users.map((u) => u.id)
  } catch (err) {
    console.error('[notify] failed to resolve institution admins:', err)
    return []
  }
}
