import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getSession, onAuthChange, signIn as authSignIn, signOut as authSignOut } from '../lib/auth'
import { useCrmStore, type CrmRole } from '../stores/useCrmStore'

export type NivelAcesso = 'Master' | 'Revendedor'

export interface UsuarioAtivo {
  id: string // ID do agente/parceiro (usado como reseller_id / agente_id)
  authId?: string // ID de auth.users do Supabase (auth.uid())
  nome: string
  email: string
  telefone?: string | null
  nivel_acesso: NivelAcesso
  role: CrmRole
  precisa_trocar_senha: boolean
  creditos?: number | null
}

interface AuthContextType {
  usuario: UsuarioAtivo | null
  session: Session | null
  loading: boolean
  login: (email: string, pass: string) => Promise<UsuarioAtivo>
  logout: () => Promise<void>
  refreshUsuario: () => Promise<UsuarioAtivo | null>
  recarregarCreditos: () => Promise<number>
  definirSenhaDefinitiva: (novaSenha: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * Consulta a tabela `agentes` para o utilizador autenticado.
 * - O nível de acesso (`Master` vs `Revendedor`) deriva exclusivamente do registo no banco (`agentes`),
 *   nunca confiando em `user_metadata` editável pelo cliente para elevação de privilégio.
 * - Fail-closed: qualquer conta não reconhecida como Master recebe obrigatoriamente `role: 'reseller'`.
 */
async function buscarOuCriarAgente(
  email: string,
  authUserId: string,
  userMetadata?: Record<string, unknown>
): Promise<UsuarioAtivo> {
  const emailNorm = email.trim().toLowerCase()

  // 1. Procura agente cadastrado por e-mail
  const { data: agenteByEmail, error: findErr } = await supabase
    .from('agentes')
    .select('id, nome, email, telefone, nivel_acesso, precisa_trocar_senha, creditos')
    .ilike('email', emailNorm)
    .maybeSingle()

  const agente = agenteByEmail && !findErr ? agenteByEmail : null

  if (agente) {
    // Vincula silenciosamente auth_user_id caso a coluna exista no banco e ainda esteja nula
    if (authUserId) {
      void Promise.resolve(
        supabase
          .from('agentes')
          .update({ auth_user_id: authUserId })
          .eq('id', agente.id)
          .is('auth_user_id', null)
      ).catch(() => {})
    }

    const precisaTrocar =
      userMetadata?.primeiro_acesso === false
        ? false
        : agente.precisa_trocar_senha === true || userMetadata?.primeiro_acesso === true

    const dbNivelNorm = String(agente.nivel_acesso || '').trim().toLowerCase()
    const isMaster = dbNivelNorm === 'master'
    const nivel: NivelAcesso = isMaster ? 'Master' : 'Revendedor'
    const role: CrmRole = isMaster ? 'master' : 'reseller'
    const creditos =
      typeof agente.creditos === 'number' ? agente.creditos : Number(agente.creditos ?? 0)

    return {
      id: agente.id,
      authId: authUserId,
      nome: agente.nome,
      email: agente.email,
      telefone: agente.telefone ?? null,
      nivel_acesso: nivel,
      role,
      precisa_trocar_senha: Boolean(precisaTrocar),
      creditos,
    }
  }

  // 2. Caso não exista registo visível em `agentes`, fail-closed estrito para Revendedor ('reseller')
  const nomeFinal = String(userMetadata?.nome ?? '').trim() || emailNorm.split('@')[0]
  const telefoneFinal = String(userMetadata?.telefone ?? '').trim() || null

  const { data: novoAgente, error: insErr } = await supabase
    .from('agentes')
    .insert({
      nome: nomeFinal,
      email: emailNorm,
      telefone: telefoneFinal,
      nivel_acesso: 'Revendedor',
      precisa_trocar_senha: Boolean(userMetadata?.primeiro_acesso),
    })
    .select('id, nome, email, telefone, nivel_acesso, precisa_trocar_senha, creditos')
    .single()

  if (novoAgente && !insErr) {
    const isMaster = String(novoAgente.nivel_acesso || '').trim().toLowerCase() === 'master'
    return {
      id: novoAgente.id,
      authId: authUserId,
      nome: novoAgente.nome,
      email: novoAgente.email,
      telefone: novoAgente.telefone ?? null,
      nivel_acesso: isMaster ? 'Master' : 'Revendedor',
      role: isMaster ? 'master' : 'reseller',
      precisa_trocar_senha: Boolean(novoAgente.precisa_trocar_senha),
      creditos: Number(novoAgente.creditos ?? 0),
    }
  }

  // 3. Fallback de contingência fail-closed (NUNCA concede perfil Master em caso de falha/bloqueio RLS)
  return {
    id: authUserId,
    authId: authUserId,
    nome: nomeFinal,
    email: emailNorm,
    telefone: telefoneFinal,
    nivel_acesso: 'Revendedor',
    role: 'reseller',
    precisa_trocar_senha: Boolean(userMetadata?.primeiro_acesso),
    creditos: 0,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [usuario, setUsuario] = useState<UsuarioAtivo | null>(null)
  const [loading, setLoading] = useState(true)

  async function sincronizarUsuario(currentSession: Session | null): Promise<UsuarioAtivo | null> {
    if (!currentSession?.user?.email) {
      setUsuario(null)
      useCrmStore.getState().setUser(null)
      return null
    }

    try {
      const email = currentSession.user.email
      const authUserId = currentSession.user.id
      const metadata = currentSession.user.user_metadata as Record<string, unknown> | undefined
      const agente = await buscarOuCriarAgente(email, authUserId, metadata)
      agente.authId = authUserId
      setUsuario(agente)

      // Sincroniza role ('master' | 'reseller'), ID de parceiro e créditos no Zustand
      useCrmStore.getState().setUser({
        id: agente.id,
        authId: authUserId,
        email: agente.email,
        nome: agente.nome,
        role: agente.role,
        creditos: agente.creditos ?? 0,
      })
      useCrmStore.getState().setCreditos(agente.creditos ?? 0)
      void useCrmStore.getState().carregarCreditos()

      return agente
    } catch (err) {
      console.error('Erro ao sincronizar agente (aplicando fail-closed reseller):', err)
      const email = currentSession.user.email
      const authUserId = currentSession.user.id

      // Fail-closed obrigatório: erros de rede/banco nunca escalam privilégio para Master
      const fallback: UsuarioAtivo = {
        id: authUserId,
        authId: authUserId,
        nome: email.split('@')[0],
        email,
        nivel_acesso: 'Revendedor',
        role: 'reseller',
        precisa_trocar_senha: false,
        creditos: 0,
      }
      setUsuario(fallback)
      useCrmStore.getState().setUser({
        id: fallback.id,
        authId: authUserId,
        email: fallback.email,
        nome: fallback.nome,
        role: 'reseller',
        creditos: 0,
      })
      useCrmStore.getState().setCreditos(0)
      return fallback
    }
  }

  useEffect(() => {
    let alive = true

    getSession()
      .then(async (sess) => {
        if (!alive) return
        setSession(sess)
        if (sess) {
          await sincronizarUsuario(sess)
        }
      })
      .catch((err) => {
        console.error('Falha ao obter sessão inicial:', err)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    const unsubscribe = onAuthChange(async (newSession) => {
      // Sanitização absoluta de estado na troca de sessão (Prevenção de Espelhamento entre parceiros)
      useCrmStore.getState().clearStore()
      setSession(newSession)
      if (newSession) {
        await sincronizarUsuario(newSession)
      } else {
        setUsuario(null)
      }
      setLoading(false)
    })

    return () => {
      alive = false
      unsubscribe()
    }
  }, [])

  async function login(email: string, pass: string): Promise<UsuarioAtivo> {
    setLoading(true)
    try {
      const res = await authSignIn(email, pass)
      const sess = res.session
      useCrmStore.getState().clearStore()
      setSession(sess)
      const u = await sincronizarUsuario(sess)
      if (!u) throw new Error('Não foi possível carregar os dados do agente.')
      return u
    } finally {
      setLoading(false)
    }
  }

  async function logout(): Promise<void> {
    setLoading(true)
    try {
      useCrmStore.getState().clearStore()
      await authSignOut()
      setSession(null)
      setUsuario(null)
    } finally {
      setLoading(false)
    }
  }

  async function refreshUsuario(): Promise<UsuarioAtivo | null> {
    return sincronizarUsuario(session)
  }

  async function recarregarCreditos(): Promise<number> {
    const agenteId = usuario?.id
    if (!agenteId) return 0
    try {
      const { data, error } = await supabase
        .from('agentes')
        .select('creditos')
        .eq('id', agenteId)
        .maybeSingle()
      if (!error && data) {
        const saldo = Number(data.creditos ?? 0)
        useCrmStore.getState().setCreditos(saldo)
        setUsuario((prev) => (prev ? { ...prev, creditos: saldo } : null))
        return saldo
      }
    } catch (err) {
      console.warn('Falha ao recarregar créditos do agente:', err)
    }
    return usuario?.creditos ?? 0
  }

  async function definirSenhaDefinitiva(novaSenha: string): Promise<void> {
    const targetId = usuario?.id
    const targetEmail =
      usuario?.email ||
      session?.user?.email ||
      (await supabase.auth.getUser()).data.user?.email

    // 1. Atualiza na tabela `agentes` restrito ao próprio registo
    if (targetId) {
      try {
        await supabase
          .from('agentes')
          .update({ precisa_trocar_senha: false })
          .eq('id', targetId)
      } catch (err) {
        console.warn('Erro ao atualizar flag precisa_trocar_senha na tabela agentes:', err)
      }
    } else if (targetEmail) {
      try {
        await supabase
          .from('agentes')
          .update({ precisa_trocar_senha: false })
          .ilike('email', targetEmail.trim().toLowerCase())
      } catch (err) {
        console.warn('Erro ao atualizar flag precisa_trocar_senha na tabela agentes:', err)
      }
    }

    // 2. Executa await supabase.auth.updateUser({ password })
    const { error: updAuthErr } = await supabase.auth.updateUser({
      password: novaSenha,
      data: { primeiro_acesso: false },
    })
    if (updAuthErr) throw updAuthErr

    // 3. Atualiza imediatamente o estado de autenticação em memória
    setUsuario((prev) => (prev ? { ...prev, precisa_trocar_senha: false } : null))
  }

  return (
    <AuthContext.Provider
      value={{
        usuario,
        session,
        loading,
        login,
        logout,
        refreshUsuario,
        recarregarCreditos,
        definirSenhaDefinitiva,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider')
  }
  return context
}
