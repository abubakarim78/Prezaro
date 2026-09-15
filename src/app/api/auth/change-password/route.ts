import { compare, hash } from 'bcryptjs'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { BadRequestError, UnauthorizedError, getSessionUser } from '@/lib/auth'
import { handle, readJson, zodMessage } from '../../_lib/helpers'

const changeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
})

export async function POST(req: Request) {
  return handle(async () => {
    const session = await getSessionUser(req)
    if (!session) throw new UnauthorizedError('Not signed in')

    const parsed = changeSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    const user = await db.user.findUnique({ where: { id: session.id } })
    if (!user) throw new UnauthorizedError('Not signed in')

    const ok = await compare(parsed.data.currentPassword, user.passwordHash)
    if (!ok) throw new BadRequestError('Current password is incorrect')

    const passwordHash = await hash(parsed.data.newPassword, 10)
    await db.user.update({ where: { id: user.id }, data: { passwordHash } })

    return NextResponse.json({ ok: true })
  })
}
