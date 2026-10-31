import React, { useState, useEffect } from 'react'
import { MessageSquare, Power, ShieldCheck, Cpu } from 'lucide-react'

export const ModuleSettings: React.FC = () => {
  const [whatsappActive, setWhatsappActive] = useState<boolean>(() => {
    const savedState = localStorage.getItem('oneplay_whatsapp_module')
    return savedState ? Boolean(JSON.parse(savedState)) : false
  })

  useEffect(() => {
    localStorage.setItem('oneplay_whatsapp_module', JSON.stringify(whatsappActive))
  }, [whatsappActive])

  return (
    <section className="w-full mt-6 space-y-5 text-zinc-100">
      <div className="glass-card rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-start gap-4">
          <div
            className={`p-3 rounded-2xl border shrink-0 transition-colors ${
              whatsappActive
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.15)]'
                : 'bg-white/[0.04] border-white/10 text-zinc-400'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
          </div>

          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="text-sm font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
                <span>Módulo WhatsApp Corporativo</span>
              </h3>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                  whatsappActive
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
                    : 'bg-white/[0.04] text-zinc-400 border-white/10'
                }`}
              >
                {whatsappActive ? 'Ativo na Operação' : 'Pausado'}
              </span>
            </div>

            <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
              Habilita réguas comerciais de renovação, avisos preventivos de vencimento e atendimento integrado via WhatsApp para a conta Master e parceiros credenciados.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4 self-end md:self-center shrink-0">
          <div className="hidden sm:flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>Mensageria Enterprise</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          </div>

          <button
            type="button"
            onClick={() => setWhatsappActive(!whatsappActive)}
            className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ease-in-out focus:outline-none ${
              whatsappActive
                ? 'bg-cyan-500/80 border-cyan-400/50 shadow-[0_0_16px_rgba(34,211,238,0.28)]'
                : 'bg-white/[0.08] border-white/15'
            }`}
          >
            <span className="sr-only">Alternar Módulo WhatsApp Corporativo</span>
            <span
              className={`pointer-events-none flex h-6 w-6 translate-y-[1px] items-center justify-center rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                whatsappActive ? 'translate-x-7' : 'translate-x-0.5'
              }`}
            >
              <Power className={`w-3 h-3 ${whatsappActive ? 'text-cyan-600' : 'text-zinc-500'}`} />
            </span>
          </button>
        </div>
      </div>
    </section>
  )
}

export default ModuleSettings
