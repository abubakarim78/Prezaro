import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getSessionUser, requireUser } from '@/lib/auth'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, handle, readJson, zodMessage } from '../../_lib/helpers'
import type { EnrollmentSubmission } from '@/lib/types'

const submissionSchema = z.object({
  studentId: z.string().trim().min(2, 'Student Index / ID number is required'),
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: z.string().trim().email('Valid email is required').toLowerCase(),
  phone: z.string().trim().optional(),
  level: z.coerce.number().int().min(100).max(900).default(100),
  departmentId: z.string().min(1, 'Department is required'),
  schoolId: z.string().optional(),
  courseIds: z.array(z.string()).default([]),
  descriptors: z.array(z.array(z.number())).min(1, 'At least one face descriptor capture is required'),
  photoData: z.string().optional(),
  consentGiven: z.boolean().default(true),
})

export async function POST(req: Request) {
  return handle(async () => {
    const parsed = submissionSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    const data = parsed.data

    const dept = await db.department.findUnique({
      where: { id: data.departmentId },
      include: { institution: true },
    })
    if (!dept) throw new NotFoundError('Department not found')

    // Resolve school context: explicit schoolId (school-first flow) wins, else derive from the home department.
    let schoolId: string | null = data.schoolId?.trim() || null
    if (schoolId) {
      const school = await db.school.findUnique({ where: { id: schoolId } })
      if (!school) throw new NotFoundError('School not found')
      if (dept.schoolId !== schoolId) {
        throw new BadRequestError('Selected home department does not belong to the selected school')
      }
    } else {
      schoolId = dept.schoolId ?? null
    }

    // Guarantee no unknown courses: every picked course must belong to the submitted school.
    if (schoolId && data.courseIds.length > 0) {
      const picked = await db.course.findMany({
        where: { id: { in: data.courseIds } },
        select: { id: true, department: { select: { schoolId: true } } },
      })
      const valid = new Set(picked.filter((c) => c.department?.schoolId === schoolId).map((c) => c.id))
      if (data.courseIds.some((id) => !valid.has(id))) {
        throw new BadRequestError('One or more selected courses do not belong to the selected school')
      }
    }

    const cleanStudentId = data.studentId.toUpperCase().trim()
    const cleanEmail = data.email.toLowerCase().trim()

    // 1. Guard: Check if student already exists in DB (e.g. manually enrolled by lecturer)
    const existingStudent = await db.student.findFirst({
      where: {
        OR: [
          { studentId: { equals: cleanStudentId, mode: 'insensitive' } },
          { email: { equals: cleanEmail, mode: 'insensitive' } },
        ],
      },
      include: { department: true },
    })

    if (existingStudent) {
      if (existingStudent.faceEnrolledAt) {
        throw new ConflictError(
          `Student ID ${cleanStudentId} (${cleanEmail}) is already fully enrolled in the attendance system with biometric face credentials. Duplicate registrations are not permitted.`
        )
      } else {
        throw new ConflictError(
          `Student ID ${cleanStudentId} (${cleanEmail}) has already been enrolled manually from the lecturer dashboard on the official departmental roster. You do not need to re-register.`
        )
      }
    }

    // 2. Guard: Check if student already has a pending or approved enrollment submission
    const existingSub = await db.enrollmentSubmission.findFirst({
      where: {
        OR: [
          { studentId: { equals: cleanStudentId, mode: 'insensitive' } },
          { email: { equals: cleanEmail, mode: 'insensitive' } },
        ],
        status: { in: ['PENDING', 'APPROVED'] },
      },
    })
    if (existingSub) {
      if (existingSub.status === 'APPROVED') {
        throw new ConflictError(
          `Enrollment for Student ID ${cleanStudentId} (${cleanEmail}) has already been approved. You cannot re-submit.`
        )
      }
      throw new ConflictError(
        `An enrollment submission for Student ID ${cleanStudentId} is already pending departmental review (Reference: ${existingSub.id.slice(-8).toUpperCase()}). Multiple submissions are not allowed.`
      )
    }

    // Create submission record
    const sub = await db.enrollmentSubmission.create({
      data: {
        studentId: data.studentId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone || null,
        level: data.level,
        departmentId: data.departmentId,
        schoolId: schoolId,
        courseIdsJson: JSON.stringify(data.courseIds),
        descriptorsJson: JSON.stringify(data.descriptors),
        photoData: data.photoData || null,
        consentGiven: data.consentGiven,
        status: 'PENDING',
      },
    })

    return NextResponse.json({
      ok: true,
      submissionId: sub.id,
      message: 'Your registration and face enrollment have been submitted successfully for departmental verification.',
    }, { status: 201 })
  })
}

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    if (user.role === 'ADMIN' || user.role === 'LECTURER') {
      throw new ForbiddenError('Enrollment approval is handled by the Dean\'s office and super administrators')
    }

    const url = new URL(req.url)
    const statusFilter = url.searchParams.get('status') ?? undefined

    let where: Prisma.EnrollmentSubmissionWhereInput
    if (user.role === 'DEAN') {
      if (!user.schoolId) throw new ForbiddenError('No school is assigned to your account')
      // School-wide queue: submissions made against the school itself (school-first flow)
      // plus legacy rows whose home department belongs to the school.
      where = {
        OR: [{ schoolId: user.schoolId }, { department: { schoolId: user.schoolId } }],
        ...(statusFilter ? { status: statusFilter } : {}),
      }
    } else {
      // SUPERADMIN: optional schoolId / departmentId filters; unfiltered returns everything.
      const departmentId = url.searchParams.get('departmentId') ?? undefined
      const schoolId = url.searchParams.get('schoolId') ?? undefined
      where = {
        ...(departmentId ? { departmentId } : {}),
        ...(schoolId ? { schoolId } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      }
    }

    const raw = await db.enrollmentSubmission.findMany({
      where,
      include: {
        department: { select: { name: true, code: true, schoolId: true } },
        school: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })

    const allCourseIds = new Set<string>()
    for (const s of raw) {
      try {
        const ids = JSON.parse(s.courseIdsJson || '[]')
        for (const id of ids) allCourseIds.add(id)
      } catch {}
    }

    const coursesMap = new Map<string, { id: string; code: string; title: string; departmentName: string | null }>()
    if (allCourseIds.size > 0) {
      const courses = await db.course.findMany({
        where: { id: { in: Array.from(allCourseIds) } },
        select: { id: true, code: true, title: true, department: { select: { name: true } } },
      })
      for (const c of courses) {
        coursesMap.set(c.id, { id: c.id, code: c.code, title: c.title, departmentName: c.department?.name ?? null })
      }
    }

    const submissions: EnrollmentSubmission[] = raw.map((s) => {
      let courseIds: string[] = []
      let descriptorsCount = 0
      try {
        courseIds = JSON.parse(s.courseIdsJson || '[]')
      } catch {}
      try {
        descriptorsCount = JSON.parse(s.descriptorsJson || '[]').length
      } catch {}

      const resolvedCourses = courseIds
        .map((cid) => coursesMap.get(cid))
        .filter((c): c is { id: string; code: string; title: string; departmentName: string | null } => !!c)

      return {
        id: s.id,
        studentId: s.studentId,
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email,
        phone: s.phone,
        level: s.level,
        departmentId: s.departmentId,
        departmentName: s.department.name,
        schoolId: s.schoolId,
        schoolName: s.school?.name ?? null,
        courseIds,
        courses: resolvedCourses,
        photoData: s.photoData,
        descriptorsCount,
        consentGiven: s.consentGiven,
        status: s.status as EnrollmentSubmission['status'],
        rejectionReason: s.rejectionReason,
        createdAt: s.createdAt.toISOString(),
        reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
      }
    })

    return NextResponse.json({ submissions })
  })
}

const reviewActionSchema = z.object({
  submissionId: z.string().min(1, 'submissionId is required'),
  action: z.enum(['APPROVE', 'REJECT']),
  rejectionReason: z.string().optional(),
})

export async function PATCH(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    if (user.role === 'ADMIN' || user.role === 'LECTURER') {
      throw new ForbiddenError('Enrollment approval is handled by the Dean\'s office and super administrators')
    }

    const parsed = reviewActionSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    const { submissionId, action, rejectionReason } = parsed.data

    const sub = await db.enrollmentSubmission.findUnique({
      where: { id: submissionId },
      include: { department: true },
    })
    if (!sub) throw new NotFoundError('Submission not found')

    if (user.role === 'DEAN') {
      // Dean reviews anything tied to their school: school-first submissions
      // directly, or legacy rows via the submission's home department.
      const inSchool = !!user.schoolId && (sub.schoolId === user.schoolId || sub.department?.schoolId === user.schoolId)
      if (!inSchool) throw new ForbiddenError('You can only review submissions for your school')
    }

    if (action === 'REJECT') {
      await db.enrollmentSubmission.update({
        where: { id: submissionId },
        data: {
          status: 'REJECTED',
          rejectionReason: rejectionReason || 'Information or face capture did not meet criteria',
          reviewedAt: new Date(),
        },
      })
      return NextResponse.json({ ok: true, status: 'REJECTED' })
    }

    // Action === 'APPROVE'
    // 1. Create or update Student
    const existingStudent = await db.student.findUnique({
      where: { studentId: sub.studentId },
    })

    let student
    if (existingStudent) {
      student = await db.student.update({
        where: { id: existingStudent.id },
        data: {
          firstName: sub.firstName,
          lastName: sub.lastName,
          email: sub.email,
          phone: sub.phone || existingStudent.phone,
          level: sub.level,
          departmentId: sub.departmentId,
          descriptorsJson: sub.descriptorsJson,
          photoData: sub.photoData || existingStudent.photoData,
          faceEnrolledAt: new Date(),
          consentVersion: 'v1.0-web',
        },
      })
    } else {
      student = await db.student.create({
        data: {
          studentId: sub.studentId,
          firstName: sub.firstName,
          lastName: sub.lastName,
          email: sub.email,
          phone: sub.phone || null,
          level: sub.level,
          departmentId: sub.departmentId,
          descriptorsJson: sub.descriptorsJson,
          photoData: sub.photoData || null,
          faceEnrolledAt: new Date(),
          consentVersion: 'v1.0-web',
        },
      })
    }

    // 2. Enroll student into their requested courses
    let courseIds: string[] = []
    try {
      courseIds = JSON.parse(sub.courseIdsJson || '[]')
    } catch {}

    for (const cId of courseIds) {
      try {
        await db.enrollment.upsert({
          where: { studentId_courseId: { studentId: student.id, courseId: cId } },
          create: { studentId: student.id, courseId: cId },
          update: {},
        })
      } catch {
        // ignore duplicate / invalid course ID
      }
    }

    // 3. Mark submission APPROVED
    await db.enrollmentSubmission.update({
      where: { id: submissionId },
      data: {
        status: 'APPROVED',
        reviewedAt: new Date(),
      },
    })

    return NextResponse.json({
      ok: true,
      status: 'APPROVED',
      studentId: student.id,
      enrolledCount: courseIds.length,
    })
  })
}
