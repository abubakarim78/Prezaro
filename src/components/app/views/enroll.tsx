'use client'

// ============================================================
// Rollmark — Guided face enrollment
// consent → 3-pose guided capture (4 descriptors) → save.
// Full-screen, no app shell.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  CameraOff,
  Check,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  SwitchCamera,
  WifiOff,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import { ApiError, api, getErrorMessage } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { StudentDetail } from '@/lib/types'
import {
  detectSingle,
  drawOverlay,
  loadFaceEngine,
  noseOffset,
  startCamera,
  stopCamera,
  type FaceApi,
  type FaceResult,
} from '@/lib/face/engine'

// ---------- Tunables ----------------------------------------

const DETECT_INTERVAL_MS = 125 // ~8 fps
const SIZE_MIN = 0.25 // face width ≥ 25% of frame
const SIZE_MAX = 0.6 // face width ≤ 60% of frame
const CENTER_BAND = 0.15 // box centre within 15–85% of frame width
const STRAIGHT_TOL = 0.04
const TURN_MIN = 0.04
const TURN_MAX = 0.3
const NO_FACE_HINT_MS = 1800
const THUMB_SIZE = 96
const CONFIRM_DELAY_MS = 300

const POSES: { label: string; hint: string; ok: (off: number) => boolean }[] = [
  {
    label: 'Look straight',
    hint: 'Face the camera directly',
    ok: (off) => Math.abs(off) < STRAIGHT_TOL,
  },
  {
    label: 'Turn slightly left',
    hint: 'A small turn to your left',
    ok: (off) => off >= TURN_MIN && off <= TURN_MAX,
  },
  {
    label: 'Turn slightly right',
    hint: 'A small turn to your right',
    ok: (off) => off <= -TURN_MIN && off >= -TURN_MAX,
  },
]

// ============================================================

export default function EnrollView() {
  const params = useAppStore((s) => s.params)
  const back = useAppStore((s) => s.back)
  const online = useAppStore((s) => s.online)

  const studentIdParam = params.studentId ?? ''
  const [student, setStudent] = useState<StudentDetail | null>(null)
  const [studentError, setStudentError] = useState<string | null>(null)
  const [phase, setPhase] = useState<'loading' | 'consent' | 'capture' | 'save'>('loading')
  const [agreed, setAgreed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)

  // capture data lives here so both CaptureStage and the save screen see it
  const capturedRef = useRef<Float32Array[]>([])
  const [captures, setCaptures] = useState<Float32Array[]>([])
  const [thumbs, setThumbs] = useState<string[]>([])
  const [poseIdx, setPoseIdx] = useState(0)

  // ---- fetch student (accepts DB id or student number) ----
  useEffect(() => {
    let alive = true
    const run = async () => {
      if (!studentIdParam) {
        setStudentError('No student selected')
        return
      }
      try {
        const d = await api<{ student: StudentDetail }>(`/api/students/${studentIdParam}`)
        if (!alive) return
        setStudent(d.student)
        setPhase('consent')
      } catch (e) {
        if (!alive) return
        if (e instanceof ApiError && e.status === 404) {
          // param may be a student number — resolve via query then fetch detail
          try {
            const q = await api<{ students: { id: string; studentId: string }[] }>(
              `/api/students?query=${encodeURIComponent(studentIdParam)}`
            )
            const match = q.students.find(
              (s) => s.id === studentIdParam || s.studentId === studentIdParam
            )
            if (match) {
              const d2 = await api<{ student: StudentDetail }>(`/api/students/${match.id}`)
              if (!alive) return
              setStudent(d2.student)
              setPhase('consent')
              return
            }
            setStudentError('Student not found')
            return
          } catch (e2) {
            if (!alive) return
            setStudentError(getErrorMessage(e2))
            return
          }
        }
        setStudentError(getErrorMessage(e))
      }
    }
    void run()
    return () => {
      alive = false
    }
  }, [studentIdParam])

  const resetCaptures = useCallback(() => {
    capturedRef.current = []
    setCaptures([])
    setThumbs([])
    setPoseIdx(0)
  }, [])

  const cancel = useCallback(() => {
    if (phase === 'capture' && capturedRef.current.length > 0) setConfirmCancel(true)
    else if (phase === 'save') back()
    else back()
  }, [phase, back])

  const saveEnrollment = useCallback(async () => {
    if (!student) return
    if (!online) {
      toast.error('Face enrollment needs a connection')
      return
    }
    setSaving(true)
    try {
      const descriptors = capturedRef.current.map((d) => Array.from(d))
      await api<{ ok: boolean; count: number }>(`/api/students/${student.id}/face`, {
        method: 'POST',
        body: { descriptors, consentVersion: 'v1' },
      })
      toast.success('Face enrollment saved')
      back()
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }, [student, online, back])

  // ---------- render ----------

  if (phase === 'loading') {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ScanFace className="h-7 w-7" />
        </div>
        {studentError ? (
          <div className="w-full max-w-sm rounded-2xl border bg-card p-4">
            <p className="font-semibold">Couldn&apos;t load student</p>
            <p className="mt-1 text-sm text-muted-foreground">{studentError}</p>
            <Button variant="outline" className="mt-4 w-full" onClick={back}>
              Go back
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Loading student…</p>
        )}
      </div>
    )
  }

  if (phase === 'consent' && student) {
    const fullName = `${student.firstName} ${student.lastName}`.trim()
    return (
      <div className="flex h-dvh flex-col bg-background">
        <EnrollHeader title="Face enrollment" subtitle={fullName} onCancel={cancel} />
        <main className="flex-1 overflow-y-auto scrollbar-thin px-4 pb-6">
          <div className="mx-auto max-w-md rounded-2xl border bg-card p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-bold tracking-tight">
              Before we capture {student.firstName}&apos;s face
            </h2>
            <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
              <li className="flex gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  We store <strong className="text-foreground">a 128-number mathematical
                  template</strong> computed from the face — <strong className="text-foreground">not
                  photos</strong>. The camera feed never leaves this device.
                </span>
              </li>
              <li className="flex gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>The template is used for one purpose only: marking attendance.</span>
              </li>
              <li className="flex gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>The lecturer can delete it at any time from the student profile.</span>
              </li>
              <li className="flex gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>
                  Opting out is never penalised — the lecturer can always mark a
                  student present manually during review.
                </span>
              </li>
            </ul>

            <label
              htmlFor="consent-check"
              className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border bg-background/50 p-3.5"
            >
              <Checkbox
                id="consent-check"
                checked={agreed}
                onCheckedChange={(v) => setAgreed(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm font-medium leading-snug">
                I agree to enroll this face template for attendance (consent v1)
              </span>
            </label>
          </div>
        </main>
        <footer
          className="border-t bg-card px-4"
          style={{ paddingTop: 12, paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
        >
          <Button
            className="h-12 w-full text-base font-semibold"
            disabled={!agreed}
            onClick={() => setPhase('capture')}
          >
            Continue to capture
          </Button>
        </footer>
      </div>
    )
  }

  if (phase === 'capture' && student) {
    return (
      <CaptureStage
        student={student}
        poseIdx={poseIdx}
        setPoseIdx={setPoseIdx}
        capturedRef={capturedRef}
        setCaptures={setCaptures}
        setThumbs={setThumbs}
        onCancel={cancel}
        onDone={() => setPhase('save')}
      />
    )
  }

  if (phase === 'save' && student) {
    const fullName = `${student.firstName} ${student.lastName}`.trim()
    return (
      <div className="flex h-dvh flex-col bg-background">
        <EnrollHeader title="Review & save" subtitle={fullName} onCancel={cancel} />
        <main className="flex-1 overflow-y-auto scrollbar-thin px-4 pb-6">
          <div className="mx-auto max-w-md space-y-4 pt-2">
            <div className="rounded-2xl border bg-card p-6 text-center">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 20 }}
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground"
              >
                <Check className="h-8 w-8" strokeWidth={3} />
              </motion.div>
              <p className="mt-3 text-lg font-bold tracking-tight">All poses captured</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {captures.length} face template{captures.length === 1 ? '' : 's'} ready —
                thumbnails are for reference only and are not uploaded.
              </p>
              {thumbs.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {thumbs.map((src, i) => (
                     
                    <img
                      key={i}
                      src={src}
                      alt={`Captured pose ${i + 1}`}
                      className="h-16 w-16 rounded-xl border object-cover"
                    />
                  ))}
                </div>
              )}
            </div>

            {!online && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-700 dark:text-amber-400">
                <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Face enrollment needs a connection — reconnect to save the templates.
                </span>
              </div>
            )}
          </div>
        </main>
        <footer
          className="border-t bg-card px-4"
          style={{ paddingTop: 12, paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
        >
          <div className="mx-auto flex max-w-md gap-2">
            <Button
              variant="outline"
              className="h-12 flex-1"
              onClick={() => {
                resetCaptures()
                setPhase('capture')
              }}
              disabled={saving}
            >
              Retake
            </Button>
            <Button
              className="h-12 flex-[2] text-base font-semibold"
              onClick={() => void saveEnrollment()}
              disabled={saving || !online || captures.length === 0}
            >
              {saving ? 'Saving…' : 'Save enrollment'}
            </Button>
          </div>
        </footer>
      </div>
    )
  }

  return null
}

// ---------- header ----------

function EnrollHeader({
  title,
  subtitle,
  onCancel,
}: {
  title: string
  subtitle: string
  onCancel: () => void
}) {
  return (
    <header
      className="flex items-center gap-3 px-4"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)', paddingBottom: 10 }}
    >
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        onClick={onCancel}
        aria-label="Cancel enrollment"
      >
        <X className="h-5 w-5" />
      </Button>
      <div className="min-w-0">
        <h1 className="text-lg font-bold tracking-tight">{title}</h1>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </header>
  )
}

// ---------- capture stage ----------

interface CaptureStageProps {
  student: StudentDetail
  poseIdx: number
  setPoseIdx: (n: number) => void
  capturedRef: React.MutableRefObject<Float32Array[]>
  setCaptures: React.Dispatch<React.SetStateAction<Float32Array[]>>
  setThumbs: React.Dispatch<React.SetStateAction<string[]>>
  onCancel: () => void
  onDone: () => void
}

function CaptureStage({
  student,
  poseIdx,
  setPoseIdx,
  capturedRef,
  setCaptures,
  setThumbs,
  onCancel,
  onDone,
}: CaptureStageProps) {
  const [engine, setEngine] = useState<FaceApi | null>(null)
  const [engineStage, setEngineStage] = useState('Loading face engine…')
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [cameraState, setCameraState] = useState<'starting' | 'ready' | 'error'>('starting')
  const [cameraError, setCameraError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [poseOk, setPoseOk] = useState(false)
  const [faceMissing, setFaceMissing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [captures, setLocalCaptures] = useState<Float32Array[]>([])
  const [thumbs, setLocalThumbs] = useState<string[]>([])

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const lastFaceRef = useRef<FaceResult | null>(null)
  const lastSeenAtRef = useRef(0)
  const poseIdxRef = useRef(poseIdx)
  const busyRef = useRef(false)
  const aliveRef = useRef(true)
  const engineRef = useRef<FaceApi | null>(null)

  useEffect(() => {
    engineRef.current = engine
  }, [engine])
  useEffect(() => {
    poseIdxRef.current = poseIdx
  }, [poseIdx])

  // load engine
  useEffect(() => {
    let alive = true
    loadFaceEngine((s) => {
      if (alive) setEngineStage(s)
    })
      .then((f) => {
        if (alive) setEngine(f)
      })
      .catch((e) => {
        if (alive) {
          setEngineStage('')
          setCameraError(getErrorMessage(e))
          setCameraState('error')
        }
      })
    return () => {
      alive = false
    }
  }, [])

  // camera
  useEffect(() => {
    if (!engine) return
    let cancelled = false
    let localStream: MediaStream | null = null
    const video = videoRef.current
    if (!video) return

    // defer status update out of the synchronous effect body
    Promise.resolve().then(() => {
      if (!cancelled) setCameraState('starting')
    })
    startCamera(video, facing)
      .then((s) => {
        if (cancelled) {
          stopCamera(s)
          return
        }
        localStream = s
        streamRef.current = s
        setCameraState('ready')
      })
      .catch((e) => {
        if (cancelled) return
        setCameraError(getErrorMessage(e))
        setCameraState('error')
      })

    return () => {
      cancelled = true
      if (localStream) {
        stopCamera(localStream, videoRef.current)
        if (streamRef.current === localStream) streamRef.current = null
      }
    }
  }, [engine, facing, retryKey])

  const grabThumbnail = useCallback((video: HTMLVideoElement, face: FaceResult): string => {
    const c = document.createElement('canvas')
    c.width = THUMB_SIZE
    c.height = THUMB_SIZE
    const ctx = c.getContext('2d')
    if (!ctx) return ''
    // square crop around the face box with margin, mirrored for selfie view
    const margin = 0.3
    const size = Math.max(face.box.width, face.box.height) * (1 + margin * 2)
    const cx = face.box.x + face.box.width / 2
    const cy = face.box.y + face.box.height / 2
    const sx = Math.max(0, cx - size / 2)
    const sy = Math.max(0, cy - size / 2)
    ctx.translate(THUMB_SIZE, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, sx, sy, size, size, 0, 0, THUMB_SIZE, THUMB_SIZE)
    try {
      return c.toDataURL('image/jpeg', 0.72)
    } catch {
      return ''
    }
  }, [])

  const captureCurrent = () => {
    const video = videoRef.current
    const face = lastFaceRef.current
    if (!video || !face || busyRef.current) return
    const currentPose = poseIdxRef.current
    busyRef.current = true
    capturedRef.current = [...capturedRef.current, face.descriptor]
    setCaptures([...capturedRef.current])
    setLocalCaptures([...capturedRef.current])
    const thumb = grabThumbnail(video, face)
    if (thumb) {
      setThumbs((prev) => [...prev, thumb])
      setLocalThumbs((prev) => [...prev, thumb])
    }
    navigator.vibrate?.(40)

    const advance = () => {
      busyRef.current = false
      setConfirming(false)
      setPoseOk(false)
      if (currentPose + 1 >= POSES.length) onDone()
      else setPoseIdx(currentPose + 1)
    }

    if (currentPose === 0) {
      // straight pose → grab one extra confirm descriptor 300 ms later (4 total)
      setConfirming(true)
      setTimeout(async () => {
        try {
          const v = videoRef.current
          if (v && aliveRef.current && engineRef.current) {
            const again = await detectSingle(engineRef.current, v)
            if (again && aliveRef.current) {
              capturedRef.current = [...capturedRef.current, again.descriptor]
              setCaptures([...capturedRef.current])
              setLocalCaptures([...capturedRef.current])
            }
          }
        } catch {
          /* best-effort confirm */
        }
        advance()
      }, CONFIRM_DELAY_MS)
    } else {
      advance()
    }
  }

  // detection loop
  useEffect(() => {
    aliveRef.current = true
    if (!engine || cameraState !== 'ready') return
    let raf = 0
    let last = 0

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      if (t - last < DETECT_INTERVAL_MS) return
      last = t
      if (busyRef.current) return
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || video.readyState < 2) return
      busyRef.current = true
      void (async () => {
        const face = await detectSingle(engine, video, 320)
        if (!aliveRef.current) return
        const mirror = true // selfie preview is mirrored
        if (!face) {
          drawOverlay(canvas, video, [], [], { mirror })
          lastFaceRef.current = null
          setFaceMissing(Date.now() - lastSeenAtRef.current > NO_FACE_HINT_MS)
          setPoseOk(false)
          return
        }
        lastFaceRef.current = face
        lastSeenAtRef.current = Date.now()
        setFaceMissing(false)

        const vw = video.videoWidth || 1
        const off = noseOffset(face)
        const sizeOk = face.box.width >= SIZE_MIN * vw && face.box.width <= SIZE_MAX * vw
        const centerX = face.box.x + face.box.width / 2
        const centered = centerX >= CENTER_BAND * vw && centerX <= (1 - CENTER_BAND) * vw
        const angleOk = POSES[poseIdxRef.current].ok(off)
        const ok = sizeOk && centered && angleOk
        setPoseOk(ok)
        drawOverlay(
          canvas,
          video,
          [face],
          [ok ? { id: 'ok', name: '', distance: 0 } : null],
          { mirror }
        )
      })()
        .catch(() => {})
        .finally(() => {
          busyRef.current = false
        })
    }
    raf = requestAnimationFrame(tick)
    return () => {
      aliveRef.current = false
      cancelAnimationFrame(raf)
    }
  }, [engine, cameraState])

  // cleanup
  useEffect(() => {
    return () => {
      aliveRef.current = false
      stopCamera(streamRef.current, videoRef.current)
      streamRef.current = null
    }
  }, [])

  const pose = POSES[poseIdx]
  const mirror = facing === 'user'

  return (
    <div className="flex h-dvh flex-col bg-black text-white">
      <header
        className="flex items-center gap-3 bg-black/80 px-3"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 10px)', paddingBottom: 10 }}
      >
        <Button
          variant="ghost"
          size="icon"
          className="size-10 shrink-0 text-white hover:bg-white/15"
          onClick={onCancel}
          aria-label="Cancel enrollment"
        >
          <X className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <p className="truncate font-semibold">{`Enroll ${student.firstName} ${student.lastName}`}</p>
          <p className="text-xs tabular-nums text-white/60">
            {student.studentId} · pose {poseIdx + 1} of {POSES.length}
          </p>
        </div>
      </header>

      {/* video area */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ transform: mirror ? 'scaleX(-1)' : undefined }}
          playsInline
          muted
          autoPlay
        />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

        {cameraState === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            <p className="text-sm text-white/80">{engineStage || 'Starting camera…'}</p>
          </div>
        )}

        {cameraState === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-950 p-6">
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-5 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-400">
                <CameraOff className="h-6 w-6" />
              </div>
              <p className="mt-3 font-semibold">Camera unavailable</p>
              <p className="mt-1 text-sm text-white/70">
                {cameraError || 'Check the browser permission and try again.'}
              </p>
              <div className="mt-4 flex flex-col gap-2">
                <Button
                  className="h-11"
                  onClick={() => {
                    setCameraError('')
                    setCameraState('starting')
                    setRetryKey((k) => k + 1)
                  }}
                >
                  <RefreshCw className="h-4 w-4" /> Retry
                </Button>
                <Button
                  variant="outline"
                  className="h-11 border-white/20 bg-transparent text-white hover:bg-white/10"
                  onClick={onCancel}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {cameraState === 'ready' && (
          <div className="absolute inset-x-0 top-0 flex flex-col items-center gap-1.5 bg-gradient-to-b from-black/70 to-transparent px-6 pb-10 pt-4 text-center">
            <p className="text-xl font-bold tracking-tight">{pose.label}</p>
            <p className="text-sm text-white/75">{pose.hint}</p>
            {confirming && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-1 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300"
              >
                Hold still — confirming…
              </motion.p>
            )}
          </div>
        )}
      </div>

      {/* bottom controls */}
      <footer
        className="bg-black/90"
        style={{ paddingTop: 14, paddingBottom: 'max(env(safe-area-inset-bottom), 14px)' }}
      >
        <div className="mx-auto flex max-w-md items-center justify-between gap-4 px-6">
          <div className="flex w-16 flex-col items-center gap-1">
            {thumbs.length > 0 ? (
               
              <img
                src={thumbs[thumbs.length - 1]}
                alt="Last captured pose"
                className="h-11 w-11 rounded-lg border border-white/20 object-cover"
              />
            ) : (
              <span className="h-11 w-11 rounded-lg border border-dashed border-white/20" />
            )}
            <span className="text-[10px] tabular-nums text-white/60">
              {captures.length}/{POSES.length + 1}
            </span>
          </div>

          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={captureCurrent}
              disabled={!poseOk || confirming || cameraState !== 'ready'}
              aria-label="Capture pose"
              className={`flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 transition-all disabled:opacity-40 ${
                poseOk
                  ? 'border-emerald-400 bg-emerald-500 shadow-lg shadow-emerald-500/40'
                  : 'border-white/40 bg-white/10'
              }`}
            >
              <ScanFace className={`h-8 w-8 ${poseOk ? 'text-emerald-950' : 'text-white/70'}`} />
            </button>
            <p aria-live="polite" className="h-4 text-xs text-white/70">
              {faceMissing && cameraState === 'ready'
                ? 'No face — move closer / better lighting'
                : poseOk
                  ? 'Perfect — tap capture'
                  : ''}
            </p>
          </div>

          <div className="flex w-16 justify-end">
            <Button
              variant="ghost"
              size="icon"
              className="size-11 text-white hover:bg-white/15"
              onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
              aria-label="Flip camera"
            >
              <SwitchCamera className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}
