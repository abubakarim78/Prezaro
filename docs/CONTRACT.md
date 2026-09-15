# ClassCheck — Build Contract (read this first)

ClassCheck is a **single-route PWA** (Next.js 16 App Router) for face-recognition
attendance in university lecture halls. Everything user-visible renders inside
`src/app/page.tsx` → `src/components/app/class-check-app.tsx` which switches views
via the zustand store. **Do not create new page routes.** API routes under
`src/app/api/**` are fine.

## Stack & conventions

- TypeScript strict, ES imports, `use client` on every interactive component.
- Tailwind CSS 4 + shadcn/ui (New York). Import from `@/components/ui/*` — all exist.
- Icons: `lucide-react`. Toasts: `import { toast } from 'sonner'`.
- Dates: `date-fns` is installed (`format`, `formatDistanceToNow`…).
- Charts: `recharts` is installed.
- **Colors**: primary is emerald (tokens `bg-primary`, `text-primary-foreground`, `bg-accent`…).
  NEVER use indigo/blue. Amber for warnings, rose for danger. Respect dark mode via tokens only.
- Cards: `rounded-2xl border bg-card p-4` (or p-6). Mobile-first; every screen must work at 360px.
- Touch targets ≥ 44px (`min-h-11`). Long lists: `max-h-96 overflow-y-auto scrollbar-thin`.
- The app shell provides bottom nav (mobile) / sidebar (desktop) — views must NOT add their own nav.
- Views receive no props; read `params` from the store.

## Store (`@/lib/store`)

```ts
useAppStore(): {
  booted, user: User|null, view, params: Record<string,string>,
  history, online: boolean, pendingSync: number,
  openSession: { id, courseId, courseCode, mode } | null,
  navigate(view, params?), replace(view, params?), back(),
  setUser, setOnline, setPendingSync, setOpenSession
}
```

Views: `login onboarding home students student enroll scan review sessions session reports admin settings`.
- `student` params: `{ studentId }` · `enroll` params: `{ studentId }` (face capture)
- `session` params: `{ sessionId }` · `review` params: `{ sessionId }` (post-scan review)
- After login/onboarding, `replace('home')` and `setUser(u)`.
- Guard: if `!user`, ClassCheckApp renders LoginView regardless of `view`.

## API client (`@/lib/api`)

```ts
import { api, getErrorMessage } from '@/lib/api'
const data = await api<StudentsResponse>('/api/students', { method: 'POST', body: {...} })
// throws ApiError(status) or OfflineError — always wrap in try/catch, toast(getErrorMessage(e))
```

## Offline queue (`@/lib/offline`)

- `queueRecord(rec: PendingRecord)` — queue one attendance record (client-side, works offline).
- `flushQueue(): Promise<number>` — POST all queued to `/api/sessions/:id/sync`.
- `pendingCount()`, `pendingForSession(sessionId)`.
- `cacheRoster(data)`, `getCachedRoster(courseId)` — persist roster+descriptors per course for
  offline scanning/QR/PIN validation. `clearRosterCache()`.

## Types (`@/lib/types`) — canonical shapes

`User { id, email, name, title?, role: 'LECTURER'|'ADMIN', onboarded, departmentId?, departmentName? }`
`Course { id, code, title, level, semester, studentCount }`
`Department { id, name, code }`
`StudentListItem { id, studentId, firstName, lastName, level, email?, phone?, faceEnrolled, courseCodes? }`
`StudentDetail extends StudentListItem { courses: {id,code,title}[], descriptorsCount, attendance: {present, late, total, percent} }`
`RosterEntry { id, studentId, firstName, lastName, level, pin, qrPayload, descriptors: number[][] }`
`SessionSummary { id, courseId, courseCode, courseTitle, mode: 'WALKTHROUGH'|'KIOSK'|'MANUAL', status: 'OPEN'|'COMPLETED'|'CANCELLED', startedAt, endedAt?, presentCount, rosterSize }`
`AttendanceRecord { id?, studentId, name?, status: 'PRESENT'|'LATE'|'ABSENT', method: 'FACE'|'QR'|'PIN'|'MANUAL', confidence?, markedAt }`
`SessionDetail extends SessionSummary { lecturerName, records: AttendanceRecord[] }`
`CourseReport { course, threshold, sessionCount, students: {id, studentId, name, present, late, total, percent, atRisk}[], trend: {sessionId, date, presentPercent}[] }`
`DepartmentReport { departmentName, courses: {id, code, title, studentCount, sessionCount, avgAttendance}[], atRisk: {studentId, name, courseCode, percent}[], trend: {label, avgPercent}[] }`
`AppSettings { atRiskThreshold: number, liveness: boolean, defaultMode: 'WALKTHROUGH'|'KIOSK' }`

Response envelopes: `{ user }`, `{ departments }`, `{ courses }`, `{ students }`, `{ student }`,
`{ course }`, `{ roster }`, `{ sessions }`, `{ session }`, `{ report }`, `{ settings }`.
Errors: non-2xx JSON `{ error: string }`. Auth = httpOnly cookie `cc_token` (JWT).

## API endpoints (exact)

### Auth
- `POST /api/auth/login` `{email, password}` → `{user: User}` (401 `{error}`)
- `POST /api/auth/logout` → `{ok}`
- `GET  /api/auth/me` → `{user: User|null}`

### Profile & departments
- `POST /api/profile` `{name?, title?, departmentId?} | {name?, title?, departmentNew: {name, code}}` → `{user}` (sets `onboarded: true`)
- `GET  /api/departments` → `{departments: Department[]}`

### Courses
- `GET   /api/courses` → `{courses: Course[]}` (LECTURER: courses they teach; ADMIN: all dept courses)
- `POST  /api/courses` `{code, title, level, semester}` → `{course}` (assigned to my dept + me; 409 if code exists in dept)
- `PATCH /api/courses/:id` `{code?, title?, level?, semester?}` → `{course}`
- `GET   /api/courses/:id/students` → `{students: StudentListItem[]}` (enrolled students w/ faceEnrolled)
- `POST  /api/courses/:id/students` `{studentIds: string[]}` → `{enrolled: number}`
- `DELETE /api/courses/:id/students?studentId=:id` → `{ok}`
- `GET   /api/courses/:id/roster` → `{course: {id, code, title}, roster: RosterEntry[]}` (descriptors + pins for on-device matching)

### Students
- `GET  /api/students?query=&courseId=` → `{students: StudentListItem[]}` (dept-scoped)
- `POST /api/students` `{single: {studentId, firstName, lastName, level, email?, phone?}}`
  OR `{bulk: "line1\nline2"}` (CSV lines: `studentId,firstName,lastName,level[,email[,phone]]`)
  → `{students: StudentListItem[], created, skipped}` (skipped = duplicate studentIds; auto-generates 4-digit PIN)
- `GET    /api/students/:id` → `{student: StudentDetail}`
- `PATCH  /api/students/:id` `{firstName?, lastName?, level?, email?, phone?}` → `{student}`
- `POST   /api/students/:id/face` `{descriptors: number[][], consentVersion: "v1"}` → `{ok, count}`
- `DELETE /api/students/:id/face` → `{ok}` (opt-out: wipes embeddings)
- `GET    /api/students/:id/qr` → `{qrPayload, pin}` where qrPayload = `CLASSCHECK|<studentId>|<pin>`

### Sessions & attendance
- `GET  /api/sessions?courseId=&status=&limit=` → `{sessions: SessionSummary[]}` (mine, newest first)
- `POST /api/sessions` `{courseId, mode}` → `{session: SessionSummary}` (returns existing OPEN session for same lecturer+course instead of duplicating)
- `GET  /api/sessions/:id` → `{session: SessionDetail}`
- `POST /api/sessions/:id/sync` `{records: AttendanceRecord[]}` → `{saved}` (upsert by (session, studentId); ignore students not enrolled in the course; latest markedAt wins)
- `POST /api/sessions/:id/finalize` `{records?: AttendanceRecord[]}` → `{session: SessionDetail}` (applies records if given, sets status=COMPLETED + endedAt)
- `DELETE /api/sessions/:id` → `{ok}` (hard delete session + records)

### Reports & export
- `GET /api/reports/course/:courseId?threshold=` → `{report: CourseReport}` (default threshold from lecturer settings, else 75)
- `GET /api/reports/department` → `{report: DepartmentReport}` (dept of current user)
- `GET /api/export/session/:id` → `text/csv` attachment (StudentID, Name, Status, Method, MarkedAt)
- `GET /api/export/course/:courseId` → `text/csv` attachment (per-student attendance summary)

### Settings & misc
- `GET /api/settings` → `{settings: AppSettings}` (per-lecturer; defaults `{atRiskThreshold: 75, liveness: true, defaultMode: 'WALKTHROUGH'}`)
- `PUT /api/settings` `{atRiskThreshold?, liveness?, defaultMode?}` → `{settings}`
- `GET /api/health` → `{ok: true}`

## Auth mechanics (backend)

- Cookie `cc_token`: JWT HS256 via `jose`, secret `process.env.AUTH_SECRET`, 30d expiry, httpOnly, sameSite lax, path /.
- Helper `requireUser()` in API routes → reads cookie, verifies, loads user; returns 401 `{error:'Unauthorized'}` if bad.
- Passwords: bcryptjs (hash at signup/seed only). Seed users are in `prisma/seed.ts`.
- Authorization: LECTURER sees own courses/sessions + dept students; ADMIN sees whole department.
  Course mutation requires lecturer teaches it or ADMIN role.

## Demo accounts (seeded)

| Email | Password | Role |
|---|---|---|
| `hod@classcheck.edu` | `classcheck` | ADMIN (Prof. Abena Owusu) |
| `lecturer@classcheck.edu` | `classcheck` | LECTURER (Dr. Ama Mensah, CS301+CS305) |
| `kwame@classcheck.edu` | `classcheck` | LECTURER (Mr. Kwame Oteng, CS402+CS201) |

## File ownership (do not edit files you don't own)

- **Task 2 (backend)**: `prisma/**`, `src/app/api/**`, `src/lib/auth.ts` (server helper), `src/lib/settings.ts`
- **Task 3 (face)**: `src/lib/face/**`, `src/components/app/views/scan.tsx`, `enroll.tsx`, `review.tsx`
- **Task 4 (views A)**: `views/login.tsx`, `onboarding.tsx`, `home.tsx`, `students.tsx`, `student.tsx`
- **Task 5 (views B)**: `views/sessions.tsx`, `session.tsx`, `reports.tsx`, `admin.tsx`, `settings.tsx`
- Shared (already built, use freely, don't rewrite): `src/lib/{types,api,store,offline,utils}.ts`,
  `src/components/app/{class-check-app,shell,shared}.tsx`

## Shared components available (`@/components/app/shared`)

`PageHeader {title, subtitle, right}`, `StatCard {label, value, sub, icon, tone}`,
`IdentityAvatar {name}`, `EmptyState {icon, title, description, action}`, `LoadingBlock {label}`,
`MethodBadge {method}`, `AttendanceRing {percent, size?}`, `AttendanceBar {percent}`,
`StatusPill {status}`

## QR payload format

`CLASSCHECK|<studentId>|<pin>` — parsed on-device during scan; matched against cached roster.
`qrcode` package (client) renders QRs; `jsqr` decodes camera frames.
