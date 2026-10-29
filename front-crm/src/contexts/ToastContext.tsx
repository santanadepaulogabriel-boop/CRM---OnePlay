import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  title?: string
  message: string
  duration?: number
}

interface ToastContextType {
  toasts: ToastItem[]
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => void
  success: (message: string, title?: string) => void
  error: (message: string, title?: string) => void
  warning: (message: string, title?: string) => void
  info: (message: string, title?: string) => void
  removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', title?: string, duration = 4500) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
      const novoToast: ToastItem = { id, type, title, message, duration }

      setToasts((prev) => [...prev, novoToast])

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id)
        }, duration)
      }
    },
    [removeToast]
  )

  const success = useCallback(
    (message: string, title?: string) => showToast(message, 'success', title),
    [showToast]
  )
  const error = useCallback(
    (message: string, title?: string) => showToast(message, 'error', title),
    [showToast]
  )
  const warning = useCallback(
    (message: string, title?: string) => showToast(message, 'warning', title),
    [showToast]
  )
  const info = useCallback(
    (message: string, title?: string) => showToast(message, 'info', title),
    [showToast]
  )

  const contextValue = useMemo(
    () => ({
      toasts,
      showToast,
      success,
      error,
      warning,
      info,
      removeToast,
    }),
    [toasts, showToast, success, error, warning, info, removeToast]
  )

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      {/* Container de Toasts Flutuantes — Glassmorphism Tier-1 */}
      <aside
        aria-live="polite"
        className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto relative overflow-hidden flex items-start gap-3 rounded-2xl border border-white/10 bg-[#06080d]/80 p-4 text-zinc-100 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] animate-in fade-in zoom-in-95"
          >
            <div className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full bg-radial from-cyan-500/10 to-transparent" />

            <div className="shrink-0 mt-0.5">
              {t.type === 'error' && <AlertCircle className="h-4 w-4 text-red-400" />}
              {t.type === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
              {t.type === 'warning' && <AlertTriangle className="h-4 w-4 text-amber-400" />}
              {t.type === 'info' && <Info className="h-4 w-4 text-cyan-400" />}
            </div>

            <div className="flex-1 min-w-0">
              {t.title && (
                <p className="text-xs font-semibold text-zinc-100 tracking-tight mb-0.5">
                  {t.title}
                </p>
              )}
              <p className="text-xs text-zinc-300 leading-relaxed">{t.message}</p>
            </div>

            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="shrink-0 rounded-lg p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 transition-all duration-300"
              aria-label="Fechar notificação"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </aside>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast deve ser utilizado dentro de um ToastProvider')
  }
  return context
}
