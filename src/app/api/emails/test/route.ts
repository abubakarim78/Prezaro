import { NextResponse } from 'next/server'
import { ForbiddenError, requireUser } from '@/lib/auth'
import { handle } from '../../_lib/helpers'
import { sendAppEmail, testEmailHtml } from '@/lib/email'

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    if (user.role !== 'ADMIN') {
      throw new ForbiddenError('Only administrators can send test emails')
    }

    const html = testEmailHtml(user.name)
    const result = await sendAppEmail({
      to: user.email,
      subject: 'Prezaro — test notification',
      html,
      type: 'TEST',
      meta: { initiatedBy: user.id },
    })

    return NextResponse.json({
      ok: result.status === 'SENT',
      status: result.status,
      error: result.error,
    })
  })
}
