import { z } from 'zod'
import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { BadRequestError, ConflictError, ForbiddenError, requireUser } from '@/lib/auth'
import {
  courseCountInclude,
  courseDTO,
  handle,
  readJson,
  requireCourse,
  zodMessage,
} from '../../_lib/helpers'

const updateCourseSchema = z.object({
  code: z.string().trim().min(1, 'Course code is required').optional(),
  title: z.string().trim().min(1, 'Course title is required').optional(),
  level: z.coerce.number().int().min(100).max(900).optional(),
  semester: z.coerce.number().int().min(1).max(3).optional(),
  termSystem: z.enum(['SEMESTER', 'TRIMESTER']).optional(),
  // Course.lecturerId is a required relation: reassignment only, no unassign.
  lecturerId: z.string().optional(),
})

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser(req)
    if (user.role === 'LECTURER') {
      throw new ForbiddenError('Only department heads can edit courses')
    }
    const { id } = await ctx.params
    const course = await requireCourse(user, id)

    const parsed = updateCourseSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))
    const data = parsed.data

    // Only HoDs / the Dean / the super admin assign the teaching lecturer.
    // The lecturer must belong to the course's department (any department of
    // the Dean's school is acceptable).
    if (data.lecturerId !== undefined) {
      const lecturer =
        user.role === 'DEAN' && user.schoolId
          ? await db.user.findFirst({
              where: {
                id: data.lecturerId,
                role: { in: ['LECTURER', 'ADMIN'] },
                department: { schoolId: user.schoolId },
              },
              select: { id: true },
            })
          : await db.user.findFirst({
              where: {
                id: data.lecturerId,
                departmentId: course.departmentId,
                role: { in: ['LECTURER', 'ADMIN'] },
              },
              select: { id: true },
            })
      if (!lecturer) {
        throw new BadRequestError(
          user.role === 'DEAN'
            ? 'Assigned lecturer must belong to your school'
            : 'Assigned lecturer must belong to this department'
        )
      }
    }

    if (data.code && data.code !== course.code) {
      const clash = await db.course.findFirst({
        where: {
          code: data.code,
          departmentId: course.departmentId,
          id: { not: course.id },
        },
      })
      if (clash) {
        throw new ConflictError('A course with this code already exists in your department')
      }
    }

    // Explicit payload typed as the unchecked update input: the lecturerId FK
    // only exists there, and Prisma's XOR update types reject the zod-inferred
    // shape directly.
    const updateData: Prisma.CourseUncheckedUpdateInput = {
      ...(data.code !== undefined && { code: data.code }),
      ...(data.title !== undefined && { title: data.title }),
      ...(data.level !== undefined && { level: data.level }),
      ...(data.semester !== undefined && { semester: data.semester }),
      ...(data.termSystem !== undefined && { termSystem: data.termSystem }),
      ...(data.lecturerId !== undefined && { lecturerId: data.lecturerId }),
    }

    const updated = await db.course.update({
      where: { id: course.id },
      data: updateData,
      include: courseCountInclude,
    })
    return NextResponse.json({ course: courseDTO(updated) })
  })
}
