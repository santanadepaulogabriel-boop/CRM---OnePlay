import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  BellRing,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  Headphones,
  Loader2,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RotateCw,
  Search,
  Send,
  UserCheck,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCrmStore } from '../stores/useCrmStore'
import {
  fetchClientesMultiTenant,
  getSafeHomeRoute,
  isMasterUser,
  isResellerUser,
  isUnauthorizedSupabaseError,
  pertenceAoParceiro,
  updateClienteMultiTenant,
} from '../lib/multiTenant'
import { getErrorMessage } from '../lib/errorHandler'
import { useToast } from '../contexts/ToastContext'
import { gerarLinkWhatsApp } from '../lib/whatsapp'
import {
  buildBillingMessage,
  checkInstanceStatus,
  sendMessage,
  type BillingMessageParams,
  type EvolutionInstanceStatus,
  type EvolutionSendResult,
} from '../services/evolutionApi'
import { useFeatureGating } from '../hooks/useFeatureGating'
import NovoClienteModal from '../components/NovoClienteModal'
import {
  WhatsAppMessengerModal,
  type ClienteWhatsAppModalData,
} from '../components/WhatsAppMessengerModal'
import { DashboardMetrics } from '../components/DashboardMetrics'
import {
  EmptyState,
  StatusBadge,
  type StatusSemanticVariant,
} from '../components/ui/TierOnePrimitives'

const DB = {
  nome: 'nome_completo',
  whatsapp: 'whatsapp',
  email: 'email',
  usuario: 'login_usuario',
  plano: 'plano',
  valor: 'valor_mensal',
  vencimento: 'data_vencimento',
  status: 'status',
  servidores: 'servidores',
  estagio: 'estagio_funil',
  agenteId: 'agente_id',
  emSuporte: 'em_suporte',
} as const

interface ClienteItem {
  id: string | number
  nome_completo?: string | null
  nome?: string | null
  whatsapp?: string | null
  email?: string | null
  login_usuario?: string | null
  plano?: string | null
  valor_mensal?: number | null
  data_vencimento?: string | null
  Status?: string | null
  status?: string | null
  estagio_funil?: string | null
  em_suporte?: boolean | null
  [key: string]: unknown
}

function getStatusInfo(status?: string | null): {
  label: string
  variant: StatusSemanticVariant
} {
  const st = String(status || '').trim().toLowerCase()
  if (st === 'alerta_vencimento' || st === 'alerta') {
    return { label: 'Vencendo', variant: 'vencendo' }
  }
  if (st === 'inativo' || st === 'vencido') {
    return { label: 'Vencido', variant: 'vencido' }
  }
  return { label: 'Ativo', variant: 'ativo' }
}

function parseServidores(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw
      .map((s) => (typeof s === 'string' ? s : String((s as { nome?: string }).nome || '')))
      .filter(Boolean)
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parseServidores(parsed)
    } catch {
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    }
  }
  return []
}

function RetencaoSkeleton() {
  return (
    <div className="kanban-scroll w-full overflow-x-auto pb-2">
      <div className="flex flex-nowrap items-stretch gap-4 lg:gap-5 min-w-full">
        {[1, 2, 3, 4].map((col) => (
          <div
            key={col}
            className="glass-card w-[296px] min-w-[296px] flex-1 shrink-0 rounded-2xl p-4 space-y-4 min-h-[520px]"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.07]">
              <div className="h-4 w-28 rounded bg-white/10 animate-pulse" />
              <div className="h-5 w-7 rounded-md bg-white/10 animate-pulse" />
            </div>
            {[1, 2, 3].map((card) => (
              <div
                key={card}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="h-4 w-32 rounded bg-white/10 animate-pulse" />
                  <div className="h-5 w-14 rounded-md bg-white/10 animate-pulse" />
                </div>
                <div className="h-3 w-24 rounded bg-white/5 animate-pulse" />
                <div className="flex gap-1.5">
                  <div className="h-5 w-16 rounded bg-white/5 animate-pulse" />
                  <div className="h-5 w-16 rounded bg-white/5 animate-pulse" />
                </div>
                <div className="h-8 w-full rounded-xl bg-white/5 animate-pulse" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function formatarVencimentoCliente(cliente: ClienteItem): string {
  const raw = cliente[DB.vencimento] || cliente.data_vencimento
  if (!raw) return 'em breve'
  const str = String(raw).trim()
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }
  return 'em breve'
}

export interface RetencaoProps {
  vendedorId?: string | null
  onQuickBillingDispatch?: (
    phone: string,
    params: BillingMessageParams
  ) => Promise<EvolutionSendResult>
}

export default function Retencao({
  vendedorId,
  onQuickBillingDispatch,
}: RetencaoProps = {}) {
  const { usuario, loading: loadingAuth, recarregarCreditos } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { protegerAcao } = useFeatureGating()
  const [clientes, setClientes] = useState<ClienteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [isNovoClienteOpen, setIsNovoClienteOpen] = useState(false)
  const [renewingId, setRenewingId] = useState<string | number | null>(null)
  const [updatingSuporteId, setUpdatingSuporteId] = useState<string | number | null>(null)
  const [draggedId, setDraggedId] = useState<string | number | null>(null)

  const [sendingWhatsAppId, setSendingWhatsAppId] = useState<string | number | null>(null)
  const [whatsAppCardState, setWhatsAppCardState] = useState<
    Record<string, 'success' | 'error'>
  >({})
  const [whatsAppFeedback, setWhatsAppFeedback] = useState<{
    tipo: 'sucesso' | 'erro'
    mensagem: string
  } | null>(null)
  const [whatsAppModalClient, setWhatsAppModalClient] =
    useState<ClienteWhatsAppModalData | null>(null)
  const [evolutionStatus, setEvolutionStatus] =
    useState<EvolutionInstanceStatus | null>(null)
  const [checkingEvolution, setCheckingEvolution] = useState(false)

  const resolvedAuthVendedorId = vendedorId ?? usuario?.authId ?? usuario?.id ?? null

  const verificarEvolution = useCallback(async () => {
    setCheckingEvolution(true)
    try {
      const st = await checkInstanceStatus({ userId: usuario?.id })
      setEvolutionStatus(st)
    } finally {
      setCheckingEvolution(false)
    }
  }, [usuario?.id])

  useEffect(() => {
    if (!loadingAuth && usuario) {
      void verificarEvolution()
    }
  }, [loadingAuth, usuario, verificarEvolution])

  const marcarFeedbackCardWhatsApp = useCallback(
    (id: string | number, status: 'success' | 'error') => {
      const key = String(id)
      setWhatsAppCardState((prev) => ({ ...prev, [key]: status }))
      window.setTimeout(() => {
        setWhatsAppCardState((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
      }, 4000)
    },
    []
  )

  const handleAbrirModalWhatsApp = useCallback((cliente: ClienteItem) => {
    const nomeCliente = String(cliente[DB.nome] || cliente.nome || 'Cliente')
    const whatsapp = String(cliente[DB.whatsapp] || '').trim()
    const rawStatus = cliente.Status ?? cliente.status ?? cliente[DB.status]

    setWhatsAppModalClient({
      id: cliente.id,
      nome: nomeCliente,
      whatsapp,
      vencimento: formatarVencimentoCliente(cliente),
      plano: String(cliente[DB.plano] || 'Plano Mensal'),
      valorMensal:
        cliente.valor_mensal ??
        (cliente[DB.valor] as number | string | null | undefined) ??
        null,
      status: typeof rawStatus === 'string' ? rawStatus : 'ativo',
    })
  }, [])

  const handleDispararCobranca = useCallback(
    async (cliente: ClienteItem) => {
      const nomeCliente = String(cliente[DB.nome] || cliente.nome || 'Cliente')
      const whatsapp = String(cliente[DB.whatsapp] || '').trim()

      if (!whatsapp) {
        toast.warning(
          `O assinante ${nomeCliente} não possui número de WhatsApp cadastrado.`
        )
        return
      }

      setSendingWhatsAppId(cliente.id)
      setWhatsAppFeedback(null)

      try {
        const rawStatus = cliente.Status ?? cliente.status ?? cliente[DB.status]
        const params: BillingMessageParams = {
          nome: nomeCliente,
          vencimento: formatarVencimentoCliente(cliente),
          plano: String(cliente[DB.plano] || 'Plano Mensal'),
          valorMensal:
            cliente.valor_mensal ??
            (cliente[DB.valor] as number | string | null | undefined) ??
            null,
          status: typeof rawStatus === 'string' ? rawStatus : 'ativo',
        }

        const result = onQuickBillingDispatch
          ? await onQuickBillingDispatch(whatsapp, params)
          : await sendMessage(
              whatsapp,
              buildBillingMessage(params, usuario?.id),
              { userId: usuario?.id }
            )

        if (result.success) {
          marcarFeedbackCardWhatsApp(cliente.id, 'success')
          setWhatsAppFeedback({
            tipo: 'sucesso',
            mensagem: `Mensagem de cobrança enviada para ${nomeCliente} (+${result.phone}) via Evolution API.`,
          })
          toast.success(
            `Cobrança enviada com sucesso para ${nomeCliente}!`,
            'Evolution API'
          )
        } else {
          marcarFeedbackCardWhatsApp(cliente.id, 'error')
          const detalheErro =
            result.error || result.statusMessage || 'Falha ao enviar mensagem.'
          setWhatsAppFeedback({
            tipo: 'erro',
            mensagem: `Falha ao enviar para ${nomeCliente}: ${detalheErro}`,
          })
          toast.error(detalheErro, 'Falha no Disparo WhatsApp')
        }
      } catch (err: unknown) {
        marcarFeedbackCardWhatsApp(cliente.id, 'error')
        const msg = getErrorMessage(err)
        setWhatsAppFeedback({
          tipo: 'erro',
          mensagem: `Erro na comunicação com a Evolution API: ${msg}`,
        })
        toast.error(msg, 'Erro Evolution API')
      } finally {
        setSendingWhatsAppId(null)
      }
    },
    [onQuickBillingDispatch, usuario?.id, marcarFeedbackCardWhatsApp, toast]
  )

  const carregarClientes = useCallback(async () => {
    if (loadingAuth) return
    if (!usuario) {
      setError('Sessão expirada. Por favor, acesse o sistema novamente.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const store = useCrmStore.getState()
      if (!store.user || store.user.id !== usuario.id) {
        store.setUser({
          id: usuario.id,
          authId: resolvedAuthVendedorId || usuario.authId,
          email: usuario.email,
          nome: usuario.nome,
          role: usuario.role,
          creditos: usuario.creditos ?? 0,
        })
      }

      const isReseller = isResellerUser(usuario)
      const { data, error: fetchErr } = await fetchClientesMultiTenant(
        usuario.role,
        usuario.id,
        resolvedAuthVendedorId
      )
      if (fetchErr) throw fetchErr

      const carteiraIsolada = isReseller
        ? (data ?? []).filter((c) =>
            pertenceAoParceiro(
              c as Record<string, unknown>,
              usuario.id,
              resolvedAuthVendedorId
            )
          )
        : (data ?? [])

      store.setClientes(carteiraIsolada)
      void store.carregarPagamentos()

      const assinantes = carteiraIsolada.filter((c) => {
        const estagio = String(c.estagio_funil ?? '').toLowerCase()
        return estagio !== 'lead'
      })

      setClientes(assinantes as ClienteItem[])
    } catch (err: unknown) {
      if (isUnauthorizedSupabaseError(err)) {
        toast.warning('Acesso não autorizado aos dados solicitados.', 'Isolamento de Dados')
        navigate(getSafeHomeRoute(usuario), { replace: true })
        return
      }
      const msg = getErrorMessage(err)
      setError(`Falha ao obter carteira de assinantes: ${msg}`)
      setClientes([])
      useCrmStore.getState().setClientes([])
    } finally {
      setLoading(false)
    }
  }, [usuario, loadingAuth, navigate, toast, resolvedAuthVendedorId])

  useEffect(() => {
    void carregarClientes()
  }, [carregarClientes])

  async function handleRenovarCliente(id: string | number) {
    if (!protegerAcao()) return
    setRenewingId(id)
    setError(null)

    try {
      const clienteAlvo = clientes.find((c) => String(c.id) === String(id))
      const nomeCliente = clienteAlvo
        ? String(clienteAlvo[DB.nome] || clienteAlvo.nome || 'Cliente')
        : 'Cliente'

      const res = await useCrmStore.getState().renovarAssinatura(id)

      if (!res.success) {
        if (res.unauthorized) {
          toast.warning(
            'Acesso não autorizado: este cliente não pertence à sua carteira.',
            'Isolamento de Dados'
          )
          navigate(getSafeHomeRoute(usuario), { replace: true })
          return
        }
        const msg = res.error || 'Erro ao renovar assinatura.'
        if (res.saldoInsuficiente) {
          toast.error('Saldo insuficiente para renovar. Solicite créditos na Loja de Créditos.')
        } else {
          toast.error(`Falha ao renovar assinatura: ${msg}`)
        }
        setError(msg)
        return
      }

      if (res.cliente) {
        setClientes((prev) =>
          prev.map((item) =>
            String(item.id) === String(id)
              ? {
                ...item,
                ...res.cliente,
                em_suporte: false,
                ...(String(item[DB.estagio] || '').toLowerCase() === 'suporte'
                  ? { [DB.estagio]: 'Cliente' }
                  : {}),
              }
              : item
          )
        )
      } else {
        await carregarClientes()
      }

      if (recarregarCreditos) {
        await recarregarCreditos()
      }

      toast.success(`Assinatura de ${nomeCliente} renovada com sucesso!`)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      setError(`Erro ao renovar cliente: ${msg}`)
      toast.error(`Erro inesperado ao renovar: ${msg}`)
    } finally {
      setRenewingId(null)
    }
  }

  async function handleToggleSuporte(id: string | number, estadoAtual?: boolean) {
    const clienteAlvo = clientes.find((c) => String(c.id) === String(id))
    const isAtualmenteSuporte =
      typeof estadoAtual === 'boolean'
        ? estadoAtual
        : Boolean(
          clienteAlvo?.em_suporte ||
          String(clienteAlvo?.[DB.estagio] || '').toLowerCase() === 'suporte' ||
          String(clienteAlvo?.[DB.status] || '').toLowerCase() === 'suporte'
        )

    const novoEstado = !isAtualmenteSuporte
    setUpdatingSuporteId(id)
    setError(null)

    try {
      const payload = { em_suporte: Boolean(novoEstado) }
      const { error: updErr, unauthorized } = await updateClienteMultiTenant(
        id,
        payload,
        usuario?.role,
        usuario?.id,
        usuario?.authId
      )
      if (unauthorized) {
        toast.warning('Acesso não autorizado: este cliente não pertence à sua carteira.')
        return
      }
      if (updErr) throw updErr

      setClientes((prev) =>
        prev.map((item) =>
          String(item.id) === String(id) ? { ...item, em_suporte: Boolean(novoEstado) } : item
        )
      )

      useCrmStore.getState().atualizarCliente(id, { em_suporte: Boolean(novoEstado) })

      const nome = clienteAlvo
        ? String(clienteAlvo[DB.nome] || clienteAlvo.nome || 'Cliente')
        : 'Cliente'
      toast.success(
        novoEstado
          ? `${nome} movido para Suporte Técnico (SLA: 8h).`
          : `Incidente de ${nome} resolvido e retornado à carteira.`
      )
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      setError(`Erro ao atualizar suporte técnico: ${msg}`)
    } finally {
      setUpdatingSuporteId(null)
    }
  }

  function handleDragStart(e: DragEvent, id: string | number) {
    setDraggedId(id)
    e.dataTransfer.setData('text/plain', String(id))
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd() {
    setDraggedId(null)
  }

  async function handleDropOnColumn(
    colunaDestino: 'ativos' | 'a_vencer' | 'vencidos' | 'suporte',
    e: DragEvent
  ) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain') || draggedId
    if (!id) return

    const cliente = clientes.find((c) => String(c.id) === String(id))
    if (!cliente) return

    const isSuporteAtual = Boolean(
      cliente.em_suporte ||
      String(cliente[DB.estagio] || '').toLowerCase() === 'suporte' ||
      String(cliente[DB.status] || '').toLowerCase() === 'suporte'
    )

    try {
      if (colunaDestino === 'suporte') {
        if (!isSuporteAtual) {
          await handleToggleSuporte(cliente.id, false)
        }
        return
      }

      if (isSuporteAtual) {
        await handleToggleSuporte(cliente.id, true)
      }

      const statusMapeado =
        colunaDestino === 'a_vencer'
          ? 'alerta'
          : colunaDestino === 'vencidos'
            ? 'inativo'
            : 'ativo'

      const patch = { status: statusMapeado }
      const { error: updErr, unauthorized } = await updateClienteMultiTenant(
        id,
        patch,
        usuario?.role,
        usuario?.id,
        usuario?.authId
      )
      if (unauthorized) {
        toast.warning('Acesso não autorizado: não é permitido alterar cliente de outro parceiro.')
        await carregarClientes()
        return
      }
      if (updErr) throw updErr

      setClientes((prev) =>
        prev.map((item) =>
          String(item.id) === String(id) ? { ...item, status: statusMapeado } : item
        )
      )

      useCrmStore.getState().atualizarCliente(id, patch)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      setError(`Erro ao mover cartão no Kanban: ${msg}`)
    }
  }

  const kanban = useMemo(() => {
    const q = search.trim().toLowerCase()

    const lista = (clientes || []).filter((c) => {
      if (!c) return false
      if (!q) return true
      const nome = String(c[DB.nome] || c.nome || '').toLowerCase()
      const tel = String(c[DB.whatsapp] || '').toLowerCase()
      const user = String(c[DB.usuario] || '').toLowerCase()
      const plano = String(c[DB.plano] || '').toLowerCase()
      const servidores = parseServidores(c[DB.servidores]).join(' ').toLowerCase()
      return (
        nome.includes(q) ||
        tel.includes(q) ||
        user.includes(q) ||
        plano.includes(q) ||
        servidores.includes(q)
      )
    })

    const ativos: ClienteItem[] = []
    const aVencer: ClienteItem[] = []
    const vencidos: ClienteItem[] = []
    const suporte: ClienteItem[] = []

    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    lista.forEach((c) => {
      const isEmSuporte =
        Boolean(c.em_suporte) ||
        String(c[DB.estagio] || '').toLowerCase() === 'suporte' ||
        String(c[DB.status] || '').toLowerCase() === 'suporte'

      if (isEmSuporte) {
        suporte.push(c)
        return
      }

      const dataVencStr = c[DB.vencimento] || c.data_vencimento
      if (!dataVencStr) {
        ativos.push(c)
        return
      }

      let dataFormatada = String(dataVencStr)
      if (dataFormatada.includes('/')) {
        const [dia, mes, ano] = dataFormatada.split('/')
        dataFormatada = `${ano}-${mes}-${dia}`
      }

      const dataVenc = new Date(dataFormatada)
      dataVenc.setHours(0, 0, 0, 0)

      if (isNaN(dataVenc.getTime())) {
        ativos.push(c)
        return
      }

      const diffTime = dataVenc.getTime() - hoje.getTime()
      const diasRestantes = Math.ceil(diffTime / (1000 * 3600 * 24))

      if (diasRestantes < 0) {
        vencidos.push(c)
      } else if (diasRestantes <= 7) {
        aVencer.push(c)
      } else {
        ativos.push(c)
      }
    })

    return { ativos, aVencer, vencidos, suporte }
  }, [clientes, search])

  const creditosStore = useCrmStore((state) => state.creditos)
  const creditosDisponiveis =
    typeof creditosStore === 'number' ? creditosStore : Number(usuario?.creditos ?? 0)
  const isMaster = isMasterUser(usuario)

  return (
    <div className="relative flex flex-1 min-w-0 flex-col w-full">
      {/* Barra de Ferramentas Interna de Clientes & Renovações */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs lg:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, WhatsApp, servidor..."
            className="glass-input h-9 w-full rounded-xl pl-9 pr-8 text-xs text-zinc-100 placeholder-zinc-500 outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Limpar busca"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => void verificarEvolution()}
            disabled={checkingEvolution}
            title={
              evolutionStatus?.message ||
              'Verificar estado da instância na Evolution API'
            }
            className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-all ${
              checkingEvolution
                ? 'border-white/10 bg-white/[0.04] text-zinc-300'
                : evolutionStatus?.connected
                  ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300 shadow-[0_0_16px_rgba(52,211,153,0.12)]'
                  : evolutionStatus?.state === 'unconfigured'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
            }`}
          >
            {checkingEvolution ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
            ) : evolutionStatus?.connected ? (
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <WifiOff className="h-3.5 w-3.5" />
            )}
            <span className="hidden md:inline">
              {checkingEvolution
                ? 'Verificando API...'
                : evolutionStatus?.connected
                  ? 'Evolution Online'
                  : evolutionStatus?.state === 'unconfigured'
                    ? 'API WhatsApp Pendente'
                    : 'API Offline'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (!protegerAcao()) return
              setIsNovoClienteOpen(true)
            }}
            className="btn-enterprise-primary h-9"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Novo Cliente</span>
          </button>

          <button
            type="button"
            onClick={() => void carregarClientes()}
            title="Recarregar clientes"
            className="btn-enterprise-icon"
          >
            <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {whatsAppFeedback && (
        <div className="mb-5 animate-in fade-in">
          <div
            className={`flex items-center justify-between gap-3 rounded-2xl border backdrop-blur-xl px-4 py-2.5 text-xs ${
              whatsAppFeedback.tipo === 'sucesso'
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-500/35 bg-rose-500/10 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              {whatsAppFeedback.tipo === 'sucesso' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              )}
              <span className="truncate">{whatsAppFeedback.mensagem}</span>
            </div>
            <button
              type="button"
              onClick={() => setWhatsAppFeedback(null)}
              aria-label="Fechar aviso"
              className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-5">
          <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 backdrop-blur-xl px-4 py-2.5 text-xs text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="flex-1 w-full min-w-0">
        <DashboardMetrics
          totalClientes={clientes.length}
          clientesAtivos={kanban.ativos.length + kanban.aVencer.length}
          creditosDisponiveis={isMaster ? 'Ilimitado' : creditosDisponiveis}
          statusSistema={isMaster ? 'Master Enterprise' : 'Carteira Exclusiva'}
        />
        {loading ? (
          <RetencaoSkeleton />
        ) : (
          <div className="kanban-scroll w-full overflow-x-auto pb-2 scroll-smooth">
            <div className="flex flex-nowrap items-stretch gap-4 lg:gap-5 min-w-full">
              <KanbanColumn
                colunaKey="ativos"
                titulo="Ativos"
                subtitulo="Assinaturas em dia"
                dotColor="bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse"
                badgeCount={kanban.ativos.length}
                badgeVariant="ativo"
                emptyIcon={UserCheck}
                emptyTitle="Nenhum assinante ativo"
                emptyDesc="Clique em 'Novo Cliente' ou converta leads no Funil de Vendas para iniciar sua carteira."
                onDrop={handleDropOnColumn}
              >
                {kanban.ativos.map((c) => (
                  <ClientKanbanCard
                    key={c.id}
                    cliente={c}
                    onRenovar={handleRenovarCliente}
                    onToggleSuporte={handleToggleSuporte}
                    onDispararWhatsApp={handleDispararCobranca}
                    onAbrirModalWhatsApp={handleAbrirModalWhatsApp}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    isRenewing={renewingId === c.id}
                    isUpdatingSuporte={updatingSuporteId === c.id}
                    isSendingWhatsApp={sendingWhatsAppId === c.id}
                    whatsAppCardState={whatsAppCardState[String(c.id)]}
                  />
                ))}
              </KanbanColumn>

              <KanbanColumn
                colunaKey="a_vencer"
                titulo="Vencendo"
                subtitulo="Atenção para renovação"
                dotColor="bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)] animate-pulse"
                badgeCount={kanban.aVencer.length}
                badgeVariant="vencendo"
                emptyIcon={BellRing}
                emptyTitle="Nenhum vencimento iminente"
                emptyDesc="Assinaturas próximas do vencimento aparecerão aqui automaticamente para disparo no WhatsApp."
                onDrop={handleDropOnColumn}
              >
                {kanban.aVencer.map((c) => (
                  <ClientKanbanCard
                    key={c.id}
                    cliente={c}
                    onRenovar={handleRenovarCliente}
                    onToggleSuporte={handleToggleSuporte}
                    onDispararWhatsApp={handleDispararCobranca}
                    onAbrirModalWhatsApp={handleAbrirModalWhatsApp}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    isRenewing={renewingId === c.id}
                    isUpdatingSuporte={updatingSuporteId === c.id}
                    isSendingWhatsApp={sendingWhatsAppId === c.id}
                    whatsAppCardState={whatsAppCardState[String(c.id)]}
                  />
                ))}
              </KanbanColumn>

              <KanbanColumn
                colunaKey="vencidos"
                titulo="Inativos"
                subtitulo="Assinaturas expiradas"
                dotColor="bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]"
                badgeCount={kanban.vencidos.length}
                badgeVariant="vencido"
                emptyIcon={CheckCircle2}
                emptyTitle="Zero assinaturas expiradas"
                emptyDesc="Sua retenção está impecável! Nenhum cliente encontra-se vencido ou inativo."
                onDrop={handleDropOnColumn}
              >
                {kanban.vencidos.map((c) => (
                  <ClientKanbanCard
                    key={c.id}
                    cliente={c}
                    onRenovar={handleRenovarCliente}
                    onToggleSuporte={handleToggleSuporte}
                    onDispararWhatsApp={handleDispararCobranca}
                    onAbrirModalWhatsApp={handleAbrirModalWhatsApp}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    isRenewing={renewingId === c.id}
                    isUpdatingSuporte={updatingSuporteId === c.id}
                    isSendingWhatsApp={sendingWhatsAppId === c.id}
                    whatsAppCardState={whatsAppCardState[String(c.id)]}
                  />
                ))}
              </KanbanColumn>

              <KanbanColumn
                colunaKey="suporte"
                titulo="Suporte Técnico"
                subtitulo="Incidentes em aberto"
                dotColor="bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.85)] animate-pulse"
                slaTag="SLA 8h"
                badgeCount={kanban.suporte.length}
                badgeVariant="suporte"
                emptyIcon={Headphones}
                emptyTitle="Fila de suporte zerada"
                emptyDesc="Arraste qualquer cliente para cá ou acione o ícone de fone no cartão ao abrir um chamado."
                onDrop={handleDropOnColumn}
              >
                {kanban.suporte.map((c) => (
                  <ClientKanbanCard
                    key={c.id}
                    cliente={c}
                    isInSuporte
                    onRenovar={handleRenovarCliente}
                    onToggleSuporte={handleToggleSuporte}
                    onDispararWhatsApp={handleDispararCobranca}
                    onAbrirModalWhatsApp={handleAbrirModalWhatsApp}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    isRenewing={renewingId === c.id}
                    isUpdatingSuporte={updatingSuporteId === c.id}
                    isSendingWhatsApp={sendingWhatsAppId === c.id}
                    whatsAppCardState={whatsAppCardState[String(c.id)]}
                  />
                ))}
              </KanbanColumn>
            </div>
          </div>
        )}
      </div>

      <NovoClienteModal
        open={isNovoClienteOpen}
        onClose={() => setIsNovoClienteOpen(false)}
        onCreated={() => void carregarClientes()}
      />

      <WhatsAppMessengerModal
        isOpen={Boolean(whatsAppModalClient)}
        onClose={() => setWhatsAppModalClient(null)}
        cliente={whatsAppModalClient}
        onSentSuccess={(clienteId) => {
          if (clienteId != null) {
            marcarFeedbackCardWhatsApp(clienteId, 'success')
          }
        }}
      />
    </div>
  )
}

interface KanbanColumnProps {
  colunaKey: 'ativos' | 'a_vencer' | 'vencidos' | 'suporte'
  titulo: string
  subtitulo: string
  dotColor: string
  badgeCount: number
  badgeVariant: StatusSemanticVariant
  slaTag?: string
  emptyIcon: LucideIcon
  emptyTitle: string
  emptyDesc: string
  children: React.ReactNode
  onDrop: (coluna: 'ativos' | 'a_vencer' | 'vencidos' | 'suporte', e: DragEvent) => void
}

function KanbanColumn({
  colunaKey,
  titulo,
  subtitulo,
  dotColor,
  badgeCount,
  badgeVariant,
  slaTag,
  emptyIcon,
  emptyTitle,
  emptyDesc,
  children,
  onDrop,
}: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        setIsDragOver(false)
        onDrop(colunaKey, e)
      }}
      className={`glass-card relative overflow-hidden flex flex-col w-[296px] min-w-[296px] flex-1 shrink-0 rounded-2xl p-4 min-h-[520px] max-h-[calc(100vh-18rem)] transition-all duration-300 ${isDragOver
          ? 'border-cyan-500/50 ring-2 ring-cyan-500/20 shadow-[0_0_24px_rgba(34,211,238,0.18)]'
          : ''
        }`}
    >
      <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-radial from-cyan-500/10 to-transparent" />

      <div className="relative pb-3 mb-3.5 border-b border-white/5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${dotColor}`} />
            <h2 className="text-xs font-semibold tracking-tight text-zinc-100">{titulo}</h2>
          </div>

          <div className="flex items-center gap-1.5">
            {slaTag && (
              <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-300">
                <Clock className="h-2.5 w-2.5" />
                <span>{slaTag}</span>
              </span>
            )}
            <StatusBadge variant={badgeVariant} label={badgeCount} showDot={false} />
          </div>
        </div>

        <p className="text-xs text-zinc-400 mt-1.5">{subtitulo}</p>
      </div>

      <div className="relative flex-1 space-y-3 overflow-y-auto pr-0.5">
        {badgeCount === 0 ? (
          <EmptyState
            compact
            icon={emptyIcon}
            title={emptyTitle}
            description={emptyDesc}
            className="bg-white/[0.01] border-white/5 shadow-none"
          />
        ) : (
          children
        )}
      </div>
    </div>
  )
}

interface ClientKanbanCardProps {
  cliente: ClienteItem
  isInSuporte?: boolean
  isRenewing: boolean
  isUpdatingSuporte: boolean
  isSendingWhatsApp: boolean
  whatsAppCardState?: 'success' | 'error'
  onRenovar: (id: string | number) => void
  onToggleSuporte: (id: string | number, estadoAtual?: boolean) => void
  onDispararWhatsApp: (cliente: ClienteItem) => Promise<void> | void
  onAbrirModalWhatsApp: (cliente: ClienteItem) => void
  onDragStart: (e: DragEvent, id: string | number) => void
  onDragEnd: () => void
}

function ClientKanbanCard({
  cliente,
  isInSuporte = false,
  isRenewing,
  isUpdatingSuporte,
  isSendingWhatsApp,
  whatsAppCardState,
  onRenovar,
  onToggleSuporte,
  onDispararWhatsApp,
  onAbrirModalWhatsApp,
  onDragStart,
  onDragEnd,
}: ClientKanbanCardProps) {
  const toast = useToast()
  const { protegerAcao } = useFeatureGating()
  const [menuOpen, setMenuOpen] = useState(false)
  const cardRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleOutside = (ev: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(ev.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [menuOpen])

  const nomeCliente = String(cliente[DB.nome] || cliente.nome || 'Sem Nome')
  const whatsapp = String(cliente[DB.whatsapp] || '')
  const plano = String(cliente[DB.plano] || 'Mensal')
  const servidores = parseServidores(cliente[DB.servidores])
  const isSuporteAtivo = Boolean(cliente.em_suporte) || isInSuporte

  const rawVenc = cliente[DB.vencimento] ? new Date(String(cliente[DB.vencimento])) : null
  const dataFormatada =
    rawVenc && !isNaN(rawVenc.getTime())
      ? rawVenc.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : 'Sem data'

  const rawStatus = cliente.Status ?? cliente.status ?? cliente[DB.status]
  const statusLower = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : 'ativo'
  const statusInfo = getStatusInfo(statusLower)
  const valorMensal = cliente.valor_mensal ?? cliente[DB.valor]

  const isDestaqueWhatsApp =
    statusLower === 'alerta_vencimento' ||
    statusLower === 'alerta' ||
    statusLower === 'inativo' ||
    statusLower === 'vencido'

  const linkWhatsApp = gerarLinkWhatsApp({
    ...cliente,
    nome: nomeCliente,
    whatsapp: whatsapp || String(cliente[DB.whatsapp] || ''),
    status: statusLower,
  })

  return (
    <article
      ref={cardRef}
      draggable
      onDragStart={(e) => onDragStart(e, cliente.id)}
      onDragEnd={onDragEnd}
      className={`glass-card neon-hover group relative rounded-2xl p-4 cursor-grab active:cursor-grabbing ${isSuporteAtivo
          ? '!border-violet-500/35'
          : ''
        }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <Link
            to={`/cliente/${cliente.id}`}
            className="text-sm font-medium text-zinc-100 hover:text-cyan-400 transition-colors truncate flex items-center gap-1.5"
            title={`Abrir ficha de ${nomeCliente}`}
          >
            <span className="truncate">{nomeCliente}</span>
            <ExternalLink className="h-3 w-3 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          </Link>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500 tabular-nums [font-variant-numeric:tabular-nums]">
            <span className="font-mono">#{String(cliente.id).slice(-4)}</span>
            {whatsapp && (
              <>
                <span>•</span>
                <span className="font-mono truncate">{whatsapp}</span>
              </>
            )}
          </div>
        </div>

        <div className="relative flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onAbrirModalWhatsApp(cliente)}
            className="rounded-lg p-1.5 text-zinc-500 opacity-0 group-hover:opacity-100 hover:bg-emerald-500/10 hover:text-emerald-300 transition-all"
            title="Personalizar mensagem de renovação / WhatsApp"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            disabled={isUpdatingSuporte}
            onClick={() => onToggleSuporte(cliente.id, isSuporteAtivo)}
            className={`rounded-lg p-1.5 transition-all ${isSuporteAtivo
                ? 'border border-violet-500/40 bg-violet-500/15 text-violet-300'
                : 'text-zinc-500 opacity-0 group-hover:opacity-100 hover:bg-white/5 hover:text-violet-300'
              }`}
            title={
              isSuporteAtivo
                ? 'Resolver incidente e retornar à carteira'
                : 'Mover para Suporte Técnico'
            }
          >
            {isUpdatingSuporte ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />
            ) : (
              <Headphones className="h-3.5 w-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 transition-colors"
            title="Opções do cliente"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div className="glass-modal absolute right-0 top-8 z-20 w-52 rounded-xl p-1.5 animate-in fade-in zoom-in-95">
              <Link
                to={`/cliente/${cliente.id}`}
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-zinc-100 transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
                <span>Ver Ficha Completa</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  onAbrirModalWhatsApp(cliente)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-emerald-300 transition-colors"
              >
                <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
                <span>Modal de Cobrança (API)</span>
              </button>
              <button
                type="button"
                disabled={isUpdatingSuporte}
                onClick={() => {
                  setMenuOpen(false)
                  onToggleSuporte(cliente.id, isSuporteAtivo)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-violet-300 transition-colors"
              >
                <Headphones className="h-3.5 w-3.5 text-violet-400" />
                <span>{isSuporteAtivo ? 'Concluir Suporte' : 'Abrir Suporte (SLA 8h)'}</span>
              </button>
              <a
                href={linkWhatsApp || '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  setMenuOpen(false)
                  if (!linkWhatsApp) {
                    e.preventDefault()
                    toast.warning(`O cliente ${nomeCliente} não possui WhatsApp cadastrado.`)
                  }
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-zinc-200 transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5 text-zinc-400" />
                <span>Abrir WhatsApp Web</span>
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-zinc-400 flex items-center gap-1 tabular-nums [font-variant-numeric:tabular-nums]">
          <Clock className="h-3 w-3 text-cyan-400/70 shrink-0" />
          <span>Venc. {dataFormatada}</span>
        </span>

        <StatusBadge
          variant={isSuporteAtivo ? 'suporte' : statusInfo.variant}
          label={isSuporteAtivo ? 'Suporte' : statusInfo.label}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-zinc-200">
          {plano}
        </span>

        {valorMensal != null && (
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-mono text-zinc-200 tabular-nums [font-variant-numeric:tabular-nums]">
            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
              Number(valorMensal)
            )}
          </span>
        )}

        {servidores.slice(0, 2).map((srv, idx) => (
          <span
            key={idx}
            className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-0.5 text-[11px] text-zinc-300 truncate max-w-[120px]"
            title={srv}
          >
            {srv}
          </span>
        ))}
      </div>

      <div className="mt-3.5 pt-3 border-t border-white/[0.07] grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
        <button
          type="button"
          disabled={isSendingWhatsApp}
          onClick={() => void onDispararWhatsApp(cliente)}
          className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-medium whitespace-nowrap transition-all duration-200 hover:-translate-y-0.5 shrink-0 disabled:opacity-60 disabled:hover:translate-y-0 ${
            whatsAppCardState === 'success'
              ? 'border border-emerald-400/50 bg-emerald-500/25 text-emerald-200 shadow-[0_0_16px_rgba(52,211,153,0.28)]'
              : whatsAppCardState === 'error'
                ? 'border border-rose-500/45 bg-rose-500/20 text-rose-200 shadow-[0_0_14px_rgba(244,63,94,0.22)]'
                : isDestaqueWhatsApp
                  ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 hover:shadow-[0_0_16px_rgba(52,211,153,0.22)]'
                  : 'border border-white/10 bg-white/[0.04] text-zinc-200 hover:border-emerald-500/35 hover:bg-emerald-500/10 hover:text-emerald-200'
          }`}
          title="Enviar mensagem de cobrança/renovação via Evolution API"
        >
          {isSendingWhatsApp ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-300 shrink-0" />
              <span>Enviando...</span>
            </>
          ) : whatsAppCardState === 'success' ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
              <span>Enviado!</span>
            </>
          ) : whatsAppCardState === 'error' ? (
            <>
              <AlertCircle className="h-3.5 w-3.5 text-rose-300 shrink-0" />
              <span>Falha</span>
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>Cobrar</span>
            </>
          )}
        </button>

        <button
          type="button"
          disabled={isRenewing}
          onClick={() => {
            if (!protegerAcao()) return
            void onRenovar(cliente.id)
          }}
          className="inline-flex h-8 w-full min-w-0 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-100 whitespace-nowrap transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-500/35 hover:bg-cyan-500/15 hover:text-cyan-200 hover:shadow-[0_0_18px_rgba(34,211,238,0.18)] disabled:opacity-50"
          title="Renovar assinatura (+30 dias)"
        >
          {isRenewing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400 shrink-0" />
          ) : (
            <RotateCw className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
          )}
          <span className="truncate">{isRenewing ? 'Renovando...' : 'Renovar'}</span>
        </button>
      </div>
    </article>
  )
}