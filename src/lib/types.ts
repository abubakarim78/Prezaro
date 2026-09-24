// ============================================================
// Prezaro — Shared domain types (single source of truth)
// Every view + API route codes against these shapes.
// ============================================================

export type Role = 'LECTURER' | 'ADMIN' | 'SUPERADMIN'
export type SessionMode = 'WALKTHROUGH' | 'KIOSK' | 'MANUAL'
export type SessionStatus = 'OPEN' | 'COMPLETED' | 'CANCELLED'
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT'
export type TermSystem = 'SEMESTER' | 'TRIMESTER' | 'QUARTER'

export interface Institution {
  id: string
  name: string
  code: string
  slug: string
  logoUrl?: string | null
  primaryColor?: string | null
  contactEmail?: string | null
  contactPhone?: string | null
  plan: 'TRIAL' | 'FACULTY' | 'CAMPUS_ANNUAL' | 'ENTERPRISE'
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING'
  maxStudents: number
  maxCourses: number
  allowedModes: 'ALL' | 'WALKTHROUGH_ONLY' | 'KIOSK_ONLY'
  confidenceThreshold: number
  lateGraceMinutes: number
  termSystem: TermSystem
  atRiskThreshold: number
  featuresJson: string
  createdAt: string
  updatedAt: string
  studentCount?: number
  courseCount?: number
  sessionCount?: number
  lecturerCount?: number
  departmentCount?: number
}

export interface User {
  id: string
  email: string
  name: string
  title?: string | null
  role: Role
  onboarded: boolean
  departmentId?: string | null
  departmentName?: string | null
  institutionId?: string | null
  institutionName?: string | null
  institutionSlug?: string | null
  courseCount?: number
  sessionCount?: number
  createdAt?: string
}

export interface PlatformUsersResponse {
  users: User[]
}

export interface Department {
  id: string
  name: string
  code: string
  institutionId?: string | null
}

export interface Course {
  id: string
  code: string
  title: string
  level: number
  semester: number // 1..3
  termSystem: TermSystem
  studentCount: number
}

/** Human label for a course term, e.g. "Trimester 2" / "Semester 1". */
export function termLabel(c: Pick<Course, 'semester' | 'termSystem'>): string {
  return `${c.termSystem === 'TRIMESTER' ? 'Trimester' : 'Semester'} ${c.semester}`
}

/** Short badge label, e.g. "T2" / "S1". */
export function termBadge(c: Pick<Course, 'semester' | 'termSystem'>): string {
  return `${c.termSystem === 'TRIMESTER' ? 'T' : 'S'}${c.semester}`
}

export interface StudentListItem {
  id: string
  studentId: string
  firstName: string
  lastName: string
  level: number
  email?: string | null
  phone?: string | null
  faceEnrolled: boolean
  courseCodes?: string[]
}

export interface StudentDetail extends StudentListItem {
  courses: { id: string; code: string; title: string }[]
  descriptorsCount: number
  photoData?: string | null
  attendance: { present: number; late: number; total: number; percent: number }
}

export interface CourseAttendanceStat {
  courseId: string
  courseCode: string
  present: number
  total: number
  percent: number
}

export interface RosterEntry {
  id: string
  studentId: string
  firstName: string
  lastName: string
  level: number
  descriptors: number[][]
}

export interface SessionSummary {
  id: string
  courseId: string
  courseCode: string
  courseTitle: string
  mode: SessionMode
  status: SessionStatus
  startedAt: string
  endedAt?: string | null
  presentCount: number
  rosterSize: number
}

export interface AttendanceRecord {
  id?: string
  studentId: string
  /** Student's index number (display only; studentId is the DB id) */
  code?: string
  name?: string
  status: AttendanceStatus
  confidence?: number | null
  markedAt: string
}

export interface SessionDetail extends SessionSummary {
  lecturerName: string
  records: AttendanceRecord[]
}

export interface CourseReportStudent {
  id: string
  studentId: string
  name: string
  present: number
  late: number
  total: number
  percent: number
  atRisk: boolean
}

export interface CourseReport {
  course: Course
  threshold: number
  sessionCount: number
  students: CourseReportStudent[]
  trend: { sessionId: string; date: string; presentPercent: number }[]
}

export interface DepartmentReport {
  departmentName: string
  courses: {
    id: string
    code: string
    title: string
    studentCount: number
    sessionCount: number
    avgAttendance: number
  }[]
  atRisk: { studentId: string; name: string; courseCode: string; percent: number }[]
  trend: { label: string; avgPercent: number }[]
}

export interface AppSettings {
  atRiskThreshold: number // % below which a student is flagged at-risk
  defaultMode: 'WALKTHROUGH' | 'KIOSK'
}

// ---- API response envelopes ---------------------------------

/**
 * Student index-number format. Accepts department formats like
 * `PHA/0001/26`, `CS-101/23`, and plain numeric IDs like `20451926`:
 * 3–20 chars of letters/digits with `/` or `-` separators allowed
 * in the middle (no leading/trailing separator).
 */
export const STUDENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9/-]{1,18}[A-Za-z0-9]$/

export interface LoginResponse {
  user: User
  token?: string
}

export interface MeResponse {
  user: User | null
  token?: string
}

export interface StudentsResponse {
  students: StudentListItem[]
}

export interface StudentDetailResponse {
  student: StudentDetail
}

export interface RosterResponse {
  course: { id: string; code: string; title: string }
  roster: RosterEntry[]
}

export interface SessionsResponse {
  sessions: SessionSummary[]
}

export interface SessionResponse {
  session: SessionDetail
}

export interface CoursesResponse {
  courses: Course[]
}

export interface DepartmentsResponse {
  departments: Department[]
}

export interface SettingsResponse {
  settings: AppSettings
}

// ---- Class Schedules & Reminders ---------------------------

export interface ClassSchedule {
  id: string
  courseId: string
  courseCode: string
  courseTitle: string
  lecturerId: string
  dayOfWeek: number // 1 = Mon ... 7 = Sun
  startTime: string // "08:00" (HH:mm)
  endTime: string // "10:00" (HH:mm)
  venue?: string | null
  recurrence: string // WEEKLY | BIWEEKLY | ONCE
  reminderLeadMinutes: number // 15 | 30 | 60
  notifyEmail: boolean
  notifyPush: boolean
  lastNotifiedDate?: string | null
  studentCount?: number
  createdAt: string
  updatedAt: string
}

export interface ClassScheduleInput {
  courseId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  venue?: string
  recurrence?: string
  reminderLeadMinutes?: number
  notifyEmail?: boolean
  notifyPush?: boolean
}

export interface SchedulesResponse {
  schedules: ClassSchedule[]
}

export interface ScheduleResponse {
  schedule: ClassSchedule
}

// ---- Email notifications -------------------------------------

export type EmailLogStatus = 'SENT' | 'SIMULATED' | 'FAILED'

export type EmailLogType =
  | 'WELCOME'
  | 'ACCOUNT_ALERT'
  | 'STUDENT_REGISTERED'
  | 'COURSE_ENROLLMENT'
  | 'CLASS_REMINDER'
  | 'CLASS_RESCHEDULED'
  | 'TEST'

export interface EmailLogItem {
  id: string
  to: string
  subject: string
  type: EmailLogType
  status: EmailLogStatus
  error?: string | null
  createdAt: string
  bodyHtml: string
}

export interface EmailsResponse {
  config: {
    smtpConfigured: boolean
    provider?: 'resend' | 'smtp' | 'none'
    host: string | null
    from: string | null
  }
  emails: EmailLogItem[]
}

export interface TestEmailResponse {
  ok: boolean
  status: EmailLogStatus
}

// ---- Platform / Multi-Institution Admin ----------------------

export interface PlatformStats {
  institutionsCount: number
  activeInstitutionsCount: number
  studentsCount: number
  coursesCount: number
  sessionsCount: number
  recordsCount: number
  activeLicenses: {
    trial: number
    faculty: number
    campusAnnual: number
    enterprise: number
  }
}

export interface PlatformInstitutionsResponse {
  institutions: Institution[]
  stats: PlatformStats
}

export interface PlatformInstitutionResponse {
  institution: Institution
}

export interface InstitutionInput {
  name: string
  code: string
  slug: string
  plan?: 'TRIAL' | 'FACULTY' | 'CAMPUS_ANNUAL' | 'ENTERPRISE'
  status?: 'ACTIVE' | 'SUSPENDED' | 'PENDING'
  maxStudents?: number
  maxCourses?: number
  allowedModes?: 'ALL' | 'WALKTHROUGH_ONLY' | 'KIOSK_ONLY'
  confidenceThreshold?: number
  lateGraceMinutes?: number
  termSystem?: TermSystem
  atRiskThreshold?: number
  contactEmail?: string
  contactPhone?: string
  primaryColor?: string
  featuresJson?: string
}

