import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { BadRequestError, ConflictError, requireUser } from '@/lib/auth'
import {
  courseCountInclude,
  courseDTO,
  courseScopeWhere,
  handle,
  readJson,
  zodMessage,
} from '../_lib/helpers'

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    const courses = await db.course.findMany({
      where: courseScopeWhere(user),
      include: courseCountInclude,
      orderBy: { code: 'asc' },
    })
    return NextResponse.json({ courses: courses.map(courseDTO) })
  })
}

const createCourseSchema = z.object({
  code: z.string().trim().min(1, 'Course code is required'),
  title: z.string().trim().min(1, 'Course title is required'),
  level: z.coerce.number().int().min(100).max(900).default(200),
  semester: z.coerce.number().int().min(1).max(3).default(1),
})

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    if (!user.departmentId) {
      throw new BadRequestError('Join a department before creating courses')
    }
    const parsed = createCourseSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))
    const { code, title, level, semester } = parsed.data

    const existing = await db.course.findUnique({
      where: { code_departmentId: { code, departmentId: user.departmentId } },
    })
    if (existing) {
      throw new ConflictError('A course with this code already exists in your department')
    }

    const course = await db.course.create({
      data: {
        code,
        title,
        level,
        semester,
        departmentId: user.departmentId,
        lecturerId: user.id,
      },
      include: courseCountInclude,
    })
    return NextResponse.json({ course: courseDTO(course) }, { status: 201 })
  })
}
