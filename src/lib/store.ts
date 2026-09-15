// ============================================================
// ClassCheck — App store (zustand)
// Lightweight view-router + app state. The whole app is a
// single-route PWA; `view` drives which screen renders.
// ============================================================

import { create } from 'zustand'
import type { SessionMode, User } from './types'

export type ViewName =
  | 'login'
  | 'onboarding'
  | 'home'
  | 'students'
  | 'student'
  | 'enroll'
  | 'scan'
  | 'review'
  | 'sessions'
  | 'session'
  | 'reports'
  | 'admin'
  | 'settings'

interface OpenSessionRef {
  id: string
  courseId: string
  courseCode: string
  mode: SessionMode
}

interface AppState {
  booted: boolean
  user: User | null
  view: ViewName
  params: Record<string, string>
  history: ViewName[]
  online: boolean
  pendingSync: number
  openSession: OpenSessionRef | null

  setBooted: (v: boolean) => void
  setUser: (u: User | null) => void
  navigate: (view: ViewName, params?: Record<string, string>) => void
  replace: (view: ViewName, params?: Record<string, string>) => void
  back: () => void
  setOnline: (v: boolean) => void
  setPendingSync: (n: number) => void
  setOpenSession: (s: OpenSessionRef | null) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  booted: false,
  user: null,
  view: 'login',
  params: {},
  history: [],
  online: true,
  pendingSync: 0,
  openSession: null,

  setBooted: (v) => set({ booted: v }),
  setUser: (u) => set({ user: u }),

  navigate: (view, params = {}) =>
    set((s) => ({ view, params, history: [...s.history, s.view].slice(-20) })),

  replace: (view, params = {}) => set({ view, params }),

  back: () => {
    const { history } = get()
    if (history.length > 0) {
      const prev = history[history.length - 1]
      set({ view: prev, params: {}, history: history.slice(0, -1) })
    } else {
      set({ view: 'home', params: {} })
    }
  },

  setOnline: (v) => set({ online: v }),
  setPendingSync: (n) => set({ pendingSync: n }),
  setOpenSession: (s) => set({ openSession: s }),
}))
