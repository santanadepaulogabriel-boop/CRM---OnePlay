import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, AlertTriangle, Loader2, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { getErrorMessage } from '../lib/errorHandler'
import { useCrmStore } from '../stores/useCrmStore'
import { useFeatureGating } from '../hooks/useFeatureGating'
import { insertClienteMultiTenant } from '../lib/multiTenant'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

const inputClass =
  'w-full rounded-xl border border-white/10 bg-[#030509]/70 px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20'

export default function NovoClienteModal({ open, onClose, onCreated }: Props) {
  const { usuario } = useAuth()
  const { isBloqueado, abrirModalAcessoRestrito } = useFeatureGating()
  const [nome, setNome] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [plano, setPlano] = useState('Mensal')
  const [valor, setValor] = useState('35')
  const [vencimento, setVencimento] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creditError, setCreditError] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function reset() {
    setNome('')
    setWhatsapp('')
    setPlano('Mensal')
    setValor('35')
    setVencimento('')
    setError(null)
    setCreditError(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (isBloqueado) {
      onClose()
      abrirModalAcessoRestrito()
      return
    }
    if (!nome.trim()) {
      setError('O nome completo é obrigatório.')
      return
    }
    setError(null)
    setCreditError(false)
    setLoading(true)

    try {
      const basePayload: Record<string, unknown> = {
        whatsapp: whatsapp.trim() || null,
        plano: plano.trim() || 'Mensal',
        valor_mensal: valor ? Number(valor) : null,
        status: 'ativo',
        estagio_funil: 'cliente',
        data_vencimento: vencimento || null,
      }

      // Usa nome_completo com injeção automática de reseller_id / agente_id / tenant_id
      let res = await insertClienteMultiTenant(
        { ...basePayload, nome_completo: nome.trim() },
        usuario?.role,
        usuario?.id,
        usuario?.authId
      )

      if (res.error && String(res.error.message || '').includes('nome_completo')) {
        res = await insertClienteMultiTenant(
          { ...basePayload, nome: nome.trim() },
          usuario?.role,
          usuario?.id,
          usuario?.authId
        )
      }

      if (res.error) {
        throw res.error
      }

      useCrmStore.getState().deduzirCredito(1)
      if (res.data) {
        useCrmStore.getState().adicionarCliente(res.data)
      }

      reset()
      onCreated()
      onClose()
    } catch (err: unknown) {
      const msg = getErrorMessage(err)
      console.error('Erro na chamada do Supabase ao criar cliente:', msg, err)

      const isSaldoInsuficiente =
        msg.toLowerCase().includes('saldo de créditos insuficiente') ||
        msg.toLowerCase().includes('saldo de creditos insuficiente') ||
        msg.toLowerCase().includes('créditos insuficiente') ||
        msg.toLowerCase().includes('creditos insuficiente')

      if (isSaldoInsuficiente) {
        setCreditError(true)
        setError('Saldo de créditos insuficiente!')
      } else {
        setCreditError(false)
        setError(`Não foi possível salvar: ${msg}`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 backdrop-blur-md animate-in fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="novo-cliente-title"
        className="relative overflow-hidden w-full max-w-lg rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl p-6 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] text-zinc-100 animate-in zoom-in-95"
      >
        <div className="pointer-events-none absolute -top-14 -right-14 h-40 w-40 rounded-full bg-radial from-cyan-500/10 to-transparent" />

        <div className="relative mb-5 flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <h2
              id="novo-cliente-title"
              className="text-base font-semibold tracking-tight text-zinc-100"
            >
              Novo Assinante
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Cadastre um novo cliente ativo diretamente na carteira (consome 1 crédito).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-xl p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 transition-all duration-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="relative space-y-4" noValidate>
          <div>
            <label htmlFor="c-nome" className="mb-1.5 block text-xs font-medium text-zinc-300">
              Nome completo <span className="text-cyan-400">*</span>
            </label>
            <input
              id="c-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome do cliente"
              className={inputClass}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label htmlFor="c-whatsapp" className="mb-1.5 block text-xs font-medium text-zinc-300">
                WhatsApp
              </label>
              <input
                id="c-whatsapp"
                type="tel"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="+55 11 99999-9999"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="c-plano" className="mb-1.5 block text-xs font-medium text-zinc-300">
                Plano
              </label>
              <select
                id="c-plano"
                value={plano}
                onChange={(e) => setPlano(e.target.value)}
                className={`${inputClass} [color-scheme:dark]`}
              >
                <option value="Mensal">Mensal</option>
                <option value="Trimestral">Trimestral</option>
                <option value="Semestral">Semestral</option>
                <option value="Anual">Anual</option>
              </select>
            </div>
            <div>
              <label htmlFor="c-valor" className="mb-1.5 block text-xs font-medium text-zinc-300">
                Valor mensal (R$)
              </label>
              <input
                id="c-valor"
                type="number"
                min="0"
                step="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="35,00"
                className={`${inputClass} font-mono tabular-nums`}
              />
            </div>
            <div>
              <label
                htmlFor="c-vencimento"
                className="mb-1.5 block text-xs font-medium text-zinc-300"
              >
                Data de vencimento
              </label>
              <input
                id="c-vencimento"
                type="date"
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
                className={`${inputClass} [color-scheme:dark]`}
              />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400"
            >
              {creditError ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div className="flex-1 space-y-1">
                <p className="font-semibold text-zinc-100">{error}</p>
                {creditError && (
                  <p className="text-[11px] text-red-300 leading-relaxed">
                    Saldo insuficiente para ativar este cliente. Recarregue na Loja de Créditos para prosseguir.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-3 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2 text-xs font-medium text-zinc-300 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:text-zinc-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || creditError}
              className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/15 px-4 py-2 text-xs font-semibold text-cyan-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/50 hover:bg-cyan-500/25 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Salvar Assinante</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
