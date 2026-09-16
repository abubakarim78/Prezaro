import { format } from 'date-fns'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import {
  csvCell,
  csvResponse,
  handle,
  requireSession,
} from '../../../_lib/helpers'

/** CSV: StudentID, Name, Status, Method, MarkedAt for every record. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params
    const session = await requireSession(user, id)

    const records = await db.attendanceRecord.findMany({
      where: { sessionId: session.id },
      include: { student: { select: { studentId: true, firstName: true, lastName: true } } },
      orderBy: { markedAt: 'asc' },
    })

    const lines = ['StudentID,Name,Status,MarkedAt']
    for (const r of records) {
      lines.push(
        [
          r.student.studentId,
          `${r.student.firstName} ${r.student.lastName}`,
          r.status,
          r.markedAt.toISOString(),
        ]
          .map(csvCell)
          .join(','),
      )
    }

    const filename = `rollmark-${session.course.code}-${format(session.startedAt, 'yyyy-MM-dd')}-attendance.csv`
    return csvResponse(filename, lines)
  })
}
