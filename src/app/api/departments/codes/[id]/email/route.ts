import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { BadRequestError, ForbiddenError, NotFoundError, handle, readJson, zodMessage } from '../../../../_lib/helpers'
import { sendAppEmail, accessCodeInvitationHtml } from '@/lib/email'

const sendCodeEmailSchema = z.object({
  recipientEmail: z.string().email().optional(),
  recipientName: z.string().max(100).optional(),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const user = await requireUser(req)
    if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
      throw new ForbiddenError('Only department heads and administrators can send access code invitations')
    }

    const { id } = await params
    const code = await db.accessCode.findUnique({
      where: { id },
      include: {
        department: {
          include: {
            institution: { select: { name: true } },
          },
        },
      },
    })

    if (!code) throw new NotFoundError('Access code not found')

    if (user.role !== 'SUPERADMIN' && code.departmentId !== user.departmentId) {
      throw new ForbiddenError('You can only send invitation codes for your own department')
    }

    if (code.status !== 'ACTIVE') {
      throw new BadRequestError(`Cannot send inactive access code (status is ${code.status})`)
    }

    const body = await readJson(req).catch(() => ({}))
    const parsed = sendCodeEmailSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    const targetEmail = parsed.data.recipientEmail || code.designatedEmail
    if (!targetEmail) {
      throw new BadRequestError('Recipient email is required to send the invitation')
    }

    const recipientName = parsed.data.recipientName || code.designatedName || null
    const deptName = code.department?.name || 'Academic Department'
    const instName = code.department?.institution?.name || 'Prezaro Academic Portal'

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || (typeof req.headers.get === 'function' && req.headers.get('origin')) || 'https://prezaro.com'
    const directLink = `${appUrl.replace(/\/+$/, '')}/?code=${code.code}`

    const result = await sendAppEmail({
      to: targetEmail,
      subject: `Prezaro Access Code: Join ${deptName}`,
      html: accessCodeInvitationHtml(
        recipientName,
        code.code,
        code.role,
        deptName,
        instName,
        code.expiresAt ? code.expiresAt.toISOString() : null,
        directLink,
      ),
      type: 'ACCESS_CODE_INVITE',
      meta: {
        codeId: code.id,
        code: code.code,
        departmentId: code.departmentId,
        sentBy: user.email,
        targetEmail,
      },
    })

    // If designatedEmail wasn't set, update it for record keeping
    if (!code.designatedEmail) {
      await db.accessCode.update({
        where: { id: code.id },
        data: {
          designatedEmail: targetEmail,
          designatedName: recipientName,
        },
      })
    }

    return NextResponse.json({
      ok: true,
      deliveredStatus: result.status,
      error: result.error,
      recipientEmail: targetEmail,
    })
  })
}
