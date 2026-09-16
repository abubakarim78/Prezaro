// ============================================================
// Rollmark — Shared domain types (single source of truth)
// Every view + API route codes against these shapes.
// ============================================================

export type Role = 'LECTURER' | 'ADMIN'
export type SessionMode = 'WALKTHROUGH' | 'KIOSK' | 'MANUAL'
export type SessionStatus = 'OPEN' | 'COMPLETED' | 'CANCELLED'
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT'

export interface User {
  id: string
  email: string
  name: string
  title?: string | null
  role: Role
  onboarded: boolean
  departmentId?: string | null
  departmentName?: string | null
}

export interface Department {
  id: string
  name: string
  code: string
}

export interface Course {
  id: string
  code: string
  title: string
  level: number
  semester: number
  studentCount: number
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
  liveness: boolean // require head-turn challenge in kiosk mode
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

// ---- Email notifications -------------------------------------

export type EmailLogStatus = 'SENT' | 'SIMULATED' | 'FAILED'

export type EmailLogType =
  | 'WELCOME'
  | 'ACCOUNT_ALERT'
  | 'STUDENT_REGISTERED'
  | 'COURSE_ENROLLMENT'
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
  config: { smtpConfigured: boolean; host: string | null; from: string | null }
  emails: EmailLogItem[]
}

export interface TestEmailResponse {
  ok: boolean
  status: EmailLogStatus
}
