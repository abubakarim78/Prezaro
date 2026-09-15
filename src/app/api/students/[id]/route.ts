import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { BadRequestError, requireUser } from '@/lib/auth'
import {
  handle,
  readJson,
  requireStudent,
  studentDetailDTO,
  zodMessage,
} from '../../_lib/helpers'

/** Shared detail loader: enrollments + attendance over COMPLETED sessions. */
async function loadStudentDetail(studentRowId: string) {
  const enrollments = await db.enrollment.findMany({
    where: { studentId: studentRowId },
    include: { course: { select: { id: true, code: true, title: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const courseIds = enrollments.map((e) => e.courseId)
  const [completedCount, records, student] = await Promise.all([
    db.session.count({
      where: { courseId: { in: courseIds }, status: 'COMPLETED' },
    }),
    db.attendanceRecord.findMany({
      where: {
        studentId: studentRowId,
        session: { status: 'COMPLETED', courseId: { in: courseIds } },
      },
      select: { status: true },
    }),
    db.student.findUnique({ where: { id: studentRowId } }),
  ])
  if (!student) return null
  const present = records.filter((r) => r.status === 'PRESENT').length
  const late = records.filter((r) => r.status === 'LATE').length
  return studentDetailDTO(
    { ...student, enrollments },
    { present, late, total: completedCount },
  )
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    await requireStudent(user, id)

    const detail = await loadStudentDetail(id)
    if (!detail) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    return NextResponse.json({ student: detail })
  })
}

const patchSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').optional(),
  lastName: z.string().trim().min(1, 'Last name is required').optional(),
  level: z.coerce.number().int().min(100, 'Level must be 100–900').max(900, 'Level must be 100–900').optional(),
  email: z.preprocess((v) => (v === '' ? null : v), z.string().trim().email('Invalid email').nullable().optional()),
  phone: z.preprocess((v) => (v === '' ? null : v), z.string().trim().min(3, 'Invalid phone').nullable().optional()),
})

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    await requireStudent(user, id)

    const parsed = patchSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    await db.student.update({ where: { id }, data: parsed.data })
    const detail = await loadStudentDetail(id)
    if (!detail) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    return NextResponse.json({ student: detail })
  })
}
