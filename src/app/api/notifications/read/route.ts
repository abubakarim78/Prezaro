import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { BadRequestError, handle, readJson, requireUser, zodMessage } from '../../_lib/helpers'

const markReadSchema = z
  .object({
    /** Mark a single notification read. */
    id: z.string().optional(),
    /** Mark every unread notification read. */
    all: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.id) !== Boolean(v.all), {
    message: 'Pass either a notification id or all: true',
  })

/** Mark one notification (or the whole feed) as read. */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)

    const parsed = markReadSchema.safeParse(await readJson(req))
    if (!parsed.success) {
      throw new BadRequestError(zodMessage(parsed.error))
    }

    if (parsed.data.all) {
      const res = await db.notification.updateMany({
        where: { userId: user.id, readAt: null },
        data: { readAt: new Date() },
      })
      return NextResponse.json({ ok: true, updated: res.count })
    }

    // id path: updateMany scoped to the owner so a foreign id is a no-op.
    const res = await db.notification.updateMany({
      where: { id: parsed.data.id!, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    })
    return NextResponse.json({ ok: true, updated: res.count })
  })
}
