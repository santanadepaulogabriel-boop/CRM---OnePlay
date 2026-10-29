import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  Handshake,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  TrendingUp,
  UserPlus,
  X,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Sidebar } from '../components/Sidebar'
import { useCrmStore } from '../stores/useCrmStore'
import {
  buildResellerOwnershipFields,
  getSafeHomeRoute,
  insertClienteMultiTenant,
  isUnauthorizedSupabaseError,
  updateClienteMultiTenant,
} from '../lib/multiTenant'
import { SmartBanner } from '../components/SmartBanner'
import { SystemClock } from '../components/SystemClock'
import { useToast } from '../contexts/ToastContext'
import { getErrorMessage } from '../lib/errorHandler'
import { useFeatureGating } from '../hooks/useFeatureGating'
import { HamburgerButton } from '../components/HamburgerButton'
import {
  EmptyState,
  StatusBadge,
  type StatusSemanticVariant,
} from '../components/ui/TierOnePrimitives'

interface ClienteFunil {
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
  status?: string | null
  estagio_funil?: string | null
  servidores?: unknown
  vendedor_id?: string | null
  agente_id?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

type EstagioFunil = 'lead' | 'teste' | 'followup' | 'negociacao'

const COLUNAS_FUNIL: {
  key: EstagioFunil
  titulo: string
  subtitulo: string
  dot: string
  badgeVariant: StatusSemanticVariant
  emptyIcon: LucideIcon
  emptyTitle: string
  emptyDesc: string
}[] = [
    {
      key: 'lead',
      titulo: 'Novos Leads',
      subtitulo: 'Contato inicial',
      dot: 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.85)] animate-pulse',
      badgeVariant: 'teste',
      emptyIcon: UserPlus,
      emptyTitle: 'Sem novos leads na fila',
      emptyDesc: 'Clique em "Novo Lead" no topo ou conecte seu webhook para captar interessados.',
    },
    {
      key: 'teste',
      titulo: 'Testes Ativos',
      subtitulo: 'Avaliação de sinal',
      dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)] animate-pulse',
      badgeVariant: 'vencendo',
      emptyIcon: FlaskConical,
      emptyTitle: 'Nenhum teste em andamento',
      emptyDesc: 'Libere um Teste Express de 4h ou 24h em um lead para acompanhá-lo aqui.',
    },
    {
      key: 'followup',
      titulo: 'Follow-up',
      subtitulo: 'Acompanhamento pós-teste',
      dot: 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.85)]',
      badgeVariant: 'suporte',
      emptyIcon: Sparkles,
      emptyTitle: 'Fila de follow-up limpa',
      emptyDesc: 'Arraste cartões pós-teste para cá enquanto aguarda o retorno do cliente.',
    },
    {
      key: 'negociacao',
      titulo: 'Negociação',
      subtitulo: 'Proposta e fechamento',
      dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse',
      badgeVariant: 'ativo',
      emptyIcon: Handshake,
      emptyTitle: 'Pronto para fechamentos',
      emptyDesc: 'Mova leads em fase final de pagamento PIX e clique em "Converter em Assinante".',
    },
  ]

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

const modalInputClass =
  'mt-1.5 w-full rounded-xl border border-white/10 bg-[#030509]/70 px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20'

function getTesteUrgency(
  vencimentoIso: string | null | undefined,
  nowMs: number
): { label: string; variant: StatusSemanticVariant } {
  if (!vencimentoIso) {
    return {
      label: 'Sem prazo definido',
      variant: 'neutral',
    }
  }
  const diff = new Date(vencimentoIso).getTime() - nowMs

  if (diff <= 0) {
    return {
      label: 'Teste expirado',
      variant: 'vencido',
    }
  }

  const hours = Math.floor(diff / HOUR_MS)
  const minutes = Math.floor((diff % HOUR_MS) / 60000)

  if (hours < 2) {
    return {
      label: `Expira em ${hours}h ${minutes}m`,
      variant: 'vencendo',
    }
  }

  return {
    label: `Expira em ${hours}h ${minutes}m`,
    variant: 'teste',
  }
}

function cleanPhone(phone?: string | null): string {
  if (!phone) return ''
  return phone.replace(/\D/g, '')
}

function KanbanSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
      {[1, 2, 3, 4].map((col) => (
        <div
          key={col}
          className="rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl p-4 space-y-4 min-h-[520px]"
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
                <div className="h-3.5 w-10 rounded bg-white/10 animate-pulse" />
              </div>
              <div className="h-3 w-24 rounded bg-white/5 animate-pulse" />
              <div className="h-8 w-full rounded-xl bg-white/5 animate-pulse" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export default function Funil() {
  const { usuario, loading: loadingAuth } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const { protegerAcao } = useFeatureGating()
  const [clientes, setClientes] = useState<ClienteFunil[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [referenceNow, setReferenceNow] = useState<number>(() => Date.now())

  // Operações / Modais / Menu Secundário
  const [draggedId, setDraggedId] = useState<string | number | null>(null)
  const [dragOverCol, setDragOverCol] = useState<EstagioFunil | null>(null)
  const [convertingCliente, setConvertingCliente] = useState<ClienteFunil | null>(null)
  const [startingTestId, setStartingTestId] = useState<string | number | null>(null)
  const [isNovoLeadOpen, setIsNovoLeadOpen] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<string | number | null>(null)
  const menuContainerRef = useRef<HTMLDivElement | null>(null)

  const [faturaForm, setFaturaForm] = useState({
    valor: 35,
    plano: 'Mensal',
    formaPagamento: 'PIX',
    vencimentoDias: 30,
  })

  const [novoLeadForm, setNovoLeadForm] = useState({
    nome: '',
    whatsapp: '',
    email: '',
    estagio: 'lead' as EstagioFunil,
    observacoes: '',
  })

  useEffect(() => {
    const handleClickOutside = (ev: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(ev.target as Node)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const carregarDados = useCallback(async () => {
    if (loadingAuth) return

    if (!usuario) {
      setClientes([])
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

      const { data, error: err } = await useCrmStore.getState().carregarClientes()
      if (err) {
        throw new Error(`Falha ao obter oportunidades: ${err.message}`)
      }

      const lista = (data || []) as ClienteFunil[]
      setClientes(lista)
      setReferenceNow(Date.now())
    } catch (err: unknown) {
      if (isUnauthorizedSupabaseError(err)) {
        toast.warning('Acesso não autorizado aos dados solicitados.', 'Isolamento de Dados')
        navigate(getSafeHomeRoute(usuario), { replace: true })
        return
      }
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Erro ao carregar Funil:', msg)
      setClientes([])
      useCrmStore.getState().setClientes([])
      setError(msg || 'Erro de conexão com o banco de dados.')
    } finally {
      setLoading(false)
    }
  }, [usuario, loadingAuth, navigate, toast])

  useEffect(() => {
    void carregarDados()
  }, [carregarDados])

  const funilClassificado = useMemo(() => {
    const list = Array.isArray(clientes) ? clientes : []
    const term = busca.trim().toLowerCase()

    const filtrados = list.filter((c) => {
      const estagio = String(c?.estagio_funil || '').trim().toLowerCase()
      const status = String(c?.status || '').trim().toLowerCase()
      if (
        estagio === 'cliente' ||
        (status === 'ativo' && !['lead', 'teste', 'followup', 'negociacao'].includes(estagio))
      ) {
        return false
      }

      if (!term) return true
      const nome = String(c?.nome_completo || c?.nome || '').toLowerCase()
      const zap = String(c?.whatsapp || '').toLowerCase()
      const email = String(c?.email || '').toLowerCase()
      return nome.includes(term) || zap.includes(term) || email.includes(term)
    })

    const agrupados: Record<EstagioFunil, ClienteFunil[]> = {
      lead: [],
      teste: [],
      followup: [],
      negociacao: [],
    }

    filtrados.forEach((c) => {
      const e = (String(c?.estagio_funil || '').trim().toLowerCase() || 'lead') as EstagioFunil
      if (agrupados[e]) {
        agrupados[e].push(c)
      } else {
        agrupados.lead.push(c)
      }
    })

    return agrupados
  }, [clientes, busca])

  const handleDragStart = (e: DragEvent, id: string | number) => {
    e.dataTransfer.setData('text/plain', String(id))
    setDraggedId(id)
  }

  const handleDropOnColumn = async (e: DragEvent, targetEstagio: EstagioFunil) => {
    e.preventDefault()
    setDragOverCol(null)
    const id = e.dataTransfer.getData('text/plain') || draggedId
    if (!id) return
    setDraggedId(null)

    setClientes((prev) =>
      (prev || []).map((c) =>
        String(c.id) === String(id) ? { ...c, estagio_funil: targetEstagio } : c
      )
    )

    try {
      const { error: err, unauthorized } = await updateClienteMultiTenant(
        id,
        { estagio_funil: targetEstagio, updated_at: new Date().toISOString() },
        usuario?.role,
        usuario?.id,
        usuario?.authId
      )

      if (unauthorized) {
        toast.warning('Operação bloqueada: este registo não pertence à sua carteira.')
        await carregarDados()
        return
      }

      if (err) {
        toast.error(`Erro ao salvar alteração: ${err.message}`)
        await carregarDados()
      } else {
        useCrmStore.getState().atualizarCliente(id, { estagio_funil: targetEstagio })
        toast.success(`Oportunidade movida para ${targetEstagio.toUpperCase()}.`)
      }
    } catch {
      await carregarDados()
    }
  }

  const handleIniciarTesteRapido = async (c: ClienteFunil, horas: number) => {
    setOpenMenuId(null)
    setStartingTestId(c.id)
    try {
      const dataExp = new Date(Date.now() + horas * HOUR_MS).toISOString()
      const { error: err, unauthorized } = await updateClienteMultiTenant(
        c.id,
        {
          estagio_funil: 'teste',
          status: 'teste',
          data_vencimento: dataExp,
          updated_at: new Date().toISOString(),
        },
        usuario?.role,
        usuario?.id,
        usuario?.authId
      )

      if (unauthorized) {
        toast.warning('Acesso não autorizado para alterar este lead.')
        await carregarDados()
        return
      }

      if (err) throw err

      setClientes((prev) =>
        (prev || []).map((item) =>
          item.id === c.id
            ? { ...item, estagio_funil: 'teste', status: 'teste', data_vencimento: dataExp }
            : item
        )
      )
      useCrmStore.getState().atualizarCliente(c.id, {
        estagio_funil: 'teste',
        status: 'teste',
        data_vencimento: dataExp,
      })
      setReferenceNow(Date.now())

      const nomeLead = c.nome_completo || c.nome || 'Lead'
      toast.success(`Teste de ${horas}h ativado para ${nomeLead}.`)

      const fone = cleanPhone(c.whatsapp)
      if (fone) {
        const msg = `Olá ${nomeLead}! Seu teste OnePlay de ${horas}h foi ativado com sucesso.\n\nVencimento: ${new Date(
          dataExp
        ).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
        window.open(`https://wa.me/55${fone}?text=${encodeURIComponent(msg)}`, '_blank')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Não foi possível ativar o teste: ${msg}`)
    } finally {
      setStartingTestId(null)
    }
  }

  const handleConfirmarConversao = async (e: FormEvent) => {
    e.preventDefault()
    if (!convertingCliente) return

    const c = convertingCliente
    setLoading(true)

    try {
      const dataVenc = new Date(
        Date.now() + (faturaForm.vencimentoDias || 30) * DAY_MS
      ).toISOString()
      const ownership = buildResellerOwnershipFields(usuario?.id, usuario?.authId)

      const { error: cliErr, unauthorized } = await updateClienteMultiTenant(
        c.id,
        {
          estagio_funil: 'cliente',
          status: 'ativo',
          plano: faturaForm.plano,
          valor_mensal: faturaForm.valor,
          data_vencimento: dataVenc,
          ...ownership,
          updated_at: new Date().toISOString(),
        },
        usuario?.role,
        usuario?.id,
        usuario?.authId
      )

      if (unauthorized) {
        setConvertingCliente(null)
        toast.warning('Acesso não autorizado: este lead não pertence à sua carteira.')
        await carregarDados()
        return
      }

      if (cliErr) throw cliErr

      const faturaPayload: Record<string, unknown> = {
        cliente_id: c.id,
        valor: faturaForm.valor,
        plano: faturaForm.plano,
        forma_pagamento: faturaForm.formaPagamento,
        status: 'pago',
        data_pagamento: new Date().toISOString(),
        data_vencimento: dataVenc,
        ...ownership,
      }

      let { error: fatErr } = await supabase.from('faturas').insert(faturaPayload)
      if (fatErr && fatErr.message.toLowerCase().includes('reseller_id')) {
        const { reseller_id: _omit, ...legacyFatura } = faturaPayload
        void _omit
        const fbFat = await supabase.from('faturas').insert(legacyFatura)
        fatErr = fbFat.error
      }

      if (fatErr) {
        console.warn('Cliente convertido, aviso ao registrar fatura:', fatErr)
      }

      useCrmStore.getState().converterCliente(c.id, {
        plano: faturaForm.plano,
        valor_mensal: faturaForm.valor,
        status: 'ativo',
        data_vencimento: dataVenc,
        reseller_id: ownership.reseller_id,
        vendedor_id: ownership.vendedor_id,
        agente_id: ownership.agente_id,
      })

      useCrmStore.getState().deduzirCredito(1)
      void useCrmStore.getState().carregarPagamentos()

      setClientes((prev) => (prev || []).filter((item) => item.id !== c.id))
      setConvertingCliente(null)
      toast.success(`${c.nome_completo || c.nome || 'Lead'} agora é um assinante ativo!`)
    } catch (err: unknown) {
      if (isUnauthorizedSupabaseError(err)) {
        toast.warning('Operação bloqueada pelas políticas de segurança.')
        return
      }
      const msg = getErrorMessage(err)
      const isSaldoInsuficiente =
        msg.toLowerCase().includes('saldo de créditos insuficiente') ||
        msg.toLowerCase().includes('saldo de creditos insuficiente') ||
        msg.toLowerCase().includes('créditos insuficiente') ||
        msg.toLowerCase().includes('creditos insuficiente')

      if (isSaldoInsuficiente) {
        toast.warning(
          'Saldo de créditos insuficiente para converter esta oportunidade em assinante.'
        )
      } else {
        toast.error(`Erro na conversão do assinante: ${msg}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCriarNovoLead = async (e: FormEvent) => {
    e.preventDefault()
    if (!novoLeadForm.nome.trim()) return

    setLoading(true)
    try {
      const payload = {
        nome_completo: novoLeadForm.nome.trim(),
        whatsapp: novoLeadForm.whatsapp.trim(),
        email: novoLeadForm.email.trim(),
        estagio_funil: novoLeadForm.estagio,
        status: novoLeadForm.estagio === 'teste' ? 'teste' : 'inativo',
        observacoes: novoLeadForm.observacoes,
      }

      const { data, error: err } = await insertClienteMultiTenant(
        payload,
        usuario?.role,
        usuario?.id,
        usuario?.authId
      )
      if (err) throw err

      if (data) {
        const novo = data as ClienteFunil
        setClientes((prev) => [novo, ...(prev || [])])
        useCrmStore.getState().adicionarCliente(novo)
      }

      setIsNovoLeadOpen(false)
      setNovoLeadForm({ nome: '', whatsapp: '', email: '', estagio: 'lead', observacoes: '' })
      toast.success('Oportunidade cadastrada no Funil de Vendas.')
    } catch (err: unknown) {
      if (isUnauthorizedSupabaseError(err)) {
        toast.warning('Acesso não autorizado para criar registo.')
        return
      }
      const msg = getErrorMessage(err)
      const isSaldoInsuficiente =
        msg.toLowerCase().includes('saldo de créditos insuficiente') ||
        msg.toLowerCase().includes('saldo de creditos insuficiente') ||
        msg.toLowerCase().includes('créditos insuficiente') ||
        msg.toLowerCase().includes('creditos insuficiente')

      if (isSaldoInsuficiente) {
        toast.warning('Saldo de créditos insuficiente! Inserção bloqueada por falta de saldo.')
      } else {
        toast.error('Falha de sincronização. Não foi possível registrar o Lead.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen bg-[#030509] text-zinc-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-100">
      <div className="pointer-events-none fixed -top-40 right-0 h-96 w-96 rounded-full bg-radial from-cyan-500/10 to-transparent" />

      <Sidebar />

      <div className="relative flex-1 min-w-0 pl-0 md:pl-64 flex flex-col min-h-screen">
        <SmartBanner />

        <header className="sticky top-0 z-30 border-b border-white/5 bg-[#06080d]/60 backdrop-blur-2xl">
          <div className="w-full max-w-[1600px] mx-auto flex flex-col md:flex-row md:h-16 md:items-center justify-between gap-4 px-6 lg:px-10 py-3 md:py-0">
            <div className="flex items-center gap-3">
              <HamburgerButton />
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-lg font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-cyan-400" />
                    <span>Funil de Vendas</span>
                  </h1>
                  <StatusBadge variant="teste" label="Aquisição" />
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Gerencie oportunidades, testes rápidos e conversão em assinantes
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[240px] sm:min-w-[300px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                <input
                  type="text"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou WhatsApp..."
                  className="w-full rounded-xl border border-white/10 bg-[#030509]/70 pl-9 pr-8 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20"
                />
                {busca && (
                  <button
                    type="button"
                    onClick={() => setBusca('')}
                    aria-label="Limpar busca"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!protegerAcao()) return
                  setIsNovoLeadOpen(true)
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/15 px-3.5 py-1.5 text-xs font-semibold text-cyan-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/50 hover:bg-cyan-500/25 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Novo Lead</span>
              </button>

              <button
                type="button"
                onClick={() => void carregarDados()}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-zinc-300 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:text-cyan-300 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                title="Atualizar dados"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </button>

              <div className="hidden xl:flex items-center pl-2">
                <SystemClock />
              </div>
            </div>
          </div>
        </header>

        {error && (
          <div className="w-full max-w-[1600px] mx-auto px-6 lg:px-10 pt-4">
            <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 backdrop-blur-xl px-4 py-2.5 text-xs text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}

        <main
          ref={menuContainerRef}
          className="flex-1 w-full max-w-[1600px] mx-auto p-6 lg:p-10"
        >
          {loading ? (
            <KanbanSkeleton />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 items-start">
              {COLUNAS_FUNIL.map((col) => {
                const cards = funilClassificado[col.key] || []
                const isOver = dragOverCol === col.key

                return (
                  <div
                    key={col.key}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDragOverCol(col.key)
                    }}
                    onDragLeave={() => setDragOverCol((curr) => (curr === col.key ? null : curr))}
                    onDrop={(e) => void handleDropOnColumn(e, col.key)}
                    className={`relative overflow-hidden flex flex-col rounded-2xl border backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] p-4 min-h-[540px] transition-all duration-300 ${isOver
                        ? 'border-cyan-500/50 bg-[#06080d]/80 ring-2 ring-cyan-500/20 shadow-[0_0_24px_rgba(34,211,238,0.18)]'
                        : 'border-white/5 bg-[#06080d]/60'
                      }`}
                  >
                    <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-radial from-cyan-500/10 to-transparent" />

                    <div className="relative flex items-center justify-between pb-3 border-b border-white/5">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                        <h2 className="text-xs font-semibold tracking-tight text-zinc-100">
                          {col.titulo}
                        </h2>
                      </div>
                      <StatusBadge
                        variant={col.badgeVariant}
                        label={cards.length}
                        showDot={false}
                      />
                    </div>
                    <p className="relative text-xs text-zinc-400 mt-1.5 mb-3.5">{col.subtitulo}</p>

                    <div className="relative flex-1 space-y-3">
                      {cards.length === 0 ? (
                        <EmptyState
                          compact
                          icon={col.emptyIcon}
                          title={col.emptyTitle}
                          description={col.emptyDesc}
                          className="bg-white/[0.01] border-white/5 shadow-none"
                        />
                      ) : (
                        cards.map((c) => {
                          const nomeLead = c.nome_completo || c.nome || 'Lead Sem Nome'
                          const fone = cleanPhone(c.whatsapp)
                          const urgency =
                            col.key === 'teste'
                              ? getTesteUrgency(c.data_vencimento, referenceNow)
                              : null
                          const isMenuOpen = openMenuId === c.id
                          const dataCriacao = c.created_at
                            ? new Date(c.created_at).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                            })
                            : null

                          return (
                            <article
                              key={c.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, c.id)}
                              className="group relative rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl p-4 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] cursor-grab active:cursor-grabbing"
                            >
                              {/* Topo: Nome Principal + Ações Secundárias Ocultas/Agrupadas */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <Link
                                    to={`/cliente/${c.id}`}
                                    className="text-sm font-medium text-zinc-100 hover:text-cyan-400 transition-colors truncate flex items-center gap-1.5"
                                  >
                                    <span className="truncate">{nomeLead}</span>
                                    <ExternalLink className="h-3 w-3 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                  </Link>

                                  <div className="mt-1 flex items-center gap-2 text-xs text-zinc-500 tabular-nums [font-variant-numeric:tabular-nums]">
                                    <span className="font-mono">#{String(c.id).slice(-4)}</span>
                                    {dataCriacao && (
                                      <>
                                        <span>•</span>
                                        <span>{dataCriacao}</span>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Botão de Ações Secundárias (...) */}
                                <div className="relative flex items-center gap-1 shrink-0">
                                  {fone && (
                                    <a
                                      href={`https://wa.me/55${fone}?text=${encodeURIComponent(
                                        `Olá ${nomeLead}! Tudo bem? Gostaria de saber como está sua experiência com o OnePlay.`
                                      )}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      title="Chamar no WhatsApp"
                                      className="rounded-lg p-1.5 text-zinc-500 opacity-0 group-hover:opacity-100 hover:bg-white/5 hover:text-emerald-400 transition-all"
                                    >
                                      <MessageCircle className="h-3.5 w-3.5" />
                                    </a>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOpenMenuId((curr) => (curr === c.id ? null : c.id))
                                    }
                                    className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 transition-colors"
                                    title="Mais ações"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </button>

                                  {isMenuOpen && (
                                    <div className="absolute right-0 top-8 z-20 w-48 rounded-xl border border-white/10 bg-[#06080d]/95 backdrop-blur-2xl p-1.5 shadow-[0_8px_32px_0_rgba(0,0,0,0.55)] animate-in fade-in zoom-in-95">
                                      <button
                                        type="button"
                                        disabled={startingTestId === c.id}
                                        onClick={() => void handleIniciarTesteRapido(c, 4)}
                                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-zinc-100 transition-colors"
                                      >
                                        <Zap className="h-3.5 w-3.5 text-cyan-400" />
                                        <span>Liberar Teste 4h</span>
                                      </button>
                                      <button
                                        type="button"
                                        disabled={startingTestId === c.id}
                                        onClick={() => void handleIniciarTesteRapido(c, 24)}
                                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-zinc-100 transition-colors"
                                      >
                                        <Zap className="h-3.5 w-3.5 text-amber-400" />
                                        <span>Liberar Teste 24h</span>
                                      </button>
                                      {fone && (
                                        <a
                                          href={`https://wa.me/55${fone}?text=${encodeURIComponent(
                                            `Olá ${nomeLead}! Tudo bem? Gostaria de saber como está sua experiência com o OnePlay.`
                                          )}`}
                                          target="_blank"
                                          rel="noreferrer"
                                          onClick={() => setOpenMenuId(null)}
                                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-emerald-400 transition-colors"
                                        >
                                          <MessageCircle className="h-3.5 w-3.5 text-emerald-400" />
                                          <span>Abrir WhatsApp</span>
                                        </a>
                                      )}
                                      <Link
                                        to={`/cliente/${c.id}`}
                                        onClick={() => setOpenMenuId(null)}
                                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/5 hover:text-zinc-100 transition-colors"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
                                        <span>Abrir Ficha Completa</span>
                                      </Link>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Contato Secundário */}
                              {c.whatsapp && (
                                <p className="mt-2 text-xs font-mono text-zinc-400 tabular-nums [font-variant-numeric:tabular-nums]">
                                  {c.whatsapp}
                                </p>
                              )}

                              {/* Badge Didático de Prazo do Teste com LED */}
                              {urgency && (
                                <div className="mt-2.5">
                                  <StatusBadge variant={urgency.variant} label={urgency.label} />
                                </div>
                              )}

                              {/* Atalho de Teste Rápido na coluna Novos Leads */}
                              {col.key === 'lead' && (
                                <div className="mt-3 flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => void handleIniciarTesteRapido(c, 4)}
                                    disabled={startingTestId === c.id}
                                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] font-medium text-zinc-300 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:text-cyan-200 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                                  >
                                    <Zap className="h-3 w-3 text-cyan-400" />
                                    <span>Teste 4h</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleIniciarTesteRapido(c, 24)}
                                    disabled={startingTestId === c.id}
                                    className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] font-medium text-zinc-300 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:text-cyan-200 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                                  >
                                    <Zap className="h-3 w-3 text-amber-400" />
                                    <span>Teste 24h</span>
                                  </button>
                                </div>
                              )}

                              {/* Ação Principal: Converter em Assinante */}
                              <div className="mt-3 pt-3 border-t border-white/5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!protegerAcao()) return
                                    setConvertingCliente(c)
                                  }}
                                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:bg-emerald-500/15 hover:text-emerald-300 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                  <span>Converter em Assinante</span>
                                </button>
                              </div>
                            </article>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </main>
      </div>

      {/* Modal Glassmorphic: Converter em Assinante */}
      {convertingCliente && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in"
        >
          <div className="relative overflow-hidden w-full max-w-md rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl p-6 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] animate-in zoom-in-95">
            <div className="pointer-events-none absolute -top-14 -right-14 h-40 w-40 rounded-full bg-radial from-cyan-500/10 to-transparent" />

            <div className="relative flex items-center justify-between pb-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <h3 className="text-sm font-semibold tracking-tight text-zinc-100">
                  Converter em Assinante
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setConvertingCliente(null)}
                className="rounded-xl p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="relative text-xs text-zinc-400 mt-3 leading-relaxed">
              Ative{' '}
              <strong className="font-medium text-zinc-100">
                {convertingCliente.nome_completo || convertingCliente.nome || 'este lead'}
              </strong>{' '}
              na carteira definitiva de Clientes &amp; Renovações:
            </p>

            <form onSubmit={handleConfirmarConversao} className="relative mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  Plano Contratado
                </label>
                <select
                  value={faturaForm.plano}
                  onChange={(e) => setFaturaForm((f) => ({ ...f, plano: e.target.value }))}
                  className={`${modalInputClass} [color-scheme:dark]`}
                >
                  <option value="Mensal">Plano Mensal</option>
                  <option value="Trimestral">Plano Trimestral</option>
                  <option value="Semestral">Plano Semestral</option>
                  <option value="Anual">Plano Anual</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    Valor Pago (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={faturaForm.valor}
                    onChange={(e) =>
                      setFaturaForm((f) => ({ ...f, valor: Number(e.target.value) }))
                    }
                    className={`${modalInputClass} font-mono tabular-nums`}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300">
                    Forma de Pagamento
                  </label>
                  <select
                    value={faturaForm.formaPagamento}
                    onChange={(e) =>
                      setFaturaForm((f) => ({ ...f, formaPagamento: e.target.value }))
                    }
                    className={`${modalInputClass} [color-scheme:dark]`}
                  >
                    <option value="PIX">PIX</option>
                    <option value="Cartão de Crédito">Cartão de Crédito</option>
                    <option value="Boleto">Boleto</option>
                    <option value="Dinheiro">Dinheiro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  Próximo Vencimento
                </label>
                <select
                  value={faturaForm.vencimentoDias}
                  onChange={(e) =>
                    setFaturaForm((f) => ({ ...f, vencimentoDias: Number(e.target.value) }))
                  }
                  className={`${modalInputClass} [color-scheme:dark]`}
                >
                  <option value={30}>30 dias (Mensal)</option>
                  <option value={90}>90 dias (Trimestral)</option>
                  <option value={180}>180 dias (Semestral)</option>
                  <option value={365}>365 dias (Anual)</option>
                </select>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setConvertingCliente(null)}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-medium text-zinc-300 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:text-zinc-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-200 transition-all duration-300 hover:-translate-y-1 hover:bg-emerald-500/30 hover:text-white hover:shadow-[0_0_20px_rgba(52,211,153,0.25)]"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Confirmar Conversão</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Glassmorphic: Novo Lead */}
      {isNovoLeadOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in"
        >
          <div className="relative overflow-hidden w-full max-w-md rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl p-6 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] animate-in zoom-in-95">
            <div className="pointer-events-none absolute -top-14 -right-14 h-40 w-40 rounded-full bg-radial from-cyan-500/10 to-transparent" />

            <div className="relative flex items-center justify-between pb-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-semibold tracking-tight text-zinc-100">
                  Nova Oportunidade / Lead
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsNovoLeadOpen(false)}
                className="rounded-xl p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCriarNovoLead} className="relative mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  Nome Completo <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="text"
                  value={novoLeadForm.nome}
                  onChange={(e) => setNovoLeadForm((f) => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: João da Silva"
                  className={modalInputClass}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  WhatsApp (com DDD)
                </label>
                <input
                  type="text"
                  value={novoLeadForm.whatsapp}
                  onChange={(e) => setNovoLeadForm((f) => ({ ...f, whatsapp: e.target.value }))}
                  placeholder="Ex: 11999998888"
                  className={modalInputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  E-mail (opcional)
                </label>
                <input
                  type="email"
                  value={novoLeadForm.email}
                  onChange={(e) => setNovoLeadForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="cliente@email.com"
                  className={modalInputClass}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300">
                  Etapa Inicial do Funil
                </label>
                <select
                  value={novoLeadForm.estagio}
                  onChange={(e) =>
                    setNovoLeadForm((f) => ({ ...f, estagio: e.target.value as EstagioFunil }))
                  }
                  className={`${modalInputClass} [color-scheme:dark]`}
                >
                  <option value="lead">1. Novos Leads (Contato Inicial)</option>
                  <option value="teste">2. Testes Ativos</option>
                  <option value="followup">3. Follow-up</option>
                  <option value="negociacao">4. Negociação</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300">Observações</label>
                <textarea
                  value={novoLeadForm.observacoes}
                  onChange={(e) =>
                    setNovoLeadForm((f) => ({ ...f, observacoes: e.target.value }))
                  }
                  placeholder="Preferências, servidor solicitado ou dispositivo..."
                  rows={2}
                  className={modalInputClass}
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setIsNovoLeadOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-medium text-zinc-300 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:text-zinc-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/15 px-4 py-2 text-xs font-semibold text-cyan-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/50 hover:bg-cyan-500/25 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                >
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Criar Lead</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
