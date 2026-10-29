import { supabase, criarClienteAuthIsolado } from './supabase'
import { useAuth } from '../contexts/AuthContext'
import { useCrmStore } from '../stores/useCrmStore'
import { isMasterUser } from './multiTenant'

export type NivelAcesso = 'Master' | 'Revendedor'

export interface Agente {
  id: string
  auth_user_id?: string | null
  nome: string
  email: string
  telefone?: string | null
  nivel_acesso: NivelAcesso
  role?: 'master' | 'reseller' | string
  creditos?: number | null
  precisa_trocar_senha?: boolean
  vencimento_licenca?: string | null
  data_vencimento?: string | null
  created_at?: string
}

/** Agente resolvido a partir do utilizador autenticado. */
export interface AgenteAtual {
  /** id na tabela `agentes` (null se o utilizador ainda não está cadastrado). */
  id: string | null
  nivel: NivelAcesso
  nome: string | null
  email: string | null
  telefone?: string | null
  precisa_trocar_senha?: boolean
}

/** Gera uma senha provisória aleatória e segura de 8 caracteres alfanuméricos. */
export function gerarSenhaProvisoria(tamanho = 8): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz#$@'
  let pass = ''
  const bytes = new Uint8Array(tamanho)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < tamanho; i++) {
    pass += chars[bytes[i] % chars.length]
  }
  return pass
}

/** Hook: devolve o agente logado e o estado de carregamento a partir do AuthContext global. */
export function useAgente() {
  const { usuario, loading } = useAuth()
  return {
    agente: usuario
      ? {
          id: usuario.id,
          nivel: usuario.nivel_acesso,
          nome: usuario.nome,
          email: usuario.email,
          telefone: usuario.telefone,
          precisa_trocar_senha: usuario.precisa_trocar_senha,
        }
      : null,
    loading,
  }
}

export async function listarAgentes(): Promise<{ agentes: Agente[]; error: string | null }> {
  const currentUser = useCrmStore.getState().user
  if (!isMasterUser(currentUser)) {
    return { agentes: [], error: 'Acesso negado: módulo exclusivo da administração Master.' }
  }

  const { data, error } = await supabase
    .from('agentes')
    .select('*')
    .order('nome', { ascending: true })
  return { agentes: (data ?? []) as Agente[], error: error?.message ?? null }
}

/**
 * Cria um novo revendedor/agente gerando credenciais no Supabase Auth
 * sem deslogar o Master atual (usando instância isolada).
 */
export async function criarAgenteComCredenciais(p: {
  nome: string
  email: string
  telefone?: string
  nivel_acesso: NivelAcesso
  senha?: string
}): Promise<{ senhaProvisoria: string | null; error: string | null }> {
  const currentUser = useCrmStore.getState().user
  if (!isMasterUser(currentUser)) {
    return {
      senhaProvisoria: null,
      error: 'Operação bloqueada: apenas a conta Master pode provisionar revendedores.',
    }
  }

  const emailNorm = p.email.trim().toLowerCase()
  const senhaProvisoria = p.senha?.trim() ? p.senha.trim() : gerarSenhaProvisoria(8)
  const roleMapeada = p.nivel_acesso === 'Master' ? 'master' : 'reseller'

  try {
    // 1. Cadastra no Supabase Auth usando cliente isolado
    const authClient = criarClienteAuthIsolado()
    const { data: signUpData, error: authErr } = await authClient.auth.signUp({
      email: emailNorm,
      password: senhaProvisoria,
      options: {
        data: {
          nome: p.nome.trim(),
          telefone: p.telefone?.trim() || null,
          role: roleMapeada,
          primeiro_acesso: true,
        },
      },
    })

    if (authErr && !authErr.message.toLowerCase().includes('already registered')) {
      return { senhaProvisoria: null, error: `Falha no Supabase Auth: ${authErr.message}` }
    }

    // 2. Insere os dados na tabela `agentes` vinculando auth_user_id quando disponível
    const baseInsert = {
      nome: p.nome.trim(),
      email: emailNorm,
      telefone: p.telefone?.trim() || null,
      nivel_acesso: p.nivel_acesso,
      precisa_trocar_senha: true,
    }

    const fullInsert: Record<string, unknown> = {
      ...baseInsert,
      role: roleMapeada,
      ...(signUpData?.user?.id ? { auth_user_id: signUpData.user.id } : {}),
    }

    let { error: dbErr } = await supabase.from('agentes').insert(fullInsert)
    if (
      dbErr &&
      (dbErr.message.toLowerCase().includes('auth_user_id') ||
        dbErr.message.toLowerCase().includes('role'))
    ) {
      const fb = await supabase.from('agentes').insert(baseInsert)
      dbErr = fb.error
    }

    if (dbErr) {
      return { senhaProvisoria: null, error: `Falha ao salvar dados do agente: ${dbErr.message}` }
    }

    return { senhaProvisoria, error: null }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { senhaProvisoria: null, error: msg }
  }
}
