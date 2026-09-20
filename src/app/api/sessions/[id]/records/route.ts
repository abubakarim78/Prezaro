import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import {
  BadRequestError,
  NotFoundError,
  handle,
  loadSessionDetail,
  readJson,
  requireSession,
  zodMessage,
} from '../../../_lib/helpers'

const recordMutationSchema = z.object({
  studentId: z.string().min(1, 'Student ID is required'),
  status: z.enum(['PRESENT', 'LATE', 'ABSENT']),
  confidence: z.number().nullable().optional(),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    const session = await requireSession(user, id)

    const body = await readJson(req)
    const parsed = recordMutationSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    // Ensure student is enrolled in this course
    const enrollment = await db.enrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId: parsed.data.studentId,
          courseId: session.courseId,
        },
      },
    })
    if (!enrollment) {
      throw new BadRequestError('Student is not enrolled in this course')
    }

    const now = new Date()

    await db.attendanceRecord.upsert({
      where: {
        sessionId_studentId: {
          sessionId: session.id,
          studentId: parsed.data.studentId,
        },
      },
      create: {
        sessionId: session.id,
        studentId: parsed.data.studentId,
        status: parsed.data.status,
        confidence: parsed.data.confidence ?? null,
        markedAt: now,
      },
      update: {
        status: parsed.data.status,
        confidence: parsed.data.confidence ?? null,
        markedAt: now,
      },
    })

    return NextResponse.json({ session: await loadSessionDetail(session.id) })
  })
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    const session = await requireSession(user, id)

    const url = new URL(req.url)
    const studentId = url.searchParams.get('studentId')
    if (!studentId) throw new BadRequestError('studentId query param is required')

    await db.attendanceRecord.deleteMany({
      where: {
        sessionId: session.id,
        studentId,
      },
    })

    return NextResponse.json({ session: await loadSessionDetail(session.id) })
  })
}
