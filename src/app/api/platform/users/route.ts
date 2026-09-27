import { NextResponse } from 'next/server'
import { z } from 'zod'
import { hash } from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  BadRequestError,
  ConflictError,
  handle,
  readJson,
  requireSuperAdmin,
  zodMessage,
} from '../../_lib/helpers'
import { notifyUsers } from '../../_lib/notify'
import type { User } from '@/lib/types'

// DEAN is assignable: a school head is homed to a school, everyone else to a
// department. SUPERADMIN stays platform-only (no department/school).
const assignRoles = ['LECTURER', 'ADMIN', 'DEAN', 'SUPERADMIN'] as const

const createUserSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  title: z.string().trim().optional(),
  role: z.enum(assignRoles).default('LECTURER'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  institutionId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  schoolId: z.string().optional().nullable(),
})

/** Include everything needed to resolve a user's placement chain. */
const platformUserInclude = {
  institution: { select: { id: true, name: true, slug: true } },
  department: {
    select: {
      id: true,
      name: true,
      code: true,
      institutionId: true,
      institution: { select: { id: true, name: true, slug: true } },
    },
  },
  school: {
    select: {
      id: true,
      name: true,
      code: true,
      institutionId: true,
      institution: { select: { id: true, name: true, slug: true } },
    },
  },
  _count: {
    select: {
      taughtCourses: true,
      sessions: true,
    },
  },
} satisfies Prisma.UserInclude

type PlatformUserRow = Prisma.UserGetPayload<{ include: typeof platformUserInclude }>

function platformRole(role: string): User['role'] {
  return role === 'SUPERADMIN' || role === 'DEAN' || role === 'ADMIN' ? role : 'LECTURER'
}

/**
 * Resolve the institution of a user through their placement chain:
 * explicit assignment → department's institution → school's institution.
 * Users who redeemed codes for departments created before institution
 * linking have no direct institutionId — the chain fills the gap.
 */
function resolveInstitution(u: PlatformUserRow) {
  const source = u.institution ?? u.department?.institution ?? u.school?.institution ?? null
  const id =
    u.institutionId ?? u.department?.institutionId ?? u.school?.institutionId ?? source?.id ?? null
  return {
    institutionId: id,
    institutionName: source?.name ?? null,
    institutionSlug: source?.slug ?? null,
  }
}

function platformUserDTO(u: PlatformUserRow): User {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    title: u.title ?? null,
    role: platformRole(u.role),
    onboarded: u.onboarded,
    departmentId: u.departmentId ?? null,
    departmentName: u.department?.name ?? null,
    schoolId: u.schoolId ?? null,
    schoolName: u.school?.name ?? null,
    schoolCode: u.school?.code ?? null,
    ...resolveInstitution(u),
    courseCount: u._count.taughtCourses,
    sessionCount: u._count.sessions,
    createdAt: u.createdAt.toISOString(),
  }
}

export async function GET(req: Request) {
  return handle(async () => {
    await requireSuperAdmin(req)

    const url = new URL(req.url)
    const institutionId = url.searchParams.get('institutionId')
    const role = url.searchParams.get('role')

    const rawUsers = await db.user.findMany({
      where: {
        ...(role ? { role } : {}),
        // Users may inherit their institution from a department or school.
        ...(institutionId
          ? {
              OR: [
                { institutionId },
                { department: { institutionId } },
                { school: { institutionId } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: platformUserInclude,
    })

    return NextResponse.json({ users: rawUsers.map(platformUserDTO) })
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireSuperAdmin(req)

    const parsed = createUserSchema.safeParse(await readJson(req))
    if (!parsed.success) {
      throw new BadRequestError(zodMessage(parsed.error))
    }

    const { email, name, title, role, password, departmentId, schoolId } = parsed.data

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      throw new ConflictError(`User with email '${email}' already exists`)
    }

    // Placement consistency: Deans live on a school, staff on a department,
    // super admins on the platform itself.
    if (role === 'DEAN' && !schoolId) {
      throw new BadRequestError('A Dean must be assigned to a school')
    }
    if ((role === 'LECTURER' || role === 'ADMIN') && !departmentId) {
      throw new BadRequestError(
        role === 'ADMIN'
          ? 'A Department Admin must be assigned to a department'
          : 'A Lecturer must be assigned to a department'
      )
    }

    // Institution: explicit → derived from the department/school assignment.
    const placement = await resolvePlacement({
      departmentId: role === 'DEAN' || role === 'SUPERADMIN' ? null : departmentId ?? null,
      schoolId: role === 'DEAN' ? schoolId ?? null : null,
    })

    const passwordHash = await hash(password, 10)

    const newUser = await db.user.create({
      data: {
        email,
        name,
        title: title || null,
        role,
        passwordHash,
        institutionId: parsed.data.institutionId || placement.institutionId || null,
        departmentId: placement.departmentId,
        schoolId: placement.schoolId,
        onboarded: true,
      },
      include: platformUserInclude,
    })

    // Welcome the new staff member in-app (notifyUsers is swallow-safe).
    await notifyUsers([newUser.id], {
      type: 'ROLE_UPDATED',
      title: 'Welcome to Prezaro',
      body: `Your ${newUser.role === 'ADMIN' ? 'Head of Department' : newUser.role === 'DEAN' ? 'Dean' : newUser.role === 'SUPERADMIN' ? 'Super Admin' : 'Lecturer'} account was created — sign in to get started`,
      view: 'home',
    })

    return NextResponse.json({ user: platformUserDTO(newUser) }, { status: 201 })
  })
}

/** Load the referenced department/school and derive the institution link. */
async function resolvePlacement(opts: {
  departmentId: string | null
  schoolId: string | null
}) {
  let departmentId = opts.departmentId
  let schoolId = opts.schoolId
  let institutionId: string | null = null

  if (departmentId) {
    const dept = await db.department.findUnique({
      where: { id: departmentId },
      select: { id: true, institutionId: true, schoolId: true },
    })
    if (!dept) throw new BadRequestError('Department not found')
    institutionId = institutionId ?? dept.institutionId
    // Keep department and school consistent when the department sits in one.
    schoolId = dept.schoolId ?? null
  }
  if (schoolId) {
    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: { id: true, institutionId: true },
    })
    if (!school) throw new BadRequestError('School not found')
    institutionId = institutionId ?? school.institutionId
  }

  return { departmentId: departmentId ?? null, schoolId: schoolId ?? null, institutionId }
}
