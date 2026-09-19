// ============================================================
// Prezaro — Face engine
// Loads the vendored face-api.js bundle (tfjs included) + model
// weights, wraps camera + detection + overlay drawing.
// Browser-only: every export assumes a DOM environment.
// ============================================================

export type FaceApi = NonNullable<Window['faceapi']>

export interface FacePoint {
  x: number
  y: number
}

export interface FaceBox {
  x: number
  y: number
  width: number
  height: number
}

export interface FaceResult {
  box: FaceBox
  score: number
  descriptor: Float32Array
  nose: FacePoint
  leftEye: FacePoint
  rightEye: FacePoint
}

/** Per-face match info used for overlay colouring/labels. */
export interface FaceMatchInfo {
  id: string
  name: string
  distance: number
}

export type FacingMode = 'user' | 'environment'

// ---------- Script + model loading (singleton) --------------

const SCRIPT_ID = 'prezaro-faceapi'
const SCRIPT_SRC = '/vendor/face-api.js'
const MODELS_URI = '/models'

let enginePromise: Promise<FaceApi> | null = null
let stageListener: ((s: string) => void) | null = null

function injectScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null
    if (existing) {
      if (window.faceapi) {
        resolve()
        return
      }
      const onLoad = () => {
        cleanup()
        resolve()
      }
      const onErr = () => {
        cleanup()
        reject(new Error('Could not load the face recognition engine.'))
      }
      const cleanup = () => {
        existing.removeEventListener('load', onLoad)
        existing.removeEventListener('error', onErr)
      }
      existing.addEventListener('load', onLoad)
      existing.addEventListener('error', onErr)
      return
    }

    const script = document.createElement('script')
    script.id = SCRIPT_ID
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      script.remove()
      reject(new Error('Could not load the face recognition engine.'))
    }
    document.head.appendChild(script)
  })
}

function waitForGlobal(timeoutMs = 20000): Promise<FaceApi> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const poll = () => {
      if (window.faceapi) {
        resolve(window.faceapi)
        return
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('Face engine did not initialise in time.'))
        return
      }
      setTimeout(poll, 60)
    }
    poll()
  })
}

async function loadEngine(): Promise<FaceApi> {
  stageListener?.('Loading face engine…')
  await injectScript()
  const faceapi = await waitForGlobal()
  try {
    await faceapi.tf?.ready()
  } catch {
    // backend already ready or optional — ignore
  }

  stageListener?.('Loading models… (1/3)')
  await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URI)
  stageListener?.('Loading models… (2/3)')
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URI)
  stageListener?.('Loading models… (3/3)')
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URI)
  stageListener?.('Face engine ready')
  return faceapi
}

/**
 * Singleton loader for the face engine. Progress is reported through
 * the LATEST registered `onStage` callback (multiple callers supported).
 */
export function loadFaceEngine(onStage?: (s: string) => void): Promise<FaceApi> {
  if (onStage) stageListener = onStage
  if (!enginePromise) {
    enginePromise = loadEngine().catch((err) => {
      // allow a retry on the next call — never cache rejections
      enginePromise = null
      stageListener = null
      throw err
    })
  }
  return enginePromise
}

// ---------- Camera ------------------------------------------

export async function startCamera(
  video: HTMLVideoElement,
  facing: FacingMode
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      'Camera not available — this device or browser does not support camera access.'
    )
  }

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: facing,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    })
  } catch {
    throw new Error(
      'Camera not available — check permissions, or close other apps using the camera.'
    )
  }

  video.srcObject = stream
  video.muted = true

  // Wait for metadata so videoWidth/Height are known before first draw
  await new Promise<void>((resolve, reject) => {
    if (video.readyState >= 1) {
      resolve()
      return
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Camera not available — the video feed failed to start.'))
    }, 10000)
    const onMeta = () => {
      cleanup()
      resolve()
    }
    const cleanup = () => {
      clearTimeout(timer)
      video.removeEventListener('loadedmetadata', onMeta)
    }
    video.addEventListener('loadedmetadata', onMeta, { once: true })
  })

  try {
    await video.play()
  } catch {
    // Autoplay can reject even when muted on some browsers — stream is live
  }

  // ---- Low-light aid (best effort) --------------------------------
  // Ask the camera for continuous exposure + extra compensation where the
  // browser supports it. Unsupported keys are simply ignored by the
  // browser; failures must never break the stream.
  try {
    const track = stream.getVideoTracks()[0]
    const lowLight = {
      advanced: [
        { exposureMode: 'continuous' },
        { exposureCompensation: 2 },
        { whiteBalanceMode: 'continuous' },
      ],
    } as unknown as MediaTrackConstraints
    await track.applyConstraints(lowLight)
  } catch {
    // device/browser doesn't support manual exposure tuning — ignore
  }

  return stream
}

export function stopCamera(stream: MediaStream | null, video?: HTMLVideoElement | null): void {
  stream?.getTracks().forEach((t) => t.stop())
  if (video && video.srcObject) video.srcObject = null
}

// ---------- Detection ---------------------------------------

function meanPoint(points: { x: number; y: number }[]): FacePoint {
  if (points.length === 0) return { x: 0, y: 0 }
  let x = 0
  let y = 0
  for (const p of points) {
    x += p.x
    y += p.y
  }
  return { x: x / points.length, y: y / points.length }
}

/** Nose tip = 68-point landmark #30 → 4th entry of getNose(). */
function noseTip(points: { x: number; y: number }[]): FacePoint {
  if (points.length >= 4) return points[3]
  return meanPoint(points)
}

function toFaceResult(res: {
  detection: { box: FaceBox; score: number }
  landmarks: {
    getNose: () => { x: number; y: number }[]
    getLeftEye: () => { x: number; y: number }[]
    getRightEye: () => { x: number; y: number }[]
  }
  descriptor: Float32Array
}): FaceResult {
  const nosePoints = res.landmarks.getNose()
  return {
    box: {
      x: res.detection.box.x,
      y: res.detection.box.y,
      width: res.detection.box.width,
      height: res.detection.box.height,
    },
    score: res.detection.score,
    descriptor: res.descriptor,
    nose: noseTip(nosePoints),
    leftEye: meanPoint(res.landmarks.getLeftEye()),
    rightEye: meanPoint(res.landmarks.getRightEye()),
  }
}

const tinyOpts = (faceapi: FaceApi, inputSize: number, scoreThreshold: number) =>
  new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold }) as unknown

type DetectInput = HTMLVideoElement | HTMLCanvasElement

export async function detectSingle(
  faceapi: FaceApi,
  input: DetectInput,
  inputSize = 320
): Promise<FaceResult | undefined> {
  const res = await faceapi
    .detectSingleFace(input, tinyOpts(faceapi, inputSize, 0.5))
    .withFaceLandmarks()
    .withFaceDescriptor()
  return res ? toFaceResult(res) : undefined
}

export async function detectAll(
  faceapi: FaceApi,
  input: DetectInput,
  inputSize = 256
): Promise<FaceResult[]> {
  const results = await faceapi
    .detectAllFaces(input, tinyOpts(faceapi, inputSize, 0.5))
    .withFaceLandmarks()
    .withFaceDescriptors()
  return results.map(toFaceResult)
}

// ---------- Low-light enhancement ----------------------------

/**
 * Frame luminance below this (0–255) counts as "dim" and triggers the
 * gamma boost. Tuned so a normal bright room (~150+) is never touched,
 * while a dim lecture hall (~60–95) gets a strong lift.
 */
const DIM_MEAN = 108
const TARGET_MEAN = 0.46 // post-gamma target luminance (0–1)
const GAMMA_MIN = 1
const GAMMA_MAX = 2.8

interface EnhanceResult {
  /** What to feed the detector — the video itself or an enhanced canvas. */
  source: HTMLVideoElement | HTMLCanvasElement
  /** True when the returned source is an enhanced (gamma-corrected) canvas. */
  enhanced: boolean
  /** Mean frame luminance 0–255 (before enhancement). */
  brightness: number
}

let sampleCanvas: HTMLCanvasElement | null = null
let enhanceCanvas: HTMLCanvasElement | null = null
const gammaLut = new Uint8Array(256)

/**
 * Adaptive low-light pipeline:
 *  1. Sample the frame cheaply (80×45) to get mean luminance.
 *  2. If the room is dim, compute a gamma that lifts the mean toward
 *     TARGET_MEAN, apply it through a 256-entry LUT on a full-frame canvas
 *     and run detection on THAT canvas (noise stays, shadows open up).
 *  3. Mirror the same lift onto the visible <video> via a CSS filter so
 *     the preview matches what the detector sees.
 *
 * The enhance canvas has the same pixel dimensions as the video, so face
 * box coordinates map identically for the overlay.
 */
export function enhanceForDetection(video: HTMLVideoElement): EnhanceResult {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh || video.readyState < 2) {
    return { source: video, enhanced: false, brightness: 255 }
  }

  // ---- 1. cheap luminance sample -------------------------------
  if (!sampleCanvas) sampleCanvas = document.createElement('canvas')
  const sc = sampleCanvas
  const sw = 80
  const sh = Math.max(1, Math.round((80 * vh) / vw))
  if (sc.width !== sw || sc.height !== sh) {
    sc.width = sw
    sc.height = sh
  }
  const sctx = sc.getContext('2d', { willReadFrequently: true })
  if (!sctx) return { source: video, enhanced: false, brightness: 255 }
  sctx.drawImage(video, 0, 0, sw, sh)
  let data: Uint8ClampedArray
  try {
    data = sctx.getImageData(0, 0, sw, sh).data
  } catch {
    return { source: video, enhanced: false, brightness: 255 }
  }
  let sum = 0
  const n = sw * sh
  for (let i = 0; i < data.length; i += 4) {
    // luma 601: 0.299R + 0.587G + 0.114B
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  const mean = sum / n

  if (mean >= DIM_MEAN) {
    // plenty of light — raw feed, clear any preview boost
    if (video.style.filter) video.style.filter = ''
    return { source: video, enhanced: false, brightness: mean }
  }

  // ---- 2. adaptive gamma through a LUT --------------------------
  const mean01 = Math.max(0.02, Math.min(0.9, mean / 255))
  const gamma = Math.max(
    GAMMA_MIN,
    Math.min(GAMMA_MAX, Math.log(TARGET_MEAN) / Math.log(mean01))
  )
  for (let v = 0; v < 256; v++) {
    gammaLut[v] = Math.round(255 * Math.pow(v / 255, 1 / gamma))
  }

  if (!enhanceCanvas) enhanceCanvas = document.createElement('canvas')
  const ec = enhanceCanvas
  if (ec.width !== vw || ec.height !== vh) {
    ec.width = vw
    ec.height = vh
  }
  const ectx = ec.getContext('2d', { willReadFrequently: true })
  if (!ectx) return { source: video, enhanced: false, brightness: mean }
  ectx.drawImage(video, 0, 0)
  const img = ectx.getImageData(0, 0, vw, vh)
  const px = img.data
  for (let i = 0; i < px.length; i += 4) {
    px[i] = gammaLut[px[i]]
    px[i + 1] = gammaLut[px[i + 1]]
    px[i + 2] = gammaLut[px[i + 2]]
  }
  ectx.putImageData(img, 0, 0)

  // ---- 3. preview boost so the operator sees the same thing -----
  const boost = Math.max(1, Math.min(2.3, Math.pow(TARGET_MEAN / mean01, 0.7)))
  video.style.filter = `brightness(${boost.toFixed(2)}) contrast(1.05)`

  return { source: ec, enhanced: true, brightness: mean }
}

/** True when the last enhanceForDetection call boosted the preview. */
export function clearPreviewBoost(video: HTMLVideoElement | null): void {
  if (video?.style.filter) video.style.filter = ''
}

// ---------- Liveness helper ---------------------------------

/**
 * Horizontal nose offset relative to the eye midpoint, normalised by
 * face-box width. ~0 = looking straight; positive = head turned to the
 * subject's LEFT (raw, unmirrored frame); negative = to their RIGHT.
 */
export function noseOffset(face: FaceResult): number {
  if (face.box.width <= 0) return 0
  const midX = (face.leftEye.x + face.rightEye.x) / 2
  return (face.nose.x - midX) / face.box.width
}

// ---------- Overlay drawing ---------------------------------

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.arcTo(x + w, y, x + w, y + radius, radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius)
  ctx.lineTo(x + radius, y + h)
  ctx.arcTo(x, y + h, x, y + h - radius, radius)
  ctx.lineTo(x, y + radius)
  ctx.arcTo(x, y, x + radius, y, radius)
  ctx.closePath()
}

/**
 * Draw face boxes + name chips over a live video.
 * Boxes are mapped through the same object-cover crop the video uses and
 * mirrored horizontally when the preview is mirrored (front camera).
 * Clears the canvas every frame.
 */
export function drawOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  faces: FaceResult[],
  matches: (FaceMatchInfo | null)[],
  opts: { mirror?: boolean } = {}
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  if (cw === 0 || ch === 0) return
  if (canvas.width !== cw) canvas.width = cw
  if (canvas.height !== ch) canvas.height = ch
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return

  // object-cover mapping: uniform scale + centring offsets
  const scale = Math.max(cw / vw, ch / vh)
  const offX = (cw - vw * scale) / 2
  const offY = (ch - vh * scale) / 2

  for (let i = 0; i < faces.length; i++) {
    const face = faces[i]
    const match = matches[i] ?? null

    let x = offX + face.box.x * scale
    const y = offY + face.box.y * scale
    const w = face.box.width * scale
    const h = face.box.height * scale
    if (opts.mirror) x = cw - x - w

    // clamp to canvas
    const cx = Math.max(2, x)
    const cy = Math.max(2, y)
    const cw2 = Math.min(w, cw - cx - 2)
    const ch2 = Math.min(h, ch - cy - 2)
    if (cw2 <= 4 || ch2 <= 4) continue

    ctx.lineWidth = 3
    ctx.strokeStyle = match ? '#10b981' : '#f59e0b'
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = 6
    roundedRect(ctx, cx, cy, cw2, ch2, 16)
    ctx.stroke()
    ctx.shadowBlur = 0

    if (match && match.name) {
      ctx.font = '600 13px ui-sans-serif, system-ui, -apple-system, sans-serif'
      const textW = ctx.measureText(match.name).width
      const chipW = textW + 18
      const chipH = 26
      let chipX = cx
      let chipY = cy - chipH - 8
      if (chipY < 2) chipY = cy + 6
      if (chipX + chipW > cw - 2) chipX = cw - chipW - 2

      ctx.fillStyle = match ? '#10b981' : '#f59e0b'
      roundedRect(ctx, chipX, chipY, chipW, chipH, 13)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.textBaseline = 'middle'
      ctx.fillText(match.name, chipX + 9, chipY + chipH / 2 + 1)
    }
  }
}
