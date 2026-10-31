import { useState, useEffect, useMemo, useRef } from 'react'
import { Bell, AlertTriangle, CreditCard, ShieldCheck, Check, Trash2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCrmStore } from '../stores/useCrmStore'
import { isMasterUser } from '../lib/multiTenant'

export interface Notificacao {
  id: string
  titulo: string
  descricao: string
  tipo: 'alerta' | 'credito' | 'sistema' | 'sucesso'
  data: string
  lida: boolean
}

const DAY_MS = 86_400_000

export function NotificationBell() {
  const { usuario } = useAuth()
  const clientes = useCrmStore((s) => s.clientes)
  const creditosStore = useCrmStore((s) => s.creditos)

  const [isOpen, setIsOpen] = useState(false)
  const [lidasIds, setLidasIds] = useState<Record<string, boolean>>({})
  const [ocultasIds, setOcultasIds] = useState<Record<string, boolean>>({})
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  const isMaster = isMasterUser(usuario)
  const saldoCreditos =
    typeof creditosStore === 'number' ? creditosStore : Number(usuario?.creditos ?? 0)

  // Reseta estado visual de notificações ao alternar utilizador autenticado
  useEffect(() => {
    setLidasIds({})
    setOcultasIds({})
  }, [usuario?.id])

  // Notificações dinâmicas estritamente isoladas pela carteira do operador/parceiro logado
  const notificacoesBase = useMemo<Notificacao[]>(() => {
    const items: Notificacao[] = []
    const agora = Date.now()

    if (!isMaster) {
      if (saldoCreditos <= 0) {
        items.push({
          id: 'creditos-esgotados',
          titulo: 'Saldo de Créditos Esgotado',
          descricao:
            'Adquira uma recarga na Loja de Créditos para liberar novas ativações e renovações.',
          tipo: 'alerta',
          data: 'Agora',
          lida: false,
        })
      } else if (saldoCreditos <= 5) {
        items.push({
          id: `creditos-baixo-${saldoCreditos}`,
          titulo: 'Saldo de Créditos em Atenção',
          descricao: `Restam ${saldoCreditos} ${saldoCreditos === 1 ? 'crédito disponível' : 'créditos disponíveis'} na sua carteira comercial.`,
          tipo: 'alerta',
          data: 'Hoje',
          lida: false,
        })
      }
    }

    const assinantes = (Array.isArray(clientes) ? clientes : []).filter(
      (c) => String(c.estagio_funil ?? '').trim().toLowerCase() !== 'lead'
    )

    let vencidosCount = 0
    const proximosVencimentos: { id: string; nome: string; dataFmt: string }[] = []

    for (const c of assinantes) {
      const statusRaw = String(c.Status ?? c.status ?? '').trim().toLowerCase()
      const vencStr = c.data_vencimento ? String(c.data_vencimento) : ''
      const vencTs = vencStr ? new Date(vencStr).getTime() : NaN
      const diffDias = Number.isFinite(vencTs) ? Math.ceil((vencTs - agora) / DAY_MS) : null

      if (statusRaw === 'inativo' || statusRaw === 'vencido' || (diffDias !== null && diffDias < 0)) {
        vencidosCount += 1
        continue
      }

      if (
        statusRaw === 'alerta_vencimento' ||
        statusRaw === 'alerta' ||
        (diffDias !== null && diffDias >= 0 && diffDias <= 3)
      ) {
        if (proximosVencimentos.length < 3) {
          const dataFmt = Number.isFinite(vencTs)
            ? new Date(vencTs).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
            : 'em breve'
          proximosVencimentos.push({
            id: String(c.id),
            nome: String(c.nome_completo ?? c.nome ?? 'Assinante'),
            dataFmt,
          })
        }
      }
    }

    for (const v of proximosVencimentos) {
      items.push({
        id: `vencendo-${v.id}`,
        titulo: 'Renovação Próxima',
        descricao: `A assinatura de ${v.nome} vence em ${v.dataFmt}. Envie um lembrete comercial.`,
        tipo: 'credito',
        data: 'Carteira',
        lida: false,
      })
    }

    if (vencidosCount > 0) {
      items.push({
        id: `vencidos-resumo-${vencidosCount}`,
        titulo: 'Oportunidades de Reativação',
        descricao: `${vencidosCount} ${vencidosCount === 1 ? 'assinatura expirada aguarda' : 'assinaturas expiradas aguardam'} contato para renovação.`,
        tipo: 'alerta',
        data: 'Retenção',
        lida: false,
      })
    }

    items.push({
      id: isMaster ? 'status-master' : 'status-parceiro',
      titulo: isMaster ? 'Governança Master Ativa' : 'Carteira Comercial Ativa',
      descricao: isMaster
        ? 'Painel corporativo sincronizado com indicadores executivos consolidados.'
        : 'Ambiente exclusivo do parceiro pronto para gestão de clientes e funil de vendas.',
      tipo: 'sistema',
      data: 'Ativo',
      lida: true,
    })

    return items
  }, [clientes, isMaster, saldoCreditos])

  const notificacoes = useMemo(
    () =>
      notificacoesBase
        .filter((n) => !ocultasIds[n.id])
        .map((n) => ({
          ...n,
          lida: lidasIds[n.id] !== undefined ? lidasIds[n.id] : n.lida,
        })),
    [notificacoesBase, ocultasIds, lidasIds]
  )

  const naoLidasCount = notificacoes.filter((n) => !n.lida).length

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const marcarTodasComoLidas = () => {
    setLidasIds((prev) => {
      const next = { ...prev }
      for (const n of notificacoes) next[n.id] = true
      return next
    })
  }

  const limparNotificacoes = () => {
    setOcultasIds((prev) => {
      const next = { ...prev }
      for (const n of notificacoes) next[n.id] = true
      return next
    })
  }

  const alternarLida = (id: string, estadoAtual: boolean) => {
    setLidasIds((prev) => ({ ...prev, [id]: !estadoAtual }))
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="btn-enterprise-icon relative"
        title="Central de Notificações"
        aria-label="Central de Notificações"
      >
        <Bell className="h-4 w-4" />
        {naoLidasCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] px-1 items-center justify-center rounded-full bg-cyan-400 text-[10px] font-mono font-bold text-slate-950 shadow-[0_0_10px_rgba(34,211,238,0.8)] tabular-nums">
            {naoLidasCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="glass-modal absolute right-0 mt-2.5 w-80 sm:w-96 rounded-2xl z-50 animate-in fade-in zoom-in-95 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.08] bg-white/[0.02]">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                Notificações
              </span>
              {naoLidasCount > 0 && (
                <span className="rounded-full bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-mono font-semibold text-cyan-300 tabular-nums">
                  {naoLidasCount} nova(s)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              {naoLidasCount > 0 && (
                <button
                  type="button"
                  onClick={marcarTodasComoLidas}
                  className="text-[11px] font-medium text-cyan-300 hover:text-cyan-200 transition-colors"
                >
                  Marcar lidas
                </button>
              )}
              {notificacoes.length > 0 && (
                <button
                  type="button"
                  onClick={limparNotificacoes}
                  className="text-zinc-400 hover:text-zinc-200 transition-colors"
                  title="Limpar notificações"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="kanban-scroll max-h-80 overflow-y-auto p-2.5 space-y-2">
            {notificacoes.length === 0 ? (
              <div className="text-center py-10 text-zinc-400 text-xs">
                <Bell className="h-6 w-6 mx-auto mb-2 opacity-40 text-cyan-400" />
                <span>Tudo em dia na sua operação comercial.</span>
              </div>
            ) : (
              notificacoes.map((item) => (
                <div
                  key={item.id}
                  onClick={() => alternarLida(item.id, item.lida)}
                  className={`group relative rounded-xl border p-3 transition-all duration-200 cursor-pointer ${
                    item.lida
                      ? 'border-white/[0.06] bg-white/[0.02] opacity-75 hover:opacity-100 hover:border-white/15'
                      : 'border-cyan-500/30 bg-cyan-500/[0.05] hover:bg-cyan-500/[0.09]'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 shrink-0">
                      {item.tipo === 'alerta' && (
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                      )}
                      {item.tipo === 'credito' && (
                        <CreditCard className="h-4 w-4 text-cyan-400" />
                      )}
                      {item.tipo === 'sistema' && (
                        <ShieldCheck className="h-4 w-4 text-indigo-400" />
                      )}
                      {item.tipo === 'sucesso' && (
                        <Check className="h-4 w-4 text-emerald-400" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-xs font-semibold text-zinc-100 truncate">
                          {item.titulo}
                        </h4>
                        <span className="text-[10px] font-mono text-zinc-400 shrink-0">
                          {item.data}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-300/90 mt-1 leading-relaxed">
                        {item.descricao}
                      </p>
                    </div>

                    {!item.lida && (
                      <span className="h-2 w-2 rounded-full bg-cyan-400 shrink-0 self-center shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-3 py-2 border-t border-white/[0.07] bg-white/[0.015] text-center">
            <span className="text-[10px] text-zinc-400">
              {isMaster
                ? 'Central Executiva · OnePlay Enterprise'
                : 'Central do Parceiro · OnePlay Enterprise'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
