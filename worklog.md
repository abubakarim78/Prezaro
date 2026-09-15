# ClassCheck — Agent Worklog

Shared, append-only worklog. Read before starting; append when done.

---

Task ID: 1
Agent: Z.ai (orchestrator)
Task: Foundation — project inspection, deps, PWA shell, shared libs, design system, build contract.

Work Log:
- Inspected scaffold: Next.js 16 + Tailwind 4 + full shadcn/ui set, Prisma/SQLite at db/custom.db, sharp/recharts/framer-motion/zustand/sonner/date-fns available.
- Installed bcryptjs, qrcode, jsqr (+types).
- Downloaded face-api.js v1.7.15 IIFE bundle → public/vendor/face-api.js; models (tiny_face_detector, face_landmark_68, face_recognition) → public/models/ (~7MB, cached by SW).
- Generated app icon via image-gen; produced icon-192/512, maskable-192/512, apple-touch-icon; copied src/app/icon.png + apple-icon.png.
- Wrote src/lib/types.ts (canonical DTOs), api.ts (fetch wrapper w/ ApiError/OfflineError), store.ts (zustand view-router), offline.ts (queue + roster cache), types/face-api.d.ts.
- Design tokens: emerald primary (no indigo/blue), dark mode, safe-area utilities, scrollbar-thin.
- layout.tsx: PWA metadata + viewport + sonner toaster. manifest.webmanifest + public/sw.js (shell precache, model cache-first, network-first navigations, API passthrough).
- Built class-check-app.tsx (boot/SW/auth/connectivity + view switch), shell.tsx (desktop sidebar + mobile bottom nav with center scan FAB + More sheet), shared.tsx (PageHeader, StatCard, IdentityAvatar, EmptyState, LoadingBlock, MethodBadge, AttendanceRing/Bar, StatusPill).
- Stubbed all 13 views. page.tsx renders ClassCheckApp.
- Wrote docs/CONTRACT.md: API spec, store/types conventions, file ownership for parallel tasks.

Stage Summary:
- Contract is law: backend (Task 2) implements endpoints exactly; view tasks (3,4,5) code against api/store/types.
- Env: AUTH_SECRET set in .env. DATABASE_URL=file:/home/z/my-project/db/custom.db.
- Subagents must append their sections below and NOT edit shared files listed in CONTRACT.md.

---
Task ID: 4
Agent: views-a
Task: Built 5 UI views — login, onboarding, home, students, student detail — per CONTRACT.md (emerald design system, mobile-first, shadcn/ui, framer-motion entrances, full loading/error/empty states).

Work Log:
- login.tsx: full-screen emerald radial-wash background, ScanFace glyph card, email/password with show/hide, h-12 submit with spinner, 401 → inline "Invalid email or password" (other errors → toast), 3 demo-account chips (hod@ / lecturer@ / kwame@classcheck.edu) that fill + submit, footer note "password … classcheck". Success → setUser + replace(user.onboarded ? 'home' : 'onboarding'). Enter submits via form.
- onboarding.tsx: 3-step wizard with progress bars/dots. Step 1 name (prefilled) + title Select (None/Prof./Dr./Mr./Mrs./Ms.). Step 2 department radio-cards from GET /api/departments (preselect user.departmentId) + collapsible "Create new department" (name; code auto-derived from initials if blank). Step 3 existing courses (GET /api/courses, fixed chips) + pending new courses (chips w/ X remove — only local, see caveats) + inline add form (code/title/level 100-500/semester 1-2). Finish → POST /api/profile ({name,title,departmentId|departmentNew}) → POST /api/courses per pending course (per-course try/catch so a 409 duplicate never blocks) → setUser → spring check-pop → replace('home') after 950 ms. Works as edit mode when already onboarded.
- home.tsx: time-based greeting with title+last name, date-fns sub-date; amber→emerald gradient "Attendance in progress — {code}" banner + Resume when store.openSession; hero "Take attendance" card (h-24, active:scale) → scan; 3 StatCards (Students = Σ course.studentCount, Courses, "This week" = session-weighted avg of department report courses.avgAttendance, '—' when 0 sessions); quick actions (Add student→students, New course→onboarding, Reports→reports); Recent sessions = GET /api/sessions?limit=5 rows (code badge, title, Today/Yesterday/date HH:mm, present/roster, StatusPill) → navigate('session',{sessionId}); dismissible install banner (localStorage flag) with beforeinstallprompt capture + toast fallback; WifiOff offline banner; per-block Skeletons + BlockError retry, no full-page spinner.
- students.tsx: PageHeader + Add DropdownMenu (New student / Import CSV / QR sheets); debounced (250 ms) client search; course filter chips (All → GET /api/students, course → GET /api/courses/:id/students); rows = IdentityAvatar + name + mono studentId·L{level} + ScanFace enrolled badge + chevron → navigate('student',{studentId: item.id}); list in max-h-[32rem] overflow-y-auto scrollbar-thin. New-student dialog (studentId mono, 6-12 alnum validation, names required, level Select, optional email/phone → POST {single}). Import CSV dialog with live parse preview ("N rows detected, D duplicates in file, I invalid") → POST {bulk} → toast "Created X, skipped Y". QR sheets dialog: course Select → GET roster → qrcode data-URLs (120px, margin 1) grid with name/ID/PIN; window.print() with injected @media print CSS (visibility trick + #cc-qr-sheets) so only sheets print.
- student.tsx: params.studentId = DB id → GET /api/students/:id; back() + identity block (lg avatar, title-cased name, mono ID, Level badge, pencil → edit dialog PATCH); Attendance card (AttendanceRing 64, "X of Y sessions", late count, <75% amber hint, AttendanceBar, "No sessions yet" when total 0); Face card (enrolled emerald dot "Enrolled · N templates", Enroll/Re-enroll → navigate('enroll',{studentId: student.id}), destructive Remove face data in AlertDialog → DELETE /api/students/:id/face); QR & PIN Collapsible (fetch on open → {qrPayload,pin}, QR img, mono PIN, Copy → clipboard + toast, explanation line); Courses card (chips with X → DELETE /api/courses/:cid/students?studentId=<db id>, "Add to course" Select of unjoined my-courses → POST {studentIds:[id]}); 404/missing-param → "Student not found" EmptyState; load-error has retry; error UI checked before not-found so real failures surface.
- react-hooks/set-state-in-effect (new compiler lint) forced a pattern: effects fetch via inline async IIFE with setState strictly after await + cancelled flags; sync setState only in event handlers. All 5 files pass bunx tsc --noEmit (zero errors) AND bunx eslint (zero problems).

Stage Summary:
- All 5 view files compile clean and lint clean. Do NOT need backend running to compile; all fetches are guarded (empty arrays, null envelopes, ApiError/OfflineError paths, retry affordances everywhere).
- Contract gaps/caveats for integrator:
  1. No DELETE /api/courses/:id endpoint → onboarding "remove" only removes locally-pending (not yet created) courses; existing course chips are fixed. If course deletion is wanted, backend must add an endpoint.
  2. StudentDetail has no enrolledAt field → face card shows "Enrolled · N templates" without the spec'd enrollment date.
  3. PRE-EXISTING SHARED-FILE BUGS (not mine to edit): (a) src/components/app/shell.tsx:73 calls setPendingSync() which is never destructured from useAppStore (TS2552 → breaks the whole app build at runtime compile); (b) src/components/app/class-check-app.tsx:80 uses `e instanceof import('@/lib/api').OfflineError` — invalid instanceof operand (TS2339). Both need Task 1/orchestrator fixes.
  4. Home "This week avg" is session-count-weighted avg of DepartmentReport.courses.avgAttendance; shows '—' when no sessions.
  5. dev.log currently 500s due to reports.tsx (Task 5, mid-flight) — unrelated to Task 4 files.

---
Task ID: 6
Agent: Z.ai (orchestrator)
Task: Integration — fix cross-agent type errors, write missing review.tsx, theme provider, db push + seed, lint/type cleanup.

Work Log:
- Fixed backend type errors: seed array typings, PrismaPromise[] in records.ts, BadRequestError re-exports from _lib/helpers, students route undefined→null normalization.
- Fixed shared files: shell.tsx setPendingSync destructure, class-check-app OfflineError instanceof + ThemeProvider (next-themes) wrapper.
- Fixed scan.tsx dead comparison; enroll.tsx ref-during-render + sync setState in effect + memoization conflicts; sessions/admin effect patterns (IIFE + await-first).
- Wrote missing review.tsx (session review & finalize: roster merge with offline queue, P/L/A segmented control, search, CSV export, discard dialog, offline guard).
- bunx prisma generate + db push + seed: 1 dept, 3 users, 4 courses, 42 students, 118 enrollments, 48 sessions, 1038 records.
- curl-verified: login/me/courses/roster/students/sessions/reports(course+dept)/settings/export CSV/session create→sync→finalize→delete/401 guard. All correct.
- eslint: 0 errors 0 warnings on src/. tsc: clean (excluding pre-existing examples/skills errors).

Stage Summary:
- App is integrated and API-verified. Next: browser E2E verification (Task 7).

---
Task ID: 7
Agent: Z.ai (orchestrator)
Task: E2E browser verification with agent-browser; fix discovered bugs; final polish.

Work Log:
- Verified golden path in real browser: login (demo chip) → home dashboard with live seed data → students list → student detail (97% ring, face card, QR/PIN collapsible, course chips) → reports (trend chart, at-risk table, threshold control) → scan select → live scan screen (session created, Face/QR/PIN tabs) → PIN check-in (toast + counter 1/38 + chip) → End & review (1 present / 37 absent / 3%) → Submit attendance → home shows today's completed session.
- BUG FOUND & FIXED: scan checkIn sent index-number as records.studentId; sync API + review merge expect DB id → check-ins silently dropped. Fixed scan.tsx to send entry.id.
- BUG FOUND & FIXED: session detail showed DB cuid instead of index number → added code field to AttendanceRecord DTO (backend include student.studentId), displayed via code ?? studentId in session.tsx + review.tsx.
- Fixed enroll.tsx React-compiler lint errors (ref-during-render → useEffect mirror; sync setState in camera effect → deferred; captureCurrent useCallback memoization conflict → plain function).
- Verified admin dashboard (dept stats, courses-by-attendance table, weekly trend), mobile 390px layout (bottom nav + scan FAB + More sheet), kiosk mode with QR/PIN fallbacks, enrollment consent screen (plain-language, v1), dark mode, settings (threshold/liveness/mode/theme).
- PWA assets verified 200: manifest.webmanifest, sw.js, /models/*, /vendor/face-api.js. DB: 0 stray OPEN sessions. Camera-unavailable graceful states verified headless (no physical camera in sandbox — live face match verified via pure match.ts math + code review of thresholds).
- bun run lint: exit 0. tsc: clean for app code. dev.log: healthy.

Stage Summary:
- ClassCheck v1 is complete and browser-verified. All PRD Phase-1 features implemented: face enrollment w/ consent, walkthrough + kiosk scanning, passive liveness (kiosk head-turn challenge), QR+PIN fallback, offline queue + roster cache, manual override via review, lecturer + department dashboards, CSV exports, at-risk thresholds, installable PWA with offline shell.

---
Task ID: 8
Agent: Z.ai (orchestrator)
Task: Fix widespread 401 "Unauthorized" errors in the preview panel.

Work Log:
- Diagnosis via dev.log: POST /api/auth/login 200 immediately followed by 401s on every data endpoint. Root cause: the app runs inside a cross-origin preview iframe (preview-chat-*.space-z.ai); browsers block SameSite=Lax cookie storage/sending in third-party contexts, so login succeeded (user JSON in body) but the session cookie never persisted — every subsequent fetch was unauthenticated.
- Fix — dual-mode auth (bearer + cookie):
  - src/lib/auth.ts: getSessionUser() now checks `Authorization: Bearer` first, then falls back to the cc_token cookie.
  - login route: returns { user, token } in the body (cookie still set for installed-PWA/top-level use).
  - me route: returns { user, token } and mints a fresh token so cookie-capable boots also seed bearer mode.
  - src/lib/api.ts: token helpers (get/set/clearAuthToken in localStorage key cc_auth_token), attaches Authorization header to every request, global setUnauthorizedHandler() hook fired on any 401 (clears token).
  - login.tsx: persists token from login response.
  - class-check-app.tsx: registers 401 handler (clear token → setUser(null) → replace('login') → "Session expired" toast, only when a user was logged in); clears stale token on boot when /me returns null.
  - shell.tsx + settings.tsx logout: clearAuthToken() so the 30d JWT can't silently re-login.
- Verified: bun run lint clean, tsc clean. curl: login→token, bearer → 200 on courses/sessions/me, no-auth → 401. Browser E2E: login → home with live data; COOKIES CLEARED + reload → still logged in via bearer (exact iframe scenario); zero 401s / zero console errors; sign-out clears token (cc_auth_token: null) and returns to login; re-login clean.

Stage Summary:
- Auth now works in all contexts: preview iframe (bearer), top-level & installed PWA (bearer seeded from first cookie login). User's stuck state self-heals on reload: /me returns null → clean login screen → sign in once → token stored.

---
Task ID: 9
Agent: Z.ai (orchestrator)
Task: Allow department student-ID format (PHA/0001/26) + fix login 500 caused by sandbox .env reset wiping AUTH_SECRET.

Work Log:
- Replaced strict /^[A-Za-z0-9]{6,12}$/ student-ID validation with shared STUDENT_ID_PATTERN in src/lib/types.ts: ^[A-Za-z0-9][A-Za-z0-9/-]{1,18}[A-Za-z0-9]$ (3–20 chars, letters/digits with / or - separators, e.g. PHA/0001/26, CS-101/23, plain numeric IDs still valid).
- Applied pattern in 4 places: New Student dialog (students.tsx submit + placeholder "e.g. PHA/0001/26" + maxLength 20 + role="alert" error), client CSV preview parseCsv, backend single-create zod regex, backend bulk CSV row validation. CSV dialog example now shows PHA format.
- CRITICAL FIX discovered during testing: sandbox restarted dev server at 21:52 and regenerated .env WITHOUT AUTH_SECRET → signToken/getSecret threw → every login 500'd. Made secret resolution resilient in auth.ts: env AUTH_SECRET → persisted db/.auth-secret file → auto-generate+persist → derived last-resort; never throws. Seeded db/.auth-secret with the original secret so previously issued tokens remain valid.
- Verified via curl: login OK again; create PHA/0001/26 → 200; invalid "bad id!" → 400 with clear message; bulk CSV 2 PHA rows created; search "PHA/0001" matches. Browser E2E: New Student dialog accepts PHA/0007/26 (auto-uppercased), student appears in list; invalid format shows inline error and blocks submit; students list re-renders clean.
- Cleaned up all 4 test students (no DELETE endpoint — removed via sqlite3: AttendanceRecord → Enrollment → Student; back to 42 students). Lint + tsc clean; dev.log free of 401/500.

Stage Summary:
- Student IDs now accept the department's real format PHA/0001/26 everywhere (dialog, CSV import, API, QR payloads use | delimiter so / is safe).
- Auth secret no longer depends on .env surviving sandbox restarts; tokens issued before the reset still validate.
