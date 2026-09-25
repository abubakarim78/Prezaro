import { compare, hash } from 'bcryptjs'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { BadRequestError, ConflictError, NotFoundError, handle, readJson, userDTO, zodMessage } from '../../_lib/helpers'
import { setAuthCookie, signToken } from '@/lib/auth'

const inspectSchema = z.object({
  action: z.literal('inspect'),
  code: z.string().trim().min(3, 'Enter a valid access code'),
})

const claimSchema = z.object({
  action: z.literal('claim'),
  code: z.string().trim().min(3, 'Enter a valid access code'),
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().email('Enter a valid email address').toLowerCase(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function POST(req: Request) {
  return handle(async () => {
    const raw = await readJson(req)
    const action = (raw as Record<string, unknown>)?.action

    if (action === 'inspect') {
      const parsed = inspectSchema.safeParse(raw)
      if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

      const normalized = parsed.data.code.toUpperCase()
      const accessCode = await db.accessCode.findUnique({
        where: { code: normalized },
        include: {
          department: {
            include: { institution: { select: { id: true, name: true, slug: true } } },
          },
        },
      })

      if (!accessCode) {
        throw new NotFoundError('Invalid access code. Please check with your Department Head.')
      }

      const now = new Date()
      if (accessCode.status === 'REVOKED') {
        throw new BadRequestError('This access code has been revoked.')
      }
      if (accessCode.expiresAt && accessCode.expiresAt < now) {
        throw new BadRequestError('This access code has expired.')
      }
      if (accessCode.usedCount >= accessCode.maxUses) {
        throw new BadRequestError('This access code has already reached its maximum number of uses.')
      }

      return NextResponse.json({
        valid: true,
        code: accessCode.code,
        role: accessCode.role,
        departmentName: accessCode.department.name,
        departmentCode: accessCode.department.code,
        institutionName: accessCode.department.institution?.name ?? 'Prezaro Campus',
        designatedEmail: accessCode.designatedEmail,
        designatedName: accessCode.designatedName,
      })
    }

    if (action === 'claim') {
      const parsed = claimSchema.safeParse(raw)
      if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

      const { code, name, email, password } = parsed.data
      const normalized = code.toUpperCase()

      const accessCode = await db.accessCode.findUnique({
        where: { code: normalized },
        include: {
          department: {
            include: { institution: true },
          },
        },
      })

      if (!accessCode) {
        throw new NotFoundError('Invalid access code')
      }

      const now = new Date()
      if (accessCode.status === 'REVOKED') throw new BadRequestError('This access code has been revoked')
      if (accessCode.expiresAt && accessCode.expiresAt < now) throw new BadRequestError('This access code has expired')
      if (accessCode.usedCount >= accessCode.maxUses) throw new BadRequestError('This access code has already been used')

      if (accessCode.designatedEmail && accessCode.designatedEmail.toLowerCase() !== email.toLowerCase()) {
        throw new BadRequestError(`This code was specifically assigned to ${accessCode.designatedEmail}`)
      }

      // Check if user already exists
      const existingUser = await db.user.findUnique({ where: { email } })
      let finalUser

      if (existingUser) {
        const validPw = await compare(password, existingUser.passwordHash)
        if (!validPw) {
          throw new ConflictError('An account with this email already exists. The password you entered does not match.')
        }

        finalUser = await db.user.update({
          where: { id: existingUser.id },
          data: {
            name: name || existingUser.name,
            role: accessCode.role,
            departmentId: accessCode.departmentId,
            institutionId: accessCode.department.institutionId,
            onboarded: true,
            codeClaimedId: accessCode.id,
          },
          include: {
            department: true,
            institution: true,
          },
        })
      } else {
        const passwordHash = await hash(password, 10)
        finalUser = await db.user.create({
          data: {
            name,
            email,
            passwordHash,
            role: accessCode.role,
            departmentId: accessCode.departmentId,
            institutionId: accessCode.department.institutionId,
            onboarded: true,
            codeClaimedId: accessCode.id,
          },
          include: {
            department: true,
            institution: true,
          },
        })
      }

      // Increment usage count and update status if exhausted
      const newUsedCount = accessCode.usedCount + 1
      await db.accessCode.update({
        where: { id: accessCode.id },
        data: {
          usedCount: newUsedCount,
          status: newUsedCount >= accessCode.maxUses ? 'EXHAUSTED' : 'ACTIVE',
        },
      })

      const token = await signToken({ sub: finalUser.id })
      const res = NextResponse.json({ user: userDTO(finalUser), token }, { status: 201 })
      return setAuthCookie(res, token)
    }

    throw new BadRequestError('Invalid action parameter')
  })
}
