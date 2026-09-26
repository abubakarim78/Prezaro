// ============================================================
// ClassCheck — database seed (idempotent: wipes & recreates)
// Run with: bun prisma/seed.ts
// ============================================================
import { PrismaClient } from '@prisma/client'
import { hashSync } from 'bcryptjs'

const db = new PrismaClient()

/** Deterministic PRNG so repeat seeds produce identical demo data. */
function mulberry32(seed: number): () => number {
  let a = seed | 0
  return function () {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20250611)

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]
}

const FIRST_NAMES = [
  'Kwame', 'Ama', 'Kofi', 'Akosua', 'Yaw', 'Adwoa', 'Kojo', 'Abena',
  'Nana', 'Esi', 'Kwabena', 'Afia', 'Ekow', 'Mawuli', 'Sena', 'Fiifi',
  'Ewurabena', 'Nhyira', 'Kwasi', 'Yaa', 'Kweku', 'Adom', 'Maame', 'Ohene',
]

const LAST_NAMES = [
  'Mensah', 'Owusu', 'Boateng', 'Asante', 'Ofori', 'Appiah', 'Amoah',
  'Darko', 'Acheampong', 'Osei', 'Asare', 'Addo', 'Agyeman', 'Yeboah',
  'Nkrumah', 'Baidoo', 'Quartey', 'Ankrah', 'Tetteh', 'Lamptey', 'Sowah',
  'Quaye', 'Oppong', 'Sarpong', 'Baiden', 'Danquah', 'Nyarko', 'Boadi',
]

const SESSION_TIMES = [7.5, 10, 13] // 07:30 / 10:00 / 13:00
const SESSIONS_PER_COURSE = 12
const STUDENT_COUNT = 42

async function main(): Promise<void> {
  // ---- wipe (dev DB; order matters) ---------------------------
  await db.attendanceRecord.deleteMany()
  await db.session.deleteMany()
  await db.enrollment.deleteMany()
  await db.enrollmentSubmission.deleteMany()
  await db.student.deleteMany()
  await db.accessCode.deleteMany()
  await db.classSchedule.deleteMany()
  await db.course.deleteMany()
  await db.user.deleteMany()
  await db.department.deleteMany()
  await db.school.deleteMany()
  await db.institution.deleteMany()

  // ---- institution + school layer ------------------------------
  const institution = await db.institution.create({
    data: {
      name: 'University of ClassCheck',
      code: 'UCC',
      slug: 'classcheck',
      termSystem: 'SEMESTER',
      currentSemester: 1, // drives which courses /enroll lists
    },
  })
  const spms = await db.school.create({
    data: {
      name: 'School of Physical & Mathematical Sciences',
      code: 'SPMS',
      institutionId: institution.id,
    },
  })

  // ---- departments ---------------------------------------------
  const cs = await db.department.create({
    data: {
      name: 'Computer Science',
      code: 'CS',
      institutionId: institution.id,
      schoolId: spms.id,
    },
  })
  const math = await db.department.create({
    data: {
      name: 'Mathematics & Statistics',
      code: 'MATH',
      institutionId: institution.id,
      schoolId: spms.id,
    },
  })

  // ---- users ---------------------------------------------------
  const passwordHash = hashSync('classcheck', 10)
  await db.user.create({
    data: {
      email: 'dean@classcheck.edu',
      passwordHash,
      name: 'Prof. Nana Sarpong',
      title: 'Dean, School of Physical & Mathematical Sciences',
      role: 'DEAN',
      onboarded: true,
      settingsJson: '{}',
      institutionId: institution.id,
      schoolId: spms.id,
    },
  })
  await db.user.create({
    data: {
      email: 'hod@classcheck.edu',
      passwordHash,
      name: 'Prof. Abena Owusu',
      title: 'Head of Department',
      role: 'ADMIN',
      onboarded: true,
      settingsJson: '{}',
      institutionId: institution.id,
      departmentId: cs.id,
    },
  })
  const ama = await db.user.create({
    data: {
      email: 'lecturer@classcheck.edu',
      passwordHash,
      name: 'Dr. Ama Mensah',
      title: 'Senior Lecturer',
      role: 'LECTURER',
      onboarded: true,
      settingsJson: '{}',
      institutionId: institution.id,
      departmentId: cs.id,
    },
  })
  const kwame = await db.user.create({
    data: {
      email: 'kwame@classcheck.edu',
      passwordHash,
      name: 'Mr. Kwame Oteng',
      title: 'Lecturer',
      role: 'LECTURER',
      onboarded: true,
      settingsJson: '{}',
      institutionId: institution.id,
      departmentId: cs.id,
    },
  })

  // ---- courses -------------------------------------------------
  // MA301 lives in a DIFFERENT department of the same school (SPMS) so a
  // single submission can mix courses across departments; CS201 (level 200)
  // and CS402 (semester 2) demo the level/term filter on /enroll.
  const courseSpecs = [
    { code: 'CS301', title: 'Data Structures & Algorithms', level: 300, semester: 1, lecturerId: ama.id, departmentId: cs.id },
    { code: 'CS305', title: 'Database Systems', level: 300, semester: 1, lecturerId: ama.id, departmentId: cs.id },
    { code: 'CS402', title: 'Computer Networks', level: 400, semester: 2, lecturerId: kwame.id, departmentId: cs.id },
    { code: 'CS201', title: 'Programming Fundamentals', level: 200, semester: 1, lecturerId: kwame.id, departmentId: cs.id },
    { code: 'MA301', title: 'Linear Algebra', level: 300, semester: 1, lecturerId: kwame.id, departmentId: math.id },
  ]
  const courses: { id: string; lecturerId: string }[] = []
  for (const spec of courseSpecs) {
    courses.push(await db.course.create({ data: { ...spec } }))
  }

  // ---- students (unique names, IDs) ---------------------------
  const usedNames = new Set<string>()
  const usedStudentIds = new Set<string>()
  const students: {
    studentId: string
    firstName: string
    lastName: string
    level: number
    email: string
    phone: string
    departmentId: string
    descriptorsJson: string
  }[] = []
  for (let i = 0; i < STUDENT_COUNT; i++) {
    let first = pick(FIRST_NAMES)
    let last = pick(LAST_NAMES)
    let combo = `${first} ${last}`
    let guard = 0
    while (usedNames.has(combo) && guard < 300) {
      first = pick(FIRST_NAMES)
      last = pick(LAST_NAMES)
      combo = `${first} ${last}`
      guard++
    }
    usedNames.add(combo)

    let studentId = ''
    do {
      studentId = `204${String(Math.floor(rand() * 100000)).padStart(5, '0')}`
    } while (usedStudentIds.has(studentId))
    usedStudentIds.add(studentId)

    const phonePrefix = pick(['020', '024', '027', '054', '055', '059'])
    students.push({
      studentId,
      firstName: first,
      lastName: last,
      level: pick([200, 300, 400]),
      email: `${first}.${last}@st.ucc.edu.gh`.toLowerCase(),
      phone: `${phonePrefix}${String(Math.floor(rand() * 10000000)).padStart(7, '0')}`,
      departmentId: cs.id,
      descriptorsJson: '[]',
    })
  }
  const createdStudents: { id: string }[] = []
  for (const s of students) {
    createdStudents.push(await db.student.create({ data: s }))
  }

  // ---- enrollments (CS301≈38, CS305≈30, CS402≈24, CS201≈26, MA301≈14) ----
  const sizes = [38, 30, 24, 26, 14]
  const enrollmentRows: { courseId: string; studentId: string }[] = []
  courses.forEach((course, ci) => {
    const order = shuffle(createdStudents)
    for (let i = 0; i < Math.min(sizes[ci], order.length); i++) {
      enrollmentRows.push({ courseId: course.id, studentId: order[i].id })
    }
  })
  await db.enrollment.createMany({ data: enrollmentRows })

  // ---- historical sessions: 12 COMPLETED over past 28 days -----
  const weekdays: Date[] = []
  const today = new Date()
  for (let off = 28; off >= 1; off--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - off)
    const wd = d.getDay()
    if (wd >= 1 && wd <= 5) weekdays.push(d)
  }
  // spread 12 picks evenly across the weekday list
  const pickedDates: Date[] = []
  for (let i = 0; i < SESSIONS_PER_COURSE; i++) {
    const idx = Math.min(
      weekdays.length - 1,
      Math.round((i * (weekdays.length - 1)) / (SESSIONS_PER_COURSE - 1)),
    )
    const d = weekdays[idx]
    if (d && !pickedDates.some((p) => p.getTime() === d.getTime())) pickedDates.push(d)
  }
  for (const d of weekdays) {
    if (pickedDates.length >= SESSIONS_PER_COURSE) break
    if (!pickedDates.some((p) => p.getTime() === d.getTime())) pickedDates.push(d)
  }
  pickedDates.sort((a, b) => a.getTime() - b.getTime())

  const sessionsByCourse = new Map<string, { id: string; startedAt: Date }[]>()
  for (const [ci, course] of courses.entries()) {
    const created: { id: string; lecturerId: string; startedAt: Date }[] = []
    for (let i = 0; i < pickedDates.length; i++) {
      const d = pickedDates[i]
      const t = SESSION_TIMES[(i + ci) % SESSION_TIMES.length]
      const startedAt = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        Math.floor(t),
        Math.round((t % 1) * 60),
        0,
        0,
      )
      const endedAt = new Date(startedAt.getTime() + 75 * 60 * 1000)
      created.push(
        await db.session.create({
          data: {
            courseId: course.id,
            lecturerId: course.lecturerId,
            mode: 'WALKTHROUGH',
            status: 'COMPLETED',
            startedAt,
            endedAt,
          },
        }),
      )
    }
    sessionsByCourse.set(
      course.id,
      created.map((s) => ({ id: s.id, startedAt: s.startedAt })),
    )
  }

  // ---- attendance records --------------------------------------
  // student profiles: 70% regular (p≈0.88), 20% moderate (p≈0.6), 10% chronic (p≈0.22)
  const attendanceProb = new Map<string, number>()
  for (const s of createdStudents) {
    const r = rand()
    attendanceProb.set(s.id, r < 0.7 ? 0.88 : r < 0.9 ? 0.6 : 0.22)
  }

  const recordRows: {
    sessionId: string
    studentId: string
    status: string
    confidence: number | null
    markedAt: Date
  }[] = []
  for (const course of courses) {
    const enrolled = enrollmentRows
      .filter((e) => e.courseId === course.id)
      .map((e) => e.studentId)
    const sessions = sessionsByCourse.get(course.id) ?? []
    for (const sess of sessions) {
      for (const studentRowId of enrolled) {
        const p = attendanceProb.get(studentRowId) ?? 0.8
        if (rand() >= p) continue // absent (no record)
        const status = rand() < 0.08 ? 'LATE' : 'PRESENT'
        const confidence = Math.round((0.62 + rand() * 0.33) * 100) / 100
        const markedAt = new Date(
          sess.startedAt.getTime() +
            Math.floor(rand() * 25) * 60 * 1000 + // 0–25 min after start
            Math.floor(rand() * 60) * 1000,
        )
        recordRows.push({
          sessionId: sess.id,
          studentId: studentRowId,
          status,
          confidence,
          markedAt,
        })
      }
    }
  }
  await db.attendanceRecord.createMany({ data: recordRows })

  // ---- summary ---------------------------------------------------
  const [deptCount, userCount, courseCount, studentCount, enrollmentCount, sessionCount, recordCount] =
    await Promise.all([
      db.department.count(),
      db.user.count(),
      db.course.count(),
      db.student.count(),
      db.enrollment.count(),
      db.session.count(),
      db.attendanceRecord.count(),
    ])
  console.log('Seed complete:')
  console.log(`  institution: UCC — University of ClassCheck (currentSemester: 1)`)
  console.log(`  school:      SPMS — School of Physical & Mathematical Sciences`)
  console.log(`  departments: ${deptCount} (Computer Science/CS + Mathematics & Statistics/MATH, both in SPMS)`)
  console.log(`  users:       ${userCount} (dean@classcheck.edu DEAN, hod@classcheck.edu ADMIN, lecturer@classcheck.edu + kwame@classcheck.edu LECTURER — password "classcheck")`)
  console.log(`  courses:     ${courseCount} (CS301, CS305, CS402, CS201 in CS; MA301 in MATH)`)
  console.log(`  students:    ${studentCount}`)
  console.log(`  enrollments: ${enrollmentCount}`)
  console.log(`  sessions:    ${sessionCount} (all COMPLETED, past 28 days)`)
  console.log(`  records:     ${recordCount}`)
  await db.$disconnect()
}

main().catch(async (err) => {
  console.error('Seed failed:', err)
  await db.$disconnect()
  process.exit(1)
})
