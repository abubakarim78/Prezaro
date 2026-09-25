import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handle, requireUser, ForbiddenError, UnauthorizedError } from '../../_lib/helpers'
import { hash } from 'bcryptjs'

export async function POST(req: Request) {
  return handle(async () => {
    // Check if called with auth session or secret header
    const secretHeader = req.headers.get('x-system-reset-secret')
    const authSecret = process.env.AUTH_SECRET

    let isAuthorized = false
    if (authSecret && secretHeader === authSecret) {
      isAuthorized = true
    } else {
      try {
        const user = await requireUser(req)
        if (user.role === 'SUPERADMIN') {
          isAuthorized = true
        }
      } catch {}
    }

    if (!isAuthorized) {
      throw new ForbiddenError('Only the Superadmin can perform a live system reset')
    }

    console.log('[live-reset] Superadmin initiated live system wipe...')

    // 1. Wipe all data
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

    // 2. Create fresh institution
    const institution = await db.institution.create({
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

    // 3. Create fresh admin department
    const deptGA = await db.department.create({
      data: { name: 'General Administration', code: 'GA', institutionId: institution.id },
    })

    // 4. Create Superadmin user
    const superadminEmail = 'abubakarima1969@uds.edu.gh'
    const defaultPassword = process.env.BOOTSTRAP_PASSWORD || 'ChangeMe2026!'
    const passwordHash = await hash(defaultPassword, 10)

    const superadmin = await db.user.create({
      data: {
        email: superadminEmail,
        passwordHash,
        name: 'Alhassan Abubakari',
        title: 'Institutional Head',
        role: 'SUPERADMIN',
        onboarded: true,
        institutionId: institution.id,
        departmentId: deptGA.id,
      },
    })

    // 5. Create starter HOD code
    await db.accessCode.create({
      data: {
        code: 'PREZ-HOD-UDS01',
        role: 'ADMIN',
        departmentId: deptGA.id,
        createdById: superadmin.id,
        maxUses: 5,
        usedCount: 0,
        status: 'ACTIVE',
      },
    })

    return NextResponse.json({
      ok: true,
      message: 'Live database reset complete. Fresh institution, departments, and Superadmin provisioned.',
      superadmin: {
        email: superadmin.email,
        role: superadmin.role,
        institution: institution.name,
      },
    })
  })
}
