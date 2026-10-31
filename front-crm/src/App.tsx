import { lazy, Suspense, useCallback, useEffect, useRef, type ReactNode } from 'react'
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { supabase } from './lib/supabase'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider, useToast } from './contexts/ToastContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { MainLayout, type CrmTabId } from './components/MainLayout'
import { DashboardMetrics } from './components/DashboardMetrics'
import { ClientesRenovacoes } from './components/ClientesRenovacoes'
import { KanbanBoard } from './components/KanbanBoard'
import { ListaRevendedores } from './components/ListaRevendedores'
import { ModuleSettings } from './components/ModuleSettings'
import { ModalAcessoRestrito } from './components/ModalAcessoRestrito'
import { LojaCreditos } from './components/LojaCreditos'
import { useCrmStore } from './stores/useCrmStore'
import { getSafeHomeRoute, isMasterUser } from './lib/multiTenant'

const Login = lazy(() => import('./pages/Login'))
const EsqueciSenha = lazy(() => import('./pages/EsqueciSenha'))
const RedefinirSenha = lazy(() => import('./pages/RedefinirSenha'))
const Metricas = lazy(() => import('./pages/Metricas'))
const PerfilCliente = lazy(() => import('./pages/PerfilCliente'))
const Configuracoes = lazy(() => import('./pages/Configuracoes'))

function Splash() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-cinematic text-zinc-100">
      <div className="glass-card relative flex flex-col items-center rounded-2xl px-8 py-7">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.22)] animate-pulse">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="space-y-2 text-center">
          <div className="h-2.5 w-36 rounded-full bg-white/10 animate-pulse mx-auto" />
          <span className="block text-[11px] font-medium tracking-widest text-zinc-300 uppercase">
            Carregando OnePlay Enterprise
          </span>
        </div>
      </div>
    </div>
  )
}

function UnauthorizedRedirect({
  to,
  message,
}: {
  to: string
  message: string
}) {
  const toast = useToast()
  const notifiedRef = useRef(false)

  useEffect(() => {
    if (!notifiedRef.current) {
      notifiedRef.current = true
      toast.warning(message, 'Acesso Restrito')
    }
  }, [message, toast])

  return <Navigate to={to} replace />
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { usuario, loading } = useAuth()
  if (loading) return <Splash />
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.precisa_trocar_senha) return <Navigate to="/redefinir-senha" replace />
  return <>{children}</>
}

function MasterRoute({
  children,
  moduleName,
}: {
  children: ReactNode
  moduleName?: string
}) {
  const { usuario, loading } = useAuth()
  if (loading) return <Splash />
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.precisa_trocar_senha) return <Navigate to="/redefinir-senha" replace />

  if (!isMasterUser(usuario)) {
    const safeHome = getSafeHomeRoute(usuario)
    const msg = moduleName
      ? `O módulo "${moduleName}" é exclusivo da conta Master. Redirecionado para o seu painel operacional.`
      : 'Acesso não autorizado a rota administrativa. Redirecionado para a sua área segura.'
    return <UnauthorizedRedirect to={safeHome} message={msg} />
  }

  return <>{children}</>
}

const TAB_TO_ROUTE: Record<CrmTabId, string> = {
  metrics: '/metricas',
  clients: '/retencao',
  kanban: '/funil',
  resellers: '/revendas',
  settings: '/configuracoes',
}

function resolveCurrentTab(pathname: string, isMaster: boolean): CrmTabId {
  if (pathname.startsWith('/metricas')) return isMaster ? 'metrics' : 'clients'
  if (pathname.startsWith('/retencao') || pathname.startsWith('/cliente/')) return 'clients'
  if (pathname.startsWith('/funil')) return 'kanban'
  if (pathname.startsWith('/revendas') || pathname.startsWith('/equipe')) {
    return isMaster ? 'resellers' : 'clients'
  }
  if (pathname.startsWith('/configuracoes')) {
    return isMaster ? 'settings' : 'clients'
  }
  return isMaster ? 'metrics' : 'clients'
}

/**
 * Shell Autenticado Unificado com Switch de Abas (`currentTab`) dentro do `MainLayout`:
 * Garante que todas as abas (`metrics`, `clients`, `kanban`, `resellers`, `settings`)
 * renderizem os respetivos componentes (`DashboardMetrics`, `ClientesRenovacoes`,
 * `KanbanBoard`, `ListaRevendedores`, `Configuracoes` + `ModuleSettings`) sem nunca
 * retornar `null`, `undefined` ou ecrã vazio.
 */
function AuthenticatedWorkspace({ customChild }: { customChild?: ReactNode }) {
  const { usuario, logout } = useAuth()
  const toast = useToast()
  const creditosStore = useCrmStore((s) => s.creditos)
  const location = useLocation()
  const navigate = useNavigate()

  const isMaster = isMasterUser(usuario)
  const currentTab: CrmTabId = resolveCurrentTab(location.pathname, isMaster)

  const handleTabChange = useCallback(
    (tab: CrmTabId) => {
      if (
        !isMaster &&
        (tab === 'metrics' || tab === 'resellers' || tab === 'settings')
      ) {
        toast.warning(
          'Este módulo é exclusivo da conta Master.',
          'Acesso Restrito'
        )
        navigate('/retencao', { replace: true })
        return
      }
      const nextPath = TAB_TO_ROUTE[tab] ?? (isMaster ? '/metricas' : '/retencao')
      if (location.pathname !== nextPath) {
        navigate(nextPath)
      }
    },
    [isMaster, location.pathname, navigate, toast]
  )

  const saldoCreditos =
    typeof creditosStore === 'number' ? creditosStore : Number(usuario?.creditos ?? 0)

  const renderActiveTab = (tab: CrmTabId): ReactNode => {
    switch (tab) {
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
      currentTab={currentTab}
      onTabChange={handleTabChange}
      userRole={isMaster ? 'master' : 'rev'}
      userName={usuario?.nome || 'Operador OnePlay'}
      userEmail={usuario?.email || 'operador@oneplay.com'}
      userCredits={isMaster ? 'Ilimitado' : saldoCreditos}
      onLogout={() => void logout()}
    >
      {customChild ?? renderActiveTab(currentTab)}
    </MainLayout>
  )
}

function HomeRoute() {
  const { usuario, loading } = useAuth()
  if (loading) return <Splash />
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.precisa_trocar_senha) return <Navigate to="/redefinir-senha" replace />
  if (isMasterUser(usuario)) return <AuthenticatedWorkspace />
  return <Navigate to={getSafeHomeRoute(usuario)} replace />
}

function FallbackRoute() {
  const { usuario, loading } = useAuth()
  if (loading) return <Splash />
  if (!usuario) return <Navigate to="/login" replace />
  const safeHome = getSafeHomeRoute(usuario)
  return (
    <UnauthorizedRedirect
      to={safeHome}
      message="Rota inexistente ou sem permissão de acesso. Redirecionado para a sua página inicial segura."
    />
  )
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { usuario, loading } = useAuth()
  if (loading) return <Splash />
  if (usuario) {
    if (usuario.precisa_trocar_senha) return <Navigate to="/redefinir-senha" replace />
    return <Navigate to={getSafeHomeRoute(usuario)} replace />
  }
  return <>{children}</>
}

function AuthRecoveryListener() {
  const navigate = useNavigate()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/redefinir-senha', { replace: true })
      }
    })

    const hash = window.location.hash || ''
    const search = window.location.search || ''
    if (hash.includes('type=recovery') || search.includes('type=recovery')) {
      navigate('/redefinir-senha', { replace: true })
    }

    return () => {
      subscription.unsubscribe()
    }
  }, [navigate])

  return null
}

function AppRoutes() {
  return (
    <>
      <AuthRecoveryListener />
      <ErrorBoundary>
        <Suspense fallback={<Splash />}>
          <Routes>
            {/* Rotas Públicas de Autenticação */}
            <Route
              path="/login"
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              }
            />
            <Route
              path="/esqueci-senha"
              element={
                <PublicRoute>
                  <EsqueciSenha />
                </PublicRoute>
              }
            />
            <Route path="/redefinir-senha" element={<RedefinirSenha />} />

            {/* Raiz dinâmica conforme perfil autenticado */}
            <Route path="/" element={<HomeRoute />} />

            {/* Rotas Exclusivas Master envolvidas pelo MainLayout + Switch currentTab */}
            <Route
              path="/metricas"
              element={
                <MasterRoute moduleName="Inteligência & Métricas">
                  <AuthenticatedWorkspace />
                </MasterRoute>
              }
            />
            <Route
              path="/revendas"
              element={
                <MasterRoute moduleName="Gestão de Revendas">
                  <AuthenticatedWorkspace />
                </MasterRoute>
              }
            />
            <Route
              path="/equipe"
              element={
                <MasterRoute moduleName="Gestão de Revendas">
                  <AuthenticatedWorkspace />
                </MasterRoute>
              }
            />
            <Route
              path="/configuracoes"
              element={
                <MasterRoute moduleName="Configurações Globais de API">
                  <AuthenticatedWorkspace />
                </MasterRoute>
              }
            />

            {/* Rotas Operacionais Protegidas envolvidas pelo MainLayout + Switch currentTab */}
            <Route
              path="/retencao"
              element={
                <ProtectedRoute>
                  <AuthenticatedWorkspace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/funil"
              element={
                <ProtectedRoute>
                  <AuthenticatedWorkspace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cliente/:id"
              element={
                <ProtectedRoute>
                  <AuthenticatedWorkspace customChild={<PerfilCliente />} />
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<FallbackRoute />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <ModalAcessoRestrito />
      <LojaCreditos />
    </>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
