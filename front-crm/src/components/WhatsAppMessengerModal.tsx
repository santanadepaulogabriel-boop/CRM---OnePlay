import React, { useState } from 'react'
import { MessageSquare, Send, Copy, Check, X } from 'lucide-react'

interface ClienteWhatsAppProps {
  isOpen: boolean
  onClose: () => void
  cliente: {
    nome: string
    whatsapp: string
    vencimento: string
    plano?: string
  } | null
}

export const WhatsAppMessengerModal: React.FC<ClienteWhatsAppProps> = ({
  isOpen,
  onClose,
  cliente,
}) => {
  const [tipoMensagem, setTipoMensagem] = useState<'cobranca' | 'vencido' | 'boas-vindas'>('cobranca')
  const [copiado, setCopiado] = useState(false)

  if (!isOpen || !cliente) return null

  const numeroLimpo = cliente.whatsapp.replace(/\D/g, '')

  const mensagens = {
    cobranca: `Olá *${cliente.nome}*, tudo bem? Passando para lembrar que a sua assinatura do OnePlay (${cliente.plano || 'Plano Mensal'}) vence em *${cliente.vencimento}*. Evite interrupções no seu acesso e garanta já a sua renovação!`,
    vencido: `Olá *${cliente.nome}*, identificamos que a sua assinatura do OnePlay expirou em *${cliente.vencimento}*. Podemos reativar o seu acesso imediatamente para você continuar aproveitando toda a programação. Vamos renovar hoje?`,
    'boas-vindas': `Olá *${cliente.nome}*, seja muito bem-vindo ao OnePlay! O seu acesso ao ${cliente.plano || 'Plano Mensal'} já está liberado. Salve este contato para atendimento prioritário e renovações. Excelente sessão!`,
  }

  const textoAtual = mensagens[tipoMensagem]
  const urlWhatsApp = `https://wa.me/55${numeroLimpo}?text=${encodeURIComponent(textoAtual)}`

  const handleCopiarTexto = () => {
    void navigator.clipboard.writeText(textoAtual)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const handleEnviar = () => {
    window.open(urlWhatsApp, '_blank')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in">
      <div className="glass-modal relative w-full max-w-lg rounded-2xl p-6 text-zinc-100 animate-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Comunicação Comercial WhatsApp</h3>
              <p className="text-xs text-zinc-400">
                Assinante: <span className="text-cyan-300 font-medium">{cliente.nome}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white transition-colors"
            aria-label="Fechar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
            Modelo Comercial
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setTipoMensagem('cobranca')}
              className={`py-2 px-3 text-xs font-medium rounded-xl border transition-all ${
                tipoMensagem === 'cobranca'
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.16)]'
                  : 'bg-white/[0.03] border-white/10 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Lembrete
            </button>
            <button
              type="button"
              onClick={() => setTipoMensagem('vencido')}
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
              onClick={() => setTipoMensagem('boas-vindas')}
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

        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
              Mensagem Formatada
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
          <div className="glass-input p-4 rounded-xl text-xs text-zinc-200 leading-relaxed max-h-40 overflow-y-auto">
            {textoAtual}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-zinc-300 text-xs font-medium hover:bg-white/[0.06] transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleEnviar}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-500/35 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs font-semibold transition-all shadow-[0_0_20px_rgba(52,211,153,0.18)]"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Enviar no WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  )
}
