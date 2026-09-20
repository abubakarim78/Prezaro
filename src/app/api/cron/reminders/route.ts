import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { classReminderHtml, sendAppEmail } from '@/lib/email'

export async function GET(req: Request) {
  return executeReminders(req)
}

export async function POST(req: Request) {
  return executeReminders(req)
}

async function executeReminders(req: Request) {
  const url = new URL(req.url)
  const authHeader = req.headers.get('authorization')
  const secretParam = url.searchParams.get('secret')
  const cronSecret = process.env.CRON_SECRET

  // If CRON_SECRET is set in environment, require it (Bearer or ?secret=)
  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && secretParam !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  // JavaScript getDay(): 0 = Sun, 1 = Mon ... 6 = Sat
  // Our schema: 1 = Mon ... 7 = Sun
  const jsDay = now.getDay()
  const todayDayOfWeek = jsDay === 0 ? 7 : jsDay
  const todayDateStr = now.toISOString().slice(0, 10) // YYYY-MM-DD

  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  // Find all active schedules for today with notifyEmail = true
  const schedules = await db.classSchedule.findMany({
    where: {
      dayOfWeek: todayDayOfWeek,
      notifyEmail: true,
      OR: [
        { lastNotifiedDate: null },
        { lastNotifiedDate: { not: todayDateStr } },
      ],
    },
    include: {
      course: true,
      lecturer: true,
    },
  })

  const appUrl =
    process.env.APP_URL ||
    process.env.NEXTAUTH_URL ||
    `https://${req.headers.get('host') || 'prezaro.com'}`

  const notified: string[] = []

  for (const s of schedules) {
    const [startH, startM] = s.startTime.split(':').map(Number)
    const classStartMinutes = startH * 60 + startM
    const diff = classStartMinutes - currentMinutes

    // Check if class starts within the reminder window:
    // between (leadMinutes - 5) and (leadMinutes + 20) minutes from now
    // e.g., if lead is 30 mins, trigger when diff is between 0 and 45 mins.
    const lead = s.reminderLeadMinutes || 30
    if (diff >= -5 && diff <= lead + 10) {
      const timeRange = `${s.startTime} – ${s.endTime}`
      const html = classReminderHtml(
        s.lecturer.name,
        s.course.code,
        s.course.title,
        timeRange,
        s.venue,
        Math.max(1, diff),
        appUrl
      )

      await sendAppEmail({
        to: s.lecturer.email,
        subject: `Upcoming class reminder: ${s.course.code} starts at ${s.startTime}`,
        html,
        type: 'CLASS_REMINDER',
        meta: {
          scheduleId: s.id,
          courseCode: s.course.code,
          lecturerId: s.lecturerId,
        },
      })

      await db.classSchedule.update({
        where: { id: s.id },
        data: { lastNotifiedDate: todayDateStr },
      })

      notified.push(`${s.course.code} -> ${s.lecturer.email}`)
    }
  }

  return NextResponse.json({
    ok: true,
    checked: schedules.length,
    sent: notified.length,
    notified,
    timestamp: now.toISOString(),
  })
}
