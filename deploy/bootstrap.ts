// Rollmark — one-time admin bootstrap for a fresh production database.
// Runs on every container start; creates the first ADMIN user only when the
// users table is empty and BOOTSTRAP_EMAIL/BOOTSTRAP_PASSWORD are provided.
//
// Storage-persistence guard: a marker file is written next to the database
// on first boot. If a later boot finds an EMPTY database but the marker is
// still present, the storage holding SQLite is not persistent (container
// filesystem reset, redeploy without the volume, etc.) and previous
// courses/students were lost — this is logged loudly so the operator can
// attach a persistent volume/disk before real attendance data is trusted.
//
// Optional env vars:
//   BOOTSTRAP_EMAIL        login email for the first account
//   BOOTSTRAP_PASSWORD     login password (choose a strong one!)
//   BOOTSTRAP_NAME         display name  (default "Department Admin")
//   BOOTSTRAP_DEPARTMENT   department name — created + linked if provided

import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

/** Directory holding the SQLite file, derived from DATABASE_URL. */
function databaseDir(): string {
  const raw = process.env.DATABASE_URL ?? ''
  if (raw.startsWith('file:')) {
    const file = raw.slice('file:'.length)
    // Prisma resolves relative paths against the prisma/ schema directory.
    return path.isAbsolute(file) ? path.dirname(file) : path.dirname(path.resolve(process.cwd(), 'prisma', file))
  }
  return '/app/db'
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
  const markerPath = path.join(dir, '.rollmark-instance')

  // ---- Storage-persistence guard (runs regardless of bootstrap env) ----
  const userCount = await db.user.count()
  const markerExists = fs.existsSync(markerPath)

  if (userCount === 0 && markerExists) {
    console.error('==============================================================')
    console.error('[rollmark] WARNING: DATABASE IS EMPTY BUT THIS STORAGE HAS RUN')
    console.error('[rollmark] ROLLMARK BEFORE (persistence marker found).')
    console.error('[rollmark] The disk holding your SQLite database is NOT persistent —')
    console.error('[rollmark] previously saved courses, students and attendance were')
    console.error('[rollmark] lost during a restart/redeploy.')
    console.error('[rollmark] Fix: mount a volume at the database directory (docker')
    console.error('[rollmark] compose does this via the rollmark-db volume) or attach')
    console.error('[rollmark] a persistent disk, then redeploy.')
    console.error('==============================================================')
  }

  if (!markerExists) {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(markerPath, new Date().toISOString())
    if (userCount > 0) {
      console.log('[rollmark] persistence marker written for existing database.')
    } else {
      console.log('[rollmark] first boot on this storage — persistence marker written.')
    }
  }

  // ---- One-time admin bootstrap ----
  const email = process.env.BOOTSTRAP_EMAIL?.trim().toLowerCase()
  const password = process.env.BOOTSTRAP_PASSWORD
  const name = process.env.BOOTSTRAP_NAME?.trim() || 'Department Admin'
  const departmentName = process.env.BOOTSTRAP_DEPARTMENT?.trim()

  if (!email || !password) {
    console.log('[bootstrap] BOOTSTRAP_EMAIL / BOOTSTRAP_PASSWORD not set — skipping.')
    return
  }

  if (userCount > 0) {
    console.log(`[bootstrap] ${userCount} user(s) already exist — skipping.`)
    return
  }

  let departmentId: string | null = null
  if (departmentName) {
    const dept = await db.department.upsert({
      where: { name: departmentName },
      update: {},
      create: { name: departmentName, code: deptCode(departmentName) },
    })
    departmentId = dept.id
  }

  const passwordHash = await bcrypt.hash(password, 10)
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
  console.log(`[bootstrap] created admin user: ${email}`)
}

main()
  .catch((e) => {
    console.error('[bootstrap] failed:', e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
