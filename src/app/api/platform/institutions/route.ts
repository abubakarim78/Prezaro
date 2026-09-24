import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  BadRequestError,
  ConflictError,
  handle,
  readJson,
  requireSuperAdmin,
  zodMessage,
} from '../../_lib/helpers'
import type { Institution, PlatformStats } from '@/lib/types'

const createInstitutionSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  code: z.string().trim().min(2, 'Code must be at least 2 characters').toUpperCase(),
  slug: z
    .string()
    .trim()
    .min(2, 'Slug must be at least 2 characters')
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens'),
  plan: z.enum(['TRIAL', 'FACULTY', 'CAMPUS_ANNUAL', 'ENTERPRISE']).default('TRIAL'),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']).default('ACTIVE'),
  maxStudents: z.coerce.number().int().min(10).default(1000),
  maxCourses: z.coerce.number().int().min(1).default(100),
  allowedModes: z.enum(['ALL', 'WALKTHROUGH_ONLY', 'KIOSK_ONLY']).default('ALL'),
  confidenceThreshold: z.coerce.number().min(0.3).max(0.8).default(0.48),
  lateGraceMinutes: z.coerce.number().int().min(0).max(120).default(15),
  termSystem: z.enum(['SEMESTER', 'TRIMESTER', 'QUARTER']).default('SEMESTER'),
  atRiskThreshold: z.coerce.number().int().min(10).max(100).default(75),
  contactEmail: z.string().email('Invalid email address').optional().or(z.literal('')),
  contactPhone: z.string().optional().or(z.literal('')),
  primaryColor: z.string().optional().default('#059669'),
  featuresJson: z.string().optional().default('{}'),
})

export async function GET(req: Request) {
  return handle(async () => {
    await requireSuperAdmin(req)

    const rawInstitutions = await db.institution.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        departments: {
          select: {
            id: true,
            _count: {
              select: {
                students: true,
                courses: true,
                users: true,
              },
            },
          },
        },
        users: {
          select: { id: true, role: true },
        },
      },
    })

    const institutions: Institution[] = rawInstitutions.map((inst) => {
      let studentCount = 0
      let courseCount = 0
      for (const d of inst.departments) {
        studentCount += d._count.students
        courseCount += d._count.courses
      }

      return {
        id: inst.id,
        name: inst.name,
        code: inst.code,
        slug: inst.slug,
        logoUrl: inst.logoUrl,
        primaryColor: inst.primaryColor,
        contactEmail: inst.contactEmail,
        contactPhone: inst.contactPhone,
        plan: inst.plan as Institution['plan'],
        status: inst.status as Institution['status'],
        maxStudents: inst.maxStudents,
        maxCourses: inst.maxCourses,
        allowedModes: inst.allowedModes as Institution['allowedModes'],
        confidenceThreshold: inst.confidenceThreshold,
        lateGraceMinutes: inst.lateGraceMinutes,
        termSystem: inst.termSystem as Institution['termSystem'],
        atRiskThreshold: inst.atRiskThreshold,
        featuresJson: inst.featuresJson,
        createdAt: inst.createdAt.toISOString(),
        updatedAt: inst.updatedAt.toISOString(),
        studentCount,
        courseCount,
        departmentCount: inst.departments.length,
        lecturerCount: inst.users.length,
      }
    })

    const [
      studentsCount,
      coursesCount,
      sessionsCount,
      recordsCount,
    ] = await Promise.all([
      db.student.count(),
      db.course.count(),
      db.session.count(),
      db.attendanceRecord.count(),
    ])

    const stats: PlatformStats = {
      institutionsCount: institutions.length,
      activeInstitutionsCount: institutions.filter((i) => i.status === 'ACTIVE').length,
      studentsCount,
      coursesCount,
      sessionsCount,
      recordsCount,
      activeLicenses: {
        trial: institutions.filter((i) => i.plan === 'TRIAL').length,
        faculty: institutions.filter((i) => i.plan === 'FACULTY').length,
        campusAnnual: institutions.filter((i) => i.plan === 'CAMPUS_ANNUAL').length,
        enterprise: institutions.filter((i) => i.plan === 'ENTERPRISE').length,
      },
    }

    return NextResponse.json({ institutions, stats })
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireSuperAdmin(req)

    const parsed = createInstitutionSchema.safeParse(await readJson(req))
    if (!parsed.success) {
      throw new BadRequestError(zodMessage(parsed.error))
    }

    const data = parsed.data

    const existingSlug = await db.institution.findUnique({
      where: { slug: data.slug },
    })
    if (existingSlug) {
      throw new ConflictError(`An institution with slug '${data.slug}' already exists`)
    }

    const institution = await db.institution.create({
      data: {
        name: data.name,
        code: data.code,
        slug: data.slug,
        plan: data.plan,
        status: data.status,
        maxStudents: data.maxStudents,
        maxCourses: data.maxCourses,
        allowedModes: data.allowedModes,
        confidenceThreshold: data.confidenceThreshold,
        lateGraceMinutes: data.lateGraceMinutes,
        termSystem: data.termSystem,
        atRiskThreshold: data.atRiskThreshold,
        contactEmail: data.contactEmail || null,
        contactPhone: data.contactPhone || null,
        primaryColor: data.primaryColor || '#059669',
        featuresJson: data.featuresJson || '{}',
      },
    })

    return NextResponse.json({ institution }, { status: 201 })
  })
}
