import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import {
  courseDTO,
  handle,
  requireCourse,
  resolveThreshold,
} from '../../../_lib/helpers'

/**
 * Per-student attendance over COMPLETED sessions:
 * present/late counts, percent, atRisk flag (< threshold) and a
 * per-session trend of presentPercent.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ courseId: string }> },
) {
  return handle(async () => {
    const user = await requireUser(req)
    const { courseId } = await ctx.params
    const course = await requireCourse(user, courseId)
    const threshold = await resolveThreshold(
      user,
      new URL(req.url).searchParams.get('threshold'),
    )

    const completed = await db.session.findMany({
      where: { courseId: course.id, status: 'COMPLETED' },
      orderBy: { startedAt: 'asc' },
      select: { id: true, startedAt: true },
    })
    const sessionIds = completed.map((s) => s.id)

    const [enrollments, records] = await Promise.all([
      db.enrollment.findMany({ where: { courseId: course.id }, include: { student: true } }),
      db.attendanceRecord.findMany({
        where: { sessionId: { in: sessionIds } },
        select: { sessionId: true, studentId: true, status: true },
      }),
    ])

    const byStudent = new Map<string, { present: number; late: number }>()
    const bySession = new Map<string, { present: number; late: number }>()
    for (const r of records) {
      if (r.status !== 'PRESENT' && r.status !== 'LATE') continue
      const s = byStudent.get(r.studentId) ?? { present: 0, late: 0 }
      if (r.status === 'PRESENT') s.present++
      else s.late++
      byStudent.set(r.studentId, s)

      const t = bySession.get(r.sessionId) ?? { present: 0, late: 0 }
      if (r.status === 'PRESENT') t.present++
      else t.late++
      bySession.set(r.sessionId, t)
    }

    const sessionCount = completed.length
    const students = enrollments
      .map(({ student }) => {
        const s = byStudent.get(student.id) ?? { present: 0, late: 0 }
        const attended = s.present + s.late
        const percent = sessionCount > 0 ? Math.round((attended / sessionCount) * 100) : 0
        return {
          id: student.id,
          studentId: student.studentId,
          name: `${student.firstName} ${student.lastName}`,
          present: s.present,
          late: s.late,
          total: sessionCount,
          percent,
          atRisk: sessionCount > 0 && percent < threshold,
        }
      })
      .sort((a, b) => a.percent - b.percent || a.name.localeCompare(b.name))

    const rosterSize = enrollments.length
    const trend = completed.map((sess) => {
      const t = bySession.get(sess.id) ?? { present: 0, late: 0 }
      const presentPercent =
        rosterSize > 0 ? Math.round(((t.present + t.late) / rosterSize) * 100) : 0
      return {
        sessionId: sess.id,
        date: sess.startedAt.toISOString(),
        presentPercent,
      }
    })

    return NextResponse.json({
      report: {
        course: courseDTO({ ...course, _count: { enrollments: rosterSize } }),
        threshold,
        sessionCount,
        students,
        trend,
      },
    })
  })
}
