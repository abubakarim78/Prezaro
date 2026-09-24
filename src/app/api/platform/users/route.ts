import { NextResponse } from 'next/server'
import { z } from 'zod'
import { hash } from 'bcryptjs'
import { db } from '@/lib/db'
import {
  BadRequestError,
  ConflictError,
  handle,
  readJson,
  requireSuperAdmin,
  zodMessage,
} from '../../_lib/helpers'
import type { User } from '@/lib/types'

const createUserSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  title: z.string().trim().optional(),
  role: z.enum(['LECTURER', 'ADMIN', 'SUPERADMIN']).default('LECTURER'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  institutionId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
})

export async function GET(req: Request) {
  return handle(async () => {
    await requireSuperAdmin(req)

    const url = new URL(req.url)
    const institutionId = url.searchParams.get('institutionId')
    const role = url.searchParams.get('role')

    const rawUsers = await db.user.findMany({
      where: {
        ...(institutionId ? { institutionId } : {}),
        ...(role ? { role } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        institution: { select: { id: true, name: true, slug: true } },
        department: { select: { id: true, name: true, code: true } },
        _count: {
          select: {
            taughtCourses: true,
            sessions: true,
          },
        },
      },
    })

    const users: User[] = rawUsers.map((u) => {
      const userRole: 'LECTURER' | 'ADMIN' | 'SUPERADMIN' =
        u.role === 'SUPERADMIN' ? 'SUPERADMIN' : u.role === 'ADMIN' ? 'ADMIN' : 'LECTURER'

      return {
        id: u.id,
        email: u.email,
        name: u.name,
        title: u.title ?? null,
        role: userRole,
        onboarded: u.onboarded,
        departmentId: u.departmentId ?? null,
        departmentName: u.department?.name ?? null,
        institutionId: u.institutionId ?? null,
        institutionName: u.institution?.name ?? null,
        institutionSlug: u.institution?.slug ?? null,
        courseCount: u._count.taughtCourses,
        sessionCount: u._count.sessions,
        createdAt: u.createdAt.toISOString(),
      }
    })

    return NextResponse.json({ users })
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireSuperAdmin(req)

    const parsed = createUserSchema.safeParse(await readJson(req))
    if (!parsed.success) {
      throw new BadRequestError(zodMessage(parsed.error))
    }

    const { email, name, title, role, password, institutionId, departmentId } = parsed.data

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      throw new ConflictError(`User with email '${email}' already exists`)
    }

    const passwordHash = await hash(password, 10)

    const newUser = await db.user.create({
      data: {
        email,
        name,
        title: title || null,
        role,
        passwordHash,
        institutionId: institutionId || null,
        departmentId: departmentId || null,
        onboarded: true,
      },
      include: {
        institution: { select: { id: true, name: true, slug: true } },
        department: { select: { id: true, name: true, code: true } },
      },
    })

    const userRole: 'LECTURER' | 'ADMIN' | 'SUPERADMIN' =
      newUser.role === 'SUPERADMIN' ? 'SUPERADMIN' : newUser.role === 'ADMIN' ? 'ADMIN' : 'LECTURER'

    return NextResponse.json(
      {
        user: {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name,
          title: newUser.title ?? null,
          role: userRole,
          onboarded: newUser.onboarded,
          departmentId: newUser.departmentId ?? null,
          departmentName: newUser.department?.name ?? null,
          institutionId: newUser.institutionId ?? null,
          institutionName: newUser.institution?.name ?? null,
          institutionSlug: newUser.institution?.slug ?? null,
          createdAt: newUser.createdAt.toISOString(),
        },
      },
      { status: 201 }
    )
  })
}
