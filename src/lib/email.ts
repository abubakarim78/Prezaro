// ============================================================
// ClassCheck — server-only email notifications (outbox pattern)
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
  | 'TEST'

export interface SmtpStatus {
  configured: boolean
  host: string | null
  from: string | null
}

/** Read SMTP configuration from the environment (cheap, no I/O). */
export function smtpStatus(): SmtpStatus {
  const host = process.env.SMTP_HOST?.trim() || null
  const from =
    process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || null
  return { configured: Boolean(host), host, from }
}

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
  const status = smtpStatus()
  let delivery: 'SENT' | 'SIMULATED' | 'FAILED' = 'SIMULATED'
  let error: string | null = null

  if (status.configured) {
    try {
      await getTransport().sendMail({
        from: status.from ?? 'ClassCheck <no-reply@classcheck.app>',
        to: email.to,
        subject: email.subject,
        html: email.html,
      })
      delivery = 'SENT'
    } catch (err: unknown) {
      delivery = 'FAILED'
      error = err instanceof Error ? err.message : 'Unknown SMTP error'
      console.error(`[email] ${email.type} → ${email.to} failed:`, error)
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
  name: 'ClassCheck',
  color: '#7c3aed',
  colorDark: '#5b21b6',
  wash: '#f4f0fd',
  text: '#221c35',
  muted: '#6d6880',
  border: '#e7e3f2',
}

function layout(title: string, bodyRows: string, footerNote?: string): string {
  const note = footerNote
    ? `<tr><td style="padding:18px 28px 8px;font:12px/1.5 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${BRAND.muted};">${footerNote}</td></tr>`
    : ''
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#faf9fc;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf9fc;padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${BRAND.border};border-radius:16px;overflow:hidden;">
    <tr><td style="background:${BRAND.color};padding:22px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="font:700 18px/1 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#ffffff;letter-spacing:0.2px;">&#9986;&#65039; ${BRAND.name}</td>
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
