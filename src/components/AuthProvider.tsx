'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { User } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { isSupabaseAuthConfigured } from '@/lib/supabase/config'

export type AuthUser = {
  id: string
  email: string | null
  displayName: string | null
  imageUrl: string | null
}

type AuthState = {
  configured: boolean
  loading: boolean
  user: AuthUser | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  configured: false,
  loading: false,
  user: null,
  refresh: async () => undefined,
  signOut: async () => undefined,
})

function metadata(user: User, key: string) {
  const value = (user.user_metadata as Record<string, unknown> | null | undefined)?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function authUser(user: User): AuthUser {
  const displayName = metadata(user, 'full_name')
    || metadata(user, 'name')
    || [metadata(user, 'first_name'), metadata(user, 'last_name')].filter(Boolean).join(' ')
    || null
  return {
    id: user.id,
    email: user.email ?? null,
    displayName,
    imageUrl: metadata(user, 'avatar_url') || metadata(user, 'picture'),
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseAuthConfigured()
  const router = useRouter()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(configured)

  const refresh = useCallback(async () => {
    if (!configured) return
    const supabase = getSupabaseBrowserClient()
    const { data, error } = await supabase.auth.getUser()
    setUser(error || !data.user ? null : authUser(data.user))
    setLoading(false)
  }, [configured])

  const signOut = useCallback(async () => {
    if (!configured) return
    await getSupabaseBrowserClient().auth.signOut()
    setUser(null)
    router.push('/app')
    router.refresh()
  }, [configured, router])

  useEffect(() => {
    if (!configured) return
    let active = true
    const supabase = getSupabaseBrowserClient()
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return
      setUser(error || !data.user ? null : authUser(data.user))
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? authUser(session.user) : null)
      setLoading(false)
      router.refresh()
    })
    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [configured, router])

  const value = useMemo<AuthState>(() => ({
    configured,
    loading,
    user,
    refresh,
    signOut,
  }), [configured, loading, refresh, signOut, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
