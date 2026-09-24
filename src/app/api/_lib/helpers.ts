// ============================================================
// Prezaro — shared API route helpers (server-only)
// Error wrapper, DTO mappers, scoping & access guards.
//
// Scoping model (documented for all routes):
//   LECTURER → own courses (Course.lecturerId = user.id), sessions they
//              own, students in their department.
//   ADMIN    → everything in their department (all courses/sessions/
//              students of that department).
// ============================================================
import { Prisma } from '@prisma/client'
import type {
  AttendanceRecord,
  Course,
  Department,
  Enrollment,
  Session,
  Student,
  User,
} from '@prisma/client'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
// Re-export error classes so route handlers can import them from one place.
import {
  ApiError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  requireUser,
  type AuthUser,
} from '@/lib/auth'

export {
  ApiError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  requireUser,
  type AuthUser,
}
import { getUserSettings } from '@/lib/settings'
import type {
  AttendanceRecord as AttendanceRecordDTO,
  ClassSchedule,
  Course as CourseDTO,
  SessionDetail,
  SessionMode,
  SessionStatus,
  SessionSummary,
  StudentDetail,
  StudentListItem,
  User as UserDTO,
} from '@/lib/types'

/** Wrap a route handler body: maps ApiError → JSON error responses. */
export function handle(fn: () => Promise<Response>): Promise<Response> {
  return fn().catch((err: unknown) => {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[api] Unhandled error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  })
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new BadRequestError('Invalid JSON body')
  }
}

export function zodMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Invalid input'
}

// ---- DTO mappers ---------------------------------------------

export function userDTO(
  u: User & {
    department?: Department | null
    institution?: import('@prisma/client').Institution | null
  }
): UserDTO {
  const role: 'LECTURER' | 'ADMIN' | 'SUPERADMIN' =
    u.role === 'SUPERADMIN' ? 'SUPERADMIN' : u.role === 'ADMIN' ? 'ADMIN' : 'LECTURER'
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    title: u.title ?? null,
    role,
    onboarded: u.onboarded,
    departmentId: u.departmentId ?? null,
    departmentName: u.department?.name ?? null,
    institutionId: u.institutionId ?? null,
    institutionName: u.institution?.name ?? null,
    institutionSlug: u.institution?.slug ?? null,
  }
}

/** Guard requiring platform SUPERADMIN role */
export async function requireSuperAdmin(req: Request): Promise<AuthUser> {
  const user = await requireUser(req)
  if (user.role !== 'SUPERADMIN') {
    throw new ForbiddenError('Platform superadmin privileges required')
  }
  return user
}

export const courseCountInclude = Prisma.validator<Prisma.CourseInclude>()({
  _count: { select: { enrollments: true } },
})

export function courseDTO(c: Course & { _count: { enrollments: number } }): CourseDTO {
  return {
    id: c.id,
    code: c.code,
    title: c.title,
    level: c.level,
    semester: c.semester,
    termSystem: c.termSystem === 'TRIMESTER' ? 'TRIMESTER' : 'SEMESTER',
    studentCount: c._count.enrollments,
  }
}

export function parseDescriptorJson(raw: string): number[][] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (row): row is number[] =>
        Array.isArray(row) && row.every((n) => typeof n === 'number'),
    )
  } catch {
    return []
  }
}

export const studentWithCoursesInclude = Prisma.validator<Prisma.StudentInclude>()({
  enrollments: { include: { course: { select: { code: true } } } },
})

type StudentWithCourses = Student & {
  enrollments: (Enrollment & { course: { code: string } })[]
}

export function studentListItem(s: StudentWithCourses): StudentListItem {
  const courseCodes = Array.from(new Set(s.enrollments.map((e) => e.course.code))).sort()
  return {
    id: s.id,
    studentId: s.studentId,
    firstName: s.firstName,
    lastName: s.lastName,
    level: s.level,
    email: s.email ?? null,
    phone: s.phone ?? null,
    faceEnrolled: s.faceEnrolledAt !== null,
    courseCodes,
  }
}

type StudentWithFullCourses = Student & {
  enrollments: (Enrollment & { course: { id: string; code: string; title: string } })[]
}

export function studentDetailDTO(
  s: StudentWithFullCourses,
  attendance: { present: number; late: number; total: number },
): StudentDetail {
  const base = studentListItem(s as unknown as StudentWithCourses)
  const courses = [...s.enrollments]
    .sort((a, b) => a.course.code.localeCompare(b.course.code))
    .map((e) => ({ id: e.course.id, code: e.course.code, title: e.course.title }))
  const { present, late, total } = attendance
  const percent = total > 0 ? Math.round(((present + late) / total) * 100) : 0
  return {
    ...base,
    courses,
    descriptorsCount: parseDescriptorJson(s.descriptorsJson).length,
    photoData: s.photoData ?? null,
    attendance: { present, late, total, percent },
  }
}

/** presentCount = records with status PRESENT or LATE; rosterSize = course enrollment count. */
export const sessionSummaryInclude = Prisma.validator<Prisma.SessionInclude>()({
  course: { include: { _count: { select: { enrollments: true } } } },
  _count: { select: { records: { where: { status: { in: ['PRESENT', 'LATE'] } } } } },
})

export const sessionDetailInclude = Prisma.validator<Prisma.SessionInclude>()({
  course: { include: { _count: { select: { enrollments: true } } } },
  lecturer: { select: { name: true } },
  _count: { select: { records: { where: { status: { in: ['PRESENT', 'LATE'] } } } } },
  records: {
    include: { student: { select: { firstName: true, lastName: true, studentId: true } } },
    orderBy: { markedAt: 'desc' },
  },
})

type SessionSummaryRow = Session & {
  course: Course & { _count: { enrollments: number } }
  _count: { records: number }
}

export function sessionSummaryDTO(s: SessionSummaryRow): SessionSummary {
  return {
    id: s.id,
    courseId: s.courseId,
    courseCode: s.course.code,
    courseTitle: s.course.title,
    mode: s.mode as SessionMode,
    status: s.status as SessionStatus,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt ? s.endedAt.toISOString() : null,
    presentCount: s._count.records,
    rosterSize: s.course._count.enrollments,
  }
}

type RecordWithStudent = AttendanceRecord & {
  student: { firstName: string; lastName: string; studentId: string }
}

export function attendanceRecordDTO(r: RecordWithStudent): AttendanceRecordDTO {
  return {
    id: r.id,
    studentId: r.studentId,
    code: r.student.studentId,
    name: `${r.student.firstName} ${r.student.lastName}`,
    status: r.status as AttendanceRecordDTO['status'],
    confidence: r.confidence ?? null,
    markedAt: r.markedAt.toISOString(),
  }
}

/** Freshly load a session as SessionDetail (records newest-first). */
export async function loadSessionDetail(sessionId: string): Promise<SessionDetail> {
  const s = await db.session.findUnique({
    where: { id: sessionId },
    include: sessionDetailInclude,
  })
  if (!s) throw new NotFoundError('Session not found')
  return {
    ...sessionSummaryDTO(s),
    lecturerName: s.lecturer.name,
    records: s.records.map(attendanceRecordDTO),
  }
}

// ---- Scoping & access guards ---------------------------------

/** WHERE clause limiting courses to what the user may see. */
export function courseScopeWhere(user: AuthUser): Prisma.CourseWhereInput {
  return user.role === 'ADMIN'
    ? { departmentId: user.departmentId ?? '__none__' }
    : { lecturerId: user.id }
}

/** WHERE clause limiting sessions to what the user may see. */
export function sessionScopeWhere(user: AuthUser): Prisma.SessionWhereInput {
  return user.role === 'ADMIN'
    ? { course: { departmentId: user.departmentId ?? '__none__' } }
    : { lecturerId: user.id }
}

export function serializeSchedule(s: any): ClassSchedule {
  return {
    id: s.id,
    courseId: s.courseId,
    courseCode: s.course?.code ?? '',
    courseTitle: s.course?.title ?? '',
    lecturerId: s.lecturerId,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    venue: s.venue,
    recurrence: s.recurrence,
    reminderLeadMinutes: s.reminderLeadMinutes,
    notifyEmail: s.notifyEmail,
    notifyPush: s.notifyPush,
    lastNotifiedDate: s.lastNotifiedDate,
    studentCount: s.course?._count?.enrollments ?? 0,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }
}

/** WHERE clause limiting students to the user's department. */
export function studentScopeWhere(user: AuthUser): Prisma.StudentWhereInput {
  return { departmentId: user.departmentId }
}

/** Fetch a course the user can act on (LECTURER: owner; ADMIN: same dept). */
export async function requireCourse(user: AuthUser, courseId: string): Promise<Course> {
  const course = await db.course.findUnique({ where: { id: courseId } })
  if (!course) throw new NotFoundError('Course not found')
  const allowed =
    user.role === 'ADMIN'
      ? course.departmentId === user.departmentId
      : course.lecturerId === user.id
  if (!allowed) throw new ForbiddenError('You do not have access to this course')
  return course
}

/** Fetch a session the user can act on (LECTURER: owner; ADMIN: same dept as course). */
export async function requireSession(
  user: AuthUser,
  sessionId: string,
): Promise<Session & { course: Course }> {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { course: true },
  })
  if (!session) throw new NotFoundError('Session not found')
  const allowed =
    user.role === 'ADMIN'
      ? session.course.departmentId === user.departmentId
      : session.lecturerId === user.id
  if (!allowed) throw new ForbiddenError('You do not have access to this session')
  return session
}

/** Fetch a student visible to the user (same department). */
export async function requireStudent(user: AuthUser, studentRowId: string): Promise<Student> {
  const student = await db.student.findUnique({ where: { id: studentRowId } })
  if (!student) throw new NotFoundError('Student not found')
  if (student.departmentId !== user.departmentId) {
    throw new ForbiddenError('You do not have access to this student')
  }
  return student
}

/** At-risk threshold: explicit ?threshold= (1–100) wins, else user settings, else 75. */
export async function resolveThreshold(
  user: AuthUser,
  rawThreshold: string | null,
): Promise<number> {
  if (rawThreshold) {
    const n = Number(rawThreshold)
    if (Number.isFinite(n) && n >= 1 && n <= 100) return Math.round(n)
  }
  const settings = await getUserSettings(user.id)
  return settings.atRiskThreshold
}

// ---- CSV helpers ---------------------------------------------

export function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function csvResponse(filename: string, lines: string[]): Response {
  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
