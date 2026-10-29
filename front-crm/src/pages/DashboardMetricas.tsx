import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertCircle,
  ArrowUpDown,
  BarChart3,
  CheckCircle2,
  Coins,
  Crown,
  DollarSign,
  FlaskConical,
  Percent,
  Receipt,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useCrmStore } from '../stores/useCrmStore'
import {
  fetchClientesMultiTenant,
  fetchFaturasMultiTenant,
  getSafeHomeRoute,
  isMasterUser,
} from '../lib/multiTenant'
import {
  EmptyState,
  GlassChartTooltip,
  StatusBadge,
} from '../components/ui/TierOnePrimitives'

const COL = {
  nome: 'nome_completo',
  plano: 'plano',
  valor: 'valor_mensal',
  vencimento: 'data_vencimento',
  status: 'status',
  estagio: 'estagio_funil',
} as const

type Row = Record<string, unknown> & { id: string | number }

interface AgenteRow {
  id: string
  nome?: string | null
  email?: string | null
  telefone?: string | null
  nivel_acesso?: string | null
  creditos?: number | null
}

interface HistoricoMrrPoint {
  label: string
  sortKey: string
  mrr: number
  clientesAtivos?: number
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const DAY_MS = 86_400_000

const PLANO_CORES: Record<string, string> = {
  Mensal: '#22d3ee',
  Trimestral: '#a78bfa',
  Anual: '#34d399',
  Outros: '#38bdf8',
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase()
const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function classificarPlano(v: unknown): 'Mensal' | 'Trimestral' | 'Anual' | 'Outros' {
  const p = norm(v)
  if (p.includes('trimest')) return 'Trimestral'
  if (p.includes('anual')) return 'Anual'
  if (p.includes('mensal')) return 'Mensal'
  return 'Outros'
}

function formatHistoricoLabel(raw: unknown, idx: number): { label: string; sortKey: string } {
  const str = String(raw ?? '').trim()
  if (!str) {
    return { label: `#${idx + 1}`, sortKey: String(idx).padStart(6, '0') }
  }

  // Formato YYYY-MM
  if (/^\d{4}-\d{2}$/.test(str)) {
    const [y, m] = str.split('-')
    return { label: `${m}/${y.slice(2)}`, sortKey: str }
  }

  // Formato ISO ou YYYY-MM-DD
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    const iso = parsed.toISOString()
    const dia = String(parsed.getDate()).padStart(2, '0')
    const mes = String(parsed.getMonth() + 1).padStart(2, '0')
    return { label: `${dia}/${mes}`, sortKey: iso }
  }

  return { label: str, sortKey: str }
}

const glassSurface =
  'relative overflow-hidden rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.4)]'

const kpiCardClass =
  'group relative overflow-hidden rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl p-5 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]'

function MetricasSkeleton({ isMaster }: { isMaster: boolean }) {
  return (
    <div className="space-y-8">
      <div className="h-12 w-full rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl animate-pulse" />

      {isMaster && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="h-3.5 w-28 rounded bg-white/10 animate-pulse" />
                  <div className="h-9 w-9 rounded-xl bg-white/10 animate-pulse" />
                </div>
                <div className="h-8 w-36 rounded bg-white/10 animate-pulse" />
                <div className="h-3 w-44 rounded bg-white/5 animate-pulse" />
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl p-6 space-y-4">
            <div className="h-4 w-56 rounded bg-white/10 animate-pulse" />
            <div className="h-72 w-full rounded-xl bg-white/5 animate-pulse" />
          </div>

          <div className="rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl p-6 space-y-3">
            <div className="h-4 w-48 rounded bg-white/10 animate-pulse" />
            {[1, 2, 3, 4].map((row) => (
              <div key={row} className="h-12 w-full rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        </>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl p-5 space-y-3"
          >
            <div className="h-3.5 w-24 rounded bg-white/10 animate-pulse" />
            <div className="h-8 w-32 rounded bg-white/10 animate-pulse" />
            <div className="h-3 w-40 rounded bg-white/5 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}

interface MetricasCachePayload {
  clientes?: Row[]
  faturas?: Row[]
  agentes?: AgenteRow[]
  historicoMrr?: Record<string, unknown>[]
  historicoMrrFonte?: 'tabela' | 'derivado'
  rpcData?: unknown
  timestamp?: number
}

export default function DashboardMetricas() {
  const { usuario, loading: loadingAuth } = useAuth()
  const [clientes, setClientes] = useState<Row[]>([])
  const [faturas, setFaturas] = useState<Row[]>([])
  const [agentes, setAgentes] = useState<AgenteRow[]>([])
  const [historicoMrrRows, setHistoricoMrrRows] = useState<Record<string, unknown>[]>([])
  const [historicoMrrFonte, setHistoricoMrrFonte] = useState<'tabela' | 'derivado'>('tabela')
  const [referenceNow, setReferenceNow] = useState<number>(() => Date.now())
  const [rankingSort, setRankingSort] = useState<'ativos' | 'ltv'>('ativos')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCached, setIsCached] = useState(false)

  const isMaster = isMasterUser(usuario)

  const carregar = useCallback(
    async (forcar = false) => {
      if (loadingAuth) return

      if (!usuario || !isMasterUser(usuario)) {
        setClientes([])
        setFaturas([])
        setAgentes([])
        setHistoricoMrrRows([])
        setLoading(false)
        return
      }

      const QUINZE_MINUTOS_MS = 15 * 60 * 1000
      const storeState = useCrmStore.getState()
      const cacheAtual = storeState.metricasCache as MetricasCachePayload | null
      const ultimoFetch = storeState.lastFetchMetricas
      const agora = Date.now()
      setReferenceNow(agora)

      const userRole = 'master'
      const masterSession = true

      if (
        !forcar &&
        cacheAtual &&
        ultimoFetch &&
        agora - ultimoFetch < QUINZE_MINUTOS_MS &&
        (!masterSession || Array.isArray(cacheAtual.agentes))
      ) {
        if (Array.isArray(cacheAtual.clientes)) {
          setClientes(cacheAtual.clientes as Row[])
          storeState.setClientes(cacheAtual.clientes)
        }
        if (Array.isArray(cacheAtual.faturas)) {
          setFaturas(cacheAtual.faturas as Row[])
        }
        if (Array.isArray(cacheAtual.agentes)) {
          setAgentes(cacheAtual.agentes as AgenteRow[])
        }
        if (Array.isArray(cacheAtual.historicoMrr)) {
          setHistoricoMrrRows(cacheAtual.historicoMrr as Record<string, unknown>[])
          setHistoricoMrrFonte(cacheAtual.historicoMrrFonte === 'derivado' ? 'derivado' : 'tabela')
        }
        setIsCached(true)
        setLoading(false)
        setError(null)
        return
      }

      setLoading(true)
      setError(null)
      setIsCached(false)

      try {
        let rpcData: unknown = null
        try {
          const { data: rpcRes, error: rpcErr } = await supabase.rpc('obter_metricas_saas')
          if (!rpcErr && rpcRes) {
            rpcData = rpcRes
          }
        } catch (rpcErr) {
          console.warn('RPC obter_metricas_saas indisponível:', rpcErr)
        }

        const userId = usuario?.id
        const { data: cliRows, error: cliError } = await fetchClientesMultiTenant(userRole, userId)
        if (cliError) {
          throw new Error(`Erro ao carregar clientes: ${cliError.message}`)
        }

        setClientes(cliRows as Row[])
        useCrmStore.getState().setClientes(cliRows)

        const ids = cliRows.map((c) => c?.id).filter(Boolean) as (string | number)[]
        const { data: fatData, error: fatError } = await fetchFaturasMultiTenant(
          userRole,
          userId,
          ids
        )
        if (fatError) {
          console.warn('Aviso ao carregar faturas no Supabase:', fatError)
        }
        const faturasCarregadas = (fatData || []) as Row[]
        setFaturas(faturasCarregadas)

        let agentesCarregados: AgenteRow[] = []
        let mrrRowsCarregadas: Record<string, unknown>[] = []
        let fonteMrr: 'tabela' | 'derivado' = 'derivado'

        if (masterSession) {
          const [agentesRes, histMrrRes] = await Promise.all([
            supabase
              .from('agentes')
              .select('id, nome, email, telefone, nivel_acesso, creditos'),
            supabase.from('historico_mrr').select('*'),
          ])

          if (!agentesRes.error && Array.isArray(agentesRes.data)) {
            agentesCarregados = agentesRes.data as AgenteRow[]
          }
          setAgentes(agentesCarregados)

          if (!histMrrRes.error && Array.isArray(histMrrRes.data) && histMrrRes.data.length > 0) {
            mrrRowsCarregadas = histMrrRes.data as Record<string, unknown>[]
            fonteMrr = 'tabela'
          }
          setHistoricoMrrRows(mrrRowsCarregadas)
          setHistoricoMrrFonte(fonteMrr)
        }

        const timestampNovo = Date.now()
        setReferenceNow(timestampNovo)
        useCrmStore.getState().setMetricasCache(
          {
            clientes: cliRows,
            faturas: faturasCarregadas,
            agentes: agentesCarregados,
            historicoMrr: mrrRowsCarregadas,
            historicoMrrFonte: fonteMrr,
            rpcData,
            timestamp: timestampNovo,
          },
          timestampNovo
        )
        setIsCached(true)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('Falha ao obter métricas do Supabase:', msg, err)
        setClientes([])
        setFaturas([])
        useCrmStore.getState().setClientes([])
        setError(msg || 'Ocorreu um erro ao conectar ao banco de dados.')
      } finally {
        setLoading(false)
      }
    },
    [usuario, loadingAuth]
  )

  useEffect(() => {
    void carregar()
  }, [carregar])

  const m = useMemo(() => {
    const clientesLista = Array.isArray(clientes) ? clientes : []
    const faturasLista = Array.isArray(faturas) ? faturas : []

    const ativos = clientesLista.filter((c) => {
      const st = norm(c?.Status ?? c?.[COL.status] ?? c?.status)
      return st === 'ativo'
    })

    const mrr = clientesLista.reduce((acc, c) => {
      const st = norm(c?.Status ?? c?.[COL.status] ?? c?.status)
      if (st === 'ativo') {
        return acc + num(c?.valor_mensal ?? c?.[COL.valor])
      }
      return acc
    }, 0)

    const emTeste = clientesLista.filter(
      (c) => norm(c?.[COL.estagio]) === 'teste' || norm(c?.[COL.status]) === 'teste'
    ).length

    const totalLeads = clientesLista.length
    const leadsConvertidos = clientesLista.filter((c) => {
      const estagio = norm(c?.[COL.estagio])
      const status = norm(c?.Status ?? c?.[COL.status] ?? c?.status)
      return (
        estagio === 'cliente' ||
        (status === 'ativo' &&
          !['lead', 'teste', 'follow_up', 'followup', 'negociacao'].includes(estagio))
      )
    }).length
    const conversao = totalLeads > 0 ? (leadsConvertidos / totalLeads) * 100 : 0

    // Receita por dia (faturas pagas)
    const porDia = new Map<string, number>()
    faturasLista
      .filter((f) => norm(f?.status) === 'pago')
      .forEach((f) => {
        const raw = (f?.data_pagamento ?? f?.data_vencimento ?? f?.created_at) as
          | string
          | undefined
        if (!raw) return
        const d = new Date(raw)
        if (isNaN(d.getTime())) return
        const key = d.toISOString().slice(0, 10)
        porDia.set(key, (porDia.get(key) ?? 0) + num(f?.valor))
      })

    const diasOrdenados = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b))
    const receita = diasOrdenados.reduce<
      { dia: string; ano: string; valor: number; acumulado: number }[]
    >((acc, [dia, valor]) => {
      const anterior = acc.length > 0 ? acc[acc.length - 1].acumulado : 0
      const novoAcumulado = anterior + valor
      const partes = dia.split('-')
      acc.push({
        dia: `${partes[2] || ''}/${partes[1] || ''}`,
        ano: partes[0] || '',
        valor: valor || 0,
        acumulado: novoAcumulado || 0,
      })
      return acc
    }, [])

    // Distribuição por plano (para BarChart com topo arredondado)
    const planos = new Map<string, number>()
    clientesLista.forEach((c) => {
      const k = classificarPlano(c?.[COL.plano])
      planos.set(k, (planos.get(k) ?? 0) + 1)
    })
    const distribuicao = [...planos.entries()].map(([name, value]) => ({
      name,
      value: value || 0,
    }))

    // Inadimplência
    const vencidos = clientesLista
      .filter((c) => {
        const st = norm(c?.Status ?? c?.[COL.status] ?? c?.status)
        if (st === 'vencido' || st === 'inativo') return true
        if (st !== 'ativo') return false
        const v = c?.[COL.vencimento] ? new Date(String(c?.[COL.vencimento])).getTime() : NaN
        return !isNaN(v) && v < referenceNow
      })
      .map((c, idx) => {
        const v = c?.[COL.vencimento] ? new Date(String(c?.[COL.vencimento])).getTime() : NaN
        return {
          id: c?.id ?? `venc-${idx}`,
          nome: String(c?.[COL.nome] ?? c?.nome ?? 'Sem nome'),
          plano: classificarPlano(c?.[COL.plano]),
          valor: num(c?.[COL.valor]),
          dias: isNaN(v) ? 0 : Math.max(0, Math.floor((referenceNow - v) / DAY_MS)),
        }
      })
      .sort((a, b) => (b.valor || 0) - (a.valor || 0))

    const perdido = vencidos.reduce((s, c) => s + (c.valor || 0), 0)

    return {
      mrr: mrr || 0,
      emTeste: emTeste || 0,
      conversao: conversao || 0,
      receita,
      distribuicao,
      vencidos,
      perdido: perdido || 0,
      ativos: ativos.length || 0,
    }
  }, [clientes, faturas, referenceNow])

  // Inteligência Executiva Master: Créditos em Circulação, Curva historico_mrr e Ranking LTV
  const masterIntel = useMemo(() => {
    if (!isMaster) {
      return {
        creditosEmCirculacao: 0,
        totalRevendedores: 0,
        serieMrr: [] as HistoricoMrrPoint[],
        topRevendedores: [] as {
          id: string
          nome: string
          email: string
          creditos: number
          clientesAtivos: number
          totalCarteira: number
          mrrCarteira: number
          ltv: number
        }[],
      }
    }

    const revendedores = agentes.filter((a) => norm(a.nivel_acesso) !== 'master')
    const creditosEmCirculacao = revendedores.reduce(
      (acc, r) => acc + Math.max(0, num(r.creditos)),
      0
    )

    // 1. Série de Evolução Financeira consumindo historico_mrr (com fallback inteligente)
    let serieMrr: HistoricoMrrPoint[] = []
    if (historicoMrrRows.length > 0) {
      serieMrr = historicoMrrRows
        .map((row, idx) => {
          const rawLabel =
            row.mes_referencia ??
            row.mes ??
            row.referencia ??
            row.periodo ??
            row.data ??
            row.data_registro ??
            row.created_at
          const { label, sortKey } = formatHistoricoLabel(rawLabel, idx)
          const valorMrr = num(
            row.mrr ??
              row.valor_mrr ??
              row.valor ??
              row.receita ??
              row.receita_mensal ??
              row.total
          )
          const cliCount = num(row.clientes_ativos ?? row.total_clientes ?? 0)
          return {
            label,
            sortKey,
            mrr: valorMrr,
            clientesAtivos: cliCount > 0 ? cliCount : undefined,
          }
        })
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    } else {
      const porMes = new Map<string, number>()
      faturas
        .filter((f) => norm(f?.status) === 'pago')
        .forEach((f) => {
          const raw = (f?.data_pagamento ?? f?.data_vencimento ?? f?.created_at) as
            | string
            | undefined
          if (!raw) return
          const d = new Date(raw)
          if (isNaN(d.getTime())) return
          const ym = d.toISOString().slice(0, 7)
          porMes.set(ym, (porMes.get(ym) ?? 0) + num(f?.valor))
        })

      const mesesOrdenados = [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b))
      serieMrr = mesesOrdenados.map(([ym, totalMes], idx) => {
        const { label, sortKey } = formatHistoricoLabel(ym, idx)
        return { label, sortKey, mrr: totalMes }
      })

      if (m.mrr > 0 || serieMrr.length === 0) {
        serieMrr.push({
          label: 'MRR Atual',
          sortKey: '9999-99',
          mrr: m.mrr,
          clientesAtivos: m.ativos,
        })
      }
    }

    // 2. Ranking de Parceiros (LTV) — Top Revendedores
    const clienteOwnerMap = new Map<string, string>()
    clientes.forEach((c) => {
      const ownerId = String(c?.tenant_id ?? c?.vendedor_id ?? c?.agente_id ?? '').trim()
      if (ownerId && c?.id !== undefined) {
        clienteOwnerMap.set(String(c.id), ownerId)
      }
    })

    const rankingBase = revendedores.map((rev) => {
      const revId = String(rev.id)
      const carteira = clientes.filter((c) => {
        const owner = String(c?.tenant_id ?? c?.vendedor_id ?? c?.agente_id ?? '').trim()
        return owner === revId
      })

      const ativosParceiro = carteira.filter(
        (c) => norm(c?.Status ?? c?.[COL.status] ?? c?.status) === 'ativo'
      )

      const mrrCarteira = ativosParceiro.reduce(
        (acc, c) => acc + num(c?.valor_mensal ?? c?.[COL.valor]),
        0
      )

      const faturasPagas = faturas.reduce((acc, f) => {
        if (norm(f?.status) !== 'pago') return acc
        const fatOwner = String(
          f?.tenant_id ??
            f?.vendedor_id ??
            f?.agente_id ??
            (f?.cliente_id !== undefined ? clienteOwnerMap.get(String(f.cliente_id)) : '') ??
            ''
        ).trim()
        if (fatOwner === revId) {
          return acc + num(f?.valor)
        }
        return acc
      }, 0)

      const ltv = Math.max(faturasPagas, mrrCarteira)

      return {
        id: revId,
        nome: String(rev.nome || 'Revendedor'),
        email: String(rev.email || '—'),
        creditos: Math.max(0, num(rev.creditos)),
        clientesAtivos: ativosParceiro.length,
        totalCarteira: carteira.length,
        mrrCarteira,
        ltv,
      }
    })

    const topRevendedores = [...rankingBase].sort((a, b) => {
      if (rankingSort === 'ltv') {
        return b.ltv - a.ltv || b.clientesAtivos - a.clientesAtivos
      }
      return b.clientesAtivos - a.clientesAtivos || b.ltv - a.ltv
    })

    return {
      creditosEmCirculacao,
      totalRevendedores: revendedores.length,
      serieMrr,
      topRevendedores,
    }
  }, [isMaster, agentes, historicoMrrRows, faturas, clientes, m.mrr, m.ativos, rankingSort])

  const lastFetch = useCrmStore((s) => s.lastFetchMetricas)
  const minutosDesdeSync = lastFetch
    ? Math.max(0, Math.floor((referenceNow - lastFetch) / 60000))
    : 0

  if (!loadingAuth && usuario && !isMaster) {
    return <Navigate to={getSafeHomeRoute(usuario)} replace />
  }

  if (loading) {
    return <MetricasSkeleton isMaster={isMaster} />
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 backdrop-blur-2xl px-4 py-3 text-xs text-red-400">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void carregar(true)}
            className="flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/15 px-3 py-1.5 font-medium text-red-200 transition-all duration-300 hover:-translate-y-0.5 hover:bg-red-500/25"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Tentar novamente</span>
          </button>
        </div>
      )}

      {/* Barra de Sincronização & Cache (15 min) */}
      <div className={`${glassSurface} flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 text-xs`}>
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
          <span className="text-zinc-400">
            Sincronização de dados:{' '}
            <strong className="font-medium text-zinc-100 tabular-nums [font-variant-numeric:tabular-nums]">
              {lastFetch ? `há ${minutosDesdeSync} min` : 'tempo real'}
            </strong>
          </span>
          <StatusBadge
            variant={isCached ? 'teste' : 'ativo'}
            label={isCached ? 'Cache Ativo (15m)' : 'Ao Vivo'}
            showDot={false}
          />
        </div>

        <button
          type="button"
          onClick={() => void carregar(true)}
          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-zinc-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-200 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
        >
          <RefreshCw className="h-3.5 w-3.5 text-cyan-400" />
          <span>Atualizar Agora</span>
        </button>
      </div>

      {/* =================================================================== */}
      {/* MÓDULO DE INTELIGÊNCIA EXECUTIVA — EXCLUSIVO PAINEL MASTER          */}
      {/* =================================================================== */}
      {isMaster && (
        <section className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
                Métricas Globais de SaaS
              </h2>
            </div>
            <span className="text-xs text-zinc-400">
              Consolidado em tempo real de toda a plataforma e rede de revendas
            </span>
          </div>

          {/* 1. 3 KpiCards Globais de Destaque com Ambient Glows + Neon Hover */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className={kpiCardClass}>
              <div className="pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full bg-radial from-cyan-500/10 to-transparent" />
              <div className="relative flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-400">MRR Global</span>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.18)]">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <div className="relative mt-3 text-3xl font-semibold tracking-tight text-zinc-100 font-mono tabular-nums [font-variant-numeric:tabular-nums]">
                {brl.format(m.mrr)}
              </div>
              <p className="relative mt-1.5 text-xs text-zinc-400">
                Receita Mensal Recorrente Total da plataforma
              </p>
            </div>

            <div className={kpiCardClass}>
              <div className="pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full bg-radial from-cyan-500/10 to-transparent" />
              <div className="relative flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-400">Total de Clientes Ativos</span>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.18)]">
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <div className="relative mt-3 text-3xl font-semibold tracking-tight text-zinc-100 font-mono tabular-nums [font-variant-numeric:tabular-nums]">
                {m.ativos}
              </div>
              <p className="relative mt-1.5 text-xs text-zinc-400 tabular-nums">
                Assinaturas ativas somando direta + parceiros ({clientes.length} registros totais)
              </p>
            </div>

            <div className={kpiCardClass}>
              <div className="pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full bg-radial from-cyan-500/10 to-transparent" />
              <div className="relative flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-400">Créditos em Circulação</span>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400 shadow-[0_0_16px_rgba(251,191,36,0.18)]">
                  <Coins className="h-4 w-4" />
                </div>
              </div>
              <div className="relative mt-3 text-3xl font-semibold tracking-tight text-zinc-100 font-mono tabular-nums [font-variant-numeric:tabular-nums]">
                {masterIntel.creditosEmCirculacao}{' '}
                <span className="text-sm font-sans font-normal text-zinc-400">créditos</span>
              </div>
              <p className="relative mt-1.5 text-xs text-zinc-400 tabular-nums">
                Saldo disponível distribuído entre {masterIntel.totalRevendedores} revendedor(es)
              </p>
            </div>
          </div>

          {/* 2. Gráfico de Evolução Financeira (<AreaChart> + linearGradient Ciano -> Transparente) */}
          <div className={`${glassSurface} p-6`}>
            <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-radial from-cyan-500/10 to-transparent" />

            <div className="relative mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <TrendingUp className="h-4 w-4 text-cyan-400" />
                  <h3 className="text-sm font-semibold tracking-tight text-zinc-100">
                    Evolução Financeira (MRR)
                  </h3>
                  <StatusBadge
                    variant="teste"
                    label={historicoMrrFonte === 'tabela' ? 'Histórico MRR' : 'Série Consolidada'}
                  />
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Curva de crescimento da receita mensal recorrente ao longo do tempo
                </p>
              </div>
            </div>

            <div className="relative h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={masterIntel.serieMrr}
                  margin={{ top: 10, right: 16, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gradMrrMaster" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.38} />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="none" />
                  <XAxis
                    dataKey="label"
                    stroke="#71717a"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ stroke: 'rgba(34,211,238,0.25)', strokeWidth: 1 }}
                    content={({ active, payload, label }) => (
                      <GlassChartTooltip
                        active={active}
                        payload={payload}
                        label={label}
                        labelPrefix="Período: "
                        valueFormatter={(val) => [brl.format(val || 0), 'MRR']}
                      />
                    )}
                  />
                  <Area
                    type="monotone"
                    dataKey="mrr"
                    name="MRR"
                    stroke="#22d3ee"
                    strokeWidth={2.5}
                    fill="url(#gradMrrMaster)"
                    activeDot={{
                      r: 5,
                      fill: '#22d3ee',
                      stroke: '#030509',
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 3. Ranking de Parceiros (LTV) — Top Revendedores */}
          <div className={glassSurface}>
            <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-radial from-cyan-500/10 to-transparent" />

            <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-6 border-b border-white/5">
              <div>
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-400" />
                  <h3 className="text-sm font-semibold tracking-tight text-zinc-100">
                    Top Revendedores — Ranking de Parceiros (LTV)
                  </h3>
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Desempenho da rede ordenado por clientes ativos e faturamento total gerado (Life Time Value)
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() =>
                    setRankingSort((prev) => (prev === 'ativos' ? 'ltv' : 'ativos'))
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                >
                  <ArrowUpDown className="h-3.5 w-3.5 text-cyan-400" />
                  <span>
                    Ordenando por: {rankingSort === 'ativos' ? 'Clientes Ativos' : 'Maior LTV'}
                  </span>
                </button>
                <Link
                  to="/revendas"
                  className="inline-flex items-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1.5 text-xs font-medium text-cyan-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/50 hover:bg-cyan-500/20 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                >
                  Gerir Revendas
                </Link>
              </div>
            </div>

            {masterIntel.topRevendedores.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={Trophy}
                  title="Sua rede de revendedores está pronta para crescer"
                  description="Cadastre seu primeiro revendedor parceiro em Gestão de Revendas para acompanhar a evolução de clientes ativos, consumo de créditos e LTV."
                  action={
                    <Link
                      to="/revendas"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/15 px-4 py-2 text-xs font-semibold text-cyan-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/50 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                    >
                      <span>Cadastrar Primeiro Parceiro</span>
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="relative w-full overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/[0.02] text-xs font-semibold text-zinc-400">
                      <th className="p-4 w-16">#</th>
                      <th className="p-4">Parceiro</th>
                      <th className="p-4">Clientes Ativos</th>
                      <th className="p-4">Saldo</th>
                      <th className="p-4">MRR Carteira</th>
                      <th className="p-4 text-right">LTV (Total Gerado)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {masterIntel.topRevendedores.map((rev, index) => (
                      <tr
                        key={rev.id}
                        className="border-b border-white/5 hover:bg-white/[0.03] transition-colors"
                      >
                        <td className="p-4 text-xs font-mono text-zinc-400 tabular-nums">
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-lg border text-xs font-semibold tabular-nums ${
                              index === 0
                                ? 'border-amber-500/40 bg-amber-500/15 text-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.2)]'
                                : index === 1
                                ? 'border-white/20 bg-white/10 text-zinc-100'
                                : index === 2
                                ? 'border-orange-500/30 bg-orange-500/15 text-orange-300'
                                : 'border-white/10 bg-white/[0.02] text-zinc-400'
                            }`}
                          >
                            {index + 1}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="font-medium text-sm text-zinc-100">{rev.nome}</div>
                          <div className="text-xs text-zinc-500">{rev.email}</div>
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <StatusBadge
                            variant={rev.clientesAtivos > 0 ? 'ativo' : 'neutral'}
                            label={`${rev.clientesAtivos} ativo(s)`}
                          />
                          <span className="ml-2 text-xs text-zinc-500 tabular-nums">
                            de {rev.totalCarteira}
                          </span>
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-mono text-zinc-200 tabular-nums [font-variant-numeric:tabular-nums]">
                            {rev.creditos} créd.
                          </span>
                        </td>
                        <td className="p-4 text-sm font-mono text-zinc-200 tabular-nums [font-variant-numeric:tabular-nums] whitespace-nowrap">
                          {brl.format(rev.mrrCarteira)}
                        </td>
                        <td className="p-4 text-right whitespace-nowrap">
                          <span className="inline-flex items-center rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold font-mono text-emerald-400 tabular-nums [font-variant-numeric:tabular-nums]">
                            {brl.format(rev.ltv)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* =================================================================== */}
      {/* INDICADORES OPERACIONAIS & RETENÇÃO                                 */}
      {/* =================================================================== */}
      <section className="space-y-6">
        {isMaster && (
          <div className="pt-2 border-t border-white/5">
            <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
              Indicadores Operacionais de Aquisição &amp; Retenção
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Funil de testes, taxa de conversão, distribuição de planos e inadimplência
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className={kpiCardClass}>
            <div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-radial from-cyan-500/10 to-transparent" />
            <div className="relative flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">MRR Ativo</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            <div className="relative mt-3 text-2xl font-semibold tracking-tight text-zinc-100 font-mono tabular-nums [font-variant-numeric:tabular-nums]">
              {brl.format(m.mrr)}
            </div>
            <p className="relative mt-1 text-xs text-zinc-400 tabular-nums">
              {m.ativos} assinante(s) ativo(s)
            </p>
          </div>

          <div className={kpiCardClass}>
            <div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-radial from-cyan-500/10 to-transparent" />
            <div className="relative flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Leads em Teste</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-400">
                <FlaskConical className="h-4 w-4" />
              </div>
            </div>
            <div className="relative mt-3 text-2xl font-semibold tracking-tight text-zinc-100 font-mono tabular-nums [font-variant-numeric:tabular-nums]">
              {m.emTeste}
            </div>
            <p className="relative mt-1 text-xs text-zinc-400">
              Testes ativos aguardando fechamento
            </p>
          </div>

          <div className={kpiCardClass}>
            <div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-radial from-cyan-500/10 to-transparent" />
            <div className="relative flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Taxa de Conversão</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                <Percent className="h-4 w-4" />
              </div>
            </div>
            <div className="relative mt-3 text-2xl font-semibold tracking-tight text-zinc-100 font-mono tabular-nums [font-variant-numeric:tabular-nums]">
              {m.conversao.toFixed(1)}%
            </div>
            <p className="relative mt-1 text-xs text-zinc-400 tabular-nums">
              Convertidos sobre {clientes.length} oportunidade(s)
            </p>
          </div>

          <div className={kpiCardClass}>
            <div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-radial from-cyan-500/10 to-transparent" />
            <div className="relative flex items-center justify-between">
              <span className="text-xs font-medium text-zinc-400">Receita em Risco</span>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-400">
                <ShieldAlert className="h-4 w-4" />
              </div>
            </div>
            <div className="relative mt-3 text-2xl font-semibold tracking-tight text-zinc-100 font-mono tabular-nums [font-variant-numeric:tabular-nums]">
              {brl.format(m.perdido)}
            </div>
            <p className="relative mt-1 text-xs text-zinc-400 tabular-nums">
              {m.vencidos.length} assinatura(s) vencida(s)
            </p>
          </div>
        </div>

        {/* Gráficos Operacionais: AreaChart Acumulado + BarChart Arredondado */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className={`${glassSurface} p-6 lg:col-span-2`}>
            <div className="pointer-events-none absolute -top-14 -right-14 h-40 w-40 rounded-full bg-radial from-cyan-500/10 to-transparent" />

            <div className="relative mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold tracking-tight text-zinc-100">
                  Faturamento Acumulado (Faturas Pagas)
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Progressão diária de pagamentos confirmados
                </p>
              </div>
            </div>

            {m.receita.length === 0 ? (
              <EmptyState
                compact
                icon={Receipt}
                title="Sem faturas liquidadas no período"
                description="Converta oportunidades no Funil de Vendas ou renove assinaturas em Clientes & Renovações para alimentar a curva de faturamento."
                className="h-64 border-white/5 bg-white/[0.01] shadow-none"
              />
            ) : (
              <div className="relative h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={m.receita}
                    margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="gradReceita" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.38} />
                        <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="none" />
                    <XAxis
                      dataKey="dia"
                      stroke="#71717a"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ stroke: 'rgba(34,211,238,0.25)', strokeWidth: 1 }}
                      content={({ active, payload, label }) => (
                        <GlassChartTooltip
                          active={active}
                          payload={payload}
                          label={label}
                          labelPrefix="Dia "
                          valueFormatter={(val, name) => [
                            brl.format(val || 0),
                            name === 'acumulado' ? 'Acumulado' : 'No dia',
                          ]}
                        />
                      )}
                    />
                    <Area
                      type="monotone"
                      dataKey="acumulado"
                      name="acumulado"
                      stroke="#22d3ee"
                      strokeWidth={2.5}
                      fill="url(#gradReceita)"
                      activeDot={{
                        r: 5,
                        fill: '#22d3ee',
                        stroke: '#030509',
                        strokeWidth: 2,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className={`${glassSurface} p-6`}>
            <div className="pointer-events-none absolute -top-14 -right-14 h-40 w-40 rounded-full bg-radial from-cyan-500/10 to-transparent" />

            <div className="relative">
              <h3 className="text-sm font-semibold tracking-tight text-zinc-100">
                Assinantes por Plano
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5 mb-4">
                Volume da carteira ativa distribuído por recorrência
              </p>
            </div>

            {m.distribuicao.length === 0 ? (
              <EmptyState
                compact
                icon={BarChart3}
                title="Carteira aguardando assinantes"
                description="Adicione novos clientes em Clientes & Renovações para visualizar a proporção entre planos Mensal, Trimestral e Anual."
                className="h-64 border-white/5 bg-white/[0.01] shadow-none"
              />
            ) : (
              <div className="relative h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={m.distribuicao}
                    margin={{ top: 10, right: 8, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid stroke="none" />
                    <XAxis
                      dataKey="name"
                      stroke="#a1a1aa"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis hide />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                      content={({ active, payload, label }) => (
                        <GlassChartTooltip
                          active={active}
                          payload={payload}
                          label={label}
                          labelPrefix="Plano "
                          valueFormatter={(val) => [`${val} cliente(s)`, 'Assinantes']}
                        />
                      )}
                    />
                    <Bar dataKey="value" name="Assinantes" radius={[4, 4, 0, 0]} maxBarSize={44}>
                      {m.distribuicao.map((d) => (
                        <Cell key={d.name} fill={PLANO_CORES[d.name] ?? '#38bdf8'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Tabela de Inadimplência */}
        <div className={glassSurface}>
          <div className="flex flex-wrap items-center justify-between gap-3 p-6 border-b border-white/5">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-400" />
              <h3 className="text-sm font-semibold tracking-tight text-zinc-100">
                Inadimplência — Assinaturas Vencidas
              </h3>
            </div>
            <StatusBadge
              variant={m.vencidos.length > 0 ? 'vencido' : 'ativo'}
              label={`Impacto: ${brl.format(m.perdido)} • ${m.vencidos.length} cliente(s)`}
            />
          </div>

          {m.vencidos.length === 0 ? (
            <div className="p-6">
              <EmptyState
                compact
                icon={CheckCircle2}
                title="Inadimplência Zero na Carteira"
                description="Excelente retenção! Todas as assinaturas ativas estão rigorosamente em dia neste momento."
                className="border-white/5 bg-white/[0.01] shadow-none"
              />
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02] text-xs font-semibold text-zinc-400">
                    <th className="p-4">Cliente</th>
                    <th className="p-4">Plano</th>
                    <th className="p-4">Atraso</th>
                    <th className="p-4 text-right">Valor Mensal</th>
                  </tr>
                </thead>
                <tbody>
                  {m.vencidos.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-white/5 hover:bg-white/[0.03] transition-colors text-sm"
                    >
                      <td className="p-4">
                        <Link
                          to={`/cliente/${c.id}`}
                          className="font-medium text-zinc-100 hover:text-cyan-400 transition-colors"
                        >
                          {c.nome}
                        </Link>
                      </td>
                      <td className="p-4">
                        <span className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-xs text-zinc-300">
                          {c.plano}
                        </span>
                      </td>
                      <td className="p-4">
                        <StatusBadge
                          variant="vencido"
                          label={`Há ${c.dias} dia(s)`}
                        />
                      </td>
                      <td className="p-4 text-right font-mono text-zinc-100 tabular-nums [font-variant-numeric:tabular-nums]">
                        {brl.format(c.valor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
