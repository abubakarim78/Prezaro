import { z } from 'zod'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { BadRequestError, requireUser } from '@/lib/auth'
import {
  handle,
  readJson,
  requireCourse,
  studentListItem,
  studentScopeWhere,
  studentWithCoursesInclude,
  zodMessage,
} from '../_lib/helpers'

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    const url = new URL(req.url)
    const query = (url.searchParams.get('query') ?? '').trim()
    const courseId = url.searchParams.get('courseId') ?? ''

    const where: Prisma.StudentWhereInput = studentScopeWhere(user)
    if (courseId) {
      await requireCourse(user, courseId)
      where.enrollments = { some: { courseId } }
    }
    if (query) {
      where.OR = [
        { studentId: { contains: query } },
        { firstName: { contains: query } },
        { lastName: { contains: query } },
        { email: { contains: query } },
      ]
    }

    const students = await db.student.findMany({
      where,
      include: studentWithCoursesInclude,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })
    return NextResponse.json({ students: students.map(studentListItem) })
  })
}

// ---- Create (single or bulk CSV) ------------------------------

const nullableTrimmedEmail = z.preprocess(
  (v) => (v === '' ? null : v),
  z.string().trim().email('Invalid email').nullable().optional(),
)
const nullableTrimmedPhone = z.preprocess(
  (v) => (v === '' ? null : v),
  z.string().trim().min(3, 'Invalid phone').nullable().optional(),
)

const singleSchema = z.object({
  studentId: z.string().trim().min(1, 'Student ID is required'),
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  level: z.coerce.number().int().min(100, 'Level must be 100–900').max(900, 'Level must be 100–900'),
  email: nullableTrimmedEmail,
  phone: nullableTrimmedPhone,
})

const createSchema = z
  .object({
    single: singleSchema.optional(),
    bulk: z.string().optional(),
  })
  .refine((d) => d.single !== undefined || d.bulk !== undefined, {
    message: 'Provide either single or bulk',
  })

interface ParsedRow {
  studentId: string
  firstName: string
  lastName: string
  level: number
  email: string | null
  phone: string | null
}

/** CSV lines: `studentId,firstName,lastName,level[,email[,phone]]` */
function parseBulkCsv(raw: string): { rows: ParsedRow[]; invalid: number } {
  const rows: ParsedRow[] = []
  let invalid = 0
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const cells = trimmed.split(',').map((c) => c.trim())
    if (cells.length < 4) {
      invalid++
      continue
    }
    const [studentId, firstName, lastName, levelRaw, email, phone] = cells
    const level = Number.parseInt(levelRaw, 10)
    if (!studentId || !firstName || !lastName || !Number.isFinite(level) || level < 100 || level > 900) {
      invalid++
      continue
    }
    rows.push({
      studentId,
      firstName,
      lastName,
      level,
      email: email || null,
      phone: phone || null,
    })
  }
  return { rows, invalid }
}

function randomPin(): string {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0')
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    if (!user.departmentId) {
      throw new BadRequestError('Join a department before adding students')
    }
    const parsed = createSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    const rows: ParsedRow[] = []
    let skipped = 0
    if (parsed.data.single) {
      rows.push({
        ...parsed.data.single,
        email: parsed.data.single.email ?? null,
        phone: parsed.data.single.phone ?? null,
      })
    } else if (parsed.data.bulk !== undefined) {
      const bulk = parseBulkCsv(parsed.data.bulk)
      rows.push(...bulk.rows)
      skipped += bulk.invalid
    }

    // De-duplicate within the batch (first occurrence wins).
    const seen = new Set<string>()
    const unique: ParsedRow[] = []
    for (const row of rows) {
      if (seen.has(row.studentId)) {
        skipped++
        continue
      }
      seen.add(row.studentId)
      unique.push(row)
    }

    // Skip studentIds that already exist.
    const existing = await db.student.findMany({
      where: { studentId: { in: unique.map((r) => r.studentId) } },
      select: { studentId: true },
    })
    const existingSet = new Set(existing.map((e) => e.studentId))
    const toCreate = unique.filter((r) => !existingSet.has(r.studentId))
    skipped += unique.length - toCreate.length

    if (toCreate.length > 0) {
      await db.student.createMany({
        data: toCreate.map((r) => ({
          studentId: r.studentId,
          firstName: r.firstName,
          lastName: r.lastName,
          level: r.level,
          email: r.email,
          phone: r.phone,
          pin: randomPin(),
          departmentId: user.departmentId,
          descriptorsJson: '[]',
        })),
      })
    }

    const created = await db.student.findMany({
      where: { studentId: { in: toCreate.map((r) => r.studentId) } },
      include: studentWithCoursesInclude,
      orderBy: { studentId: 'asc' },
    })
    return NextResponse.json({
      students: created.map(studentListItem),
      created: toCreate.length,
      skipped,
    })
  })
}
