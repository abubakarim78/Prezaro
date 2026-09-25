'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Download, PlusSquare, Share, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandIcon } from '@/components/brand/brand-logo'
import { useAppStore } from '@/lib/store'

const DISMISS_STORAGE_KEY = 'prezaro_pwa_prompt_dismissed_v1'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPwaPrompt() {
  const currentView = useAppStore((s) => s.view)
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null)
  const [open, setOpen] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 1. Check if already installed / running in standalone window
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-expect-error - iOS Safari legacy property
      window.navigator.standalone === true

    // defer state updates out of the synchronous effect body (react-hooks rule)
    void Promise.resolve().then(() => setIsStandalone(standalone))
    if (standalone) return

    // 2. Check if previously dismissed by user
    try {
      const dismissed = localStorage.getItem(DISMISS_STORAGE_KEY)
      if (dismissed === '1') return
    } catch {
      // ignore
    }

    // 3. Detect iOS device
    const userAgent = window.navigator.userAgent.toLowerCase()
    const ios = /iphone|ipad|ipod/.test(userAgent) && !('MSStream' in window)
    void Promise.resolve().then(() => setIsIOS(ios))

    // 4. Handle standard Chromium beforeinstallprompt event
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault()
      setInstallEvt(e as BeforeInstallPromptEvent)
      // Slight delay so the prompt surfaces smoothly after initial render
      setTimeout(() => setOpen(true), 1200)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall)

    // 5. On iOS Safari (which doesn't support beforeinstallprompt), show manual guide after 2s
    let iosTimer: ReturnType<typeof setTimeout> | null = null
    if (ios) {
      iosTimer = setTimeout(() => {
        setOpen(true)
      }, 2000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall)
      if (iosTimer) clearTimeout(iosTimer)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!installEvt) return
    try {
      await installEvt.prompt()
      const choice = await installEvt.userChoice
      if (choice.outcome === 'accepted') {
        dismiss()
      }
    } catch {
      // ignore
    }
  }

  const dismiss = () => {
    setOpen(false)
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, '1')
    } catch {
      // ignore
    }
  }

  // Never interrupt active camera scan view or render if already standalone
  if (isStandalone || !open || currentView === 'scan') {
    return null
  }

  return (
    <aside aria-label="Install Prezaro application prompt">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.96 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          className="fixed bottom-4 inset-x-4 z-50 mx-auto max-w-md rounded-2xl border border-primary/25 bg-card/95 p-4 text-card-foreground shadow-2xl shadow-primary/15 backdrop-blur-md sm:bottom-6 sm:p-5"
        >
          {/* Header row */}
          <div className="flex items-start gap-3">
            <BrandIcon className="h-11 w-11 shrink-0 rounded-xl shadow-md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-bold tracking-tight">Install Prezaro App</h2>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  <Sparkles className="h-3 w-3" /> PWA
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Add to your home screen for quick 1-tap access, offline attendance scanning, and instant lecture alerts.
              </p>
            </div>
            <button
              onClick={dismiss}
              className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="Dismiss install prompt"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* iOS Safari instructions */}
          {isIOS ? (
            <div className="mt-3.5 space-y-2 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
              <p className="font-semibold text-foreground">How to install on iPhone/iPad:</p>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-background border text-[11px] font-bold">1</span>
                <span>Tap the <strong className="text-foreground">Share</strong> icon <Share className="inline h-3.5 w-3.5 text-primary align-text-bottom" /> in Safari&apos;s menu bar.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-background border text-[11px] font-bold">2</span>
                <span>Scroll down and select <strong className="text-foreground">Add to Home Screen</strong> <PlusSquare className="inline h-3.5 w-3.5 text-primary align-text-bottom" />.</span>
              </div>
              <Button size="sm" variant="outline" className="mt-2 w-full h-9 text-xs" onClick={dismiss}>
                Got it, thanks
              </Button>
            </div>
          ) : (
            /* Android / Chrome / Edge native install button */
            <div className="mt-4 flex items-center gap-2">
              <Button
                size="sm"
                className="flex-1 h-10 gap-2 font-semibold shadow-sm"
                onClick={handleInstallClick}
                disabled={!installEvt}
              >
                <Download className="h-4 w-4" />
                Install App
              </Button>
              <Button size="sm" variant="ghost" className="h-10 text-xs text-muted-foreground" onClick={dismiss}>
                Not now
              </Button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </aside>
  )
}
