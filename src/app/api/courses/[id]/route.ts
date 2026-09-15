import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { BadRequestError, ConflictError, requireUser } from '@/lib/auth'
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
})

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    const course = await requireCourse(user, id)

    const parsed = updateCourseSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))
    const data = parsed.data

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

    const updated = await db.course.update({
      where: { id: course.id },
      data,
      include: courseCountInclude,
    })
    return NextResponse.json({ course: courseDTO(updated) })
  })
}
