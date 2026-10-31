import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getSafeHomeRoute, isMasterUser } from '../lib/multiTenant'
import DashboardMetricas from './DashboardMetricas'

export interface MetricasProps {
  topSlot?: ReactNode
}

export default function Metricas({ topSlot }: MetricasProps = {}) {
  const { usuario, loading } = useAuth()
  const isMaster = isMasterUser(usuario)

  // Defense-in-Depth: bloqueia renderização caso um não-Master aceda diretamente ao componente
  if (!loading && usuario && !isMaster) {
    return <Navigate to={getSafeHomeRoute(usuario)} replace />
  }

  return (
    <div className="relative flex flex-1 min-w-0 flex-col w-full">
      {topSlot}
      <DashboardMetricas />
    </div>
  )
}
