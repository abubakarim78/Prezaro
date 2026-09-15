import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import {
  BadRequestError,
  handle,
  loadSessionDetail,
  readJson,
  requireSession,
  zodMessage,
} from '../../../_lib/helpers'
import { applyRecords, recordInputSchema } from '../../../_lib/records'

const finalizeSchema = z.object({
  records: z.array(recordInputSchema).max(2000).optional(),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    const session = await requireSession(user, id)

    const parsed = finalizeSchema.safeParse(await readJson(req).catch(() => ({})))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    if (parsed.data.records && parsed.data.records.length > 0) {
      await applyRecords(session.id, session.courseId, parsed.data.records)
    }

    await db.session.update({
      where: { id: session.id },
      data: { status: 'COMPLETED', endedAt: new Date() },
    })
    return NextResponse.json({ session: await loadSessionDetail(session.id) })
  })
}
