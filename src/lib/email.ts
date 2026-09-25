// ============================================================
// Prezaro — server-only email notifications (outbox pattern)
//
// Delivery modes:
//  - SMTP configured (SMTP_HOST env) → real delivery via nodemailer,
//    logged as SENT (or FAILED with the SMTP error).
//  - No SMTP → "app outbox" mode: the rendered email is stored as
//    SIMULATED and is viewable in Settings → Email notifications.
//
// Every email is persisted to the EmailLog table, and send failures
// NEVER propagate into the caller's request path.
// ============================================================
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { db } from '@/lib/db'

export type EmailType =
  | 'WELCOME'
  | 'ACCOUNT_ALERT'
  | 'STUDENT_REGISTERED'
  | 'COURSE_ENROLLMENT'
  | 'CLASS_REMINDER'
  | 'CLASS_RESCHEDULED'
  | 'ACCESS_CODE_INVITE'
  | 'TEST'

export interface EmailConfigStatus {
  configured: boolean
  provider: 'resend' | 'smtp' | 'none'
  host: string | null
  from: string | null
}

export type SmtpStatus = EmailConfigStatus

/** Read email provider configuration from the environment (cheap, no I/O). */
export function emailProviderStatus(): EmailConfigStatus {
  const resendKey = process.env.RESEND_API_KEY?.trim()
  if (resendKey) {
    const from =
      process.env.RESEND_FROM?.trim() ||
      process.env.SMTP_FROM?.trim() ||
      'Prezaro <onboarding@resend.dev>'
    return {
      configured: true,
      provider: 'resend',
      host: 'api.resend.com',
      from,
    }
  }

  const host = process.env.SMTP_HOST?.trim() || null
  const from =
    process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || null
  return {
    configured: Boolean(host),
    provider: host ? 'smtp' : 'none',
    host,
    from,
  }
}

/** Backwards-compatible alias for existing call sites. */
export const smtpStatus = emailProviderStatus

let cachedTransport: { key: string; transporter: Transporter } | null = null

function getTransport(): Transporter {
  const host = process.env.SMTP_HOST!.trim()
  const port = Number(process.env.SMTP_PORT ?? 587)
  const user = process.env.SMTP_USER?.trim() || undefined
  const pass = process.env.SMTP_PASS ?? undefined
  const secure = process.env.SMTP_SECURE === 'true' || port === 465
  const key = `${host}|${port}|${user ?? ''}|${secure ? 's' : 'p'}`
  if (cachedTransport?.key === key) return cachedTransport.transporter
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
  })
  cachedTransport = { key, transporter }
  return transporter
}

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  type: EmailType
  meta?: Record<string, string>
}

/**
 * Send an email (or record it as SIMULATED) and persist it to the outbox.
 * Resolves even when delivery fails — the failure is logged, not thrown.
 */
export async function sendAppEmail(email: OutgoingEmail): Promise<
  { status: 'SENT' | 'SIMULATED' | 'FAILED'; error: string | null }
> {
  const status = emailProviderStatus()
  let delivery: 'SENT' | 'SIMULATED' | 'FAILED' = 'SIMULATED'
  let error: string | null = null

  if (status.configured) {
    try {
      if (status.provider === 'resend') {
        const apiKey = process.env.RESEND_API_KEY!.trim()
        const from = status.from || 'Prezaro <onboarding@resend.dev>'
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: [email.to],
            subject: email.subject,
            html: email.html,
          }),
        })
        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as {
            message?: string
          }
          throw new Error(
            errData.message || `Resend API returned status ${res.status}`,
          )
        }
      } else {
        await getTransport().sendMail({
          from: status.from ?? 'Prezaro <no-reply@prezaro.app>',
          to: email.to,
          subject: email.subject,
          html: email.html,
        })
      }
      delivery = 'SENT'
    } catch (err: unknown) {
      delivery = 'FAILED'
      error = err instanceof Error ? err.message : 'Unknown email delivery error'
      console.error(`[email] ${email.type} → ${email.to} failed (${status.provider}):`, error)
    }
  }

  try {
    await db.emailLog.create({
      data: {
        to: email.to,
        subject: email.subject,
        bodyHtml: email.html,
        type: email.type,
        status: delivery,
        error,
        metaJson: JSON.stringify(email.meta ?? {}),
      },
    })
  } catch (err: unknown) {
    console.error('[email] failed to persist EmailLog:', err)
  }

  return { status: delivery, error }
}

/**
 * Fire-and-forget variant for request paths that must not block on I/O
 * (sign-up, student import, course enrollment).
 */
export function queueEmail(email: OutgoingEmail): void {
  void sendAppEmail(email).catch((err: unknown) => {
    console.error('[email] unexpected failure in queueEmail:', err)
  })
}

// ---- Branded HTML templates -----------------------------------
// Table-based markup renders reliably across email clients.

const BRAND = {
  name: 'Prezaro',
  color: '#567031',
  colorDark: '#43571f',
  wash: '#eef3e6',
  text: '#1d2417',
  muted: '#6b7263',
  border: '#e2e8d8',
}

function layout(title: string, bodyRows: string, footerNote?: string): string {
  const note = footerNote
    ? `<tr><td style="padding:18px 28px 8px;font:12px/1.5 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${BRAND.muted};">${footerNote}</td></tr>`
    : ''
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f8faf4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8faf4;padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
    <tr><td style="background:${BRAND.color};padding:22px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="font:700 18px/1 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#ffffff;letter-spacing:0.2px;">&#128065;&#65039; ${BRAND.name}</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:26px 28px 4px;font:700 20px/1.3 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${BRAND.text};">${title}</td></tr>
    ${bodyRows}
    ${note}
    <tr><td style="padding:20px 28px 26px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${BRAND.border};"><tr><td style="padding-top:14px;font:12px/1.5 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${BRAND.muted};">
        ${BRAND.name} — face attendance for lecture halls. You are receiving this because an account or registration references this address.
      </td></tr></table>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`
}

function row(content: string): string {
  return `<tr><td style="padding:10px 28px;font:14px/1.6 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${BRAND.text};">${content}</td></tr>`
}

function highlight(content: string): string {
  return `<tr><td style="padding:14px 28px;"><div style="background:${BRAND.wash};border:1px solid ${BRAND.border};border-radius:12px;padding:14px 16px;font:14px/1.6 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${BRAND.text};">${content}</div></td></tr>`
}

export function welcomeEmailHtml(name: string): string {
  return layout(
    `Welcome aboard, ${escapeHtml(name)}!`,
    row(`Your <strong>${BRAND.name}</strong> account has been created successfully.`) +
      row('Sign in to set up your department, create your courses and import your student roster — then take face attendance in seconds.') +
      highlight('<strong>What happens next:</strong> complete the short setup wizard after signing in, import students (CSV or one-by-one), and enrol their face templates before your first session.') +
      row('If you did not expect this email, you can safely ignore it — no account will be active unless you use it.'),
    'This is an automated notification from your department\u2019s attendance system.',
  )
}

export function newAccountAlertHtml(name: string, email: string, role: string): string {
  return layout(
    'New account registered',
    row(`A new <strong>${escapeHtml(role.toLowerCase())}</strong> account was just created:`) +
      highlight(`<strong>${escapeHtml(name)}</strong><br/>${escapeHtml(email)}`) +
      row('No action is needed — the account starts with lecturer-level access and completes its own department setup on first sign-in.'),
  )
}

export function studentRegisteredHtml(
  name: string,
  studentIndex: string,
  departmentName: string,
): string {
  return layout(
    `You've been registered, ${escapeHtml(name)}`,
    row(`You have been added to the <strong>${escapeHtml(departmentName)}</strong> attendance register on ${BRAND.name}.`) +
      highlight(`<strong>Index number:</strong> ${escapeHtml(studentIndex)}<br/><strong>Department:</strong> ${escapeHtml(departmentName)}`) +
      row('Attendance is taken by face recognition during lectures. If you prefer not to enrol your face, your lecturer can simply mark you present during the end-of-class review — nothing is required from you.') +
      row('Questions about your attendance record? Contact your department or lecturer directly.'),
    'You will not receive routine emails from this system — only registration confirmations like this one.',
  )
}

export function courseEnrollmentHtml(
  name: string,
  studentIndex: string,
  courseCode: string,
  courseTitle: string,
  lecturerName: string,
): string {
  return layout(
    `Enrolled in ${escapeHtml(courseCode)}`,
    row(`Hi ${escapeHtml(name)} — you have been enrolled in a new course on ${BRAND.name}:`) +
      highlight(`<strong>${escapeHtml(courseCode)} — ${escapeHtml(courseTitle)}</strong><br/>Lecturer: ${escapeHtml(lecturerName)}<br/>Your index number: ${escapeHtml(studentIndex)}`) +
      row('Your attendance for this course will be recorded automatically during lectures once your face is enrolled, or manually by your lecturer.'),
  )
}

export function classReminderHtml(
  lecturerName: string,
  courseCode: string,
  courseTitle: string,
  timeRange: string,
  venue: string | null,
  leadMinutes: number,
  appUrl: string,
): string {
  const scanLink = `${appUrl.replace(/\/+$/, '')}?action=scan&courseCode=${encodeURIComponent(courseCode)}`
  return layout(
    `Upcoming class: ${escapeHtml(courseCode)} in ${leadMinutes} minutes`,
    row(`Hi ${escapeHtml(lecturerName)} — your class is scheduled to begin shortly.`) +
      highlight(`
        <div style="font-size:16px;font-weight:700;color:${BRAND.text};margin-bottom:6px;">${escapeHtml(courseCode)} — ${escapeHtml(courseTitle)}</div>
        <div style="margin-bottom:4px;">&#9200; <strong>Time:</strong> ${escapeHtml(timeRange)}</div>
        ${venue ? `<div style="margin-bottom:4px;">&#128205; <strong>Venue:</strong> ${escapeHtml(venue)}</div>` : ''}
      `) +
      row(`
        <div style="text-align:center;padding:12px 0;">
          <a href="${scanLink}" style="display:inline-block;background:#0d9488;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 28px;border-radius:10px;">Take Attendance Now &rarr;</a>
        </div>
      `) +
      row('You can launch the face scanner directly from your phone or laptop using the button above.'),
    'Prezaro automatic class reminder.',
  )
}

export function classRescheduledHtml(
  lecturerName: string,
  courseCode: string,
  courseTitle: string,
  oldTime: string,
  newTime: string,
  venue: string | null,
  reason: string | null,
): string {
  return layout(
    `Class Rescheduled: ${escapeHtml(courseCode)}`,
    row(`Hello — your lecture schedule for <strong>${escapeHtml(courseCode)} (${escapeHtml(courseTitle)})</strong> has been updated by ${escapeHtml(lecturerName)}.`) +
      highlight(`
        <div style="font-size:15px;font-weight:700;color:${BRAND.text};margin-bottom:6px;">${escapeHtml(courseCode)} — ${escapeHtml(courseTitle)}</div>
        <div style="margin-bottom:4px;color:#991b1b;"><strike>&#128197; <strong>Previous:</strong> ${escapeHtml(oldTime)}</strike></div>
        <div style="margin-bottom:4px;color:#065f46;font-weight:600;">&#9989; <strong>New Time:</strong> ${escapeHtml(newTime)}</div>
        ${venue ? `<div style="margin-bottom:4px;">&#128205; <strong>Venue:</strong> ${escapeHtml(venue)}</div>` : ''}
        ${reason ? `<div style="margin-top:8px;padding-top:6px;border-top:1px solid ${BRAND.border};font-size:13px;color:${BRAND.muted};">&#128221; <em>Note: ${escapeHtml(reason)}</em></div>` : ''}
      `) +
      row('Please take note of the updated schedule. Your attendance will be marked at the new time.'),
    'Prezaro timetable notification.',
  )
}

export function accessCodeInvitationHtml(
  name: string | null,
  code: string,
  role: string,
  departmentName: string,
  institutionName: string,
  expiresAt: string | null,
  directLink: string,
): string {
  const roleLabel = role === 'ADMIN' ? 'Department Administrator / Head of Department' : 'Lecturer'
  const greeting = name ? `Dear ${escapeHtml(name)},` : 'Hello,'
  return layout(
    `Prezaro Invitation: Access Code for ${escapeHtml(departmentName)}`,
    row(`${greeting}<br/><br/>You have been invited to join <strong>${escapeHtml(institutionName)}</strong> (${escapeHtml(departmentName)}) on ${BRAND.name} as a <strong>${escapeHtml(roleLabel)}</strong>.`) +
      highlight(`
        <div style="font-size:12px;color:${BRAND.muted};margin-bottom:6px;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;">Your Designated Access Code</div>
        <div style="font-size:24px;font-weight:800;letter-spacing:0.12em;font-family:monospace;color:${BRAND.text};margin-bottom:8px;">${escapeHtml(code)}</div>
        <div style="font-size:13px;color:${BRAND.muted};line-height:1.6;">
          <strong>Designated Role:</strong> ${escapeHtml(roleLabel)}<br/>
          <strong>Department:</strong> ${escapeHtml(departmentName)}<br/>
          ${expiresAt ? `<strong>Valid Until:</strong> ${new Date(expiresAt).toLocaleDateString()}` : '<strong>Validity:</strong> No expiration date'}
        </div>
      `) +
      row(`
        <div style="text-align:center;padding:16px 0;">
          <a href="${directLink}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 28px;border-radius:10px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">Activate Account & Join Department &rarr;</a>
        </div>
      `) +
      row(`Alternatively, open <a href="${directLink}" style="color:#059669;word-break:break-all;">${directLink}</a> and select <strong>Join with Access Code</strong>.`) +
      row('Once joined, your teaching roster and attendance sessions will be loaded automatically into your account.'),
    'Prezaro Secure Department Access Invitation.',
  )
}

export function testEmailHtml(name: string): string {
  return layout(
    'Test email — it works!',
    row(`Hello ${escapeHtml(name)}, this is a test notification from your ${BRAND.name} instance.`) +
      row('If SMTP is configured this message was genuinely delivered; otherwise it was recorded in the app outbox you are viewing right now.'),
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
