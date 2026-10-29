import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  Coins,
  Crown,
  Eye,
  EyeOff,
  Inbox,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Store,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { criarAgenteComCredenciais, listarAgentes, useAgente } from '../lib/agente'
import type { Agente, NivelAcesso } from '../lib/agente'
import { Sidebar } from '../components/Sidebar'
import { GerirCreditosModal } from '../components/GerirCreditosModal'
import { SystemClock } from '../components/SystemClock'
import { getErrorMessage } from '../lib/errorHandler'
import { HamburgerButton } from '../components/HamburgerButton'
import {
  listarPedidosPendentes,
  aprovarPedidoPix,
} from '../lib/historicoCompras'
import type { CompraCredito } from '../lib/historicoCompras'
import { useToast } from '../contexts/ToastContext'
import { EmptyState, StatusBadge } from '../components/ui/TierOnePrimitives'

const inputClass =
  'w-full rounded-xl border border-white/10 bg-[#030509]/70 px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * Calcula a diferença exata em dias corridos entre a data de vencimento do acesso e a data atual
 */
function calcularDiasRestantes(dataStr?: string | null): number | null {
  if (!dataStr) return null
  const target = new Date(dataStr)
  if (isNaN(target.getTime())) return null

  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)

  const diffTime = target.getTime() - hoje.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

function formatarDataHora(iso?: string | null): string {
  if (!iso) return 'Recentemente'
  try {
    const d = new Date(iso)
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function GestaoEquipa() {
  const { agente, loading: loadingAgente } = useAgente()
  const toast = useToast()
  const [agentes, setAgentes] = useState<Agente[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Controle de abas: Gestão de Revendas vs Central de Aprovação
  const [abaAtiva, setAbaAtiva] = useState<'revendedores' | 'pedidos'>('revendedores')

  // Pedidos pendentes na Central de Aprovação
  const [pedidosPendentes, setPedidosPendentes] = useState<CompraCredito[]>([])
  const [loadingPedidos, setLoadingPedidos] = useState(false)
  const [aprovandoId, setAprovandoId] = useState<string | null>(null)

  // Modal: Adicionar Revendedor
  const [openCreate, setOpenCreate] = useState(false)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [nivel, setNivel] = useState<NivelAcesso>('Revendedor')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Modal: Editar Revendedor
  const [editingAgente, setEditingAgente] = useState<Agente | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editTelefone, setEditTelefone] = useState('')
  const [editVencimento, setEditVencimento] = useState('')
  const [editNivel, setEditNivel] = useState<NivelAcesso>('Revendedor')
  const [editNovaSenha, setEditNovaSenha] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // Dropdown de ações secundárias (...)
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  // Estados de ações individuais
  const [resettingEmail, setResettingEmail] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [creditosModalAgente, setCreditosModalAgente] = useState<Agente | null>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdownId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await listarAgentes()
      setAgentes(Array.isArray(res.agentes) ? res.agentes : [])
      setError(res.error)
    } catch (err: unknown) {
      console.error('Falha ao obter lista de revendas:', err)
      setAgentes([])
      setError('Erro ao carregar Gestão de Revendas.')
    } finally {
      setLoading(false)
    }
  }, [])

  const carregarPedidos = useCallback(async () => {
    setLoadingPedidos(true)
    try {
      const { pedidos } = await listarPedidosPendentes()
      setPedidosPendentes(pedidos)
    } catch (err) {
      console.warn('Erro ao carregar pedidos pendentes:', err)
    } finally {
      setLoadingPedidos(false)
    }
  }, [])

  useEffect(() => {
    if (loadingAgente || agente?.nivel !== 'Master') return
    void carregar()
    void carregarPedidos()
  }, [agente?.nivel, loadingAgente, carregar, carregarPedidos])

  const handleAprovarPix = async (pedido: CompraCredito) => {
    setAprovandoId(pedido.id)
    setError(null)

    try {
      const res = await aprovarPedidoPix(pedido, agente?.id || undefined)

      if (res.sucesso) {
        setPedidosPendentes((prev) => prev.filter((p) => p.id !== pedido.id))

        setAgentes((prev) =>
          prev.map((ag) => {
            const agId = String(ag.id)
            if (agId === String(pedido.tenant_id) || agId === String(pedido.agente_id)) {
              const saldoAnterior = Number(ag.creditos ?? 0)
              const novoSaldo =
                res.novoSaldo !== undefined ? res.novoSaldo : saldoAnterior + pedido.quantidade
              return { ...ag, creditos: novoSaldo }
            }
            return ag
          })
        )

        toast.success(
          `Liberação aprovada! +${pedido.quantidade} créditos enviados para ${pedido.agente_nome || 'Revendedor'}.`
        )
      } else {
        setError(res.error || 'Não foi possível aprovar a solicitação.')
      }
    } catch (err) {
      console.error('Erro na aprovação:', err)
      setError('Falha inesperada ao aprovar a solicitação.')
    } finally {
      setAprovandoId(null)
    }
  }

  async function handleSubmitCreate(e: FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !email.trim()) {
      setFormError('Nome e e-mail são obrigatórios.')
      return
    }

    setSaving(true)
    setFormError(null)

    const { error: err } = await criarAgenteComCredenciais({
      nome,
      email,
      telefone,
      nivel_acesso: nivel,
      senha: senha.trim() || undefined,
    })

    if (err) {
      setSaving(false)
      setFormError(err)
      return
    }

    try {
      const redirectUrl = `${window.location.origin}/redefinir-senha`
      await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: redirectUrl,
      })
    } catch (resetErr) {
      console.warn('Aviso no envio do e-mail de convite:', resetErr)
    }

    setSaving(false)
    setOpenCreate(false)
    setNome('')
    setEmail('')
    setTelefone('')
    setSenha('')
    setMostrarSenha(false)
    setNivel('Revendedor')

    toast.success(`Revendedor ${email.trim().toLowerCase()} cadastrado com sucesso!`)
    await carregar()
  }

  function handleOpenEdit(a: Agente) {
    setEditingAgente(a)
    setEditNome(a.nome || '')
    setEditEmail(a.email || '')
    setEditTelefone(a.telefone || '')
    const rawDate = a.vencimento_licenca || a.data_vencimento || ''
    setEditVencimento(rawDate ? String(rawDate).slice(0, 10) : '')
    setEditNivel(a.nivel_acesso || 'Revendedor')
    setEditNovaSenha('')
  }

  async function handleSaveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editingAgente || savingEdit) return

    setSavingEdit(true)
    setError(null)

    try {
      const baseUpdate: Record<string, unknown> = {
        nome: editNome.trim(),
        email: editEmail.trim().toLowerCase(),
        telefone: editTelefone.trim() || null,
        nivel_acesso: editNivel,
      }

      const dataIso = editVencimento ? new Date(`${editVencimento}T12:00:00`).toISOString() : null

      let res = await supabase
        .from('agentes')
        .update({ ...baseUpdate, vencimento_licenca: dataIso })
        .eq('id', editingAgente.id)

      if (res.error && String(res.error.message || '').includes('vencimento_licenca')) {
        res = await supabase
          .from('agentes')
          .update({ ...baseUpdate, data_vencimento: dataIso })
          .eq('id', editingAgente.id)
      }

      if (res.error && String(res.error.message || '').includes('data_vencimento')) {
        res = await supabase.from('agentes').update(baseUpdate).eq('id', editingAgente.id)
      }

      if (res.error) throw res.error

      if (editNovaSenha.trim().length > 0) {
        const redirectUrl = `${window.location.origin}/redefinir-senha`
        await supabase.auth.resetPasswordForEmail(editEmail.trim().toLowerCase(), {
          redirectTo: redirectUrl,
        })
      }

      setAgentes((prev) =>
        prev.map((item) =>
          item.id === editingAgente.id
            ? {
              ...item,
              nome: editNome.trim(),
              email: editEmail.trim().toLowerCase(),
              telefone: editTelefone.trim() || null,
              nivel_acesso: editNivel,
              vencimento_licenca: dataIso,
              data_vencimento: dataIso,
            }
            : item
        )
      )

      setEditingAgente(null)
      toast.success(`Dados de ${editNome.trim()} atualizados com sucesso.`)
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      toast.error(`Erro ao salvar alterações: ${msg}`)
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleForcarReset(a: Agente) {
    setOpenDropdownId(null)
    if (
      !window.confirm(
        `Deseja enviar um link de redefinição de senha para ${a.nome} (${a.email})?`
      )
    ) {
      return
    }

    setResettingEmail(a.email)
    setError(null)

    try {
      const redirectUrl = `${window.location.origin}/redefinir-senha`
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(a.email.toLowerCase(), {
        redirectTo: redirectUrl,
      })

      if (resetErr) throw resetErr

      await supabase
        .from('agentes')
        .update({ precisa_trocar_senha: true })
        .ilike('email', a.email)

      toast.success(`E-mail de redefinição enviado para ${a.email}.`)
      await carregar()
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      setError(`Erro ao forçar reset: ${msg}`)
    } finally {
      setResettingEmail(null)
    }
  }

  async function handleExcluirAgente(a: Agente) {
    setOpenDropdownId(null)
    if (!window.confirm(`Tem certeza que deseja excluir o revendedor "${a.nome}"?`)) {
      return
    }

    setDeletingId(a.id)
    setError(null)

    try {
      const { error: delErr } = await supabase.from('agentes').delete().eq('id', a.id)
      if (delErr) throw delErr

      setAgentes((prev) => prev.filter((item) => String(item.id) !== String(a.id)))
      toast.success('Revendedor excluído com sucesso.')
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      setError(`Erro ao excluir revendedor: ${msg}`)
    } finally {
      setDeletingId(null)
    }
  }

  const renderStatusPrazoBadge = (a: Agente) => {
    if (a.nivel_acesso === 'Master') {
      return <StatusBadge variant="ativo" label="Ativo • Vitalício" />
    }

    const dataLicenca = a.vencimento_licenca || a.data_vencimento || null
    const dias = calcularDiasRestantes(dataLicenca)

    if (dias === null) {
      return <StatusBadge variant="ativo" label="Ativo • Sem prazo" />
    }

    if (dias > 7) {
      return <StatusBadge variant="ativo" label={`Ativo • Restam ${dias} dias`} />
    }

    if (dias >= 0 && dias <= 7) {
      return (
        <StatusBadge
          variant="vencendo"
          label={`A Vencer • Restam ${dias} ${dias === 1 ? 'dia' : 'dias'}`}
        />
      )
    }

    const atraso = Math.abs(dias)
    return (
      <StatusBadge
        variant="vencido"
        label={`Vencido • Há ${atraso} ${atraso === 1 ? 'dia' : 'dias'}`}
      />
    )
  }

  if (loadingAgente) {
    return (
      <div className="flex min-h-screen bg-[#030509] text-zinc-100">
        <Sidebar />
        <div className="flex-1 pl-0 md:pl-64 p-6 lg:p-10">
          <div className="w-full max-w-[1600px] mx-auto space-y-4 animate-pulse">
            <div className="h-10 w-64 rounded-xl bg-white/10" />
            <div className="h-96 w-full rounded-2xl bg-[#06080d]/60 border border-white/5" />
          </div>
        </div>
      </div>
    )
  }

  if (agente?.nivel !== 'Master') {
    return <Navigate to="/retencao" replace />
  }

  return (
    <div className="relative flex min-h-screen bg-[#030509] text-zinc-100">
      <div className="pointer-events-none fixed -top-40 right-0 h-96 w-96 rounded-full bg-radial from-cyan-500/10 to-transparent" />

      <Sidebar />

      <div className="relative flex-1 min-w-0 pl-0 md:pl-64 flex flex-col min-h-screen">
        {/* Header Superior Glassmorphic */}
        <header className="sticky top-0 z-30 border-b border-white/5 bg-[#06080d]/60 backdrop-blur-2xl">
          <div className="w-full max-w-[1600px] mx-auto flex flex-col sm:flex-row sm:h-16 items-start sm:items-center justify-between gap-4 px-6 lg:px-10 py-3 sm:py-0">
            <div className="flex items-center gap-3">
              <HamburgerButton />
              <Link
                to="/"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-zinc-300 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:text-zinc-100 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] shrink-0"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-base font-semibold tracking-tight text-zinc-100">
                    Gestão de Revendas
                  </h1>
                  <StatusBadge variant="vencendo" label="Painel Master" />
                </div>
                <p className="text-xs text-zinc-400 tabular-nums [font-variant-numeric:tabular-nums]">
                  {agentes.length} revenda(s) cadastrada(s) · {pedidosPendentes.length} solicitação(ões) pendente(s)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setOpenCreate(true)}
                className="flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/15 px-3.5 py-2 text-xs font-semibold text-cyan-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/50 hover:bg-cyan-500/25 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
              >
                <Plus className="h-4 w-4" />
                <span>Nova Revenda</span>
              </button>
              <div className="hidden sm:flex items-center pl-2">
                <SystemClock />
              </div>
            </div>
          </div>
        </header>

        <main className="w-full max-w-[1600px] mx-auto p-6 lg:p-10 space-y-6">
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 backdrop-blur-xl px-4 py-3 text-xs text-red-400">
              {error}
            </div>
          )}

          {/* Alerta Glassmorphic de solicitações pendentes */}
          {abaAtiva === 'revendedores' && pedidosPendentes.length > 0 && (
            <div className="relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-[#06080d]/60 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] p-4 text-xs">
              <div className="pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full bg-radial from-amber-500/15 to-transparent" />
              <div className="relative flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_16px_rgba(251,191,36,0.2)] shrink-0">
                  <Coins className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-semibold text-zinc-100 tabular-nums">
                    {pedidosPendentes.length} solicitação(ões) de créditos aguardando aprovação
                  </p>
                  <p className="text-zinc-400 mt-0.5">
                    Revendedores solicitaram liberação de pacotes na Loja de Créditos.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAbaAtiva('pedidos')}
                className="relative rounded-xl border border-amber-500/40 bg-amber-500/15 px-3.5 py-2 text-xs font-medium text-amber-200 transition-all duration-300 hover:-translate-y-1 hover:bg-amber-500/25 hover:shadow-[0_0_20px_rgba(251,191,36,0.25)] shrink-0"
              >
                Abrir Central de Aprovação
              </button>
            </div>
          )}

          {/* Navegação por Abas */}
          <div className="flex items-center gap-2 border-b border-white/5 pb-3">
            <button
              type="button"
              onClick={() => setAbaAtiva('revendedores')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all duration-300 ${abaAtiva === 'revendedores'
                  ? 'bg-cyan-500/10 text-cyan-200 border border-cyan-500/30 shadow-[0_0_20px_rgba(34,211,238,0.14)]'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] border border-transparent'
                }`}
            >
              <Store className="h-3.5 w-3.5 text-cyan-400" />
              <span>Gestão de Revendas</span>
              <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-mono text-zinc-200 tabular-nums [font-variant-numeric:tabular-nums]">
                {agentes.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva('pedidos')}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all duration-300 ${abaAtiva === 'pedidos'
                  ? 'bg-cyan-500/10 text-cyan-200 border border-cyan-500/30 shadow-[0_0_20px_rgba(34,211,238,0.14)]'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04] border border-transparent'
                }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>Central de Aprovação</span>
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-mono tabular-nums [font-variant-numeric:tabular-nums] ${pedidosPendentes.length > 0
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-white/[0.06] text-zinc-400'
                  }`}
              >
                {pedidosPendentes.length}
              </span>
            </button>
          </div>

          {abaAtiva === 'pedidos' ? (
            /* ABA 2: CENTRAL DE APROVAÇÃO EM TABELA NATIVA */
            <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.4)]">
              <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-radial from-cyan-500/10 to-transparent" />

              <div className="relative flex items-center justify-between px-6 py-4 border-b border-white/5">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
                    Solicitações Pendentes de Créditos
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Aprove em 1 clique para injetar os créditos imediatamente na conta do revendedor.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void carregarPedidos()}
                  disabled={loadingPedidos}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] disabled:opacity-50"
                >
                  <RotateCcw
                    className={`h-3.5 w-3.5 text-cyan-400 ${loadingPedidos ? 'animate-spin' : ''}`}
                  />
                  <span>Atualizar</span>
                </button>
              </div>

              {loadingPedidos ? (
                <div className="p-6 space-y-3 animate-pulse">
                  <div className="h-10 w-full rounded-xl bg-white/5" />
                  <div className="h-10 w-full rounded-xl bg-white/5" />
                </div>
              ) : pedidosPendentes.length === 0 ? (
                <div className="p-6">
                  <EmptyState
                    compact
                    icon={Inbox}
                    title="Nenhuma solicitação aguardando liberação"
                    description="Quando um revendedor solicitar um pacote pela Loja de Créditos, o pedido aparecerá instantaneamente aqui para aprovação em 1 clique."
                    className="bg-white/[0.01] border-white/5 shadow-none"
                  />
                </div>
              ) : (
                <div className="relative w-full overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/[0.02] border-b border-white/5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        <th className="p-4">Revendedor</th>
                        <th className="p-4">Pacote Solicitado</th>
                        <th className="p-4">Valor</th>
                        <th className="p-4">Data</th>
                        <th className="p-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidosPendentes.map((pedido) => (
                        <tr key={pedido.id} className="hover:bg-white/[0.03] transition-colors">
                          <td className="p-4 border-b border-white/5">
                            <div className="text-sm font-medium text-zinc-100">
                              {pedido.agente_nome || 'Revendedor'}
                            </div>
                            <div className="text-xs text-zinc-500">{pedido.agente_email}</div>
                          </td>
                          <td className="p-4 border-b border-white/5">
                            <StatusBadge
                              variant="teste"
                              label={`${pedido.pacote} (+${pedido.quantidade} créditos)`}
                            />
                          </td>
                          <td className="p-4 border-b border-white/5 font-mono text-sm font-semibold text-emerald-400 tabular-nums [font-variant-numeric:tabular-nums]">
                            {brl.format(pedido.valor)}
                          </td>
                          <td className="p-4 border-b border-white/5 text-xs text-zinc-400 tabular-nums [font-variant-numeric:tabular-nums]">
                            {formatarDataHora(pedido.created_at)}
                          </td>
                          <td className="p-4 border-b border-white/5 text-right">
                            <button
                              type="button"
                              disabled={aprovandoId === pedido.id}
                              onClick={() => void handleAprovarPix(pedido)}
                              className="inline-block rounded-xl border border-emerald-500/30 bg-emerald-500/20 px-3.5 py-1.5 text-xs font-semibold text-emerald-200 transition-all duration-300 hover:-translate-y-1 hover:bg-emerald-500/30 hover:text-white hover:shadow-[0_0_20px_rgba(52,211,153,0.25)] disabled:opacity-50"
                            >
                              {aprovandoId === pedido.id ? 'Aprovando...' : 'Aprovar Liberação'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            /* ABA 1: GESTÃO DE REVENDAS — TABELA HTML ESTRITA (<table>, <thead>, <tbody>, <tr>, <td>) */
            <div className="relative w-full rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] overflow-visible">
              <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-radial from-cyan-500/10 to-transparent" />

              <div className="relative w-full overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/[0.02] border-b border-white/5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      <th className="p-4">Revendedor</th>
                      <th className="p-4">Saldo</th>
                      <th className="p-4">Status &amp; Prazo</th>
                      <th className="p-4">Nível</th>
                      <th className="p-4 text-right">Ações</th>
                    </tr>
                  </thead>

                  <tbody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, idx) => (
                        <tr key={idx} className="animate-pulse">
                          <td className="p-4 border-b border-white/5">
                            <div className="h-4 w-40 rounded bg-white/10 mb-1.5" />
                            <div className="h-3 w-52 rounded bg-white/5" />
                          </td>
                          <td className="p-4 border-b border-white/5">
                            <div className="h-6 w-24 rounded-md bg-white/10" />
                          </td>
                          <td className="p-4 border-b border-white/5">
                            <div className="h-6 w-36 rounded-md bg-white/10" />
                          </td>
                          <td className="p-4 border-b border-white/5">
                            <div className="h-6 w-20 rounded-md bg-white/10" />
                          </td>
                          <td className="p-4 border-b border-white/5 text-right">
                            <div className="inline-block h-8 w-24 rounded-xl bg-white/10 mr-2" />
                            <div className="inline-block h-8 w-20 rounded-xl bg-white/10 mr-2" />
                            <div className="inline-block h-8 w-8 rounded-xl bg-white/10" />
                          </td>
                        </tr>
                      ))
                    ) : agentes.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 border-b border-white/5">
                          <EmptyState
                            icon={Store}
                            title="Nenhuma revenda cadastrada ainda"
                            description="Clique em 'Nova Revenda' para provisionar o acesso de um revendedor parceiro com isolamento Multi-Tenant e carteira própria de créditos."
                            action={
                              <button
                                type="button"
                                onClick={() => setOpenCreate(true)}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/15 px-4 py-2 text-xs font-semibold text-cyan-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/50 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                <span>Provisionar Primeira Revenda</span>
                              </button>
                            }
                            className="bg-white/[0.01] border-white/5 shadow-none"
                          />
                        </td>
                      </tr>
                    ) : (
                      agentes.map((a) => {
                        const isMaster = a.nivel_acesso === 'Master'
                        const saldo = Number(a.creditos ?? 0)
                        const isMenuOpen = openDropdownId === a.id

                        return (
                          <tr
                            key={a.id}
                            className="group hover:bg-white/[0.03] transition-colors"
                          >
                            {/* 1. Coluna: Revendedor */}
                            <td className="p-4 border-b border-white/5 align-middle">
                              <div className="inline-block align-middle mr-3 p-2 rounded-xl bg-white/[0.04] border border-white/10 text-zinc-300">
                                {isMaster ? (
                                  <Crown className="h-4 w-4 text-amber-400" />
                                ) : (
                                  <Store className="h-4 w-4 text-cyan-400" />
                                )}
                              </div>
                              <div className="inline-block align-middle">
                                <div className="text-sm font-medium text-zinc-100 tracking-tight">
                                  {a.nome}
                                  {a.precisa_trocar_senha && (
                                    <span className="ml-2 inline-block rounded-md bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                                      1º acesso pendente
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-zinc-400 mt-0.5">
                                  <span className="mr-3">
                                    <Mail className="h-3 w-3 inline-block mr-1 text-zinc-500 align-text-top" />
                                    {a.email}
                                  </span>
                                  {a.telefone && (
                                    <span className="font-mono tabular-nums [font-variant-numeric:tabular-nums]">
                                      <Phone className="h-3 w-3 inline-block mr-1 text-zinc-500 align-text-top" />
                                      {a.telefone}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* 2. Coluna: Saldo */}
                            <td className="p-4 border-b border-white/5 align-middle whitespace-nowrap">
                              <span className="inline-block rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-mono font-medium text-zinc-200 tabular-nums [font-variant-numeric:tabular-nums]">
                                <Coins className="h-3.5 w-3.5 inline-block mr-1.5 text-cyan-400 align-text-top" />
                                {isMaster
                                  ? 'Ilimitado'
                                  : `${saldo} ${saldo === 1 ? 'crédito' : 'créditos'}`}
                              </span>
                            </td>

                            {/* 3. Coluna: Status & Prazo */}
                            <td className="p-4 border-b border-white/5 align-middle whitespace-nowrap">
                              {renderStatusPrazoBadge(a)}
                            </td>

                            {/* 4. Coluna: Nível */}
                            <td className="p-4 border-b border-white/5 align-middle whitespace-nowrap">
                              <StatusBadge
                                variant={isMaster ? 'vencendo' : 'neutral'}
                                label={a.nivel_acesso}
                                showDot={false}
                              />
                            </td>

                            {/* 5. Coluna: Ações Consolidadas */}
                            <td className="p-4 border-b border-white/5 align-middle text-right whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => setCreditosModalAgente(a)}
                                className="inline-block mr-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:text-cyan-200 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                              >
                                Gerir Créditos
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenEdit(a)}
                                className="inline-block mr-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:text-cyan-200 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                              >
                                <Pencil className="h-3.5 w-3.5 inline-block mr-1 text-cyan-400 align-text-top" />
                                Editar
                              </button>

                              <div
                                className="relative inline-block text-left align-middle"
                                ref={isMenuOpen ? dropdownRef : undefined}
                              >
                                <button
                                  type="button"
                                  onClick={() => setOpenDropdownId(isMenuOpen ? null : a.id)}
                                  aria-label="Mais ações"
                                  className="rounded-xl border border-transparent p-1.5 text-zinc-400 transition-all duration-300 hover:border-cyan-500/30 hover:bg-white/[0.04] hover:text-zinc-100"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>

                                {isMenuOpen && (
                                  <div className="absolute right-0 mt-1.5 w-44 rounded-xl border border-white/10 bg-[#06080d]/95 backdrop-blur-2xl py-1 shadow-[0_8px_32px_0_rgba(0,0,0,0.55)] z-30 animate-in fade-in zoom-in-95">
                                    <button
                                      type="button"
                                      disabled={resettingEmail === a.email}
                                      onClick={() => void handleForcarReset(a)}
                                      className="block w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/5 hover:text-zinc-100 transition-colors disabled:opacity-50"
                                    >
                                      <KeyRound className="h-3.5 w-3.5 inline-block mr-2 text-cyan-400 align-text-top" />
                                      {resettingEmail === a.email ? 'Enviando...' : 'Forçar Reset'}
                                    </button>

                                    {!isMaster && (
                                      <>
                                        <div className="my-1 border-t border-white/5" />
                                        <button
                                          type="button"
                                          disabled={deletingId === a.id}
                                          onClick={() => void handleExcluirAgente(a)}
                                          className="block w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/15 hover:text-red-300 transition-colors disabled:opacity-50"
                                        >
                                          <Trash2 className="h-3.5 w-3.5 inline-block mr-2 text-red-400 align-text-top" />
                                          {deletingId === a.id ? 'Excluindo...' : 'Excluir'}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>

        {/* Modal Glassmorphic: Nova Revenda */}
        {openCreate && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-md animate-in fade-in"
            onMouseDown={(e) => e.target === e.currentTarget && setOpenCreate(false)}
          >
            <form
              onSubmit={handleSubmitCreate}
              className="relative overflow-hidden w-full max-w-md space-y-4 rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl p-6 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] animate-in zoom-in-95"
            >
              <div className="pointer-events-none absolute -top-14 -right-14 h-40 w-40 rounded-full bg-radial from-cyan-500/10 to-transparent" />

              <div className="relative flex items-center justify-between border-b border-white/5 pb-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-100">
                  <UserPlus className="h-4 w-4 text-cyan-400" /> Nova Revenda
                </h2>
                <button
                  type="button"
                  onClick={() => setOpenCreate(false)}
                  className="rounded-xl p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="relative">
                <label className="mb-1 block text-xs font-medium text-zinc-300">Nome completo</label>
                <input
                  className={inputClass}
                  placeholder="Ex: Carlos Oliveira"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                />
              </div>

              <div className="relative">
                <label className="mb-1 block text-xs font-medium text-zinc-300">E-mail de acesso</label>
                <input
                  className={inputClass}
                  type="email"
                  placeholder="revendedor@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="relative">
                <label className="mb-1 block text-xs font-medium text-zinc-300">Telefone / WhatsApp</label>
                <input
                  className={inputClass}
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                />
              </div>

              <div className="relative">
                <label className="mb-1 block text-xs font-medium text-zinc-300">
                  Senha Inicial / Provisória (Opcional)
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    className={`${inputClass} pl-9 pr-10`}
                    type={mostrarSenha ? 'text' : 'password'}
                    placeholder="Gerada automaticamente se vazio"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
                    tabIndex={-1}
                  >
                    {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="relative">
                <label className="mb-1 block text-xs font-medium text-zinc-300">Nível de Acesso</label>
                <select
                  className={`${inputClass} [color-scheme:dark]`}
                  value={nivel}
                  onChange={(e) => setNivel(e.target.value as NivelAcesso)}
                >
                  <option value="Revendedor">Revendedor (dados isolados)</option>
                  <option value="Master">Master (acesso total)</option>
                </select>
              </div>

              {formError && <p className="relative text-xs text-red-400">{formError}</p>}

              <div className="relative flex justify-end gap-2 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setOpenCreate(false)}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-zinc-300 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:text-zinc-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/15 px-4 py-2 text-xs font-semibold text-cyan-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/50 hover:bg-cyan-500/25 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Provisionar Revenda</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Modal Glassmorphic: Editar Revendedor */}
        {editingAgente && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-md animate-in fade-in"
            onMouseDown={(e) => e.target === e.currentTarget && setEditingAgente(null)}
          >
            <form
              onSubmit={handleSaveEdit}
              className="relative overflow-hidden w-full max-w-md space-y-4 rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl p-6 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] animate-in zoom-in-95"
            >
              <div className="pointer-events-none absolute -top-14 -right-14 h-40 w-40 rounded-full bg-radial from-cyan-500/10 to-transparent" />

              <div className="relative flex items-center justify-between border-b border-white/5 pb-4">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
                    Editar Revendedor
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Altere dados cadastrais, vencimento do acesso ou nível de permissão.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingAgente(null)}
                  className="rounded-xl p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="relative">
                <label className="mb-1 block text-xs font-medium text-zinc-300">Nome completo</label>
                <input
                  className={inputClass}
                  value={editNome}
                  onChange={(e) => setEditNome(e.target.value)}
                  required
                />
              </div>

              <div className="relative">
                <label className="mb-1 block text-xs font-medium text-zinc-300">E-mail</label>
                <input
                  className={inputClass}
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  required
                />
              </div>

              <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">
                    Telefone / WhatsApp
                  </label>
                  <input
                    className={inputClass}
                    type="tel"
                    placeholder="(11) 99999-9999"
                    value={editTelefone}
                    onChange={(e) => setEditTelefone(e.target.value)}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-300">
                    Vencimento do Acesso
                  </label>
                  <input
                    className={`${inputClass} [color-scheme:dark]`}
                    type="date"
                    value={editVencimento}
                    onChange={(e) => setEditVencimento(e.target.value)}
                  />
                </div>
              </div>

              <div className="relative">
                <label className="mb-1 block text-xs font-medium text-zinc-300">Nível</label>
                <select
                  className={`${inputClass} [color-scheme:dark]`}
                  value={editNivel}
                  onChange={(e) => setEditNivel(e.target.value as NivelAcesso)}
                >
                  <option value="Revendedor">Revendedor</option>
                  <option value="Master">Master</option>
                </select>
              </div>

              <div className="relative">
                <label className="mb-1 block text-xs font-medium text-zinc-300">
                  Redefinir Senha{' '}
                  <span className="text-zinc-500">(preencha para disparar redefinição)</span>
                </label>
                <input
                  className={inputClass}
                  type="password"
                  placeholder="Deixe em branco para manter a senha atual"
                  value={editNovaSenha}
                  onChange={(e) => setEditNovaSenha(e.target.value)}
                />
              </div>

              <div className="relative flex justify-end gap-2 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setEditingAgente(null)}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-medium text-zinc-300 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:text-zinc-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/15 px-4 py-2 text-xs font-semibold text-cyan-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/50 hover:bg-cyan-500/25 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] disabled:opacity-50"
                >
                  {savingEdit && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Salvar Alterações</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Modal: Gerir Créditos */}
        <GerirCreditosModal
          isOpen={Boolean(creditosModalAgente)}
          agente={creditosModalAgente}
          onClose={() => setCreditosModalAgente(null)}
          onSuccess={(novoSaldo, mensagem) => {
            if (creditosModalAgente) {
              setAgentes((prev) =>
                prev.map((item) =>
                  item.id === creditosModalAgente.id ? { ...item, creditos: novoSaldo } : item
                )
              )
              toast.success(mensagem)
            }
          }}
        />
      </div>
    </div>
  )
}
