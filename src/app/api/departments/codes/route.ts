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
  const tag = role === 'DEAN' ? 'DEAN' : role === 'ADMIN' ? 'HOD' : 'LEC'
  const rand = randomBytes(2).toString('hex').toUpperCase()
  return `${prefix}-${tag}-${rand}`
}

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    if (user.role !== 'ADMIN' && user.role !== 'DEAN' && user.role !== 'SUPERADMIN') {
      throw new ForbiddenError('Only deans, department heads and administrators can manage access codes')
    }

    const url = new URL(req.url)
    const qDepartmentId = url.searchParams.get('departmentId')
    const qSchoolId = url.searchParams.get('schoolId')

    let where: Record<string, unknown>
    if (user.role === 'SUPERADMIN') {
      if (qDepartmentId) where = { departmentId: qDepartmentId }
      else if (qSchoolId) where = { OR: [{ schoolId: qSchoolId }, { department: { schoolId: qSchoolId } }] }
      else throw new BadRequestError('Department or school ID is required')
    } else if (user.role === 'DEAN') {
      if (!user.schoolId) throw new BadRequestError('School ID is required')
      // Everything minted for the dean's school: school-level codes + codes of
      // departments inside the school.
      where = { OR: [{ schoolId: user.schoolId }, { department: { schoolId: user.schoolId } }] }
    } else {
      if (!user.departmentId) throw new BadRequestError('Department ID is required')
      where = { departmentId: user.departmentId }
    }

    const rawCodes = await db.accessCode.findMany({
      where,
      include: {
        department: { select: { name: true, code: true } },
        school: { select: { name: true, code: true } },
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
        schoolId: c.schoolId,
        schoolName: c.school?.name ?? null,
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
  schoolId: z.string().optional(),
  role: z.enum(['LECTURER', 'ADMIN', 'DEAN']).default('LECTURER'),
  maxUses: z.number().int().min(1).max(200).default(1),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  designatedEmail: z.string().email().optional().or(z.literal('')),
  designatedName: z.string().max(100).optional().or(z.literal('')),
  sendEmailImmediately: z.boolean().optional(),
})

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    if (user.role !== 'ADMIN' && user.role !== 'DEAN' && user.role !== 'SUPERADMIN') {
      throw new ForbiddenError('Only deans, department heads and administrators can generate access codes')
    }

    const parsed = createCodeSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))
    const { role, departmentId, schoolId } = parsed.data

    // Invite hierarchy: SUPERADMIN mints Dean codes, Dean mints HoD codes,
    // HoD mints lecturer codes.
    if (role === 'DEAN' && user.role !== 'SUPERADMIN') {
      throw new ForbiddenError('Only the platform super admin can create Dean access codes')
    }
    if (role === 'ADMIN' && user.role !== 'SUPERADMIN' && user.role !== 'DEAN') {
      throw new ForbiddenError('Only the platform super admin or the school dean can create HoD access codes')
    }

    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
      : null

    // ---- DEAN codes: school-scoped -------------------------------
    if (role === 'DEAN') {
      const targetSchoolId = user.role === 'SUPERADMIN' && schoolId ? schoolId : user.schoolId
      if (!targetSchoolId) {
        throw new BadRequestError('School is required to generate Dean access codes')
      }
      const school = await db.school.findUnique({
        where: { id: targetSchoolId },
        select: { id: true, code: true, name: true, institutionId: true },
      })
      if (!school) throw new NotFoundError('School not found')

      let codeString = ''
      let unique = false
      let attempts = 0
      while (!unique && attempts < 10) {
        attempts++
        codeString = generateAccessCode(school.code, 'DEAN')
        const exists = await db.accessCode.findUnique({ where: { code: codeString } })
        if (!exists) unique = true
      }

      const accessCode = await db.accessCode.create({
        data: {
          code: codeString,
          role: 'DEAN',
          departmentId: null,
          schoolId: school.id,
          maxUses: parsed.data.maxUses,
          expiresAt,
          designatedEmail: parsed.data.designatedEmail || null,
          designatedName: parsed.data.designatedName || null,
          createdById: user.id,
        },
        include: {
          school: { select: { name: true, code: true } },
        },
      })

      if (parsed.data.sendEmailImmediately && parsed.data.designatedEmail) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof req.headers.get === 'function' && req.headers.get('origin')) || 'https://prezaro.com'
        const directLink = `${appUrl.replace(/\/+$/, '')}/?code=${accessCode.code}`
        await sendAppEmail({
          to: parsed.data.designatedEmail,
          subject: `Prezaro Access Code: Dean of ${school.name}`,
          html: accessCodeInvitationHtml(
            parsed.data.designatedName || null,
            accessCode.code,
            'DEAN',
            school.name,
            'Prezaro Academic Portal',
            expiresAt ? expiresAt.toISOString() : null,
            directLink,
          ),
          type: 'ACCESS_CODE_INVITE',
          meta: {
            codeId: accessCode.id,
            code: accessCode.code,
            departmentId: '',
            sentBy: user.email,
          },
        })
      }

      return NextResponse.json({
        code: {
          id: accessCode.id,
          code: accessCode.code,
          role: 'DEAN',
          departmentId: null,
          schoolId: accessCode.schoolId,
          schoolName: accessCode.school?.name ?? null,
          maxUses: accessCode.maxUses,
          usedCount: accessCode.usedCount,
          status: accessCode.status as AccessCode['status'],
          expiresAt: accessCode.expiresAt ? accessCode.expiresAt.toISOString() : null,
          designatedEmail: accessCode.designatedEmail,
          designatedName: accessCode.designatedName,
          createdAt: accessCode.createdAt.toISOString(),
        },
      }, { status: 201 })
    }

    // ---- LECTURER / ADMIN codes: department-scoped ----------------
    let targetDeptId: string | null = null
    if (user.role === 'SUPERADMIN') {
      targetDeptId = departmentId ?? null
    } else if (user.role === 'DEAN') {
      // The dean has no department of their own: they pick one inside their school.
      targetDeptId = departmentId ?? null
      if (!targetDeptId) {
        throw new BadRequestError('Department is required to generate access codes')
      }
    } else {
      targetDeptId = user.departmentId
    }

    if (!targetDeptId) {
      throw new BadRequestError('Department is required to generate access codes')
    }

    const dept = await db.department.findUnique({
      where: { id: targetDeptId },
      select: {
        id: true,
        code: true,
        name: true,
        schoolId: true,
        institution: { select: { name: true } },
      },
    })
    if (!dept) throw new NotFoundError('Department not found')

    // A dean can only mint codes for departments inside their own school.
    if (user.role === 'DEAN' && dept.schoolId !== user.schoolId) {
      throw new ForbiddenError('You can only invite heads for departments within your school')
    }

    let codeString = ''
    let unique = false
    let attempts = 0
    while (!unique && attempts < 10) {
      attempts++
      codeString = generateAccessCode(dept.code, role)
      const exists = await db.accessCode.findUnique({ where: { code: codeString } })
      if (!exists) unique = true
    }

    const accessCode = await db.accessCode.create({
      data: {
        code: codeString,
        role,
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
          role,
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
    if (user.role !== 'ADMIN' && user.role !== 'DEAN' && user.role !== 'SUPERADMIN') {
      throw new ForbiddenError('Only deans, department heads and administrators can revoke access codes')
    }

    const url = new URL(req.url)
    const codeId = url.searchParams.get('id')
    if (!codeId) throw new BadRequestError('Code ID is required')

    const code = await db.accessCode.findUnique({
      where: { id: codeId },
      include: { department: { select: { schoolId: true } } },
    })
    if (!code) throw new NotFoundError('Access code not found')

    const inScope =
      user.role === 'SUPERADMIN' ||
      (user.role === 'DEAN' &&
        !!user.schoolId &&
        (code.schoolId === user.schoolId || code.department?.schoolId === user.schoolId)) ||
      (user.role === 'ADMIN' && code.departmentId === user.departmentId)
    if (!inScope) {
      throw new ForbiddenError('You can only revoke codes within your own school or department')
    }

    await db.accessCode.update({
      where: { id: codeId },
      data: { status: 'REVOKED' },
    })

    return NextResponse.json({ ok: true })
  })
}
