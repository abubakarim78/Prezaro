import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { handle, qrPayloadFor, requireStudent } from '../../../_lib/helpers'

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    const student = await requireStudent(user, id)
    return NextResponse.json({
      qrPayload: qrPayloadFor(student),
      pin: student.pin,
    })
  })
}
