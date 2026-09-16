/**
 * PWA update plumbing.
 *
 * Rollmark's service worker (`public/sw.js`) calls `skipWaiting()` +
 * `clients.claim()`, so a newly deployed worker activates immediately —
 * but the page keeps running the old JS bundle until it reloads.
 * `watchForUpdates()` detects that moment and surfaces a persistent
 * "New version ready — Restart" toast so the user can pull the update
 * in one tap instead of waiting for the next launch.
 */

/** Shown once per page session — a reload resets it. */
let updatePromptShown = false

/** Explicit re-checks (tab refocus) are throttled; navigations check anyway. */
const RECHECK_THROTTLE_MS = 10 * 60 * 1000

export function watchForUpdates(onUpdateReady: () => void): () => void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {}
  }

  let disposed = false
  let unlistenVisibility: (() => void) | undefined
  let lastChecked = 0

  // Captured before any registration work: on the very first install this
  // page has no controller (nothing to update *from*), while on a genuine
  // update the old worker still controls the page.
  const wasControlled = Boolean(navigator.serviceWorker.controller)

  function listenForActivation(worker: ServiceWorker) {
    worker.addEventListener('statechange', () => {
      if (worker.state !== 'activated' || disposed) return
      if (wasControlled && !updatePromptShown) {
        updatePromptShown = true
        onUpdateReady()
      }
    })
  }

  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      if (disposed) return

      // An update may already be mid-flight (started before this page loaded).
      if (reg.installing) listenForActivation(reg.installing)

      reg.addEventListener('updatefound', () => {
        const worker = reg.installing
        if (worker) listenForActivation(worker)
      })

      // Navigation requests already trigger a browser-driven update check
      // (spec-throttled to ~24h). Re-check when the app returns to the
      // foreground so a lecturer who kept it open all class still gets
      // the prompt.
      const checkForUpdate = () => {
        if (document.visibilityState !== 'visible') return
        const now = Date.now()
        if (now - lastChecked < RECHECK_THROTTLE_MS) return
        lastChecked = now
        reg.update().catch(() => {})
      }
      document.addEventListener('visibilitychange', checkForUpdate)
      unlistenVisibility = () =>
        document.removeEventListener('visibilitychange', checkForUpdate)
    })
    .catch(() => {
      /* SW is optional — the app works without it. */
    })

  return () => {
    disposed = true
    unlistenVisibility?.()
  }
}
