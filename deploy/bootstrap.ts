// ClassCheck — one-time admin bootstrap for a fresh production database.
// Runs on every container start; creates the first ADMIN user only when the
// users table is empty and BOOTSTRAP_EMAIL/BOOTSTRAP_PASSWORD are provided.
//
// Optional env vars:
//   BOOTSTRAP_EMAIL        login email for the first account
//   BOOTSTRAP_PASSWORD     login password (choose a strong one!)
//   BOOTSTRAP_NAME         display name  (default "Department Admin")
//   BOOTSTRAP_DEPARTMENT   department name — created + linked if provided

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

function deptCode(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
  return (initials || 'DEPT').toUpperCase().slice(0, 6)
}

async function main(): Promise<void> {
  const email = process.env.BOOTSTRAP_EMAIL?.trim().toLowerCase()
  const password = process.env.BOOTSTRAP_PASSWORD
  const name = process.env.BOOTSTRAP_NAME?.trim() || 'Department Admin'
  const departmentName = process.env.BOOTSTRAP_DEPARTMENT?.trim()

  if (!email || !password) {
    console.log('[bootstrap] BOOTSTRAP_EMAIL / BOOTSTRAP_PASSWORD not set — skipping.')
    return
  }

  const existing = await db.user.count()
  if (existing > 0) {
    console.log(`[bootstrap] ${existing} user(s) already exist — skipping.`)
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
