import { NextResponse } from 'next/server'
import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { BadRequestError, ForbiddenError, NotFoundError, handle, readJson, zodMessage } from '../../_lib/helpers'
import type { AccessCode } from '@/lib/types'
import { sendAppEmail, accessCodeInvitationHtml } from '@/lib/email'

function generateAccessCode(deptCode: string, role: string): string {
  const prefix = deptCode ? `${deptCode.toUpperCase().slice(0, 4)}` : 'PREZ'
  const tag = role === 'ADMIN' ? 'HOD' : 'LEC'
  const rand = randomBytes(2).toString('hex').toUpperCase()
  return `${prefix}-${tag}-${rand}`
}

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
      throw new ForbiddenError('Only department heads and administrators can manage access codes')
    }

    const url = new URL(req.url)
    const departmentId = user.role === 'SUPERADMIN' 
      ? url.searchParams.get('departmentId') ?? user.departmentId 
      : user.departmentId

    if (!departmentId) {
      throw new BadRequestError('Department ID is required')
    }

    const rawCodes = await db.accessCode.findMany({
      where: { departmentId },
      include: {
        department: { select: { name: true, code: true } },
        createdBy: { select: { name: true } },
        claimedUsers: { select: { id: true, name: true, email: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const now = new Date()
    const codes: AccessCode[] = rawCodes.map((c) => {
      let status = c.status as AccessCode['status']
      if (status === 'ACTIVE' && c.expiresAt && c.expiresAt < now) {
        status = 'EXPIRED'
      } else if (status === 'ACTIVE' && c.usedCount >= c.maxUses) {
        status = 'EXHAUSTED'
      }

      return {
        id: c.id,
        code: c.code,
        role: c.role as AccessCode['role'],
        departmentId: c.departmentId,
        departmentName: c.department?.name,
        maxUses: c.maxUses,
        usedCount: c.usedCount,
        status,
        expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
        designatedEmail: c.designatedEmail,
        designatedName: c.designatedName,
        createdByName: c.createdBy?.name,
        claimedUsers: c.claimedUsers.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          createdAt: u.createdAt.toISOString(),
        })),
        createdAt: c.createdAt.toISOString(),
      }
    })

    return NextResponse.json({ codes })
  })
}

const createCodeSchema = z.object({
  departmentId: z.string().optional(),
  role: z.enum(['LECTURER', 'ADMIN']).default('LECTURER'),
  maxUses: z.number().int().min(1).max(200).default(1),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  designatedEmail: z.string().email().optional().or(z.literal('')),
  designatedName: z.string().max(100).optional().or(z.literal('')),
  sendEmailImmediately: z.boolean().optional(),
})

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
      throw new ForbiddenError('Only department heads and administrators can generate access codes')
    }

    const parsed = createCodeSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    const targetDeptId = user.role === 'SUPERADMIN' && parsed.data.departmentId
      ? parsed.data.departmentId
      : user.departmentId

    if (!targetDeptId) {
      throw new BadRequestError('Department is required to generate access codes')
    }

    const dept = await db.department.findUnique({
      where: { id: targetDeptId },
      select: {
        id: true,
        code: true,
        name: true,
        institution: { select: { name: true } },
      },
    })
    if (!dept) throw new NotFoundError('Department not found')

    let codeString = ''
    let unique = false
    let attempts = 0
    while (!unique && attempts < 10) {
      attempts++
      codeString = generateAccessCode(dept.code, parsed.data.role)
      const exists = await db.accessCode.findUnique({ where: { code: codeString } })
      if (!exists) unique = true
    }

    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
      : null

    const accessCode = await db.accessCode.create({
      data: {
        code: codeString,
        role: parsed.data.role,
        departmentId: dept.id,
        maxUses: parsed.data.maxUses,
        expiresAt,
        designatedEmail: parsed.data.designatedEmail || null,
        designatedName: parsed.data.designatedName || null,
        createdById: user.id,
      },
      include: {
        department: { select: { name: true, code: true } },
      },
    })

    if (parsed.data.sendEmailImmediately && parsed.data.designatedEmail) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof req.headers.get === 'function' && req.headers.get('origin')) || 'https://prezaro.com'
      const directLink = `${appUrl.replace(/\/+$/, '')}/?code=${accessCode.code}`
      await sendAppEmail({
        to: parsed.data.designatedEmail,
        subject: `Prezaro Access Code: Join ${dept.name}`,
        html: accessCodeInvitationHtml(
          parsed.data.designatedName || null,
          accessCode.code,
          parsed.data.role,
          dept.name,
          dept.institution?.name || 'Prezaro Academic Portal',
          expiresAt ? expiresAt.toISOString() : null,
          directLink,
        ),
        type: 'ACCESS_CODE_INVITE',
        meta: {
          codeId: accessCode.id,
          code: accessCode.code,
          departmentId: dept.id,
          sentBy: user.email,
        },
      })
    }

    return NextResponse.json({
      code: {
        id: accessCode.id,
        code: accessCode.code,
        role: accessCode.role as AccessCode['role'],
        departmentId: accessCode.departmentId,
        departmentName: accessCode.department?.name,
        maxUses: accessCode.maxUses,
        usedCount: accessCode.usedCount,
        status: accessCode.status as AccessCode['status'],
        expiresAt: accessCode.expiresAt ? accessCode.expiresAt.toISOString() : null,
        designatedEmail: accessCode.designatedEmail,
        designatedName: accessCode.designatedName,
        createdAt: accessCode.createdAt.toISOString(),
      },
    }, { status: 201 })
  })
}

export async function DELETE(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
      throw new ForbiddenError('Only department heads and administrators can revoke access codes')
    }

    const url = new URL(req.url)
    const codeId = url.searchParams.get('id')
    if (!codeId) throw new BadRequestError('Code ID is required')

    const code = await db.accessCode.findUnique({ where: { id: codeId } })
    if (!code) throw new NotFoundError('Access code not found')

    if (user.role !== 'SUPERADMIN' && code.departmentId !== user.departmentId) {
      throw new ForbiddenError('You can only revoke codes within your department')
    }

    await db.accessCode.update({
      where: { id: codeId },
      data: { status: 'REVOKED' },
    })

    return NextResponse.json({ ok: true })
  })
}
