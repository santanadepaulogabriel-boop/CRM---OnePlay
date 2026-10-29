import { Coins, Sparkles, AlertTriangle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCrmStore } from '../stores/useCrmStore'

interface Props {
  className?: string
  showLabel?: boolean
  showSubtitle?: boolean
}

export function CreditosBadge({ className = '', showLabel = true, showSubtitle = false }: Props) {
  const { usuario } = useAuth()
  const creditosStore = useCrmStore((state) => state.creditos)

  const saldo = typeof creditosStore === 'number' ? creditosStore : Number(usuario?.creditos ?? 0)
  const isMaster = usuario?.nivel_acesso === 'Master' || usuario?.role === 'master'

  if (isMaster) {
    return (
      <div
        className={`relative overflow-hidden flex items-center gap-2 rounded-xl border border-white/5 bg-[#06080d]/60 px-3 py-2 text-xs font-medium text-zinc-200 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] ${className}`}
        title="Conta Master possui acesso administrativo irrestrito"
      >
        <div className="pointer-events-none absolute -top-6 -right-6 h-16 w-16 rounded-full bg-radial from-cyan-500/15 to-transparent" />
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.9)] shrink-0" />
        <Sparkles className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
        <span>{showLabel ? 'Saldo: ' : ''}Ilimitado</span>
      </div>
    )
  }

  const isZero = saldo <= 0

  return (
    <div
      onClick={() => useCrmStore.getState().abrirLojaCreditos()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          useCrmStore.getState().abrirLojaCreditos()
        }
      }}
      className={`group relative overflow-hidden flex flex-col justify-center rounded-xl border px-3 py-2 text-xs font-medium backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] cursor-pointer transition-all duration-300 hover:-translate-y-1 ${
        isZero
          ? 'border-red-500/30 bg-red-500/10 text-red-400 hover:border-red-400/50 hover:shadow-[0_0_20px_rgba(248,113,113,0.2)]'
          : 'border-white/5 bg-[#06080d]/60 text-zinc-200 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]'
      } ${className}`}
      title={`Créditos Disponíveis: ${saldo} · Clique para abrir a Loja de Créditos`}
    >
      <div className="pointer-events-none absolute -top-8 -right-8 h-20 w-20 rounded-full bg-radial from-cyan-500/10 to-transparent" />

      <div className="relative flex items-center justify-between gap-2 w-full">
        <div className="flex items-center gap-1.5">
          {isZero ? (
            <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
          ) : (
            <Coins className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          )}
          <span>
            {showLabel ? 'Créditos: ' : ''}
            <span
              className={`font-mono font-semibold tabular-nums [font-variant-numeric:tabular-nums] ${
                isZero ? 'text-red-300' : 'text-zinc-100'
              }`}
            >
              {saldo}
            </span>
          </span>
        </div>
        <span className="text-[10px] text-cyan-400 font-medium bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
          Loja
        </span>
      </div>
      {showSubtitle && (
        <span className="relative text-[10px] font-normal text-zinc-400 mt-0.5">
          1 Crédito = 1 Mês de Assinatura
        </span>
      )}
    </div>
  )
}

export default CreditosBadge
