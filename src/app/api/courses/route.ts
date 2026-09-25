import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { BadRequestError, ConflictError, ForbiddenError, requireUser } from '@/lib/auth'
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
  termSystem: z.enum(['SEMESTER', 'TRIMESTER']).default('SEMESTER'),
  departmentId: z.string().optional(),
  lecturerId: z.string().optional(),
})

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    if (user.role === 'LECTURER') {
      throw new ForbiddenError('Only department heads can create courses')
    }
    const parsed = createCourseSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))
    const { code, title, level, semester, termSystem } = parsed.data

    // HoDs create within their own department; the super admin provisions
    // courses for any department via the optional body departmentId.
    const departmentId =
      user.role === 'SUPERADMIN' && parsed.data.departmentId
        ? parsed.data.departmentId
        : user.departmentId
    if (!departmentId) {
      throw new BadRequestError('A department is required to create courses')
    }

    // The creator is the default lecturer; a HoD / the super admin can
    // assign any staff member of the target department instead.
    let lecturerId = user.id
    if (parsed.data.lecturerId && parsed.data.lecturerId !== user.id) {
      const lecturer = await db.user.findFirst({
        where: {
          id: parsed.data.lecturerId,
          departmentId,
          role: { in: ['LECTURER', 'ADMIN'] },
        },
        select: { id: true },
      })
      if (!lecturer) {
        throw new BadRequestError('Assigned lecturer must belong to this department')
      }
      lecturerId = parsed.data.lecturerId
    }

    const existing = await db.course.findUnique({
      where: { code_departmentId: { code, departmentId } },
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
        termSystem,
        departmentId,
        lecturerId,
      },
      include: courseCountInclude,
    })
    return NextResponse.json({ course: courseDTO(course) }, { status: 201 })
  })
}
