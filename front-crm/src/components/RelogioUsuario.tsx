import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

/**
 * Formata a data no padrão exato solicitado:
 * [Dia da semana], [DD/MM/AAAA] às [HH:mm]
 * Exemplo: 'Quarta-feira, 24/10/2026 às 14:30'
 */
export function formatarDataRelogio(data: Date = new Date()): string {
  const diaSemanaRaw = data.toLocaleDateString('pt-BR', { weekday: 'long' })
  const diaSemana = diaSemanaRaw.charAt(0).toUpperCase() + diaSemanaRaw.slice(1)

  const dia = String(data.getDate()).padStart(2, '0')
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const ano = data.getFullYear()

  const horas = String(data.getHours()).padStart(2, '0')
  const minutos = String(data.getMinutes()).padStart(2, '0')

  return `${diaSemana}, ${dia}/${mes}/${ano} às ${horas}:${minutos}`
}

/**
 * Componente de Relógio Dinâmico que atualiza a cada minuto,
 * exibido acima da identificação do perfil do usuário logado.
 */
export function RelogioUsuario({ className = '' }: { className?: string }) {
  const { usuario } = useAuth()
  const [dataHoraFormatada, setDataHoraFormatada] = useState(() => formatarDataRelogio(new Date()))

  useEffect(() => {
    const atualizar = () => {
      setDataHoraFormatada(formatarDataRelogio(new Date()))
    }

    const timer = setInterval(atualizar, 30000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-tight text-cyan-300/90 tabular-nums [font-variant-numeric:tabular-nums]">
        <Clock className="h-3 w-3 shrink-0 text-cyan-400 animate-pulse" />
        <span className="truncate">{dataHoraFormatada}</span>
      </div>

      <div className="flex items-center justify-between text-xs pt-1 border-t border-white/5">
        <div className="flex items-center gap-2 truncate">
          <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse shrink-0" />
          <div className="truncate">
            <p className="text-xs font-semibold text-zinc-100 truncate">
              {usuario?.nome
                ? `${usuario.nome} - ${usuario.nivel_acesso || 'Revendedor'}`
                : 'Gabriel Paulo - Master'}
            </p>
            <p className="text-[10px] text-zinc-400 truncate">
              {usuario?.email || 'sessao@oneplay.com'}
            </p>
          </div>
        </div>
        <span className="text-[10px] text-cyan-400/90 font-mono font-semibold shrink-0 uppercase">
          {usuario?.nivel_acesso === 'Master' ? 'ADM' : 'REV'}
        </span>
      </div>
    </div>
  )
}

export default RelogioUsuario
