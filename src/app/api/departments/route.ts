import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { BadRequestError, ForbiddenError, NotFoundError, handle, readJson, zodMessage } from '../_lib/helpers'

export async function GET(req: Request) {
  return handle(async () => {
    await requireUser(req)
    const url = new URL(req.url)
    const institutionId = url.searchParams.get('institutionId')

    const whereClause: { institutionId?: string } = {}
    if (institutionId && institutionId !== 'ALL') {
      whereClause.institutionId = institutionId
    }

    const rawDepartments = await db.department.findMany({
      where: whereClause,
      include: {
        institution: { select: { id: true, name: true, code: true } },
        _count: {
          select: {
            courses: true,
            users: true,
            students: true,
            accessCodes: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    const departments = rawDepartments.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      institutionId: d.institutionId,
      institutionName: d.institution?.name,
      institutionCode: d.institution?.code,
      courseCount: d._count.courses,
      userCount: d._count.users,
      studentCount: d._count.students,
      codeCount: d._count.accessCodes,
      createdAt: d.createdAt.toISOString(),
    }))

    return NextResponse.json({ departments })
  })
}

const createDeptSchema = z.object({
  name: z.string().trim().min(2, 'Department name must be at least 2 characters').max(100),
  code: z.string().trim().min(1, 'Department code is required').max(10).toUpperCase(),
  institutionId: z.string().min(1, 'Institution is required'),
})

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    if (user.role !== 'SUPERADMIN') {
      throw new ForbiddenError('Only Super Administrators can create departments')
    }

    const body = await readJson(req)
    const parsed = createDeptSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    // Ensure institution exists
    const inst = await db.institution.findUnique({
      where: { id: parsed.data.institutionId },
    })
    if (!inst) throw new NotFoundError('Target institution not found')

    // Check unique constraint (name + institutionId)
    const existing = await db.department.findFirst({
      where: {
        name: parsed.data.name,
        institutionId: parsed.data.institutionId,
      },
    })
    if (existing) {
      throw new BadRequestError(`A department named "${parsed.data.name}" already exists in ${inst.name}`)
    }

    const department = await db.department.create({
      data: {
        name: parsed.data.name,
        code: parsed.data.code,
        institutionId: parsed.data.institutionId,
      },
      include: {
        institution: { select: { id: true, name: true, code: true } },
      },
    })

    return NextResponse.json({
      department: {
        id: department.id,
        name: department.name,
        code: department.code,
        institutionId: department.institutionId,
        institutionName: department.institution?.name,
        institutionCode: department.institution?.code,
        courseCount: 0,
        userCount: 0,
        studentCount: 0,
        codeCount: 0,
        createdAt: department.createdAt.toISOString(),
      },
    }, { status: 201 })
  })
}

const updateDeptSchema = z.object({
  id: z.string().min(1, 'Department ID is required'),
  name: z.string().trim().min(2).max(100).optional(),
  code: z.string().trim().min(1).max(10).toUpperCase().optional(),
  institutionId: z.string().min(1).optional(),
})

export async function PATCH(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    if (user.role !== 'SUPERADMIN') {
      throw new ForbiddenError('Only Super Administrators can update departments')
    }

    const body = await readJson(req)
    const parsed = updateDeptSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    const dept = await db.department.findUnique({ where: { id: parsed.data.id } })
    if (!dept) throw new NotFoundError('Department not found')

    const updated = await db.department.update({
      where: { id: parsed.data.id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.code ? { code: parsed.data.code } : {}),
        ...(parsed.data.institutionId ? { institutionId: parsed.data.institutionId } : {}),
      },
      include: {
        institution: { select: { id: true, name: true, code: true } },
      },
    })

    return NextResponse.json({
      department: {
        id: updated.id,
        name: updated.name,
        code: updated.code,
        institutionId: updated.institutionId,
        institutionName: updated.institution?.name,
        institutionCode: updated.institution?.code,
      },
    })
  })
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    if (user.role !== 'SUPERADMIN') {
      throw new ForbiddenError('Only Super Administrators can delete departments')
    }

    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) throw new BadRequestError('Department ID is required')

    const dept = await db.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: { courses: true, students: true, users: true },
        },
      },
    })
    if (!dept) throw new NotFoundError('Department not found')

    // Clean up dependent access codes and submissions if any
    await db.accessCode.deleteMany({ where: { departmentId: id } })
    await db.enrollmentSubmission.deleteMany({ where: { departmentId: id } })

    // Unlink users
    await db.user.updateMany({
      where: { departmentId: id },
      data: { departmentId: null },
    })

    // If courses exist, delete their sessions and enrollments first
    const courses = await db.course.findMany({ where: { departmentId: id }, select: { id: true } })
    const courseIds = courses.map((c) => c.id)
    if (courseIds.length > 0) {
      await db.attendanceRecord.deleteMany({ where: { session: { courseId: { in: courseIds } } } })
      await db.session.deleteMany({ where: { courseId: { in: courseIds } } })
      await db.enrollment.deleteMany({ where: { courseId: { in: courseIds } } })
      await db.classSchedule.deleteMany({ where: { courseId: { in: courseIds } } })
      await db.course.deleteMany({ where: { departmentId: id } })
    }

    await db.student.deleteMany({ where: { departmentId: id } })
    await db.department.delete({ where: { id } })

    return NextResponse.json({ ok: true, deletedId: id })
  })
}
