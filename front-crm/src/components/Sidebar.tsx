import { NavLink, useLocation } from 'react-router-dom'
import {
  BarChart3,
  LogOut,
  Settings,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users2,
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

  // Isolamento estrito de navegação: apenas contas Master visualizam módulos administrativos globais
  const isMaster = isMasterUser(usuario)

  const handleNavClick = () => {
    setSidebarOpen(false)
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-medium transition-all duration-300 ${
      isActive
        ? 'bg-cyan-500/10 text-cyan-200 border border-cyan-500/30 shadow-[0_0_20px_rgba(34,211,238,0.12)]'
        : 'border border-transparent text-zinc-400 hover:bg-white/[0.04] hover:border-cyan-500/20 hover:text-zinc-100'
    }`

  const isMetricasActive = location.pathname === '/' || location.pathname === '/metricas'

  const navContent = (
    <div className="relative flex h-full flex-col justify-between overflow-hidden">
      {/* Topo da Sidebar: Marca OnePlay */}
      <div className="shrink-0 relative z-10">
        <div className="flex h-16 items-center justify-between px-5 border-b border-white/5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold tracking-tight text-zinc-100">OnePlay</span>
              <span className="text-[10px] font-medium text-cyan-400/80 uppercase tracking-widest">
                {isMaster ? 'CRM Enterprise' : 'Painel Parceiro'}
              </span>
            </div>
          </div>

          {/* Botão de Fechar Exclusivo Mobile */}
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="md:hidden flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-[#06080d]/60 text-zinc-400 hover:text-zinc-100 hover:border-cyan-500/30 transition-all duration-300"
            aria-label="Fechar navegação"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Menu de Navegação Blindado por Perfil */}
      <nav className="relative z-10 flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          {isMaster ? 'Administração Master' : 'Operação Individual'}
        </div>

        {/* EXCLUSIVO MASTER: Inteligência & Métricas */}
        {isMaster && (
          <NavLink
            to="/metricas"
            onClick={handleNavClick}
            className={() => navLinkClass({ isActive: isMetricasActive })}
          >
            <div className="flex items-center gap-2.5">
              <BarChart3
                className={`h-4 w-4 ${isMetricasActive ? 'text-cyan-400' : 'text-zinc-500'}`}
              />
              <span>Inteligência &amp; Métricas</span>
            </div>
          </NavLink>
        )}

        {/* Painel Operacional de Clientes (Revendedor & Master) */}
        <NavLink to="/retencao" onClick={handleNavClick} className={navLinkClass}>
          {({ isActive }) => (
            <div className="flex items-center gap-2.5">
              <UserCheck className={`h-4 w-4 ${isActive ? 'text-cyan-400' : 'text-zinc-500'}`} />
              <span>Clientes &amp; Renovações</span>
            </div>
          )}
        </NavLink>

        {/* Funil de Vendas Individual (Revendedor & Master) */}
        <NavLink to="/funil" onClick={handleNavClick} className={navLinkClass}>
          {({ isActive }) => (
            <div className="flex items-center gap-2.5">
              <TrendingUp className={`h-4 w-4 ${isActive ? 'text-cyan-400' : 'text-zinc-500'}`} />
              <span>Funil de Vendas</span>
            </div>
          )}
        </NavLink>

        {/* EXCLUSIVO MASTER: Gestão de Revendas */}
        {isMaster && (
          <NavLink to="/revendas" onClick={handleNavClick} className={navLinkClass}>
            {({ isActive }) => (
              <div className="flex items-center gap-2.5">
                <Users2 className={`h-4 w-4 ${isActive ? 'text-cyan-400' : 'text-zinc-500'}`} />
                <span>Gestão de Revendas</span>
              </div>
            )}
          </NavLink>
        )}

        {/* EXCLUSIVO MASTER: Configurações Globais de API */}
        {isMaster && (
          <NavLink to="/configuracoes" onClick={handleNavClick} className={navLinkClass}>
            {({ isActive }) => (
              <div className="flex items-center gap-2.5">
                <Settings className={`h-4 w-4 ${isActive ? 'text-cyan-400' : 'text-zinc-500'}`} />
                <span>Configurações Globais de API</span>
              </div>
            )}
          </NavLink>
        )}

        {/* Loja de Créditos (Fluxo Híbrido de Recarga) */}
        <div className="pt-2.5 mt-2.5 border-t border-white/5">
          <button
            type="button"
            onClick={() => {
              handleNavClick()
              useCrmStore.getState().abrirLojaCreditos()
            }}
            className="flex w-full items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-2.5 text-xs font-medium text-zinc-300 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:bg-cyan-500/[0.06] hover:text-zinc-100 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
          >
            <div className="flex items-center gap-2.5">
              <ShoppingBag className="h-4 w-4 text-emerald-400" />
              <span>Loja de Créditos</span>
            </div>
            <span className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
              Recarregar
            </span>
          </button>
        </div>
      </nav>

      {/* Rodapé da Sidebar: Identidade + Saldo Atual + Logout Seguro */}
      <div className="relative z-10 p-4 border-t border-white/5 bg-[#030509]/40 space-y-3 shrink-0">
        <div className="flex items-center justify-between text-xs gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.9)] shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-zinc-100 truncate tracking-tight">
                {usuario?.nome || 'Operador OnePlay'}
              </p>
              <p className="text-[11px] text-zinc-500 truncate">
                {usuario?.email || 'operador@oneplay.com'}
              </p>
            </div>
          </div>
          <span
            className={`text-[10px] font-mono font-semibold shrink-0 uppercase px-2 py-0.5 rounded-md border ${
              isMaster
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
            }`}
          >
            {isMaster ? 'MASTER' : 'REV'}
          </span>
        </div>

        <CreditosBadge className="w-full justify-center text-[11px] py-1.5" />

        <button
          type="button"
          onClick={() => {
            setSidebarOpen(false)
            void logout()
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/5 bg-[#06080d]/60 px-3 py-2 text-xs font-medium text-zinc-300 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:text-zinc-100 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
        >
          <LogOut className="h-3.5 w-3.5 text-zinc-400" />
          <span>Encerrar Sessão</span>
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Sidebar Desktop */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-64 border-r border-white/5 bg-[#06080d]/80 backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] flex-col justify-between">
        {navContent}
      </aside>

      {/* Drawer Mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm md:hidden transition-opacity duration-200"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-white/5 bg-[#06080d]/90 backdrop-blur-2xl flex flex-col justify-between shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] transition-transform duration-300 ease-out md:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {navContent}
      </aside>
    </>
  )
}

export default Sidebar
