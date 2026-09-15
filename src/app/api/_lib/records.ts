// ============================================================
// ClassCheck — attendance record ingestion (sync + finalize)
// Upsert by (sessionId, studentId); ignores students not enrolled
// in the course; the record with the latest markedAt wins.
// ============================================================
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

export const recordInputSchema = z.object({
  studentId: z.string().min(1, 'studentId is required'),
  status: z.enum(['PRESENT', 'LATE', 'ABSENT']).default('PRESENT'),
  confidence: z.number().min(0).max(1).nullable().optional(),
  markedAt: z.string().optional(),
})

export const recordListSchema = z.object({
  records: z
    .array(recordInputSchema)
    .min(1, 'records must be a non-empty array')
    .max(2000, 'Too many records in one batch'),
})

export type RecordInput = z.infer<typeof recordInputSchema>

function parseMarkedAt(raw: string | undefined): Date {
  if (raw) {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return d
  }
  return new Date()
}

/**
 * Apply a batch of attendance records to a session.
 * Returns the number of records actually written.
 */
export async function applyRecords(
  sessionId: string,
  courseId: string,
  records: RecordInput[],
): Promise<number> {
  const enrollments = await db.enrollment.findMany({
    where: { courseId },
    select: { studentId: true },
  })
  const enrolled = new Set(enrollments.map((e) => e.studentId))

  const existing = await db.attendanceRecord.findMany({
    where: { sessionId },
    select: { studentId: true, markedAt: true },
  })
  const latest = new Map<string, Date>(existing.map((r) => [r.studentId, r.markedAt]))

  const ops: Prisma.PrismaPromise<unknown>[] = []
  let saved = 0
  for (const rec of records) {
    if (!enrolled.has(rec.studentId)) continue // unknown / unenrolled → ignore
    const markedAt = parseMarkedAt(rec.markedAt)
    const prev = latest.get(rec.studentId)
    if (prev && markedAt.getTime() <= prev.getTime()) continue // stale, latest wins
    const data = {
      status: rec.status,
      confidence: rec.confidence ?? null,
      markedAt,
    }
    ops.push(
      db.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId, studentId: rec.studentId } },
        create: { sessionId, studentId: rec.studentId, ...data },
        update: data,
      }),
    )
    latest.set(rec.studentId, markedAt)
    saved++
  }
  if (ops.length > 0) await db.$transaction(ops)
  return saved
}
