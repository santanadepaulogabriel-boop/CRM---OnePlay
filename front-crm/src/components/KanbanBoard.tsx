import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  Search,
  FolderOpen,
  Phone,
  Package,
  ArrowRightLeft,
  ChevronDown,
  MessageSquare,
  Plus,
  RotateCw,
  Loader2,
  X,
} from 'lucide-react'
import { WhatsAppMessengerModal } from './WhatsAppMessengerModal'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useFeatureGating } from '../hooks/useFeatureGating'
import {
  fetchClientesMultiTenant,
  insertClienteMultiTenant,
  updateClienteMultiTenant,
} from '../lib/multiTenant'

type StageId = 'lead' | 'test' | 'feedback' | 'negotiation'

interface KanbanClient {
  id: string
  name: string
  whatsapp: string
  plan_name: string
  status: string
  kanban_stage: StageId
  due_date: string
  sourceTable: 'clientes' | 'clients'
}

const COLUNAS_FUNIL: {
  id: StageId
  label: string
  subtitle: string
  dotClass: string
  badgeClass: string
}[] = [
  {
    id: 'lead',
    label: 'Leads',
    subtitle: 'Novos interessados',
    dotClass: 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.85)]',
    badgeClass: 'border-sky-500/30 text-sky-300 bg-sky-500/10',
  },
  {
    id: 'test',
    label: 'Testes',
    subtitle: 'Demonstração ativa',
    dotClass: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.85)]',
    badgeClass: 'border-amber-500/30 text-amber-300 bg-amber-500/10',
  },
  {
    id: 'feedback',
    label: 'Feedback',
    subtitle: 'Avaliação pós-teste',
    dotClass: 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.85)]',
    badgeClass: 'border-violet-500/30 text-violet-300 bg-violet-500/10',
  },
  {
    id: 'negotiation',
    label: 'Fechamento',
    subtitle: 'Em negociação final',
    dotClass: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)]',
    badgeClass: 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10',
  },
]

function normalizeStage(raw: unknown, statusRaw?: unknown): StageId | 'cliente' {
  const s = String(raw ?? '').trim().toLowerCase()
  if (s === 'cliente' || s === 'assinante') return 'cliente'
  if (s === 'test' || s === 'teste') return 'test'
  if (s === 'feedback' || s === 'followup' || s === 'follow_up') return 'feedback'
  if (s === 'negotiation' || s === 'negociacao' || s === 'negociação') return 'negotiation'
  if (s === 'lead') return 'lead'

  const st = String(statusRaw ?? '').trim().toLowerCase()
  if (st === 'teste' || st === 'test') return 'test'
  if (st === 'ativo' || st === 'inativo' || st === 'vencido') return 'cliente'
  return 'lead'
}

function stageToDbValue(stage: StageId): string {
  switch (stage) {
    case 'lead':
      return 'lead'
    case 'test':
      return 'teste'
    case 'feedback':
      return 'followup'
    case 'negotiation':
      return 'negociacao'
  }
}

export const KanbanBoard: React.FC = () => {
  const { usuario } = useAuth()
  const toast = useToast()
  const { protegerAcao } = useFeatureGating()

  const [clients, setClients] = useState<KanbanClient[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverStage, setDragOverStage] = useState<StageId | null>(null)

  const [isNovoLeadOpen, setIsNovoLeadOpen] = useState<boolean>(false)
  const [savingLead, setSavingLead] = useState<boolean>(false)
  const [novoLead, setNovoLead] = useState<{
    nome: string
    whatsapp: string
    plano: string
    estagio: StageId
  }>({
    nome: '',
    whatsapp: '',
    plano: 'Plano Mensal',
    estagio: 'lead',
  })

  // Estados para controlar o Modal do WhatsApp no Kanban
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState<boolean>(false)
  const [selectedClientForWhatsApp, setSelectedClientForWhatsApp] = useState<{
    nome: string
    whatsapp: string
    vencimento: string
    plano?: string
  } | null>(null)

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true)
      const { data: cliRows, error: cliErr } = await fetchClientesMultiTenant(
        usuario?.role,
        usuario?.id,
        usuario?.authId
      )

      if (!cliErr && Array.isArray(cliRows)) {
        const mapped: KanbanClient[] = []
        for (const r of cliRows as Record<string, unknown>[]) {
          const st = normalizeStage(r.estagio_funil ?? r.kanban_stage, r.status ?? r.Status)
          if (st === 'cliente') continue
          mapped.push({
            id: String(r.id ?? ''),
            name: String(r.nome_completo ?? r.nome ?? r.name ?? 'Lead Sem Nome'),
            whatsapp: String(r.whatsapp ?? ''),
            plan_name: String(r.plano ?? r.plan_name ?? 'Plano Mensal'),
            status: String(r.status ?? r.Status ?? (st === 'test' ? 'Teste' : 'Lead')),
            kanban_stage: st,
            due_date: String(r.data_vencimento ?? r.due_date ?? ''),
            sourceTable: 'clientes',
          })
        }
        setClients(mapped)
        return
      }

      // Fallback caso exista tabela `clients` legada
      const { data, error } = await supabase.from('clients').select('*')
      if (error) throw error
      if (Array.isArray(data)) {
        setClients(
          data.map((r: Record<string, unknown>) => {
            const st = normalizeStage(r.kanban_stage ?? r.estagio_funil, r.status)
            return {
              id: String(r.id ?? ''),
              name: String(r.name ?? r.nome_completo ?? r.nome ?? 'Lead Sem Nome'),
              whatsapp: String(r.whatsapp ?? ''),
              plan_name: String(r.plan_name ?? r.plano ?? 'Plano Mensal'),
              status: String(r.status ?? 'Lead'),
              kanban_stage: st === 'cliente' ? 'negotiation' : st,
              due_date: String(r.due_date ?? r.data_vencimento ?? ''),
              sourceTable: 'clients',
            }
          })
        )
      }
    } catch (error) {
      console.error('Erro ao carregar clientes do funil:', error)
    } finally {
      setLoading(false)
    }
  }, [usuario?.authId, usuario?.id, usuario?.role])

  useEffect(() => {
    void fetchClients()
  }, [fetchClients])

  // Atualização otimista do estágio no Kanban
  const handleStageChange = async (clientId: string, newStage: StageId) => {
    const target = clients.find((c) => c.id === clientId)
    if (!target || target.kanban_stage === newStage) return
    const previousClients = [...clients]

    setClients((prev) =>
      prev.map((client) =>
        client.id === clientId ? { ...client, kanban_stage: newStage } : client
      )
    )

    try {
      if (target.sourceTable === 'clientes') {
        const { error } = await updateClienteMultiTenant(
          clientId,
          {
            estagio_funil: stageToDbValue(newStage),
            status: newStage === 'test' ? 'teste' : 'lead',
          },
          usuario?.role,
          usuario?.id
        )
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('clients')
          .update({ kanban_stage: newStage })
          .eq('id', clientId)
        if (error) throw error
      }
    } catch (error) {
      setClients(previousClients)
      console.error('Erro ao atualizar estágio do cliente:', error)
      toast.error('Não foi possível mover o lead de etapa.')
    }
  }

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novoLead.nome.trim()) return

    setSavingLead(true)
    try {
      const { error } = await insertClienteMultiTenant(
        {
          nome_completo: novoLead.nome.trim(),
          nome: novoLead.nome.trim(),
          whatsapp: novoLead.whatsapp.trim() || null,
          plano: novoLead.plano.trim() || 'Plano Mensal',
          status: novoLead.estagio === 'test' ? 'teste' : 'lead',
          estagio_funil: stageToDbValue(novoLead.estagio),
        },
        usuario?.role,
        usuario?.id,
        usuario?.authId
      )

      if (error) throw error

      toast.success('Novo lead registado no funil comercial!')
      setNovoLead({ nome: '', whatsapp: '', plano: 'Plano Mensal', estagio: 'lead' })
      setIsNovoLeadOpen(false)
      await fetchClients()
    } catch (err) {
      console.error('Erro ao registar lead:', err)
      toast.error('Falha ao criar lead no funil.')
    } finally {
      setSavingLead(false)
    }
  }

  const handleOpenWhatsApp = (client: KanbanClient) => {
    setSelectedClientForWhatsApp({
      nome: client.name,
      whatsapp: client.whatsapp,
      vencimento: client.due_date
        ? new Date(client.due_date).toLocaleDateString('pt-BR')
        : 'A definir',
      plano: client.plan_name || 'Plano Mensal',
    })
    setIsWhatsAppOpen(true)
  }

  const queryLower = searchTerm.trim().toLowerCase()
  const filteredClients = clients.filter(
    (client) =>
      (client.name || '').toLowerCase().includes(queryLower) ||
      (client.whatsapp || '').toLowerCase().includes(queryLower) ||
      (client.plan_name || '').toLowerCase().includes(queryLower)
  )

  return (
    <div className="relative flex flex-1 min-w-0 flex-col text-zinc-100">
      {/* Barra de Ferramentas Interna do Pipeline */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3 min-w-0">
          <div className="relative w-full sm:max-w-xs lg:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Buscar por nome, plano ou WhatsApp..."
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

          <span className="hidden xl:inline-flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-400 font-mono tabular-nums whitespace-nowrap">
            <strong className="text-zinc-100">{filteredClients.length}</strong> oportunidade(s)
          </span>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => {
              if (!protegerAcao()) return
              setIsNovoLeadOpen(true)
            }}
            className="btn-enterprise-primary h-9"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo Lead</span>
          </button>

          <button
            type="button"
            onClick={() => void fetchClients()}
            title="Atualizar pipeline"
            className="btn-enterprise-icon"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Palco Horizontal do Kanban — Larguras Fixas Consistentes + Rolagem Lateral Independente e Fluida */}
      {loading ? (
        <div className="kanban-scroll w-full min-w-0 flex-1 overflow-x-auto pb-2">
          <div className="flex flex-nowrap items-stretch gap-4 lg:gap-5 min-w-full">
            {COLUNAS_FUNIL.map((col) => (
              <div
                key={col.id}
                className="glass-card w-[308px] min-w-[308px] flex-1 shrink-0 rounded-2xl p-4 min-h-[480px] space-y-3.5"
              >
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.07]">
                  <div className="h-5 w-28 rounded-lg bg-white/10 animate-pulse" />
                  <div className="h-5 w-8 rounded-full bg-white/10 animate-pulse" />
                </div>
                {[1, 2].map((item) => (
                  <div
                    key={item}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3.5 space-y-3"
                  >
                    <div className="h-4 w-36 rounded bg-white/10 animate-pulse" />
                    <div className="h-3 w-28 rounded bg-white/5 animate-pulse" />
                    <div className="h-8 w-full rounded-lg bg-white/5 animate-pulse" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="kanban-scroll w-full min-w-0 flex-1 overflow-x-auto overflow-y-hidden pb-2 scroll-smooth">
          <div className="flex flex-nowrap items-stretch gap-4 lg:gap-5 min-w-full">
            {COLUNAS_FUNIL.map((col) => {
              const columnClients = filteredClients.filter((c) => c.kanban_stage === col.id)
              const isDropTarget = dragOverStage === col.id

              return (
                <section
                  key={col.id}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (dragOverStage !== col.id) setDragOverStage(col.id)
                  }}
                  onDragLeave={() => setDragOverStage(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOverStage(null)
                    if (draggedId) {
                      void handleStageChange(draggedId, col.id)
                      setDraggedId(null)
                    }
                  }}
                  className={`glass-card relative flex flex-col w-[308px] min-w-[308px] flex-1 shrink-0 rounded-2xl p-4 min-h-[480px] max-h-[calc(100vh-16rem)] transition-all duration-200 ${
                    isDropTarget
                      ? '!border-cyan-400/50 ring-2 ring-cyan-500/20 shadow-[0_0_24px_rgba(34,211,238,0.16)]'
                      : ''
                  }`}
                >
                  {/* Cabeçalho Fixo da Coluna */}
                  <div className="flex items-center justify-between gap-2 mb-3.5 pb-3 border-b border-white/[0.07] shrink-0">
                    <div className="min-w-0 flex items-center gap-2.5">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${col.dotClass}`} />
                      <div className="min-w-0">
                        <h3 className="text-xs font-semibold tracking-tight text-zinc-100 whitespace-nowrap">
                          {col.label}
                        </h3>
                        <p className="text-[11px] text-zinc-400 truncate">{col.subtitle}</p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex h-6 min-w-[1.75rem] items-center justify-center rounded-full border px-2 text-xs font-mono font-semibold tabular-nums shrink-0 ${col.badgeClass}`}
                    >
                      {columnClients.length}
                    </span>
                  </div>

                  {/* Lista Adaptativa de Oportunidades com Rolagem Vertical Independente */}
                  <div className="kanban-scroll flex-1 flex flex-col gap-3 overflow-y-auto pr-1">
                    {columnClients.map((client) => (
                      <article
                        key={client.id}
                        draggable
                        onDragStart={() => setDraggedId(client.id)}
                        onDragEnd={() => {
                          setDraggedId(null)
                          setDragOverStage(null)
                        }}
                        className="group relative flex flex-col rounded-xl border border-white/[0.08] bg-white/[0.03] p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-500/35 hover:bg-white/[0.045] hover:shadow-[0_12px_28px_-10px_rgba(0,0,0,0.75),0_0_18px_rgba(34,211,238,0.12)] cursor-grab active:cursor-grabbing shrink-0"
                      >
                        {/* Linha 1: Nome + Status */}
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <h4
                            title={client.name}
                            className="min-w-0 flex-1 font-semibold text-zinc-100 text-sm tracking-tight group-hover:text-cyan-300 transition-colors truncate"
                          >
                            {client.name}
                          </h4>
                          <span className="inline-flex items-center rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300 capitalize whitespace-nowrap shrink-0">
                            {client.status}
                          </span>
                        </div>

                        {/* Linha 2: Contato + Plano */}
                        <div className="space-y-1.5 mb-3">
                          <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-300 tabular-nums min-w-0">
                            <Phone className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span className="truncate">
                              {client.whatsapp || 'Sem telefone registado'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-white/[0.025] px-2.5 py-1.5 text-[11px] text-zinc-300 min-w-0">
                            <Package className="w-3 h-3 text-cyan-400 shrink-0" />
                            <span className="truncate">
                              {client.plan_name || 'Plano Mensal'}
                            </span>
                          </div>
                        </div>

                        {/* Linha 3: Ações Rápidas Perfeitamente Alinhadas (Sem Quebra, Sem Overflow, Sem Corte) */}
                        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 pt-2.5 border-t border-white/[0.07]">
                          <button
                            type="button"
                            onClick={() => handleOpenWhatsApp(client)}
                            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-2.5 text-xs font-semibold text-emerald-300 whitespace-nowrap select-none transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-400/55 hover:bg-emerald-500/25 hover:text-emerald-100 hover:shadow-[0_0_14px_rgba(52,211,153,0.2)] active:translate-y-0 shrink-0"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>WhatsApp</span>
                          </button>

                          <div className="relative h-8 min-w-0 w-full">
                            <ArrowRightLeft className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-cyan-400" />
                            <select
                              aria-label="Alterar etapa do funil"
                              value={client.kanban_stage}
                              onChange={(e) =>
                                void handleStageChange(client.id, e.target.value as StageId)
                              }
                              className="glass-input h-8 w-full appearance-none rounded-lg pl-7 pr-6 text-xs font-medium text-zinc-200 whitespace-nowrap cursor-pointer outline-none [color-scheme:dark]"
                            >
                              <option value="lead" className="bg-[#090d16]">Leads</option>
                              <option value="test" className="bg-[#090d16]">Testes</option>
                              <option value="feedback" className="bg-[#090d16]">Feedback</option>
                              <option value="negotiation" className="bg-[#090d16]">Fechamento</option>
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                          </div>
                        </div>
                      </article>
                    ))}

                    {columnClients.length === 0 && (
                      <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.015] p-6 text-center text-xs text-zinc-400 min-h-[180px]">
                        <FolderOpen className="w-5 h-5 mb-2 opacity-60 text-cyan-400" />
                        <span className="font-medium text-zinc-300">Coluna vazia</span>
                        <span className="mt-0.5 text-[11px] text-zinc-500">
                          Arraste ou mova leads para {col.label}
                        </span>
                      </div>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal Novo Lead */}
      {isNovoLeadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4">
          <div className="glass-modal w-full max-w-md rounded-2xl p-6 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <h3 className="text-sm font-semibold text-zinc-100">Nova Oportunidade Comercial</h3>
              <button
                type="button"
                onClick={() => setIsNovoLeadOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateLead} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={novoLead.nome}
                  onChange={(e) => setNovoLead((p) => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex: Marcos Almeida"
                  className="glass-input w-full rounded-xl px-3.5 py-2 text-xs text-zinc-100 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">WhatsApp</label>
                <input
                  type="text"
                  value={novoLead.whatsapp}
                  onChange={(e) => setNovoLead((p) => ({ ...p, whatsapp: e.target.value }))}
                  placeholder="(11) 99999-9999"
                  className="glass-input w-full rounded-xl px-3.5 py-2 text-xs text-zinc-100 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Plano</label>
                  <select
                    value={novoLead.plano}
                    onChange={(e) => setNovoLead((p) => ({ ...p, plano: e.target.value }))}
                    className="glass-input w-full rounded-xl px-3 py-2 text-xs text-zinc-100 outline-none [color-scheme:dark]"
                  >
                    <option value="Plano Mensal" className="bg-[#090d16]">Plano Mensal</option>
                    <option value="Plano Trimestral" className="bg-[#090d16]">Plano Trimestral</option>
                    <option value="Plano Semestral" className="bg-[#090d16]">Plano Semestral</option>
                    <option value="Plano Anual" className="bg-[#090d16]">Plano Anual</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Etapa</label>
                  <select
                    value={novoLead.estagio}
                    onChange={(e) =>
                      setNovoLead((p) => ({ ...p, estagio: e.target.value as StageId }))
                    }
                    className="glass-input w-full rounded-xl px-3 py-2 text-xs text-zinc-100 outline-none [color-scheme:dark]"
                  >
                    <option value="lead" className="bg-[#090d16]">Leads</option>
                    <option value="test" className="bg-[#090d16]">Testes</option>
                    <option value="feedback" className="bg-[#090d16]">Feedback</option>
                    <option value="negotiation" className="bg-[#090d16]">Fechamento</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsNovoLeadOpen(false)}
                  className="btn-enterprise-secondary"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingLead}
                  className="btn-enterprise-primary"
                >
                  {savingLead && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Cadastrar Lead</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de WhatsApp Integrado */}
      <WhatsAppMessengerModal
        isOpen={isWhatsAppOpen}
        onClose={() => setIsWhatsAppOpen(false)}
        cliente={selectedClientForWhatsApp}
      />
    </div>
  )
}

export default KanbanBoard
