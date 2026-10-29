import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { useCrmStore } from '../stores/useCrmStore'
import { getSafeHomeRoute } from '../lib/multiTenant'

interface Props {
  children: ReactNode
  fallbackMessage?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary capturou uma falha não tratada:', error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null })
    const safeHome = getSafeHomeRoute(useCrmStore.getState().user)
    window.location.href = safeHome
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] w-full flex-col items-center justify-center p-6 text-center">
          <div className="relative max-w-lg overflow-hidden rounded-2xl border border-white/5 bg-[#06080d]/60 p-8 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] backdrop-blur-2xl">
            <div className="pointer-events-none absolute -top-20 -right-20 h-44 w-44 rounded-full bg-radial from-cyan-500/10 to-transparent" />

            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400 shadow-[0_0_24px_rgba(248,113,113,0.18)]">
              <AlertTriangle className="h-7 w-7" />
            </div>

            <h2 className="text-lg font-semibold tracking-tight text-zinc-100">
              Ocorreu uma falha neste módulo
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-zinc-400">
              {this.props.fallbackMessage ||
                'Um erro pontual impediu o carregamento completo desta seção. O restante do OnePlay CRM permanece protegido.'}
            </p>

            {this.state.error && (
              <div className="mt-4 rounded-xl border border-white/5 bg-[#030509]/80 p-3 text-left font-mono text-[11px] text-red-300/90 break-words max-h-32 overflow-y-auto">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-4 py-2.5 text-xs font-semibold text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.15)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:bg-cyan-500/25 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Recarregar Módulo</span>
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-zinc-300 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
              >
                <Home className="h-3.5 w-3.5" />
                <span>Voltar ao Início</span>
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
