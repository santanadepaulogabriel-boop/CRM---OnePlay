import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type StatusSemanticVariant =
  | 'ativo'
  | 'vencendo'
  | 'vencido'
  | 'teste'
  | 'suporte'
  | 'neutral'

export interface StatusBadgeProps {
  variant: StatusSemanticVariant
  label: ReactNode
  showDot?: boolean
  className?: string
}

const VARIANT_CLASSES: Record<
  StatusSemanticVariant,
  { badge: string; dot: string; pulseLed: boolean }
> = {
  ativo: {
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]',
    pulseLed: true,
  },
  vencendo: {
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]',
    pulseLed: true,
  },
  vencido: {
    badge: 'bg-red-500/15 text-red-400 border-red-500/30',
    dot: 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.75)]',
    pulseLed: false,
  },
  teste: {
    badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    dot: 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.85)]',
    pulseLed: true,
  },
  suporte: {
    badge: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    dot: 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.85)]',
    pulseLed: true,
  },
  neutral: {
    badge: 'bg-white/[0.04] text-zinc-300 border-white/10',
    dot: 'bg-zinc-400',
    pulseLed: false,
  },
}

/**
 * StatusBadge Didático Tier-1:
 * Cores semânticas vibrantes com fundo translúcido e ponto LED pulsante
 * com box-shadow para estados "Ativo" e "Vencendo" / "A Vencer" / "Alerta".
 */
export function StatusBadge({
  variant,
  label,
  showDot = true,
  className = '',
}: StatusBadgeProps) {
  const cfg = VARIANT_CLASSES[variant] || VARIANT_CLASSES.neutral

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-0.5 text-[11px] font-medium tabular-nums [font-variant-numeric:tabular-nums] ${cfg.badge} ${className}`}
    >
      {showDot && (
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dot} ${cfg.pulseLed ? 'animate-pulse' : ''
            }`}
        />
      )}
      <span>{label}</span>
    </span>
  )
}

export interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  compact?: boolean
  className?: string
}

/**
 * EmptyState Didático Tier-1:
 * Ícone grande e translúcido no centro com brilho sutil, título encorajador
 * e texto explicativo claro sobre como alimentar a tela.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] text-center flex flex-col items-center justify-center ${compact ? 'px-4 py-7' : 'px-6 py-12'
        } ${className}`}
    >
      <div className="pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full bg-radial from-cyan-500/10 to-transparent" />
      <div
        className={`relative flex items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.06] text-cyan-400/75 shadow-[0_0_28px_rgba(34,211,238,0.12)] ${compact ? 'h-11 w-11 mb-3' : 'h-14 w-14 mb-4'
          }`}
      >
        <Icon className={compact ? 'h-5 w-5' : 'h-7 w-7'} />
      </div>
      <h3
        className={`font-semibold tracking-tight text-zinc-100 ${compact ? 'text-xs' : 'text-sm'
          }`}
      >
        {title}
      </h3>
      <p
        className={`mt-1.5 max-w-sm text-zinc-400 leading-relaxed ${compact ? 'text-[11px]' : 'text-xs'
          }`}
      >
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export interface GlassTooltipPayloadItem {
  name?: unknown
  value?: unknown
  color?: string
  dataKey?: unknown
}

export interface GlassChartTooltipProps {
  active?: boolean
  payload?: readonly GlassTooltipPayloadItem[]
  label?: unknown
  labelPrefix?: string
  valueFormatter?: (value: number, name: string) => [string, string]
}

/**
 * Tooltip Glassmorphic para Recharts (Fundo blur escuro e borda translúcida + tabular-nums)
 */
export function GlassChartTooltip({
  active,
  payload,
  label,
  labelPrefix = '',
  valueFormatter,
}: GlassChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null
  const labelText = label !== undefined && label !== null ? String(label) : ''

  return (
    <div className="rounded-xl border border-white/10 bg-[#06080d]/85 px-3.5 py-2.5 text-xs text-zinc-100 shadow-[0_8px_32px_0_rgba(0,0,0,0.55)] backdrop-blur-xl">
      {labelText !== '' && (
        <p className="mb-1.5 text-[11px] font-medium text-zinc-400">
          {labelPrefix ? `${labelPrefix}${labelText}` : labelText}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((entry, idx) => {
          const rawVal = Number(entry.value ?? 0)
          const rawName = String(entry.name ?? entry.dataKey ?? '')
          const [formattedVal, formattedName] = valueFormatter
            ? valueFormatter(rawVal, rawName)
            : [String(entry.value ?? 0), rawName]

          return (
            <div key={idx} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-zinc-300">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: entry.color || '#22d3ee' }}
                />
                <span>{formattedName}</span>
              </span>
              <span className="font-mono font-semibold text-zinc-100 tabular-nums [font-variant-numeric:tabular-nums]">
                {formattedVal}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
