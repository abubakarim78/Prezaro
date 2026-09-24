import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  BadRequestError,
  NotFoundError,
  handle,
  readJson,
  requireSuperAdmin,
  zodMessage,
} from '../../../_lib/helpers'
import type { Institution } from '@/lib/types'

const updateInstitutionSchema = z.object({
  name: z.string().trim().min(2).optional(),
  code: z.string().trim().min(2).toUpperCase().optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  plan: z.enum(['TRIAL', 'FACULTY', 'CAMPUS_ANNUAL', 'ENTERPRISE']).optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING']).optional(),
  maxStudents: z.coerce.number().int().min(10).optional(),
  maxCourses: z.coerce.number().int().min(1).optional(),
  allowedModes: z.enum(['ALL', 'WALKTHROUGH_ONLY', 'KIOSK_ONLY']).optional(),
  confidenceThreshold: z.coerce.number().min(0.3).max(0.8).optional(),
  lateGraceMinutes: z.coerce.number().int().min(0).max(120).optional(),
  termSystem: z.enum(['SEMESTER', 'TRIMESTER', 'QUARTER']).optional(),
  atRiskThreshold: z.coerce.number().int().min(10).max(100).optional(),
  contactEmail: z.string().email().optional().nullable().or(z.literal('')),
  contactPhone: z.string().optional().nullable().or(z.literal('')),
  primaryColor: z.string().optional().nullable(),
  featuresJson: z.string().optional(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(req: Request, { params }: RouteParams) {
  return handle(async () => {
    await requireSuperAdmin(req)
    const { id } = await params

    const inst = await db.institution.findUnique({
      where: { id },
      include: {
        departments: {
          include: {
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
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            title: true,
            createdAt: true,
          },
        },
      },
    })

    if (!inst) {
      throw new NotFoundError('Institution not found')
    }

    let studentCount = 0
    let courseCount = 0
    for (const d of inst.departments) {
      studentCount += d._count.students
      courseCount += d._count.courses
    }

    const institution: Institution = {
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

    return NextResponse.json({
      institution,
      departments: inst.departments,
      users: inst.users,
    })
  })
}

export async function PATCH(req: Request, { params }: RouteParams) {
  return handle(async () => {
    await requireSuperAdmin(req)
    const { id } = await params

    const parsed = updateInstitutionSchema.safeParse(await readJson(req))
    if (!parsed.success) {
      throw new BadRequestError(zodMessage(parsed.error))
    }

    const existing = await db.institution.findUnique({ where: { id } })
    if (!existing) {
      throw new NotFoundError('Institution not found')
    }

    const data = parsed.data
    const updated = await db.institution.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.code !== undefined && { code: data.code }),
        ...(data.slug !== undefined && { slug: data.slug }),
        ...(data.plan !== undefined && { plan: data.plan }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.maxStudents !== undefined && { maxStudents: data.maxStudents }),
        ...(data.maxCourses !== undefined && { maxCourses: data.maxCourses }),
        ...(data.allowedModes !== undefined && { allowedModes: data.allowedModes }),
        ...(data.confidenceThreshold !== undefined && {
          confidenceThreshold: data.confidenceThreshold,
        }),
        ...(data.lateGraceMinutes !== undefined && { lateGraceMinutes: data.lateGraceMinutes }),
        ...(data.termSystem !== undefined && { termSystem: data.termSystem }),
        ...(data.atRiskThreshold !== undefined && { atRiskThreshold: data.atRiskThreshold }),
        ...(data.contactEmail !== undefined && { contactEmail: data.contactEmail || null }),
        ...(data.contactPhone !== undefined && { contactPhone: data.contactPhone || null }),
        ...(data.primaryColor !== undefined && { primaryColor: data.primaryColor || '#059669' }),
        ...(data.featuresJson !== undefined && { featuresJson: data.featuresJson }),
      },
    })

    return NextResponse.json({ institution: updated })
  })
}

export async function DELETE(req: Request, { params }: RouteParams) {
  return handle(async () => {
    await requireSuperAdmin(req)
    const { id } = await params

    const existing = await db.institution.findUnique({ where: { id } })
    if (!existing) {
      throw new NotFoundError('Institution not found')
    }

    // Default to SUSPENDED instead of hard delete to preserve historical attendance data
    const suspended = await db.institution.update({
      where: { id },
      data: { status: 'SUSPENDED' },
    })

    return NextResponse.json({ institution: suspended, message: 'Institution suspended' })
  })
}
