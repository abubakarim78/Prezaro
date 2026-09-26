# Enrollment Approvals: Card Redesign + HoD Slice Approvals

## 1. Approval card redesign (shared component)
- Add `EnrollmentRequestCard` to `src/components/app/shared.tsx` — mobile-first vertical layout, `min-w-0` on every flex child so nothing can push past the card edge:
  - Row 1: avatar/photo (tap to zoom, kept) + name (truncate) / `ID · Level N` / email with `break-all`; status badge `shrink-0` top-right.
  - Row 2: **course list** grouped by owning department (mono code + truncated title per row, `max-h-56 overflow-y-auto`) — stays clean with 6+ courses (no more chip overflow).
  - Row 3 (optional): per-department decision progress chips.
  - Footer: caller-provided action buttons (`grid grid-cols-2 gap-2` on mobile).
- Use it in `school.tsx` (Dean) — replaces the current cramped card.

## 2. Settings — remove email test & log for HoD
- Delete the ADMIN-only "Email notifications" section in `settings.tsx` (Delivery mode + Send test email + Delivery log + preview dialog) and its now-dead state/helpers/imports.

## 3. Per-department (HoD) approval workflow
### Slice lifecycle rules (your refinements)
- One student form → N department slices; each slice is decided independently by its HoD.
- **Dean's list shows only outstanding work**: once Department A accepts, its slice shows on the card as resolved ("Accepted — Dept A") and leaves the Dean's action list; the card's approve action targets the remaining pending departments only (e.g. "Approve Remaining (1 dept)"). A fully resolved submission leaves the pending queue automatically.
- **Dean approval clears every department's pending state immediately**: after the Dean acts, no request stays pending in any HoD queue.

### Schema (`prisma/schema.prisma` + `db push`)
- New `EnrollmentApproval` model: `submissionId`, `departmentId` (unique together), `status PENDING|APPROVED|REJECTED`, `reviewerId?`, `rejectionReason?`, `reviewedAt?`. Back-relations on `EnrollmentSubmission`, `Department`, `User`.

### API (`src/app/api/departments/enrollment-submissions/route.ts`)
- **POST**: after creating a submission, create one `EnrollmentApproval` row per department owning the selected courses, and queue an `ENROLLMENT_REQUEST` email to every ADMIN (HoD) of those departments (student name/ID/level + their department's courses).
- **GET**: allow ADMIN — scoped to submissions having an approval row for the HoD's department. Response gains per-course `departmentId`, plus `approvals` array; for ADMIN also `myStatus`/`myDepartmentId`.
- **PATCH**:
  - ADMIN: may act only on their department's row of a still-PENDING submission. APPROVE = enroll the student into their department's slice (creates the Student on first acceptance with face descriptors/photo, home department = the accepting HoD's department, schoolId kept) + mark row APPROVED. REJECT = mark row REJECTED. All rows APPROVED → auto-finalize APPROVED; all REJECTED → auto-finalize REJECTED; mixed → stays PENDING for the Dean to arbitrate.
  - DEAN/SUPERADMIN approve: approves the outstanding slices (already-accepted departments stay as-is), enrolls every not-yet-enrolled course, marks **all** rows APPROVED (nothing pending in any HoD queue), finalizes APPROVED.
  - DEAN/SUPERADMIN reject: marks all still-PENDING rows REJECTED, finalizes REJECTED; slices a HoD already accepted remain accepted.

### Email (`src/lib/email.ts`)
- New `ENROLLMENT_REQUEST` type + branded `enrollmentRequestHtml` template with the department's course list.

### Types (`src/lib/types.ts`)
- Extend `EnrollmentSubmission` with `approvals`, `myDepartmentId`, `myStatus`, and `departmentId` on course items.

### HoD UI (`src/components/app/views/admin.tsx`)
- Replace the "Approval is handled by the Dean's office" empty state in the Enrollments tab with the live incoming-request queue (badge count of pending requests). Each card shows the HoD's department's courses, other departments' progress, and two plain buttons: "Accept into {Dept}" / "Decline". Update share-link dialog copy.

### Dean UI (`src/components/app/views/school.tsx`)
- Card shows per-department progress: accepted departments as resolved chips (✓ Accepted — Dept), so the Dean's approve action clearly targets only what's left.

## Verification
- `bun run db:push`, `bunx tsc --noEmit`, `bun run lint`.

## Key product decisions (flagged)
- Unanimous HoD acceptance auto-finalizes the enrollment without waiting for the Dean; mixed HoD outcomes stay on the Dean's desk for a final call.
- Dean approve = final say over the outstanding slices and instantly resolves all department pending states; Dean reject leaves already-accepted slices intact.