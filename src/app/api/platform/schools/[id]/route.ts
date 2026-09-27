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
import type { School } from '@/lib/types'

const updateSchoolSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').optional(),
  code: z.string().trim().min(2, 'Code must be at least 2 characters').toUpperCase().optional(),
  /**
   * Assigning an institution also backfills the school's departments that
   * were created without one — fixes the "Unassigned" chain for departments
   * and (transitively) their users.
   */
  institutionId: z.string().optional().nullable(),
})

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: RouteParams) {
  return handle(async () => {
    await requireSuperAdmin(req)
    const { id } = await params

    const parsed = updateSchoolSchema.safeParse(await readJson(req))
    if (!parsed.success) {
      throw new BadRequestError(zodMessage(parsed.error))
    }
    const data = parsed.data

    const school = await db.school.findUnique({ where: { id } })
    if (!school) {
      throw new NotFoundError('School not found')
    }

    const updatePayload: Record<string, unknown> = {}
    if (data.name !== undefined) updatePayload.name = data.name
    if (data.code !== undefined) updatePayload.code = data.code

    let nextInstitutionId = school.institutionId
    if (data.institutionId !== undefined) {
      if (data.institutionId) {
        const institution = await db.institution.findUnique({
          where: { id: data.institutionId },
          select: { id: true },
        })
        if (!institution) {
          throw new NotFoundError('Institution not found')
        }
        updatePayload.institutionId = data.institutionId
        nextInstitutionId = data.institutionId
      } else {
        updatePayload.institutionId = null
        nextInstitutionId = null
      }
    }

    const updated = await db.school.update({ where: { id }, data: updatePayload })

    // Backfill only when attaching to an institution; detaching leaves
    // departments untouched.
    let departmentsBackfilled = 0
    if (data.institutionId) {
      const backfilled = await db.department.updateMany({
        where: { schoolId: id, institutionId: null },
        data: { institutionId: data.institutionId },
      })
      departmentsBackfilled = backfilled.count
    }

    const [institution, dean, departmentCount, pendingCount] = await Promise.all([
      nextInstitutionId
        ? db.institution.findUnique({
            where: { id: nextInstitutionId },
            select: { id: true, name: true, code: true, termSystem: true, currentSemester: true },
          })
        : Promise.resolve(null),
      db.user.findFirst({
        where: { role: 'DEAN', schoolId: id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, email: true },
      }),
      db.department.count({ where: { schoolId: id } }),
      db.enrollmentSubmission.count({
        where: {
          status: 'PENDING',
          OR: [{ schoolId: id }, { department: { schoolId: id } }],
        },
      }),
    ])

    return NextResponse.json({
      school: {
        id: updated.id,
        name: updated.name,
        code: updated.code,
        institutionId: updated.institutionId,
        institutionName: institution?.name ?? null,
        institutionCode: institution?.code ?? null,
        termSystem: (institution?.termSystem ?? 'SEMESTER') as School['termSystem'],
        currentSemester: institution?.currentSemester ?? 1,
        departmentCount,
        pendingCount,
        deanUserId: dean?.id ?? null,
        deanName: dean?.name ?? null,
        deanEmail: dean?.email ?? null,
        createdAt: updated.createdAt.toISOString(),
      } satisfies School,
      departmentsBackfilled,
    })
  })
}
