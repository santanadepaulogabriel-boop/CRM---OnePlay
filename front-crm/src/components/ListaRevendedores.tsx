import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  Users,
  CreditCard,
  Search,
  UserPlus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Crown,
  Loader2,
  RotateCw,
  X,
} from 'lucide-react'
import { GerirCreditosModal } from './GerirCreditosModal'
import { criarAgenteComCredenciais, listarAgentes, type NivelAcesso } from '../lib/agente'
import {
  listarPedidosPendentes,
  aprovarPedidoPix,
  type CompraCredito,
} from '../lib/historicoCompras'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

interface RevendedorItem {
  id: string
  name: string
  email: string
  telefone?: string | null
  credits: number
  nivelAcesso: NivelAcesso
  vencimento?: string | null
  sourceTable: 'agentes' | 'resellers'
}

function calcularDiasAcesso(dataIso?: string | null): number | null {
  if (!dataIso) return null
  const venc = new Date(dataIso)
  if (isNaN(venc.getTime())) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  venc.setHours(0, 0, 0, 0)
  return Math.ceil((venc.getTime() - hoje.getTime()) / 86_400_000)
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const ListaRevendedores: React.FC = () => {
  const { usuario } = useAuth()
  const toast = useToast()

  const [revendedores, setRevendedores] = useState<RevendedorItem[]>([])
  const [pedidosPendentes, setPedidosPendentes] = useState<CompraCredito[]>([])
  const [aprovandoId, setAprovandoId] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [searchTerm, setSearchTerm] = useState<string>('')

  // Estados para controlar o Modal de Créditos
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false)
  const [revendedorSelecionado, setRevendedorSelecionado] = useState<RevendedorItem | null>(null)

  // Modal Nova Revenda
  const [isNovoOpen, setIsNovoOpen] = useState<boolean>(false)
  const [savingNovo, setSavingNovo] = useState<boolean>(false)
  const [novoForm, setNovoForm] = useState<{
    nome: string
    email: string
    telefone: string
    nivel_acesso: NivelAcesso
    senha: string
  }>({
    nome: '',
    email: '',
    telefone: '',
    nivel_acesso: 'Revendedor',
    senha: '',
  })

  const fetchRevendedores = useCallback(async () => {
    try {
      setLoading(true)

      const [{ agentes, error: agErr }, { pedidos }] = await Promise.all([
        listarAgentes(),
        listarPedidosPendentes(),
      ])

      setPedidosPendentes(pedidos)

      if (!agErr && agentes.length > 0) {
        setRevendedores(
          agentes.map((ag) => ({
            id: ag.id,
            name: ag.nome || 'Sem nome',
            email: ag.email || '',
            telefone: ag.telefone ?? null,
            credits: Number(ag.creditos ?? 0),
            nivelAcesso: ag.nivel_acesso || 'Revendedor',
            vencimento: ag.data_vencimento ?? ag.vencimento_licenca ?? null,
            sourceTable: 'agentes',
          }))
        )
        return
      }

      // Fallback para tabela `resellers` caso utilizada em ambiente alternativo
      const { data, error } = await supabase.from('resellers').select('*')
      if (!error && Array.isArray(data)) {
        setRevendedores(
          data.map((r: Record<string, unknown>) => ({
            id: String(r.id ?? ''),
            name: String(r.name ?? r.nome ?? 'Revendedor'),
            email: String(r.email ?? ''),
            telefone: r.telefone ? String(r.telefone) : null,
            credits: Number(r.credits ?? r.creditos ?? 0),
            nivelAcesso: 'Revendedor',
            vencimento: r.due_date ? String(r.due_date) : null,
            sourceTable: 'resellers',
          }))
        )
      } else {
        setRevendedores([])
      }
    } catch (error) {
      console.error('Erro ao carregar revendedores:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchRevendedores()
  }, [fetchRevendedores])

  const handleOpenModal = (revendedor: RevendedorItem) => {
    setRevendedorSelecionado(revendedor)
    setIsModalOpen(true)
  }

  const handleSalvarCreditos = async (
    quantidade: number,
    operacao: 'adicionar' | 'remover'
  ) => {
    if (!revendedorSelecionado) return

    const novoSaldo =
      operacao === 'adicionar'
        ? revendedorSelecionado.credits + quantidade
        : Math.max(0, revendedorSelecionado.credits - quantidade)

    if (revendedorSelecionado.sourceTable === 'agentes') {
      const { error } = await supabase
        .from('agentes')
        .update({ creditos: novoSaldo })
        .eq('id', revendedorSelecionado.id)

      if (error) throw error
    } else {
      const { error } = await supabase
        .from('resellers')
        .update({ credits: novoSaldo })
        .eq('id', revendedorSelecionado.id)

      if (error) throw error
    }

    setRevendedores((prev) =>
      prev.map((rev) =>
        rev.id === revendedorSelecionado.id ? { ...rev, credits: novoSaldo } : rev
      )
    )
    toast.success(
      `Saldo de ${revendedorSelecionado.name} atualizado para ${novoSaldo} créditos.`
    )
  }

  const handleAprovarPedido = async (pedido: CompraCredito) => {
    setAprovandoId(pedido.id)
    try {
      const res = await aprovarPedidoPix(pedido, usuario?.id)
      if (!res.sucesso) {
        toast.error(res.error || 'Falha ao aprovar solicitação.')
        return
      }
      toast.success(
        `Solicitação de ${pedido.quantidade} crédito(s) aprovada para ${pedido.agente_nome || 'Revendedor'}!`
      )
      await fetchRevendedores()
    } finally {
      setAprovandoId(null)
    }
  }

  const handleCriarRevenda = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novoForm.nome.trim() || !novoForm.email.trim()) return
    setSavingNovo(true)
    try {
      const { senhaProvisoria, error } = await criarAgenteComCredenciais({
        nome: novoForm.nome,
        email: novoForm.email,
        telefone: novoForm.telefone || undefined,
        nivel_acesso: novoForm.nivel_acesso,
        senha: novoForm.senha || undefined,
      })

      if (error) {
        toast.error(error)
        return
      }

      toast.success(
        `Revenda provisionada! Senha provisória: ${senhaProvisoria ?? 'Definida manualmente'}`
      )
      setNovoForm({
        nome: '',
        email: '',
        telefone: '',
        nivel_acesso: 'Revendedor',
        senha: '',
      })
      setIsNovoOpen(false)
      await fetchRevendedores()
    } finally {
      setSavingNovo(false)
    }
  }

  const queryLower = searchTerm.trim().toLowerCase()
  const filteredRevendedores = revendedores.filter(
    (rev) =>
      (rev.name || '').toLowerCase().includes(queryLower) ||
      (rev.email || '').toLowerCase().includes(queryLower)
  )

  const renderStatusBadge = (rev: RevendedorItem) => {
    if (rev.nivelAcesso === 'Master') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-semibold">
          <Crown className="w-3 h-3 text-amber-400" />
          <span>Vitalício • Master</span>
        </span>
      )
    }

    const dias = calcularDiasAcesso(rev.vencimento)
    if (dias === null) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold">
          <CheckCircle2 className="w-3 h-3" />
          <span>Ativo</span>
        </span>
      )
    }

    if (dias > 7) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold tabular-nums">
          <CheckCircle2 className="w-3 h-3" />
          <span>Ativo • Restam {dias} dias</span>
        </span>
      )
    }

    if (dias >= 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-semibold tabular-nums">
          <Clock className="w-3 h-3" />
          <span>A Vencer • Restam {dias} dias</span>
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 text-xs font-semibold tabular-nums">
        <AlertTriangle className="w-3 h-3" />
        <span>Vencido • Há {Math.abs(dias)} dias</span>
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-12 text-cyan-300 font-medium">
        <div className="glass-card rounded-2xl px-6 py-4 flex items-center gap-2.5 text-xs">
          <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
          <span>Carregando rede de revendas...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex flex-1 min-w-0 flex-col w-full text-zinc-100">
      {/* Barra de Ferramentas Interna de Gestão de Revendas */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs lg:max-w-sm">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-500">
            <Search className="w-3.5 h-3.5" />
          </span>
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="glass-input h-9 w-full rounded-xl pl-9 pr-8 text-xs text-zinc-100 placeholder-zinc-500 outline-none"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              aria-label="Limpar busca"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setIsNovoOpen(true)}
            className="btn-enterprise-primary h-9"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Nova Revenda</span>
          </button>

          <button
            type="button"
            onClick={() => void fetchRevendedores()}
            title="Atualizar revendas"
            className="btn-enterprise-icon"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 w-full space-y-6">
        {/* Solicitações Pendentes da Loja de Créditos */}
        {pedidosPendentes.length > 0 && (
          <div className="glass-card rounded-2xl !border-amber-500/30 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-300">
                {pedidosPendentes.length} solicitação(ões) de recarga aguardando liberação
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pedidosPendentes.map((ped) => (
                <div
                  key={ped.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-100 truncate">
                      {ped.agente_nome || ped.agente_email || 'Revendedor'}
                    </p>
                    <p className="text-zinc-400 tabular-nums">
                      {ped.pacote} · <strong>{ped.quantidade} créditos</strong> ({brl.format(ped.valor)})
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={aprovandoId === ped.id}
                    onClick={() => void handleAprovarPedido(ped)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 shrink-0 disabled:opacity-50"
                  >
                    {aprovandoId === ped.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Liberar Créditos</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabela Estrita de Revendedores */}
        <div className="glass-card rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02] text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                  <th className="py-4 px-6">Revendedor</th>
                  <th className="py-4 px-6">E-mail</th>
                  <th className="py-4 px-6 text-center">Saldo de Créditos</th>
                  <th className="py-4 px-6 text-center">Status &amp; Prazo</th>
                  <th className="py-4 px-6 text-center">Nível</th>
                  <th className="py-4 px-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-sm">
                {filteredRevendedores.map((rev) => (
                  <tr key={rev.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-4 px-6 font-semibold text-zinc-100 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
                          <Users className="w-4 h-4" />
                        </div>
                        <span>{rev.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-zinc-300 font-mono text-xs whitespace-nowrap">{rev.email}</td>
                    <td className="py-4 px-6 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-bold text-xs tabular-nums">
                        <CreditCard className="w-3.5 h-3.5" />
                        {rev.nivelAcesso === 'Master' ? 'Ilimitado' : `${rev.credits} créditos`}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center whitespace-nowrap">{renderStatusBadge(rev)}</td>
                    <td className="py-4 px-6 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${
                          rev.nivelAcesso === 'Master'
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                            : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
                        }`}
                      >
                        {rev.nivelAcesso}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleOpenModal(rev)}
                        className="btn-enterprise-primary !py-1.5 !px-3.5"
                      >
                        Gerir Créditos
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredRevendedores.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-zinc-400 text-xs">
                      Nenhuma revenda parceira encontrada para os filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal: Provisionar Nova Revenda */}
      {isNovoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="glass-modal w-full max-w-md rounded-2xl p-6 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <h3 className="text-sm font-semibold text-zinc-100">Credenciar Nova Revenda</h3>
              <button
                type="button"
                onClick={() => setIsNovoOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-white/5 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCriarRevenda} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={novoForm.nome}
                  onChange={(e) => setNovoForm((p) => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Rodrigo Parceiro"
                  className="glass-input w-full rounded-xl px-3.5 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-500/50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">E-mail *</label>
                <input
                  type="email"
                  required
                  value={novoForm.email}
                  onChange={(e) => setNovoForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="parceiro@oneplay.com"
                  className="glass-input w-full rounded-xl px-3.5 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">WhatsApp</label>
                  <input
                    type="text"
                    value={novoForm.telefone}
                    onChange={(e) => setNovoForm((p) => ({ ...p, telefone: e.target.value }))}
                    placeholder="(11) 99999-9999"
                    className="glass-input w-full rounded-xl px-3.5 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-500/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Nível</label>
                  <select
                    value={novoForm.nivel_acesso}
                    onChange={(e) =>
                      setNovoForm((p) => ({
                        ...p,
                        nivel_acesso: e.target.value as NivelAcesso,
                      }))
                    }
                    className="glass-input w-full rounded-xl px-3 py-2 text-xs text-zinc-100 outline-none [color-scheme:dark]"
                  >
                    <option value="Revendedor" className="bg-[#090d16]">Revendedor</option>
                    <option value="Master" className="bg-[#090d16]">Master</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Senha Inicial (opcional)
                </label>
                <input
                  type="text"
                  value={novoForm.senha}
                  onChange={(e) => setNovoForm((p) => ({ ...p, senha: e.target.value }))}
                  placeholder="Deixe vazio para gerar credencial provisória"
                  className="glass-input w-full rounded-xl px-3.5 py-2 text-xs text-zinc-100 outline-none focus:border-cyan-500/50"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsNovoOpen(false)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs text-zinc-300 hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingNovo}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/20 px-4 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/30"
                >
                  {savingNovo && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Credenciar Revenda</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Gestão de Créditos Integrado */}
      {revendedorSelecionado && (
        <GerirCreditosModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          revendedorNome={revendedorSelecionado.name}
          revendedorEmail={revendedorSelecionado.email}
          creditosAtuais={revendedorSelecionado.credits}
          onSalvar={handleSalvarCreditos}
        />
      )}
    </div>
  )
}

export default ListaRevendedores
