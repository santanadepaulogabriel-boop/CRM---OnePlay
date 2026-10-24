import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { getSession, onAuthChange } from './lib/auth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSession()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false))
    return onAuthChange(setSession)
  }, [])

  return { session, loading }
}

function Splash() {
  return <div className="min-h-screen bg-slate-950" />
}

function ProtectedRoute({ session, loading, children }: { session: Session | null; loading: boolean; children: ReactNode }) {
  if (loading) return <Splash />
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicRoute({ session, loading, children }: { session: Session | null; loading: boolean; children: ReactNode }) {
  if (loading) return <Splash />
  if (session) return <Navigate to="/" replace />
  return <>{children}</>
}

function App() {
  const { session, loading } = useSession()

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute session={session} loading={loading}>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute session={session} loading={loading}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
