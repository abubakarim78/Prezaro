/**
 * PWA update plumbing.
 *
 * Prezaro's service worker (`public/sw.js`) calls `skipWaiting()` +
 * `clients.claim()`, so a newly deployed worker activates immediately —
 * but the page keeps running the old JS bundle until it reloads.
 * `watchForUpdates()` surfaces a persistent "New version ready — Restart"
 * toast so the user can pull the update in one tap.
 *
 * A toast is detected through three paths, because each alone misses
 * common real-world flows on phones:
 *
 *  1. Mid-session activation — a new worker activates while this page is
 *     already open (deploy happened while the app was running).
 *  2. Boot handshake — the controlling worker reports its VERSION and it
 *     differs from the last one this device recorded. Covers deploys that
 *     landed while the app was closed, where the new worker can finish
 *     installing + activating *before* this page even mounts, so no
 *     activation event would ever be observed.
 *  3. Explicit re-checks — `registration.update()` on boot, on focus and
 *     on visibility change, plus a slow poll while visible. Browsers only
 *     check for a new worker on real navigations (spec-throttled to ~24h)
 *     and installed PWAs frequently resume without navigating at all.
 */

/** Shown once per page session — a reload resets it. */
let updatePromptShown = false

/** Explicit re-checks (focus / visibility / poll) are throttled. */
const RECHECK_THROTTLE_MS = 60 * 1000

/** How often a kept-open app polls for a new worker while visible. */
const POLL_INTERVAL_MS = 4 * 60 * 1000

/** localStorage: last service-worker version this device has run. */
const VERSION_KEY = 'prezaro.swVersion.v2'

/** sessionStorage: set when an update toast fires; the next boot (the
 *  reload after "Restart") records the new version instead of re-prompting.
 *  Cleared automatically when the app is fully closed, so a user who
 *  dismisses the toast and never restarts gets prompted again next launch. */
const RESTART_FLAG_KEY = 'prezaro.swUpdateSeen.v2'

function readVersion(): string | null {
  try {
    return window.localStorage.getItem(VERSION_KEY)
  } catch {
    return null
  }
}

function writeVersion(version: string): void {
  try {
    window.localStorage.setItem(VERSION_KEY, version)
  } catch {
    /* storage unavailable (private mode) — handshake simply won't cache */
  }
}

function readRestartFlag(): boolean {
  try {
    return window.sessionStorage.getItem(RESTART_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

function writeRestartFlag(value: boolean): void {
  try {
    if (value) window.sessionStorage.setItem(RESTART_FLAG_KEY, '1')
    else window.sessionStorage.removeItem(RESTART_FLAG_KEY)
  } catch {
    /* ignore */
  }
}

/** Ask a service worker for its VERSION (sw.js answers GET_VERSION). */
function askWorkerVersion(worker: ServiceWorker): Promise<string | null> {
  return new Promise((resolve) => {
    const channel = new MessageChannel()
    const timer = setTimeout(() => {
      channel.port1.onmessage = null
      resolve(null)
    }, 2500)
    channel.port1.onmessage = (event: MessageEvent) => {
      clearTimeout(timer)
      const version = (event.data as { version?: unknown } | null)?.version
      resolve(typeof version === 'string' ? version : null)
    }
    try {
      worker.postMessage({ type: 'GET_VERSION' }, [channel.port2])
    } catch {
      clearTimeout(timer)
      resolve(null)
    }
  })
}

export function watchForUpdates(onUpdateReady: () => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {}
  }

  let disposed = false
  let lastChecked = 0
  const cleanups: Array<() => void> = []

  const fireOnce = () => {
    if (disposed || updatePromptShown) return
    updatePromptShown = true
    writeRestartFlag(true)
    onUpdateReady()
  }

  // Captured before any registration work: on the very first install this
  // page has no controller (nothing to update *from*), while on a genuine
  // update the old worker still controls the page.
  const wasControlled = Boolean(navigator.serviceWorker.controller)

  function listenForActivation(worker: ServiceWorker) {
    // The worker may already be active by the time we attach (raced).
    if (worker.state === 'activated') {
      if (wasControlled) fireOnce()
      return
    }
    worker.addEventListener('statechange', () => {
      if (disposed || worker.state !== 'activated') return
      if (wasControlled) fireOnce()
    })
  }

  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      if (disposed) return

      // Path 1: an update already mid-flight (started before this page
      // loaded) plus any future one found while the page stays open.
      if (reg.installing) listenForActivation(reg.installing)
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing
        if (worker) listenForActivation(worker)
      })

      // A worker already waiting means an update is fully downloaded but
      // has not taken over yet — the user can restart into it right now.
      if (reg.waiting && navigator.serviceWorker.controller) fireOnce()

      // Path 2: boot handshake with the controlling worker.
      const controller = navigator.serviceWorker.controller
      if (controller) {
        void askWorkerVersion(controller).then((version) => {
          if (disposed || !version) return
          const known = readVersion()
          if (!known) {
            // First time this device reports a version — record baseline.
            writeVersion(version)
            writeRestartFlag(false)
            return
          }
          if (known === version) {
            // Same version as recorded — drop any stale restart flag so a
            // future publish is never swallowed by it.
            writeRestartFlag(false)
            return
          }
          if (readRestartFlag()) {
            // This boot is the reload after a "Restart" tap — record the
            // new version silently instead of prompting again.
            writeVersion(version)
            writeRestartFlag(false)
            return
          }
          // New worker took over while the app was closed — prompt now.
          fireOnce()
        })
      }

      // Path 3: explicit re-checks, bypassing the browser's throttled
      // navigation-only checks.
      const checkForUpdate = () => {
        if (disposed || document.visibilityState !== 'visible') return
        const now = Date.now()
        if (now - lastChecked < RECHECK_THROTTLE_MS) return
        lastChecked = now
        reg.update().catch(() => {})
      }
      checkForUpdate() // boot check — catches publishes missed while closed
      document.addEventListener('visibilitychange', checkForUpdate)
      window.addEventListener('focus', checkForUpdate)
      const poll = setInterval(checkForUpdate, POLL_INTERVAL_MS)
      cleanups.push(() => {
        document.removeEventListener('visibilitychange', checkForUpdate)
        window.removeEventListener('focus', checkForUpdate)
        clearInterval(poll)
      })
    })
    .catch(() => {
      /* SW is optional — the app works without it. */
    })

  return () => {
    disposed = true
    for (const fn of cleanups) fn()
  }
}
