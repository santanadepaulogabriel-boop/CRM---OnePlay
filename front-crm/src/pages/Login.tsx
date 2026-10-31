import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail, ShieldAlert, Sparkles } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCrmStore } from '../stores/useCrmStore'
import { StatusBadge } from '../components/ui/TierOnePrimitives'
import { getSafeHomeRoute } from '../lib/multiTenant'

function translateError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.'
  if (m.includes('password should be at least')) return 'A senha deve ter pelo menos 6 caracteres.'
  if (m.includes('rate limit')) return 'Muitas tentativas. Aguarde um momento e tente novamente.'
  return message
}

const inputClass =
  'glass-input w-full rounded-xl py-2.5 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none transition-all duration-300 focus:border-cyan-500/40 focus:ring-2 focus:ring-cyan-500/20 focus:shadow-[0_0_20px_rgba(34,211,238,0.12)]'

export default function Login() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim() || !password) {
      setError('Informe seu e-mail e sua senha de acesso.')
      return
    }

    setLoading(true)
    try {
      const usuarioLogado = await login(email, password)

      useCrmStore.getState().setUser({
        id: usuarioLogado.id,
        authId: usuarioLogado.authId,
        email: usuarioLogado.email,
        nome: usuarioLogado.nome,
        role: usuarioLogado.role,
        creditos: usuarioLogado.creditos ?? 0,
      })
      void useCrmStore.getState().carregarCreditos()

      if (usuarioLogado.precisa_trocar_senha) {
        navigate('/redefinir-senha', { replace: true })
      } else {
        navigate(getSafeHomeRoute(usuarioLogado), { replace: true })
      }
    } catch (err) {
      setError(
        translateError(err instanceof Error ? err.message : 'Erro inesperado ao autenticar.')
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-cinematic text-zinc-100 flex items-center justify-center px-4 py-10 font-sans selection:bg-cyan-500/30 selection:text-cyan-100">
      {/* Ambient Canvas Glows */}
      <div className="pointer-events-none fixed -top-40 left-1/2 -translate-x-1/2 h-[420px] w-[680px] rounded-full bg-radial from-cyan-500/12 to-transparent blur-3xl" />
      <div className="pointer-events-none fixed -bottom-40 -right-24 h-[360px] w-[360px] rounded-full bg-radial from-cyan-500/10 to-transparent blur-3xl" />

      <div className="glass-card relative w-full max-w-sm overflow-hidden rounded-2xl p-7 transition-all duration-300 hover:border-cyan-500/25">
        {/* Card Corner Ambient Glow */}
        <div className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-radial from-cyan-500/10 to-transparent" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 h-40 w-40 rounded-full bg-radial from-cyan-500/10 to-transparent" />

        <div className="relative mb-7 text-center">
          <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-400 shadow-[0_0_24px_rgba(34,211,238,0.2)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-zinc-100">OnePlay CRM</h1>
            <StatusBadge variant="teste" label="Enterprise" />
          </div>
          <p className="mt-1.5 text-xs text-zinc-400">
            Autenticação de Operadores e Revendedores
          </p>
        </div>

        <form onSubmit={handleSubmit} className="relative space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-zinc-300">
              E-mail de Acesso
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="agente@oneplay.com"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className="block text-xs font-medium text-zinc-300">
                Senha
              </label>
              <Link
                to="/esqueci-senha"
                className="text-xs font-medium text-zinc-400 hover:text-cyan-400 transition-colors"
              >
                Esqueci minha senha
              </Link>
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                id="password"
                type={mostrarSenha ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-cyan-300 transition-colors"
                tabIndex={-1}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Exibir senha'}
              >
                {mostrarSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/15 py-2.5 text-xs font-semibold text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.12)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:bg-cyan-500/25 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />}
            <span>Entrar no Sistema</span>
          </button>
        </form>

        <div className="relative mt-6 flex items-center justify-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center text-[11px] text-zinc-400">
          <ShieldAlert className="h-3.5 w-3.5 text-cyan-400/80 shrink-0" />
          <span>Contas de revenda são provisionadas pela administração Master.</span>
        </div>
      </div>
    </main>
  )
}
