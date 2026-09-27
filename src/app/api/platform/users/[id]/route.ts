import { NextResponse } from 'next/server'
import { z } from 'zod'
import { hash } from 'bcryptjs'
import { db } from '@/lib/db'
import {
  BadRequestError,
  NotFoundError,
  handle,
  readJson,
  requireSuperAdmin,
  zodMessage,
} from '../../../_lib/helpers'
import { notifyUsers } from '../../../_lib/notify'

// DEAN is assignable: a school head is homed to a school, everyone else to a
// department. SUPERADMIN stays platform-only (no department/school).
const assignRoles = ['LECTURER', 'ADMIN', 'DEAN', 'SUPERADMIN'] as const

const updateUserSchema = z.object({
  name: z.string().trim().min(2).optional(),
  title: z.string().trim().optional().nullable(),
  role: z.enum(assignRoles).optional(),
  password: z.string().min(6).optional(),
  institutionId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  schoolId: z.string().optional().nullable(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: RouteParams) {
  return handle(async () => {
    const adminUser = await requireSuperAdmin(req)
    const { id } = await params

    const parsed = updateUserSchema.safeParse(await readJson(req))
    if (!parsed.success) {
      throw new BadRequestError(zodMessage(parsed.error))
    }

    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) {
      throw new NotFoundError('User not found')
    }
    if (existing.id === adminUser.id && parsed.data.role && parsed.data.role !== 'SUPERADMIN') {
      throw new BadRequestError('You cannot change your own superadmin role')
    }

    const data = parsed.data
    const updatePayload: Record<string, any> = {}

    if (data.name !== undefined) updatePayload.name = data.name
    if (data.title !== undefined) updatePayload.title = data.title
    if (data.password) {
      updatePayload.passwordHash = await hash(data.password, 10)
    }

    const nextRole = data.role ?? (existing.role as (typeof assignRoles)[number])

    if (data.role !== undefined) updatePayload.role = data.role

    // Placement consistency per role:
    //   DEAN      → schoolId required, department cleared
    //   LECTURER/
    //   ADMIN     → departmentId kept/assigned, school cleared
    //   SUPERADMIN→ platform-only: no department, no school
    if (nextRole === 'DEAN') {
      const schoolId = data.schoolId ?? existing.schoolId
      if (!schoolId) {
        throw new BadRequestError('A Dean must be assigned to a school')
      }
      const school = await db.school.findUnique({
        where: { id: schoolId },
        select: { id: true, institutionId: true },
      })
      if (!school) throw new BadRequestError('School not found')
      updatePayload.schoolId = schoolId
      updatePayload.departmentId = null
      updatePayload.institutionId = data.institutionId ?? school.institutionId ?? null
    } else if (nextRole === 'SUPERADMIN') {
      updatePayload.departmentId = null
      updatePayload.schoolId = null
      updatePayload.institutionId = data.institutionId ?? null
    } else {
      // LECTURER / ADMIN
      const departmentId = data.departmentId ?? existing.departmentId
      let institutionId = data.institutionId
      if (departmentId) {
        const dept = await db.department.findUnique({
          where: { id: departmentId },
          select: { id: true, institutionId: true },
        })
        if (!dept) throw new BadRequestError('Department not found')
        // Explicit institution wins; otherwise inherit the department's.
        institutionId = institutionId ?? dept.institutionId
      }
      updatePayload.departmentId = departmentId ?? null
      updatePayload.schoolId = null
      updatePayload.institutionId = institutionId ?? null
    }

    const updated = await db.user.update({
      where: { id },
      data: updatePayload,
      include: {
        institution: { select: { id: true, name: true, slug: true } },
        department: { select: { id: true, name: true, code: true } },
        school: { select: { id: true, name: true, code: true } },
      },
    })

    // In-app notice to the affected user about their account changes.
    if (data.role && data.role !== existing.role) {
      void notifyUsers([updated.id], {
        type: 'ROLE_UPDATED',
        title: 'Your role was updated',
        body: `A platform administrator set your role to ${formatRole(updated.role)}.`,
        view: 'home',
      })
    }

    return NextResponse.json({
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        title: updated.title ?? null,
        role: updated.role,
        departmentId: updated.departmentId ?? null,
        departmentName: updated.department?.name ?? null,
        schoolId: updated.schoolId ?? null,
        schoolName: updated.school?.name ?? null,
        institutionId: updated.institutionId ?? null,
        institutionName: updated.institution?.name ?? null,
        institutionSlug: updated.institution?.slug ?? null,
      },
    })
  })
}

export async function DELETE(req: Request, { params }: RouteParams) {
  return handle(async () => {
    const adminUser = await requireSuperAdmin(req)
    const { id } = await params

    if (adminUser.id === id) {
      throw new BadRequestError('You cannot delete your own superadmin account')
    }

    const existing = await db.user.findUnique({ where: { id } })
    if (!existing) {
      throw new NotFoundError('User not found')
    }

    await db.user.delete({ where: { id } })
    return NextResponse.json({ ok: true, message: 'User removed from platform' })
  })
}

function formatRole(role: string): string {
  switch (role) {
    case 'SUPERADMIN':
      return 'Platform Super Admin'
    case 'DEAN':
      return 'Dean / School Head'
    case 'ADMIN':
      return 'Department Admin / HoD'
    default:
      return 'Lecturer'
  }
}
