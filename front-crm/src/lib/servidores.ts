import { supabase } from './supabase'
import { isResellerRole } from './multiTenant'

export interface Servidor {
  id: string
  nome: string
  url: string
  status: 'ativo' | 'inativo'
  reseller_id?: string | null
  tenant_id?: string | null
  created_at?: string
  updated_at?: string
}

const STORAGE_KEY = 'oneplay_servidores_cache'

function getCacheKey(userId?: string | null): string {
  const clean = String(userId || '').trim()
  return clean ? `${STORAGE_KEY}_${clean}` : STORAGE_KEY
}

export const DEFAULT_SERVIDORES: Servidor[] = [
  {
    id: 'srv-alpha-br',
    nome: 'Servidor Alpha BR',
    url: 'http://srv1.oneplay.live:80',
    status: 'ativo',
  },
  {
    id: 'srv-cdn-global',
    nome: 'Servidor CDN Global',
    url: 'http://cdn.oneplay.live:8080',
    status: 'ativo',
  },
  {
    id: 'srv-p2p-backup',
    nome: 'Backup P2P Turbo',
    url: 'http://p2p.oneplay.live:2086',
    status: 'ativo',
  },
]

export function getLocalCache(userId?: string | null): Servidor[] {
  try {
    const raw = localStorage.getItem(getCacheKey(userId))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch {
    // Ignore error
  }
  return DEFAULT_SERVIDORES
}

export function saveLocalCache(list: Servidor[], userId?: string | null) {
  try {
    localStorage.setItem(getCacheKey(userId), JSON.stringify(list))
  } catch {
    // Ignore error
  }
}

export function limparCacheServidores(userId?: string | null) {
  try {
    localStorage.removeItem(STORAGE_KEY)
    if (userId) {
      localStorage.removeItem(getCacheKey(userId))
    }
  } catch {
    // Ignore error
  }
}

/**
 * Busca servidores aplicando isolamento Multi-tenant:
 * Se for Revendedor (`role === 'reseller'`), filtra explicitamente por parceiro.
 */
export async function listarServidores(
  role?: string | null,
  userId?: string | null
): Promise<{
  servidores: Servidor[]
  fromDatabase: boolean
  error: string | null
}> {
  const reseller = isResellerRole(role)

  if (reseller && !userId) {
    return {
      servidores: [],
      fromDatabase: true,
      error: 'Identificador de parceiro ausente.',
    }
  }

  try {
    let query = supabase.from('servidores').select('*').order('nome', { ascending: true })

    if (reseller && userId) {
      query = query.eq('tenant_id', userId)
    }

    const { data, error } = await query

    if (error) {
      console.warn('Erro ao consultar servidores no Supabase:', error.message)
      const local = getLocalCache(userId)
      const filtered =
        reseller && userId
          ? local.filter((s) => s.tenant_id === userId || s.reseller_id === userId)
          : local
      return { servidores: filtered, fromDatabase: false, error: error.message }
    }

    if (data) {
      const list = data as Servidor[]
      saveLocalCache(list, userId)
      return { servidores: list, fromDatabase: true, error: null }
    }

    return { servidores: [], fromDatabase: true, error: null }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { servidores: [], fromDatabase: false, error: msg }
  }
}

/**
 * Cadastra um novo servidor no Supabase injetando a posse do parceiro.
 */
export async function criarServidor(payload: {
  nome: string
  url: string
  status?: 'ativo' | 'inativo'
  tenant_id?: string | null
  reseller_id?: string | null
}): Promise<{ servidor: Servidor | null; error: string | null }> {
  const novoServidor: Record<string, unknown> = {
    nome: payload.nome.trim(),
    url: payload.url.trim(),
    status: payload.status || 'ativo',
    tenant_id: payload.tenant_id ?? null,
    reseller_id: payload.reseller_id ?? payload.tenant_id ?? null,
  }

  try {
    let res = await supabase.from('servidores').insert(novoServidor).select().single()

    if (res.error && res.error.message.toLowerCase().includes('reseller_id')) {
      const { reseller_id: _omit, ...legacy } = novoServidor
      void _omit
      res = await supabase.from('servidores').insert(legacy).select().single()
    }

    if (res.error) {
      console.error('Erro ao cadastrar servidor no Supabase:', res.error.message)
      return { servidor: null, error: res.error.message }
    }

    const item = res.data as Servidor
    const updated = [...getLocalCache(payload.tenant_id).filter((s) => s.id !== item.id), item]
    saveLocalCache(updated, payload.tenant_id)
    return { servidor: item, error: null }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { servidor: null, error: msg }
  }
}

/**
 * Atualiza o status (ativo/inativo) de um servidor
 */
export async function atualizarStatusServidor(
  id: string,
  status: 'ativo' | 'inativo',
  tenantId?: string | null
): Promise<{ success: boolean; error: string | null }> {
  try {
    let query = supabase
      .from('servidores')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }

    const { error } = await query

    if (error) {
      return { success: false, error: error.message }
    }

    const local = getLocalCache(tenantId).map((s) => (s.id === id ? { ...s, status } : s))
    saveLocalCache(local, tenantId)

    return { success: true, error: null }
  } catch (err: unknown) {
    return { success: false, error: String(err) }
  }
}

/**
 * Remove um servidor do sistema no Supabase validando escopo de posse quando aplicável.
 */
export async function removerServidor(
  id: string,
  tenantId?: string | null
): Promise<{ success: boolean; error: string | null }> {
  try {
    let query = supabase.from('servidores').delete().eq('id', id)
    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }

    const { error } = await query
    if (error) {
      console.error('Erro ao remover servidor no Supabase:', error.message)
      return { success: false, error: error.message }
    }

    const local = getLocalCache(tenantId).filter((s) => s.id !== id)
    saveLocalCache(local, tenantId)

    return { success: true, error: null }
  } catch (err: unknown) {
    return { success: false, error: String(err) }
  }
}
