// Prezaro — one-time admin bootstrap for a fresh production database.
// Runs on container start; creates the first ADMIN user when the
// users table is empty and credentials are provided.
//
// Optional env vars:
//   BOOTSTRAP_EMAIL        login email for the first account (defaults to abubakarima1969@uds.edu.gh)
//   BOOTSTRAP_PASSWORD     login password (choose a strong one!)
//   BOOTSTRAP_NAME         display name  (default "Prezaro Administrator")
//   BOOTSTRAP_DEPARTMENT   department name — created + linked if provided

import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const db = new PrismaClient()

/** Directory holding local files, derived from DATABASE_URL if file-based. */
function databaseDir(): string | null {
  const raw = process.env.DATABASE_URL ?? ''
  if (raw.startsWith('file:')) {
    const file = raw.slice('file:'.length)
    return path.isAbsolute(file) ? path.dirname(file) : path.dirname(path.resolve(process.cwd(), 'prisma', file))
  }
  return null
}

function deptCode(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
  return (initials || 'DEPT').toUpperCase().slice(0, 6)
}

async function main(): Promise<void> {
  const dir = databaseDir()

  // ---- Storage-persistence guard for SQLite (if SQLite is used) ----
  if (dir) {
    const markerPath = path.join(dir, '.prezaro-instance')
    const userCount = await db.user.count()
    const markerExists = fs.existsSync(markerPath)

    if (userCount === 0 && markerExists) {
      console.error('==============================================================')
      console.error('[prezaro] WARNING: DATABASE IS EMPTY BUT THIS STORAGE HAS RUN')
      console.error('[prezaro] PREZARO BEFORE (persistence marker found).')
      console.error('[prezaro] The disk holding your SQLite database is NOT persistent —')
      console.error('[prezaro] previously saved courses, students and attendance were')
      console.error('[prezaro] lost during a restart/redeploy.')
      console.error('==============================================================')
    }

    if (!markerExists) {
      try {
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(markerPath, new Date().toISOString())
        console.log('[prezaro] storage persistence marker written.')
      } catch {
        // ignore if read-only
      }
    }
  }

  // ---- Database reset guard for live production ----
  const shouldReset =
    process.env.RESET_DATABASE === 'true' ||
    process.env.CLEAR_DB === 'true' ||
    process.env.BOOTSTRAP_RESET === 'true'

  if (shouldReset) {
    console.log('[bootstrap] RESET_DATABASE requested — wiping all tables for fresh start...')
    await db.attendanceRecord.deleteMany({})
    await db.session.deleteMany({})
    await db.enrollment.deleteMany({})
    await db.classSchedule.deleteMany({})
    await db.course.deleteMany({})
    await db.enrollmentSubmission.deleteMany({})
    await db.accessCode.deleteMany({})
    await db.student.deleteMany({})
    await db.user.deleteMany({})
    await db.department.deleteMany({})
    await db.institution.deleteMany({})
    console.log('[bootstrap] Tables wiped successfully.')
  }

  // ---- 1. Ensure Primary Institution exists ----
  let institution = await db.institution.findFirst({
    where: { slug: 'uds' },
  })
  if (!institution) {
    institution = await db.institution.create({
      data: {
        name: 'University for Development Studies',
        code: 'UDS',
        slug: 'uds',
        plan: 'CAMPUS_ANNUAL',
        status: 'ACTIVE',
        maxStudents: 10000,
        maxCourses: 300,
        allowedModes: 'ALL',
        confidenceThreshold: 0.48,
        lateGraceMinutes: 15,
        termSystem: 'TRIMESTER',
        atRiskThreshold: 75,
        contactEmail: 'abubakarima1969@uds.edu.gh',
        featuresJson: JSON.stringify({
          allowOffline: true,
          requireConsent: true,
          notifyEmail: true,
          notifyPush: true,
        }),
      },
    })
    console.log('[bootstrap] Created primary institution:', institution.name)
  }

  // ---- 2. Ensure Core Departments exist ----
  let deptGA = await db.department.findFirst({
    where: { name: 'General Administration', institutionId: institution.id },
  })
  if (!deptGA) {
    deptGA = await db.department.create({
      data: { name: 'General Administration', code: 'GA', institutionId: institution.id },
    })
  }

  let deptCS = await db.department.findFirst({
    where: { name: 'Computer Science', institutionId: institution.id },
  })
  if (!deptCS) {
    deptCS = await db.department.create({
      data: { name: 'Computer Science', code: 'CS', institutionId: institution.id },
    })
  }

  let deptPharm = await db.department.findFirst({
    where: { name: 'Pharmacognosy and Herbal Medicine', institutionId: institution.id },
  })
  if (!deptPharm) {
    deptPharm = await db.department.create({
      data: { name: 'Pharmacognosy and Herbal Medicine', code: 'PAHM', institutionId: institution.id },
    })
  }

  // ---- 3. Ensure Superadmin User exists and is properly configured ----
  const email = (process.env.BOOTSTRAP_EMAIL?.trim().toLowerCase() || 'abubakarima1969@uds.edu.gh')
  const password = process.env.BOOTSTRAP_PASSWORD?.trim() || 'ChangeMe2026!'
  const name = process.env.BOOTSTRAP_NAME?.trim() || 'Alhassan Abubakari'

  const passwordHash = await hash(password, 10)
  const existingUser = await db.user.findUnique({ where: { email } })

  if (existingUser) {
    await db.user.update({
      where: { id: existingUser.id },
      data: {
        role: 'SUPERADMIN',
        onboarded: true,
        institutionId: institution.id,
        departmentId: existingUser.departmentId || deptGA.id,
        passwordHash,
      },
    })
    console.log(`[bootstrap] Superadmin user (${email}) updated to role SUPERADMIN with active credentials.`)
  } else {
    await db.user.create({
      data: {
        email,
        passwordHash,
        name,
        title: 'Institutional Head',
        role: 'SUPERADMIN',
        onboarded: true,
        institutionId: institution.id,
        departmentId: deptGA.id,
      },
    })
    console.log(`[bootstrap] Successfully created Superadmin user: ${email} (Role: SUPERADMIN)`)
  }

  // ---- 4. Ensure initial starter HOD access code exists for Computer Science ----
  const existingHodCode = await db.accessCode.findFirst({
    where: { code: 'PREZ-HOD-UDS01' },
  })
  if (!existingHodCode) {
    const adminUser = await db.user.findUnique({ where: { email } })
    if (adminUser) {
      await db.accessCode.create({
        data: {
          code: 'PREZ-HOD-UDS01',
          role: 'ADMIN',
          departmentId: deptCS.id,
          createdById: adminUser.id,
          maxUses: 5,
          usedCount: 0,
          status: 'ACTIVE',
        },
      })
      console.log('[bootstrap] Created initial Department Head access code: PREZ-HOD-UDS01')
    }
  }
}

main()
  .catch((e) => {
    console.error('[bootstrap] failed:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
