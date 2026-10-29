import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  ShieldCheck,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { StatusBadge } from '../components/ui/TierOnePrimitives'
import { getSafeHomeRoute } from '../lib/multiTenant'

const inputClass =
  'w-full rounded-xl border border-white/10 bg-[#030509]/80 py-2.5 pl-9 pr-10 text-sm text-zinc-100 placeholder-zinc-500 outline-none backdrop-blur-xl transition-all duration-300 focus:border-cyan-500/40 focus:ring-2 focus:ring-cyan-500/20 focus:shadow-[0_0_20px_rgba(34,211,238,0.12)]'

export default function RedefinirSenha() {
  const navigate = useNavigate()
  const { usuario, definirSenhaDefinitiva, logout } = useAuth()

  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [mostrarConfirmar, setMostrarConfirmar] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (novaSenha.length < 6) {
      setError('A nova senha deve ter no mínimo 6 caracteres.')
      return
    }

    if (novaSenha !== confirmarSenha) {
      setError('A confirmação de senha não coincide com a nova senha.')
      return
    }

    setLoading(true)
    try {
      await definirSenhaDefinitiva(novaSenha)
      setSucesso(true)
      navigate(getSafeHomeRoute(usuario), { replace: true })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Erro ao redefinir a senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#030509] text-zinc-100 flex items-center justify-center px-4 py-10 font-sans selection:bg-cyan-500/30 selection:text-cyan-100">
      {/* Ambient Canvas Glows */}
      <div className="pointer-events-none fixed -top-40 left-1/2 -translate-x-1/2 h-[420px] w-[680px] rounded-full bg-radial from-cyan-500/12 to-transparent blur-3xl" />

      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/5 bg-[#06080d]/60 p-7 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] transition-all duration-300 hover:border-cyan-500/20">
        {/* Corner Ambient Glow */}
        <div className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-radial from-cyan-500/10 to-transparent" />

        <div className="relative mb-6 text-center">
          <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/25 bg-amber-500/10 text-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.18)]">
            <KeyRound className="h-5 w-5" />
          </div>
          <div className="mb-2.5 flex justify-center">
            <StatusBadge
              variant={usuario?.precisa_trocar_senha ? 'vencendo' : 'teste'}
              label={
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  <span>{usuario?.precisa_trocar_senha ? 'Primeiro Acesso' : 'Segurança'}</span>
                </span>
              }
            />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
            {usuario?.precisa_trocar_senha ? 'Criar Senha Definitiva' : 'Definir Nova Senha'}
          </h1>
          <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">
            {usuario?.precisa_trocar_senha
              ? `Olá, ${usuario?.nome || 'Revendedor'}! Crie sua senha pessoal para liberar o painel.`
              : 'Digite e confirme sua nova senha de acesso.'}
          </p>
        </div>

        {sucesso ? (
          <div className="relative rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-5 text-center backdrop-blur-xl">
            <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-400 mb-2" />
            <p className="text-sm font-semibold text-zinc-100">Senha alterada com sucesso</p>
            <p className="text-xs text-emerald-300 mt-1">Redirecionando...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="relative space-y-4" noValidate>
            <div>
              <label htmlFor="novaSenha" className="mb-1.5 block text-xs font-medium text-zinc-300">
                Nova Senha Pessoal
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  id="novaSenha"
                  type={mostrarSenha ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-cyan-300 transition-colors"
                  tabIndex={-1}
                  aria-label={mostrarSenha ? 'Ocultar nova senha' : 'Mostrar nova senha'}
                >
                  {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="confirmarSenha"
                className="mb-1.5 block text-xs font-medium text-zinc-300"
              >
                Confirmar Nova Senha
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  id="confirmarSenha"
                  type={mostrarConfirmar ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  placeholder="Repita a nova senha"
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setMostrarConfirmar((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-cyan-300 transition-colors"
                  tabIndex={-1}
                  aria-label={mostrarConfirmar ? 'Ocultar confirmação' : 'Mostrar confirmação'}
                >
                  {mostrarConfirmar ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300 backdrop-blur-xl"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/15 py-2.5 text-xs font-semibold text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.12)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:bg-cyan-500/25 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />}
              <span>Salvar Senha e Entrar</span>
            </button>
          </form>
        )}

        <div className="relative mt-6 pt-4 border-t border-white/5 flex items-center justify-center">
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-cyan-300 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Encerrar sessão</span>
          </button>
        </div>
      </div>
    </main>
  )
}
