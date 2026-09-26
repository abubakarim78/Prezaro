import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { BadRequestError, ForbiddenError, requireUser } from '@/lib/auth'
import { handle } from '../../_lib/helpers'

// Department staff list powering course lecturer assignment.
// HoDs see their own department; the Dean sees any department in their
// school (or all of them when no ?departmentId= is given); the super admin
// can target any department via the optional ?departmentId= query param.
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    if (user.role === 'LECTURER') {
      throw new ForbiddenError('Only department heads can list department staff')
    }
    const requested = new URL(req.url).searchParams.get('departmentId')
    let departmentId: string | null = user.departmentId
    if ((user.role === 'SUPERADMIN' || user.role === 'DEAN') && requested) {
      departmentId = requested
    }
    if (user.role === 'DEAN') {
      if (!user.schoolId) {
        throw new ForbiddenError('No school is assigned to your account')
      }
      if (departmentId) {
        const dept = await db.department.findUnique({
          where: { id: departmentId },
          select: { schoolId: true },
        })
        if (!dept || dept.schoolId !== user.schoolId) {
          throw new ForbiddenError(
            'You can only list staff for departments within your school'
          )
        }
      } else {
        // School-wide: staff of every department in the Dean's school.
        const staff = await db.user.findMany({
          where: {
            role: { in: ['LECTURER', 'ADMIN'] },
            department: { schoolId: user.schoolId },
          },
          select: { id: true, name: true, title: true, role: true },
          orderBy: [{ role: 'asc' }, { name: 'asc' }],
        })
        return NextResponse.json({ staff })
      }
    }
    if (!departmentId) {
      throw new BadRequestError('A department is required')
    }
    const staff = await db.user.findMany({
      where: { departmentId, role: { in: ['LECTURER', 'ADMIN'] } },
      select: { id: true, name: true, title: true, role: true },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    })
    return NextResponse.json({ staff })
  })
}
