import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handle } from '../../_lib/helpers'

export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url)
    const deptId = url.searchParams.get('deptId') || url.searchParams.get('dept')
    const courseParam = url.searchParams.get('courseId') || url.searchParams.get('course') || url.searchParams.get('courseCode')

    const targetCourse = courseParam
      ? await db.course.findFirst({
          where: {
            OR: [
              { id: courseParam },
              { code: { equals: courseParam, mode: 'insensitive' } },
            ],
          },
          select: {
            id: true,
            code: true,
            title: true,
            level: true,
            departmentId: true,
            department: {
              select: {
                id: true,
                name: true,
                code: true,
                institution: { select: { id: true, name: true, slug: true } },
              },
            },
          },
        })
      : null

    const departments = await db.department.findMany({
      where: deptId ? { id: deptId } : undefined,
      select: {
        id: true,
        name: true,
        code: true,
        institution: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        courses: {
          select: {
            id: true,
            code: true,
            title: true,
            level: true,
          },
          orderBy: { code: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    })

    const payload = departments.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      institutionName: d.institution?.name ?? 'Prezaro Campus',
      courses: d.courses.map((c) => ({
        id: c.id,
        code: c.code,
        title: c.title,
        level: c.level,
      })),
    }))

    return NextResponse.json({
      departments: payload,
      targetCourse: targetCourse
        ? {
            id: targetCourse.id,
            code: targetCourse.code,
            title: targetCourse.title,
            level: targetCourse.level,
            departmentId: targetCourse.departmentId,
            departmentName: targetCourse.department?.name,
            departmentCode: targetCourse.department?.code,
            institutionName: targetCourse.department?.institution?.name,
          }
        : null,
    })
  })
}
