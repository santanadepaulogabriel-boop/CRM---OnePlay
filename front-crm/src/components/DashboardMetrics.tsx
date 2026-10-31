import React, { useEffect } from 'react'
import { Users, UserCheck, CreditCard, ShieldCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCrmStore } from '../stores/useCrmStore'
import { isMasterUser } from '../lib/multiTenant'

export interface DashboardMetricsProps {
  totalClientes?: number
  clientesAtivos?: number
  creditosDisponiveis?: number | string
  statusSistema?: string
}

export const DashboardMetrics: React.FC<DashboardMetricsProps> = ({
  totalClientes: totalClientesProp,
  clientesAtivos: clientesAtivosProp,
  creditosDisponiveis: creditosDisponiveisProp,
  statusSistema: statusSistemaProp,
}) => {
  const { usuario } = useAuth()
  const clientesStore = useCrmStore((s) => s.clientes)
  const creditosStore = useCrmStore((s) => s.creditos)
  const carregarClientes = useCrmStore((s) => s.carregarClientes)
  const carregarCreditos = useCrmStore((s) => s.carregarCreditos)

  const isMaster = isMasterUser(usuario)

  useEffect(() => {
    if (totalClientesProp === undefined && clientesStore.length === 0 && usuario?.id) {
      void carregarClientes()
    }
    if (creditosDisponiveisProp === undefined && creditosStore === null && usuario?.id) {
      void carregarCreditos()
    }
  }, [
    totalClientesProp,
    creditosDisponiveisProp,
    clientesStore.length,
    creditosStore,
    usuario?.id,
    carregarClientes,
    carregarCreditos,
  ])

  const assinantesStore = clientesStore.filter(
    (c) => String(c.estagio_funil ?? '').trim().toLowerCase() !== 'lead'
  )

  const computedAtivos = assinantesStore.filter((c) => {
    const st = String(c.Status ?? c.status ?? '').trim().toLowerCase()
    return st === 'ativo' || st === 'alerta' || st === 'alerta_vencimento'
  }).length

  const totalClientes = totalClientesProp ?? assinantesStore.length
  const clientesAtivos = clientesAtivosProp ?? computedAtivos

  const resolvedCreditos: number | string = (() => {
    if (isMaster) {
      if (
        creditosDisponiveisProp === undefined ||
        creditosDisponiveisProp === 999 ||
        creditosDisponiveisProp === '999' ||
        creditosDisponiveisProp === 'Ilimitado'
      ) {
        return 'Ilimitado'
      }
      return creditosDisponiveisProp
    }
    if (creditosDisponiveisProp !== undefined) {
      return creditosDisponiveisProp
    }
    return typeof creditosStore === 'number'
      ? creditosStore
      : Number(usuario?.creditos ?? 0)
  })()

  const resolvedStatusSistema = (() => {
    if (
      !statusSistemaProp ||
      statusSistemaProp === 'Protegido (RLS)' ||
      statusSistemaProp.toLowerCase().includes('rls')
    ) {
      return isMaster ? 'Master Enterprise' : 'Carteira Exclusiva'
    }
    return statusSistemaProp
  })()

  const isCreditosNumerico = typeof resolvedCreditos === 'number' && Number.isFinite(resolvedCreditos)

  return (
    <section
      aria-label="Resumo comercial da operação"
      className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8"
    >
      {/* 1. Cartão: Total de Clientes */}
      <article className="glass-card neon-hover group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl p-5">
        <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-radial from-cyan-500/12 to-transparent" />

        <div className="relative z-10">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
              Total de Clientes
            </p>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.14)]">
              <Users className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-3.5 flex min-h-[2.25rem] items-center">
            <h3 className="text-3xl font-bold leading-none tracking-tight text-zinc-50 whitespace-nowrap tabular-nums [font-variant-numeric:tabular-nums]">
              {totalClientes.toLocaleString('pt-BR')}
            </h3>
          </div>
        </div>

        <div className="relative z-10 mt-4 flex items-center gap-2 border-t border-white/[0.07] pt-3">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400/80" />
          <span className="text-xs leading-snug text-zinc-400">
            Base total de assinantes
          </span>
        </div>
      </article>

      {/* 2. Cartão: Clientes Ativos */}
      <article className="glass-card neon-hover group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl p-5">
        <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-radial from-emerald-500/12 to-transparent" />

        <div className="relative z-10">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
              Clientes Ativos
            </p>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.14)]">
              <UserCheck className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-3.5 flex min-h-[2.25rem] items-center">
            <h3 className="text-3xl font-bold leading-none tracking-tight text-zinc-50 whitespace-nowrap tabular-nums [font-variant-numeric:tabular-nums]">
              {clientesAtivos.toLocaleString('pt-BR')}
            </h3>
          </div>
        </div>

        <div className="relative z-10 mt-4 flex items-center gap-2 border-t border-white/[0.07] pt-3">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400/80" />
          <span className="text-xs leading-snug text-zinc-400">
            Receita recorrente ativa
          </span>
        </div>
      </article>

      {/* 3. Cartão: Créditos em Conta */}
      <article className="glass-card neon-hover group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl p-5">
        <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-radial from-amber-500/12 to-transparent" />

        <div className="relative z-10">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
              Créditos em Conta
            </p>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.14)]">
              <CreditCard className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-3.5 flex min-h-[2.25rem] items-baseline gap-2">
            {isCreditosNumerico ? (
              <>
                <h3 className="text-3xl font-bold leading-none tracking-tight text-zinc-50 whitespace-nowrap tabular-nums [font-variant-numeric:tabular-nums]">
                  {(resolvedCreditos as number).toLocaleString('pt-BR')}
                </h3>
                <span className="text-xs font-medium text-zinc-400 whitespace-nowrap">
                  {(resolvedCreditos as number) === 1 ? 'crédito' : 'créditos'}
                </span>
              </>
            ) : (
              <h3 className="self-center text-[1.35rem] font-bold leading-none tracking-tight text-zinc-50 whitespace-nowrap">
                {String(resolvedCreditos)}
              </h3>
            )}
          </div>
        </div>

        <div className="relative z-10 mt-4 flex items-center gap-2 border-t border-white/[0.07] pt-3">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/80" />
          <span className="text-xs leading-snug text-zinc-400">
            Disponível para emissão
          </span>
        </div>
      </article>

      {/* 4. Cartão: Modo de Governança */}
      <article className="glass-card neon-hover group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl p-5">
        <div className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-radial from-indigo-500/12 to-transparent" />

        <div className="relative z-10">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
              Modo de Governança
            </p>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-400 shadow-[0_0_16px_rgba(99,102,241,0.16)]">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-3.5 flex min-h-[2.25rem] items-center min-w-0">
            <h3 className="text-[1.35rem] font-bold leading-none tracking-tight text-zinc-50 whitespace-nowrap">
              {resolvedStatusSistema}
            </h3>
          </div>
        </div>

        <div className="relative z-10 mt-4 flex items-center gap-2 border-t border-white/[0.07] pt-3">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400/80" />
          <span className="text-xs leading-snug text-zinc-400">
            {isMaster
              ? 'Gestão corporativa e carteira blindada'
              : 'Operação dedicada e carteira blindada'}
          </span>
        </div>
      </article>
    </section>
  )
}

export default DashboardMetrics
