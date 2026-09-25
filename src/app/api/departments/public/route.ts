import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { handle } from '../../_lib/helpers'

export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url)
    const deptId = url.searchParams.get('deptId')

    const departments = await db.department.findMany({
      where: deptId ? { id: deptId } : undefined,
      select: {
        id: true,
        name: true,
        code: true,
        institution: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        courses: {
          select: {
            id: true,
            code: true,
            title: true,
            level: true,
          },
          orderBy: { code: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    })

    const payload = departments.map((d) => ({
      id: d.id,
      name: d.name,
      code: d.code,
      institutionName: d.institution?.name ?? 'Prezaro Campus',
      courses: d.courses.map((c) => ({
        id: c.id,
        code: c.code,
        title: c.title,
        level: c.level,
      })),
    }))

    return NextResponse.json({ departments: payload })
  })
}
