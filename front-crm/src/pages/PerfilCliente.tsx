import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  History,
  Loader2,
  MessageCircle,
  MessageSquarePlus,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Send,
  Server,
  Smartphone,
  Trash2,
  Tv,
  User,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { listarServidores, type Servidor } from '../lib/servidores'
import { useToast } from '../contexts/ToastContext'
import { useFeatureGating } from '../hooks/useFeatureGating'
import { useAuth } from '../contexts/AuthContext'
import {
  buildResellerOwnershipFields,
  fetchClienteByIdMultiTenant,
  getSafeHomeRoute,
  isResellerUser,
  isUnauthorizedSupabaseError,
  updateClienteMultiTenant,
} from '../lib/multiTenant'
import {
  EmptyState,
  StatusBadge,
  type StatusSemanticVariant,
} from '../components/ui/TierOnePrimitives'

interface AplicativoItem {
  nome: string
  mac: string
  chave: string
}

type Status = 'ativo' | 'inativo' | 'teste'

interface Cliente {
  id: string | number
  nome?: string
  nome_completo?: string
  whatsapp?: string
  email?: string
  login_usuario?: string
  usuario_iptv?: string
  senha?: string
  senha_iptv?: string
  plano?: string
  valor_mensal?: number | string
  data_inicio?: string
  data_vencimento?: string
  Status?: string
  status?: string
  estagio_funil?: 'Lead' | 'Teste' | 'Negociacao' | 'Cliente' | string
  observacoes?: string
  servidores?: string[]
  aplicativos?: AplicativoItem[]
  [key: string]: unknown
}

interface Interacao {
  id: string | number
  cliente_id: string | number
  tipo: string
  descricao: string
  data: string
  created_at?: string
}

interface Fatura {
  id: string | number
  cliente_id: string | number
  valor: number
  data_vencimento: string
  data_pagamento?: string | null
  status: 'pago' | 'pendente' | 'atrasado' | 'cancelado'
  descricao?: string
  metodo_pagamento?: string | null
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const glassCardClass =
  'relative overflow-hidden rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.4)]'

const inputClass =
  'w-full rounded-xl border border-white/10 bg-[#030509]/80 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none backdrop-blur-xl transition-all duration-300 focus:border-cyan-500/40 focus:ring-2 focus:ring-cyan-500/20 focus:shadow-[0_0_20px_rgba(34,211,238,0.12)]'

function getClienteStatusVariant(raw?: string): { variant: StatusSemanticVariant; label: string } {
  const s = (raw || 'ativo').trim().toLowerCase()
  if (s === 'teste') return { variant: 'teste', label: 'Teste' }
  if (s === 'alerta' || s === 'alerta_vencimento' || s === 'a_vencer' || s === 'vencendo') {
    return { variant: 'vencendo', label: 'Vencendo' }
  }
  if (s === 'inativo' || s === 'vencido' || s === 'cancelado') {
    return { variant: 'vencido', label: s === 'vencido' ? 'Vencido' : 'Inativo' }
  }
  return { variant: 'ativo', label: 'Ativo' }
}

function getFaturaStatusVariant(
  status: Fatura['status']
): { variant: StatusSemanticVariant; label: string } {
  if (status === 'pago') return { variant: 'ativo', label: 'Pago' }
  if (status === 'atrasado') return { variant: 'vencido', label: 'Atrasado' }
  if (status === 'cancelado') return { variant: 'neutral', label: 'Cancelado' }
  return { variant: 'vencendo', label: 'Pendente' }
}

function Field({
  label,
  htmlFor,
  children,
  className,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-zinc-300">
        {label}
      </label>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="sm:col-span-2 border-b border-white/5 pb-2 pt-4 first:pt-0">
      <h3 className="text-xs font-semibold tracking-tight text-cyan-300/90 uppercase">
        {children}
      </h3>
    </div>
  )
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('pt-BR')
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function PerfilCliente() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { usuario, loading: loadingAuth } = useAuth()
  const { protegerAcao } = useFeatureGating()

  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [interacoes, setInteracoes] = useState<Interacao[]>([])
  const [faturas, setFaturas] = useState<Fatura[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<'timeline' | 'financeiro'>('timeline')

  const [notaTexto, setNotaTexto] = useState('')
  const [savingNota, setSavingNota] = useState(false)
  const [notaError, setNotaError] = useState<string | null>(null)

  const [faturaValor, setFaturaValor] = useState('')
  const [faturaVencimento, setFaturaVencimento] = useState('')
  const [savingFatura, setSavingFatura] = useState(false)
  const [faturaError, setFaturaError] = useState<string | null>(null)
  const [payingId, setPayingId] = useState<string | number | null>(null)

  const [showPassword, setShowPassword] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editForm, setEditForm] = useState({
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
    obs: '',
  })
  const [editServidores, setEditServidores] = useState<string[]>([])
  const [dbServidores, setDbServidores] = useState<Servidor[]>([])
  const [editAplicativos, setEditAplicativos] = useState<AplicativoItem[]>([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  useEffect(() => {
    void listarServidores(usuario?.role, usuario?.authId || usuario?.id).then((res) =>
      setDbServidores(res.servidores)
    )
  }, [usuario])

  const copyToClipboard = (text: string, keyName: string) => {
    void navigator.clipboard.writeText(text)
    setCopiedKey(keyName)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const loadData = useCallback(async () => {
    if (!id || loadingAuth || !usuario) return
    setLoading(true)
    setError(null)

    try {
      const {
        data: clientData,
        unauthorized,
        error: clientErr,
      } = await fetchClienteByIdMultiTenant(id, usuario.role, usuario.id, usuario.authId)

      if (unauthorized) {
        toast.warning(
          'Acesso não autorizado: este cliente não pertence à sua carteira.',
          'Isolamento de Dados'
        )
        navigate(getSafeHomeRoute(usuario), { replace: true })
        return
      }

      if (clientErr) throw clientErr
      if (!clientData) {
        setCliente(null)
        setLoading(false)
        return
      }

      setCliente(clientData as unknown as Cliente)
      const isReseller = isResellerUser(usuario)

      let interacoesQuery = supabase
        .from('interacoes')
        .select('*')
        .eq('cliente_id', id)
        .order('data', { ascending: false })
      if (isReseller) {
        interacoesQuery = interacoesQuery.eq('reseller_id', usuario.id)
      }

      let { data: interacoesData, error: interacoesErr } = await interacoesQuery
      if (isReseller && interacoesErr && interacoesErr.message.toLowerCase().includes('reseller_id')) {
        const fbInt = await supabase
          .from('interacoes')
          .select('*')
          .eq('cliente_id', id)
          .order('data', { ascending: false })
        interacoesData = fbInt.data
        interacoesErr = fbInt.error
      }

      if (!interacoesErr) {
        setInteracoes((interacoesData ?? []) as Interacao[])
      }

      let faturasQuery = supabase
        .from('faturas')
        .select('*')
        .eq('cliente_id', id)
        .order('data_vencimento', { ascending: false })
      if (isReseller) {
        faturasQuery = faturasQuery.eq('reseller_id', usuario.id)
      }

      let { data: faturasData, error: faturasErr } = await faturasQuery
      if (isReseller && faturasErr && faturasErr.message.toLowerCase().includes('reseller_id')) {
        const fbFat = await supabase
          .from('faturas')
          .select('*')
          .eq('cliente_id', id)
          .order('data_vencimento', { ascending: false })
        faturasData = fbFat.data
        faturasErr = fbFat.error
      }

      if (!faturasErr) {
        setFaturas((faturasData ?? []) as Fatura[])
      }
    } catch (err: unknown) {
      if (isUnauthorizedSupabaseError(err)) {
        toast.warning(
          'Acesso não autorizado aos dados deste cliente.',
          'Isolamento de Dados'
        )
        navigate(getSafeHomeRoute(usuario), { replace: true })
        return
      }
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Erro ao carregar dados do cliente: ${msg}`)
      setInteracoes([])
      setFaturas([])
    } finally {
      setLoading(false)
    }
  }, [id, loadingAuth, navigate, toast, usuario])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const openEditModal = () => {
    if (!cliente) return
    const rawInicio = cliente.data_inicio ? String(cliente.data_inicio).slice(0, 10) : ''
    const rawVenc = cliente.data_vencimento ? String(cliente.data_vencimento).slice(0, 10) : ''
    const rawStatus = (cliente.status ? String(cliente.status).toLowerCase() : 'ativo') as Status

    setEditForm({
      nome: cliente.nome_completo || cliente.nome || '',
      whatsapp: cliente.whatsapp || '',
      email: cliente.email || '',
      usuario: cliente.login_usuario || cliente.usuario_iptv || '',
      senha: cliente.senha || cliente.senha_iptv || '',
      plano: cliente.plano || '',
      valor: cliente.valor_mensal ? String(cliente.valor_mensal) : '',
      inicio: rawInicio,
      vencimento: rawVenc,
      status: ['ativo', 'inativo', 'teste'].includes(rawStatus) ? rawStatus : 'ativo',
      obs: cliente.observacoes || '',
    })

    const srvs: string[] = Array.isArray(cliente.servidores)
      ? [...cliente.servidores]
      : typeof cliente.servidores === 'string'
      ? [cliente.servidores]
      : []
    setEditServidores(srvs)

    const apps: AplicativoItem[] = Array.isArray(cliente.aplicativos)
      ? cliente.aplicativos.map((a) => ({
          nome: a.nome || '',
          mac: a.mac || '',
          chave: a.chave || '',
        }))
      : []
    setEditAplicativos(apps)

    setEditError(null)
    setEditModalOpen(true)
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (!id || !editForm.nome.trim() || !editForm.whatsapp.trim()) return

    setSavingEdit(true)
    setEditError(null)

    const payload = {
      nome_completo: editForm.nome.trim(),
      whatsapp: editForm.whatsapp.trim(),
      email: editForm.email.trim() || null,
      login_usuario: editForm.usuario.trim() || null,
      senha: editForm.senha || null,
      plano: editForm.plano.trim() || null,
      valor_mensal: editForm.valor ? Number(editForm.valor) : null,
      data_inicio: editForm.inicio
        ? new Date(`${editForm.inicio}T12:00:00Z`).toISOString()
        : null,
      data_vencimento: editForm.vencimento
        ? new Date(`${editForm.vencimento}T12:00:00Z`).toISOString()
        : null,
      status: editForm.status ? editForm.status.toLowerCase() : 'ativo',
      observacoes: editForm.obs.trim() || null,
      servidores: editServidores.map((s) => s.trim()).filter(Boolean),
      aplicativos: editAplicativos
        .map((a) => ({ nome: a.nome.trim(), mac: a.mac.trim(), chave: a.chave.trim() }))
        .filter((a) => a.nome || a.mac || a.chave),
    }

    const { error: updateErr, unauthorized } = await updateClienteMultiTenant(
      id,
      payload,
      usuario?.role,
      usuario?.id,
      usuario?.authId
    )
    setSavingEdit(false)

    if (unauthorized) {
      setEditModalOpen(false)
      toast.warning(
        'Acesso não autorizado: não é permitido alterar registos de outro parceiro.',
        'Isolamento de Dados'
      )
      navigate(getSafeHomeRoute(usuario), { replace: true })
      return
    }

    if (updateErr) {
      setEditError(`Não foi possível salvar alterações: ${updateErr.message}`)
      return
    }

    setEditModalOpen(false)
    toast.success('Dados do cliente atualizados.')
    await loadData()
  }

  async function handleAddNota(e: FormEvent) {
    e.preventDefault()
    if (!notaTexto.trim() || !id) return

    setSavingNota(true)
    setNotaError(null)

    const ownership = buildResellerOwnershipFields(usuario?.id, usuario?.authId)
    const payload: Record<string, unknown> = {
      cliente_id: id,
      tipo: 'nota',
      descricao: notaTexto.trim(),
      data: new Date().toISOString(),
      reseller_id: ownership.reseller_id,
      tenant_id: ownership.tenant_id,
    }

    let { error: insertErr } = await supabase.from('interacoes').insert(payload)
    if (insertErr && insertErr.message.toLowerCase().includes('reseller_id')) {
      const { reseller_id: _omit, ...legacyPayload } = payload
      void _omit
      const fb = await supabase.from('interacoes').insert(legacyPayload)
      insertErr = fb.error
    }
    setSavingNota(false)

    if (insertErr) {
      if (isUnauthorizedSupabaseError(insertErr)) {
        toast.warning('Acesso não autorizado para registar interações neste cliente.')
        navigate(getSafeHomeRoute(usuario), { replace: true })
        return
      }
      setNotaError(`Não foi possível salvar a nota: ${insertErr.message}`)
      return
    }

    setNotaTexto('')
    await loadData()
  }

  async function handleAddFatura(e: FormEvent) {
    e.preventDefault()
    if (!faturaValor || !faturaVencimento || !id) return

    setSavingFatura(true)
    setFaturaError(null)

    const ownership = buildResellerOwnershipFields(usuario?.id, usuario?.authId)
    const payload: Record<string, unknown> = {
      cliente_id: id,
      valor: Number(faturaValor),
      data_vencimento: new Date(`${faturaVencimento}T12:00:00Z`).toISOString(),
      status: 'pendente',
      data_pagamento: null,
      ...ownership,
    }

    let { error: insertErr } = await supabase.from('faturas').insert(payload)
    if (insertErr && insertErr.message.toLowerCase().includes('reseller_id')) {
      const { reseller_id: _omit, ...legacyPayload } = payload
      void _omit
      const fb = await supabase.from('faturas').insert(legacyPayload)
      insertErr = fb.error
    }
    setSavingFatura(false)

    if (insertErr) {
      if (isUnauthorizedSupabaseError(insertErr)) {
        toast.warning('Acesso não autorizado para gerar cobrança neste cliente.')
        navigate(getSafeHomeRoute(usuario), { replace: true })
        return
      }
      setFaturaError(`Não foi possível gerar a fatura: ${insertErr.message}`)
      return
    }

    setFaturaValor('')
    setFaturaVencimento('')
    await loadData()
  }

  async function handleLiquidarPagamento(faturaId: string | number) {
    if (!id) return
    if (!protegerAcao()) return
    setPayingId(faturaId)
    const agora = new Date().toISOString()
    const isReseller = isResellerUser(usuario)

    let fatQuery = supabase
      .from('faturas')
      .update({ status: 'pago', data_pagamento: agora })
      .eq('id', faturaId)
      .eq('cliente_id', id)

    if (isReseller && usuario?.id) {
      fatQuery = fatQuery.eq('reseller_id', usuario.id)
    }

    let { error: updateFatErr } = await fatQuery
    if (isReseller && updateFatErr && updateFatErr.message.toLowerCase().includes('reseller_id')) {
      const fbFat = await supabase
        .from('faturas')
        .update({ status: 'pago', data_pagamento: agora })
        .eq('id', faturaId)
        .eq('cliente_id', id)
      updateFatErr = fbFat.error
    }

    if (updateFatErr) {
      setPayingId(null)
      if (isUnauthorizedSupabaseError(updateFatErr)) {
        toast.warning('Acesso não autorizado para liquidar este pagamento.')
        navigate(getSafeHomeRoute(usuario), { replace: true })
        return
      }
      toast.error(`Erro ao liquidar fatura: ${updateFatErr.message}`)
      return
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let base = today
    if (cliente?.data_vencimento) {
      const currDue = new Date(cliente.data_vencimento)
      if (!Number.isNaN(currDue.getTime())) {
        currDue.setHours(0, 0, 0, 0)
        if (currDue > today) base = currDue
      }
    }
    const novaDataVencimento = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate() + 30,
      12,
      0,
      0,
      0
    )
    const novaDataVencimentoIso = novaDataVencimento.toISOString()

    const { error: updateCliErr, unauthorized: cliUnauth } = await updateClienteMultiTenant(
      id,
      {
        data_vencimento: novaDataVencimentoIso,
        status: 'ativo',
      },
      usuario?.role,
      usuario?.id,
      usuario?.authId
    )

    setPayingId(null)

    if (cliUnauth) {
      toast.warning('Acesso não autorizado ao atualizar prazo do cliente.')
      navigate(getSafeHomeRoute(usuario), { replace: true })
      return
    }

    if (updateCliErr) {
      toast.warning(`Fatura liquidada, aviso ao atualizar cliente: ${updateCliErr.message}`)
    } else {
      toast.success('Fatura liquidada! Vencimento estendido em +30 dias.')
    }

    setFaturas((prev) =>
      prev.map((f) => (f.id === faturaId ? { ...f, status: 'pago', data_pagamento: agora } : f))
    )

    setCliente((prev) =>
      prev ? { ...prev, status: 'ativo', data_vencimento: novaDataVencimentoIso } : prev
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030509] text-zinc-100">
        <div className="h-16 border-b border-white/5 bg-[#06080d]/60 backdrop-blur-2xl px-6 lg:px-10 flex items-center">
          <div className="h-6 w-48 rounded-lg bg-white/5 animate-pulse" />
        </div>
        <div className="w-full max-w-[1600px] mx-auto p-6 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-5">
            <div className="h-64 rounded-2xl border border-white/5 bg-[#06080d]/60 animate-pulse" />
            <div className="h-44 rounded-2xl border border-white/5 bg-[#06080d]/60 animate-pulse" />
          </div>
          <div className="lg:col-span-7 space-y-5">
            <div className="h-12 rounded-2xl border border-white/5 bg-[#06080d]/60 animate-pulse" />
            <div className="h-80 rounded-2xl border border-white/5 bg-[#06080d]/60 animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !cliente) {
    return (
      <div className="min-h-screen bg-[#030509] px-6 py-16 text-zinc-100 flex items-center justify-center">
        <div className="w-full max-w-md">
          <EmptyState
            icon={AlertCircle}
            title="Cliente não encontrado"
            description={
              error ||
              'O registro solicitado não foi localizado ou você não possui permissão para visualizá-lo.'
            }
            action={
              <button
                type="button"
                onClick={() => navigate(getSafeHomeRoute(usuario))}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#06080d]/80 px-4 py-2 text-xs font-medium text-zinc-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Voltar ao Início</span>
              </button>
            }
          />
        </div>
      </div>
    )
  }

  const nomeExibicao = (cliente.nome_completo || cliente.nome || 'Cliente').trim()
  const usuarioExibicao = cliente.login_usuario || cliente.usuario_iptv || ''
  const senhaExibicao = cliente.senha || cliente.senha_iptv || ''
  const statusInfo = getClienteStatusVariant(
    String(cliente.status || cliente.Status || 'ativo')
  )
  const estagio =
    cliente.estagio_funil || (statusInfo.variant === 'teste' ? 'Teste' : 'Cliente')

  const servidoresList: string[] = Array.isArray(cliente.servidores)
    ? cliente.servidores
    : typeof cliente.servidores === 'string'
    ? [cliente.servidores]
    : []

  const aplicativosList: AplicativoItem[] = Array.isArray(cliente.aplicativos)
    ? cliente.aplicativos
    : []

  const whatsappDigits = (cliente.whatsapp || '').replace(/\D/g, '')
  const whatsappUrl = whatsappDigits
    ? `https://wa.me/${whatsappDigits.length <= 11 ? `55${whatsappDigits}` : whatsappDigits}`
    : null

  return (
    <div className="relative min-h-screen bg-[#030509] text-zinc-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-100">
      {/* Ambient Background Glow */}
      <div className="pointer-events-none fixed -top-40 right-0 h-[400px] w-[520px] rounded-full bg-radial from-cyan-500/10 to-transparent blur-3xl" />

      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#06080d]/70 backdrop-blur-2xl">
        <div className="w-full max-w-[1600px] mx-auto flex flex-col sm:flex-row sm:h-16 items-start sm:items-center justify-between gap-4 px-6 lg:px-10 py-3 sm:py-0">
          <div className="flex items-center gap-3.5">
            <Link
              to="/retencao"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#06080d]/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:text-zinc-100 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Voltar</span>
            </Link>

            <div className="h-5 w-px bg-white/10 hidden sm:block" />

            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 text-xs font-semibold text-cyan-300 shadow-[0_0_16px_rgba(34,211,238,0.15)] shrink-0">
                {nomeExibicao.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-base font-semibold tracking-tight text-zinc-100">
                    {nomeExibicao}
                  </h1>
                  {cliente.whatsapp && (
                    <span className="text-xs text-zinc-400 font-mono tabular-nums [font-variant-numeric:tabular-nums]">
                      {cliente.whatsapp}
                    </span>
                  )}
                  <StatusBadge variant={statusInfo.variant} label={statusInfo.label} />
                  <StatusBadge variant="neutral" label={estagio} showDot={false} />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3.5 py-1.5 text-xs font-medium text-emerald-300 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/50 hover:bg-emerald-500/25 hover:shadow-[0_0_20px_rgba(52,211,153,0.2)]"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span>WhatsApp</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => void loadData()}
              title="Recarregar"
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-[#06080d]/60 text-zinc-400 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:text-cyan-300 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative w-full max-w-[1600px] mx-auto p-6 lg:p-10">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* COLUNA ESQUERDA */}
          <div className="space-y-5 lg:col-span-5">
            {/* Ficha Cadastral */}
            <section className={`${glassCardClass} p-6`}>
              <div className="pointer-events-none absolute -top-14 -right-14 h-36 w-36 rounded-full bg-radial from-cyan-500/10 to-transparent" />

              <div className="relative flex items-center justify-between mb-4">
                <h2 className="flex items-center gap-2 text-xs font-semibold tracking-tight text-zinc-100">
                  <User className="h-4 w-4 text-cyan-400" />
                  <span>Ficha Cadastral</span>
                </h2>
                <button
                  type="button"
                  onClick={openEditModal}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:text-cyan-200 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Editar</span>
                </button>
              </div>

              <div className="relative space-y-3 divide-y divide-white/5 text-xs">
                <div className="pt-1 flex justify-between">
                  <span className="text-zinc-500">WhatsApp</span>
                  <span className="font-mono text-zinc-200 tabular-nums [font-variant-numeric:tabular-nums]">
                    {cliente.whatsapp || 'Não informado'}
                  </span>
                </div>

                <div className="pt-3 flex justify-between">
                  <span className="text-zinc-500">E-mail</span>
                  <span className="text-zinc-200">{cliente.email || 'Não informado'}</span>
                </div>

                <div className="pt-3 flex justify-between">
                  <span className="text-zinc-500">Plano</span>
                  <span className="font-medium text-zinc-200">{cliente.plano || 'Mensal'}</span>
                </div>

                <div className="pt-3 flex justify-between">
                  <span className="text-zinc-500">Valor Mensal</span>
                  <span className="font-mono font-semibold text-cyan-300 tabular-nums [font-variant-numeric:tabular-nums]">
                    {cliente.valor_mensal ? brl.format(Number(cliente.valor_mensal)) : 'R$ 0,00'}
                  </span>
                </div>

                <div className="pt-3 flex justify-between">
                  <span className="text-zinc-500">Início</span>
                  <span className="text-zinc-300 tabular-nums [font-variant-numeric:tabular-nums]">
                    {formatDate(cliente.data_inicio)}
                  </span>
                </div>

                <div className="pt-3 flex justify-between items-center">
                  <span className="text-zinc-500">Vencimento</span>
                  <span className="inline-flex items-center gap-1.5 font-mono font-medium text-amber-400 tabular-nums [font-variant-numeric:tabular-nums]">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {formatDate(cliente.data_vencimento)}
                  </span>
                </div>
              </div>
            </section>

            {/* Acesso & Credenciais */}
            <section className={`${glassCardClass} p-6`}>
              <div className="pointer-events-none absolute -bottom-14 -right-14 h-36 w-36 rounded-full bg-radial from-cyan-500/10 to-transparent" />

              <h2 className="relative flex items-center gap-2 text-xs font-semibold tracking-tight text-zinc-100">
                <Tv className="h-4 w-4 text-cyan-400" />
                <span>Acesso & Credenciais</span>
              </h2>

              <div className="relative mt-4 space-y-2.5">
                <div className="rounded-xl border border-white/5 bg-[#030509]/70 p-3">
                  <div className="text-[11px] text-zinc-500">Login / Usuário</div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-mono text-sm text-zinc-100 tabular-nums">
                      {usuarioExibicao || '—'}
                    </span>
                    {usuarioExibicao && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(usuarioExibicao, 'user')}
                        className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-cyan-300 transition-colors"
                        title="Copiar usuário"
                      >
                        {copiedKey === 'user' ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-white/5 bg-[#030509]/70 p-3">
                  <div className="text-[11px] text-zinc-500">Senha</div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-mono text-sm text-zinc-100 tabular-nums">
                      {showPassword ? senhaExibicao || '—' : '••••••••'}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-cyan-300 transition-colors"
                        aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                      {senhaExibicao && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(senhaExibicao, 'pass')}
                          className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/5 hover:text-cyan-300 transition-colors"
                          title="Copiar senha"
                        >
                          {copiedKey === 'pass' ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Servidores & Aplicativos */}
            <section className={`${glassCardClass} p-6`}>
              <h2 className="flex items-center gap-2 text-xs font-semibold tracking-tight text-zinc-100">
                <Server className="h-4 w-4 text-cyan-400" />
                <span>Servidores & Aplicativos</span>
              </h2>

              <div className="mt-4 space-y-4">
                <div>
                  <div className="text-xs text-zinc-500 mb-2">Servidores Conectados</div>
                  {servidoresList.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/10 bg-[#030509]/40 px-3 py-2.5 text-xs text-zinc-500">
                      Nenhum servidor atribuído. Clique em &ldquo;Editar&rdquo; para vincular um servidor.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {servidoresList.map((srv, idx) => (
                        <StatusBadge key={idx} variant="teste" label={srv} />
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-white/5">
                  <div className="text-xs text-zinc-500 mb-2">Aplicativos Instalados</div>
                  {aplicativosList.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-white/10 bg-[#030509]/40 px-3 py-2.5 text-xs text-zinc-500">
                      Nenhum aplicativo configurado (MAC / Device Key).
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {aplicativosList.map((app, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl border border-white/5 bg-[#030509]/70 p-3 text-xs"
                        >
                          <div className="flex items-center gap-1.5 font-medium text-zinc-200">
                            <Smartphone className="h-3.5 w-3.5 text-cyan-400" />
                            <span>{app.nome || 'App'}</span>
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-zinc-500">
                            <div>
                              <span className="block text-[10px]">MAC</span>
                              <span className="font-mono text-zinc-300 tabular-nums">
                                {app.mac || '—'}
                              </span>
                            </div>
                            <div>
                              <span className="block text-[10px]">Chave</span>
                              <span className="font-mono text-zinc-300 tabular-nums">
                                {app.chave || '—'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {cliente.observacoes && (
              <section className={`${glassCardClass} p-6`}>
                <h2 className="text-xs font-semibold tracking-tight text-zinc-100 mb-2">
                  Observações
                </h2>
                <p className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {cliente.observacoes}
                </p>
              </section>
            )}
          </div>

          {/* COLUNA DIREITA */}
          <div className="space-y-5 lg:col-span-7">
            {/* Segmented Glass Tabs */}
            <div className={`flex items-center gap-1.5 p-1.5 ${glassCardClass}`}>
              <button
                type="button"
                onClick={() => setActiveTab('timeline')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-medium transition-all duration-300 ${
                  activeTab === 'timeline'
                    ? 'border border-cyan-500/30 bg-cyan-500/15 text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.12)]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                }`}
              >
                <History className="h-3.5 w-3.5" />
                <span>Timeline</span>
                <span className="rounded-md border border-white/10 bg-[#030509]/80 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300 tabular-nums [font-variant-numeric:tabular-nums]">
                  {interacoes.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('financeiro')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-medium transition-all duration-300 ${
                  activeTab === 'financeiro'
                    ? 'border border-cyan-500/30 bg-cyan-500/15 text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.12)]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.03]'
                }`}
              >
                <CreditCard className="h-3.5 w-3.5" />
                <span>Financeiro</span>
                <span className="rounded-md border border-white/10 bg-[#030509]/80 px-1.5 py-0.5 text-[10px] font-mono text-zinc-300 tabular-nums [font-variant-numeric:tabular-nums]">
                  {faturas.length}
                </span>
              </button>
            </div>

            {activeTab === 'timeline' && (
              <div className="space-y-5">
                <form onSubmit={handleAddNota} className={`${glassCardClass} p-5`}>
                  <div className="pointer-events-none absolute -top-14 -right-14 h-36 w-36 rounded-full bg-radial from-cyan-500/10 to-transparent" />

                  <label className="relative mb-2 block text-xs font-medium text-zinc-300">
                    Registrar Nova Interação / Nota
                  </label>

                  <textarea
                    rows={3}
                    value={notaTexto}
                    onChange={(e) => setNotaTexto(e.target.value)}
                    placeholder="Escreva uma observação sobre atendimento, negociação ou suporte..."
                    className={`${inputClass} relative resize-none`}
                  />

                  {notaError && (
                    <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {notaError}
                    </p>
                  )}

                  <div className="relative mt-3 flex justify-end">
                    <button
                      type="submit"
                      disabled={savingNota || !notaTexto.trim()}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-4 py-2 text-xs font-semibold text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.12)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:bg-cyan-500/25 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                      {savingNota ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      <span>Registrar Nota</span>
                    </button>
                  </div>
                </form>

                <div className="space-y-3">
                  <h3 className="text-xs font-medium text-zinc-400 tabular-nums [font-variant-numeric:tabular-nums]">
                    Histórico de Interações ({interacoes.length})
                  </h3>

                  {interacoes.length === 0 ? (
                    <EmptyState
                      icon={MessageSquarePlus}
                      title="Nenhuma interação registrada"
                      description="Use o campo acima para anotar atendimentos de suporte, preferências de aparelho ou negociações realizadas com este cliente."
                    />
                  ) : (
                    <div className="space-y-3">
                      {interacoes.map((item) => (
                        <div
                          key={item.id}
                          className={`${glassCardClass} p-4 transition-all duration-300 hover:border-cyan-500/20`}
                        >
                          <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
                            <StatusBadge
                              variant="teste"
                              label={(item.tipo || 'Nota').toUpperCase()}
                              showDot={false}
                            />
                            <span className="flex items-center gap-1 font-mono text-[11px] text-zinc-400 tabular-nums [font-variant-numeric:tabular-nums]">
                              <Clock className="h-3 w-3 text-cyan-400" />
                              {formatDateTime(item.data || item.created_at)}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-zinc-200 whitespace-pre-wrap leading-relaxed">
                            {item.descricao}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'financeiro' && (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div
                    className={`${glassCardClass} p-5 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]`}
                  >
                    <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-radial from-cyan-500/10 to-transparent" />
                    <span className="text-xs text-zinc-400">Mensalidade Contratada</span>
                    <div className="mt-1.5 text-2xl font-semibold font-mono text-zinc-100 tabular-nums [font-variant-numeric:tabular-nums]">
                      {cliente.valor_mensal ? brl.format(Number(cliente.valor_mensal)) : 'R$ 0,00'}
                    </div>
                    <span className="mt-1 inline-block text-xs text-cyan-400/90">
                      Plano: {cliente.plano || 'Mensal'}
                    </span>
                  </div>

                  <div
                    className={`${glassCardClass} p-5 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]`}
                  >
                    <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-radial from-cyan-500/10 to-transparent" />
                    <span className="text-xs text-zinc-400">Total de Faturas</span>
                    <div className="mt-1.5 text-2xl font-semibold font-mono text-zinc-100 tabular-nums [font-variant-numeric:tabular-nums]">
                      {faturas.length}
                    </div>
                    <span className="mt-1 inline-block text-xs text-zinc-500">
                      Histórico financeiro completo
                    </span>
                  </div>
                </div>

                <form onSubmit={handleAddFatura} className={`${glassCardClass} p-5`}>
                  <div className="pointer-events-none absolute -top-14 -right-14 h-36 w-36 rounded-full bg-radial from-cyan-500/10 to-transparent" />
                  <h3 className="relative text-xs font-semibold text-zinc-100 mb-3">
                    Gerar Nova Fatura
                  </h3>

                  <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1.5">Valor (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={faturaValor}
                        onChange={(e) => setFaturaValor(e.target.value)}
                        placeholder="35.00"
                        className={`${inputClass} tabular-nums [font-variant-numeric:tabular-nums]`}
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-zinc-400 mb-1.5">Vencimento</label>
                      <input
                        type="date"
                        required
                        value={faturaVencimento}
                        onChange={(e) => setFaturaVencimento(e.target.value)}
                        className={`${inputClass} [color-scheme:dark] tabular-nums [font-variant-numeric:tabular-nums]`}
                      />
                    </div>
                  </div>

                  {faturaError && (
                    <p className="mt-3 text-xs text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {faturaError}
                    </p>
                  )}

                  <div className="relative mt-4 flex justify-end">
                    <button
                      type="submit"
                      disabled={savingFatura || !faturaValor || !faturaVencimento}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-4 py-2 text-xs font-semibold text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.12)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:bg-cyan-500/25 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] disabled:opacity-50 disabled:hover:translate-y-0"
                    >
                      {savingFatura ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      <span>Gerar Fatura</span>
                    </button>
                  </div>
                </form>

                {faturas.length === 0 ? (
                  <EmptyState
                    icon={Receipt}
                    title="Nenhuma fatura emitida ainda"
                    description="Informe o valor e a data de vencimento no formulário acima e clique em 'Gerar Fatura' para iniciar o controle financeiro deste assinante."
                  />
                ) : (
                  <div className={`${glassCardClass}`}>
                    <div className="p-5 border-b border-white/5">
                      <h3 className="text-xs font-semibold text-zinc-100">Extrato de Faturas</h3>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/5 bg-[#030509]/50 text-xs font-semibold text-zinc-400">
                            <th className="p-4">Vencimento</th>
                            <th className="p-4">Valor</th>
                            <th className="p-4">Status</th>
                            <th className="p-4">Pagamento</th>
                            <th className="p-4 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody>
                          {faturas.map((fat) => {
                            const isPaid = fat.status === 'pago'
                            const isPaying = payingId === fat.id
                            const fatBadge = getFaturaStatusVariant(fat.status)
                            return (
                              <tr
                                key={fat.id}
                                className="border-b border-white/5 hover:bg-white/[0.03] transition-colors text-xs"
                              >
                                <td className="p-4 font-mono text-zinc-200 tabular-nums [font-variant-numeric:tabular-nums]">
                                  {formatDate(fat.data_vencimento)}
                                </td>
                                <td className="p-4 font-mono font-semibold text-zinc-100 tabular-nums [font-variant-numeric:tabular-nums]">
                                  {brl.format(Number(fat.valor) || 0)}
                                </td>
                                <td className="p-4">
                                  <StatusBadge variant={fatBadge.variant} label={fatBadge.label} />
                                </td>
                                <td className="p-4 text-zinc-400 tabular-nums [font-variant-numeric:tabular-nums]">
                                  {fat.data_pagamento ? formatDate(fat.data_pagamento) : 'Pendente'}
                                </td>
                                <td className="p-4 text-right">
                                  {!isPaid ? (
                                    <button
                                      type="button"
                                      disabled={isPaying}
                                      onClick={() => {
                                        if (!protegerAcao()) return
                                        void handleLiquidarPagamento(fat.id)
                                      }}
                                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-all duration-300 hover:-translate-y-1 hover:border-emerald-400/50 hover:bg-emerald-500/25 hover:shadow-[0_0_20px_rgba(52,211,153,0.2)] disabled:opacity-50 disabled:hover:translate-y-0"
                                    >
                                      {isPaying ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                      )}
                                      <span>Dar Baixa</span>
                                    </button>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      <span>Pago</span>
                                    </span>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modal: Editar Dados do Cliente */}
      {editModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-md"
            onClick={() => setEditModalOpen(false)}
          />
          <aside className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#06080d]/85 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.6)]">
            <div className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-radial from-cyan-500/10 to-transparent" />

            <div className="relative flex items-center justify-between border-b border-white/5 px-6 py-4">
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
                  Editar Dados do Cliente
                </h2>
                <p className="text-xs text-zinc-400">
                  Atualize informações cadastrais, credenciais e assinatura
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="rounded-xl p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="relative flex-1 overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SectionTitle>Dados Pessoais</SectionTitle>
                <Field label="Nome Completo *" htmlFor="e-nome" className="sm:col-span-2">
                  <input
                    id="e-nome"
                    required
                    value={editForm.nome}
                    onChange={(e) => setEditForm((f) => ({ ...f, nome: e.target.value }))}
                    className={inputClass}
                  />
                </Field>
                <Field label="WhatsApp *" htmlFor="e-wa">
                  <input
                    id="e-wa"
                    required
                    value={editForm.whatsapp}
                    onChange={(e) => setEditForm((f) => ({ ...f, whatsapp: e.target.value }))}
                    className={`${inputClass} tabular-nums`}
                  />
                </Field>
                <Field label="E-mail" htmlFor="e-mail">
                  <input
                    id="e-mail"
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                    className={inputClass}
                  />
                </Field>

                <SectionTitle>Acesso IPTV</SectionTitle>
                <Field label="Login de Usuário" htmlFor="e-usr">
                  <input
                    id="e-usr"
                    value={editForm.usuario}
                    onChange={(e) => setEditForm((f) => ({ ...f, usuario: e.target.value }))}
                    className={inputClass}
                  />
                </Field>
                <Field label="Senha do Usuário" htmlFor="e-pwd">
                  <input
                    id="e-pwd"
                    value={editForm.senha}
                    onChange={(e) => setEditForm((f) => ({ ...f, senha: e.target.value }))}
                    className={inputClass}
                  />
                </Field>

                <div className="sm:col-span-2 border-b border-white/5 pb-3 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-zinc-100">Servidores</h3>
                    <button
                      type="button"
                      onClick={() => setEditServidores((s) => [...s, ''])}
                      className="inline-flex items-center gap-1 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-cyan-500/20"
                    >
                      <Plus className="h-3 w-3" /> Adicionar Servidor
                    </button>
                  </div>
                  {editServidores.map((srv, idx) => (
                    <div key={idx} className="mt-2 flex items-center gap-2">
                      <select
                        value={srv}
                        onChange={(e) => {
                          const val = e.target.value
                          setEditServidores((list) =>
                            list.map((item, i) => (i === idx ? val : item))
                          )
                        }}
                        className={`${inputClass} [color-scheme:dark]`}
                      >
                        <option value="">Selecione um servidor cadastrado...</option>
                        {dbServidores
                          .filter((s) => s.status === 'ativo')
                          .map((s) => (
                            <option key={s.id} value={s.nome}>
                              {s.nome} {s.url ? `(${s.url})` : ''}
                            </option>
                          ))}
                        {srv && !dbServidores.some((s) => s.nome === srv) && (
                          <option value={srv}>{srv} (Atual)</option>
                        )}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          setEditServidores((list) => list.filter((_, i) => i !== idx))
                        }
                        className="rounded-xl p-2 text-zinc-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="sm:col-span-2 border-b border-white/5 pb-3 pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-zinc-100">Aplicativos</h3>
                    <button
                      type="button"
                      onClick={() =>
                        setEditAplicativos((a) => [...a, { nome: '', mac: '', chave: '' }])
                      }
                      className="inline-flex items-center gap-1 rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-cyan-500/20"
                    >
                      <Plus className="h-3 w-3" /> Adicionar Aplicativo
                    </button>
                  </div>
                  {editAplicativos.map((app, idx) => (
                    <div
                      key={idx}
                      className="mt-2 rounded-xl border border-white/5 bg-[#030509]/70 p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-cyan-300">App #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setEditAplicativos((list) => list.filter((_, i) => i !== idx))
                          }
                          className="rounded-lg p-1 text-zinc-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <input
                          value={app.nome}
                          onChange={(e) => {
                            const val = e.target.value
                            setEditAplicativos((list) =>
                              list.map((item, i) => (i === idx ? { ...item, nome: val } : item))
                            )
                          }}
                          placeholder="Nome do App"
                          className={inputClass}
                        />
                        <input
                          value={app.mac}
                          onChange={(e) => {
                            const val = e.target.value
                            setEditAplicativos((list) =>
                              list.map((item, i) => (i === idx ? { ...item, mac: val } : item))
                            )
                          }}
                          placeholder="Endereço MAC"
                          className={inputClass}
                        />
                        <input
                          value={app.chave}
                          onChange={(e) => {
                            const val = e.target.value
                            setEditAplicativos((list) =>
                              list.map((item, i) => (i === idx ? { ...item, chave: val } : item))
                            )
                          }}
                          placeholder="Chave de Acesso"
                          className={inputClass}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <SectionTitle>Assinatura</SectionTitle>
                <Field label="Plano" htmlFor="e-plano">
                  <input
                    id="e-plano"
                    value={editForm.plano}
                    onChange={(e) => setEditForm((f) => ({ ...f, plano: e.target.value }))}
                    className={inputClass}
                  />
                </Field>
                <Field label="Valor mensal (R$)" htmlFor="e-val">
                  <input
                    id="e-val"
                    type="number"
                    step="0.01"
                    value={editForm.valor}
                    onChange={(e) => setEditForm((f) => ({ ...f, valor: e.target.value }))}
                    className={`${inputClass} tabular-nums`}
                  />
                </Field>
                <Field label="Data de início" htmlFor="e-ini">
                  <input
                    id="e-ini"
                    type="date"
                    value={editForm.inicio}
                    onChange={(e) => setEditForm((f) => ({ ...f, inicio: e.target.value }))}
                    className={`${inputClass} [color-scheme:dark] tabular-nums`}
                  />
                </Field>
                <Field label="Data de vencimento" htmlFor="e-venc">
                  <input
                    id="e-venc"
                    type="date"
                    value={editForm.vencimento}
                    onChange={(e) => setEditForm((f) => ({ ...f, vencimento: e.target.value }))}
                    className={`${inputClass} [color-scheme:dark] tabular-nums`}
                  />
                </Field>
                <Field label="Status" htmlFor="e-status">
                  <select
                    id="e-status"
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, status: e.target.value as Status }))
                    }
                    className={`${inputClass} [color-scheme:dark]`}
                  >
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                    <option value="teste">Teste</option>
                  </select>
                </Field>

                <SectionTitle>Observações</SectionTitle>
                <Field label="Notas gerais" htmlFor="e-obs" className="sm:col-span-2">
                  <textarea
                    id="e-obs"
                    rows={3}
                    value={editForm.obs}
                    onChange={(e) => setEditForm((f) => ({ ...f, obs: e.target.value }))}
                    className={`${inputClass} resize-none`}
                  />
                </Field>

                {editError && (
                  <div className="sm:col-span-2 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                    <span>{editError}</span>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end gap-2.5 border-t border-white/5 pt-4">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="rounded-xl border border-white/10 bg-[#030509]/80 px-4 py-2 text-xs font-medium text-zinc-300 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/20 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-5 py-2 text-xs font-semibold text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.12)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:bg-cyan-500/25 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] disabled:opacity-50 disabled:hover:translate-y-0"
                >
                  {savingEdit && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Salvar Alterações</span>
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </div>
  )
}
