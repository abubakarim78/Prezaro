/* Rollmark service worker — offline-first app shell */
const VERSION = 'rollmark-v4'
const SHELL_CACHE = `${VERSION}-shell`
const STATIC_CACHE = `${VERSION}-static`

const SHELL_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
  '/vendor/face-api.js',
]

const MODEL_ASSETS = [
  '/models/tiny_face_detector_model-weights_manifest.json',
  '/models/tiny_face_detector_model.bin',
  '/models/face_landmark_68_model-weights_manifest.json',
  '/models/face_landmark_68_model.bin',
  '/models/face_recognition_model-weights_manifest.json',
  '/models/face_recognition_model.bin',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE)
      await Promise.allSettled(SHELL_ASSETS.map((a) => shell.add(a)))
      const models = await caches.open(STATIC_CACHE)
      await Promise.allSettled(MODEL_ASSETS.map((a) => models.add(a)))
      await self.skipWaiting()
    })()
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      )
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Never intercept API calls — the app queues writes itself.
  if (url.pathname.startsWith('/api/')) return

  // Face models + vendor lib: cache-first (they are immutable).
  if (url.pathname.startsWith('/models/') || url.pathname.startsWith('/vendor/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req)
        if (cached) return cached
        const res = await fetch(req)
        if (res.ok) {
          const cache = await caches.open(STATIC_CACHE)
          cache.put(req, res.clone())
        }
        return res
      })()
    )
    return
  }

  // Icons & manifest: cache-first.
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req)
        return cached || fetch(req)
      })()
    )
    return
  }

  // Navigations: network-first, fall back to cached shell for offline start.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req)
          const cache = await caches.open(SHELL_CACHE)
          cache.put('/', res.clone())
          return res
        } catch {
          const cached = await caches.match('/')
          return cached || new Response('Offline', { status: 503 })
        }
      })()
    )
    return
  }

  // Everything else (Next static assets): stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cached = await caches.match(req)
      const fetchPromise = fetch(req)
        .then((res) => {
          if (res.ok && (url.pathname.startsWith('/_next/') || url.pathname.startsWith('/images/'))) {
            caches.open(STATIC_CACHE).then((c) => c.put(req, res.clone()))
          }
          return res
        })
        .catch(() => cached)
      return cached || (await fetchPromise)
    })()
  )
})
