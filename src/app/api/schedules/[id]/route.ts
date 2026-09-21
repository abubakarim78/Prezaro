import { z } from 'zod'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { classRescheduledHtml, queueEmail } from '@/lib/email'
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  handle,
  readJson,
  requireCourse,
  serializeSchedule,
  zodMessage,
} from '../../_lib/helpers'

const updateScheduleSchema = z.object({
  courseId: z.string().min(1).optional(),
  dayOfWeek: z.number().int().min(1).max(7).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  venue: z.string().max(100).optional().nullable(),
  recurrence: z.enum(['WEEKLY', 'BIWEEKLY', 'ONCE']).optional(),
  reminderLeadMinutes: z.number().int().min(0).max(1440).optional(),
  notifyEmail: z.boolean().optional(),
  notifyPush: z.boolean().optional(),
  notifyStudents: z.boolean().optional(),
  rescheduleReason: z.string().max(300).optional().nullable(),
})

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params

    const existing = await db.classSchedule.findUnique({
      where: { id },
      include: { course: true },
    })
    if (!existing) throw new NotFoundError('Schedule not found')

    const allowed =
      user.role === 'ADMIN'
        ? existing.course.departmentId === user.departmentId
        : existing.lecturerId === user.id
    if (!allowed) throw new ForbiddenError('You cannot edit this schedule')

    const body = await readJson(req)
    const parsed = updateScheduleSchema.safeParse(body)
    if (!parsed.success) throw new BadRequestError(zodMessage(parsed.error))

    if (parsed.data.courseId) {
      await requireCourse(user, parsed.data.courseId)
    }

    const startTime = parsed.data.startTime ?? existing.startTime
    const endTime = parsed.data.endTime ?? existing.endTime
    if (startTime >= endTime) {
      throw new BadRequestError('Start time must be earlier than end time')
    }

    const updated = await db.classSchedule.update({
      where: { id },
      data: {
        courseId: parsed.data.courseId,
        dayOfWeek: parsed.data.dayOfWeek,
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        venue: parsed.data.venue !== undefined ? (parsed.data.venue?.trim() || null) : undefined,
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

    // If requested, notify all enrolled students about the reschedule via email
    if (parsed.data.notifyStudents) {
      const enrollments = await db.enrollment.findMany({
        where: { courseId: updated.courseId },
        include: { student: true },
      })
      const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
      const oldTime = `${dayNames[existing.dayOfWeek]} ${existing.startTime} – ${existing.endTime}`
      const newTime = `${dayNames[updated.dayOfWeek]} ${updated.startTime} – ${updated.endTime}`

      for (const en of enrollments) {
        if (en.student.email) {
          const html = classRescheduledHtml(
            user.name,
            updated.course.code,
            updated.course.title,
            oldTime,
            newTime,
            updated.venue,
            parsed.data.rescheduleReason || null,
          )
          queueEmail({
            to: en.student.email,
            subject: `Class Rescheduled: ${updated.course.code} has moved to ${newTime}`,
            html,
            type: 'CLASS_RESCHEDULED',
            meta: {
              scheduleId: updated.id,
              courseCode: updated.course.code,
              studentId: en.student.id,
            },
          })
        }
      }
    }

    return NextResponse.json({ schedule: serializeSchedule(updated) })
  })
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req)
    const { id } = await ctx.params

    const existing = await db.classSchedule.findUnique({
      where: { id },
      include: { course: true },
    })
    if (!existing) throw new NotFoundError('Schedule not found')

    const allowed =
      user.role === 'ADMIN'
        ? existing.course.departmentId === user.departmentId
        : existing.lecturerId === user.id
    if (!allowed) throw new ForbiddenError('You cannot delete this schedule')

    await db.classSchedule.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  })
}
