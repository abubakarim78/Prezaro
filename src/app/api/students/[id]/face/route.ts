import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { BadRequestError, ConflictError, requireUser } from '@/lib/auth'
import { euclidean } from '@/lib/face/match'
import { handle, parseDescriptorJson, readJson, requireStudent, zodMessage } from '../../../_lib/helpers'

/**
 * Maximum Euclidean distance at which a new enrollment is considered the
 * SAME person as an existing enrollment of a different student. face-api.js
 * same-person pairs typically land ~0.30–0.45 even across pose/lighting
 * changes, while different people rarely fall below ~0.52. 0.48 sits in the
 * safe gap: it blocks re-enrolling the same face under another student
 * (even from a different angle/distance) without rejecting genuine
 * different-looking students.
 */
const DEDUP_THRESHOLD = 0.48

const faceSchema = z.object({
  descriptors: z
    .array(z.array(z.number()).length(128, 'Each descriptor must have exactly 128 values'))
    .min(1, 'At least one descriptor is required')
    .max(10, 'Maximum 10 descriptors allowed'),
  consentVersion: z.string().trim().min(1).default('v1'),
  photoData: z
    .string()
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, 'Reference photo must be a base64 JPEG data URL')
    .max(600_000, 'Reference photo is too large')
    .optional(),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    const student = await requireStudent(user, id)

    const parsed = faceSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))
    const { descriptors, consentVersion, photoData } = parsed.data

    // ---- Biometric dedup -------------------------------------------------
    // One face may only exist once in the department. Compare the incoming
    // descriptors against EVERY other enrolled student's descriptors and
    // reject the enrollment when the same face is already registered.
    const others = await db.student.findMany({
      where: {
        departmentId: student.departmentId,
        id: { not: student.id },
        faceEnrolledAt: { not: null },
      },
      select: { id: true, studentId: true, firstName: true, lastName: true, descriptorsJson: true },
    })

    for (const other of others) {
      const existing = parseDescriptorJson(other.descriptorsJson)
      for (const candidate of descriptors) {
        for (const ref of existing) {
          let dist: number
          try {
            dist = euclidean(candidate, ref)
          } catch {
            continue // malformed stored descriptor — skip
          }
          if (dist <= DEDUP_THRESHOLD) {
            throw new ConflictError(
              `This face is already enrolled for ${other.firstName} ${other.lastName} (${other.studentId}). ` +
                'Each student can only be enrolled once — if two students share this face, enroll a different person.'
            )
          }
        }
      }
    }
    // ----------------------------------------------------------------------

    await db.student.update({
      where: { id },
      data: {
        descriptorsJson: JSON.stringify(descriptors),
        photoData: photoData ?? null,
        faceEnrolledAt: new Date(),
        consentVersion,
      },
    })
    return NextResponse.json({ ok: true, count: descriptors.length })
  })
}

/** Opt-out: wipe face embeddings and the reference photo. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    await requireStudent(user, id)

    await db.student.update({
      where: { id },
      data: {
        descriptorsJson: '[]',
        photoData: null,
        faceEnrolledAt: null,
        consentVersion: null,
      },
    })
    return NextResponse.json({ ok: true })
  })
}
