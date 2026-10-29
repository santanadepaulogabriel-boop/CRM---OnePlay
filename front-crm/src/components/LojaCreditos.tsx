import { useState, useEffect, useCallback } from 'react'
import { Award, CheckCircle2, Coins, Crown, Loader2, MessageCircle, Sparkles, TrendingDown, X } from 'lucide-react'
import { useCrmStore } from '../stores/useCrmStore'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { supabase } from '../lib/supabase'
import { formatarTelefone } from '../lib/whatsapp'
import { registrarPedidoCreditos } from '../lib/historicoCompras'

export interface PacoteCredito {
  id: 'mensal' | 'trimestral' | 'semestral' | 'anual'
  titulo: string
  quantidade: 1 | 3 | 6 | 12
  descricaoPeriodo: string
  valorTotal: number
  tagIncentivo?: string
  destaqueMaster?: boolean
  seloMaisVendido?: string
  seloCustoBeneficio?: string
}

export interface LojaCreditosProps {
  isOpen?: boolean
  onClose?: () => void
}

const PACOTES_RENOVACAO: ReadonlyArray<PacoteCredito> = [
  {
    id: 'mensal',
    titulo: 'Pacote Mensal',
    quantidade: 1,
    descricaoPeriodo: 'Referente a 1 mês ativo',
    valorTotal: 20,
  },
  {
    id: 'trimestral',
    titulo: 'Pacote Trimestral',
    quantidade: 3,
    descricaoPeriodo: 'Referente a 3 meses ativos',
    valorTotal: 50,
    tagIncentivo: '17% de Economia',
  },
  {
    id: 'semestral',
    titulo: 'Pacote Semestral',
    quantidade: 6,
    descricaoPeriodo: 'Referente a 6 meses ativos',
    valorTotal: 85,
    tagIncentivo: 'Incentivo • 29% OFF',
  },
  {
    id: 'anual',
    titulo: 'Pacote Anual / Master',
    quantidade: 12,
    descricaoPeriodo: 'Referente a 12 meses ativos',
    valorTotal: 130,
    destaqueMaster: true,
    seloMaisVendido: 'Mais Vendido',
    seloCustoBeneficio: 'Melhor Custo-Benefício',
  },
]

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const VALOR_BASE_MENSAL = PACOTES_RENOVACAO[0].valorTotal

export function LojaCreditos({ isOpen: isOpenProp, onClose: onCloseProp }: LojaCreditosProps = {}) {
  const storeIsOpen = useCrmStore((state) => state.lojaCreditosOpen)
  const storeFechar = useCrmStore((state) => state.fecharLojaCreditos)
  const creditosStore = useCrmStore((state) => state.creditos)
  const { usuario } = useAuth()
  const toast = useToast()

  const isOpen = isOpenProp !== undefined ? isOpenProp : storeIsOpen
  const fechar = onCloseProp !== undefined ? onCloseProp : storeFechar

  const [loadingPkgId, setLoadingPkgId] = useState<PacoteCredito['id'] | null>(null)
  const [telefoneMaster, setTelefoneMaster] = useState<string>('5511999999999')

  const saldoAtual =
    typeof creditosStore === 'number' ? creditosStore : Number(usuario?.creditos ?? 0)

  // Sincroniza dinamicamente o WhatsApp oficial do Administrador Master via RPC segura ou fallback
  useEffect(() => {
    if (!isOpen) return
    let isMounted = true

    async function buscarContatoMaster() {
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('obter_contato_master')
        if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0 && rpcData[0]?.telefone) {
          if (isMounted) {
            setTelefoneMaster(formatarTelefone(String(rpcData[0].telefone)))
          }
          return
        }

        const { data, error } = await supabase
          .from('agentes')
          .select('telefone, nivel_acesso')
          .ilike('nivel_acesso', 'Master')
          .not('telefone', 'is', null)
          .limit(1)

        if (!error && data && data.length > 0 && data[0].telefone) {
          if (isMounted) {
            setTelefoneMaster(formatarTelefone(data[0].telefone))
          }
        }
      } catch (err) {
        console.warn('Não foi possível sincronizar o telefone do Master:', err)
      }
    }

    void buscarContatoMaster()
    return () => {
      isMounted = false
    }
  }, [isOpen])

  const handleClose = useCallback(() => {
    if (loadingPkgId) return
    fechar()
  }, [fechar, loadingPkgId])

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, handleClose])

  /**
   * Fluxo Híbrido de Solicitação (WhatsApp + Registro Pendente no Supabase):
   * 1. Formata mensagem profissional com nome do revendedor logado, pacote, créditos e valor total.
   * 2. Abre imediatamente o WhatsApp do Administrador Master para confirmação do pagamento via Pix.
   * 3. Registra o pedido 'pendente' em `historico_compras` preservando o isolamento multi-tenant.
   */
  const handleSolicitarLiberacao = async (pacote: PacoteCredito) => {
    if (loadingPkgId) return

    const storeUser = useCrmStore.getState().user
    const userId = usuario?.id || storeUser?.id || ''
    const authId = usuario?.authId || storeUser?.authId || userId
    const nomeRevendedor =
      usuario?.nome?.trim() || storeUser?.nome?.trim() || usuario?.email || 'Revendedor OnePlay'
    const emailRevendedor = usuario?.email || storeUser?.email || ''

    const textoCreditos =
      pacote.quantidade === 1 ? '1 Crédito' : `${pacote.quantidade} Créditos`
    const valorTotalFormatado = brl.format(pacote.valorTotal)
    const custoMensalFormatado = brl.format(pacote.valorTotal / pacote.quantidade)

    const mensagemWhatsApp = [
      `Olá, Administrador Master!`,
      ``,
      `Solicito a liberação de recarga na *Loja de Créditos OnePlay CRM*:`,
      `• *Revendedor:* ${nomeRevendedor}`,
      `• *Pacote Escolhido:* ${pacote.titulo}`,
      `• *Quantidade:* ${textoCreditos} (${pacote.descricaoPeriodo})`,
      `• *Valor Total:* ${valorTotalFormatado} (${custoMensalFormatado} / mês)`,
      ``,
      `Aguardo a confirmação da chave Pix para pagamento e liberação dos créditos no painel.`,
    ].join('\n')

    const linkWhatsApp = `https://wa.me/${telefoneMaster}?text=${encodeURIComponent(mensagemWhatsApp)}`

    // Disparo síncrono no clique para evitar bloqueio de pop-up pelo navegador
    window.open(linkWhatsApp, '_blank', 'noopener,noreferrer')

    setLoadingPkgId(pacote.id)

    try {
      await registrarPedidoCreditos({
        reseller_id: userId,
        tenant_id: authId || userId,
        agente_id: userId,
        agente_nome: nomeRevendedor,
        agente_email: emailRevendedor,
        pacote: pacote.titulo,
        quantidade: pacote.quantidade,
        valor: pacote.valorTotal,
      })

      void useCrmStore.getState().carregarCreditos()
      fechar()
      toast.success(
        `Solicitação do ${pacote.titulo} enviada! Confirme o pagamento via Pix no WhatsApp do Master.`
      )
    } catch (err) {
      console.warn('Erro ao persistir solicitação de créditos:', err)
      fechar()
      toast.success(
        `Solicitação do ${pacote.titulo} encaminhada para o WhatsApp do Administrador Master.`
      )
    } finally {
      setLoadingPkgId(null)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 overflow-y-auto"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="loja-creditos-title"
        className="relative my-auto w-full max-w-2xl rounded-2xl border border-white/10 bg-[#06080d]/90 backdrop-blur-2xl text-zinc-100 shadow-2xl shadow-black/80 animate-in zoom-in-95 duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient Glows sutis de profundidade */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-60 w-60 rounded-full bg-radial from-cyan-500/15 to-transparent" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-radial from-emerald-500/10 to-transparent" />

        {/* Cabeçalho Didático */}
        <div className="relative flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/25 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.2)] shrink-0">
              <Coins className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id="loja-creditos-title"
                  className="text-base font-semibold tracking-tight text-zinc-100"
                >
                  Loja de Créditos
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                  <Sparkles className="h-2.5 w-2.5 text-cyan-400" />1 Crédito = 1 Mês de Assinatura
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 truncate">
                Escolha o período de renovação ideal · Saldo disponível:{' '}
                <span className="font-mono font-semibold text-zinc-100 tabular-nums [font-variant-numeric:tabular-nums]">
                  {saldoAtual} {saldoAtual === 1 ? 'crédito' : 'créditos'}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl p-2 text-zinc-400 border border-white/10 bg-white/[0.02] transition-all duration-300 hover:bg-white/[0.06] hover:border-cyan-500/30 hover:text-zinc-100 shrink-0"
            aria-label="Fechar Loja de Créditos"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Grid de Pacotes Baseados em Períodos de Renovação (1, 3, 6 e 12 Créditos/Meses) */}
        <div className="relative p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {PACOTES_RENOVACAO.map((pacote) => {
              const isSubmitting = loadingPkgId === pacote.id
              const custoEquivalenteMensal = pacote.valorTotal / pacote.quantidade
              const economiaReais =
                pacote.quantidade > 1
                  ? VALOR_BASE_MENSAL * pacote.quantidade - pacote.valorTotal
                  : 0
              const isPlanoAnual = Boolean(pacote.destaqueMaster)
              const isPlanoSemestral = pacote.id === 'semestral'

              return (
                <div
                  key={pacote.id}
                  className={`group relative flex flex-col justify-between rounded-2xl bg-[#06080d]/90 backdrop-blur-2xl p-4 transition-all duration-300 hover:-translate-y-1 overflow-hidden ${
                    isPlanoAnual
                      ? 'border border-cyan-500/50 shadow-[0_0_30px_rgba(6,182,212,0.15)] hover:border-cyan-400/80 hover:shadow-[0_0_36px_rgba(6,182,212,0.25)]'
                      : 'border border-white/10 shadow-2xl shadow-black/80 hover:border-cyan-500/30'
                  }`}
                >
                  {/* Glow interno dedicado no Plano de 12 Meses */}
                  {isPlanoAnual && (
                    <div className="pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full bg-radial from-cyan-500/20 to-transparent" />
                  )}

                  <div className="relative space-y-3">
                    {/* Linha de Título + Tags de Destaque / Incentivo */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3
                          className={`text-sm font-semibold tracking-tight ${
                            isPlanoAnual ? 'text-cyan-100' : 'text-zinc-100'
                          }`}
                        >
                          {pacote.titulo}
                        </h3>
                        <p className="text-[11px] text-zinc-400 mt-0.5">{pacote.descricaoPeriodo}</p>
                      </div>

                      {isPlanoAnual && pacote.seloMaisVendido ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/40 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-200 shadow-[0_0_14px_rgba(6,182,212,0.25)] shrink-0">
                          <Crown className="h-3 w-3 text-cyan-300" />
                          {pacote.seloMaisVendido}
                        </span>
                      ) : pacote.tagIncentivo ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums shrink-0 ${
                            isPlanoSemestral
                              ? 'border border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                              : 'border border-white/10 bg-white/[0.04] text-zinc-300'
                          }`}
                        >
                          <TrendingDown
                            className={`h-3 w-3 ${
                              isPlanoSemestral ? 'text-emerald-400' : 'text-cyan-400'
                            }`}
                          />
                          {pacote.tagIncentivo}
                        </span>
                      ) : null}
                    </div>

                    {/* Quantidade de Créditos + Selo de Melhor Custo-Benefício */}
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className={`text-2xl font-bold font-mono tracking-tight tabular-nums [font-variant-numeric:tabular-nums] ${
                            isPlanoAnual ? 'text-cyan-300' : 'text-zinc-100'
                          }`}
                        >
                          {pacote.quantidade}
                        </span>
                        <span className="text-xs font-medium text-zinc-300">
                          {pacote.quantidade === 1 ? 'Crédito' : 'Créditos'}
                        </span>
                      </div>

                      {isPlanoAnual && pacote.seloCustoBeneficio && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300 shrink-0">
                          <Award className="h-2.5 w-2.5 text-amber-400" />
                          {pacote.seloCustoBeneficio}
                        </span>
                      )}
                    </div>

                    {/* Didática Financeira: Valor Total (R$) + Custo Equivalente por Mês */}
                    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] text-zinc-400">Valor Total</span>
                        <span className="text-sm font-bold font-mono text-zinc-100 tabular-nums [font-variant-numeric:tabular-nums]">
                          {brl.format(pacote.valorTotal)}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between gap-2 pt-1 border-t border-white/5">
                        <span className="text-[11px] text-zinc-400">Equivalente</span>
                        <span
                          className={`text-xs font-mono font-semibold tabular-nums [font-variant-numeric:tabular-nums] ${
                            isPlanoAnual
                              ? 'text-cyan-300'
                              : isPlanoSemestral
                                ? 'text-emerald-300'
                                : 'text-zinc-200'
                          }`}
                        >
                          {brl.format(custoEquivalenteMensal)} / mês
                        </span>
                      </div>

                      {economiaReais > 0 && (
                        <div className="flex items-center justify-end pt-0.5">
                          <span className="text-[10px] font-medium text-emerald-400/90 tabular-nums">
                            Economize {brl.format(economiaReais)} vs. avulso
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ação Principal do Fluxo Híbrido (WhatsApp + Pix Master) */}
                  <button
                    type="button"
                    disabled={Boolean(loadingPkgId)}
                    onClick={() => void handleSolicitarLiberacao(pacote)}
                    className={`relative mt-3.5 w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${
                      isPlanoAnual
                        ? 'border border-cyan-400/50 bg-cyan-500/20 text-cyan-100 shadow-[0_0_20px_rgba(6,182,212,0.2)] hover:bg-cyan-500/30 hover:border-cyan-300 hover:text-white'
                        : 'border border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-cyan-500/15 hover:border-cyan-500/40 hover:text-cyan-100'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
                        <span>Encaminhando ao Master...</span>
                      </>
                    ) : (
                      <>
                        <MessageCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span>Solicitar Liberação</span>
                      </>
                    )}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Rodapé informativo do Fluxo Híbrido Pix */}
          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2 text-[11px] text-zinc-400">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <span>
                Liberação rápida: confirme o comprovante via <strong className="text-zinc-200">Pix</strong> diretamente com o Administrador Master.
              </span>
            </div>
            <span className="font-mono text-[10px] text-zinc-500">Sem expiração de saldo</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LojaCreditos

