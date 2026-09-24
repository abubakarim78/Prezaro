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

const updateUserSchema = z.object({
  name: z.string().trim().min(2).optional(),
  title: z.string().trim().optional().nullable(),
  role: z.enum(['LECTURER', 'ADMIN', 'SUPERADMIN']).optional(),
  password: z.string().min(6).optional(),
  institutionId: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
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

    const data = parsed.data
    const updatePayload: Record<string, any> = {}

    if (data.name !== undefined) updatePayload.name = data.name
    if (data.title !== undefined) updatePayload.title = data.title
    if (data.role !== undefined) updatePayload.role = data.role
    if (data.institutionId !== undefined) updatePayload.institutionId = data.institutionId
    if (data.departmentId !== undefined) updatePayload.departmentId = data.departmentId

    if (data.password) {
      updatePayload.passwordHash = await hash(data.password, 10)
    }

    const updated = await db.user.update({
      where: { id },
      data: updatePayload,
      include: {
        institution: { select: { id: true, name: true, slug: true } },
        department: { select: { id: true, name: true, code: true } },
      },
    })

    return NextResponse.json({
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        title: updated.title ?? null,
        role: updated.role,
        departmentId: updated.departmentId ?? null,
        departmentName: updated.department?.name ?? null,
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
