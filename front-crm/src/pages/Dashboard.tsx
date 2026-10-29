import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  MessageCircle,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react'
import { signOut } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { SmartBanner } from '../components/SmartBanner'
import { SystemClock } from '../components/SystemClock'
import { useCrmStore } from '../stores/useCrmStore'
import { getErrorMessage } from '../lib/errorHandler'
import { useFeatureGating } from '../hooks/useFeatureGating'
import { useAuth } from '../contexts/AuthContext'
import { fetchClientesMultiTenant, insertClienteMultiTenant } from '../lib/multiTenant'
import { useToast } from '../contexts/ToastContext'
import { gerarLinkWhatsApp } from '../lib/whatsapp'
import {
  EmptyState,
  StatusBadge,
  type StatusSemanticVariant,
} from '../components/ui/TierOnePrimitives'

/**
 * Nomes das colunas na tabela `clientes` do Supabase.
 * Se algum nome no banco for diferente, ajuste APENAS aqui.
 */
const DB = {
  nome: 'nome',
  whatsapp: 'whatsapp',
  email: 'email',
  usuario: 'usuario_iptv',
  senha: 'senha_iptv',
  plano: 'plano',
  valor: 'valor_mensal',
  inicio: 'data_inicio',
  vencimento: 'data_vencimento',
  status: 'status',
  obs: 'observacoes',
  servidores: 'servidores',
  aplicativos: 'aplicativos',
} as const

type Status = 'ativo' | 'inativo' | 'teste'

interface AplicativoItem {
  nome: string
  mac: string
  chave: string
}

interface Cliente {
  id: string | number
  Status?: string | null
  status?: string | null
  valor_mensal?: number | null
  [key: string]: unknown
}

type ColumnKey = 'ativos' | 'a_vencer' | 'vencidos'

const HOUR_MS = 3_600_000

const COLUMNS: {
  key: ColumnKey
  title: string
  variant: StatusSemanticVariant
  emptyTitle: string
  emptyDesc: string
}[] = [
  {
    key: 'ativos',
    title: 'Ativos',
    variant: 'ativo',
    emptyTitle: 'Nenhum assinante ativo',
    emptyDesc: 'Clique em "Novo Cliente" para cadastrar e ativar sua primeira assinatura.',
  },
  {
    key: 'a_vencer',
    title: 'Alerta de Vencimento',
    variant: 'vencendo',
    emptyTitle: 'Zero alertas pendentes',
    emptyDesc: 'Clientes próximos do vencimento aparecerão aqui para cobrança preventiva.',
  },
  {
    key: 'vencidos',
    title: 'Inativos / Vencidos',
    variant: 'vencido',
    emptyTitle: 'Sem assinaturas vencidas',
    emptyDesc: 'Assinantes com prazo expirado serão listados nesta coluna para reativação.',
  },
]

const inputClass =
  'w-full rounded-xl border border-white/10 bg-[#030509]/80 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none backdrop-blur-xl transition-all duration-300 focus:border-cyan-500/40 focus:ring-2 focus:ring-cyan-500/20 focus:shadow-[0_0_20px_rgba(34,211,238,0.12)]'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const str = (v: unknown): string => (v == null ? '' : String(v))

/* ------------------------------------------------------------------ */
/* Datas                                                               */
/* ------------------------------------------------------------------ */

function toDbDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString()
}

function formatDate(iso?: unknown): string {
  if (!iso) return 'Sem vencimento'
  const d = new Date(String(iso))
  return isNaN(d.getTime()) ? 'Sem vencimento' : d.toLocaleDateString('pt-BR')
}

function classify(c: Cliente): ColumnKey {
  const statusRaw = c.Status ?? c[DB.status] ?? c.status
  const st = typeof statusRaw === 'string' ? statusRaw.trim().toLowerCase() : ''
  if (st === 'alerta_vencimento' || st === 'alerta' || st === 'a_vencer') return 'a_vencer'
  if (st === 'inativo' || st === 'vencido' || st === 'vencidos') return 'vencidos'
  return 'ativos'
}

/* ------------------------------------------------------------------ */
/* WhatsApp                                                            */
/* ------------------------------------------------------------------ */

function whatsappLink(raw: string, text?: string): string | null {
  let digits = raw.replace(/\D/g, '')
  if (!digits) return null
  if (digits.length <= 11) digits = `55${digits}`
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

function cobrancaLink(c: Cliente): string | null {
  const nome = str(c[DB.nome])
  const plano = str(c[DB.plano]) || 'IPTV'
  const login = str(c[DB.usuario])
  const quando = c[DB.vencimento]
    ? ` com vencimento em ${formatDate(c[DB.vencimento])}`
    : ' precisa ser renovado'
  const texto = `Olá ${nome}, seu plano ${plano}${quando}.${login ? ` Seu login é ${login}.` : ''} Vamos renovar?`
  return whatsappLink(str(c[DB.whatsapp]), texto)
}

/* ------------------------------------------------------------------ */
/* UI auxiliar                                                         */
/* ------------------------------------------------------------------ */

function Field({
  label,
  htmlFor,
  required,
  children,
  full,
}: {
  label: string
  htmlFor: string
  required?: boolean
  children: ReactNode
  full?: boolean
}) {
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-zinc-300">
        {label} {required && <span className="text-cyan-400">*</span>}
      </label>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="sm:col-span-2 border-b border-white/5 pb-2 text-xs font-semibold uppercase tracking-wider text-cyan-300/90">
      {children}
    </h3>
  )
}

const EMPTY_FORM = {
  nome: '',
  whatsapp: '',
  email: '',
  usuario: '',
  senha: '',
  plano: '',
  valor: '',
  inicio: '',
  vencimento: '',
  status: 'ativo' as Status,
  testeHoras: null as 4 | 24 | null,
  obs: '',
}

/* ------------------------------------------------------------------ */
/* Página Dashboard                                                    */
/* ------------------------------------------------------------------ */

export default function Dashboard() {
  const { usuario, recarregarCreditos } = useAuth()
  const toast = useToast()
  const { protegerAcao } = useFeatureGating()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [quickMode, setQuickMode] = useState(false)
  const [renewingId, setRenewingId] = useState<Cliente['id'] | null>(null)

  // Modal / Slide-over
  const [panelOpen, setPanelOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [servidores, setServidores] = useState<string[]>([])
  const [aplicativos, setAplicativos] = useState<AplicativoItem[]>([])
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const setField = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const isTeste = form.status === 'teste'

  const fetchClientes = useCallback(async () => {
    const { data, error } = await fetchClientesMultiTenant(
      usuario?.role,
      usuario?.id,
      usuario?.authId
    )
    if (error) {
      setLoadError(`Erro ao carregar clientes: ${error.message}`)
    } else {
      setLoadError(null)
      setClientes((data ?? []) as Cliente[])
    }
    setLoading(false)
  }, [usuario])

  useEffect(() => {
    void fetchClientes()
  }, [fetchClientes])

  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPanelOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panelOpen])

  const grouped = useMemo(() => {
    const g: Record<ColumnKey, Cliente[]> = { ativos: [], a_vencer: [], vencidos: [] }
    clientes.forEach((c) => g[classify(c)].push(c))
    return g
  }, [clientes])

  const quickList = useMemo(() => {
    return clientes.filter((c) => {
      const st = String(c.Status ?? c[DB.status] ?? c.status ?? '')
        .trim()
        .toLowerCase()
      return st === 'alerta_vencimento' || st === 'alerta' || st === 'inativo' || st === 'vencido'
    })
  }, [clientes])

  function openPanel() {
    if (!protegerAcao()) return
    setForm(EMPTY_FORM)
    setServidores([])
    setAplicativos([])
    setShowPassword(false)
    setFormError(null)
    setPanelOpen(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    // Regra de Validação: Apenas Nome Completo e WhatsApp são obrigatórios
    if (!form.nome.trim()) {
      setFormError('O nome completo é obrigatório.')
      return
    }
    if (!form.whatsapp.trim()) {
      setFormError('O WhatsApp é obrigatório.')
      return
    }

    if (!isTeste && form.inicio && form.vencimento && form.vencimento < form.inicio) {
      setFormError('A data de vencimento não pode ser anterior à data de início.')
      return
    }

    setFormError(null)
    setSaving(true)

    // Cálculo do vencimento para teste ou calendário normal
    const vencimento =
      isTeste && form.testeHoras
        ? new Date(Date.now() + form.testeHoras * HOUR_MS).toISOString()
        : form.vencimento
          ? toDbDate(form.vencimento)
          : null

    // Mapeamento dinâmico de servidores e aplicativos para JSONB
    const servidoresList = servidores.map((s) => s.trim()).filter(Boolean)
    const appsList = aplicativos
      .map((a) => ({
        nome: a.nome.trim(),
        mac: a.mac.trim(),
        chave: a.chave.trim(),
      }))
      .filter((a) => a.nome || a.mac || a.chave)

    const payload = {
      [DB.nome]: form.nome.trim(),
      [DB.whatsapp]: form.whatsapp.trim(),
      [DB.email]: form.email.trim() || null,
      [DB.usuario]: form.usuario.trim() || null,
      [DB.senha]: form.senha || null,
      [DB.plano]: form.plano.trim() || null,
      [DB.valor]: form.valor ? Number(form.valor) : null,
      [DB.inicio]: form.inicio ? toDbDate(form.inicio) : null,
      [DB.vencimento]: vencimento,
      [DB.status]: form.status,
      [DB.obs]: form.obs.trim() || null,
      [DB.servidores]: servidoresList,
      [DB.aplicativos]: appsList,
    }

    try {
      const { data, error } = await insertClienteMultiTenant(
        payload,
        usuario?.role,
        usuario?.id,
        usuario?.authId
      )
      setSaving(false)
      if (error) {
        throw error
      }

      // Atualiza o estado localmente no Zustand deduzindo 1 crédito após o sucesso da nova venda
      useCrmStore.getState().deduzirCredito(1)
      if (data) {
        useCrmStore.getState().adicionarCliente(data)
      }

      setPanelOpen(false)
      await fetchClientes()
    } catch (err: unknown) {
      setSaving(false)
      const msg = getErrorMessage(err)
      console.error('Erro ao cadastrar cliente no Dashboard:', msg, err)
      const isSaldoInsuficiente =
        msg.toLowerCase().includes('saldo de créditos insuficiente') ||
        msg.toLowerCase().includes('saldo de creditos insuficiente') ||
        msg.toLowerCase().includes('créditos insuficiente') ||
        msg.toLowerCase().includes('creditos insuficiente')

      if (isSaldoInsuficiente) {
        setFormError('Saldo de créditos insuficiente! Você não possui saldo para ativar este cliente.')
      } else {
        setFormError(`Não foi possível guardar: ${msg}`)
      }
    }
  }

  async function renovar(c: Cliente) {
    if (!protegerAcao()) return
    setActionError(null)
    setRenewingId(c.id)

    // Substitui qualquer UPDATE direto nas tabelas pela chamada atômica da RPC
    const { error } = await supabase.rpc('renovar_assinatura', {
      p_cliente_id: c.id,
    })
    setRenewingId(null)

    if (error) {
      const msg = error.message || ''
      const isSaldo =
        msg.toLowerCase().includes('saldo') ||
        msg.toLowerCase().includes('crédito') ||
        msg.toLowerCase().includes('credito') ||
        msg.toLowerCase().includes('insuficiente')

      if (isSaldo) {
        useCrmStore.getState().abrirModalAcessoRestrito()
        toast.error(
          'Saldo insuficiente para renovar. Solicite a compra de créditos ao suporte Master.'
        )
        setActionError('Saldo de créditos insuficiente. Solicite a compra de créditos ao Master.')
      } else {
        toast.error(`Falha ao renovar assinatura: ${msg}`)
        setActionError(`Não foi possível renovar ${str(c[DB.nome])}: ${error.message}`)
      }
      return
    }

    // Em caso de sucesso, atualiza o estado local recarregando os dados do cliente e saldo de créditos
    toast.success(`Assinatura de ${str(c[DB.nome])} renovada com sucesso!`)
    await fetchClientes()

    if (recarregarCreditos) {
      await recarregarCreditos()
    } else {
      const agenteId = usuario?.id || useCrmStore.getState().user?.id
      if (agenteId) {
        const { data: agenteData } = await supabase
          .from('agentes')
          .select('creditos')
          .eq('id', agenteId)
          .maybeSingle()
        if (agenteData && agenteData.creditos !== undefined) {
          useCrmStore.getState().setCreditos(Number(agenteData.creditos ?? 0))
        }
      }
    }
  }

  return (
    <div className="relative min-h-screen bg-[#030509] text-zinc-100">
      {/* Ambient Background Glow */}
      <div className="pointer-events-none fixed -top-44 left-1/2 -translate-x-1/2 h-[420px] w-[760px] rounded-full bg-radial from-cyan-500/10 to-transparent blur-3xl" />

      {/* Smart Banner de Topo */}
      <SmartBanner />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#06080d]/70 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.18)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-zinc-100">OnePlay CRM</span>
          </div>
          <div className="flex items-center gap-4">
            <SystemClock />
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#06080d]/60 px-4 py-2 text-xs font-medium text-zinc-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">
              {quickMode ? 'Ação Rápida' : 'Clientes'}
            </h1>
            <p className="mt-1 text-sm text-zinc-400 tabular-nums [font-variant-numeric:tabular-nums]">
              {quickMode
                ? `${quickList.length} cliente(s) vencidos ou vencendo em até 3 dias`
                : `${clientes.length} cliente(s) cadastrado(s)`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQuickMode((q) => !q)}
              aria-pressed={quickMode}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-all duration-300 hover:-translate-y-1 ${
                quickMode
                  ? 'border-amber-400/40 bg-amber-500/15 text-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.18)]'
                  : 'border-white/10 bg-[#06080d]/60 text-zinc-200 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]'
              }`}
            >
              <Zap className="h-4 w-4" />
              Modo Ação Rápida
            </button>
            <button
              type="button"
              onClick={openPanel}
              className="flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-5 py-2.5 text-xs font-semibold text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.15)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:bg-cyan-500/25 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
            >
              <Plus className="h-4 w-4" />
              Novo Cliente
            </button>
          </div>
        </div>

        {(loadError || actionError) && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 backdrop-blur-xl"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
            <span>{loadError ?? actionError}</span>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-24 text-cyan-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : quickMode ? (
          quickList.length === 0 ? (
            <EmptyState
              icon={CheckCircle2}
              title="Base 100% em dia!"
              description="Nenhum cliente vencido ou vencendo nos próximos 3 dias. Quando houver renovações urgentes, elas aparecerão automaticamente aqui."
            />
          ) : (
            <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.4)]">
              <div className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-radial from-cyan-500/10 to-transparent" />
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="border-b border-white/5 bg-[#030509]/60 text-[11px] uppercase tracking-wider text-zinc-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Cliente</th>
                      <th className="px-4 py-3 font-semibold">Plano</th>
                      <th className="px-4 py-3 font-semibold">Vencimento</th>
                      <th className="px-4 py-3 font-semibold">Situação</th>
                      <th className="px-4 py-3 text-right font-semibold">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {quickList.map((c) => {
                      const link = cobrancaLink(c)
                      const renewing = renewingId === c.id
                      const st = String(c.Status ?? c[DB.status] ?? c.status ?? '')
                        .trim()
                        .toLowerCase()
                      const isAlerta = st === 'alerta_vencimento' || st === 'alerta'
                      return (
                        <tr key={c.id} className="transition-colors hover:bg-white/[0.03]">
                          <td className="px-4 py-3 font-medium text-zinc-100">{str(c[DB.nome])}</td>
                          <td className="px-4 py-3 text-cyan-300">{str(c[DB.plano]) || '—'}</td>
                          <td className="px-4 py-3 font-mono text-zinc-300 tabular-nums [font-variant-numeric:tabular-nums]">
                            {formatDate(c[DB.vencimento])}
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge
                              variant={isAlerta ? 'vencendo' : 'vencido'}
                              label={isAlerta ? 'Alerta' : 'Inativo'}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              {link && (
                                <a
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 font-medium text-emerald-300 transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-500/20 hover:shadow-[0_0_16px_rgba(52,211,153,0.2)]"
                                >
                                  <Send className="h-3 w-3" />
                                  Cobrar
                                </a>
                              )}
                              <button
                                type="button"
                                disabled={renewing}
                                onClick={() => {
                                  if (!protegerAcao()) return
                                  void renovar(c)
                                }}
                                className="flex items-center gap-1 rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-2.5 py-1.5 font-semibold text-cyan-100 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:bg-cyan-500/25 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {renewing ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                                +30 dias
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 gap-4 md:gap-6 md:grid-cols-3">
            {COLUMNS.map((col) => (
              <section
                key={col.key}
                className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#06080d]/60 p-4 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.4)]"
              >
                <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-radial from-cyan-500/10 to-transparent" />
                <div className="relative mb-4 flex items-center justify-between">
                  <StatusBadge variant={col.variant} label={col.title} />
                  <span className="rounded-lg border border-white/10 bg-[#030509]/80 px-2.5 py-0.5 font-mono text-xs font-medium text-zinc-200 tabular-nums [font-variant-numeric:tabular-nums]">
                    {grouped[col.key].length}
                  </span>
                </div>

                <div className="relative space-y-3">
                  {grouped[col.key].length === 0 ? (
                    <EmptyState
                      icon={Users}
                      title={col.emptyTitle}
                      description={col.emptyDesc}
                      compact
                    />
                  ) : (
                    grouped[col.key].map((c) => {
                      const wa = whatsappLink(str(c[DB.whatsapp]))
                      const cobrar = cobrancaLink(c)
                      const plano = str(c[DB.plano])
                      const rawStatus = c.Status ?? c[DB.status] ?? c.status
                      const st =
                        typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : 'ativo'
                      const cardVariant: StatusSemanticVariant =
                        st === 'alerta_vencimento' || st === 'alerta'
                          ? 'vencendo'
                          : st === 'inativo' || st === 'vencido'
                            ? 'vencido'
                            : st === 'teste'
                              ? 'teste'
                              : 'ativo'
                      const cardLabel =
                        cardVariant === 'vencendo'
                          ? 'Alerta'
                          : cardVariant === 'vencido'
                            ? 'Inativo'
                            : cardVariant === 'teste'
                              ? 'Teste'
                              : 'Ativo'

                      return (
                        <article
                          key={c.id}
                          className="group relative overflow-hidden rounded-2xl border border-white/5 bg-[#06080d]/80 p-4 backdrop-blur-xl shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="text-sm font-semibold leading-tight text-zinc-100">
                              {str(c[DB.nome])}
                            </h3>
                            {wa && (
                              <a
                                href={wa}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Abrir conversa no WhatsApp"
                                aria-label={`Abrir WhatsApp de ${str(c[DB.nome])}`}
                                className="shrink-0 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-1.5 text-emerald-400 transition-all duration-300 hover:-translate-y-0.5 hover:bg-emerald-500/20 hover:text-emerald-300"
                              >
                                <MessageCircle className="h-4 w-4" />
                              </a>
                            )}
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <StatusBadge
                              variant="neutral"
                              label={plano || 'Sem plano'}
                              showDot={false}
                            />
                            <StatusBadge variant={cardVariant} label={cardLabel} />
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-xs text-zinc-400">
                            <span className="flex items-center gap-1.5 tabular-nums [font-variant-numeric:tabular-nums]">
                              <CalendarClock className="h-3.5 w-3.5 text-cyan-400/80" />
                              {formatDate(c[DB.vencimento])}
                            </span>
                            {(c.valor_mensal != null || c[DB.valor] != null) && (
                              <span className="font-mono font-semibold text-zinc-100 tabular-nums [font-variant-numeric:tabular-nums]">
                                {brl.format(Number(c.valor_mensal ?? c[DB.valor]))}
                              </span>
                            )}
                          </div>

                          {(() => {
                            const link = gerarLinkWhatsApp(c) || cobrar
                            const isDestaque =
                              col.key === 'a_vencer' ||
                              col.key === 'vencidos' ||
                              st === 'alerta_vencimento' ||
                              st === 'alerta' ||
                              st === 'inativo' ||
                              st === 'vencido'
                            return link ? (
                              <a
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all duration-300 hover:-translate-y-0.5 ${
                                  isDestaque
                                    ? 'border border-emerald-400/30 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 hover:shadow-[0_0_18px_rgba(52,211,153,0.2)]'
                                    : 'border border-white/10 bg-white/[0.03] text-zinc-300 hover:border-cyan-500/30 hover:text-cyan-200 hover:shadow-[0_0_20px_rgba(34,211,238,0.15)]'
                                }`}
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                                WhatsApp
                              </a>
                            ) : null
                          })()}
                        </article>
                      )
                    })
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Modal / Slide-over de Novo Cliente */}
      {panelOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-md"
          onMouseDown={(e) => e.target === e.currentTarget && setPanelOpen(false)}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="novo-cliente-title"
            className="relative flex h-full w-full max-w-3xl flex-col overflow-hidden border-l border-white/10 bg-[#06080d]/90 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.6)]"
          >
            <div className="pointer-events-none absolute -top-20 -right-20 h-52 w-52 rounded-full bg-radial from-cyan-500/10 to-transparent" />

            <div className="relative flex items-center justify-between border-b border-white/5 px-6 py-4">
              <h2 id="novo-cliente-title" className="text-base font-semibold text-zinc-100">
                Novo Cliente
              </h2>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                aria-label="Fechar"
                className="rounded-xl p-1.5 text-zinc-400 transition hover:bg-white/5 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} noValidate className="relative flex min-h-0 flex-1 flex-col">
              <div className="grid flex-1 grid-cols-1 content-start gap-x-5 gap-y-4 overflow-y-auto px-6 py-6 sm:grid-cols-2">
                {/* 1. Dados Pessoais */}
                <SectionTitle>Dados pessoais</SectionTitle>
                <Field label="Nome completo" htmlFor="f-nome" required full>
                  <input
                    id="f-nome"
                    value={form.nome}
                    onChange={(e) => setField('nome', e.target.value)}
                    placeholder="Nome do cliente"
                    className={inputClass}
                    autoFocus
                  />
                </Field>
                <Field label="WhatsApp" htmlFor="f-whatsapp" required>
                  <input
                    id="f-whatsapp"
                    type="tel"
                    value={form.whatsapp}
                    onChange={(e) => setField('whatsapp', e.target.value)}
                    placeholder="(11) 99999-9999"
                    className={`${inputClass} tabular-nums`}
                  />
                </Field>
                <Field label="E-mail" htmlFor="f-email">
                  <input
                    id="f-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setField('email', e.target.value)}
                    placeholder="cliente@email.com"
                    className={inputClass}
                  />
                </Field>

                {/* 2. Acesso IPTV */}
                <SectionTitle>Acesso IPTV</SectionTitle>
                <Field label="Login de usuário" htmlFor="f-usuario">
                  <input
                    id="f-usuario"
                    value={form.usuario}
                    onChange={(e) => setField('usuario', e.target.value)}
                    autoComplete="off"
                    placeholder="usuario123"
                    className={inputClass}
                  />
                </Field>
                <Field label="Senha do usuário" htmlFor="f-senha">
                  <div className="relative">
                    <input
                      id="f-senha"
                      type={showPassword ? 'text' : 'password'}
                      value={form.senha}
                      onChange={(e) => setField('senha', e.target.value)}
                      autoComplete="new-password"
                      placeholder="••••••••"
                      className={`${inputClass} pr-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-500 transition hover:text-cyan-300"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </Field>

                {/* 3. Gestão Dinâmica de Servidores (JSONB) */}
                <SectionTitle>Servidores</SectionTitle>
                <div className="sm:col-span-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400">Servidores associados</span>
                    <button
                      type="button"
                      onClick={() => setServidores((list) => [...list, ''])}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition-all duration-300 hover:-translate-y-0.5 hover:bg-cyan-500/20"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar Servidor
                    </button>
                  </div>

                  {servidores.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/10 py-3 text-center text-xs text-zinc-500">
                      Nenhum servidor adicionado.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {servidores.map((srv, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            value={srv}
                            onChange={(e) => {
                              const val = e.target.value
                              setServidores((list) =>
                                list.map((item, i) => (i === idx ? val : item))
                              )
                            }}
                            placeholder={`Servidor ${idx + 1} (ex: Servidor Principal, Backup...)`}
                            className={inputClass}
                          />
                          <button
                            type="button"
                            onClick={() => setServidores((list) => list.filter((_, i) => i !== idx))}
                            aria-label={`Remover servidor ${idx + 1}`}
                            title="Remover servidor"
                            className="shrink-0 rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. Gestão Dinâmica de Aplicativos (JSONB) */}
                <SectionTitle>Aplicativos</SectionTitle>
                <div className="sm:col-span-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-400">
                      Aplicativos, MAC e chaves configuradas
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setAplicativos((list) => [...list, { nome: '', mac: '', chave: '' }])
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold text-cyan-300 transition-all duration-300 hover:-translate-y-0.5 hover:bg-cyan-500/20"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Adicionar Aplicativo
                    </button>
                  </div>

                  {aplicativos.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/10 py-3 text-center text-xs text-zinc-500">
                      Nenhum aplicativo adicionado.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {aplicativos.map((app, idx) => (
                        <div
                          key={idx}
                          className="relative rounded-2xl border border-white/5 bg-[#030509]/70 p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
                              Aplicativo #{idx + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setAplicativos((list) => list.filter((_, i) => i !== idx))
                              }
                              aria-label={`Remover aplicativo ${idx + 1}`}
                              title="Remover aplicativo"
                              className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-red-500/10 hover:text-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-zinc-300">
                                Nome do App
                              </label>
                              <input
                                value={app.nome}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setAplicativos((list) =>
                                    list.map((item, i) =>
                                      i === idx ? { ...item, nome: val } : item
                                    )
                                  )
                                }}
                                placeholder="Ex: XCIPTV, IBO"
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-zinc-300">
                                Endereço MAC
                              </label>
                              <input
                                value={app.mac}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setAplicativos((list) =>
                                    list.map((item, i) =>
                                      i === idx ? { ...item, mac: val } : item
                                    )
                                  )
                                }}
                                placeholder="00:1A:79:..."
                                className={`${inputClass} tabular-nums`}
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-zinc-300">
                                Chave de Acesso
                              </label>
                              <input
                                value={app.chave}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setAplicativos((list) =>
                                    list.map((item, i) =>
                                      i === idx ? { ...item, chave: val } : item
                                    )
                                  )
                                }}
                                placeholder="Device Key / Senha"
                                className={`${inputClass} tabular-nums`}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 5. Assinatura */}
                <SectionTitle>Assinatura</SectionTitle>
                <Field label="Plano" htmlFor="f-plano">
                  <input
                    id="f-plano"
                    value={form.plano}
                    onChange={(e) => setField('plano', e.target.value)}
                    placeholder="Ex.: Mensal, Trimestral"
                    className={inputClass}
                  />
                </Field>
                <Field label="Valor mensal (R$)" htmlFor="f-valor">
                  <input
                    id="f-valor"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.valor}
                    onChange={(e) => setField('valor', e.target.value)}
                    placeholder="0,00"
                    className={`${inputClass} tabular-nums`}
                  />
                </Field>
                <Field label="Data de início" htmlFor="f-inicio">
                  <input
                    id="f-inicio"
                    type="date"
                    value={form.inicio}
                    onChange={(e) => setField('inicio', e.target.value)}
                    className={`${inputClass} [color-scheme:dark] tabular-nums`}
                  />
                </Field>
                <Field label="Status" htmlFor="f-status">
                  <select
                    id="f-status"
                    value={form.status}
                    onChange={(e) => {
                      const status = e.target.value as Status
                      setForm((f) => ({
                        ...f,
                        status,
                        testeHoras: status === 'teste' ? f.testeHoras : null,
                      }))
                    }}
                    className={`${inputClass} [color-scheme:dark]`}
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                    <option value="teste">Teste</option>
                  </select>
                </Field>

                {isTeste ? (
                  <div className="sm:col-span-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.06] p-4">
                    <p className="mb-3 flex items-center gap-2 text-xs font-medium text-cyan-300">
                      <Clock className="h-4 w-4" />
                      Duração do teste
                    </p>
                    <div className="flex gap-3">
                      {([4, 24] as const).map((h) => (
                        <button
                          key={h}
                          type="button"
                          aria-pressed={form.testeHoras === h}
                          onClick={() => setField('testeHoras', h)}
                          className={`flex-1 rounded-xl border px-4 py-2.5 text-xs font-semibold tabular-nums transition-all duration-300 hover:-translate-y-0.5 ${
                            form.testeHoras === h
                              ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.18)]'
                              : 'border-white/10 bg-[#030509]/70 text-zinc-300 hover:border-cyan-500/30'
                          }`}
                        >
                          {h} Horas
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-zinc-500">
                      O vencimento exato é calculado no momento em que você clica em Guardar.
                    </p>
                  </div>
                ) : (
                  <Field label="Data de vencimento" htmlFor="f-vencimento" full>
                    <input
                      id="f-vencimento"
                      type="date"
                      value={form.vencimento}
                      onChange={(e) => setField('vencimento', e.target.value)}
                      className={`${inputClass} [color-scheme:dark] tabular-nums`}
                    />
                  </Field>
                )}

                {/* 6. Outros */}
                <SectionTitle>Outros</SectionTitle>
                <Field label="Observações" htmlFor="f-obs" full>
                  <textarea
                    id="f-obs"
                    rows={4}
                    value={form.obs}
                    onChange={(e) => setField('obs', e.target.value)}
                    placeholder="Anotações sobre o cliente…"
                    className={`${inputClass} resize-none`}
                  />
                </Field>

                {formError && (
                  <div
                    role="alert"
                    className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                    <span>{formError}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 border-t border-white/5 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="rounded-xl border border-white/10 bg-[#030509]/80 px-4 py-2 text-xs font-medium text-zinc-300 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-5 py-2 text-xs font-semibold text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.15)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:bg-cyan-500/25 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Guardar
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </div>
  )
}
