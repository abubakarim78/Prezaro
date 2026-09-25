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
import { BrandLogo } from '@/components/brand/brand-logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { KeyRound, ShieldCheck, Ticket, UserPlus } from 'lucide-react'

type Mode = 'signin' | 'code' | 'signup'

interface InspectedCode {
  valid: boolean
  code: string
  role: string
  departmentName: string
  departmentCode: string
  institutionName: string
  designatedEmail?: string | null
  designatedName?: string | null
}

export default function LoginView() {
  const setUser = useAppStore((s) => s.setUser)
  const replace = useAppStore((s) => s.replace)
  const params = useAppStore((s) => s.params)

  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [inspected, setInspected] = useState<InspectedCode | null>(null)
  const [inspecting, setInspecting] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)

  // Check URL query param for invite code on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    const urlParams = new URLSearchParams(window.location.search)
    const urlCode = urlParams.get('code') || params?.code
    if (urlCode) {
      setAccessCode(urlCode.toUpperCase())
      setMode('code')
      void verifyCode(urlCode.toUpperCase())
    }
  }, [])

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

  const verifyCode = async (c: string) => {
    const clean = c.trim().toUpperCase()
    if (clean.length < 4) return
    setInspecting(true)
    setFormError(null)
    try {
      const data = await api<InspectedCode>('/api/auth/redeem-code', {
        method: 'POST',
        body: { action: 'inspect', code: clean },
      })
      setInspected(data)
      if (data.designatedEmail && !email) setEmail(data.designatedEmail)
      if (data.designatedName && !name) setName(data.designatedName)
      toast.success(`Verified: ${data.departmentName} (${data.institutionName})`)
    } catch (err) {
      setInspected(null)
      setFormError(getErrorMessage(err))
    } finally {
      setInspecting(false)
    }
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
    const code = accessCode.trim().toUpperCase()

    if (mode === 'code') {
      if (!code) {
        setFormError('Enter your department access code')
        return
      }
      if (!fullName || !em || !password) {
        setFormError('Complete your name, email and password to activate your access')
        return
      }
      if (password.length < 8) {
        setFormError('Password must be at least 8 characters')
        return
      }
    } else if (mode === 'signup') {
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
      if (mode === 'code') {
        const data = await api<LoginResponse>('/api/auth/redeem-code', {
          method: 'POST',
          body: {
            action: 'claim',
            code,
            name: fullName,
            email: em,
            password,
          },
        })
        toast.success(`Welcome to ${data.user.departmentName ?? 'your department'}!`)
        finish(data)
      } else if (mode === 'signup') {
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
        {/* Brand logo (adaptive light/dark) */}
        <div className="flex flex-col items-center text-center">
          <BrandLogo className="h-32 w-32 rounded-2xl overflow-hidden shadow-lg shadow-primary/20 border border-border/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            Face attendance for lecture halls
          </p>
        </div>

        {/* Auth card */}
        <div className="mt-7 rounded-2xl border bg-card p-6 shadow-sm">
          {/* Mode segmented tabs */}
          <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all',
                mode === 'signin'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <KeyRound className="h-3.5 w-3.5" />
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode('code')}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all',
                mode === 'code'
                  ? 'bg-card text-primary shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Ticket className="h-3.5 w-3.5" />
              Access Code
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all',
                mode === 'signup'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Register
            </button>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: mode === 'signup' ? 16 : -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: mode === 'signup' ? -16 : 16 }}
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
                {mode === 'code'
                  ? 'Join with Department Code'
                  : mode === 'signup'
                  ? 'Create your account'
                  : 'Welcome back'}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {mode === 'code'
                  ? 'Enter the access code generated by your Department Head.'
                  : mode === 'signup'
                  ? 'The first account created becomes the department admin.'
                  : 'Sign in to take today’s attendance.'}
              </p>

              <form onSubmit={submit} noValidate className="mt-5 space-y-4">
                {mode === 'code' && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label htmlFor="code" className="text-sm font-medium">
                        Access Code
                      </label>
                      <div className="flex gap-2">
                        <Input
                          id="code"
                          type="text"
                          autoCapitalize="characters"
                          placeholder="e.g. PREZ-AB12-CD34"
                          value={accessCode}
                          onChange={(e) => {
                            const val = e.target.value.toUpperCase()
                            setAccessCode(val)
                            if (formError) setFormError(null)
                            if (val.length >= 8) void verifyCode(val)
                          }}
                          className="h-11 font-mono tracking-wider font-semibold uppercase"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 shrink-0 font-medium"
                          onClick={() => void verifyCode(accessCode)}
                          disabled={inspecting || !accessCode.trim()}
                        >
                          {inspecting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
                        </Button>
                      </div>
                    </div>

                    {inspected && (
                      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-1 text-xs">
                        <div className="flex items-center justify-between font-semibold text-primary">
                          <span className="flex items-center gap-1.5">
                            <ShieldCheck className="h-4 w-4" />
                            {inspected.departmentName}
                          </span>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] uppercase">
                            {inspected.role}
                          </span>
                        </div>
                        <p className="text-muted-foreground">{inspected.institutionName}</p>
                        {inspected.designatedName && (
                          <p className="text-muted-foreground pt-1 border-t border-primary/10">
                            Designated for: <strong className="text-foreground">{inspected.designatedName}</strong>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {(mode === 'signup' || mode === 'code') && (
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
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      placeholder={mode === 'signin' ? '••••••••' : 'At least 8 characters'}
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
                      {mode === 'code'
                        ? 'Activating access…'
                        : mode === 'signup'
                        ? 'Creating account…'
                        : 'Signing in…'}
                    </>
                  ) : mode === 'code' ? (
                    'Activate Lecturer Access'
                  ) : mode === 'signup' ? (
                    'Create account'
                  ) : (
                    'Sign in'
                  )}
                </Button>
              </form>
            </motion.div>
          </AnimatePresence>

          <div className="mt-5 border-t pt-4 text-center text-sm">
            {mode === 'code' ? (
              <span className="text-muted-foreground">
                Already set up your password?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('signin')}
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Sign in here
                </button>
              </span>
            ) : mode === 'signup' ? (
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
                Have a department code?{' '}
                <button
                  type="button"
                  onClick={() => switchMode('code')}
                  className="font-semibold text-primary underline-offset-4 hover:underline"
                >
                  Join with Code
                </button>
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
