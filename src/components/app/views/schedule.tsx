'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Bell,
  BellRing,
  Calendar,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  Clock,
  Download,
  Edit2,
  Loader2,
  MapPin,
  Play,
  Plus,
  Radio,
  ScanFace,
  Trash2,
  Users,
} from 'lucide-react'
import type { ClassSchedule, Course, CoursesResponse, SchedulesResponse } from '@/lib/types'
import { api, getErrorMessage } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState, LoadingBlock } from '@/components/app/shared'
import {
  getNotificationPermission,
  isNotificationSupported,
  requestNotificationPermission,
} from '@/lib/notifications'

const DAYS = [
  { day: 1, name: 'Monday', short: 'Mon' },
  { day: 2, name: 'Tuesday', short: 'Tue' },
  { day: 3, name: 'Wednesday', short: 'Wed' },
  { day: 4, name: 'Thursday', short: 'Thu' },
  { day: 5, name: 'Friday', short: 'Fri' },
  { day: 6, name: 'Saturday', short: 'Sat' },
  { day: 7, name: 'Sunday', short: 'Sun' },
]

const VENUE_PRESETS = ['Lecture Theatre 1', 'LT 2', 'Room 204', 'Room 305', 'Lab 1', 'Auditorium']

const RESCHEDULE_REASONS = [
  'Department seminar / event',
  'Public holiday adjustment',
  'Room / equipment maintenance',
  'Lecturer official travel',
  'Special make-up lecture',
]

const TIME_SLOTS = [
  { value: '06:00', label: '06:00 AM' },
  { value: '06:30', label: '06:30 AM' },
  { value: '07:00', label: '07:00 AM' },
  { value: '07:30', label: '07:30 AM' },
  { value: '08:00', label: '08:00 AM' },
  { value: '08:30', label: '08:30 AM' },
  { value: '09:00', label: '09:00 AM' },
  { value: '09:30', label: '09:30 AM' },
  { value: '10:00', label: '10:00 AM' },
  { value: '10:30', label: '10:30 AM' },
  { value: '11:00', label: '11:00 AM' },
  { value: '11:30', label: '11:30 AM' },
  { value: '12:00', label: '12:00 PM (Noon)' },
  { value: '12:30', label: '12:30 PM' },
  { value: '13:00', label: '01:00 PM (13:00)' },
  { value: '13:30', label: '01:30 PM (13:30)' },
  { value: '14:00', label: '02:00 PM (14:00)' },
  { value: '14:30', label: '02:30 PM (14:30)' },
  { value: '15:00', label: '03:00 PM (15:00)' },
  { value: '15:30', label: '03:30 PM (15:30)' },
  { value: '16:00', label: '04:00 PM (16:00)' },
  { value: '16:30', label: '04:30 PM (16:30)' },
  { value: '17:00', label: '05:00 PM (17:00)' },
  { value: '17:30', label: '05:30 PM (17:30)' },
  { value: '18:00', label: '06:00 PM (18:00)' },
  { value: '18:30', label: '06:30 PM (18:30)' },
  { value: '19:00', label: '07:00 PM (19:00)' },
  { value: '19:30', label: '07:30 PM (19:30)' },
  { value: '20:00', label: '08:00 PM (20:00)' },
  { value: '20:30', label: '08:30 PM (20:30)' },
  { value: '21:00', label: '09:00 PM (21:00)' },
  { value: '21:30', label: '09:30 PM (21:30)' },
  { value: '22:00', label: '10:00 PM (22:00)' },
]

function addHours(timeStr: string, hours: number): string {
  const [h, m] = timeStr.split(':').map(Number)
  const totalM = (h || 0) * 60 + (m || 0) + Math.round(hours * 60)
  const newH = Math.min(23, Math.floor(totalM / 60))
  const newM = totalM % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

export default function ScheduleView() {
  const navigate = useAppStore((s) => s.navigate)
  const params = useAppStore((s) => s.params)

  const [schedules, setSchedules] = useState<ClassSchedule[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Current day index (1 = Mon ... 7 = Sun)
  const todayDayOfWeek = useMemo(() => {
    const d = new Date().getDay()
    return d === 0 ? 7 : d
  }, [])

  const [selectedDay, setSelectedDay] = useState<number>(todayDayOfWeek)
  const [viewMode, setViewMode] = useState<'today' | 'week'>('today')

  // Notification permission state
  const [notifPerm, setNotifPerm] = useState<string>(getNotificationPermission())

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSchedule, setEditingSchedule] = useState<ClassSchedule | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Reschedule modal state
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [rescheduleTarget, setRescheduleTarget] = useState<ClassSchedule | null>(null)
  const [reschedDay, setReschedDay] = useState<number>(todayDayOfWeek)
  const [reschedStartTime, setReschedStartTime] = useState('08:00')
  const [reschedEndTime, setReschedEndTime] = useState('10:00')
  const [reschedVenue, setReschedVenue] = useState('')
  const [reschedReason, setReschedReason] = useState('')
  const [reschedNotifyStudents, setReschedNotifyStudents] = useState(true)
  const [rescheduling, setRescheduling] = useState(false)

  // Form fields
  const [formCourseId, setFormCourseId] = useState('')
  const [formDay, setFormDay] = useState<number>(todayDayOfWeek)
  const [formStartTime, setFormStartTime] = useState('08:00')
  const [formEndTime, setFormEndTime] = useState('10:00')
  const [formVenue, setFormVenue] = useState('')
  const [formLeadMinutes, setFormLeadMinutes] = useState<number>(30)
  const [formNotifyEmail, setFormNotifyEmail] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [schedRes, courseRes] = await Promise.all([
        api<SchedulesResponse>('/api/schedules'),
        api<CoursesResponse>('/api/courses'),
      ])
      setSchedules(schedRes.schedules)
      setCourses(courseRes.courses)
      if (courseRes.courses.length > 0 && !formCourseId) {
        setFormCourseId(courseRes.courses[0].id)
      }
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [formCourseId])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const handleRequestNotifications = async () => {
    const granted = await requestNotificationPermission()
    setNotifPerm(granted ? 'granted' : 'denied')
    if (granted) {
      toast.success('Mobile notifications enabled for upcoming classes!')
    } else {
      toast.info('Notifications were not enabled.')
    }
  }

  const openAddModal = (day = selectedDay) => {
    setEditingSchedule(null)
    setFormCourseId(courses[0]?.id || '')
    setFormDay(day)
    setFormStartTime('08:00')
    setFormEndTime('10:00')
    setFormVenue('')
    setFormLeadMinutes(30)
    setFormNotifyEmail(true)
    setModalOpen(true)
  }

  const openEditModal = (s: ClassSchedule) => {
    setEditingSchedule(s)
    setFormCourseId(s.courseId)
    setFormDay(s.dayOfWeek)
    setFormStartTime(s.startTime)
    setFormEndTime(s.endTime)
    setFormVenue(s.venue || '')
    setFormLeadMinutes(s.reminderLeadMinutes)
    setFormNotifyEmail(s.notifyEmail)
    setModalOpen(true)
  }

  const openRescheduleModal = (s: ClassSchedule) => {
    setRescheduleTarget(s)
    setReschedDay(s.dayOfWeek)
    setReschedStartTime(s.startTime)
    setReschedEndTime(s.endTime)
    setReschedVenue(s.venue || '')
    setReschedReason('')
    setReschedNotifyStudents(true)
    setRescheduleOpen(true)
  }

  useEffect(() => {
    if (params.rescheduleId && schedules.length > 0) {
      const target = schedules.find((s) => s.id === params.rescheduleId)
      if (target) {
        openRescheduleModal(target)
      }
    }
  }, [params.rescheduleId, schedules])

  const handleConfirmReschedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!rescheduleTarget) return
    if (reschedStartTime >= reschedEndTime) {
      toast.error('Start time must be earlier than end time')
      return
    }

    setRescheduling(true)
    try {
      const res = await api<{ schedule: ClassSchedule }>(
        `/api/schedules/${rescheduleTarget.id}`,
        {
          method: 'PUT',
          body: {
            dayOfWeek: reschedDay,
            startTime: reschedStartTime,
            endTime: reschedEndTime,
            venue: reschedVenue.trim() || null,
            notifyStudents: reschedNotifyStudents,
            rescheduleReason: reschedReason.trim() || null,
          },
        }
      )
      setSchedules((prev) =>
        prev.map((s) => (s.id === rescheduleTarget.id ? res.schedule : s))
      )
      const dayName = DAYS.find((d) => d.day === reschedDay)?.name || 'the new day'
      if (reschedNotifyStudents) {
        toast.success(
          `Class rescheduled to ${dayName} ${reschedStartTime}. All ${rescheduleTarget.studentCount || 0} enrolled students were notified via email.`
        )
      } else {
        toast.success(`Class rescheduled to ${dayName} ${reschedStartTime}.`)
      }
      setRescheduleOpen(false)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setRescheduling(false)
    }
  }

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formCourseId) {
      toast.error('Please select a course')
      return
    }
    if (formStartTime >= formEndTime) {
      toast.error('Start time must be earlier than end time')
      return
    }

    setSaving(true)
    try {
      if (editingSchedule) {
        const res = await api<{ schedule: ClassSchedule }>(
          `/api/schedules/${editingSchedule.id}`,
          {
            method: 'PUT',
            body: {
              courseId: formCourseId,
              dayOfWeek: formDay,
              startTime: formStartTime,
              endTime: formEndTime,
              venue: formVenue.trim() || null,
              reminderLeadMinutes: formLeadMinutes,
              notifyEmail: formNotifyEmail,
            },
          }
        )
        setSchedules((prev) =>
          prev.map((s) => (s.id === editingSchedule.id ? res.schedule : s))
        )
        toast.success('Class schedule updated')
      } else {
        const res = await api<{ schedule: ClassSchedule }>('/api/schedules', {
          method: 'POST',
          body: {
            courseId: formCourseId,
            dayOfWeek: formDay,
            startTime: formStartTime,
            endTime: formEndTime,
            venue: formVenue.trim() || null,
            reminderLeadMinutes: formLeadMinutes,
            notifyEmail: formNotifyEmail,
          },
        })
        setSchedules((prev) => [...prev, res.schedule])
        toast.success('Class added to your timetable')
      }
      setModalOpen(false)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSchedule = async (id: string) => {
    setDeletingId(id)
    try {
      await api(`/api/schedules/${id}`, { method: 'DELETE' })
      setSchedules((prev) => prev.filter((s) => s.id !== id))
      toast.success('Class slot removed')
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setDeletingId(null)
    }
  }

  // Calculate live status for a schedule
  const getSlotStatus = (s: ClassSchedule) => {
    const now = new Date()
    const jsDay = now.getDay()
    const curDay = jsDay === 0 ? 7 : jsDay
    if (s.dayOfWeek !== curDay) return { type: 'UPCOMING', label: 'Upcoming' }

    const curMins = now.getHours() * 60 + now.getMinutes()
    const [startH, startM] = s.startTime.split(':').map(Number)
    const [endH, endM] = s.endTime.split(':').map(Number)
    const startMins = startH * 60 + startM
    const endMins = endH * 60 + endM

    if (curMins >= startMins && curMins < endMins) {
      return { type: 'HAPPENING', label: 'Class happening now' }
    }
    const diff = startMins - curMins
    if (diff > 0 && diff <= 45) {
      return { type: 'STARTING_SOON', label: `Starts in ${diff}m` }
    }
    if (curMins >= endMins) {
      return { type: 'FINISHED', label: 'Finished today' }
    }
    return { type: 'TODAY', label: `Today at ${s.startTime}` }
  }

  // Schedules grouped by day or filtered
  const activeSchedules = useMemo(() => {
    if (viewMode === 'today') {
      return schedules.filter((s) => s.dayOfWeek === selectedDay)
    }
    return schedules
  }, [schedules, viewMode, selectedDay])

  return (
    <div className="mx-auto w-full max-w-3xl px-4 lg:px-8 py-5 lg:py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold tracking-tight">Class Timetable</h1>
          <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
            Manage your weekly class sessions and automated attendance reminders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="h-10 gap-1.5 text-xs font-semibold"
          >
            <a href="/api/schedules/calendar" download="prezaro-classes.ics">
              <Download className="h-4 w-4" />
              Calendar .ics
            </a>
          </Button>
          <Button
            size="sm"
            onClick={() => openAddModal(selectedDay)}
            className="h-10 gap-1.5 font-semibold text-xs"
          >
            <Plus className="h-4 w-4" />
            Add Class Slot
          </Button>
        </div>
      </div>

      {/* Push Notification Banner */}
      {isNotificationSupported() && notifPerm !== 'granted' && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-primary shrink-0">
              <BellRing className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-foreground">Turn on mobile class alerts</p>
              <p className="text-xs text-muted-foreground">
                Get an instant alert on your phone 15–30 minutes before your class begins.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleRequestNotifications}
            className="h-9 shrink-0 text-xs font-semibold"
          >
            Enable alerts
          </Button>
        </div>
      )}

      {/* View Switcher & Day Navigation */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 border-b pb-2">
          <div className="flex items-center gap-1.5">
            <Button
              variant={viewMode === 'today' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('today')}
              className="h-8 text-xs font-semibold rounded-lg"
            >
              Day Agenda
            </Button>
            <Button
              variant={viewMode === 'week' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('week')}
              className="h-8 text-xs font-semibold rounded-lg"
            >
              Full Week ({schedules.length})
            </Button>
          </div>

          <span className="text-xs text-muted-foreground">
            {DAYS.find((d) => d.day === todayDayOfWeek)?.name} (Today)
          </span>
        </div>

        {/* Day Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {DAYS.map((d) => {
            const count = schedules.filter((s) => s.dayOfWeek === d.day).length
            const isToday = d.day === todayDayOfWeek
            const isSelected = selectedDay === d.day

            return (
              <button
                key={d.day}
                onClick={() => {
                  setSelectedDay(d.day)
                  setViewMode('today')
                }}
                className={cn(
                  'flex flex-col items-center justify-center min-w-[4.2rem] flex-1 py-2 px-1.5 rounded-xl border text-xs transition-all',
                  isSelected && viewMode === 'today'
                    ? 'border-primary bg-primary text-primary-foreground font-bold shadow-sm'
                    : 'border-border bg-card hover:bg-accent text-muted-foreground hover:text-foreground'
                )}
              >
                <span className="text-[11px] font-medium">{d.short}</span>
                <span className="text-[10px] opacity-80 mt-0.5">
                  {count > 0 ? `${count} class${count > 1 ? 'es' : ''}` : '—'}
                </span>
                {isToday && (
                  <span
                    className={cn(
                      'mt-1 h-1 w-1 rounded-full',
                      isSelected && viewMode === 'today' ? 'bg-primary-foreground' : 'bg-primary'
                    )}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Class Slots Content */}
      {loading ? (
        <LoadingBlock label="Loading timetable…" />
      ) : error ? (
        <div className="rounded-2xl border bg-card p-6 text-center text-sm text-destructive">
          {error}
        </div>
      ) : activeSchedules.length === 0 ? (
        <div className="rounded-2xl border bg-card p-8">
          <EmptyState
            icon={CalendarDays}
            title={viewMode === 'today' ? `No classes scheduled for ${DAYS.find((d) => d.day === selectedDay)?.name}` : 'No class schedules yet'}
            description="Add recurring lecture slots so Prezaro can remind you and automate attendance."
            action={
              <Button onClick={() => openAddModal(selectedDay)} className="gap-1.5 min-h-11">
                <Plus className="h-4 w-4" />
                Add class slot
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-3">
          {activeSchedules.map((s) => {
            const status = getSlotStatus(s)
            const isHappening = status.type === 'HAPPENING'
            const isStartingSoon = status.type === 'STARTING_SOON'

            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'rounded-2xl border bg-card p-4 transition-all',
                  isHappening
                    ? 'border-emerald-500/50 bg-emerald-500/5 shadow-md ring-1 ring-emerald-500/20'
                    : isStartingSoon
                    ? 'border-amber-500/50 bg-amber-500/5'
                    : 'hover:border-border/80'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge
                        variant="outline"
                        className="font-mono text-[11px] font-bold border-primary/30 bg-primary/10 text-primary"
                      >
                        {s.courseCode}
                      </Badge>
                      {viewMode === 'week' && (
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          {DAYS.find((d) => d.day === s.dayOfWeek)?.short}
                        </span>
                      )}
                      {isHappening && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2.5 py-0.5 text-[11px] font-bold">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                          Class in progress
                        </span>
                      )}
                      {isStartingSoon && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2.5 py-0.5 text-[11px] font-bold">
                          <Radio className="h-3 w-3 animate-ping" />
                          {status.label}
                        </span>
                      )}
                    </div>

                    <h2 className="text-base font-bold tracking-tight text-foreground truncate">
                      {s.courseTitle}
                    </h2>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        {s.startTime} – {s.endTime}
                      </span>
                      {s.venue && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          {s.venue}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        {s.studentCount || 0} enrolled
                      </span>
                      {s.notifyEmail && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-primary">
                          <Bell className="h-3 w-3" />
                          {s.reminderLeadMinutes}m reminder
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openRescheduleModal(s)}
                      className="h-10 px-3 gap-1.5 font-semibold text-xs border-border/80 hover:border-primary/40 hover:bg-primary/5 shrink-0"
                    >
                      <CalendarClock className="h-4 w-4 text-primary" />
                      Reschedule
                    </Button>

                    <Button
                      size="sm"
                      onClick={() =>
                        navigate('scan', { courseId: s.courseId, courseCode: s.courseCode })
                      }
                      className={cn(
                        'h-10 px-4 gap-1.5 font-bold text-xs shadow-sm',
                        isHappening
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-primary hover:bg-primary/90'
                      )}
                    >
                      <ScanFace className="h-4 w-4" />
                      Take Attendance
                    </Button>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditModal(s)}
                        className="h-9 w-9 text-muted-foreground hover:text-foreground"
                        aria-label="Edit schedule"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={deletingId === s.id}
                        onClick={() => handleDeleteSchedule(s.id)}
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        aria-label="Delete schedule"
                      >
                        {deletingId === s.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Schedule Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {editingSchedule ? 'Edit Class Schedule' : 'Add Class Schedule'}
            </DialogTitle>
            <DialogDescription>
              Set up your recurring lecture time to receive automated reminders and take attendance in 1 tap.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveSchedule} className="space-y-4 pt-2">
            {/* Course Picker */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Course</Label>
              <Select value={formCourseId} onValueChange={setFormCourseId}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="Select course" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="font-mono font-bold mr-2">{c.code}</span>
                      <span>{c.title}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Day of Week */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Day of Week</Label>
              <Select
                value={String(formDay)}
                onValueChange={(v) => setFormDay(Number(v))}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((d) => (
                    <SelectItem key={d.day} value={String(d.day)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start and End Times with Selects & Duration Presets */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3 min-w-0">
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs font-semibold">Start Time</Label>
                  <Select
                    value={formStartTime}
                    onValueChange={(v) => {
                      setFormStartTime(v)
                      if (v >= formEndTime) {
                        setFormEndTime(addHours(v, 2))
                      }
                    }}
                  >
                    <SelectTrigger className="h-11 rounded-xl min-w-0 w-full font-mono text-xs">
                      <SelectValue placeholder="Start time" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {TIME_SLOTS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs font-semibold">End Time</Label>
                  <Select value={formEndTime} onValueChange={setFormEndTime}>
                    <SelectTrigger className="h-11 rounded-xl min-w-0 w-full font-mono text-xs">
                      <SelectValue placeholder="End time" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {TIME_SLOTS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Quick Duration Chips */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[11px] text-muted-foreground font-medium shrink-0">Duration:</span>
                {[
                  { label: '1 hr', hrs: 1 },
                  { label: '1.5 hrs', hrs: 1.5 },
                  { label: '2 hrs', hrs: 2 },
                  { label: '3 hrs', hrs: 3 },
                ].map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => setFormEndTime(addHours(formStartTime, d.hrs))}
                    className="text-[11px] rounded-lg border border-border bg-muted/40 px-2 py-0.5 font-medium text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Venue */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Venue / Lecture Hall (optional)</Label>
              <Input
                value={formVenue}
                onChange={(e) => setFormVenue(e.target.value)}
                placeholder="e.g. Lecture Theatre 1, Room 302"
                className="h-11 rounded-xl text-sm"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {VENUE_PRESETS.map((vp) => (
                  <button
                    key={vp}
                    type="button"
                    onClick={() => setFormVenue(vp)}
                    className={cn(
                      'text-[11px] rounded-lg border px-2.5 py-1 transition-all',
                      formVenue === vp
                        ? 'border-primary bg-primary text-primary-foreground font-bold shadow-xs'
                        : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted'
                    )}
                  >
                    {vp}
                  </button>
                ))}
              </div>
            </div>

            {/* Reminder Preferences */}
            <div className="rounded-xl border p-3 bg-muted/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="leading-tight">
                  <p className="text-xs font-semibold">Email &amp; Mobile Reminders</p>
                  <p className="text-[11px] text-muted-foreground">
                    Sends reminder email + phone push alert before class
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={formNotifyEmail}
                  onChange={(e) => setFormNotifyEmail(e.target.checked)}
                  className="h-4 w-4 rounded text-primary focus:ring-primary"
                />
              </div>

              {formNotifyEmail && (
                <div className="flex items-center gap-2 pt-1">
                  <Label className="text-xs text-muted-foreground shrink-0">Remind me</Label>
                  <Select
                    value={String(formLeadMinutes)}
                    onValueChange={(v) => setFormLeadMinutes(Number(v))}
                  >
                    <SelectTrigger className="h-8 text-xs rounded-lg flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="15">15 minutes before</SelectItem>
                      <SelectItem value="30">30 minutes before</SelectItem>
                      <SelectItem value="60">1 hour before</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="rounded-xl font-bold">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {editingSchedule ? 'Update Class' : 'Save Class Slot'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reschedule Class Dialog */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="max-w-md sm:max-w-lg rounded-2xl p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-1.5 text-primary font-bold text-xs uppercase tracking-wider">
              <CalendarClock className="h-4 w-4" />
              <span>Timetable Adjustment</span>
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight">
              Reschedule {rescheduleTarget?.courseCode}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {rescheduleTarget?.courseTitle}
            </DialogDescription>
          </DialogHeader>

          {/* Current schedule banner */}
          {rescheduleTarget && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-1">
              <div className="font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Current Slot:</span>
                <span className="font-bold">
                  {DAYS.find((d) => d.day === rescheduleTarget.dayOfWeek)?.name},{' '}
                  {rescheduleTarget.startTime} – {rescheduleTarget.endTime}
                </span>
                {rescheduleTarget.venue ? (
                  <span className="text-muted-foreground">({rescheduleTarget.venue})</span>
                ) : null}
              </div>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                Choose the new day, time, and lecture hall below.
              </p>
            </div>
          )}

          <form onSubmit={handleConfirmReschedule} className="space-y-4 pt-1">
            {/* New Day of the Week */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">New Day</Label>
              <Select
                value={String(reschedDay)}
                onValueChange={(v) => setReschedDay(Number(v))}
              >
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((d) => (
                    <SelectItem key={d.day} value={String(d.day)}>
                      {d.name} {d.day === todayDayOfWeek ? '(Today)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* New Start and End Times with Selects & Duration Presets */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3 min-w-0">
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs font-semibold">New Start Time</Label>
                  <Select
                    value={reschedStartTime}
                    onValueChange={(v) => {
                      setReschedStartTime(v)
                      if (v >= reschedEndTime) {
                        setReschedEndTime(addHours(v, 2))
                      }
                    }}
                  >
                    <SelectTrigger className="h-11 rounded-xl min-w-0 w-full font-mono text-xs">
                      <SelectValue placeholder="Start time" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {TIME_SLOTS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs font-semibold">New End Time</Label>
                  <Select value={reschedEndTime} onValueChange={setReschedEndTime}>
                    <SelectTrigger className="h-11 rounded-xl min-w-0 w-full font-mono text-xs">
                      <SelectValue placeholder="End time" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {TIME_SLOTS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Quick Duration Chips */}
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className="text-[11px] text-muted-foreground font-medium shrink-0">Duration:</span>
                {[
                  { label: '1 hr', hrs: 1 },
                  { label: '1.5 hrs', hrs: 1.5 },
                  { label: '2 hrs', hrs: 2 },
                  { label: '3 hrs', hrs: 3 },
                ].map((d) => (
                  <button
                    key={d.label}
                    type="button"
                    onClick={() => setReschedEndTime(addHours(reschedStartTime, d.hrs))}
                    className="text-[11px] rounded-lg border border-border bg-muted/40 px-2 py-0.5 font-medium text-muted-foreground hover:text-foreground hover:bg-muted active:scale-95 transition-all"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* New Venue */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">New Venue / Hall (optional)</Label>
              <Input
                value={reschedVenue}
                onChange={(e) => setReschedVenue(e.target.value)}
                placeholder="e.g. Lecture Theatre 2, Lab 1"
                className="h-11 rounded-xl text-sm"
              />
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {VENUE_PRESETS.map((vp) => (
                  <button
                    key={vp}
                    type="button"
                    onClick={() => setReschedVenue(vp)}
                    className={cn(
                      'text-[11px] rounded-lg border px-2 py-0.5 transition-colors',
                      reschedVenue === vp
                        ? 'border-primary bg-primary/10 text-primary font-bold'
                        : 'border-border bg-muted/40 text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {vp}
                  </button>
                ))}
              </div>
            </div>

            {/* Reason for Rescheduling */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Reason for Rescheduling (optional)</Label>
                <span className="text-[10px] text-muted-foreground">Included in student email</span>
              </div>
              <Input
                value={reschedReason}
                onChange={(e) => setReschedReason(e.target.value)}
                placeholder="e.g. Department seminar clash, Public holiday adjustment"
                className="h-11 rounded-xl text-sm"
                maxLength={200}
              />
              <div className="flex flex-wrap gap-1 pt-0.5">
                {RESCHEDULE_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReschedReason(r)}
                    className="text-[10px] rounded-md border border-dashed border-border bg-card px-2 py-0.5 text-muted-foreground hover:text-foreground hover:border-primary/50"
                  >
                    + {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Student Email Notification Switch */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-1.5">
              <div className="flex items-start justify-between gap-3">
                <div className="leading-tight">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-foreground">Notify enrolled students</p>
                    <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 h-4">
                      {rescheduleTarget?.studentCount || 0} students
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Send an automated email notification with the new date, time, and reason.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={reschedNotifyStudents}
                  onChange={(e) => setReschedNotifyStudents(e.target.checked)}
                  className="h-4 w-4 mt-0.5 rounded text-primary focus:ring-primary accent-primary"
                />
              </div>
            </div>

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRescheduleOpen(false)}
                className="rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={rescheduling}
                className="rounded-xl font-bold gap-1.5 bg-primary hover:bg-primary/90"
              >
                {rescheduling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CalendarClock className="h-4 w-4" />
                )}
                Confirm &amp; Reschedule
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
