import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { handle, loadSessionDetail, requireSession } from '../../../_lib/helpers'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    const session = await requireSession(user, id)

    await db.session.update({
      where: { id: session.id },
      data: { status: 'OPEN', endedAt: null },
    })

    return NextResponse.json({ session: await loadSessionDetail(session.id) })
  })
}
