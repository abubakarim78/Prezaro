import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handle, requireSuperAdmin } from '../../_lib/helpers'
import type { PlatformStats } from '@/lib/types'

export async function GET(req: Request) {
  return handle(async () => {
    await requireSuperAdmin(req)

    const [
      institutionsCount,
      activeInstitutionsCount,
      studentsCount,
      coursesCount,
      sessionsCount,
      recordsCount,
      institutions,
    ] = await Promise.all([
      db.institution.count(),
      db.institution.count({ where: { status: 'ACTIVE' } }),
      db.student.count(),
      db.course.count(),
      db.session.count(),
      db.attendanceRecord.count(),
      db.institution.findMany({ select: { plan: true } }),
    ])

    const activeLicenses = {
      trial: institutions.filter((i) => i.plan === 'TRIAL').length,
      faculty: institutions.filter((i) => i.plan === 'FACULTY').length,
      campusAnnual: institutions.filter((i) => i.plan === 'CAMPUS_ANNUAL').length,
      enterprise: institutions.filter((i) => i.plan === 'ENTERPRISE').length,
    }

    const stats: PlatformStats = {
      institutionsCount,
      activeInstitutionsCount,
      studentsCount,
      coursesCount,
      sessionsCount,
      recordsCount,
      activeLicenses,
    }

    return NextResponse.json({ stats })
  })
}
