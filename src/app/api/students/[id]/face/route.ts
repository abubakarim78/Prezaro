import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { BadRequestError, requireUser } from '@/lib/auth'
import { handle, readJson, requireStudent, zodMessage } from '../../../_lib/helpers'

const faceSchema = z.object({
  descriptors: z
    .array(z.array(z.number()).length(128, 'Each descriptor must have exactly 128 values'))
    .min(1, 'At least one descriptor is required')
    .max(10, 'Maximum 10 descriptors allowed'),
  consentVersion: z.string().trim().min(1).default('v1'),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    await requireStudent(user, id)

    const parsed = faceSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    await db.student.update({
      where: { id },
      data: {
        descriptorsJson: JSON.stringify(parsed.data.descriptors),
        faceEnrolledAt: new Date(),
        consentVersion: parsed.data.consentVersion,
      },
    })
    return NextResponse.json({ ok: true, count: parsed.data.descriptors.length })
  })
}

/** Opt-out: wipe face embeddings. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    await requireStudent(user, id)

    await db.student.update({
      where: { id },
      data: { descriptorsJson: '[]', faceEnrolledAt: null, consentVersion: null },
    })
    return NextResponse.json({ ok: true })
  })
}
