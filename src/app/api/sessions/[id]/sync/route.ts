import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { BadRequestError, handle, readJson, requireSession, zodMessage } from '../../../_lib/helpers'
import { applyRecords, recordListSchema } from '../../../_lib/records'

/** Offline queue flush target: upsert records, latest markedAt wins. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    const session = await requireSession(user, id)

    const parsed = recordListSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    const saved = await applyRecords(session.id, session.courseId, parsed.data.records)
    return NextResponse.json({ saved })
  })
}
