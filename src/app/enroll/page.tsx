'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast, Toaster } from 'sonner'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Camera,
  CameraOff,
  Check,
  CheckCircle2,
  ChevronDown,
  Info,
  Loader2,
  Lock,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  Sparkles,
  SwitchCamera,
  User,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BrandLogo } from '@/components/brand/brand-logo'
import { cn } from '@/lib/utils'
import {
  detectSingle,
  drawOverlay,
  enhanceForDetection,
  loadFaceEngine,
  noseOffset,
  startCamera,
  stopCamera,
  type FaceApi,
  type FaceResult,
} from '@/lib/face/engine'
import {
  playAllDone,
  playFaceDetected,
  playPoseCaptured,
  unlockCaptureAudio,
} from '@/lib/face/sounds'

interface DepartmentItem {
  id: string
  name: string
  code: string
  institutionName: string
  courses: {
    id: string
    code: string
    title: string
    level: number
  }[]
}

const POSES: { label: string; hint: string; ok: (off: number) => boolean }[] = [
  {
    label: 'Look straight ahead',
    hint: 'Face the camera directly and stay still',
    ok: (off) => Math.abs(off) < 0.04,
  },
  {
    label: 'Turn slightly left',
    hint: 'Slowly turn your head slightly to your left',
    ok: (off) => off >= 0.04 && off <= 0.3,
  },
  {
    label: 'Turn slightly right',
    hint: 'Slowly turn your head slightly to your right',
    ok: (off) => off <= -0.04 && off >= -0.3,
  },
]

type Step = 'details' | 'consent' | 'capture' | 'success'

interface TargetCourse {
  id: string
  code: string
  title: string
  level: number
  departmentId: string
  departmentName?: string
  departmentCode?: string
  institutionName?: string
}

interface EnrollmentReceipt {
  studentId: string
  firstName: string
  lastName: string
  email: string
  departmentName: string
  courseCodes: string[]
  refCode: string
  submittedAt: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
}

export default function StudentEnrollPage() {
  const [step, setStep] = useState<Step>('details')
  const [departments, setDepartments] = useState<DepartmentItem[]>([])
  const [loadingDepts, setLoadingDepts] = useState(true)
  const [targetCourse, setTargetCourse] = useState<TargetCourse | null>(null)

  // Form Fields
  const [selectedDeptId, setSelectedDeptId] = useState('')
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([])
  const [studentId, setStudentId] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [level, setLevel] = useState<number>(100)
  const [consentGiven, setConsentGiven] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Camera & Face capture state
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [poseIdx, setPoseIdx] = useState(0)
  const [capturedPoses, setCapturedPoses] = useState<{ label: string; thumb: string }[]>([])
  const [capturedDescriptors, setCapturedDescriptors] = useState<number[][]>([])
  const [primaryPhotoData, setPrimaryPhotoData] = useState<string | null>(null)
  const [autoCaptureHold, setAutoCaptureHold] = useState(0)
  const [engineLoading, setEngineLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submittedRefCode, setSubmittedRefCode] = useState<string | null>(null)

  // Locked out receipt state (prevent multiple access)
  const [existingReceipt, setExistingReceipt] = useState<EnrollmentReceipt | null>(null)
  const [verifyingDuplicate, setVerifyingDuplicate] = useState(false)
  const [refreshingStatus, setRefreshingStatus] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const loopRef = useRef<number | null>(null)
  const holdStartRef = useRef<number | null>(null)
  const faceApiRef = useRef<FaceApi | null>(null)

  // Check for existing enrollment on this device on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('prezaro_enrollment_receipt')
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as EnrollmentReceipt
          if (parsed && parsed.studentId) {
            setExistingReceipt(parsed)
            void checkLatestStatus(parsed.studentId)
          }
        } catch {}
      }
    }
  }, [])

  const checkLatestStatus = async (sId: string) => {
    setRefreshingStatus(true)
    try {
      const res = await fetch(`/api/departments/public?checkStudentId=${encodeURIComponent(sId)}`)
      const data = await res.json()
      if (data.alreadyEnrolled) {
        setExistingReceipt((prev) => {
          if (!prev) return null
          const updated: EnrollmentReceipt = {
            ...prev,
            status: data.status || prev.status,
            departmentName: data.departmentName || prev.departmentName,
            courseCodes: data.courseCodes && data.courseCodes.length > 0 ? data.courseCodes : prev.courseCodes,
            refCode: data.refCode || prev.refCode,
          }
          if (typeof window !== 'undefined') {
            localStorage.setItem('prezaro_enrollment_receipt', JSON.stringify(updated))
          }
          return updated
        })
      }
    } catch {
      // ignore network errors
    } finally {
      setRefreshingStatus(false)
    }
  }

  // Fetch departments & courses (supporting direct course lookup)
  useEffect(() => {
    ;(async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search)
        const courseParam = urlParams.get('course') || urlParams.get('courseId') || urlParams.get('courseCode')
        const deptParam = urlParams.get('dept') || urlParams.get('deptId')

        const queryParams = new URLSearchParams()
        if (courseParam) queryParams.set('course', courseParam)
        if (deptParam) queryParams.set('dept', deptParam)

        const fetchUrl = `/api/departments/public${queryParams.toString() ? `?${queryParams.toString()}` : ''}`
        const res = await fetch(fetchUrl)
        const data = await res.json()

        if (data.departments && data.departments.length > 0) {
          setDepartments(data.departments)
        }

        if (data.targetCourse) {
          setTargetCourse(data.targetCourse)
          setSelectedDeptId(data.targetCourse.departmentId)
          setSelectedCourseIds([data.targetCourse.id])
          if (data.targetCourse.level) setLevel(data.targetCourse.level)
        } else if (data.departments && data.departments.length > 0) {
          const found = data.departments.find(
            (d: DepartmentItem) => d.id === deptParam || d.code.toLowerCase() === deptParam?.toLowerCase()
          )
          if (found) {
            setSelectedDeptId(found.id)
          } else {
            setSelectedDeptId(data.departments[0].id)
          }
        }
      } catch (err) {
        toast.error('Failed to load university departments')
      } finally {
        setLoadingDepts(false)
      }
    })()
  }, [])

  const currentDept = departments.find((d) => d.id === selectedDeptId)

  // Filter courses by selected level if applicable
  const availableCourses = currentDept?.courses ?? []

  const toggleCourse = (id: string) => {
    if (targetCourse && id === targetCourse.id) {
      toast.info(`${targetCourse.code} is the required course for this enrollment link.`)
      return
    }
    setSelectedCourseIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  const validateDetails = () => {
    setFormError(null)
    if (!selectedDeptId) {
      setFormError('Please select your department')
      return false
    }
    if (!studentId.trim()) {
      setFormError('Please enter your Student ID / Index Number')
      return false
    }
    if (!firstName.trim() || !lastName.trim()) {
      setFormError('Please enter your full first and last name')
      return false
    }
    if (!email.trim() || !email.includes('@')) {
      setFormError('Please enter a valid university email address')
      return false
    }
    if (selectedCourseIds.length === 0) {
      setFormError('Please select at least one course you are enrolled in')
      return false
    }
    return true
  }

  const proceedToConsent = async () => {
    if (!validateDetails()) return
    setVerifyingDuplicate(true)
    try {
      const checkRes = await fetch(
        `/api/departments/public?checkStudentId=${encodeURIComponent(studentId.trim())}&checkEmail=${encodeURIComponent(email.trim())}`
      )
      const checkData = await checkRes.json()
      if (checkData.alreadyEnrolled) {
        const receipt: EnrollmentReceipt = {
          studentId: checkData.studentId || studentId.trim().toUpperCase(),
          firstName: checkData.studentName ? checkData.studentName.split(' ')[0] : firstName.trim(),
          lastName: checkData.studentName ? checkData.studentName.split(' ').slice(1).join(' ') : lastName.trim(),
          email: email.trim().toLowerCase(),
          departmentName: checkData.departmentName || currentDept?.name || 'Academic Department',
          courseCodes: checkData.courseCodes && checkData.courseCodes.length > 0
            ? checkData.courseCodes
            : availableCourses.filter((c) => selectedCourseIds.includes(c.id)).map((c) => c.code),
          refCode: checkData.refCode || 'REGISTERED',
          submittedAt: checkData.submittedAt || new Date().toISOString(),
          status: checkData.status || 'PENDING',
        }
        if (typeof window !== 'undefined') {
          localStorage.setItem('prezaro_enrollment_receipt', JSON.stringify(receipt))
        }
        setExistingReceipt(receipt)
        toast.error('Enrollment Already Exists', {
          description: `Student ID ${studentId} is already registered. Each student can only enroll once.`,
        })
        return
      }
      setStep('consent')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      // If network check fails, continue
      setStep('consent')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setVerifyingDuplicate(false)
    }
  }

  const proceedToCapture = async () => {
    if (!consentGiven) {
      toast.error('You must give consent to enroll for attendance verification')
      return
    }
    unlockCaptureAudio()
    setStep('capture')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    await initCamera()
  }

  // Camera management
  const initCamera = async () => {
    setCameraError(null)
    setEngineLoading(true)
    try {
      const apiObj = await loadFaceEngine()
      faceApiRef.current = apiObj
      setEngineLoading(false)

      if (videoRef.current) {
        const stream = await startCamera(videoRef.current, facingMode)
        streamRef.current = stream
        setCameraActive(true)
        startDetectionLoop()
      }
    } catch (err) {
      setEngineLoading(false)
      setCameraError('Unable to access camera. Please allow camera permissions and try again.')
    }
  }

  const stopActiveCamera = () => {
    if (loopRef.current) {
      cancelAnimationFrame(loopRef.current)
      loopRef.current = null
    }
    if (streamRef.current) {
      stopCamera(streamRef.current, videoRef.current)
      streamRef.current = null
    }
    setCameraActive(false)
  }

  useEffect(() => {
    return () => {
      stopActiveCamera()
    }
  }, [])

  // Crop thumbnail helper
  const extractThumbnail = (video: HTMLVideoElement, box: FaceResult['box']): string => {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 320
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''

    // Add padding around face box
    const pad = box.width * 0.3
    const sx = Math.max(0, box.x - pad)
    const sy = Math.max(0, box.y - pad)
    const sw = Math.min(video.videoWidth - sx, box.width + pad * 2)
    const sh = Math.min(video.videoHeight - sy, box.height + pad * 2)

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 320, 320)
    return canvas.toDataURL('image/jpeg', 0.85)
  }

  // Face detection loop
  const startDetectionLoop = () => {
    let lastDetect = 0

    const stepFrame = async (timestamp: number) => {
      const video = videoRef.current
      const canvas = canvasRef.current
      const apiObj = faceApiRef.current

      if (!video || !canvas || !apiObj || video.readyState < 2 || video.paused) {
        loopRef.current = requestAnimationFrame(stepFrame)
        return
      }

      if (timestamp - lastDetect >= 120) {
        lastDetect = timestamp
        try {
          const result = await detectSingle(apiObj, video)
          if (canvas) {
            if (result) {
              drawOverlay(canvas, video, [result], [null], { mirror: facingMode === 'user' })
            } else {
              const ctx = canvas.getContext('2d')
              if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
            }
          }

          if (result && poseIdx < POSES.length) {
            const currentPose = POSES[poseIdx]
            const off = noseOffset(result)
            const isPoseValid = currentPose.ok(off)

            if (isPoseValid) {
              if (holdStartRef.current === null) {
                holdStartRef.current = timestamp
              }
              const held = timestamp - holdStartRef.current
              const progress = Math.min(1, held / 800)
              setAutoCaptureHold(progress)

              if (progress >= 1) {
                // Pose achieved!
                playPoseCaptured()
                holdStartRef.current = null
                setAutoCaptureHold(0)

                const thumb = extractThumbnail(video, result.box)
                const descArray = Array.from(result.descriptor)

                if (poseIdx === 0) {
                  setPrimaryPhotoData(thumb)
                }

                setCapturedPoses((prev) => [...prev, { label: currentPose.label, thumb }])
                setCapturedDescriptors((prev) => [...prev, descArray])

                const nextPose = poseIdx + 1
                setPoseIdx(nextPose)

                if (nextPose >= POSES.length) {
                  // All poses done!
                  playAllDone()
                  stopActiveCamera()
                  toast.success('All 3 facial angles verified successfully!')
                }
              }
            } else {
              holdStartRef.current = null
              setAutoCaptureHold(0)
            }
          } else {
            holdStartRef.current = null
            setAutoCaptureHold(0)
          }
        } catch (err) {
          // ignore detection frame glitch
        }
      }

      loopRef.current = requestAnimationFrame(stepFrame)
    }

    loopRef.current = requestAnimationFrame(stepFrame)
  }

  // Reset face capture
  const resetCapture = async () => {
    setCapturedPoses([])
    setCapturedDescriptors([])
    setPrimaryPhotoData(null)
    setPoseIdx(0)
    setAutoCaptureHold(0)
    await initCamera()
  }

  // Final submission to backend
  const handleSubmitEnrollment = async () => {
    if (capturedDescriptors.length === 0) {
      toast.error('Face capture incomplete. Please complete all 3 poses.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/departments/enrollment-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentId.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          level,
          departmentId: selectedDeptId,
          courseIds: selectedCourseIds,
          descriptors: capturedDescriptors,
          photoData: primaryPhotoData || undefined,
          consentGiven: true,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.message || 'Enrollment submission failed')
      }

      const refCode = data.submissionId ? data.submissionId.slice(-8).toUpperCase() : 'SUB-OK'
      setSubmittedRefCode(refCode)

      const courseCodes = availableCourses
        .filter((c) => selectedCourseIds.includes(c.id))
        .map((c) => c.code)

      const receipt: EnrollmentReceipt = {
        studentId: studentId.trim().toUpperCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        departmentName: currentDept?.name || 'Academic Department',
        courseCodes,
        refCode,
        submittedAt: new Date().toISOString(),
        status: 'PENDING',
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('prezaro_enrollment_receipt', JSON.stringify(receipt))
      }
      setExistingReceipt(receipt)

      setStep('success')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Submission failed'
      toast.error(msg)
      if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('pending')) {
        void checkLatestStatus(studentId.trim().toUpperCase())
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between">
      <Toaster position="top-center" richColors />

      {/* Top Header */}
      <header className="border-b bg-card/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrandLogo className="h-7 w-7 rounded-lg overflow-hidden" />
            <span className="font-bold tracking-tight text-sm">Prezaro</span>
            <Badge variant="outline" className="text-[10px] uppercase font-semibold text-primary border-primary/30">
              Student Portal
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground font-medium">
            {existingReceipt && 'Enrolled'}
            {!existingReceipt && step === 'details' && 'Step 1 of 3'}
            {!existingReceipt && step === 'consent' && 'Step 2 of 3'}
            {!existingReceipt && step === 'capture' && 'Step 3 of 3'}
            {!existingReceipt && step === 'success' && 'Completed'}
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8">
        {existingReceipt && step !== 'success' ? (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 text-center py-4"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mx-auto shadow-sm">
              <ShieldCheck className="w-8 h-8 stroke-[2.5]" />
            </div>

            <div className="space-y-1.5">
              <Badge variant="outline" className="gap-1.5 text-xs font-semibold px-3 py-1 border-primary/30 bg-primary/5 text-primary">
                <Lock className="w-3.5 h-3.5" />
                Enrollment Locked (One-Time Access)
              </Badge>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Enrollment Already Completed
              </h1>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Biometric enrollment has already been recorded on this device for <strong>{existingReceipt.firstName} {existingReceipt.lastName}</strong>.
                Students are strictly permitted a single submission.
              </p>
            </div>

            {/* Receipt Summary Card */}
            <Card className="p-5 text-left space-y-4 border bg-card/80 shadow-sm rounded-2xl">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Student ID / Index Number
                  </p>
                  <p className="font-mono text-base font-bold text-foreground">
                    {existingReceipt.studentId}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[11px] font-semibold uppercase px-2.5 py-0.5',
                    existingReceipt.status === 'APPROVED' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                    existingReceipt.status === 'PENDING' && 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
                    existingReceipt.status === 'REJECTED' && 'border-destructive/30 bg-destructive/10 text-destructive'
                  )}
                >
                  {existingReceipt.status === 'APPROVED' ? 'Approved & Ready' : existingReceipt.status === 'PENDING' ? 'Under Department Review' : 'Rejected'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground font-medium">Department</p>
                  <p className="font-semibold text-foreground truncate mt-0.5">{existingReceipt.departmentName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium">Reference Code</p>
                  <p className="font-mono font-bold text-primary mt-0.5">{existingReceipt.refCode}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium">Submitted On</p>
                  <p className="text-foreground mt-0.5">{new Date(existingReceipt.submittedAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground font-medium">Verification Method</p>
                  <p className="text-foreground mt-0.5">3-Pose Facial Biometrics</p>
                </div>
              </div>

              {existingReceipt.courseCodes && existingReceipt.courseCodes.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    Registered Courses
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {existingReceipt.courseCodes.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 font-mono text-xs font-semibold text-primary"
                      >
                        <BookOpen className="h-3 w-3" />
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Status Refresh Action */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 text-xs font-semibold h-10 w-full sm:w-auto"
                onClick={() => checkLatestStatus(existingReceipt.studentId)}
                disabled={refreshingStatus}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', refreshingStatus && 'animate-spin')} />
                {refreshingStatus ? 'Checking Status...' : 'Check Verification Status'}
              </Button>
            </div>

            <div className="p-3.5 rounded-xl border border-muted bg-muted/40 text-left text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-primary" /> Need to make changes?
              </p>
              <p>
                To change registered courses or request a facial re-scan (e.g. for significant appearance changes), please contact your Department Head directly. Biometric profiles cannot be modified without departmental authorization.
              </p>
            </div>
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
          {/* STEP 1: STUDENT & COURSE DETAILS */}
          {step === 'details' && (
            <motion.div
              key="details"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight">Student Self-Enrollment</h1>
                <p className="text-sm text-muted-foreground">
                  Enroll your face biometric profile and select your courses so you are recognized automatically during class attendance.
                </p>
              </div>

              {/* Target Course Banner when enrolling via specific course link */}
              {targetCourse && (
                <div className="rounded-2xl border-2 border-primary/30 bg-primary/10 p-4 space-y-2 shadow-sm">
                  <div className="flex items-center justify-between">
                    <Badge className="bg-primary text-primary-foreground font-mono text-xs px-2.5 py-0.5 font-bold">
                      {targetCourse.code}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground font-semibold">
                      {targetCourse.institutionName}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      {targetCourse.title}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Department of <strong>{targetCourse.departmentName}</strong>
                    </p>
                  </div>
                  <div className="pt-2 border-t border-primary/20 flex items-center gap-1.5 text-xs text-primary font-medium">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    You are enrolling directly into this course roster upon department verification.
                  </div>
                </div>
              )}

              {loadingDepts ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-xs text-muted-foreground">Loading university departments…</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Department selection */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                        Department
                      </label>
                      {targetCourse && (
                        <span className="text-[11px] text-primary font-medium">
                          Locked to course department
                        </span>
                      )}
                    </div>
                    <select
                      value={selectedDeptId}
                      disabled={!!targetCourse}
                      onChange={(e) => {
                        setSelectedDeptId(e.target.value)
                        setSelectedCourseIds([])
                      }}
                      className="w-full h-11 px-3 rounded-xl border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-80"
                    >
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({d.institutionName})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Student ID & Level */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1.5">
                      <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                        Student ID / Index Number *
                      </label>
                      <Input
                        placeholder="e.g. UDS/CS/2022/0045"
                        value={studentId}
                        onChange={(e) => setStudentId(e.target.value.toUpperCase())}
                        className="h-11 font-mono uppercase"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                        Level
                      </label>
                      <select
                        value={String(level)}
                        onChange={(e) => setLevel(Number(e.target.value))}
                        className="w-full h-11 px-3 rounded-xl border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="100">100</option>
                        <option value="200">200</option>
                        <option value="300">300</option>
                        <option value="400">400</option>
                        <option value="500">500+</option>
                      </select>
                    </div>
                  </div>

                  {/* Name fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                        First Name *
                      </label>
                      <Input
                        placeholder="e.g. Kwame"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                        Last Name *
                      </label>
                      <Input
                        placeholder="e.g. Mensah"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="h-11"
                      />
                    </div>
                  </div>

                  {/* Contact info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                        Student Email *
                      </label>
                      <Input
                        type="email"
                        placeholder="e.g. kmensah@uds.edu.gh"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                        Phone Number (Optional)
                      </label>
                      <Input
                        type="tel"
                        placeholder="e.g. 0244123456"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="h-11"
                      />
                    </div>
                  </div>

                  {/* Course selection */}
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                        Select Your Enrolled Courses *
                      </label>
                      <span className="text-xs text-primary font-medium">
                        {selectedCourseIds.length} selected
                      </span>
                    </div>

                    {availableCourses.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-3">
                        No courses registered in this department yet. You can proceed and the department head will assign courses later.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1 border rounded-xl bg-card">
                        {availableCourses.map((c) => {
                          const isChecked = selectedCourseIds.includes(c.id)
                          const isTarget = targetCourse && c.id === targetCourse.id
                          return (
                            <button
                              type="button"
                              key={c.id}
                              onClick={() => toggleCourse(c.id)}
                              className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left transition-all ${
                                isChecked
                                  ? 'border-primary bg-primary/10 text-foreground'
                                  : 'border-border/60 hover:bg-accent/50 text-muted-foreground'
                              } ${isTarget ? 'ring-1 ring-primary/40' : ''}`}
                            >
                              <div
                                className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                                  isChecked
                                    ? 'bg-primary border-primary text-primary-foreground'
                                    : 'border-muted-foreground/40'
                                }`}
                              >
                                {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                              </div>
                              <div className="min-w-0 flex-1 leading-tight">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-mono text-xs font-bold text-foreground">
                                    {c.code}
                                  </span>
                                  {isTarget && (
                                    <span className="text-[10px] font-semibold text-primary bg-primary/20 px-1.5 py-0.5 rounded">
                                      Required
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs truncate">{c.title}</p>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {formError && (
                    <div className="flex items-center gap-2 p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{formError}</span>
                    </div>
                  )}

                  <Button
                    onClick={proceedToConsent}
                    disabled={verifyingDuplicate}
                    className="w-full h-12 text-sm font-semibold gap-2 mt-4"
                  >
                    {verifyingDuplicate ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Verifying Registration...
                      </>
                    ) : (
                      <>
                        Continue to Consent <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              )}
            </motion.div>
          )}

          {/* STEP 2: CONSENT & PRIVACY NOTICE */}
          {step === 'consent' && (
            <motion.div
              key="consent"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-muted-foreground"
                onClick={() => setStep('details')}
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to details
              </Button>

              <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                  Biometric Privacy &amp; Consent
                </h1>
                <p className="text-sm text-muted-foreground">
                  Institutional data protection guidelines and informed consent.
                </p>
              </div>

              <Card className="p-4 space-y-3 text-xs leading-relaxed text-muted-foreground border-primary/20 bg-primary/5">
                <p className="font-semibold text-foreground text-sm">
                  How Prezaro Protects Your Facial Biometric Data:
                </p>
                <ul className="list-disc pl-4 space-y-1.5">
                  <li>
                    <strong>On-Device Mathematical Vectorization:</strong> Your face is converted into a 128-dimensional numerical coordinate array directly in your browser. Raw video streams are never transmitted to external cloud servers.
                  </li>
                  <li>
                    <strong>Exclusive University Attendance Scope:</strong> Your face vectors are linked solely to your university index number ({studentId}) for verification by your registered course lecturers.
                  </li>
                  <li>
                    <strong>Ghana Data Protection Act (Act 843) Compliant:</strong> Biometric templates are stored securely and encrypted in institutional compliance with national privacy statutes.
                  </li>
                  <li>
                    <strong>Voluntary &amp; Opt-Out Rights:</strong> If you cannot participate due to religious, cultural, or personal reasons, you may request manual roll-call check-in with your Department Head.
                  </li>
                </ul>
              </Card>

              <div className="flex items-start gap-3 p-4 rounded-xl border bg-card">
                <Checkbox
                  id="consent"
                  checked={consentGiven}
                  onCheckedChange={(c) => setConsentGiven(!!c)}
                  className="mt-0.5"
                />
                <label htmlFor="consent" className="text-xs text-foreground cursor-pointer leading-normal">
                  <strong>I consent to biometric enrollment:</strong> I authorize the Department of{' '}
                  {currentDept?.name} to record my facial vectors for verifying my attendance during academic lecture sessions.
                </label>
              </div>

              <Button
                onClick={proceedToCapture}
                disabled={!consentGiven}
                className="w-full h-12 text-sm font-semibold gap-2"
              >
                <Camera className="h-4 w-4" /> Start Face Capture
              </Button>
            </motion.div>
          )}

          {/* STEP 3: GUIDED 3-POSE FACE CAPTURE */}
          {step === 'capture' && (
            <motion.div
              key="capture"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold tracking-tight">Facial Biometric Capture</h2>
                  <p className="text-xs text-muted-foreground">
                    Follow the instructions on screen. Hold still when the ring turns green.
                  </p>
                </div>
                <Badge variant="outline" className="font-mono text-xs">
                  {Math.min(poseIdx + 1, POSES.length)} / {POSES.length} Poses
                </Badge>
              </div>

              {/* Camera viewport card */}
              <div className="relative aspect-3/4 max-w-sm mx-auto rounded-3xl overflow-hidden bg-black border-2 border-primary/40 shadow-xl">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover mirror"
                  style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                />
                <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none w-full h-full" />

                {/* Loading / Error Overlays */}
                {engineLoading && (
                  <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3 text-white z-10">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-xs font-medium">Initializing biometric face engine…</p>
                  </div>
                )}

                {cameraError && (
                  <div className="absolute inset-0 bg-black/90 p-6 flex flex-col items-center justify-center text-center gap-3 text-white z-10">
                    <CameraOff className="h-10 w-10 text-destructive" />
                    <p className="text-sm font-semibold">{cameraError}</p>
                    <Button size="sm" variant="outline" onClick={initCamera}>
                      Try Again
                    </Button>
                  </div>
                )}

                {/* Live Pose Guidance Banner */}
                {cameraActive && poseIdx < POSES.length && (
                  <div className="absolute top-4 inset-x-4 bg-background/90 backdrop-blur-md rounded-2xl p-3 text-center border shadow-lg z-10">
                    <p className="text-xs font-semibold text-primary uppercase tracking-wider">
                      Pose {poseIdx + 1}: {POSES[poseIdx].label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-medium">
                      {POSES[poseIdx].hint}
                    </p>

                    {/* Auto-capture progress bar */}
                    {autoCaptureHold > 0 && (
                      <div className="mt-2 w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full transition-all duration-75"
                          style={{ width: `${autoCaptureHold * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Completion Overlay when all 3 poses done */}
                {poseIdx >= POSES.length && (
                  <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center text-white z-10 space-y-4">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400">
                      <Check className="h-8 w-8 stroke-[3]" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Face Enrollment Complete!</h3>
                      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                        All 3 facial angles have been vectorized and verified.
                      </p>
                    </div>

                    <div className="flex gap-2">
                      {capturedPoses.map((p, i) => (
                        <img
                          key={i}
                          src={p.thumb}
                          alt={p.label}
                          className="w-16 h-16 rounded-xl object-cover border border-emerald-500/50 shadow-md"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Actions */}
              {poseIdx >= POSES.length ? (
                <div className="space-y-2 pt-2">
                  <Button
                    onClick={handleSubmitEnrollment}
                    disabled={submitting}
                    className="w-full h-12 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-lg shadow-emerald-600/20"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Submitting to Department…
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Submit Enrollment for Verification
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={resetCapture}
                    disabled={submitting}
                  >
                    Retake Photos
                  </Button>
                </div>
              ) : (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1.5"
                    onClick={() => {
                      const next = facingMode === 'user' ? 'environment' : 'user'
                      setFacingMode(next)
                      void initCamera()
                    }}
                  >
                    <SwitchCamera className="h-3.5 w-3.5" /> Switch Camera
                  </Button>
                </div>
              )}
            </motion.div>
          )}

          {/* STEP 4: SUCCESS CONFIRMATION */}
          {step === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8 text-center space-y-6"
            >
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500 mx-auto flex items-center justify-center text-emerald-500 shadow-xl">
                <Check className="h-10 w-10 stroke-[3]" />
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight">Submission Received!</h1>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Thank you, <strong>{firstName} {lastName}</strong> ({studentId}). Your facial biometric profile and course enrollment request have been received by the <strong>{currentDept?.name}</strong>.
                </p>
              </div>

              {submittedRefCode && (
                <div className="inline-block rounded-2xl border bg-card px-5 py-3 shadow-xs">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Submission Reference Code
                  </p>
                  <p className="font-mono text-xl font-bold text-primary mt-0.5">
                    {submittedRefCode}
                  </p>
                </div>
              )}

              <Card className="p-4 max-w-sm mx-auto text-left text-xs space-y-2 border-primary/20 bg-primary/5">
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" /> What Happens Next?
                </p>
                <p className="text-muted-foreground">
                  Your Department Head or Course Lecturer will verify your registration. Once approved:
                </p>
                <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                  <li>Your name will appear on all your registered course rosters.</li>
                  <li>When you walk into class, the kiosk camera will instantly recognize you and mark your attendance.</li>
                </ul>
              </Card>

              <div className="pt-4 flex flex-col items-center gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/60 px-4 py-2 rounded-full border border-border/60">
                  <Lock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>One-time enrollment completed. This link is now locked on this device.</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        <p>Prezaro Face Attendance System • Institutional Biometric Enrollment</p>
      </footer>
    </div>
  )
}
