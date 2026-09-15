import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { handle } from '../_lib/helpers'

export async function GET(req: Request) {
  return handle(async () => {
    await requireUser(req)
    const departments = await db.department.findMany({ orderBy: { name: 'asc' } })
    return NextResponse.json({ departments })
  })
}
