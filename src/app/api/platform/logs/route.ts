import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handle, NotFoundError, requireSuperAdmin } from '../../_lib/helpers'

export async function GET(req: Request) {
  return handle(async () => {
    await requireSuperAdmin(req)

    // Single-email fetch (?id=) — returns the rendered HTML body for the
    // Outbox Audit viewer without loading every body into the list.
    const id = new URL(req.url).searchParams.get('id')
    if (id) {
      const row = await db.emailLog.findUnique({
        where: { id },
        select: { id: true, subject: true, bodyHtml: true },
      })
      if (!row) throw new NotFoundError('Email not found')
      return NextResponse.json(row)
    }

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
