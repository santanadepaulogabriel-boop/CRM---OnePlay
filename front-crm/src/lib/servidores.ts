import { supabase } from './supabase'
import {
  extractMissingColumnName,
  fetchPartnerRowsMultiTenant,
  isMissingColumnError,
  isResellerRole,
} from './multiTenant'

export interface Servidor {
  id: string
  nome: string
  url: string
  status: 'ativo' | 'inativo'
  vendedor_id?: string | null
  user_id?: string | null
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

export function getLocalCache(userId?: string | null, resellerOnly = false): Servidor[] {
  try {
    const raw = localStorage.getItem(getCacheKey(userId))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch {
    // Ignore error
  }
  return resellerOnly ? [] : DEFAULT_SERVIDORES
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
 * Busca servidores aplicando isolamento Multi-Tenant resiliente:
 * Se for Revendedor (`role !== 'master'`), filtra estritamente pelos servidores do próprio parceiro.
 */
export async function listarServidores(
  role?: string | null,
  userId?: string | null,
  authId?: string | null
): Promise<{
  servidores: Servidor[]
  fromDatabase: boolean
  error: string | null
}> {
  const reseller = isResellerRole(role)
  const effectiveOwnerId = authId || userId

  if (reseller && !effectiveOwnerId) {
    return {
      servidores: [],
      fromDatabase: true,
      error: 'Identificador de parceiro ausente.',
    }
  }

  try {
    if (!reseller) {
      const { data, error } = await supabase
        .from('servidores')
        .select('*')
        .order('nome', { ascending: true })

      if (error) {
        return {
          servidores: getLocalCache(userId, false),
          fromDatabase: false,
          error: error.message,
        }
      }

      const list = (data || []) as Servidor[]
      saveLocalCache(list, userId)
      return { servidores: list, fromDatabase: true, error: null }
    }

    const { data, error } = await fetchPartnerRowsMultiTenant<
      Servidor & Record<string, unknown>
    >('servidores', role, userId, authId)

    if (error) {
      const local = getLocalCache(userId, true)
      return { servidores: local, fromDatabase: false, error: error.message }
    }

    const sorted = [...data].sort((a, b) =>
      String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')
    )
    saveLocalCache(sorted, userId)
    return { servidores: sorted, fromDatabase: true, error: null }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { servidores: getLocalCache(userId, reseller), fromDatabase: false, error: msg }
  }
}

/**
 * Cadastra um novo servidor no Supabase injetando a posse do parceiro e removendo colunas inexistentes.
 */
export async function criarServidor(payload: {
  nome: string
  url: string
  status?: 'ativo' | 'inativo'
  tenant_id?: string | null
  reseller_id?: string | null
  vendedor_id?: string | null
}): Promise<{ servidor: Servidor | null; error: string | null }> {
  const ownerId = payload.tenant_id ?? payload.reseller_id ?? payload.vendedor_id ?? null
  const workingPayload: Record<string, unknown> = {
    nome: payload.nome.trim(),
    url: payload.url.trim(),
    status: payload.status || 'ativo',
    tenant_id: ownerId,
    reseller_id: payload.reseller_id ?? ownerId,
    vendedor_id: payload.vendedor_id ?? ownerId,
  }

  try {
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await supabase.from('servidores').insert(workingPayload).select().single()
      if (!res.error) {
        const item = res.data as Servidor
        const updated = [
          ...getLocalCache(ownerId, Boolean(ownerId)).filter((s) => s.id !== item.id),
          item,
        ]
        saveLocalCache(updated, ownerId)
        return { servidor: item, error: null }
      }

      const missingCol =
        extractMissingColumnName(res.error) ||
        Object.keys(workingPayload).find((k) => isMissingColumnError(res.error, k)) ||
        null

      if (missingCol && missingCol in workingPayload) {
        delete workingPayload[missingCol]
        continue
      }

      return { servidor: null, error: res.error.message }
    }

    return { servidor: null, error: 'Não foi possível salvar o servidor.' }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { servidor: null, error: msg }
  }
}

/**
 * Atualiza o status (ativo/inativo) de um servidor respeitando o isolamento de posse.
 */
export async function atualizarStatusServidor(
  id: string,
  status: 'ativo' | 'inativo',
  tenantId?: string | null
): Promise<{ success: boolean; error: string | null }> {
  try {
    const patch: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }

    let query = supabase.from('servidores').update(patch).eq('id', id)
    if (tenantId) {
      query = query.eq('tenant_id', tenantId)
    }

    let { error } = await query
    if (error && tenantId && isMissingColumnError(error, 'tenant_id')) {
      const fb = await supabase
        .from('servidores')
        .update(patch)
        .eq('id', id)
        .eq('reseller_id', tenantId)
      error = fb.error
    }

    if (error) {
      return { success: false, error: error.message }
    }

    const local = getLocalCache(tenantId, Boolean(tenantId)).map((s) =>
      s.id === id ? { ...s, status } : s
    )
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

    let { error } = await query
    if (error && tenantId && isMissingColumnError(error, 'tenant_id')) {
      const fb = await supabase
        .from('servidores')
        .delete()
        .eq('id', id)
        .eq('reseller_id', tenantId)
      error = fb.error
    }

    if (error) {
      console.error('Erro ao remover servidor no Supabase:', error.message)
      return { success: false, error: error.message }
    }

    const local = getLocalCache(tenantId, Boolean(tenantId)).filter((s) => s.id !== id)
    saveLocalCache(local, tenantId)

    return { success: true, error: null }
  } catch (err: unknown) {
    return { success: false, error: String(err) }
  }
}
