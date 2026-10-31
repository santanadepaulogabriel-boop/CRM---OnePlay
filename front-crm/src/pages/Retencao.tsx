import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Clock,
  ExternalLink,
  Headphones,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RotateCw,
  Search,
  UserCheck,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCrmStore } from '../stores/useCrmStore'
import {
  getSafeHomeRoute,
  isMasterUser,
  isUnauthorizedSupabaseError,
  updateClienteMultiTenant,
} from '../lib/multiTenant'
import { getErrorMessage } from '../lib/errorHandler'
import { useToast } from '../contexts/ToastContext'
import { gerarLinkWhatsApp } from '../lib/whatsapp'
import { useFeatureGating } from '../hooks/useFeatureGating'
import NovoClienteModal from '../components/NovoClienteModal'
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
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
      {[1, 2, 3, 4].map((col) => (
        <div
          key={col}
          className="rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl p-4 space-y-4 min-h-[540px]"
        >
          <div className="flex items-center justify-between pb-3 border-b border-white/5">
            <div className="h-4 w-28 rounded bg-white/10 animate-pulse" />
            <div className="h-5 w-7 rounded-md bg-white/10 animate-pulse" />
          </div>
          {[1, 2, 3].map((card) => (
            <div
              key={card}
              className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3"
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
  )
}

export default function Retencao() {
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
          authId: usuario.authId,
          email: usuario.email,
          nome: usuario.nome,
          role: usuario.role,
          creditos: usuario.creditos ?? 0,
        })
      }

      const { data, error: fetchErr } = await useCrmStore.getState().carregarClientes()
      if (fetchErr) throw fetchErr

      void useCrmStore.getState().carregarPagamentos()

      const assinantes = (data ?? []).filter((c) => {
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
  }, [usuario, loadingAuth, navigate, toast])

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

        <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
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
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    isRenewing={renewingId === c.id}
                    isUpdatingSuporte={updatingSuporteId === c.id}
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
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    isRenewing={renewingId === c.id}
                    isUpdatingSuporte={updatingSuporteId === c.id}
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
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    isRenewing={renewingId === c.id}
                    isUpdatingSuporte={updatingSuporteId === c.id}
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
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    isRenewing={renewingId === c.id}
                    isUpdatingSuporte={updatingSuporteId === c.id}
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
  onRenovar: (id: string | number) => void
  onToggleSuporte: (id: string | number, estadoAtual?: boolean) => void
  onDragStart: (e: DragEvent, id: string | number) => void
  onDragEnd: () => void
}

function ClientKanbanCard({
  cliente,
  isInSuporte = false,
  isRenewing,
  isUpdatingSuporte,
  onRenovar,
  onToggleSuporte,
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
            <div className="absolute right-0 top-8 z-20 w-48 rounded-xl border border-white/10 bg-[#06080d]/95 backdrop-blur-2xl p-1.5 shadow-[0_8px_32px_0_rgba(0,0,0,0.55)] animate-in fade-in zoom-in-95">
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
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-emerald-400 transition-colors"
              >
                <MessageCircle className="h-3.5 w-3.5 text-emerald-400" />
                <span>Enviar Mensagem WhatsApp</span>
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
            className="rounded-md border border-white/5 bg-[#030509]/70 px-2 py-0.5 text-[11px] text-zinc-400 truncate max-w-[120px]"
            title={srv}
          >
            {srv}
          </span>
        ))}
      </div>

      <div className="mt-3.5 pt-3 border-t border-white/5 flex items-center gap-2">
        <a
          href={linkWhatsApp || '#'}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            if (!linkWhatsApp) {
              e.preventDefault()
              toast.warning(`O cliente ${nomeCliente} não possui telefone de WhatsApp cadastrado.`)
            }
          }}
          className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium transition-all duration-300 hover:-translate-y-0.5 shrink-0 ${isDestaqueWhatsApp
              ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 hover:shadow-[0_0_16px_rgba(52,211,153,0.25)]'
              : 'border border-white/10 bg-white/[0.03] text-zinc-300 hover:border-cyan-500/30 hover:text-zinc-100'
            }`}
          title="Disparar mensagem no WhatsApp"
        >
          <MessageCircle className="h-3.5 w-3.5 text-emerald-400" />
          <span>Cobrar</span>
        </a>

        <button
          type="button"
          disabled={isRenewing}
          onClick={() => {
            if (!protegerAcao()) return
            void onRenovar(cliente.id)
          }}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-100 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:bg-cyan-500/15 hover:text-cyan-200 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] disabled:opacity-50"
          title="Renovar assinatura (+30 dias)"
        >
          {isRenewing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
          ) : (
            <RotateCw className="h-3.5 w-3.5 text-cyan-400" />
          )}
          <span>{isRenewing ? 'Renovando...' : 'Renovar'}</span>
        </button>
      </div>
    </article>
  )
}