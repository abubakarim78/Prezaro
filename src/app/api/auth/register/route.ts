import { hash } from 'bcryptjs'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  BadRequestError,
  ConflictError,
  setAuthCookie,
  signToken,
} from '@/lib/auth'
import { handle, readJson, userDTO, zodMessage } from '../../_lib/helpers'
import {
  newAccountAlertHtml,
  queueEmail,
  welcomeEmailHtml,
} from '@/lib/email'

const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Enter your full name')
    .max(80, 'Name is too long'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

/**
 * Self-service sign-up. The very first account on a fresh instance
 * becomes the ADMIN (same rule as the deploy bootstrap); everyone
 * after that signs up as a LECTURER.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const parsed = registerSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    const { name, email, password } = parsed.data

    const existing = await db.user.findUnique({
      where: { email },
      select: { id: true },
    })
    if (existing) {
      throw new ConflictError(
        'An account with this email already exists — sign in instead',
      )
    }

    const role = (await db.user.count()) === 0 ? 'ADMIN' : 'LECTURER'
    const passwordHash = await hash(password, 10)

    let user
    try {
      user = await db.user.create({
        data: { email, passwordHash, name, role },
      })
    } catch (err: unknown) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictError(
          'An account with this email already exists — sign in instead',
        )
      }
      throw err
    }

    // Notifications — fire-and-forget so sign-up never waits on mail I/O.
    queueEmail({
      to: user.email,
      subject: 'Welcome to Rollmark',
      html: welcomeEmailHtml(user.name),
      type: 'WELCOME',
      meta: { userId: user.id, role },
    })
    const admins = await db.user.findMany({
      where: { role: 'ADMIN', email: { not: user.email } },
      select: { email: true },
      take: 5,
    })
    for (const admin of admins) {
      queueEmail({
        to: admin.email,
        subject: `New ${role.toLowerCase()} registered — ${user.name}`,
        html: newAccountAlertHtml(user.name, user.email, role),
        type: 'ACCOUNT_ALERT',
        meta: { userId: user.id },
      })
    }

    const token = await signToken({ sub: user.id })
    const res = NextResponse.json({ user: userDTO(user), token })
    return setAuthCookie(res, token)
  })
}
