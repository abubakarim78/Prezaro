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

  // ---- One-time admin bootstrap ----
  const email = (process.env.BOOTSTRAP_EMAIL?.trim().toLowerCase() || 'abubakarima1969@uds.edu.gh')
  const password = process.env.BOOTSTRAP_PASSWORD
  const name = process.env.BOOTSTRAP_NAME?.trim() || 'Prezaro Administrator'
  const departmentName = process.env.BOOTSTRAP_DEPARTMENT?.trim() || 'General Administration'

  if (!password) {
    console.log('[bootstrap] BOOTSTRAP_PASSWORD not set — skipping admin bootstrap.')
    return
  }

  // Check if admin user already exists
  const existingUser = await db.user.findUnique({
    where: { email },
  })

  if (existingUser) {
    console.log(`[bootstrap] admin user (${email}) already exists — skipping creation.`)
    return
  }

  let departmentId: string | null = null
  if (departmentName) {
    let dept = await db.department.findFirst({
      where: { name: departmentName },
    })
    if (!dept) {
      dept = await db.department.create({
        data: { name: departmentName, code: deptCode(departmentName) },
      })
    }
    departmentId = dept.id
  }

  const passwordHash = await hash(password, 10)
  await db.user.create({
    data: {
      email,
      passwordHash,
      name,
      role: 'ADMIN',
      onboarded: true,
      departmentId,
    },
  })
  console.log(`[bootstrap] successfully created admin user: ${email}`)
}

main()
  .catch((e) => {
    console.error('[bootstrap] failed:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
