# Prezaro — Roles, Permissions & Operational Responsibilities

This document defines the architectural hierarchy, operational responsibilities, data access boundaries, and feature matrix for all user roles across the **Prezaro** zero-proxy attendance system.

---

## 1. System Role Hierarchy

Prezaro operates a multi-tenant institutional architecture with strict boundary enforcement:

```
                      ┌────────────────────────────────────────┐
                      │              SUPERADMIN                │
                      │  (Multi-Institution Platform Control)  │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │             ADMIN (HOD)                │
                      │     (Department-Level Operations)      │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │               LECTURER                 │
                      │    (Course Rosters & Lecture Scans)    │
                      └───────────────────┬────────────────────┘
                                          │
                                          ▼
                      ┌────────────────────────────────────────┐
                      │                STUDENT                 │
                      │    (Self-Enrollment & Verification)    │
                      └────────────────────────────────────────┘
```

---

## 2. Detailed Role Breakdown

### Role 1: Platform Super Administrator (`SUPERADMIN`)

#### Overview
The `SUPERADMIN` manages the entire Prezaro platform instance, governing all educational institutions, tenants, cross-campus capacity quotas, and global dynamic academic policies without requiring code changes or server redeployments.

#### Primary Responsibilities
1. **Multi-Tenant Institution Provisioning**:
   - Provision new university or polytechnic tenant profiles with custom subdomains/slugs, institutional codes (e.g., `UDS`, `KNUST`), and primary brand colors.
   - Adjust commercial subscription tiers (`TRIAL`, `FACULTY`, `CAMPUS_ANNUAL`, `ENTERPRISE`).
   - Monitor and enforce student capacity limits and course quotas.
2. **Academic Department Architecture**:
   - Dynamically create, rename, and manage academic departments across any institution.
   - Remove legacy or mocked departmental structures in real time.
3. **Dynamic Policy Engine Customization**:
   - Configure academic calendar models (Semester system vs. Trimester system).
   - Enforce regulatory attendance thresholds (e.g., 75% rule for examination disbarment).
   - Tune latecomer grace periods (e.g., 15 minutes before check-in flags as `LATE`).
   - Calibrate Edge AI Euclidean distance thresholds (0.40–0.60) to balance strict security vs. challenging lecture hall lighting.
4. **Platform-Wide Governance & Audit**:
   - Provision or revoke credentials for platform administrators, department heads, and lecturers.
   - Inspect email delivery outboxes (Resend/SMTP logs) and system-wide security audit trails.
   - Trigger authorized system state resets or maintenance migrations.

---

### Role 2: Department Administrator / Head of Department (`ADMIN`)

#### Overview
The `ADMIN` (Head of Department / Academic Coordinator) manages operations within their assigned academic department. They ensure lecturers have active access, oversee biometric student self-enrollments, and monitor attendance metrics for faculty compliance.

#### Primary Responsibilities
1. **Lecturer Access Code Generation & Onboarding**:
   - Issue single-use or cohort access codes for new or adjunct lecturers.
   - Set expiry periods (7 days, 30 days, or unlimited) and usage caps.
   - Dispatch invitation codes directly to lecturers' emails via Resend with 1-click account activation links.
   - Revoke uncompromised or expired access codes instantly.
2. **Student Self-Enrollment & Biometric Face Approval**:
   - Generate and share department-wide or course-specific self-enrollment links with students.
   - Review incoming student biometric submissions in the verification queue.
   - Audit student face capture previews (center, tilt right, tilt left) and inspect anti-spoofing quality before one-click approval into official departmental registers.
3. **Departmental Attendance & Analytics**:
   - Monitor attendance trends across all departmental courses.
   - Identify low-attendance courses and disbarment risks before end-of-semester examinations.
   - Export audit-grade accreditation reports with breakdown of facial vs. manual check-ins.

---

### Role 3: Course Lecturer / Faculty Member (`LECTURER`)

#### Overview
The `LECTURER` conducts teaching sessions, launches zero-proxy face attendance scanners, schedules recurring lecture timetables, and logs justified manual exceptions.

#### Primary Responsibilities
1. **Course & Student Roster Management**:
   - Create and organize course rosters (e.g., `SPS 201 Basic Pharmacognosy`) tied to their department.
   - Access pre-approved students automatically without tedious manual data entry.
2. **Face Attendance Session Execution**:
   - Launch the on-device Edge Face Scanner in continuous walk-through or kiosk mode.
   - Utilize browser WebRTC camera access with instant, client-side Euclidean matching.
   - Automatically log attendees with precise timestamp, confidence score, and status (`PRESENT`, `LATE`, or `UNRECOGNIZED`).
3. **Attendance Review & Justified Comments**:
   - Perform end-of-lecture attendance reviews before submitting final records.
   - Provide manual check-ins for students with approved exemptions (e.g., face capture privacy opt-out, medical notes, lighting issues) accompanied by mandatory justification categories and audit comments.
4. **Class Schedules & Automated Reminders**:
   - Set up recurring lecture timetable slots with start/end times and lecture venue/halls.
   - Receive automated email and push notifications 15 to 30 minutes before lecture time with 1-click links to take attendance.
5. **Session Reporting & Data Export**:
   - Export session attendance records to formatted Excel/CSV files with attendee percentages, timestamps, and manual justification notes.

---

### Role 4: Enrolled Scholar / Student (`STUDENT`)

#### Overview
The `STUDENT` participates in classes and verifies their physical attendance during lectures through privacy-preserving on-device facial recognition.

#### Primary Responsibilities
1. **One-Time Self-Enrollment**:
   - Access the department's secure self-enrollment link on their smartphone or laptop.
   - Submit student index number, full name, academic level, and contact details.
   - Complete 3 guided facial captures (center, tilt right, tilt left) to calculate on-device face descriptors without uploading raw private biometric imagery.
   - Select their enrolled courses for automatic roster placement once approved by the department head.
2. **Classroom Attendance Verification**:
   - Walk past the lecturer's phone or scanner terminal during class or step up to the scanner.
   - Receive instant visual confirmation of attendance on-screen.
   - In cases of exemption, provide justification documentation to the lecturer for manual record keeping.

---

## 3. Permissions Matrix

| Capability / Action | SUPERADMIN | ADMIN (HOD) | LECTURER | STUDENT |
| :--- | :---: | :---: | :---: | :---: |
| **Provision & configure Institutions** | ✅ Full | ❌ | ❌ | ❌ |
| **Tune Dynamic Policies & Quotas** | ✅ Full | ❌ | ❌ | ❌ |
| **Create & delete Departments** | ✅ Full | ❌ | ❌ | ❌ |
| **Generate Lecturer Access Codes** | ✅ Global | ✅ Dept Only | ❌ | ❌ |
| **Email Access Codes to Lecturers** | ✅ Global | ✅ Dept Only | ❌ | ❌ |
| **Approve Student Face Submissions** | ✅ Global | ✅ Dept Only | ❌ | ❌ |
| **Create & manage Courses** | ✅ Full | ✅ Dept Only | ✅ Own Courses | ❌ |
| **Create Class Schedules & Reminders** | ✅ Full | ✅ Dept Only | ✅ Own Courses | ❌ |
| **Launch Live Face Attendance Scanner**| ✅ Full | ✅ Full | ✅ Own Courses | ❌ |
| **Submit Attendance with Comments** | ✅ Full | ✅ Full | ✅ Own Courses | ❌ |
| **Export Course Attendance Records** | ✅ Full | ✅ Dept Only | ✅ Own Courses | ❌ |
| **Inspect Resend / SMTP Outbox Logs** | ✅ Full | ❌ | ❌ | ❌ |
| **Submit One-Time Enrollment Link** | ❌ | ❌ | ❌ | ✅ |
| **Undergo Live Face Verification** | ❌ | ❌ | ❌ | ✅ |

---

## 4. Onboarding Workflows

### 1. New Lecturer Onboarding
1. Superadmin or Department Head opens **Lecturer Access** and clicks **+ Generate Access Code**.
2. Selects role (`Lecturer` or `Department Admin`), specifies the lecturer's name and email address, and ticks **Dispatch Invitation Email**.
3. The platform dispatches a branded invitation email via Resend containing the code and an instant activation link: `https://prezaro.com/?code=DEPT-LEC-XXXX`.
4. The lecturer opens the link, sets their account password, and is instantly linked to their department and assigned courses.

### 2. Student Cohort Onboarding
1. Department Head clicks **Student Self-Enrollment Link**.
2. Selects **Department-Wide Link** or a specific Course link and copies the URL: `https://prezaro.com/enroll?dept=...`.
3. Shares the link via departmental WhatsApp / Telegram / Notice board.
4. Students complete the 3-pose facial capture on their own mobile devices in under 60 seconds.
5. Department Head reviews and clicks **Approve & Enroll** in bulk. All students appear instantly in the lecturer's attendance roster.
