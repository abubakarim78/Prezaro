import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { BadRequestError, ForbiddenError, requireUser } from '@/lib/auth'
import { handle } from '../../_lib/helpers'

// Department staff list powering course lecturer assignment.
// HoDs see their own department; the super admin can target any
// department via the optional ?departmentId= query param.
export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    if (user.role === 'LECTURER') {
      throw new ForbiddenError('Only department heads can list department staff')
    }
    const requested = new URL(req.url).searchParams.get('departmentId')
    const departmentId =
      user.role === 'SUPERADMIN' && requested ? requested : user.departmentId
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
