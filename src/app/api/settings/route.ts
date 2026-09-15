import { z } from 'zod'
import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { BadRequestError, handle, readJson, zodMessage } from '../_lib/helpers'
import { getUserSettings, saveUserSettings } from '@/lib/settings'

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    return NextResponse.json({ settings: await getUserSettings(user.id) })
  })
}

const putSchema = z.object({
  atRiskThreshold: z.number().int().min(1).max(100).optional(),
  liveness: z.boolean().optional(),
  defaultMode: z.enum(['WALKTHROUGH', 'KIOSK']).optional(),
})

export async function PUT(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    const parsed = putSchema.safeParse(await readJson(req))
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))
    const settings = await saveUserSettings(user.id, parsed.data)
    return NextResponse.json({ settings })
  })
}
