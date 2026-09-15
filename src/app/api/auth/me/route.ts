import { NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { handle, userDTO } from '../../_lib/helpers'

export async function GET(req: Request) {
  return handle(async () => {
    const user = await getSessionUser(req)
    return NextResponse.json({ user: user ? userDTO(user) : null })
  })
}
