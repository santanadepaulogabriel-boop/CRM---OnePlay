import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import type { Servidor } from '../lib/servidores'
import {
  fetchClienteByIdMultiTenant,
  fetchClientesMultiTenant,
  fetchCreditosRequestsMultiTenant,
  fetchPagamentosMultiTenant,
  isResellerUser,
  pertenceAoParceiro,
} from '../lib/multiTenant'

export type CrmRole = 'master' | 'reseller' | 'revendedor'

export interface CrmUser {
  id: string
  authId?: string
  email: string
  nome: string
  role: CrmRole
  creditos?: number | null
}

export type StatusAssinatura = 'ativo' | 'alerta_vencimento' | 'inativo'

export interface Cliente {
  id: string | number
  nome_completo?: string | null
  nome?: string | null
  whatsapp?: string | null
  email?: string | null
  login_usuario?: string | null
  senha?: string | null
  plano?: string | null
  valor_mensal?: number | null
  data_vencimento?: string | null
  Status?: string | null
  status?: string | null
  estagio_funil?: string | null
  reseller_id?: string | null
  vendedor_id?: string | null
  agente_id?: string | null
  tenant_id?: string | null
  em_suporte?: boolean | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface PagamentoRegistro {
  id: string | number
  cliente_id?: string | number | null
  reseller_id?: string | null
  valor?: number | null
  status?: string | null
  data_vencimento?: string | null
  data_pagamento?: string | null
  created_at?: string | null
  [key: string]: unknown
}

export interface PedidoCreditoRegistro {
  id: string
  reseller_id?: string | null
  tenant_id?: string | null
  agente_id?: string | null
  pacote?: string
  quantidade?: number
  valor?: number
  status?: string
  created_at?: string
  [key: string]: unknown
}

interface CrmMetrics {
  mrr: number
  clientesAtivos: number
  totalLeads: number
  leadsConvertidos: number
  taxaConversao: number
}

interface CrmStoreState {
  user: CrmUser | null
  clientes: Cliente[]
  pagamentos: PagamentoRegistro[]
  pedidosCreditos: PedidoCreditoRegistro[]
  loading: boolean
  metrics: CrmMetrics
  creditos: number | null
  modalAcessoRestritoOpen: boolean
  metricasCache: unknown | null
  lastFetchMetricas: number | null
  lojaCreditosOpen: boolean

  // Actions de Estado & Isolamento Multi-Tenant
  setUser: (user: CrmUser | null) => void
  setClientes: (clientes: Cliente[]) => void
  setPagamentos: (pagamentos: PagamentoRegistro[]) => void
  setPedidosCreditos: (pedidos: PedidoCreditoRegistro[]) => void
  setLoading: (loading: boolean) => void
  setCreditos: (creditos: number | null) => void
  setMetricasCache: (cache: unknown | null, timestamp?: number) => void
  carregarClientes: () => Promise<{ data: Cliente[]; error: Error | null }>
  carregarPagamentos: () => Promise<{ data: PagamentoRegistro[]; error: Error | null }>
  carregarCreditos: () => Promise<{
    saldo: number
    pedidos: PedidoCreditoRegistro[]
    error: Error | null
  }>
  abrirModalAcessoRestrito: () => void
  fecharModalAcessoRestrito: () => void
  abrirLojaCreditos: () => void
  fecharLojaCreditos: () => void
  deduzirCredito: (quantidade?: number) => void
  adicionarCliente: (cliente: Cliente) => void
  atualizarCliente: (id: string | number, updates: Partial<Cliente>) => void
  converterCliente: (id: string | number, dadosAssinante: Partial<Cliente>) => void
  servidores: Servidor[]
  setServidores: (servidores: Servidor[]) => void
  criarServidor: (
    dados: { nome: string; url: string; status?: 'ativo' | 'inativo' },
    tenantId?: string | null
  ) => Promise<{ servidor: Servidor | null; error: string | null }>
  listarServidores: (userId?: string | null) => Promise<Servidor[]>
  excluirServidor: (id: string) => Promise<{ success: boolean; error: string | null }>
  renovarAssinatura: (
    clienteId: string | number
  ) => Promise<{
    success: boolean
    error: string | null
    saldoInsuficiente?: boolean
    unauthorized?: boolean
    cliente?: Cliente | null
  }>
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  recalcularMetricas: () => void
  clearStore: () => void
}

/**
 * Normaliza o status do cliente para minúsculas unificando 'Ativo' e 'ativo'.
 */
function getClientStatus(c?: Cliente | null): string {
  if (!c) return ''
  const val = c.Status ?? c.status
  return typeof val === 'string' ? val.trim().toLowerCase() : ''
}

/**
 * Calcula métricas reais e puras do CRM baseadas na lista de clientes isolada por parceiro:
 * - MRR: .reduce() que soma o valor_mensal apenas onde Status.toLowerCase() === 'ativo'
 * - Taxa de Conversão: leads convertidos ÷ total de leads daquele vendedor
 */
function calcularMetricas(clientes: Cliente[]): CrmMetrics {
  const lista = Array.isArray(clientes) ? clientes : []

  // 1. Clientes com Status 'ativo' exclusivamente
  const ativos = lista.filter((c) => getClientStatus(c) === 'ativo')

  // 2. MRR: .reduce() que soma a propriedade valor_mensal apenas onde Status.toLowerCase() === 'ativo'
  const mrr = lista.reduce((acc, c) => {
    if (getClientStatus(c) === 'ativo') {
      const val = Number(c?.valor_mensal ?? 0)
      return acc + (Number.isFinite(val) ? val : 0)
    }
    return acc
  }, 0)

  // 3. Leads e Taxa de Conversão
  const totalLeads = lista.length
  const leadsConvertidos = lista.filter((c) => {
    const estagio = String(c?.estagio_funil || '').trim().toLowerCase()
    const st = getClientStatus(c)
    return (
      estagio === 'cliente' ||
      (st === 'ativo' && !['lead', 'teste', 'followup', 'negociacao'].includes(estagio))
    )
  }).length

  const taxaConversao = totalLeads > 0 ? (leadsConvertidos / totalLeads) * 100 : 0

  return {
    mrr,
    clientesAtivos: ativos.length,
    totalLeads,
    leadsConvertidos,
    taxaConversao,
  }
}

export const useCrmStore = create<CrmStoreState>((set, get) => ({
  user: null,
  clientes: [],
  pagamentos: [],
  pedidosCreditos: [],
  loading: false,
  metrics: {
    mrr: 0,
    clientesAtivos: 0,
    totalLeads: 0,
    leadsConvertidos: 0,
    taxaConversao: 0,
  },
  creditos: null,
  modalAcessoRestritoOpen: false,
  metricasCache: null,
  lastFetchMetricas: null,
  lojaCreditosOpen: false,
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  servidores: [],

  setServidores: (servidores) => {
    set({ servidores })
  },

  /**
   * Carregamento centralizado de clientes com Isolamento Absoluto de Estado:
   * Verifica `user.role === 'reseller'` e injeta `.eq('reseller_id', user.id)`.
   */
  carregarClientes: async () => {
    const user = get().user
    if (!user) {
      set({ clientes: [], metrics: calcularMetricas([]) })
      return { data: [], error: null }
    }

    const isReseller = user.role === 'reseller' || isResellerUser(user)
    if (isReseller && !user.id) {
      set({ clientes: [], metrics: calcularMetricas([]) })
      return {
        data: [],
        error: new Error('Identificador de parceiro ausente para consulta isolada.'),
      }
    }

    set({ loading: true })
    try {
      const effectiveRole = isReseller ? 'reseller' : 'master'
      const { data, error } = await fetchClientesMultiTenant(
        effectiveRole,
        user.id,
        user.authId
      )

      const listaSegura = isReseller
        ? data.filter((c) => pertenceAoParceiro(c as Record<string, unknown>, user.id, user.authId))
        : data

      const metrics = calcularMetricas(listaSegura)
      set({ clientes: listaSegura, metrics })
      return { data: listaSegura, error }
    } finally {
      set({ loading: false })
    }
  },

  /**
   * Carregamento centralizado de pagamentos (`faturas`) com Isolamento Absoluto de Estado:
   * Verifica `user.role === 'reseller'` e injeta `.eq('reseller_id', user.id)`.
   */
  carregarPagamentos: async () => {
    const user = get().user
    if (!user) {
      set({ pagamentos: [] })
      return { data: [], error: null }
    }

    const isReseller = user.role === 'reseller' || isResellerUser(user)
    if (isReseller && !user.id) {
      set({ pagamentos: [] })
      return {
        data: [],
        error: new Error('Identificador de parceiro ausente para consulta de pagamentos.'),
      }
    }

    const clientIds = get().clientes.map((c) => c.id)
    const effectiveRole = isReseller ? 'reseller' : 'master'
    const { data, error } = await fetchPagamentosMultiTenant(
      effectiveRole,
      user.id,
      clientIds,
      user.authId
    )

    const listaPagamentos = data as PagamentoRegistro[]
    set({ pagamentos: listaPagamentos })
    return { data: listaPagamentos, error }
  },

  /**
   * Carregamento centralizado de saldo e solicitações de créditos (`historico_compras`):
   * Verifica `user.role === 'reseller'` e injeta `.eq('reseller_id', user.id)` em todas as queries.
   */
  carregarCreditos: async () => {
    const user = get().user
    if (!user?.id) {
      set({ creditos: null, pedidosCreditos: [] })
      return { saldo: 0, pedidos: [], error: null }
    }

    const isReseller = user.role === 'reseller' || isResellerUser(user)
    let saldoAtual = typeof get().creditos === 'number' ? Number(get().creditos) : Number(user.creditos ?? 0)

    try {
      const { data: agenteData, error: agenteErr } = await supabase
        .from('agentes')
        .select('creditos')
        .eq('id', user.id)
        .maybeSingle()

      if (!agenteErr && agenteData && agenteData.creditos !== undefined) {
        saldoAtual = Number(agenteData.creditos ?? 0)
        set({ creditos: saldoAtual })
      }
    } catch (err) {
      console.warn('Falha ao sincronizar saldo de créditos:', err)
    }

    const effectiveRole = isReseller ? 'reseller' : 'master'
    const { data: pedidosRaw, error: pedidosErr } = await fetchCreditosRequestsMultiTenant(
      effectiveRole,
      user.id,
      user.authId
    )

    const pedidos = (pedidosRaw as PedidoCreditoRegistro[]).filter((p) =>
      isReseller ? pertenceAoParceiro(p as Record<string, unknown>, user.id, user.authId) : true
    )

    set({ pedidosCreditos: pedidos })
    return { saldo: saldoAtual, pedidos, error: pedidosErr }
  },

  /**
   * Criação com Multi-tenant: o payload de inserção (INSERT) inclui obrigatoriamente
   * a propriedade tenant_id e reseller_id do utilizador autenticado.
   */
  criarServidor: async (dados, tenantId) => {
    const user = get().user
    const resolvedTenantId = tenantId || user?.authId || user?.id || null

    const payload: Record<string, unknown> = {
      nome: dados.nome.trim(),
      url: dados.url.trim(),
      status: dados.status || 'ativo',
      tenant_id: resolvedTenantId,
      reseller_id: user?.id || resolvedTenantId,
    }

    let res = await supabase.from('servidores').insert(payload).select().single()
    if (res.error && res.error.message.toLowerCase().includes('reseller_id')) {
      const { reseller_id: _omit, ...legacyPayload } = payload
      void _omit
      res = await supabase.from('servidores').insert(legacyPayload).select().single()
    }

    if (res.error) {
      console.error('Erro ao criar servidor no Supabase:', res.error.message)
      return { servidor: null, error: res.error.message }
    }

    const item = res.data as Servidor
    set((state) => ({
      servidores: [...state.servidores, item],
    }))

    try {
      const cacheKey = user?.id ? `oneplay_servidores_cache_${user.id}` : 'oneplay_servidores_cache'
      const raw = localStorage.getItem(cacheKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          localStorage.setItem(
            cacheKey,
            JSON.stringify([...parsed.filter((s: { id: string }) => s.id !== item.id), item])
          )
        }
      }
    } catch {}

    return { servidor: item, error: null }
  },

  /**
   * Listagem de servidores mantendo o filtro estrito por parceiro se revendedor.
   */
  listarServidores: async (userId) => {
    const user = get().user
    const isReseller = user ? user.role === 'reseller' || isResellerUser(user) : true
    const partnerId = userId || user?.id
    const authTenantId = user?.authId || partnerId

    let query = supabase.from('servidores').select('*').order('nome', { ascending: true })
    if (isReseller) {
      if (!partnerId && !authTenantId) {
        set({ servidores: [] })
        return []
      }
      query = query.eq('reseller_id', partnerId || authTenantId)
    } else if (userId) {
      query = query.eq('tenant_id', userId)
    }

    let { data, error } = await query

    if (isReseller && error && error.message.toLowerCase().includes('reseller_id') && authTenantId) {
      const fb = await supabase
        .from('servidores')
        .select('*')
        .eq('tenant_id', authTenantId)
        .order('nome', { ascending: true })
      data = fb.data
      error = fb.error
    }

    if (error) {
      console.error('Erro ao listar servidores isolados:', error.message)
      return get().servidores
    }

    const list = (data || []) as Servidor[]
    set({ servidores: list })
    return list
  },

  /**
   * Exclusão Real com filtro de posse para revendedores.
   */
  excluirServidor: async (id: string) => {
    const user = get().user
    const isReseller = user ? user.role === 'reseller' || isResellerUser(user) : true

    let query = supabase.from('servidores').delete().eq('id', id)
    if (isReseller) {
      const tenantFilter = user?.authId || user?.id
      if (!tenantFilter) {
        return { success: false, error: 'Operação não autorizada.' }
      }
      query = query.eq('tenant_id', tenantFilter)
    }

    const { error } = await query
    if (error) {
      console.error('Erro ao excluir servidor no Supabase:', error.message)
      return { success: false, error: error.message }
    }

    set((state) => ({
      servidores: state.servidores.filter((s) => s.id !== id),
    }))

    try {
      const cacheKey = user?.id ? `oneplay_servidores_cache_${user.id}` : 'oneplay_servidores_cache'
      const raw = localStorage.getItem(cacheKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((s: { id: string }) => s.id !== id)
          localStorage.setItem(cacheKey, JSON.stringify(filtered))
        }
      }
    } catch {}

    return { success: true, error: null }
  },

  /**
   * Renovação Atômica via RPC com verificação prévia de propriedade do cliente para revendedores.
   */
  renovarAssinatura: async (clienteId: string | number) => {
    const user = get().user
    const isReseller = user ? user.role === 'reseller' || isResellerUser(user) : true

    if (isReseller) {
      const check = await fetchClienteByIdMultiTenant(
        clienteId,
        user?.role,
        user?.id,
        user?.authId
      )
      if (check.unauthorized || !check.data) {
        return {
          success: false,
          unauthorized: true,
          error: 'Acesso não autorizado: este cliente não pertence à sua carteira.',
        }
      }
    }

    // 1. Chamada atômica via RPC no Supabase
    const { error } = await supabase.rpc('renovar_assinatura', {
      p_cliente_id: clienteId,
    })

    if (error) {
      console.error('Erro na RPC renovar_assinatura:', error.message)
      const msg = error.message || ''
      const isSaldoInsuficiente =
        msg.toLowerCase().includes('saldo') ||
        msg.toLowerCase().includes('crédito') ||
        msg.toLowerCase().includes('credito') ||
        msg.toLowerCase().includes('insuficiente')

      if (isSaldoInsuficiente) {
        get().abrirModalAcessoRestrito()
      }

      return {
        success: false,
        error: error.message,
        saldoInsuficiente: isSaldoInsuficiente,
      }
    }

    // 2. Em caso de sucesso: recarrega os dados atualizados do cliente validando propriedade
    let clienteAtualizado: Cliente | null = null
    try {
      const reloaded = await fetchClienteByIdMultiTenant(
        clienteId,
        user?.role,
        user?.id,
        user?.authId
      )
      if (!reloaded.error && reloaded.data) {
        clienteAtualizado = reloaded.data
        get().atualizarCliente(clienteId, clienteAtualizado)
      }
    } catch (err) {
      console.warn('Falha ao recarregar dados do cliente após RPC:', err)
    }

    // 3. Atualiza o saldo de créditos do painel do agente
    if (user?.id) {
      try {
        const { data: agenteData } = await supabase
          .from('agentes')
          .select('creditos')
          .eq('id', user.id)
          .maybeSingle()

        if (agenteData && agenteData.creditos !== undefined) {
          const saldo = Number(agenteData.creditos ?? 0)
          set({ creditos: saldo })
        }
      } catch (credErr) {
        console.warn('Falha ao sincronizar créditos do agente:', credErr)
      }
    }

    return { success: true, error: null, cliente: clienteAtualizado }
  },

  setUser: (user) => {
    set((state) => ({
      user,
      creditos: user?.creditos !== undefined ? user.creditos : state.creditos,
    }))
  },

  setCreditos: (creditos) => {
    set({ creditos })
  },

  setPagamentos: (pagamentos) => {
    const user = get().user
    if (user && (user.role === 'reseller' || isResellerUser(user))) {
      const clientIds = new Set(get().clientes.map((c) => String(c.id)))
      const filtrados = pagamentos.filter(
        (p) =>
          pertenceAoParceiro(p as Record<string, unknown>, user.id, user.authId) ||
          clientIds.has(String(p.cliente_id ?? ''))
      )
      set({ pagamentos: filtrados })
      return
    }
    set({ pagamentos })
  },

  setPedidosCreditos: (pedidos) => {
    const user = get().user
    if (user && (user.role === 'reseller' || isResellerUser(user))) {
      const filtrados = pedidos.filter((p) =>
        pertenceAoParceiro(p as Record<string, unknown>, user.id, user.authId)
      )
      set({ pedidosCreditos: filtrados })
      return
    }
    set({ pedidosCreditos: pedidos })
  },

  abrirModalAcessoRestrito: () => {
    set({ modalAcessoRestritoOpen: true })
  },

  fecharModalAcessoRestrito: () => {
    set({ modalAcessoRestritoOpen: false })
  },

  setMetricasCache: (cache, timestamp) => {
    const user = get().user
    // Bloqueia armazenamento de cache executivo global caso seja revendedor
    if (user && (user.role === 'reseller' || isResellerUser(user))) {
      set({ metricasCache: null, lastFetchMetricas: null })
      return
    }
    set({
      metricasCache: cache,
      lastFetchMetricas: timestamp !== undefined ? timestamp : cache ? Date.now() : null,
    })
  },

  abrirLojaCreditos: () => {
    set({ lojaCreditosOpen: true })
  },

  fecharLojaCreditos: () => {
    set({ lojaCreditosOpen: false })
  },

  deduzirCredito: (quantidade = 1) => {
    const atual = get().creditos
    if (typeof atual === 'number') {
      const novo = Math.max(0, atual - quantidade)
      set({ creditos: novo })
    }
  },

  setClientes: (clientes) => {
    const user = get().user
    const listaSegura =
      user && (user.role === 'reseller' || isResellerUser(user))
        ? (clientes || []).filter((c) =>
            pertenceAoParceiro(c as Record<string, unknown>, user.id, user.authId)
          )
        : clientes || []
    const metrics = calcularMetricas(listaSegura)
    set({ clientes: listaSegura, metrics })
  },

  setLoading: (loading) => {
    set({ loading })
  },

  adicionarCliente: (cliente) => {
    const user = get().user
    if (
      user &&
      (user.role === 'reseller' || isResellerUser(user)) &&
      !pertenceAoParceiro(cliente as Record<string, unknown>, user.id, user.authId)
    ) {
      return
    }
    const atual = get().clientes || []
    const novaLista = [cliente, ...atual]
    const metrics = calcularMetricas(novaLista)
    set({ clientes: novaLista, metrics })
  },

  atualizarCliente: (id, updates) => {
    const user = get().user
    const atual = get().clientes || []
    const novaLista = atual.map((c) => {
      if (String(c.id) !== String(id)) return c
      if (
        user &&
        (user.role === 'reseller' || isResellerUser(user)) &&
        !pertenceAoParceiro(c as Record<string, unknown>, user.id, user.authId)
      ) {
        return c
      }
      return { ...c, ...updates }
    })
    const metrics = calcularMetricas(novaLista)
    set({ clientes: novaLista, metrics })
  },

  converterCliente: (id, dadosAssinante) => {
    const atual = get().clientes || []
    const user = get().user
    const isReseller = user ? user.role === 'reseller' || isResellerUser(user) : false

    const novaLista = atual.map((c) => {
      if (String(c.id) === String(id)) {
        if (
          isReseller &&
          user &&
          !pertenceAoParceiro(c as Record<string, unknown>, user.id, user.authId)
        ) {
          return c
        }
        return {
          ...c,
          ...dadosAssinante,
          estagio_funil: 'cliente',
          status: 'ativo',
          valor_mensal:
            dadosAssinante.valor_mensal !== undefined
              ? Number(dadosAssinante.valor_mensal)
              : c.valor_mensal,
          reseller_id: isReseller
            ? user?.id || c.reseller_id
            : (dadosAssinante.reseller_id ?? c.reseller_id),
          vendedor_id: dadosAssinante.vendedor_id || user?.authId || user?.id || c.vendedor_id,
        }
      }
      return c
    })

    const metrics = calcularMetricas(novaLista)
    set({ clientes: novaLista, metrics })
  },

  recalcularMetricas: () => {
    const metrics = calcularMetricas(get().clientes)
    set({ metrics })
  },

  clearStore: () => {
    try {
      const prevUserId = get().user?.id
      localStorage.removeItem('oneplay_servidores_cache')
      if (prevUserId) {
        localStorage.removeItem(`oneplay_servidores_cache_${prevUserId}`)
      }
    } catch {}

    set({
      user: null,
      clientes: [],
      pagamentos: [],
      pedidosCreditos: [],
      servidores: [],
      loading: false,
      metrics: {
        mrr: 0,
        clientesAtivos: 0,
        totalLeads: 0,
        leadsConvertidos: 0,
        taxaConversao: 0,
      },
      creditos: null,
      modalAcessoRestritoOpen: false,
      metricasCache: null,
      lastFetchMetricas: null,
      lojaCreditosOpen: false,
      sidebarOpen: false,
    })
  },
}))

/** Helper para sanitização imediata do estado Zustand */
export const clearStore = () => useCrmStore.getState().clearStore()
