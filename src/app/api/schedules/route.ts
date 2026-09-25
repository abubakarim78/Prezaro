import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import {
  BadRequestError,
  handle,
  readJson,
  requireCourse,
  serializeSchedule,
  zodMessage,
} from '../_lib/helpers'

const createScheduleSchema = z.object({
  courseId: z.string().min(1, 'Course is required'),
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid start time (HH:mm)'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid end time (HH:mm)'),
  venue: z.string().max(100).optional().nullable(),
  recurrence: z.enum(['WEEKLY', 'BIWEEKLY', 'ONCE']).default('WEEKLY'),
  reminderLeadMinutes: z.number().int().min(0).max(1440).default(30),
  notifyEmail: z.boolean().default(true),
  notifyPush: z.boolean().default(true),
})

export async function GET(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)

    const schedules = await db.classSchedule.findMany({
      where: user.departmentId
        ? {
            OR: [
              { lecturerId: user.id },
              { course: { departmentId: user.departmentId } },
            ],
          }
        : { lecturerId: user.id },
      include: {
        course: {
          select: {
            code: true,
            title: true,
            _count: { select: { enrollments: true } },
          },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    })

    return NextResponse.json({
      schedules: schedules.map(serializeSchedule),
    })
  })
}

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser(req)
    const body = await readJson(req)
    const parsed = createScheduleSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    // Ensure the course exists and belongs to lecturer/dept
    const course = await requireCourse(user, parsed.data.courseId)

    // Validate startTime < endTime
    if (parsed.data.startTime >= parsed.data.endTime) {
      throw new BadRequestError('Start time must be earlier than end time')
    }

    const created = await db.classSchedule.create({
      data: {
        courseId: course.id,
        lecturerId: user.id,
        dayOfWeek: parsed.data.dayOfWeek,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        venue: parsed.data.venue?.trim() || null,
        recurrence: parsed.data.recurrence,
        reminderLeadMinutes: parsed.data.reminderLeadMinutes,
        notifyEmail: parsed.data.notifyEmail,
        notifyPush: parsed.data.notifyPush,
      },
      include: {
        course: {
          select: {
            code: true,
            title: true,
            _count: { select: { enrollments: true } },
          },
        },
      },
    })

    return NextResponse.json(
      { schedule: serializeSchedule(created) },
      { status: 201 }
    )
  })
}
