import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'

interface ClockSnapshot {
  dateLabel: string
  weekdayShort: string
  timeLabel: string
}

function getClockSnapshot(now: Date = new Date()): ClockSnapshot {
  const weekdayRaw = now.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  const weekdayShort = weekdayRaw.charAt(0).toUpperCase() + weekdayRaw.slice(1)

  const dateLabel = now.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })

  const timeLabel = now.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  return { dateLabel, weekdayShort, timeLabel }
}

export function SystemClock({ className = '' }: { className?: string }) {
  const [snapshot, setSnapshot] = useState<ClockSnapshot>(() => getClockSnapshot())

  useEffect(() => {
    const timer = setInterval(() => {
      setSnapshot(getClockSnapshot())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.03] px-3 py-1.5 text-xs font-mono tabular-nums [font-variant-numeric:tabular-nums] select-none whitespace-nowrap shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] ${className}`}
      title="Relógio oficial em tempo real — OnePlay CRM"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.85)] animate-pulse shrink-0" />
      <Clock className="h-3.5 w-3.5 text-cyan-400 shrink-0 hidden sm:block" />
      <span className="hidden lg:inline text-zinc-400 font-medium">
        {snapshot.weekdayShort}, {snapshot.dateLabel}
      </span>
      <span className="hidden sm:inline lg:hidden text-zinc-400 font-medium">
        {snapshot.dateLabel}
      </span>
      <span className="hidden sm:inline text-white/15">|</span>
      <span className="font-semibold text-zinc-100 tracking-tight">
        {snapshot.timeLabel}
      </span>
    </div>
  )
}

export default SystemClock
