import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handle, requireSuperAdmin } from '../../_lib/helpers'

export async function GET(req: Request) {
  return handle(async () => {
    await requireSuperAdmin(req)

    const logs = await db.emailLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        to: true,
        subject: true,
        type: true,
        status: true,
        error: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      logs: logs.map((l) => ({
        ...l,
        createdAt: l.createdAt.toISOString(),
      })),
    })
  })
}
