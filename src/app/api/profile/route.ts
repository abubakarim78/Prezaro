import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { BadRequestError, NotFoundError, requireUser } from '@/lib/auth'
import { handle, readJson, userDTO, zodMessage } from '../_lib/helpers'

const profileSchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').optional(),
    title: z.string().trim().nullable().optional(),
    departmentId: z.string().trim().min(1).optional(),
    departmentNew: z
      .object({
        name: z.string().trim().min(1, 'Department name is required'),
        code: z.string().trim().min(1, 'Department code is required'),
      })
      .optional(),
  })
  .refine((d) => d.departmentId !== undefined || d.departmentNew !== undefined || d.name !== undefined || d.title !== undefined, {
    message: 'Nothing to update',
  })

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    const parsed = profileSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))
    const { name, title, departmentId, departmentNew } = parsed.data

    let deptId: string | undefined
    if (departmentNew) {
      // Reuse an existing department with the same name, otherwise create it.
      const existing = await db.department.findFirst({
        where: { name: departmentNew.name },
      })
      const dept =
        existing ??
        (await db.department.create({
          data: { name: departmentNew.name, code: departmentNew.code },
        }))
      deptId = dept.id
    } else if (departmentId) {
      const dept = await db.department.findUnique({ where: { id: departmentId } })
      if (!dept) throw new NotFoundError('Department not found')
      deptId = dept.id
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(title !== undefined ? { title: title === '' ? null : title } : {}),
        ...(deptId !== undefined ? { departmentId: deptId } : {}),
        onboarded: true,
      },
      include: { department: true },
    })
    return NextResponse.json({ user: userDTO(updated) })
  })
}
