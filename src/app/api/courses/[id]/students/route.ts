import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { BadRequestError, NotFoundError, requireUser } from '@/lib/auth'
import {
  handle,
  readJson,
  requireCourse,
  studentListItem,
  studentWithCoursesInclude,
  zodMessage,
} from '../../../_lib/helpers'

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    const course = await requireCourse(user, id)

    const enrollments = await db.enrollment.findMany({
      where: { courseId: course.id },
      include: { student: { include: studentWithCoursesInclude } },
    })
    const students = enrollments
      .map((e) => e.student)
      .sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName) ||
          a.firstName.localeCompare(b.firstName),
      )
      .map(studentListItem)
    return NextResponse.json({ students })
  })
}

const enrollSchema = z.object({
  studentIds: z
    .array(z.string().min(1))
    .min(1, 'studentIds must be a non-empty array'),
})

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    const course = await requireCourse(user, id)

    const parsed = enrollSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    // Only students visible to the user (their department) can be enrolled.
    const candidates = await db.student.findMany({
      where: { id: { in: parsed.data.studentIds }, departmentId: user.departmentId },
      select: { id: true },
    })
    const existing = await db.enrollment.findMany({
      where: { courseId: course.id, studentId: { in: candidates.map((c) => c.id) } },
      select: { studentId: true },
    })
    const already = new Set(existing.map((e) => e.studentId))
    const toAdd = candidates.filter((c) => !already.has(c.id))

    if (toAdd.length > 0) {
      await db.enrollment.createMany({
        data: toAdd.map((c) => ({ courseId: course.id, studentId: c.id })),
      })
    }
    return NextResponse.json({ enrolled: toAdd.length })
  })
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    const course = await requireCourse(user, id)

    const studentId = new URL(req.url).searchParams.get('studentId')
    if (!studentId) throw new BadRequestError('studentId query parameter is required')

    const deleted = await db.enrollment.deleteMany({
      where: { courseId: course.id, studentId },
    })
    if (deleted.count === 0) throw new NotFoundError('Enrollment not found')
    return NextResponse.json({ ok: true })
  })
}
