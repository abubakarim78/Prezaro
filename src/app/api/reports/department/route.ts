import { format, startOfWeek } from 'date-fns'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { handle, resolveThreshold } from '../../_lib/helpers'

/**
 * Department-wide report for the current user's department (Dean:
 * aggregated across all departments of their school): per-course avg
 * attendance, at-risk students, 6-week trend.
 */
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    const threshold = await resolveThreshold(
      user,
      new URL(req.url).searchParams.get('threshold'),
    )
    const deanSchoolId = user.role === 'DEAN' ? user.schoolId : null
    const departmentName = deanSchoolId
      ? (user.school?.name ?? '')
      : (user.department?.name ?? '')

    if (!user.departmentId && !deanSchoolId) {
      return NextResponse.json({
        report: { departmentName, courses: [], atRisk: [], trend: [] },
      })
    }

    const courses = await db.course.findMany({
      where: deanSchoolId
        ? { department: { schoolId: deanSchoolId } }
        : { departmentId: user.departmentId! },
      include: {
        _count: { select: { enrollments: true } },
        sessions: {
          where: { status: 'COMPLETED' },
          select: { id: true, startedAt: true },
        },
      },
      orderBy: { code: 'asc' },
    })

    const allSessionIds = courses.flatMap((c) => c.sessions.map((s) => s.id))
    const records = await db.attendanceRecord.findMany({
      where: { sessionId: { in: allSessionIds } },
      select: { sessionId: true, studentId: true, status: true },
    })

    const sessionCourse = new Map<string, string>()
    for (const c of courses) {
      for (const s of c.sessions) sessionCourse.set(s.id, c.id)
    }

    // attended counts: courseId → studentId → attended session count
    const attendedByCourse = new Map<string, Map<string, number>>()
    const attendedPerSession = new Map<string, number>()
    for (const r of records) {
      if (r.status !== 'PRESENT' && r.status !== 'LATE') continue
      const courseId = sessionCourse.get(r.sessionId)
      if (!courseId) continue
      const m = attendedByCourse.get(courseId) ?? new Map<string, number>()
      m.set(r.studentId, (m.get(r.studentId) ?? 0) + 1)
      attendedByCourse.set(courseId, m)
      attendedPerSession.set(r.sessionId, (attendedPerSession.get(r.sessionId) ?? 0) + 1)
    }

    // per-session presentPercent (against that course's roster size)
    const sessionPercent = new Map<string, number>()
    for (const c of courses) {
      const roster = c._count.enrollments
      for (const s of c.sessions) {
        const attended = attendedPerSession.get(s.id) ?? 0
        sessionPercent.set(
          s.id,
          roster > 0 ? Math.round((attended / roster) * 100) : 0,
        )
      }
    }

    const courseReports = courses.map((c) => {
      const percents = c.sessions.map((s) => sessionPercent.get(s.id) ?? 0)
      return {
        id: c.id,
        code: c.code,
        title: c.title,
        studentCount: c._count.enrollments,
        sessionCount: c.sessions.length,
        avgAttendance: percents.length
          ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)
          : 0,
      }
    })

    // At-risk students across department courses
    const atRisk: { studentId: string; name: string; courseCode: string; percent: number }[] = []
    for (const c of courses) {
      if (c.sessions.length === 0) continue
      const counts = attendedByCourse.get(c.id) ?? new Map<string, number>()
      const enrollments = await db.enrollment.findMany({
        where: { courseId: c.id },
        include: { student: true },
      })
      for (const e of enrollments) {
        const attended = counts.get(e.student.id) ?? 0
        const percent = Math.round((attended / c.sessions.length) * 100)
        if (percent < threshold) {
          atRisk.push({
            studentId: e.student.studentId,
            name: `${e.student.firstName} ${e.student.lastName}`,
            courseCode: c.code,
            percent,
          })
        }
      }
    }
    atRisk.sort((a, b) => a.percent - b.percent)

    // Weekly trend: last 6 weeks (Mon-based), avg of session presentPercent
    const sessionStartedAt = new Map<string, Date>(
      courses.flatMap((c) => c.sessions.map((s) => [s.id, s.startedAt] as const)),
    )
    const trend: { label: string; avgPercent: number }[] = []
    const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
    for (let i = 5; i >= 0; i--) {
      const ws = new Date(thisWeekStart)
      ws.setDate(ws.getDate() - i * 7)
      const we = new Date(ws)
      we.setDate(we.getDate() + 7)
      const inWeek = allSessionIds.filter((id) => {
        const started = sessionStartedAt.get(id)
        return started ? started >= ws && started < we : false
      })
      const percents = inWeek.map((id) => sessionPercent.get(id) ?? 0)
      trend.push({
        label: format(ws, 'd MMM'),
        avgPercent: percents.length
          ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length)
          : 0,
      })
    }

    return NextResponse.json({
      report: { departmentName, courses: courseReports, atRisk, trend },
    })
  })
}
