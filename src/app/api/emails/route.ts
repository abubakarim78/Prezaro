import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ForbiddenError, requireUser } from '@/lib/auth'
import { handle } from '../_lib/helpers'
import { smtpStatus } from '@/lib/email'

/**
 * Email outbox + delivery-mode status. Admin-only: the log can contain
 * student email addresses and account activity.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    if (user.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can view the email log')
    }
    const rows = await db.emailLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    const status = smtpStatus()
    return NextResponse.json({
      config: {
        smtpConfigured: status.configured,
        provider: status.provider,
        host: status.host,
        from: status.from,
      },
      emails: rows.map((r) => ({
        id: r.id,
        to: r.to,
        subject: r.subject,
        type: r.type,
        status: r.status,
        error: r.error,
        createdAt: r.createdAt.toISOString(),
        bodyHtml: r.bodyHtml,
      })),
    })
  })
}
