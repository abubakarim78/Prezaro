import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { handle, loadSessionDetail, requireSession } from '../../_lib/helpers'

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    const session = await requireSession(user, id)
    return NextResponse.json({ session: await loadSessionDetail(session.id) })
  })
}

/** Hard delete: session + its attendance records. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    const session = await requireSession(user, id)

    await db.$transaction([
      db.attendanceRecord.deleteMany({ where: { sessionId: session.id } }),
      db.session.delete({ where: { id: session.id } }),
    ])
    return NextResponse.json({ ok: true })
  })
}
