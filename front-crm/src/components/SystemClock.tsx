import { useEffect, useState } from 'react'

function getClockString(now: Date = new Date()): string {
  const diaSemanaRaw = now.toLocaleDateString('pt-BR', { weekday: 'long' })
  const diaSemana = diaSemanaRaw.charAt(0).toUpperCase() + diaSemanaRaw.slice(1)
  const dataFormatada = now.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const horaFormatada = now.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  return `${diaSemana}, ${dataFormatada} · ${horaFormatada}`
}

export function SystemClock({ className = '' }: { className?: string }) {
  const [time, setTime] = useState<string>(() => getClockString())

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(getClockString())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <span
      className={`text-xs text-zinc-400 font-mono tracking-tight tabular-nums [font-variant-numeric:tabular-nums] select-none whitespace-nowrap ${className}`}
      title="Horário oficial do sistema OnePlay"
    >
      {time}
    </span>
  )
}

export default SystemClock
