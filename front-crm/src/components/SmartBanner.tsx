import { AlertOctagon, MessageCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCrmStore } from '../stores/useCrmStore'

export function SmartBanner() {
  const { usuario } = useAuth()
  const creditosStore = useCrmStore((state) => state.creditos)
  const abrirModalAcessoRestrito = useCrmStore((state) => state.abrirModalAcessoRestrito)

  const isMaster =
    String(usuario?.nivel_acesso || '').toLowerCase() === 'master' ||
    String(usuario?.role || '').toLowerCase() === 'master'

  if (isMaster) return null

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
      className="w-full border-b border-red-500/25 bg-red-500/10 backdrop-blur-2xl px-4 py-2.5 text-red-200 text-xs flex items-center justify-center gap-3 animate-in fade-in duration-200"
    >
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <AlertOctagon className="h-3.5 w-3.5 text-red-400 animate-pulse shrink-0" />
        <span className="font-medium text-red-300">
          Acesso Restrito: Saldo de créditos esgotado. Cadastros e renovações estão bloqueados.
        </span>
        <button
          type="button"
          onClick={abrirModalAcessoRestrito}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/20 px-2.5 py-1 text-[11px] font-medium text-red-100 transition-all duration-300 hover:-translate-y-0.5 hover:bg-red-500/30 hover:shadow-[0_0_16px_rgba(248,113,113,0.3)]"
        >
          <MessageCircle className="h-3 w-3" />
          <span>Solicitar Créditos</span>
        </button>
      </div>
    </aside>
  )
}

export default SmartBanner
