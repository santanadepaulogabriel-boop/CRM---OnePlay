import { supabase } from './supabase'
import type { Cliente } from '../stores/useCrmStore'

export type UserRole = 'master' | 'reseller' | 'revendedor'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidUuid(val?: string | null): val is string {
  return Boolean(val && UUID_REGEX.test(val.trim()))
}

/**
 * Verifica se o papel/nível corresponde exclusivamente à conta Master.
 * Fail-closed: qualquer valor ausente ou desconhecido NÃO é considerado Master.
 */
export function isMasterRole(role?: string | null, nivelAcesso?: string | null): boolean {
  const r = String(role || '').trim().toLowerCase()
  const n = String(nivelAcesso || '').trim().toLowerCase()
  return r === 'master' || n === 'master'
}

/**
 * Verifica se o utilizador autenticado é um Revendedor (user.role === 'reseller' | 'revendedor').
 * Fail-closed: qualquer conta autenticada que não seja Master opera sob isolamento estrito de revendedor.
 */
export function isResellerRole(role?: string | null, nivelAcesso?: string | null): boolean {
  if (isMasterRole(role, nivelAcesso)) return false
  return true
}

export function isMasterUser(
  user?: { role?: string | null; nivel_acesso?: string | null } | null
): boolean {
  if (!user) return false
  return isMasterRole(user.role, user.nivel_acesso)
}

export function isResellerUser(
  user?: { role?: string | null; nivel_acesso?: string | null } | null
): boolean {
  if (!user) return false
  return !isMasterUser(user)
}

/**
 * Retorna a rota inicial segura de acordo com o perfil autenticado:
 * - Master: '/' (Inteligência & Métricas)
 * - Revendedor ('reseller'): '/retencao' (Painel Operacional de Clientes)
 */
export function getSafeHomeRoute(
  user?: { role?: string | null; nivel_acesso?: string | null } | null
): string {
  return isMasterUser(user) ? '/' : '/retencao'
}

/**
 * Identifica erros de violação de RLS / permissão no Supabase / PostgREST.
 */
export function isUnauthorizedSupabaseError(err: unknown): boolean {
  if (!err) return false
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : ''
  const msg = (
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message?: unknown }).message || '')
        : String(err)
  ).toLowerCase()

  return (
    code === '42501' ||
    msg.includes('row-level security') ||
    msg.includes('permission denied') ||
    msg.includes('acesso negado') ||
    msg.includes('not authorized') ||
    msg.includes('unauthorized')
  )
}

function isMissingColumnError(err: { message?: string } | null | undefined, col: string): boolean {
  if (!err?.message) return false
  const m = err.message.toLowerCase()
  return (
    m.includes(col.toLowerCase()) &&
    (m.includes('column') || m.includes('schema cache') || m.includes('does not exist'))
  )
}

/**
 * Validação em memória (Defense-in-Depth): garante que um registo pertence estritamente
 * ao parceiro autenticado. Registos com IDs nulos (pertencentes ao Master) são bloqueados para revendedores.
 */
export function pertenceAoParceiro(
  registro: Record<string, unknown> | null | undefined,
  partnerId?: string | null,
  authId?: string | null
): boolean {
  if (!registro) return false
  const validIds = new Set(
    [partnerId, authId].map((v) => String(v || '').trim()).filter(Boolean)
  )
  if (validIds.size === 0) return false

  const candidates = [
    registro.reseller_id,
    registro.agente_id,
    registro.vendedor_id,
    registro.tenant_id,
  ]

  return candidates.some((val) => val != null && validIds.has(String(val).trim()))
}

function buildPartnerOrFilter(userId: string, authId?: string | null): string {
  const parts: string[] = []
  if (isValidUuid(userId)) {
    parts.push(`agente_id.eq.${userId}`, `vendedor_id.eq.${userId}`, `tenant_id.eq.${userId}`)
  }
  if (isValidUuid(authId) && authId !== userId) {
    parts.push(`tenant_id.eq.${authId}`, `vendedor_id.eq.${authId}`)
  }
  return parts.join(',')
}

/**
 * Monta os campos de posse para INSERT/UPDATE garantindo isolamento por parceiro.
 */
export function buildResellerOwnershipFields(
  userId?: string | null,
  authId?: string | null
): Record<string, string | null> {
  const safeAgentId = isValidUuid(userId) ? userId : null
  const safeAuthId = isValidUuid(authId) ? authId : safeAgentId
  return {
    reseller_id: safeAgentId || safeAuthId,
    agente_id: safeAgentId,
    vendedor_id: safeAuthId || safeAgentId,
    tenant_id: safeAuthId || safeAgentId,
  }
}

/**
 * Consulta a tabela `clientes` aplicando isolamento absoluto para Revendedores:
 * - Se `role === 'reseller'` (ou não-Master), injeta obrigatoriamente `.eq('reseller_id', user.id)`.
 * - Fail-closed caso `userId` esteja ausente.
 */
export async function fetchClientesMultiTenant(
  role?: string | null,
  userId?: string | null,
  authId?: string | null
): Promise<{ data: Cliente[]; error: Error | null }> {
  const reseller = isResellerRole(role)

  if (reseller && !userId && !authId) {
    return {
      data: [],
      error: new Error('Sessão de revendedor sem identificador válido para isolamento.'),
    }
  }

  const partnerId = String(userId || authId || '').trim()

  let query = supabase.from('clientes').select('*')
  if (reseller) {
    query = query.eq('reseller_id', partnerId)
  }

  const { data, error } = await query

  // Caso a base possua registos recém-migrados em tenant_id/agente_id ou coluna reseller_id pendente de migração SQL
  if (reseller && (isMissingColumnError(error, 'reseller_id') || (!error && (data || []).length === 0))) {
    const orExpr = buildPartnerOrFilter(partnerId, authId)
    if (orExpr) {
      const fbRes = await supabase.from('clientes').select('*').or(orExpr)
      if (!fbRes.error) {
        const mergedMap = new Map<string, Cliente>()
        for (const row of [...((data || []) as Cliente[]), ...((fbRes.data || []) as Cliente[])]) {
          if (pertenceAoParceiro(row as Record<string, unknown>, partnerId, authId)) {
            mergedMap.set(String(row.id), row)
          }
        }
        return { data: Array.from(mergedMap.values()), error: null }
      }
      if (error && isMissingColumnError(error, 'reseller_id')) {
        return { data: [], error: new Error(fbRes.error.message) }
      }
    }
  }

  if (error) {
    return { data: [], error: new Error(error.message) }
  }

  const rows = ((data || []) as Cliente[]).filter((row) =>
    reseller ? pertenceAoParceiro(row as Record<string, unknown>, partnerId, authId) : true
  )

  return { data: rows, error: null }
}

/**
 * Busca um único cliente pelo ID validando estritamente a posse do parceiro (`reseller_id`).
 */
export async function fetchClienteByIdMultiTenant(
  clienteId: string | number,
  role?: string | null,
  userId?: string | null,
  authId?: string | null
): Promise<{ data: Cliente | null; unauthorized: boolean; error: Error | null }> {
  const reseller = isResellerRole(role)
  const partnerId = String(userId || authId || '').trim()

  if (reseller && !partnerId) {
    return { data: null, unauthorized: true, error: null }
  }

  let query = supabase.from('clientes').select('*').eq('id', clienteId)
  if (reseller) {
    query = query.eq('reseller_id', partnerId)
  }

  const { data, error } = await query.maybeSingle()

  if (reseller && (isMissingColumnError(error, 'reseller_id') || (!error && !data))) {
    const fb = await supabase.from('clientes').select('*').eq('id', clienteId).maybeSingle()
    if (fb.error) {
      if (isUnauthorizedSupabaseError(fb.error)) {
        return { data: null, unauthorized: true, error: null }
      }
      return { data: null, unauthorized: false, error: new Error(fb.error.message) }
    }
    if (!fb.data) {
      // Com RLS ativo, registo de outro parceiro retorna null: tratamos como acesso não autorizado para revendedor
      return { data: null, unauthorized: true, error: null }
    }
    if (!pertenceAoParceiro(fb.data as Record<string, unknown>, partnerId, authId)) {
      return { data: null, unauthorized: true, error: null }
    }
    return { data: fb.data as Cliente, unauthorized: false, error: null }
  }

  if (error) {
    if (isUnauthorizedSupabaseError(error)) {
      return { data: null, unauthorized: true, error: null }
    }
    return { data: null, unauthorized: false, error: new Error(error.message) }
  }

  if (!data) {
    return { data: null, unauthorized: reseller, error: null }
  }

  if (reseller && !pertenceAoParceiro(data as Record<string, unknown>, partnerId, authId)) {
    return { data: null, unauthorized: true, error: null }
  }

  return { data: data as Cliente, unauthorized: false, error: null }
}

/**
 * Insere cliente injetando `reseller_id` do parceiro autenticado (com fallback seguro se coluna pendente).
 */
export async function insertClienteMultiTenant(
  payload: Record<string, unknown>,
  role?: string | null,
  userId?: string | null,
  authId?: string | null
): Promise<{ data: Cliente | null; error: Error | null }> {
  const reseller = isResellerRole(role)
  const partnerId = String(userId || authId || '').trim()

  if (reseller && !partnerId) {
    return {
      data: null,
      error: new Error('Operação negada: identificador de revendedor não encontrado.'),
    }
  }

  const ownership = userId || authId ? buildResellerOwnershipFields(userId, authId) : {}
  const fullPayload = { ...payload, ...ownership }

  let res = await supabase.from('clientes').insert(fullPayload).select().single()

  if (res.error && isMissingColumnError(res.error, 'reseller_id')) {
    const { reseller_id: _omit, ...legacyPayload } = fullPayload
    void _omit
    res = await supabase.from('clientes').insert(legacyPayload).select().single()
  }

  if (res.error) {
    return { data: null, error: new Error(res.error.message) }
  }

  return { data: (res.data as Cliente) ?? null, error: null }
}

/**
 * Atualiza cliente restringindo obrigatoriamente por `.eq('reseller_id', user.id)` quando revendedor.
 */
export async function updateClienteMultiTenant(
  clienteId: string | number,
  payload: Record<string, unknown>,
  role?: string | null,
  userId?: string | null,
  authId?: string | null
): Promise<{ error: Error | null; unauthorized?: boolean }> {
  const reseller = isResellerRole(role)
  const partnerId = String(userId || authId || '').trim()

  if (reseller && !partnerId) {
    return {
      error: new Error('Acesso não autorizado para alterar este cliente.'),
      unauthorized: true,
    }
  }

  if (reseller) {
    const check = await fetchClienteByIdMultiTenant(clienteId, role, userId, authId)
    if (check.unauthorized || !check.data) {
      return {
        error: new Error('Acesso não autorizado: este cliente não pertence à sua carteira.'),
        unauthorized: true,
      }
    }
  }

  const cleanPayload = { ...payload }
  if (reseller && 'reseller_id' in cleanPayload) {
    cleanPayload.reseller_id = partnerId
  }

  let query = supabase.from('clientes').update(cleanPayload).eq('id', clienteId)
  if (reseller) {
    query = query.eq('reseller_id', partnerId)
  }

  const { error } = await query

  if (error && isMissingColumnError(error, 'reseller_id')) {
    const { reseller_id: _omit, ...legacyPayload } = cleanPayload
    void _omit
    const fb = await supabase.from('clientes').update(legacyPayload).eq('id', clienteId)
    if (fb.error) {
      return {
        error: new Error(fb.error.message),
        unauthorized: isUnauthorizedSupabaseError(fb.error),
      }
    }
    return { error: null }
  }

  if (error) {
    return {
      error: new Error(error.message),
      unauthorized: isUnauthorizedSupabaseError(error),
    }
  }

  return { error: null }
}

/**
 * Consulta a tabela de pagamentos (`faturas`) aplicando `.eq('reseller_id', user.id)` para revendedores.
 */
export async function fetchPagamentosMultiTenant(
  role?: string | null,
  userId?: string | null,
  clientIds?: (string | number)[],
  authId?: string | null
): Promise<{ data: Record<string, unknown>[]; error: Error | null }> {
  const reseller = isResellerRole(role)
  const partnerId = String(userId || authId || '').trim()

  if (reseller && !partnerId) {
    return { data: [], error: new Error('Identificador de parceiro ausente.') }
  }

  let query = supabase.from('faturas').select('*')
  if (reseller) {
    query = query.eq('reseller_id', partnerId)
  }

  const { data, error } = await query

  if (reseller && (isMissingColumnError(error, 'reseller_id') || (!error && (data || []).length === 0))) {
    const allowedClientIds = new Set((clientIds || []).map((id) => String(id)))
    if (allowedClientIds.size > 0) {
      const fbRes = await supabase
        .from('faturas')
        .select('*')
        .in('cliente_id', Array.from(clientIds || []))
      if (!fbRes.error) {
        return {
          data: ((fbRes.data || []) as Record<string, unknown>[]).filter(
            (row) =>
              allowedClientIds.has(String(row.cliente_id ?? '')) ||
              pertenceAoParceiro(row, partnerId, authId)
          ),
          error: null,
        }
      }
    }
    if (error && isMissingColumnError(error, 'reseller_id')) {
      return { data: [], error: null }
    }
  }

  if (error) {
    return { data: [], error: new Error(error.message) }
  }

  const allowedClientIds = new Set((clientIds || []).map((id) => String(id)))
  const filtered = ((data || []) as Record<string, unknown>[]).filter((row) =>
    reseller
      ? pertenceAoParceiro(row, partnerId, authId) ||
        allowedClientIds.has(String(row.cliente_id ?? ''))
      : true
  )

  return { data: filtered, error: null }
}

export const fetchFaturasMultiTenant = fetchPagamentosMultiTenant

/**
 * Consulta solicitações/histórico de créditos (`historico_compras`) com filtro estrito `.eq('reseller_id', user.id)`.
 */
export async function fetchCreditosRequestsMultiTenant(
  role?: string | null,
  userId?: string | null,
  authId?: string | null
): Promise<{ data: Record<string, unknown>[]; error: Error | null }> {
  const reseller = isResellerRole(role)
  const partnerId = String(userId || authId || '').trim()

  if (reseller && !partnerId) {
    return { data: [], error: new Error('Identificador de parceiro ausente.') }
  }

  let query = supabase
    .from('historico_compras')
    .select('*')
    .order('created_at', { ascending: false })

  if (reseller) {
    query = query.eq('reseller_id', partnerId)
  }

  const { data, error } = await query

  if (reseller && (isMissingColumnError(error, 'reseller_id') || (!error && (data || []).length === 0))) {
    const orParts: string[] = []
    if (isValidUuid(partnerId)) {
      orParts.push(`agente_id.eq.${partnerId}`, `tenant_id.eq.${partnerId}`)
    }
    if (isValidUuid(authId) && authId !== partnerId) {
      orParts.push(`tenant_id.eq.${authId}`)
    }
    if (orParts.length > 0) {
      const fbRes = await supabase
        .from('historico_compras')
        .select('*')
        .or(orParts.join(','))
        .order('created_at', { ascending: false })

      if (!fbRes.error) {
        return {
          data: ((fbRes.data || []) as Record<string, unknown>[]).filter((r) =>
            pertenceAoParceiro(r, partnerId, authId)
          ),
          error: null,
        }
      }
    }
    if (error && isMissingColumnError(error, 'reseller_id')) {
      return { data: [], error: null }
    }
  }

  if (error) {
    return { data: [], error: new Error(error.message) }
  }

  return {
    data: ((data || []) as Record<string, unknown>[]).filter((r) =>
      reseller ? pertenceAoParceiro(r, partnerId, authId) : true
    ),
    error: null,
  }
}
