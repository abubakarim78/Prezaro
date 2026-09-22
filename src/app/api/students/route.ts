import { z } from 'zod'
import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { BadRequestError, requireUser } from '@/lib/auth'
import { STUDENT_ID_PATTERN } from '@/lib/types'
import { queueEmail, studentRegisteredHtml, courseEnrollmentHtml } from '@/lib/email'
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

// ---- Create (single, bulk CSV, or parsed students array) -------

const nullableTrimmedEmail = z.preprocess(
  (v) => (v === '' ? null : v),
  z.string().trim().email('Invalid email').nullable().optional(),
)
const nullableTrimmedPhone = z.preprocess(
  (v) => (v === '' ? null : v),
  z.string().trim().min(3, 'Invalid phone').nullable().optional(),
)

const singleSchema = z.object({
  studentId: z
    .string()
    .trim()
    .regex(STUDENT_ID_PATTERN, 'Student ID format is invalid — use letters, numbers, / or - (e.g. PHA/0001/26)'),
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
    students: z.array(singleSchema).optional(),
    courseId: z.string().optional(),
  })
  .refine(
    (d) =>
      d.single !== undefined ||
      d.bulk !== undefined ||
      (d.students !== undefined && d.students.length > 0),
    {
      message: 'Provide single, bulk, or students array',
    }
  )

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
    if (
      !studentId ||
      !STUDENT_ID_PATTERN.test(studentId) ||
      !firstName ||
      !lastName ||
      !Number.isFinite(level) ||
      level < 100 ||
      level > 900
    ) {
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

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    if (!user.departmentId) {
      throw new BadRequestError('Join a department before adding students')
    }
    const parsed = createSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    // If courseId provided, ensure lecturer owns or can access the course
    let targetCourse: { id: string; code: string; title: string } | null = null
    if (parsed.data.courseId) {
      targetCourse = await requireCourse(user, parsed.data.courseId)
    }

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
    } else if (parsed.data.students !== undefined) {
      for (const s of parsed.data.students) {
        rows.push({
          ...s,
          email: s.email ?? null,
          phone: s.phone ?? null,
        })
      }
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

    // Check existing students.
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

    // Registration notifications — fire-and-forget, students with an
    // email address get a confirmation that they are on the register.
    if (created.length > 0) {
      const departmentName = user.departmentId
        ? (
            await db.department.findUnique({
              where: { id: user.departmentId },
              select: { name: true },
            })
          )?.name ?? 'your department'
        : 'your department'
      for (const student of created) {
        if (!student.email) continue
        queueEmail({
          to: student.email,
          subject: `You've been registered for ${departmentName} attendance`,
          html: studentRegisteredHtml(
            `${student.firstName} ${student.lastName}`,
            student.studentId,
            departmentName,
          ),
          type: 'STUDENT_REGISTERED',
          meta: { studentRowId: student.id, studentIndex: student.studentId },
        })
      }
    }

    // Auto-enroll in course if requested (both newly created and existing matching students)
    let enrolledCount = 0
    if (targetCourse && unique.length > 0) {
      const allBatchStudents = await db.student.findMany({
        where: { studentId: { in: unique.map((r) => r.studentId) } },
        select: { id: true, studentId: true, firstName: true, lastName: true, email: true },
      })

      const existingEnrollments = await db.enrollment.findMany({
        where: {
          courseId: targetCourse.id,
          studentId: { in: allBatchStudents.map((s) => s.id) },
        },
        select: { studentId: true },
      })
      const alreadyEnrolled = new Set(existingEnrollments.map((e) => e.studentId))
      const toEnroll = allBatchStudents.filter((s) => !alreadyEnrolled.has(s.id))

      if (toEnroll.length > 0) {
        await db.enrollment.createMany({
          data: toEnroll.map((s) => ({
            courseId: targetCourse!.id,
            studentId: s.id,
          })),
        })
        enrolledCount = toEnroll.length

        for (const student of toEnroll) {
          if (!student.email) continue
          queueEmail({
            to: student.email,
            subject: `You've been enrolled in ${targetCourse!.code}`,
            html: courseEnrollmentHtml(
              `${student.firstName} ${student.lastName}`,
              student.studentId,
              targetCourse!.code,
              targetCourse!.title,
              user.name,
            ),
            type: 'COURSE_ENROLLMENT',
            meta: { courseId: targetCourse!.id, studentRowId: student.id },
          })
        }
      }
    }

    return NextResponse.json({
      students: created.map(studentListItem),
      created: toCreate.length,
      skipped,
      enrolled: enrolledCount,
      courseCode: targetCourse?.code,
    })
  })
}
