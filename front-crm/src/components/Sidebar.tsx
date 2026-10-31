import { NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3,
  Kanban,
  LogOut,
  Settings,
  ShoppingBag,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { CreditosBadge } from './CreditosBadge'
import { useCrmStore } from '../stores/useCrmStore'
import { isMasterUser } from '../lib/multiTenant'

export function Sidebar() {
  const { usuario, logout } = useAuth()
  const location = useLocation()
  const sidebarOpen = useCrmStore((state) => state.sidebarOpen)
  const setSidebarOpen = useCrmStore((state) => state.setSidebarOpen)

  // Isolamento de menu por perfil: "Gestão de Revendas" é estritamente exclusiva para Master
  const isMaster = isMasterUser(usuario)

  const handleNavClick = () => {
    setSidebarOpen(false)
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `group flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all duration-200 ${
      isActive
        ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/35 shadow-[0_0_20px_rgba(34,211,238,0.14)]'
        : 'border border-transparent text-zinc-400 hover:bg-white/[0.05] hover:translate-x-0.5 hover:text-zinc-100'
    }`

  const isMetricasActive =
    location.pathname === '/metricas' || (isMaster && location.pathname === '/')

  const navContent = (
    <div className="relative flex h-full flex-col justify-between overflow-hidden select-none">
      {/* Topo da Sidebar: Logotipo Oficial OnePlay */}
      <div className="shrink-0 relative z-10">
        <div className="relative flex h-20 items-center justify-center px-5 border-b border-white/[0.07]">
          <img
            src="/logo-oficial.png"
            alt="OnePlay"
            className="h-9 max-h-[38px] w-auto max-w-[180px] object-contain select-none pointer-events-none drop-shadow-[0_2px_14px_rgba(34,211,238,0.16)]"
          />

          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="md:hidden absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white transition-all duration-200"
            aria-label="Fechar navegação"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Menu de Navegação com Isolamento por Perfil */}
      <nav className="relative z-10 flex-1 px-4 py-5 space-y-1.5 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          {isMaster ? 'Administração Master' : 'Operação Comercial'}
        </div>

        {/* 1. Inteligência & Métricas (Master & Revendedor — isolado por carteira) */}
        <NavLink
          to="/metricas"
          onClick={handleNavClick}
          className={() => navLinkClass({ isActive: isMetricasActive })}
        >
          <div className="flex items-center gap-3">
            <BarChart3
              className={`h-4 w-4 shrink-0 ${
                isMetricasActive ? 'text-cyan-400' : 'text-zinc-400 group-hover:text-cyan-300'
              }`}
            />
            <span>Inteligência &amp; Métricas</span>
          </div>
        </NavLink>

        {/* 2. Clientes & Renovações (Master & Revendedor — isolado por vendedor_id) */}
        <NavLink to="/retencao" onClick={handleNavClick} className={navLinkClass}>
          {({ isActive }) => (
            <div className="flex items-center gap-3">
              <Users
                className={`h-4 w-4 shrink-0 ${
                  isActive ? 'text-cyan-400' : 'text-zinc-400 group-hover:text-cyan-300'
                }`}
              />
              <span>Clientes &amp; Renovações</span>
            </div>
          )}
        </NavLink>

        {/* 3. Funil de Vendas (Master & Revendedor — isolado por vendedor_id) */}
        <NavLink to="/funil" onClick={handleNavClick} className={navLinkClass}>
          {({ isActive }) => (
            <div className="flex items-center gap-3">
              <Kanban
                className={`h-4 w-4 shrink-0 ${
                  isActive ? 'text-cyan-400' : 'text-zinc-400 group-hover:text-cyan-300'
                }`}
              />
              <span>Funil de Vendas</span>
            </div>
          )}
        </NavLink>

        {/* EXCLUSIVO MASTER: Gestão de Revendas (100% oculto para Revendedores) */}
        {isMaster && (
          <NavLink to="/revendas" onClick={handleNavClick} className={navLinkClass}>
            {({ isActive }) => (
              <div className="flex items-center gap-3">
                <UserCheck
                  className={`h-4 w-4 shrink-0 ${
                    isActive ? 'text-cyan-400' : 'text-zinc-400 group-hover:text-cyan-300'
                  }`}
                />
                <span>Gestão de Revendas</span>
              </div>
            )}
          </NavLink>
        )}

        {/* 4. Configurações Globais (Master & Revendedor — limitadas ao perfil do utilizador) */}
        <NavLink to="/configuracoes" onClick={handleNavClick} className={navLinkClass}>
          {({ isActive }) => (
            <div className="flex items-center gap-3">
              <Settings
                className={`h-4 w-4 shrink-0 ${
                  isActive ? 'text-cyan-400' : 'text-zinc-400 group-hover:text-cyan-300'
                }`}
              />
              <span>{isMaster ? 'Configurações Globais de API' : 'Configurações Globais'}</span>
            </div>
          )}
        </NavLink>

        {/* Loja de Créditos */}
        <div className="pt-2.5 mt-2.5 border-t border-white/[0.07]">
          <button
            type="button"
            onClick={() => {
              handleNavClick()
              useCrmStore.getState().abrirLojaCreditos()
            }}
            className="flex w-full items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-xs font-medium text-zinc-200 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:bg-cyan-500/[0.08] hover:text-white"
          >
            <div className="flex items-center gap-2.5">
              <ShoppingBag className="h-4 w-4 text-emerald-400" />
              <span>Loja de Créditos</span>
            </div>
            <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
              Loja
            </span>
          </button>
        </div>
      </nav>

      {/* Rodapé da Sidebar */}
      <div className="relative z-10 p-4 border-t border-white/[0.07] bg-white/[0.015] space-y-3 shrink-0">
        <div className="flex items-center justify-between text-xs gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.9)] shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-zinc-100 truncate tracking-tight">
                {usuario?.nome || 'Operador OnePlay'}
              </p>
              <p className="text-[11px] text-zinc-400 font-mono truncate">
                {usuario?.email || 'operador@oneplay.com'}
              </p>
            </div>
          </div>
          <span
            className={`text-[9px] font-bold shrink-0 uppercase tracking-wider px-2 py-0.5 rounded border ${
              isMaster
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
            }`}
          >
            {isMaster ? 'MASTER' : 'PARCEIRO'}
          </span>
        </div>

        <CreditosBadge className="w-full justify-center text-[11px] py-1.5" />

        <button
          type="button"
          onClick={() => {
            setSidebarOpen(false)
            void logout()
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 hover:-translate-y-0.5 text-rose-300 hover:text-rose-200 border border-rose-500/20 hover:border-rose-500/40 px-3 py-2 text-xs font-medium transition-all duration-200"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Encerrar Sessão</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-64 glass-sidebar flex-col justify-between">
        {navContent}
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm md:hidden transition-opacity duration-200"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] glass-sidebar flex flex-col justify-between transition-transform duration-300 ease-out md:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {navContent}
      </aside>
    </>
  )
}

export default Sidebar
