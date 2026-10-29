import { supabase } from './supabase'
import { useCrmStore } from '../stores/useCrmStore'
import { isMasterUser } from './multiTenant'

export interface CompraCredito {
  id: string
  reseller_id?: string | null
  tenant_id: string
  agente_id?: string | null
  agente_nome?: string | null
  agente_email?: string | null
  pacote: string
  quantidade: number
  valor: number
  status: 'pendente' | 'aprovado' | 'cancelado'
  created_at: string
  aprovado_em?: string | null
  aprovado_por?: string | null
}

export const CHAVE_PIX_ESTATICA_MASTER = 'pix.master@oneplay.live'
export const TITULAR_PIX_MASTER = 'OnePlay Soluções Digitais Ltda'
const BASE_STORAGE_KEY = 'oneplay_historico_compras_local'

function getScopedStorageKey(partnerId?: string | null): string {
  const clean = String(partnerId || '').trim()
  return clean ? `${BASE_STORAGE_KEY}_${clean}` : BASE_STORAGE_KEY
}

function getLocalCompras(partnerId?: string | null): CompraCredito[] {
  try {
    const raw = localStorage.getItem(getScopedStorageKey(partnerId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveLocalCompras(items: CompraCredito[], partnerId?: string | null) {
  try {
    localStorage.setItem(getScopedStorageKey(partnerId), JSON.stringify(items))
  } catch (err) {
    console.warn('Erro ao salvar no localStorage:', err)
  }
}

/**
 * Registra novo pedido de compra de créditos com status 'pendente' e posse estrita (`reseller_id`).
 */
export async function registrarPedidoCreditos(dados: {
  reseller_id?: string
  tenant_id: string
  agente_id?: string
  agente_nome: string
  agente_email: string
  pacote: string
  quantidade: number
  valor: number
}): Promise<{ pedido: CompraCredito; error: string | null }> {
  const partnerId = dados.reseller_id || dados.agente_id || dados.tenant_id

  const novoPedido: CompraCredito = {
    id: `compra-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    reseller_id: partnerId,
    tenant_id: dados.tenant_id,
    agente_id: dados.agente_id || partnerId,
    agente_nome: dados.agente_nome,
    agente_email: dados.agente_email,
    pacote: dados.pacote,
    quantidade: dados.quantidade,
    valor: dados.valor,
    status: 'pendente',
    created_at: new Date().toISOString(),
  }

  try {
    const fullPayload = {
      reseller_id: novoPedido.reseller_id,
      tenant_id: novoPedido.tenant_id,
      agente_id: novoPedido.agente_id,
      agente_nome: novoPedido.agente_nome,
      agente_email: novoPedido.agente_email,
      pacote: novoPedido.pacote,
      quantidade: novoPedido.quantidade,
      valor: novoPedido.valor,
      status: 'pendente' as const,
      created_at: novoPedido.created_at,
    }

    let res = await supabase.from('historico_compras').insert(fullPayload).select().single()

    if (res.error && res.error.message.toLowerCase().includes('reseller_id')) {
      const { reseller_id: _omit, ...legacyPayload } = fullPayload
      void _omit
      res = await supabase.from('historico_compras').insert(legacyPayload).select().single()
    }

    if (!res.error && res.data) {
      novoPedido.id = res.data.id
    } else if (res.error) {
      console.warn(
        'Aviso ao persistir no Supabase historico_compras (usando fallback local isolado):',
        res.error.message
      )
    }
  } catch (err) {
    console.warn('Falha na chamada supabase.from(historico_compras):', err)
  }

  // Persiste apenas no escopo isolado do parceiro
  const locais = getLocalCompras(partnerId)
  saveLocalCompras(
    [novoPedido, ...locais.filter((i) => i.id !== novoPedido.id)],
    partnerId
  )

  return { pedido: novoPedido, error: null }
}

/**
 * Lista pedidos pendentes de aprovação EXCLUSIVAMENTE para a Central do Master.
 * Contas de revendedor são bloqueadas imediatamente (Defense-in-Depth).
 */
export async function listarPedidosPendentes(): Promise<{
  pedidos: CompraCredito[]
  error: string | null
}> {
  const currentUser = useCrmStore.getState().user
  if (!isMasterUser(currentUser)) {
    return {
      pedidos: [],
      error: 'Acesso negado: apenas a conta Master pode listar solicitações globais.',
    }
  }

  let pedidosSupabase: CompraCredito[] = []
  let errorMsg: string | null = null

  try {
    const { data, error } = await supabase
      .from('historico_compras')
      .select('*')
      .eq('status', 'pendente')
      .order('created_at', { ascending: false })

    if (error) {
      errorMsg = error.message
      console.warn('Aviso ao consultar historico_compras no Supabase:', error.message)
    } else if (Array.isArray(data)) {
      pedidosSupabase = data as CompraCredito[]
    }
  } catch (err: unknown) {
    console.warn('Erro ao consultar tabela historico_compras:', err)
  }

  pedidosSupabase.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )

  return { pedidos: pedidosSupabase, error: errorMsg }
}

/**
 * Executa a liberação num clique (EXCLUSIVO MASTER):
 * 1. Valida privilégio Master
 * 2. Dispara a RPC processar_pagamento_pix(tenant_id, pacote, valor)
 * 3. Atualiza o status em historico_compras para 'aprovado'
 */
export async function aprovarPedidoPix(
  pedido: CompraCredito,
  masterId?: string
): Promise<{ sucesso: boolean; novoSaldo?: number; error?: string }> {
  const currentUser = useCrmStore.getState().user
  if (!isMasterUser(currentUser)) {
    return {
      sucesso: false,
      error: 'Operação bloqueada: apenas a administração Master pode aprovar créditos.',
    }
  }

  const targetPartnerId = pedido.reseller_id || pedido.agente_id || pedido.tenant_id
  if (!targetPartnerId) {
    return { sucesso: false, error: 'Identificador do revendedor ausente.' }
  }

  const agora = new Date().toISOString()
  let rpcExecutada = false
  let novoSaldoCalculado: number | undefined

  // 1. Executa a RPC processar_pagamento_pix(tenant_id, pacote, valor)
  try {
    const { data, error: rpcError } = await supabase.rpc('processar_pagamento_pix', {
      tenant_id: targetPartnerId,
      pacote: pedido.quantidade,
      valor: pedido.valor,
    })

    if (!rpcError) {
      rpcExecutada = true
      if (data && typeof data === 'object' && 'novo_saldo' in data) {
        novoSaldoCalculado = Number((data as { novo_saldo: number }).novo_saldo)
      }
    } else {
      const { data: dataAlt, error: rpcAltError } = await supabase.rpc('processar_pagamento_pix', {
        p_tenant_id: targetPartnerId,
        p_pacote: pedido.quantidade,
        p_valor: pedido.valor,
      })
      if (!rpcAltError) {
        rpcExecutada = true
        if (dataAlt && typeof dataAlt === 'object' && 'novo_saldo' in dataAlt) {
          novoSaldoCalculado = Number((dataAlt as { novo_saldo: number }).novo_saldo)
        }
      } else {
        console.warn('Aviso na execução da RPC processar_pagamento_pix:', rpcAltError.message)
      }
    }
  } catch (err) {
    console.warn('Erro ao chamar RPC processar_pagamento_pix:', err)
  }

  // 2. Fallback atômico direto se a RPC não estiver criada no banco ainda
  if (!rpcExecutada || novoSaldoCalculado === undefined) {
    try {
      const { data: agenteData } = await supabase
        .from('agentes')
        .select('creditos')
        .eq('id', targetPartnerId)
        .single()

      const saldoAtual = Number(agenteData?.creditos ?? 0)
      novoSaldoCalculado = saldoAtual + pedido.quantidade

      await supabase
        .from('agentes')
        .update({ creditos: novoSaldoCalculado })
        .eq('id', targetPartnerId)
    } catch (errSync) {
      console.warn('Erro ao atualizar créditos na tabela agentes:', errSync)
    }
  }

  // 3. Atualiza o status em historico_compras para 'aprovado'
  try {
    await supabase
      .from('historico_compras')
      .update({
        status: 'aprovado',
        aprovado_em: agora,
        aprovado_por: masterId || null,
      })
      .eq('id', pedido.id)
  } catch (errDb) {
    console.warn('Erro ao atualizar historico_compras para aprovado:', errDb)
  }

  // 4. Sincroniza cache local isolado caso exista
  const locais = getLocalCompras(targetPartnerId)
  if (locais.length > 0) {
    const atualizados = locais.map((item) =>
      item.id === pedido.id
        ? {
            ...item,
            status: 'aprovado' as const,
            aprovado_em: agora,
            aprovado_por: masterId || null,
          }
        : item
    )
    saveLocalCompras(atualizados, targetPartnerId)
  }

  return { sucesso: true, novoSaldo: novoSaldoCalculado }
}
