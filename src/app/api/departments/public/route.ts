import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handle } from '../../_lib/helpers'

export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url)
    const checkStudentId = url.searchParams.get('checkStudentId')
    const checkEmail = url.searchParams.get('checkEmail')

    if (checkStudentId || checkEmail) {
      const student = checkStudentId
        ? await db.student.findUnique({
            where: { studentId: checkStudentId.toUpperCase().trim() },
            include: { department: true },
          })
        : null

      const sub = await db.enrollmentSubmission.findFirst({
        where: {
          OR: [
            ...(checkStudentId ? [{ studentId: checkStudentId.toUpperCase().trim() }] : []),
            ...(checkEmail ? [{ email: checkEmail.toLowerCase().trim() }] : []),
          ],
          status: { in: ['PENDING', 'APPROVED'] },
        },
        include: { department: true },
        orderBy: { createdAt: 'desc' },
      })

      const isEnrolled = !!(student?.faceEnrolledAt || sub)
      let courseCodes: string[] = []
      if (sub?.courseIdsJson) {
        try {
          const cIds: string[] = JSON.parse(sub.courseIdsJson)
          if (cIds.length > 0) {
            const courses = await db.course.findMany({
              where: { id: { in: cIds } },
              select: { code: true },
            })
            courseCodes = courses.map((c) => c.code)
          }
        } catch {}
      }

      return NextResponse.json({
        alreadyEnrolled: isEnrolled,
        status: student?.faceEnrolledAt ? 'APPROVED' : sub?.status || null,
        studentName: student ? `${student.firstName} ${student.lastName}` : sub ? `${sub.firstName} ${sub.lastName}` : null,
        studentId: student?.studentId || sub?.studentId || checkStudentId,
        departmentName: student?.department?.name || sub?.department?.name || null,
        refCode: sub ? sub.id.slice(-8).toUpperCase() : null,
        courseCodes,
        submittedAt: sub?.createdAt || student?.faceEnrolledAt || null,
      })
    }

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

    const targetDeptId = targetCourse?.departmentId || (deptId ?? undefined)
    const departments = await db.department.findMany({
      where: targetDeptId ? { id: targetDeptId } : undefined,
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
