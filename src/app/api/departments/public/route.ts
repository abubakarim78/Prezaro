import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handle } from '../../_lib/helpers'

export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url)
    const checkStudentId = url.searchParams.get('checkStudentId')
    const checkEmail = url.searchParams.get('checkEmail')

    if (checkStudentId || checkEmail) {
      const student = await db.student.findFirst({
        where: {
          OR: [
            ...(checkStudentId
              ? [{ studentId: { equals: checkStudentId.toUpperCase().trim(), mode: 'insensitive' as const } }]
              : []),
            ...(checkEmail
              ? [{ email: { equals: checkEmail.toLowerCase().trim(), mode: 'insensitive' as const } }]
              : []),
          ],
        },
        include: {
          department: true,
          enrollments: {
            include: { course: true },
          },
        },
      })

      const sub = await db.enrollmentSubmission.findFirst({
        where: {
          OR: [
            ...(checkStudentId
              ? [{ studentId: { equals: checkStudentId.toUpperCase().trim(), mode: 'insensitive' as const } }]
              : []),
            ...(checkEmail
              ? [{ email: { equals: checkEmail.toLowerCase().trim(), mode: 'insensitive' as const } }]
              : []),
          ],
          status: { in: ['PENDING', 'APPROVED'] },
        },
        include: { department: true },
        orderBy: { createdAt: 'desc' },
      })

      // Any student in DB (manually added by lecturer or approved) or with an active submission is enrolled
      const isEnrolled = !!(student || sub)
      let courseCodes: string[] = []

      if (student?.enrollments && student.enrollments.length > 0) {
        courseCodes = student.enrollments.map((e) => e.course.code)
      }

      if (sub?.courseIdsJson) {
        try {
          const cIds: string[] = JSON.parse(sub.courseIdsJson)
          if (cIds.length > 0) {
            const courses = await db.course.findMany({
              where: { id: { in: cIds } },
              select: { code: true },
            })
            const subCodes = courses.map((c) => c.code)
            courseCodes = Array.from(new Set([...courseCodes, ...subCodes]))
          }
        } catch {}
      }

      return NextResponse.json({
        alreadyEnrolled: isEnrolled,
        status: student ? (student.faceEnrolledAt ? 'APPROVED' : 'ENROLLED') : (sub?.status || null),
        studentName: student ? `${student.firstName} ${student.lastName}` : sub ? `${sub.firstName} ${sub.lastName}` : null,
        studentId: student?.studentId || sub?.studentId || checkStudentId,
        departmentName: student?.department?.name || sub?.department?.name || null,
        refCode: sub ? sub.id.slice(-8).toUpperCase() : (student ? `REG-${student.studentId}` : null),
        courseCodes,
        submittedAt: sub?.createdAt || student?.createdAt || null,
        faceEnrolled: !!student?.faceEnrolledAt,
        isManualStudent: !student?.faceEnrolledAt && !!student,
      })
    }

    // School listing for the school-first enrollment flow (public; ACTIVE institutions only).
    if (url.searchParams.get('list') === 'schools') {
      const schools = await db.school.findMany({
        where: { institution: { status: 'ACTIVE' } },
        include: {
          institution: { select: { name: true, termSystem: true, currentSemester: true } },
          _count: { select: { departments: true } },
        },
        orderBy: { name: 'asc' },
      })
      return NextResponse.json({
        schools: schools.map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          institutionName: s.institution?.name ?? 'Prezaro Campus',
          termSystem: s.institution?.termSystem ?? 'SEMESTER',
          currentSemester: s.institution?.currentSemester ?? 1,
          departmentCount: s._count.departments,
        })),
      })
    }

    // School-first flow: a school with all its departments and their courses.
    const schoolParam = url.searchParams.get('school')
    if (schoolParam) {
      const school = await db.school.findFirst({
        where: {
          OR: [
            { id: schoolParam },
            { code: { equals: schoolParam, mode: 'insensitive' as const } },
          ],
        },
        include: { institution: { select: { id: true, name: true, slug: true, termSystem: true, currentSemester: true } } },
      })
      if (!school) return NextResponse.json({ school: null, departments: [] })

      const departments = await db.department.findMany({
        where: { schoolId: school.id },
        select: {
          id: true,
          name: true,
          code: true,
          courses: {
            select: { id: true, code: true, title: true, level: true, semester: true },
            orderBy: { code: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      })

      const instName = school.institution?.name ?? 'Prezaro Campus'
      return NextResponse.json({
        school: {
          id: school.id,
          name: school.name,
          code: school.code,
          institutionName: instName,
          termSystem: school.institution?.termSystem ?? 'SEMESTER',
          currentSemester: school.institution?.currentSemester ?? 1,
        },
        departments: departments.map((d) => ({
          id: d.id,
          name: d.name,
          code: d.code,
          institutionName: instName,
          courses: d.courses,
        })),
      })
    }

    const deptId = url.searchParams.get('deptId') || url.searchParams.get('dept')
    const courseParam = url.searchParams.get('courseId') || url.searchParams.get('course') || url.searchParams.get('courseCode')

    const targetCourse = courseParam
      ? await db.course.findFirst({
          where: {
            OR: [
              { id: courseParam },
              { code: { equals: courseParam, mode: 'insensitive' as const } },
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
