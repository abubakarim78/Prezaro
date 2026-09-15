'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Loader2, ScanFace } from 'lucide-react'
import { toast } from 'sonner'
import { api, ApiError, getErrorMessage, setAuthToken } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import type { LoginResponse } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginView() {
  const setUser = useAppStore((s) => s.setUser)
  const replace = useAppStore((s) => s.replace)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const em = email.trim()
    const pw = password
    if (loading) return
    if (!em || !pw) {
      setFormError('Enter your email and password to continue')
      return
    }
    setLoading(true)
    setFormError(null)
    try {
      const { user, token } = await api<LoginResponse>('/api/auth/login', {
        method: 'POST',
        body: { email: em, password: pw },
      })
      // Store the bearer token — cookies can be blocked in embedded contexts.
      if (token) setAuthToken(token)
      setUser(user)
      replace(user.onboarded ? 'home' : 'onboarding')
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setFormError('Invalid email or password')
      } else {
        toast.error(getErrorMessage(err))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-4 py-10">
      {/* Decorative emerald wash */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_-10%,rgba(16,185,129,0.16),transparent_65%)] dark:bg-[radial-gradient(90%_60%_at_50%_-10%,rgba(16,185,129,0.12),transparent_65%)]" />
        <div className="absolute inset-x-0 bottom-0 h-72 bg-[radial-gradient(70%_100%_at_50%_110%,rgba(16,185,129,0.10),transparent_70%)]" />
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
            <ScanFace className="h-8 w-8" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">ClassCheck</h1>
          <p className="mt-1 text-sm text-muted-foreground">Face attendance for lecture halls</p>
        </div>

        {/* Login card */}
        <div className="mt-7 rounded-2xl border bg-card p-6 shadow-sm">
          <form onSubmit={submit} noValidate className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
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
                  autoComplete="current-password"
                  placeholder="••••••••"
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
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
