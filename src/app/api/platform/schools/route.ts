import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  BadRequestError,
  ConflictError,
  handle,
  NotFoundError,
  readJson,
  requireSuperAdmin,
  zodMessage,
} from '../../_lib/helpers'
import type { School } from '@/lib/types'

const createSchoolSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  code: z.string().trim().min(2, 'Code must be at least 2 characters').toUpperCase(),
  institutionId: z.string().optional(),
})

export async function GET(req: Request) {
  return handle(async () => {
    await requireSuperAdmin(req)

    const rawSchools = await db.school.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        institution: {
          select: { id: true, name: true, code: true, termSystem: true, currentSemester: true },
        },
        _count: { select: { departments: true } },
      },
    })

    // Pending enrollment submissions per school — direct school rows plus
    // legacy rows whose home department belongs to the school.
    const pending = await db.enrollmentSubmission.findMany({
      where: { status: 'PENDING' },
      select: { schoolId: true, department: { select: { schoolId: true } } },
    })
    const pendingBySchool = new Map<string, number>()
    for (const sub of pending) {
      const sid = sub.schoolId ?? sub.department?.schoolId
      if (!sid) continue
      pendingBySchool.set(sid, (pendingBySchool.get(sid) ?? 0) + 1)
    }

    const schools: School[] = rawSchools.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      institutionId: s.institutionId,
      institutionName: s.institution?.name ?? null,
      institutionCode: s.institution?.code ?? null,
      termSystem: (s.institution?.termSystem ?? 'SEMESTER') as School['termSystem'],
      currentSemester: s.institution?.currentSemester ?? 1,
      departmentCount: s._count.departments,
      pendingCount: pendingBySchool.get(s.id) ?? 0,
      createdAt: s.createdAt.toISOString(),
    }))

    return NextResponse.json({ schools })
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireSuperAdmin(req)

    const parsed = createSchoolSchema.safeParse(await readJson(req))
    if (!parsed.success) {
      throw new BadRequestError(zodMessage(parsed.error))
    }
    const data = parsed.data

    if (data.institutionId) {
      const institution = await db.institution.findUnique({ where: { id: data.institutionId } })
      if (!institution) {
        throw new NotFoundError('Institution not found')
      }
    }

    const existing = await db.school.findFirst({
      where: { name: data.name, institutionId: data.institutionId ?? null },
    })
    if (existing) {
      throw new ConflictError(
        `A school named '${data.name}' already exists for this institution`
      )
    }

    const school = await db.school.create({
      data: {
        name: data.name,
        code: data.code,
        ...(data.institutionId ? { institutionId: data.institutionId } : {}),
      },
      include: { institution: { select: { name: true, code: true } } },
    })

    return NextResponse.json(
      {
        school: {
          id: school.id,
          name: school.name,
          code: school.code,
          institutionId: school.institutionId,
          institutionName: school.institution?.name ?? null,
          institutionCode: school.institution?.code ?? null,
          departmentCount: 0,
          pendingCount: 0,
          createdAt: school.createdAt.toISOString(),
        } satisfies School,
      },
      { status: 201 }
    )
  })
}
