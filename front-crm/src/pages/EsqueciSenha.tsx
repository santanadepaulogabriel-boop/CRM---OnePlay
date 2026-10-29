import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'

const inputClass =
  'w-full rounded-xl border border-white/10 bg-[#030509]/80 py-2.5 pl-9 pr-3 text-sm text-zinc-100 placeholder-zinc-500 outline-none backdrop-blur-xl transition-all duration-300 focus:border-cyan-500/40 focus:ring-2 focus:ring-cyan-500/20 focus:shadow-[0_0_20px_rgba(34,211,238,0.12)]'

export default function EsqueciSenha() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!email.trim()) {
      setError('Informe o e-mail cadastrado na sua conta.')
      return
    }

    setLoading(true)
    try {
      const redirectUrl = `${window.location.origin}/redefinir-senha`
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: redirectUrl }
      )

      if (resetErr) throw resetErr
      setEnviado(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg || 'Erro ao processar recuperação de senha.')
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

        <div className="relative mb-7 text-center">
          <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-400 shadow-[0_0_24px_rgba(34,211,238,0.2)]">
            <KeyRound className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-100">
            Recuperar Acesso
          </h1>
          <p className="mt-1.5 text-xs text-zinc-400">
            Informe seu e-mail cadastrado para receber o link de redefinição.
          </p>
        </div>

        {enviado ? (
          <div className="relative space-y-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-5 text-center backdrop-blur-xl">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Link de Recuperação Enviado</h3>
              <p className="mt-1 text-xs text-zinc-300 leading-relaxed">
                Caso <strong className="text-emerald-300 font-mono">{email}</strong> esteja
                cadastrado, você receberá as instruções em instantes.
              </p>
            </div>
            <Link
              to="/login"
              className="inline-flex items-center justify-center gap-2 w-full rounded-xl border border-white/10 bg-[#06080d]/60 py-2.5 text-xs font-medium text-zinc-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Voltar para o Login</span>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="relative space-y-4" noValidate>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-zinc-300">
                E-mail Cadastrado
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
                  placeholder="seu.email@oneplay.com"
                  className={inputClass}
                  autoFocus
                />
              </div>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300 backdrop-blur-xl"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/15 py-2.5 text-xs font-semibold text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.12)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:bg-cyan-500/25 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />}
              <span>Enviar Link de Redefinição</span>
            </button>

            <div className="pt-2 text-center">
              <Link
                to="/login"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-cyan-300 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Voltar para o Login</span>
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
