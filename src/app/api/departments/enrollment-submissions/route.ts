import { NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { getSessionUser, requireUser } from '@/lib/auth'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, handle, readJson, zodMessage } from '../../_lib/helpers'
import { enrollmentRequestHtml, queueEmail } from '@/lib/email'
import type { EnrollmentApprovalStatus, EnrollmentSubmission } from '@/lib/types'

const submissionSchema = z.object({
  studentId: z.string().trim().min(2, 'Student Index / ID number is required'),
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: z.string().trim().email('Valid email is required').toLowerCase(),
  phone: z.string().trim().optional(),
  level: z.coerce.number().int().min(100).max(900).default(100),
  departmentId: z.string().min(1).optional(),
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

    // School-first flow: students are homed to their School/Faculty and may
    // submit with no department at all; legacy links still carry a department.
    const dept = data.departmentId
      ? await db.department.findUnique({
          where: { id: data.departmentId },
          include: { institution: true },
        })
      : null
    if (data.departmentId && !dept) throw new NotFoundError('Department not found')

    // Resolve school context: explicit schoolId (school-first flow) wins, else derive from the home department.
    let schoolId: string | null = data.schoolId?.trim() || null
    if (dept) {
      if (schoolId) {
        const school = await db.school.findUnique({ where: { id: schoolId } })
        if (!school) throw new NotFoundError('School not found')
        if (dept.schoolId !== schoolId) {
          throw new BadRequestError('Selected home department does not belong to the selected school')
        }
      } else {
        schoolId = dept.schoolId ?? null
      }
    } else {
      // No department — the selected school itself is the student's home.
      if (!schoolId) throw new BadRequestError('A school or department is required')
      const school = await db.school.findUnique({ where: { id: schoolId } })
      if (!school) throw new NotFoundError('School not found')
    }

    // Guarantee no unknown courses: every picked course must belong to the submitted school.
    const courseRows: { id: string; code: string; title: string; departmentId: string; schoolId: string | null; departmentName: string | null }[] = []
    if (schoolId && data.courseIds.length > 0) {
      const picked = await db.course.findMany({
        where: { id: { in: data.courseIds } },
        select: {
          id: true,
          code: true,
          title: true,
          departmentId: true,
          department: { select: { schoolId: true, name: true } },
        },
      })
      for (const c of picked) {
        if (c.department?.schoolId !== schoolId) {
          throw new BadRequestError('One or more selected courses do not belong to the selected school')
        }
        courseRows.push({ id: c.id, code: c.code, title: c.title, departmentId: c.departmentId, schoolId: c.department.schoolId, departmentName: c.department.name })
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
        departmentId: data.departmentId ?? null,
        schoolId: schoolId,
        courseIdsJson: JSON.stringify(data.courseIds),
        descriptorsJson: JSON.stringify(data.descriptors),
        photoData: data.photoData || null,
        consentGiven: data.consentGiven,
        status: 'PENDING',
      },
    })

    // Slice-based approvals: one independent row per department owning
    // requested courses. Each HoD reviews only their own slice.
    const deptGroups = new Map<string, typeof courseRows>()
    for (const c of courseRows) {
      const list = deptGroups.get(c.departmentId) ?? []
      list.push(c)
      deptGroups.set(c.departmentId, list)
    }

    if (deptGroups.size > 0) {
      await db.enrollmentApproval.createMany({
        data: Array.from(deptGroups.keys()).map((departmentId) => ({
          submissionId: sub.id,
          departmentId,
          status: 'PENDING',
        })),
        skipDuplicates: true,
      })

      // Notify each department's HoDs (fire-and-forget — never blocks the request).
      const deptIds = Array.from(deptGroups.keys())
      const [admins, schoolRow] = await Promise.all([
        db.user.findMany({
          where: { role: 'ADMIN', departmentId: { in: deptIds } },
          select: { email: true, departmentId: true, department: { select: { name: true } } },
        }),
        schoolId ? db.school.findUnique({ where: { id: schoolId }, select: { name: true } }) : null,
      ])
      const studentName = `${data.firstName} ${data.lastName}`
      for (const admin of admins) {
        if (!admin.departmentId) continue
        const deptCourses = deptGroups.get(admin.departmentId) ?? []
        if (deptCourses.length === 0) continue
        queueEmail({
          to: admin.email,
          subject: `New enrollment request for ${admin.department?.name ?? 'your department'}`,
          html: enrollmentRequestHtml(
            studentName,
            cleanStudentId,
            admin.department?.name ?? 'your department',
            schoolRow?.name ?? null,
            deptCourses.map((c) => ({ code: c.code, title: c.title })),
          ),
          type: 'ENROLLMENT_REQUEST',
          meta: { submissionId: sub.id, departmentId: admin.departmentId },
        })
      }
    }

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
    if (user.role === 'LECTURER') {
      throw new ForbiddenError('Enrollment approval is handled by the Dean\'s office and super administrators')
    }

    const url = new URL(req.url)
    const statusFilter = url.searchParams.get('status') ?? undefined

    let where: Prisma.EnrollmentSubmissionWhereInput
    if (user.role === 'ADMIN') {
      // HoD queue: only submissions containing a slice addressed to their department.
      if (!user.departmentId) throw new ForbiddenError('No department is assigned to your account')
      where = {
        approvals: { some: { departmentId: user.departmentId } },
        ...(statusFilter ? { status: statusFilter } : {}),
      }
    } else if (user.role === 'DEAN') {
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
        approvals: {
          include: { department: { select: { name: true, code: true } } },
          orderBy: { createdAt: 'asc' },
        },
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

    const coursesMap = new Map<string, { id: string; code: string; title: string; departmentId: string; departmentName: string | null }>()
    if (allCourseIds.size > 0) {
      const courses = await db.course.findMany({
        where: { id: { in: Array.from(allCourseIds) } },
        select: { id: true, code: true, title: true, departmentId: true, department: { select: { name: true } } },
      })
      for (const c of courses) {
        coursesMap.set(c.id, { id: c.id, code: c.code, title: c.title, departmentId: c.departmentId, departmentName: c.department?.name ?? null })
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
        .filter((c): c is { id: string; code: string; title: string; departmentId: string; departmentName: string | null } => !!c)

      const approvals = s.approvals.map((a) => ({
        id: a.id,
        departmentId: a.departmentId,
        departmentName: a.department?.name ?? null,
        departmentCode: a.department?.code ?? null,
        status: a.status as EnrollmentApprovalStatus,
        rejectionReason: a.rejectionReason,
        reviewerId: a.reviewerId,
        reviewedAt: a.reviewedAt ? a.reviewedAt.toISOString() : null,
      }))

      return {
        id: s.id,
        studentId: s.studentId,
        firstName: s.firstName,
        lastName: s.lastName,
        email: s.email,
        phone: s.phone,
        level: s.level,
        departmentId: s.departmentId,
        departmentName: s.department?.name ?? null,
        schoolId: s.schoolId,
        schoolName: s.school?.name ?? null,
        courseIds,
        courses: resolvedCourses,
        photoData: s.photoData,
        descriptorsCount,
        consentGiven: s.consentGiven,
        status: s.status as EnrollmentSubmission['status'],
        rejectionReason: s.rejectionReason,
        approvals,
        myStatus: user.departmentId
          ? approvals.find((a) => a.departmentId === user.departmentId)?.status ?? null
          : null,
        myDepartmentId: user.departmentId,
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
    if (user.role === 'LECTURER') {
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

    const parseCourseIds = (): string[] => {
      try {
        return JSON.parse(sub.courseIdsJson || '[]') as string[]
      } catch {
        return []
      }
    }

    const enrollCourses = async (studentRowId: string, ids: string[]): Promise<number> => {
      let enrolled = 0
      for (const cId of ids) {
        try {
          await db.enrollment.upsert({
            where: { studentId_courseId: { studentId: studentRowId, courseId: cId } },
            create: { studentId: studentRowId, courseId: cId },
            update: {},
          })
          enrolled += 1
        } catch {
          // ignore duplicate / invalid course ID
        }
      }
      return enrolled
    }

    /**
     * Create the Student on first acceptance or refresh an existing row.
     * `claimDepartmentOnUpdate` is only true for the legacy Dean path — when
     * a second HoD accepts a later slice, the student's home department
     * created by the first acceptance must not be overwritten.
     */
    const upsertStudent = async (departmentId: string | null, claimDepartmentOnUpdate: boolean) => {
      const existingStudent = await db.student.findUnique({
        where: { studentId: sub.studentId },
      })
      if (existingStudent) {
        return db.student.update({
          where: { id: existingStudent.id },
          data: {
            firstName: sub.firstName,
            lastName: sub.lastName,
            email: sub.email,
            phone: sub.phone || existingStudent.phone,
            level: sub.level,
            // School-homed submissions carry no department — don't wipe one
            // that an existing student already has.
            ...(claimDepartmentOnUpdate && sub.departmentId ? { departmentId: sub.departmentId } : {}),
            ...(sub.schoolId ? { schoolId: sub.schoolId } : {}),
            descriptorsJson: sub.descriptorsJson,
            photoData: sub.photoData || existingStudent.photoData,
            faceEnrolledAt: new Date(),
            consentVersion: 'v1.0-web',
          },
        })
      }
      return db.student.create({
        data: {
          studentId: sub.studentId,
          firstName: sub.firstName,
          lastName: sub.lastName,
          email: sub.email,
          phone: sub.phone || null,
          level: sub.level,
          departmentId,
          schoolId: sub.schoolId,
          descriptorsJson: sub.descriptorsJson,
          photoData: sub.photoData || null,
          faceEnrolledAt: new Date(),
          consentVersion: 'v1.0-web',
        },
      })
    }

    /** Auto-finalize the submission when every slice shares one verdict. */
    const finalizeIfUnanimous = async (): Promise<'PENDING' | 'APPROVED' | 'REJECTED'> => {
      const rows = await db.enrollmentApproval.findMany({ where: { submissionId } })
      if (rows.length === 0) return 'PENDING'
      if (rows.every((r) => r.status === 'APPROVED')) {
        await db.enrollmentSubmission.update({
          where: { id: submissionId },
          data: { status: 'APPROVED', reviewedAt: new Date() },
        })
        return 'APPROVED'
      }
      if (rows.every((r) => r.status === 'REJECTED')) {
        const reason =
          rows.find((r) => r.rejectionReason)?.rejectionReason ||
          'Declined by all departments'
        await db.enrollmentSubmission.update({
          where: { id: submissionId },
          data: { status: 'REJECTED', rejectionReason: reason, reviewedAt: new Date() },
        })
        return 'REJECTED'
      }
      // Mixed verdicts stay PENDING for the Dean's office to arbitrate.
      return 'PENDING'
    }

    // ---- HoD slice review (ADMIN acts only on their own row) ----
    if (user.role === 'ADMIN') {
      if (!user.departmentId) throw new ForbiddenError('No department is assigned to your account')
      if (sub.status !== 'PENDING') {
        throw new ConflictError('This submission has already been finalized by the Dean\u2019s office')
      }

      const myRow = await db.enrollmentApproval.findUnique({
        where: { submissionId_departmentId: { submissionId, departmentId: user.departmentId } },
      })
      if (!myRow) throw new ForbiddenError('No enrollment slice is addressed to your department')
      if (myRow.status !== 'PENDING') {
        throw new ConflictError(
          myRow.status === 'APPROVED' ? 'You have already accepted this request' : 'You have already declined this request',
        )
      }

      if (action === 'APPROVE') {
        // First acceptance creates the Student homed to this HoD's department.
        const student = await upsertStudent(user.departmentId, false)

        // Enroll only this department's slice of the requested courses.
        const sliceCourses = await db.course.findMany({
          where: { id: { in: parseCourseIds() }, departmentId: user.departmentId },
          select: { id: true },
        })
        const enrolledCount = await enrollCourses(student.id, sliceCourses.map((c) => c.id))

        await db.enrollmentApproval.update({
          where: { id: myRow.id },
          data: { status: 'APPROVED', reviewerId: user.id, reviewedAt: new Date() },
        })
        const finalized = await finalizeIfUnanimous()
        return NextResponse.json({ ok: true, status: 'APPROVED', finalized, studentId: student.id, enrolledCount })
      }

      // REJECT: only this department's slice — mixed verdicts stay PENDING.
      await db.enrollmentApproval.update({
        where: { id: myRow.id },
        data: {
          status: 'REJECTED',
          reviewerId: user.id,
          reviewedAt: new Date(),
          rejectionReason: rejectionReason || 'Courses declined by the department',
        },
      })
      const finalized = await finalizeIfUnanimous()
      return NextResponse.json({ ok: true, status: 'REJECTED', finalized })
    }

    // ---- Dean / superadmin final say ----
    if (user.role === 'DEAN') {
      // Dean reviews anything tied to their school: school-first submissions
      // directly, or legacy rows via the submission's home department.
      const inSchool = !!user.schoolId && (sub.schoolId === user.schoolId || sub.department?.schoolId === user.schoolId)
      if (!inSchool) throw new ForbiddenError('You can only review submissions for your school')
    }
    if (sub.status !== 'PENDING') {
      throw new ConflictError('This submission has already been finalized')
    }

    if (action === 'REJECT') {
      // Already-accepted slices stay intact (their enrollments remain);
      // outstanding PENDING slices close so HoD queues clear instantly.
      await db.enrollmentApproval.updateMany({
        where: { submissionId, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          reviewerId: user.id,
          reviewedAt: new Date(),
          rejectionReason: rejectionReason || 'Information or face capture did not meet criteria',
        },
      })
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

    // APPROVE — the Dean's word is final: enroll ALL requested courses and
    // mark every slice APPROVED, clearing all HoD queues instantly.
    const student = await upsertStudent(sub.departmentId, true)
    const courseIds = parseCourseIds()
    const enrolledCount = await enrollCourses(student.id, courseIds)

    await db.enrollmentApproval.updateMany({
      where: { submissionId },
      data: { status: 'APPROVED', reviewerId: user.id, reviewedAt: new Date() },
    })

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
      enrolledCount,
    })
  })
}
