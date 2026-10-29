import { useEffect, useState } from 'react'
import { ExternalLink, Lock, MessageCircle, ShieldAlert, ShoppingBag, Sparkles, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatarTelefone } from '../lib/whatsapp'
import { useCrmStore } from '../stores/useCrmStore'
import { useAuth } from '../contexts/AuthContext'

export interface ModalAcessoRestritoProps {
  isOpen?: boolean
  onClose?: () => void
  whatsappMaster?: string
}

export function ModalAcessoRestrito({
  isOpen: isOpenProp,
  onClose: onCloseProp,
  whatsappMaster: customWhatsapp,
}: ModalAcessoRestritoProps) {
  const storeIsOpen = useCrmStore((state) => state.modalAcessoRestritoOpen)
  const storeClose = useCrmStore((state) => state.fecharModalAcessoRestrito)
  const creditosStore = useCrmStore((state) => state.creditos)
  const { usuario } = useAuth()

  const isOpen = isOpenProp !== undefined ? isOpenProp : storeIsOpen
  const onClose = onCloseProp !== undefined ? onCloseProp : storeClose

  const [telefoneMaster, setTelefoneMaster] = useState<string>(customWhatsapp || '')
  const [loadingContact, setLoadingContact] = useState(false)

  const saldo = typeof creditosStore === 'number' ? creditosStore : Number(usuario?.creditos ?? 0)

  useEffect(() => {
    if (!isOpen) return
    if (customWhatsapp) {
      setTelefoneMaster(formatarTelefone(customWhatsapp))
      return
    }

    let isMounted = true
    async function carregarMaster() {
      setLoadingContact(true)
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
          .select('telefone, nome, nivel_acesso')
          .ilike('nivel_acesso', 'Master')
          .not('telefone', 'is', null)
          .limit(1)

        if (!error && data && data.length > 0 && data[0].telefone) {
          if (isMounted) {
            setTelefoneMaster(formatarTelefone(data[0].telefone))
          }
        }
      } catch (err) {
        console.warn('Não foi possível carregar o telefone do Master:', err)
      } finally {
        if (isMounted) setLoadingContact(false)
      }
    }

    void carregarMaster()
    return () => {
      isMounted = false
    }
  }, [isOpen, customWhatsapp])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const telefoneDestino = telefoneMaster || '5511999999999'
  const mensagemWhatsApp =
    'Olá, Master! O meu saldo de créditos no OnePlay esgotou ou a minha licença expirou. Gostaria de adquirir uma recarga de créditos para continuar a provisionar novos clientes no CRM.'
  const linkWhatsApp = `https://wa.me/${telefoneDestino}?text=${encodeURIComponent(mensagemWhatsApp)}`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-acesso-restrito-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl p-6 text-center shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute -top-14 -right-14 h-40 w-40 rounded-full bg-radial from-cyan-500/10 to-transparent" />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 transition-all duration-300"
          aria-label="Fechar aviso"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.2)]">
          <ShieldAlert className="h-6 w-6" />
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-300 mb-3 uppercase tracking-widest">
          <Lock className="h-3 w-3 text-amber-400" />
          <span>Saldo Esgotado</span>
        </div>

        <h2
          id="modal-acesso-restrito-title"
          className="text-lg font-semibold tracking-tight text-zinc-100 mb-2"
        >
          Acesso Restrito
        </h2>

        <p className="text-xs text-zinc-400 leading-relaxed mb-5">
          O seu saldo de créditos esgotou ou a sua licença expirou. Para continuar a provisionar e renovar clientes, solicite uma recarga de créditos ao suporte Master.
        </p>

        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3 mb-5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-zinc-400">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            <span>Saldo atual:</span>
          </div>
          <span className="font-mono font-semibold text-red-400 bg-red-500/10 px-2.5 py-0.5 rounded-md border border-red-500/20 tabular-nums [font-variant-numeric:tabular-nums]">
            {saldo} créditos
          </span>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => {
              onClose()
              useCrmStore.getState().abrirLojaCreditos()
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/15 px-4 py-2.5 text-xs font-semibold text-cyan-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/50 hover:bg-cyan-500/25 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
          >
            <ShoppingBag className="h-4 w-4" />
            <span>Abrir Loja de Créditos</span>
          </button>

          <a
            href={linkWhatsApp}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2.5 text-xs font-semibold text-emerald-300 transition-all duration-300 hover:-translate-y-1 hover:bg-emerald-500/25 hover:text-emerald-100 hover:shadow-[0_0_20px_rgba(52,211,153,0.2)]"
          >
            <MessageCircle className="h-4 w-4" />
            <span>Falar com Suporte Master</span>
            <ExternalLink className="h-3.5 w-3.5 opacity-75" />
          </a>

          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2 text-xs font-medium text-zinc-400 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:text-zinc-100"
          >
            Continuar em Modo Leitura
          </button>
        </div>

        {loadingContact && (
          <p className="text-[10px] text-zinc-500 mt-3">Sincronizando contato do Master...</p>
        )}
      </div>
    </div>
  )
}

export default ModalAcessoRestrito
