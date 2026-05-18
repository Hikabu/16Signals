'use client'

import { useEffect } from 'react'
import { rehydrateAuth } from '@/lib/api'

/**
 * Rehydrates Zustand auth state from the server session on app mount.
 *
 * After a hard-refresh Zustand (in-memory) is empty, but valid HttpOnly cookies
 * may still exist. This component calls GET /me/user once on mount, and if the
 * request succeeds it populates useAuthStore so the rest of the app sees the
 * correct session. No loading UI is shown, rehydration is invisible to the user.
 *
 * Pages that require auth are already protected by middleware, so unauthenticated
 * access is redirected server-side before this component ever runs.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    rehydrateAuth().catch(() => {
      // Silently ignore, user simply isn't logged in
    })
  }, [])

  return <>{children}</>
}
