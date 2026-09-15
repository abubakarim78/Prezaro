import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import {
  handle,
  parseDescriptorJson,
  requireCourse,
} from '../../../_lib/helpers'

/** Roster with face descriptors for on-device matching (offline-capable). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    const course = await requireCourse(user, id)

    const enrollments = await db.enrollment.findMany({
      where: { courseId: course.id },
      include: { student: true },
    })
    const roster = enrollments
      .map((e) => e.student)
      .sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName) ||
          a.firstName.localeCompare(b.firstName),
      )
      .map((s) => ({
        id: s.id,
        studentId: s.studentId,
        firstName: s.firstName,
        lastName: s.lastName,
        level: s.level,
        descriptors: parseDescriptorJson(s.descriptorsJson),
      }))
    return NextResponse.json({
      course: { id: course.id, code: course.code, title: course.title },
      roster,
    })
  })
}
