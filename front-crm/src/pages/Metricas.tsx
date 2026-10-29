import { Navigate } from 'react-router-dom'
import { Crown } from 'lucide-react'
import { Sidebar } from '../components/Sidebar'
import { SmartBanner } from '../components/SmartBanner'
import { SystemClock } from '../components/SystemClock'
import { HamburgerButton } from '../components/HamburgerButton'
import { StatusBadge } from '../components/ui/TierOnePrimitives'
import { useAuth } from '../contexts/AuthContext'
import { getSafeHomeRoute, isMasterUser } from '../lib/multiTenant'
import DashboardMetricas from './DashboardMetricas'

export default function Metricas() {
  const { usuario, loading } = useAuth()
  const isMaster = isMasterUser(usuario)

  // Defense-in-Depth: bloqueia renderização caso um não-Master aceda diretamente ao componente
  if (!loading && usuario && !isMaster) {
    return <Navigate to={getSafeHomeRoute(usuario)} replace />
  }

  return (
    <div className="relative flex min-h-screen bg-[#030509] text-zinc-100 font-sans selection:bg-cyan-500/30 selection:text-cyan-100">
      <div className="pointer-events-none fixed -top-40 right-0 h-96 w-96 rounded-full bg-radial from-cyan-500/10 to-transparent" />

      <Sidebar />

      <div className="relative flex-1 min-w-0 pl-0 md:pl-64 flex flex-col min-h-screen">
        <SmartBanner />

        <header className="sticky top-0 z-30 border-b border-white/5 bg-[#06080d]/60 backdrop-blur-2xl">
          <div className="w-full max-w-[1600px] mx-auto flex flex-col md:flex-row md:h-16 md:items-center justify-between gap-4 px-6 lg:px-10 py-3 md:py-0">
            <div className="flex items-center gap-3">
              <HamburgerButton />
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-lg font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
                    <Crown className="h-4 w-4 text-amber-400" />
                    <span>Inteligência &amp; Métricas</span>
                  </h1>
                  <StatusBadge variant="vencendo" label="Visão Global SaaS" />
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Monitoramento global de MRR, evolução financeira, circulação de créditos e ranking LTV de parceiros
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 self-end md:self-auto">
              <SystemClock />
            </div>
          </div>
        </header>

        <main className="flex-1 w-full max-w-[1600px] mx-auto p-6 lg:p-10">
          <DashboardMetricas />
        </main>
      </div>
    </div>
  )
}
