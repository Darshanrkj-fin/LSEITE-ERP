import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { emailToUsername } from '../config/auth'

const AuthContext = createContext(null)

// profile = the public.users row (role, company_id) for the signed-in user.
// It's created automatically by the on_auth_user_created DB trigger, so we
// just need to fetch it once we have a session.
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data, error } = await supabase
      .from('users')
      .select('id, company_id, full_name, role, can_manage_users')
      .eq('id', userId)
      .single()
    if (error) {
      console.error('Failed to load user profile', error)
      setProfile(null)
      return
    }
    setProfile(data)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession)
      loadProfile(initialSession?.user?.id).finally(() => setLoading(false))
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      loadProfile(newSession?.user?.id)
    })

    return () => subscription.subscription.unsubscribe()
  }, [loadProfile])

  // No signUp — accounts are created by an admin directly in the Supabase
  // dashboard (see the note in supabase/schema.sql), not self-service.
  const signIn = (email, password) =>
    supabase.auth.signInWithPassword({ email, password })

  const signOut = () => supabase.auth.signOut()

  const value = {
    session,
    user: session?.user ?? null,
    // Derived from the fake internal email — nothing in the UI should ever
    // read session.user.email directly, since it's not a real address.
    username: emailToUsername(session?.user?.email),
    profile,
    loading,
    signIn,
    signOut,
    refreshProfile: () => loadProfile(session?.user?.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
