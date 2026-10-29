import { Coins, Sparkles, AlertTriangle, ShoppingBag } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCrmStore } from '../stores/useCrmStore'
import { StatusBadge } from './ui/TierOnePrimitives'

export function RevendedorCreditosBanner() {
  const { usuario } = useAuth()
  const creditosStore = useCrmStore((state) => state.creditos)

  const isMaster = usuario?.nivel_acesso === 'Master' || usuario?.role === 'master'
  if (isMaster) return null

  const saldo = typeof creditosStore === 'number' ? creditosStore : Number(usuario?.creditos ?? 0)
  const isZero = saldo <= 0

  return (
    <div
      className={`relative mb-6 overflow-hidden rounded-2xl border bg-[#06080d]/60 p-4 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] backdrop-blur-2xl transition-all duration-300 ${
        isZero ? 'border-red-500/30' : 'border-white/5 hover:border-cyan-500/30'
      }`}
    >
      <div className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-radial from-cyan-500/10 to-transparent" />

      <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl border shrink-0 ${
              isZero
                ? 'border-red-500/30 bg-red-500/10 text-red-400 shadow-[0_0_20px_rgba(248,113,113,0.2)]'
                : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.2)]'
            }`}
          >
            {isZero ? (
              <AlertTriangle className="h-6 w-6 text-red-400" />
            ) : (
              <Coins className="h-6 w-6 text-emerald-400" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-semibold text-zinc-100">
                Créditos Disponíveis:{' '}
                <span
                  className={`font-mono text-xl sm:text-2xl font-bold tabular-nums [font-variant-numeric:tabular-nums] ${
                    isZero ? 'text-red-400' : 'text-emerald-400'
                  }`}
                >
                  {saldo}
                </span>
              </span>
              {isZero && <StatusBadge variant="vencido" label="Saldo Esgotado" />}
            </div>
            <p
              className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1.5 cursor-help"
              title="1 Crédito = 1 Mês de Assinatura"
            >
              <Sparkles className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
              <span>
                Regra: <strong className="text-zinc-100">1 Crédito = 1 Mês de Assinatura</strong>
              </span>
              <span className="text-zinc-500 text-[11px] hidden md:inline">
                · Saldo consumido ao ativar novos clientes
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 sm:self-center">
          <StatusBadge variant="teste" label="1 Crédito = 1 Mês de Assinatura" />
          <button
            type="button"
            onClick={() => useCrmStore.getState().abrirLojaCreditos()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-400/60 hover:bg-cyan-500/25 hover:text-white shadow-[0_0_20px_rgba(6,182,212,0.15)]"
          >
            <ShoppingBag className="h-3.5 w-3.5 text-cyan-300" />
            <span>Loja de Créditos</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default RevendedorCreditosBanner
