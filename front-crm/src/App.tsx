import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { supabase } from './lib/supabase'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider, useToast } from './contexts/ToastContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ModalAcessoRestrito } from './components/ModalAcessoRestrito'
import { LojaCreditos } from './components/LojaCreditos'
import { getSafeHomeRoute, isMasterUser } from './lib/multiTenant'

const Login = lazy(() => import('./pages/Login'))
const EsqueciSenha = lazy(() => import('./pages/EsqueciSenha'))
const RedefinirSenha = lazy(() => import('./pages/RedefinirSenha'))
const Metricas = lazy(() => import('./pages/Metricas'))
const Funil = lazy(() => import('./pages/Funil'))
const PerfilCliente = lazy(() => import('./pages/PerfilCliente'))
const Configuracoes = lazy(() => import('./pages/Configuracoes'))
const GestaoEquipa = lazy(() => import('./pages/GestaoEquipa'))
const Retencao = lazy(() => import('./pages/Retencao'))

function Splash() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#030509] text-zinc-100">
      <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-radial from-cyan-500/15 to-transparent" />
      <div className="relative flex flex-col items-center rounded-2xl border border-white/5 bg-[#06080d]/60 px-8 py-7 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.4)]">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)] animate-pulse">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="space-y-2 text-center">
          <div className="h-2.5 w-36 rounded-full bg-white/10 animate-pulse mx-auto" />
          <span className="block text-[11px] font-medium tracking-widest text-zinc-400 uppercase">
            Sincronizando OnePlay CRM
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Redireciona imediatamente o utilizador para sua página inicial segura
 * disparando um único toast.warning limpo, sem tela em branco ou quebra de layout.
 */
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

/**
 * Guard estrito para rotas exclusivas do Master ('Gestão de Revendas',
 * 'Configurações Globais de API' e 'Inteligência & Métricas').
 */
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

/**
 * Rota raiz inteligente:
 * - Master: abre Inteligência & Métricas
 * - Revendedor ('reseller'): encaminha diretamente para o painel operacional (/retencao)
 */
function HomeRoute() {
  const { usuario, loading } = useAuth()
  if (loading) return <Splash />
  if (!usuario) return <Navigate to="/login" replace />
  if (usuario.precisa_trocar_senha) return <Navigate to="/redefinir-senha" replace />
  if (isMasterUser(usuario)) return <Metricas />
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

            {/* Módulos Exclusivos Master */}
            <Route
              path="/metricas"
              element={
                <MasterRoute moduleName="Inteligência & Métricas">
                  <Metricas />
                </MasterRoute>
              }
            />
            <Route
              path="/revendas"
              element={
                <MasterRoute moduleName="Gestão de Revendas">
                  <GestaoEquipa />
                </MasterRoute>
              }
            />
            <Route
              path="/equipe"
              element={
                <MasterRoute moduleName="Gestão de Revendas">
                  <GestaoEquipa />
                </MasterRoute>
              }
            />
            <Route
              path="/configuracoes"
              element={
                <MasterRoute moduleName="Configurações Globais de API">
                  <Configuracoes />
                </MasterRoute>
              }
            />

            {/* Módulos Operacionais Isolados por Parceiro */}
            <Route
              path="/retencao"
              element={
                <ProtectedRoute>
                  <Retencao />
                </ProtectedRoute>
              }
            />
            <Route
              path="/funil"
              element={
                <ProtectedRoute>
                  <Funil />
                </ProtectedRoute>
              }
            />
            <Route
              path="/cliente/:id"
              element={
                <ProtectedRoute>
                  <PerfilCliente />
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
