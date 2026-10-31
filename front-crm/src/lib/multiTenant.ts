import { supabase } from './supabase'
import type { Cliente } from '../stores/useCrmStore'

export type UserRole = 'master' | 'reseller' | 'revendedor'

/**
 * Ordem de prioridade das colunas de vínculo Multi-Tenant no Supabase.
 * `vendedor_id` e `user_id` lideram a resolução para alinhamento nativo com `auth.uid()` e `agentes.id`.
 */
export const PARTNER_OWNER_COLUMNS = [
  'vendedor_id',
  'user_id',
  'agente_id',
  'reseller_id',
  'tenant_id',
] as const

export type PartnerOwnerColumn = (typeof PARTNER_OWNER_COLUMNS)[number]

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Cache em memória de colunas detectadas (existentes vs inexistentes) por tabela no Supabase.
 * Elimina definitivamente erros `42703` / `PGRST204` ("column does not exist" / "schema cache").
 */
const missingColumnsCache: Record<string, Set<string>> = {}
const verifiedColumnsCache: Record<string, Set<PartnerOwnerColumn>> = {}

function getMissingSet(table: string): Set<string> {
  if (!missingColumnsCache[table]) {
    missingColumnsCache[table] = new Set<string>()
  }
  return missingColumnsCache[table]
}

function getVerifiedSet(table: string): Set<PartnerOwnerColumn> {
  if (!verifiedColumnsCache[table]) {
    verifiedColumnsCache[table] = new Set<PartnerOwnerColumn>()
  }
  return verifiedColumnsCache[table]
}

function markMissingColumn(table: string, col: string): void {
  const clean = col.trim()
  if (!clean) return
  getMissingSet(table).add(clean)
  getVerifiedSet(table).delete(clean as PartnerOwnerColumn)
}

function markVerifiedColumn(table: string, col: PartnerOwnerColumn): void {
  getVerifiedSet(table).add(col)
  getMissingSet(table).delete(col)
}

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
 * Verifica se o utilizador autenticado é um Revendedor (`reseller` | `revendedor`).
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
 * - Revendedor ('reseller'): '/retencao' (Clientes & Renovações)
 */
export function getSafeHomeRoute(
  user?: { role?: string | null; nivel_acesso?: string | null } | null
): string {
  return isMasterUser(user) ? '/' : '/retencao'
}

/**
 * Consolida os identificadores válidos do revendedor autenticado (`auth.uid()` e `agentes.id`),
 * priorizando o vínculo direto com o utilizador logado.
 */
export function resolvePartnerIds(userId?: string | null, authId?: string | null): string[] {
  const unique = new Set<string>()
  for (const candidate of [authId, userId]) {
    const clean = String(candidate || '').trim()
    if (clean) unique.add(clean)
  }
  return Array.from(unique)
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

export function isMissingColumnError(
  err: { message?: string; code?: string } | null | undefined,
  col?: string
): boolean {
  if (!err) return false
  const code = String(err.code || '').trim()
  const m = String(err.message || '').toLowerCase()
  const isColumnErr =
    code === '42703' ||
    code === 'PGRST204' ||
    (m.includes('column') && (m.includes('does not exist') || m.includes('schema cache'))) ||
    (m.includes('could not find the') && m.includes('column'))

  if (!isColumnErr) return false
  if (!col) return true
  return m.includes(col.toLowerCase())
}

/**
 * Extrai o nome exato da coluna reportada como inexistente pelo PostgreSQL ou PostgREST.
 */
export function extractMissingColumnName(
  err: { message?: string; code?: string } | null | undefined
): string | null {
  if (!err?.message) return null
  const msg = err.message

  // Formato PostgREST: Could not find the 'vendedor_id' column of 'clientes' in the schema cache
  const pgrstMatch = msg.match(/Could not find the '([^']+)' column/i)
  if (pgrstMatch?.[1]) return pgrstMatch[1]

  // Formato PostgreSQL: column clientes.vendedor_id does not exist / column "vendedor_id" does not exist
  const pgScopedMatch = msg.match(/column\s+(?:[a-zA-Z0-9_]+\.)?"?([a-zA-Z0-9_]+)"?\s+does not exist/i)
  if (pgScopedMatch?.[1]) return pgScopedMatch[1]

  return null
}

/**
 * Validação em memória (Defense-in-Depth): garante que um registo pertence estritamente
 * ao parceiro autenticado (`vendedor_id`, `user_id`, `agente_id`, `reseller_id` ou `tenant_id`).
 * Registos com IDs nulos (pertencentes ao Master) são bloqueados para revendedores.
 */
export function pertenceAoParceiro(
  registro: Record<string, unknown> | null | undefined,
  partnerId?: string | null,
  authId?: string | null
): boolean {
  if (!registro) return false
  const validIds = new Set(resolvePartnerIds(partnerId, authId))
  if (validIds.size === 0) return false

  const candidates = [
    registro.vendedor_id,
    registro.user_id,
    registro.agente_id,
    registro.reseller_id,
    registro.tenant_id,
  ]

  return candidates.some((val) => val != null && validIds.has(String(val).trim()))
}

/**
 * Monta os campos de posse para INSERT/UPDATE garantindo vínculo automático ao revendedor logado
 * e omitindo colunas que já tenham sido identificadas como ausentes no schema atual.
 */
export function buildResellerOwnershipFields(
  userId?: string | null,
  authId?: string | null,
  tableName = 'clientes'
): Record<string, string | null> {
  const safeAgentId = isValidUuid(userId) ? userId : null
  const safeAuthId = isValidUuid(authId) ? authId : safeAgentId
  const primaryVendedorId = safeAuthId || safeAgentId
  const missing = getMissingSet(tableName)

  const raw: Record<PartnerOwnerColumn, string | null> = {
    vendedor_id: primaryVendedorId,
    user_id: primaryVendedorId,
    agente_id: safeAgentId || safeAuthId,
    reseller_id: safeAgentId || safeAuthId,
    tenant_id: primaryVendedorId,
  }

  const filtered: Record<string, string | null> = {}
  for (const col of PARTNER_OWNER_COLUMNS) {
    if (!missing.has(col) && raw[col]) {
      filtered[col] = raw[col]
    }
  }
  return filtered
}

function buildVerifiedOrFilter(columns: PartnerOwnerColumn[], ids: string[]): string {
  const uuidIds = ids.filter((id) => isValidUuid(id))
  if (uuidIds.length === 0 || columns.length === 0) return ''

  const clauses: string[] = []
  for (const col of columns) {
    for (const id of uuidIds) {
      clauses.push(`${col}.eq.${id}`)
    }
  }
  return clauses.join(',')
}

/**
 * Consulta resiliente Multi-Tenant para qualquer tabela de carteira (`clientes`, `clients`, `leads`):
 * - Prioriza `vendedor_id` igual ao ID do revendedor autenticado.
 * - Descobre automaticamente quais colunas de vínculo existem no banco sem propagar erro de coluna inexistente.
 */
export async function fetchPartnerRowsMultiTenant<T extends Record<string, unknown>>(
  tableName: string,
  role?: string | null,
  userId?: string | null,
  authId?: string | null
): Promise<{ data: T[]; error: Error | null }> {
  const reseller = isResellerRole(role)
  const partnerIds = resolvePartnerIds(userId, authId)

  if (reseller && partnerIds.length === 0) {
    return {
      data: [],
      error: new Error('Sessão de revendedor sem identificador válido para isolamento.'),
    }
  }

  if (!reseller) {
    const { data, error } = await supabase.from(tableName).select('*')
    if (error) {
      return { data: [], error: new Error(error.message) }
    }
    return { data: (data || []) as T[], error: null }
  }

  const missing = getMissingSet(tableName)
  const verified = getVerifiedSet(tableName)

  // Caminho rápido: se já validamos todas as colunas candidatas nesta sessão, executa 1 única query limpa
  const unknownCols = PARTNER_OWNER_COLUMNS.filter(
    (col) => !missing.has(col) && !verified.has(col)
  )

  if (unknownCols.length === 0) {
    const activeCols = PARTNER_OWNER_COLUMNS.filter((col) => verified.has(col))
    if (activeCols.length === 0) {
      return { data: [], error: null }
    }

    if (activeCols.length === 1) {
      const onlyCol = activeCols[0]
      const q =
        partnerIds.length === 1
          ? supabase.from(tableName).select('*').eq(onlyCol, partnerIds[0])
          : supabase.from(tableName).select('*').in(onlyCol, partnerIds)
      const { data, error } = await q
      if (error) {
        if (isMissingColumnError(error, onlyCol)) {
          markMissingColumn(tableName, onlyCol)
          return { data: [], error: null }
        }
        return { data: [], error: new Error(error.message) }
      }
      const rows = ((data || []) as T[]).filter((row) =>
        pertenceAoParceiro(row, userId, authId)
      )
      return { data: rows, error: null }
    }

    const orExpr = buildVerifiedOrFilter(activeCols, partnerIds)
    if (orExpr) {
      const { data, error } = await supabase.from(tableName).select('*').or(orExpr)
      if (!error) {
        const rows = ((data || []) as T[]).filter((row) =>
          pertenceAoParceiro(row, userId, authId)
        )
        return { data: rows, error: null }
      }
      const missingCol = extractMissingColumnName(error)
      if (missingCol) {
        markMissingColumn(tableName, missingCol)
      } else {
        return { data: [], error: new Error(error.message) }
      }
    }
  }

  // Descoberta resiliente coluna a coluna (priorizando `vendedor_id` e isolando falhas de schema)
  const candidateCols = PARTNER_OWNER_COLUMNS.filter((col) => !missing.has(col))
  const results = await Promise.all(
    candidateCols.map(async (col) => {
      const query =
        partnerIds.length === 1
          ? supabase.from(tableName).select('*').eq(col, partnerIds[0])
          : supabase.from(tableName).select('*').in(col, partnerIds)
      const res = await query
      return { col, res }
    })
  )

  const mergedMap = new Map<string, T>()
  let nonSchemaError: Error | null = null

  for (const { col, res } of results) {
    if (res.error) {
      const detectedMissing = extractMissingColumnName(res.error)
      if (detectedMissing || isMissingColumnError(res.error, col)) {
        markMissingColumn(tableName, detectedMissing || col)
        continue
      }
      nonSchemaError = new Error(res.error.message)
      continue
    }

    markVerifiedColumn(tableName, col)
    for (const row of (res.data || []) as T[]) {
      if (pertenceAoParceiro(row, userId, authId)) {
        const rowKey = String(row.id ?? JSON.stringify(row))
        mergedMap.set(rowKey, row)
      }
    }
  }

  if (mergedMap.size === 0 && getVerifiedSet(tableName).size === 0 && nonSchemaError) {
    return { data: [], error: nonSchemaError }
  }

  return { data: Array.from(mergedMap.values()), error: null }
}

/**
 * Consulta a tabela `clientes` aplicando isolamento absoluto para Revendedores:
 * - Filtra automaticamente onde `vendedor_id` (ou coluna compatível existente) é igual ao ID do revendedor autenticado.
 * - Elimina erros de coluna inexistente e é fail-closed caso o identificador esteja ausente.
 */
export async function fetchClientesMultiTenant(
  role?: string | null,
  userId?: string | null,
  authId?: string | null
): Promise<{ data: Cliente[]; error: Error | null }> {
  return fetchPartnerRowsMultiTenant<Cliente>('clientes', role, userId, authId)
}

/**
 * Busca um único cliente pelo ID validando estritamente a posse do parceiro (`vendedor_id` / `user_id`).
 */
export async function fetchClienteByIdMultiTenant(
  clienteId: string | number,
  role?: string | null,
  userId?: string | null,
  authId?: string | null
): Promise<{ data: Cliente | null; unauthorized: boolean; error: Error | null }> {
  const reseller = isResellerRole(role)
  const partnerIds = resolvePartnerIds(userId, authId)

  if (reseller && partnerIds.length === 0) {
    return { data: null, unauthorized: true, error: null }
  }

  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('id', clienteId)
    .maybeSingle()

  if (error) {
    if (isUnauthorizedSupabaseError(error)) {
      return { data: null, unauthorized: true, error: null }
    }
    return { data: null, unauthorized: false, error: new Error(error.message) }
  }

  if (!data) {
    return { data: null, unauthorized: reseller, error: null }
  }

  if (reseller && !pertenceAoParceiro(data as Record<string, unknown>, userId, authId)) {
    return { data: null, unauthorized: true, error: null }
  }

  return { data: data as Cliente, unauthorized: false, error: null }
}

/**
 * Insere cliente vinculando automaticamente `vendedor_id` ao ID do revendedor autenticado,
 * removendo dinamicamente qualquer coluna inexistente no schema do Supabase sem falhar.
 */
export async function insertClienteMultiTenant(
  payload: Record<string, unknown>,
  role?: string | null,
  userId?: string | null,
  authId?: string | null
): Promise<{ data: Cliente | null; error: Error | null }> {
  const reseller = isResellerRole(role)
  const partnerIds = resolvePartnerIds(userId, authId)

  if (reseller && partnerIds.length === 0) {
    return {
      data: null,
      error: new Error('Operação negada: identificador de revendedor não encontrado.'),
    }
  }

  const ownership =
    partnerIds.length > 0 ? buildResellerOwnershipFields(userId, authId, 'clientes') : {}
  const workingPayload: Record<string, unknown> = { ...payload, ...ownership }

  // Remove preventivamente quaisquer colunas já cacheadas como inexistentes
  const missing = getMissingSet('clientes')
  for (const col of Array.from(missing)) {
    if (col in workingPayload) {
      if (col === 'nome_completo' && !('nome' in workingPayload) && workingPayload.nome_completo) {
        workingPayload.nome = workingPayload.nome_completo
      }
      delete workingPayload[col]
    }
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    if (reseller) {
      const hasAnyOwnerKey = PARTNER_OWNER_COLUMNS.some(
        (col) => col in workingPayload && Boolean(workingPayload[col])
      )
      if (!hasAnyOwnerKey) {
        return {
          data: null,
          error: new Error(
            'A tabela clientes no Supabase ainda não possui a coluna vendedor_id. Execute o script supabase_multitenant_vendedor.sql no SQL Editor.'
          ),
        }
      }
    }

    const res = await supabase.from('clientes').insert(workingPayload).select().single()
    if (!res.error) {
      return { data: (res.data as Cliente) ?? null, error: null }
    }

    const missingCol =
      extractMissingColumnName(res.error) ||
      Object.keys(workingPayload).find((k) => isMissingColumnError(res.error, k)) ||
      null

    if (missingCol && missingCol in workingPayload) {
      markMissingColumn('clientes', missingCol)
      if (
        missingCol === 'nome_completo' &&
        !('nome' in workingPayload) &&
        workingPayload.nome_completo
      ) {
        workingPayload.nome = workingPayload.nome_completo
      } else if (
        missingCol === 'nome' &&
        !('nome_completo' in workingPayload) &&
        workingPayload.nome
      ) {
        workingPayload.nome_completo = workingPayload.nome
      }
      delete workingPayload[missingCol]
      continue
    }

    return { data: null, error: new Error(res.error.message) }
  }

  return { data: null, error: new Error('Não foi possível concluir o registo do cliente.') }
}

/**
 * Atualiza cliente restringindo obrigatoriamente pelo vínculo do revendedor autenticado (`vendedor_id` / `user_id`),
 * eliminando falhas por colunas inexistentes.
 */
export async function updateClienteMultiTenant(
  clienteId: string | number,
  payload: Record<string, unknown>,
  role?: string | null,
  userId?: string | null,
  authId?: string | null,
  tableName: 'clientes' | 'clients' = 'clientes'
): Promise<{ error: Error | null; unauthorized?: boolean }> {
  const reseller = isResellerRole(role)
  const partnerIds = resolvePartnerIds(userId, authId)

  if (reseller && partnerIds.length === 0) {
    return {
      error: new Error('Acesso não autorizado para alterar este cliente.'),
      unauthorized: true,
    }
  }

  if (reseller && tableName === 'clientes') {
    const check = await fetchClienteByIdMultiTenant(clienteId, role, userId, authId)
    if (check.unauthorized || !check.data) {
      return {
        error: new Error('Acesso não autorizado: este cliente não pertence à sua carteira.'),
        unauthorized: true,
      }
    }
  }

  const workingPayload: Record<string, unknown> = { ...payload }
  const missing = getMissingSet(tableName)
  for (const col of Array.from(missing)) {
    delete workingPayload[col]
  }

  // Impede alteração indevida de posse por revendedores
  if (reseller) {
    const safeOwner = partnerIds[0]
    for (const col of PARTNER_OWNER_COLUMNS) {
      if (col in workingPayload) {
        workingPayload[col] = safeOwner
      }
    }
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const activeOwnerCol = reseller
      ? PARTNER_OWNER_COLUMNS.find((col) => !getMissingSet(tableName).has(col))
      : undefined

    let query = supabase.from(tableName).update(workingPayload).eq('id', clienteId)
    if (reseller && activeOwnerCol) {
      query =
        partnerIds.length === 1
          ? query.eq(activeOwnerCol, partnerIds[0])
          : query.in(activeOwnerCol, partnerIds)
    }

    const { error } = await query
    if (!error) {
      if (reseller && activeOwnerCol) {
        markVerifiedColumn(tableName, activeOwnerCol)
      }
      return { error: null }
    }

    const missingCol =
      extractMissingColumnName(error) ||
      (activeOwnerCol && isMissingColumnError(error, activeOwnerCol) ? activeOwnerCol : null) ||
      Object.keys(workingPayload).find((k) => isMissingColumnError(error, k)) ||
      null

    if (missingCol) {
      markMissingColumn(tableName, missingCol)
      if (missingCol in workingPayload) {
        delete workingPayload[missingCol]
      }
      continue
    }

    return {
      error: new Error(error.message),
      unauthorized: isUnauthorizedSupabaseError(error),
    }
  }

  return { error: new Error('Falha ao atualizar os dados do cliente.') }
}

/**
 * Consulta a tabela de pagamentos (`faturas`) isolando automaticamente os registos do revendedor autenticado.
 */
export async function fetchPagamentosMultiTenant(
  role?: string | null,
  userId?: string | null,
  clientIds?: (string | number)[],
  authId?: string | null
): Promise<{ data: Record<string, unknown>[]; error: Error | null }> {
  const reseller = isResellerRole(role)
  const partnerIds = resolvePartnerIds(userId, authId)

  if (reseller && partnerIds.length === 0) {
    return { data: [], error: new Error('Identificador de parceiro ausente.') }
  }

  if (!reseller) {
    const { data, error } = await supabase.from('faturas').select('*')
    if (error) return { data: [], error: new Error(error.message) }
    return { data: (data || []) as Record<string, unknown>[], error: null }
  }

  const allowedClientIds = new Set((clientIds || []).map((id) => String(id)))
  const merged = new Map<string, Record<string, unknown>>()

  // 1. Filtra pelas colunas de posse existentes em `faturas`
  const ownerRes = await fetchPartnerRowsMultiTenant<Record<string, unknown>>(
    'faturas',
    role,
    userId,
    authId
  )
  for (const row of ownerRes.data) {
    merged.set(String(row.id ?? JSON.stringify(row)), row)
  }

  // 2. Complementa com faturas vinculadas diretamente aos `cliente_id` da carteira isolada do revendedor
  if (allowedClientIds.size > 0) {
    const fbRes = await supabase
      .from('faturas')
      .select('*')
      .in('cliente_id', Array.from(clientIds || []))
    if (!fbRes.error) {
      for (const row of (fbRes.data || []) as Record<string, unknown>[]) {
        if (
          allowedClientIds.has(String(row.cliente_id ?? '')) ||
          pertenceAoParceiro(row, userId, authId)
        ) {
          merged.set(String(row.id ?? JSON.stringify(row)), row)
        }
      }
    }
  }

  return { data: Array.from(merged.values()), error: null }
}

export const fetchFaturasMultiTenant = fetchPagamentosMultiTenant

/**
 * Consulta solicitações/histórico de créditos (`historico_compras`) com filtro estrito por parceiro.
 */
export async function fetchCreditosRequestsMultiTenant(
  role?: string | null,
  userId?: string | null,
  authId?: string | null
): Promise<{ data: Record<string, unknown>[]; error: Error | null }> {
  const reseller = isResellerRole(role)
  const partnerIds = resolvePartnerIds(userId, authId)

  if (reseller && partnerIds.length === 0) {
    return { data: [], error: new Error('Identificador de parceiro ausente.') }
  }

  if (!reseller) {
    const { data, error } = await supabase
      .from('historico_compras')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) return { data: [], error: new Error(error.message) }
    return { data: (data || []) as Record<string, unknown>[], error: null }
  }

  const res = await fetchPartnerRowsMultiTenant<Record<string, unknown>>(
    'historico_compras',
    role,
    userId,
    authId
  )
  if (res.error) return res

  const sorted = [...res.data].sort((a, b) => {
    const ta = new Date(String(a.created_at || 0)).getTime()
    const tb = new Date(String(b.created_at || 0)).getTime()
    return tb - ta
  })

  return { data: sorted, error: null }
}
