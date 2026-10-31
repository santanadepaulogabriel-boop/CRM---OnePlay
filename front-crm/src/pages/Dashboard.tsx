import { useState, useEffect, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MainLayout, type CrmTabId } from '../components/MainLayout'
import { DashboardMetrics } from '../components/DashboardMetrics'
import { ClientesRenovacoes } from '../components/ClientesRenovacoes'
import { KanbanBoard } from '../components/KanbanBoard'
import { ListaRevendedores } from '../components/ListaRevendedores'
import { ModuleSettings } from '../components/ModuleSettings'
import Metricas from './Metricas'
import Configuracoes from './Configuracoes'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useCrmStore } from '../stores/useCrmStore'
import { isMasterUser } from '../lib/multiTenant'

export interface DashboardProps {
  initialTab?: CrmTabId
}

const TAB_TO_PATH: Record<CrmTabId, string> = {
  metrics: '/metricas',
  clients: '/retencao',
  kanban: '/funil',
  resellers: '/revendas',
  settings: '/configuracoes',
}

function resolveTabFromPathname(pathname: string, isMaster: boolean): CrmTabId {
  if (pathname.startsWith('/metricas')) return isMaster ? 'metrics' : 'clients'
  if (pathname.startsWith('/retencao')) return 'clients'
  if (pathname.startsWith('/funil')) return 'kanban'
  if (pathname.startsWith('/revendas') || pathname.startsWith('/equipe')) {
    return isMaster ? 'resellers' : 'clients'
  }
  if (pathname.startsWith('/configuracoes')) {
    return isMaster ? 'settings' : 'clients'
  }
  return isMaster ? 'metrics' : 'clients'
}

export default function Dashboard({ initialTab }: DashboardProps = {}) {
  const { usuario, logout } = useAuth()
  const toast = useToast()
  const creditosStore = useCrmStore((s) => s.creditos)
  const location = useLocation()
  const navigate = useNavigate()

  const isMaster = isMasterUser(usuario)

  const [currentTab, setCurrentTab] = useState<CrmTabId>(() =>
    initialTab ?? resolveTabFromPathname(location.pathname, isMaster)
  )

  // Mantém `currentTab` sincronizado quando a URL muda (ex.: botões Voltar/Avançar ou links diretos)
  useEffect(() => {
    const derived = initialTab ?? resolveTabFromPathname(location.pathname, isMaster)
    setCurrentTab(derived)
  }, [initialTab, location.pathname, isMaster])

  const handleTabChange = useCallback(
    (nextTab: CrmTabId) => {
      if (
        !isMaster &&
        (nextTab === 'metrics' || nextTab === 'resellers' || nextTab === 'settings')
      ) {
        toast.warning(
          'Este módulo é exclusivo da administração Master.',
          'Acesso Restrito'
        )
        setCurrentTab('clients')
        navigate('/retencao', { replace: true })
        return
      }

      setCurrentTab(nextTab)
      const targetPath = TAB_TO_PATH[nextTab] ?? (isMaster ? '/metricas' : '/retencao')
      if (location.pathname !== targetPath) {
        navigate(targetPath)
      }
    },
    [isMaster, location.pathname, navigate, toast]
  )

  const effectiveTab: CrmTabId =
    !isMaster &&
    (currentTab === 'metrics' || currentTab === 'resellers' || currentTab === 'settings')
      ? 'clients'
      : currentTab

  const saldoCreditos =
    typeof creditosStore === 'number' ? creditosStore : Number(usuario?.creditos ?? 0)

  const renderTabContent = () => {
    switch (effectiveTab) {
      case 'metrics':
        return <Metricas topSlot={<DashboardMetrics />} />
      case 'clients':
        return <ClientesRenovacoes />
      case 'kanban':
        return <KanbanBoard />
      case 'resellers':
        return <ListaRevendedores />
      case 'settings':
        return (
          <div className="flex flex-1 flex-col min-w-0">
            <Configuracoes />
            <ModuleSettings />
          </div>
        )
      default:
        return isMaster ? (
          <Metricas topSlot={<DashboardMetrics />} />
        ) : (
          <ClientesRenovacoes />
        )
    }
  }

  return (
    <MainLayout
      currentTab={effectiveTab}
      onTabChange={handleTabChange}
      userRole={isMaster ? 'master' : 'rev'}
      userName={usuario?.nome || 'Operador OnePlay'}
      userEmail={usuario?.email || 'operador@oneplay.com'}
      userCredits={isMaster ? 'Ilimitado' : saldoCreditos}
      onLogout={() => void logout()}
    >
      {renderTabContent()}
    </MainLayout>
  )
}
