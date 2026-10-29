import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { clearStore } from '../stores/useCrmStore'

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw error
  return data.session
}

/** Observa mudanças de sessão. Retorna a função para cancelar a inscrição. */
export function onAuthChange(callback: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session)
  })
  return () => data.subscription.unsubscribe()
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export interface SignUpMetadata {
  nome: string
  whatsapp: string
}

export async function signUp(email: string, password: string, metadata?: SignUpMetadata) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: metadata },
  })
  if (error) throw error
  return data
}

export async function signOut() {
  clearStore()
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}
