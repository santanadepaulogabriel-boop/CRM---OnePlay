import React, { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import {
  buildBillingMessage,
  checkInstanceStatus,
  normalizeEvolutionPhone,
  sendMessage,
  type EvolutionInstanceStatus,
} from '../services/evolutionApi'

export interface ClienteWhatsAppModalData {
  id?: string | number
  nome: string
  whatsapp: string
  vencimento: string
  plano?: string
  valorMensal?: number | string | null
  status?: string | null
}

interface ClienteWhatsAppProps {
  isOpen: boolean
  onClose: () => void
  cliente: ClienteWhatsAppModalData | null
  initialTipo?: 'cobranca' | 'vencido' | 'boas-vindas'
  onSentSuccess?: (clienteId?: string | number) => void
}

export const WhatsAppMessengerModal: React.FC<ClienteWhatsAppProps> = ({
  isOpen,
  onClose,
  cliente,
  initialTipo,
  onSentSuccess,
}) => {
  const { usuario } = useAuth()
  const toast = useToast()

  const [tipoMensagem, setTipoMensagem] = useState<'cobranca' | 'vencido' | 'boas-vindas'>(
    'cobranca'
  )
  const [mensagemTexto, setMensagemTexto] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [enviadoSucesso, setEnviadoSucesso] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [instanceStatus, setInstanceStatus] = useState<EvolutionInstanceStatus | null>(null)
  const [feedbackEnvio, setFeedbackEnvio] = useState<{
    tipo: 'sucesso' | 'erro'
    titulo: string
    detalhe?: string
  } | null>(null)

  const verificarInstancia = useCallback(async () => {
    setCheckingStatus(true)
    try {
      const status = await checkInstanceStatus({ userId: usuario?.id })
      setInstanceStatus(status)
    } finally {
      setCheckingStatus(false)
    }
  }, [usuario?.id])

  useEffect(() => {
    if (!isOpen || !cliente) return

    const statusLower = String(cliente.status || '').trim().toLowerCase()
    const resolvedTipo: 'cobranca' | 'vencido' | 'boas-vindas' =
      initialTipo ??
      (statusLower === 'vencido' || statusLower === 'inativo' ? 'vencido' : 'cobranca')

    setTipoMensagem(resolvedTipo)
    setMensagemTexto(
      buildBillingMessage(
        {
          nome: cliente.nome,
          vencimento: cliente.vencimento,
          plano: cliente.plano,
          valorMensal: cliente.valorMensal,
          status: cliente.status,
          tipo: resolvedTipo,
        },
        usuario?.id
      )
    )
    setFeedbackEnvio(null)
    setEnviando(false)
    setEnviadoSucesso(false)
    setCopiado(false)
    void verificarInstancia()
  }, [isOpen, cliente, initialTipo, usuario?.id, verificarInstancia])

  if (!isOpen || !cliente) return null

  const numeroNormalizado = normalizeEvolutionPhone(cliente.whatsapp)
  const urlWhatsAppManual = numeroNormalizado
    ? `https://wa.me/${numeroNormalizado}?text=${encodeURIComponent(mensagemTexto)}`
    : ''

  const handleSelecionarModelo = (novoTipo: 'cobranca' | 'vencido' | 'boas-vindas') => {
    setTipoMensagem(novoTipo)
    setFeedbackEnvio(null)
    setEnviadoSucesso(false)
    setMensagemTexto(
      buildBillingMessage(
        {
          nome: cliente.nome,
          vencimento: cliente.vencimento,
          plano: cliente.plano,
          valorMensal: cliente.valorMensal,
          status: cliente.status,
          tipo: novoTipo,
        },
        usuario?.id
      )
    )
  }

  const handleCopiarTexto = () => {
    void navigator.clipboard.writeText(mensagemTexto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const handleDispararEvolution = async () => {
    if (enviando) return
    setEnviando(true)
    setFeedbackEnvio(null)
    setEnviadoSucesso(false)

    try {
      const result = await sendMessage(cliente.whatsapp, mensagemTexto, {
        userId: usuario?.id,
      })

      if (result.success) {
        setEnviadoSucesso(true)
        setFeedbackEnvio({
          tipo: 'sucesso',
          titulo: 'Disparo concluído via Evolution API',
          detalhe: `Mensagem entregue para +${result.phone}${
            result.messageId ? ` • ID ${result.messageId.slice(-8)}` : ''
          }.`,
        })
        toast.success(
          `Mensagem enviada com sucesso para ${cliente.nome}!`,
          'Automação WhatsApp'
        )
        onSentSuccess?.(cliente.id)
      } else {
        setFeedbackEnvio({
          tipo: 'erro',
          titulo: result.statusMessage,
          detalhe: result.error,
        })
        toast.error(result.error || result.statusMessage, 'Falha no Envio')
      }
    } catch {
      setFeedbackEnvio({
        tipo: 'erro',
        titulo: 'Erro inesperado ao comunicar com a Evolution API.',
        detalhe: 'Verifique as credenciais da instância ou utilize o envio via WhatsApp Web.',
      })
      toast.error('Erro inesperado ao comunicar com a Evolution API.', 'Falha no Envio')
    } finally {
      setEnviando(false)
    }
  }

  const handleAbrirWhatsAppWeb = () => {
    if (!urlWhatsAppManual) {
      toast.warning(`O cliente ${cliente.nome} não possui número de WhatsApp válido.`)
      return
    }
    window.open(urlWhatsAppManual, '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in">
      <div className="glass-modal relative w-full max-w-lg rounded-2xl p-6 text-zinc-100 animate-in zoom-in-95">
        {/* Cabeçalho com Status em Tempo Real da Evolution API */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 shrink-0 shadow-[0_0_16px_rgba(52,211,153,0.12)]">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-100">
                  Automação Comercial WhatsApp
                </h3>
                <button
                  type="button"
                  onClick={() => void verificarInstancia()}
                  disabled={checkingStatus}
                  title={instanceStatus?.message || 'Verificar status da instância Evolution API'}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                    checkingStatus
                      ? 'border-white/10 bg-white/[0.04] text-zinc-300'
                      : instanceStatus?.connected
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : instanceStatus?.state === 'unconfigured'
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                          : 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                  }`}
                >
                  {checkingStatus ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin text-cyan-400" />
                  ) : instanceStatus?.connected ? (
                    <Wifi className="w-2.5 h-2.5 text-emerald-400" />
                  ) : (
                    <WifiOff className="w-2.5 h-2.5" />
                  )}
                  <span>
                    {checkingStatus
                      ? 'Verificando API'
                      : instanceStatus?.connected
                        ? 'Evolution Online'
                        : instanceStatus?.state === 'unconfigured'
                          ? 'API Pendente'
                          : 'Instância Offline'}
                  </span>
                  {!checkingStatus && <RefreshCw className="w-2.5 h-2.5 opacity-70" />}
                </button>
              </div>
              <p className="mt-0.5 text-xs text-zinc-400 truncate">
                Assinante: <span className="text-cyan-300 font-medium">{cliente.nome}</span>
                {cliente.whatsapp && (
                  <span className="text-zinc-500 font-mono"> • {cliente.whatsapp}</span>
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white transition-colors shrink-0"
            aria-label="Fechar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Seleção de Modelo Comercial */}
        <div className="mt-5">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
            Modelo de Renovação / Cobrança
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleSelecionarModelo('cobranca')}
              className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all ${
                tipoMensagem === 'cobranca'
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.16)]'
                  : 'bg-white/[0.03] border-white/10 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Cobrança
            </button>
            <button
              type="button"
              onClick={() => handleSelecionarModelo('vencido')}
              className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all ${
                tipoMensagem === 'vencido'
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-200 shadow-[0_0_16px_rgba(251,191,36,0.16)]'
                  : 'bg-white/[0.03] border-white/10 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Reativação
            </button>
            <button
              type="button"
              onClick={() => handleSelecionarModelo('boas-vindas')}
              className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all ${
                tipoMensagem === 'boas-vindas'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200 shadow-[0_0_16px_rgba(52,211,153,0.16)]'
                  : 'bg-white/[0.03] border-white/10 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Boas-vindas
            </button>
          </div>
        </div>

        {/* Editor da Mensagem Pré-Formatada */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Mensagem Pré-Formatada
            </span>
            <button
              type="button"
              onClick={handleCopiarTexto}
              className="flex items-center gap-1 text-xs text-cyan-300 hover:text-cyan-200 transition-colors"
            >
              {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiado ? 'Copiado!' : 'Copiar Texto'}</span>
            </button>
          </div>
          <textarea
            rows={4}
            value={mensagemTexto}
            onChange={(e) => {
              setMensagemTexto(e.target.value)
              if (enviadoSucesso) setEnviadoSucesso(false)
            }}
            className="glass-input w-full resize-none rounded-xl p-3.5 text-xs text-zinc-100 leading-relaxed outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20"
            placeholder="Digite a mensagem para envio via Evolution API..."
          />
        </div>

        {/* Feedback Visual de Sucesso ou Erro para o Operador */}
        {feedbackEnvio && (
          <div
            className={`mt-4 flex items-start gap-2.5 rounded-xl border p-3 text-xs animate-in fade-in ${
              feedbackEnvio.tipo === 'sucesso'
                ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-500/35 bg-rose-500/10 text-rose-200'
            }`}
          >
            {feedbackEnvio.tipo === 'sucesso' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="font-semibold">{feedbackEnvio.titulo}</p>
              {feedbackEnvio.detalhe && (
                <p className="text-[11px] opacity-90 leading-relaxed">{feedbackEnvio.detalhe}</p>
              )}
            </div>
          </div>
        )}

        {/* Rodapé de Ações */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2.5 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={handleAbrirWhatsAppWeb}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20 text-zinc-300 text-xs font-medium transition-colors"
            title="Abrir conversa manualmente no WhatsApp Web / App"
          >
            <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
            <span>WhatsApp Web</span>
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-zinc-300 text-xs font-medium hover:bg-white/[0.06] transition-colors"
            >
              Fechar
            </button>
            <button
              type="button"
              disabled={enviando || !mensagemTexto.trim()}
              onClick={() => void handleDispararEvolution()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-100 text-xs font-semibold transition-all shadow-[0_0_20px_rgba(52,211,153,0.18)] disabled:opacity-50"
            >
              {enviando ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-300" />
                  <span>Enviando...</span>
                </>
              ) : enviadoSucesso ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Reenviar via API</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 text-emerald-300" />
                  <span>Disparar no WhatsApp</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
