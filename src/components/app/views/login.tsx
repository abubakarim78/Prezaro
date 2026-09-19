'use client'

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Eye, EyeOff, Loader2, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError, OfflineError, getErrorMessage, setAuthToken } from '@/lib/api'
import { writeCachedUser } from '@/lib/session-cache'
import { useAppStore } from '@/lib/store'
import type { LoginResponse } from '@/lib/types'
import { FaceScanMark } from '@/components/brand/face-scan-mark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Mode = 'signin' | 'signup'

export default function LoginView() {
  const setUser = useAppStore((s) => s.setUser)
  const replace = useAppStore((s) => s.replace)

  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)

  // Reflect connectivity so users understand why sign-in can fail.
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine)
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
    }
  }, [])

  const switchMode = (next: Mode) => {
    setMode(next)
    setFormError(null)
  }

  const finish = (data: LoginResponse) => {
    // Store the bearer token — cookies can be blocked in embedded contexts.
    if (data.token) setAuthToken(data.token)
    // Remember the profile so an offline PWA launch can restore the session.
    writeCachedUser(data.user)
    setUser(data.user)
    replace(data.user.onboarded ? 'home' : 'onboarding')
  }

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (loading) return
    const em = email.trim()
    const fullName = name.trim()

    if (mode === 'signup') {
      if (!fullName || !em || !password) {
        setFormError('Fill in your name, email and a password to continue')
        return
      }
      if (password.length < 8) {
        setFormError('Password must be at least 8 characters')
        return
      }
    } else if (!em || !password) {
      setFormError('Enter your email and password to continue')
      return
    }

    setLoading(true)
    setFormError(null)
    try {
      if (mode === 'signup') {
        const data = await api<LoginResponse>('/api/auth/register', {
          method: 'POST',
          body: { name: fullName, email: em, password },
        })
        toast.success('Account created — a confirmation email is on its way')
        finish(data)
      } else {
        const data = await api<LoginResponse>('/api/auth/login', {
          method: 'POST',
          body: { email: em, password },
        })
        finish(data)
      }
    } catch (err) {
      if (err instanceof OfflineError) {
        setFormError(
          'You are offline — signing in needs an internet connection. If you have signed in on this device before, just reopen the app and your saved session will work offline.'
        )
      } else if (err instanceof ApiError && (err.status === 401 || err.status === 409)) {
        setFormError(err.message)
      } else if (err instanceof ApiError && err.status === 400) {
        setFormError(err.message)
      } else {
        toast.error(getErrorMessage(err))
      }
    } finally {
      setLoading(false)
    }
  }

  const isSignup = mode === 'signup'

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Decorative brand wash */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_-10%,rgba(86,112,49,0.15),transparent_65%)] dark:bg-[radial-gradient(90%_60%_at_50%_-10%,rgba(148,181,99,0.16),transparent_65%)]" />
        <div className="absolute inset-x-0 bottom-0 h-72 bg-[radial-gradient(70%_100%_at_50%_110%,rgba(86,112,49,0.1),transparent_70%)]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="relative w-full max-w-sm"
      >
        {/* Glyph + wordmark */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <FaceScanMark className="h-9 w-9" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Prezaro</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Face attendance for lecture halls
          </p>
        </div>

        {/* Auth card */}
        <div className="mt-7 rounded-2xl border bg-card p-6 shadow-sm">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: isSignup ? 16 : -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: isSignup ? -16 : 16 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {offline && (
                <div
                  className="mb-4 flex items-start gap-2 rounded-lg border border-amber-600/40 bg-amber-500/10 px-3 py-2.5 text-sm"
                  role="status"
                >
                  <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-amber-700 dark:text-amber-400">
                    You are offline. If you have signed in on this device before,
                    reopen the app — your saved session works without internet.
                  </p>
                </div>
              )}

              <h2 className="text-lg font-semibold tracking-tight">
                {isSignup ? 'Create your account' : 'Welcome back'}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {isSignup
                  ? 'The first account created becomes the department admin.'
                  : 'Sign in to take today’s attendance.'}
              </p>

              <form onSubmit={submit} noValidate className="mt-5 space-y-4">
                {isSignup && (
                  <div className="space-y-1.5">
                    <label htmlFor="name" className="text-sm font-medium">
                      Full name
                    </label>
                    <Input
                      id="name"
                      type="text"
                      autoComplete="name"
                      placeholder="Dr. Ama Mensah"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value)
                        if (formError) setFormError(null)
                      }}
                      className="h-11"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="email" className="text-sm font-medium">
                    Email
                  </label>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@university.edu"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (formError) setFormError(null)
                    }}
                    className="h-11"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="password" className="text-sm font-medium">
                    Password
                  </label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPw ? 'text' : 'password'}
                      autoComplete={isSignup ? 'new-password' : 'current-password'}
                      placeholder={isSignup ? 'At least 8 characters' : '••••••••'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value)
                        if (formError) setFormError(null)
                      }}
                      className="h-11 pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      tabIndex={-1}
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {formError && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-sm font-medium text-destructive"
                    role="alert"
                  >
                    {formError}
                  </motion.p>
                )}

                <Button type="submit" className="h-12 w-full text-[15px]" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {isSignup ? 'Creating account…' : 'Signing in…'}
                    </>
                  ) : isSignup ? (
                    'Create account'
                  ) : (
                    'Sign in'
                  )}
                </Button>
              </form>
            </motion.div>
          </AnimatePresence>

          <div className="mt-5 border-t pt-4 text-center text-sm">
            {isSignup ? (
              <span className="text-muted-foreground">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Sign in
                </button>
              </span>
            ) : (
              <span className="text-muted-foreground">
                New to Prezaro?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signup')}
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Create an account
                </button>
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
