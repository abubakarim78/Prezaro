import { z } from 'zod'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { BadRequestError, requireUser } from '@/lib/auth'
import {
  handle,
  readJson,
  requireCourse,
  sessionSummaryDTO,
  sessionSummaryInclude,
  sessionScopeWhere,
  zodMessage,
} from '../_lib/helpers'

const STATUSES = ['OPEN', 'COMPLETED', 'CANCELLED'] as const

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    const url = new URL(req.url)
    const courseId = url.searchParams.get('courseId') ?? ''
    const status = url.searchParams.get('status') ?? ''
    const limitRaw = Number.parseInt(url.searchParams.get('limit') ?? '50', 10)
    const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 50

    const where: Prisma.SessionWhereInput = sessionScopeWhere(user)
    if (courseId) {
      await requireCourse(user, courseId)
      where.courseId = courseId
    }
    if (status) {
      if (!(STATUSES as readonly string[]).includes(status)) {
        throw new BadRequestError('Invalid status filter')
      }
      where.status = status
    }

    const sessions = await db.session.findMany({
      where,
      include: sessionSummaryInclude,
      orderBy: { startedAt: 'desc' },
      take: limit,
    })
    return NextResponse.json({ sessions: sessions.map(sessionSummaryDTO) })
  })
}

const createSchema = z.object({
  courseId: z.string().min(1, 'courseId is required'),
  mode: z.enum(['WALKTHROUGH', 'KIOSK', 'MANUAL']).default('WALKTHROUGH'),
})

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    const parsed = createSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    const course = await requireCourse(user, parsed.data.courseId)

    // Resume the existing OPEN session for the same lecturer + course
    // instead of creating a duplicate.
    const existing = await db.session.findFirst({
      where: { courseId: course.id, lecturerId: user.id, status: 'OPEN' },
      include: sessionSummaryInclude,
    })
    if (existing) {
      return NextResponse.json({ session: sessionSummaryDTO(existing) })
    }

    const created = await db.session.create({
      data: {
        courseId: course.id,
        lecturerId: user.id,
        mode: parsed.data.mode,
        status: 'OPEN',
      },
      include: sessionSummaryInclude,
    })
    return NextResponse.json({ session: sessionSummaryDTO(created) }, { status: 201 })
  })
}
