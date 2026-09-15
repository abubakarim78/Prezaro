import { compare } from 'bcryptjs'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  BadRequestError,
  UnauthorizedError,
  setAuthCookie,
  signToken,
} from '@/lib/auth'
import { handle, readJson, userDTO, zodMessage } from '../../_lib/helpers'

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
})

export async function POST(req: Request) {
  return handle(async () => {
    const parsed = loginSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    const email = parsed.data.email.toLowerCase()
    const user = await db.user.findUnique({
      where: { email },
      include: { department: true },
    })
    if (!user || !(await compare(parsed.data.password, user.passwordHash))) {
      throw new UnauthorizedError('Invalid email or password')
    }

    const token = await signToken({ sub: user.id })
    // Token is also returned in the body so clients in cookie-blocked
    // contexts (cross-origin preview iframes) can use bearer auth.
    const res = NextResponse.json({ user: userDTO(user), token })
    return setAuthCookie(res, token)
  })
}
