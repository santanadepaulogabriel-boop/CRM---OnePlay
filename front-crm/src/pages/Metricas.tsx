import type { ReactNode } from 'react'
import DashboardMetricas from './DashboardMetricas'

export interface MetricasProps {
  topSlot?: ReactNode
}

export default function Metricas({ topSlot }: MetricasProps = {}) {
  return (
    <div className="relative flex flex-1 min-w-0 flex-col w-full">
      {topSlot}
      <DashboardMetricas />
    </div>
  )
}
