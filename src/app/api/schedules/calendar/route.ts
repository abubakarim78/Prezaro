import { requireUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { handle } from '../../_lib/helpers'

const DAY_CODES = ['', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']

function formatIcsTime(timeStr: string): string {
  return timeStr.replace(':', '') + '00'
}

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)

    const schedules = await db.classSchedule.findMany({
      where: { lecturerId: user.id },
      include: { course: true },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    })

    const nowStr = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

    // Build iCalendar VCALENDAR RFC 5545 format
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Prezaro//Class Schedule//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:Prezaro Classes - ${user.name}`,
      'X-WR-TIMEZONE:UTC',
    ]

    // Reference base date (Monday of current week)
    const today = new Date()
    const currentDay = today.getDay() || 7 // 1 (Mon) .. 7 (Sun)
    const monday = new Date(today)
    monday.setDate(today.getDate() - (currentDay - 1))

    for (const s of schedules) {
      const dayOffset = s.dayOfWeek - 1
      const classDate = new Date(monday)
      classDate.setDate(monday.getDate() + dayOffset)
      const datePrefix = classDate.toISOString().slice(0, 10).replace(/-/g, '')

      const dtStart = `${datePrefix}T${formatIcsTime(s.startTime)}`
      const dtEnd = `${datePrefix}T${formatIcsTime(s.endTime)}`
      const dayCode = DAY_CODES[s.dayOfWeek] || 'MO'

      lines.push(
        'BEGIN:VEVENT',
        `UID:sched-${s.id}@prezaro.com`,
        `DTSTAMP:${nowStr}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `RRULE:FREQ=WEEKLY;BYDAY=${dayCode}`,
        `SUMMARY:${s.course.code} - ${s.course.title}`,
        `DESCRIPTION:Prezaro attendance class for ${s.course.code}. Start session at https://prezaro.com`,
        s.venue ? `LOCATION:${s.venue}` : '',
        'STATUS:CONFIRMED',
        'BEGIN:VALARM',
        `TRIGGER:-PT${s.reminderLeadMinutes}M`,
        'ACTION:DISPLAY',
        `DESCRIPTION:Reminder: ${s.course.code} starts in ${s.reminderLeadMinutes} minutes`,
        'END:VALARM',
        'END:VEVENT'
      )
    }

    lines.push('END:VCALENDAR')
    const calendarContent = lines.filter(Boolean).join('\r\n')

    return new Response(calendarContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="prezaro-classes.ics"',
        'Cache-Control': 'no-cache',
      },
    })
  })
}
