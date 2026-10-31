import { AlertOctagon, MessageCircle, ShoppingBag } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCrmStore } from '../stores/useCrmStore'
import { isMasterUser } from '../lib/multiTenant'

export function SmartBanner() {
  const { usuario } = useAuth()
  const creditosStore = useCrmStore((state) => state.creditos)
  const abrirModalAcessoRestrito = useCrmStore((state) => state.abrirModalAcessoRestrito)
  const abrirLojaCreditos = useCrmStore((state) => state.abrirLojaCreditos)

  if (isMasterUser(usuario)) return null

  const saldo =
    typeof creditosStore === 'number'
      ? creditosStore
      : typeof usuario?.creditos === 'number'
        ? usuario.creditos
        : 0

  if (saldo > 0) return null

  return (
    <aside
      role="alert"
      aria-live="assertive"
      className="w-full border-b border-red-500/20 bg-red-500/[0.08] backdrop-blur-xl px-5 sm:px-7 lg:px-9 py-2.5 text-red-200 text-xs flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <AlertOctagon className="h-3.5 w-3.5 text-red-400 animate-pulse shrink-0" />
        <span className="font-medium text-red-200/95">
          Saldo de créditos esgotado: novos cadastros e renovações aguardam recarga na sua carteira.
        </span>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={abrirLojaCreditos}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/35 bg-cyan-500/15 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 transition-all duration-200 hover:-translate-y-0.5 hover:bg-cyan-500/25 hover:text-white"
        >
          <ShoppingBag className="h-3 w-3 text-cyan-300" />
          <span>Loja de Créditos</span>
        </button>
        <button
          type="button"
          onClick={abrirModalAcessoRestrito}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/35 bg-red-500/15 px-2.5 py-1 text-[11px] font-medium text-red-100 transition-all duration-200 hover:-translate-y-0.5 hover:bg-red-500/25"
        >
          <MessageCircle className="h-3 w-3" />
          <span>Suporte Master</span>
        </button>
      </div>
    </aside>
  )
}

export default SmartBanner
