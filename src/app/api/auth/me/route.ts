import { NextResponse } from 'next/server'
import { getSessionUser, signToken } from '@/lib/auth'
import { handle, userDTO } from '../../_lib/helpers'

export async function GET(req: Request) {
  return handle(async () => {
    const user = await getSessionUser(req)
    if (!user) return NextResponse.json({ user: null })
    // Mint a fresh token so cookie-authenticated clients (installed PWA)
    // can also adopt bearer auth — needed in cookie-blocked iframes.
    const token = await signToken({ sub: user.id })
    return NextResponse.json({ user: userDTO(user), token })
  })
}
