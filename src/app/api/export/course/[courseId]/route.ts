import { format } from 'date-fns'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import {
  csvCell,
  csvResponse,
  handle,
  requireCourse,
} from '../../../_lib/helpers'

/** CSV: per-student attendance summary over COMPLETED sessions. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ courseId: string }> },
) {
  return handle(async () => {
    const user = await requireUser(req)
    const { courseId } = await ctx.params
    const course = await requireCourse(user, courseId)

    const [completed, enrollments] = await Promise.all([
      db.session.findMany({
        where: { courseId: course.id, status: 'COMPLETED' },
        select: { id: true },
      }),
      db.enrollment.findMany({
        where: { courseId: course.id },
        include: { student: true },
      }),
    ])
    const sessionIds = completed.map((s) => s.id)
    const records = await db.attendanceRecord.findMany({
      where: { sessionId: { in: sessionIds } },
      select: { studentId: true, status: true, method: true, justification: true },
    })

    const counts = new Map<string, { present: number; late: number; face: number; manual: number; excused: number }>()
    for (const r of records) {
      if (r.status !== 'PRESENT' && r.status !== 'LATE') {
        if (r.justification) {
          const c = counts.get(r.studentId) ?? { present: 0, late: 0, face: 0, manual: 0, excused: 0 }
          c.excused++
          counts.set(r.studentId, c)
        }
        continue
      }
      const c = counts.get(r.studentId) ?? { present: 0, late: 0, face: 0, manual: 0, excused: 0 }
      if (r.status === 'PRESENT') c.present++
      else c.late++
      if (r.method === 'FACE') c.face++
      else c.manual++
      if (r.justification) c.excused++
      counts.set(r.studentId, c)
    }

    const lines = ['StudentID,Name,Level,TotalSessions,Present,Late,FaceVerified,ManualAudited,Excused,Percent']
    const rows = enrollments
      .map(({ student }) => {
        const c = counts.get(student.id) ?? { present: 0, late: 0, face: 0, manual: 0, excused: 0 }
        const percent =
          sessionIds.length > 0
            ? Math.round(((c.present + c.late) / sessionIds.length) * 100)
            : 0
        return {
          line: [
            student.studentId,
            `${student.firstName} ${student.lastName}`,
            String(student.level),
            String(sessionIds.length),
            String(c.present),
            String(c.late),
            String(c.face),
            String(c.manual),
            String(c.excused),
            `${percent}%`,
          ]
            .map(csvCell)
            .join(','),
          name: `${student.firstName} ${student.lastName}`,
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
    lines.push(...rows.map((r) => r.line))

    const filename = `prezaro-${course.code}-attendance-summary-${format(new Date(), 'yyyy-MM-dd')}.csv`
    return csvResponse(filename, lines)
  })
}
