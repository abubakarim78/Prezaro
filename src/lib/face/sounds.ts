// ============================================================
// Prezaro — Enrollment capture sounds
// Tiny Web Audio synth (no asset files): works offline, adds
// zero download weight, and can't 404. The AudioContext is
// created lazily and "unlocked" from the Continue-to-capture
// tap (mobile browsers require a user gesture before audio
// is allowed to play).
// ============================================================

let ctx: AudioContext | null = null

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext }

function ensureCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/**
 * Call from a real user gesture (the "Continue to capture" tap) so
 * mobile browsers whitelist audio for this page. Plays a silent
 * one-frame buffer for older iOS versions that need it.
 */
export function unlockCaptureAudio(): void {
  const c = ensureCtx()
  if (!c) return
  try {
    const buf = c.createBuffer(1, 1, 22050)
    const src = c.createBufferSource()
    src.buffer = buf
    src.connect(c.destination)
    src.start(0)
  } catch {
    // audio is best-effort — never block capture
  }
}

function tone(
  freq: number,
  delay: number,
  dur: number,
  opts: { type?: OscillatorType; gain?: number } = {}
): void {
  const c = ctx
  if (!c) return
  try {
    const t0 = c.currentTime + delay
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = opts.type ?? 'sine'
    osc.frequency.setValueAtTime(freq, t0)
    const vol = opts.gain ?? 0.14
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g)
    g.connect(c.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  } catch {
    // audio is best-effort — never block capture
  }
}

/** Soft blip when the camera (re)acquires a face — "we see you". */
export function playFaceDetected(): void {
  ensureCtx()
  tone(660, 0, 0.09, { gain: 0.07 })
}

/** Two-note ding when a pose is captured — "got it, next pose". */
export function playPoseCaptured(): void {
  ensureCtx()
  tone(880, 0, 0.12, { type: 'triangle', gain: 0.14 })
  tone(1318.51, 0.1, 0.18, { type: 'triangle', gain: 0.14 })
}

/** Short rising arpeggio when all poses are done — enrollment complete. */
export function playAllDone(): void {
  ensureCtx()
  tone(523.25, 0, 0.14, { gain: 0.15 })
  tone(659.25, 0.11, 0.14, { gain: 0.15 })
  tone(783.99, 0.22, 0.14, { gain: 0.15 })
  tone(1046.5, 0.33, 0.22, { gain: 0.15 })
}
