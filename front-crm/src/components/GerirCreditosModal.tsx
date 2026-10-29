import { useState } from 'react'
import { Coins, PlusCircle, MinusCircle, Loader2, X, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Agente } from '../lib/agente'
import { getErrorMessage } from '../lib/errorHandler'
import { useCrmStore } from '../stores/useCrmStore'
import { isMasterUser } from '../lib/multiTenant'

interface GerirCreditosModalProps {
  agente: Agente | null
  isOpen: boolean
  onClose: () => void
  onSuccess: (novoSaldo: number, mensagem: string) => void
}

export function GerirCreditosModal({
  agente,
  isOpen,
  onClose,
  onSuccess,
}: GerirCreditosModalProps) {
  const [quantidadeStr, setQuantidadeStr] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  const currentUser = useCrmStore((s) => s.user)

  if (!isOpen || !agente || !isMasterUser(currentUser)) return null

  const saldoAtual = Number(agente.creditos ?? 0)
  const qtd = parseInt(quantidadeStr, 10)
  const qtdValida = !isNaN(qtd) && qtd > 0

  const saldoAposAdicao = qtdValida ? saldoAtual + qtd : saldoAtual
  const saldoAposRemocao = qtdValida ? Math.max(0, saldoAtual - qtd) : saldoAtual

  async function handleTransacao(tipo: 'adicionar' | 'remover') {
    if (!agente) return
    if (!qtdValida) {
      setError('Informe uma quantidade inteira válida maior que zero.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const novoSaldo =
        tipo === 'adicionar' ? saldoAtual + qtd : Math.max(0, saldoAtual - qtd)

      const { error: updErr } = await supabase
        .from('agentes')
        .update({ creditos: novoSaldo })
        .eq('id', agente.id)

      if (updErr) throw updErr

      const msg =
        tipo === 'adicionar'
          ? `${qtd} crédito(s) adicionado(s) a ${agente.nome}. Novo saldo: ${novoSaldo}.`
          : `${Math.min(qtd, saldoAtual)} crédito(s) removido(s) de ${agente.nome}. Novo saldo: ${novoSaldo}.`

      setQuantidadeStr('')
      onSuccess(novoSaldo, msg)
      onClose()
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      console.error('Erro na transação de créditos:', msg, err)
      setError(`Erro ao atualizar créditos: ${msg}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-md animate-in fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose()
        }
      }}
    >
      <div className="relative overflow-hidden w-full max-w-md rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl p-6 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] text-zinc-100 animate-in zoom-in-95">
        <div className="pointer-events-none absolute -top-14 -right-14 h-40 w-40 rounded-full bg-radial from-cyan-500/10 to-transparent" />

        <div className="relative flex items-start justify-between pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.2)]">
              <Coins className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
                Gerir Créditos
              </h2>
              <p className="text-xs text-zinc-400">
                {agente.nome} · {agente.email}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="rounded-xl p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 transition-all duration-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="relative mt-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="relative mt-4 rounded-xl border border-white/5 bg-white/[0.03] p-4 flex items-center justify-between">
          <div>
            <span className="text-[11px] uppercase tracking-wider font-medium text-zinc-400">
              Saldo Atual
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="font-mono text-2xl font-bold text-zinc-100 tabular-nums [font-variant-numeric:tabular-nums]">
                {saldoAtual}
              </span>
              <span className="text-xs text-zinc-400">créditos</span>
            </div>
          </div>
          <span className="rounded-md border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-300">
            1 Crédito = 1 Mês
          </span>
        </div>

        <div className="relative mt-4 space-y-3">
          <div>
            <label htmlFor="creditos-qtd" className="block text-xs font-medium text-zinc-300 mb-1.5">
              Quantidade de Créditos
            </label>
            <input
              id="creditos-qtd"
              type="number"
              min="1"
              step="1"
              disabled={loading}
              value={quantidadeStr}
              onChange={(e) => {
                setQuantidadeStr(e.target.value)
                if (error) setError(null)
              }}
              placeholder="Ex: 10"
              className="w-full rounded-xl border border-white/10 bg-[#030509]/70 px-3.5 py-2 text-sm font-mono text-zinc-100 tabular-nums placeholder-zinc-600 outline-none transition focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-zinc-500 mr-1">Atalhos:</span>
            {[5, 10, 25, 50, 100].map((valor) => (
              <button
                key={valor}
                type="button"
                disabled={loading}
                onClick={() => {
                  setQuantidadeStr(String(valor))
                  if (error) setError(null)
                }}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-mono font-medium text-zinc-300 tabular-nums transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:text-cyan-300 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
              >
                +{valor}
              </button>
            ))}
          </div>

          {qtdValida && (
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Após adicionar (+{qtd}):</span>
                <span className="font-mono font-semibold text-emerald-400 tabular-nums [font-variant-numeric:tabular-nums]">
                  {saldoAposAdicao} créditos
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-400">Após remover (-{qtd}):</span>
                <span className="font-mono font-semibold text-red-400 tabular-nums [font-variant-numeric:tabular-nums]">
                  {saldoAposRemocao} créditos
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="relative mt-5 grid grid-cols-2 gap-3 pt-4 border-t border-white/5">
          <button
            type="button"
            disabled={loading || !qtdValida || saldoAtual === 0}
            onClick={() => void handleTransacao('remover')}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 py-2 px-3 text-xs font-medium text-red-400 transition-all duration-300 hover:-translate-y-1 hover:bg-red-500/20 hover:shadow-[0_0_20px_rgba(248,113,113,0.2)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MinusCircle className="h-3.5 w-3.5" />
            )}
            <span>Remover</span>
          </button>

          <button
            type="button"
            disabled={loading || !qtdValida}
            onClick={() => void handleTransacao('adicionar')}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/15 py-2 px-3 text-xs font-semibold text-cyan-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/50 hover:bg-cyan-500/25 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlusCircle className="h-3.5 w-3.5" />
            )}
            <span>Adicionar Créditos</span>
          </button>
        </div>
      </div>
    </div>
  )
}
