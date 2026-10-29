import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY não definidas no .env.local',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Cria uma instância do Supabase isolada (sem armazenar sessão no localStorage).
 * Permite cadastrar revendedores no Auth sem deslogar o Master conectado.
 */
export function criarClienteAuthIsolado() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
