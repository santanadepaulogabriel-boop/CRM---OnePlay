import React from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import {
  BarChart3,
  Users,
  Kanban,
  UserCheck,
  Settings,
  CreditCard,
  LogOut,
  UserCircle2,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCrmStore } from '../stores/useCrmStore'
import { isMasterUser } from '../lib/multiTenant'
import { SmartBanner } from './SmartBanner'
import { HamburgerButton } from './HamburgerButton'
import { NotificationBell } from './NotificationBell'
import { SystemClock } from './SystemClock'

export type CrmTabId = 'metrics' | 'clients' | 'kanban' | 'resellers' | 'settings'

export interface MainLayoutProps {
  children?: React.ReactNode
  userRole?: 'master' | 'rev'
  userName?: string
  userEmail?: string
  userCredits?: number | 'Ilimitado'
  onLogout?: () => void
  currentTab?: CrmTabId | string
  onTabChange?: (tab: CrmTabId) => void
}

interface SectionMeta {
  title: string
  subtitle: string
  icon: LucideIcon
}

function getSectionMeta(activeTab: string, pathname: string, isMaster: boolean): SectionMeta {
  if (pathname.startsWith('/cliente/')) {
    return {
      title: 'Ficha do Assinante',
      subtitle: 'Cadastro detalhado, credenciais de acesso e histórico financeiro',
      icon: UserCircle2,
    }
  }

  switch (activeTab) {
    case 'metrics':
      return {
        title: 'Inteligência & Métricas',
        subtitle: isMaster
          ? 'Receita recorrente, expansão comercial e performance consolidada'
          : 'Receita recorrente da sua carteira, conversão e performance comercial',
        icon: BarChart3,
      }
    case 'clients':
      return {
        title: 'Clientes & Renovações',
        subtitle: 'Gestão comercial da carteira ativa, ciclos de assinatura e retenção',
        icon: Users,
      }
    case 'kanban':
      return {
        title: 'Funil de Vendas',
        subtitle: 'Pipeline comercial de prospecção, demonstrações e fechamento',
        icon: Kanban,
      }
    case 'resellers':
      return {
        title: 'Gestão de Revendas',
        subtitle: 'Governança comercial de parceiros, distribuição de créditos e prazos',
        icon: UserCheck,
      }
    case 'settings':
      return {
        title: isMaster ? 'Configurações Globais de API' : 'Configurações Globais',
        subtitle: isMaster
          ? 'Servidores IPTV, chaves de integração e políticas operacionais'
          : 'Servidores próprios, credenciais de integração e segurança do seu perfil',
        icon: Settings,
      }
    default:
      return {
        title: 'Clientes & Renovações',
        subtitle: 'Gestão comercial da carteira ativa, ciclos de assinatura e retenção',
        icon: Users,
      }
  }
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  children,
  userRole,
  userName,
  userEmail,
  userCredits,
  onLogout,
  currentTab,
  onTabChange,
}) => {
  const { usuario, logout } = useAuth()
  const location = useLocation()
  const creditosStore = useCrmStore((s) => s.creditos)
  const sidebarOpen = useCrmStore((s) => s.sidebarOpen)
  const setSidebarOpen = useCrmStore((s) => s.setSidebarOpen)

  const resolvedIsMaster =
    userRole !== undefined ? userRole === 'master' : isMasterUser(usuario)
  const resolvedName = userName ?? usuario?.nome ?? 'Operador OnePlay'
  const resolvedEmail = userEmail ?? usuario?.email ?? 'operador@oneplay.com'
  const resolvedCredits =
    userCredits ??
    (resolvedIsMaster
      ? 'Ilimitado'
      : typeof creditosStore === 'number'
        ? creditosStore
        : Number(usuario?.creditos ?? 0))

  const activeTab: string =
    currentTab ?? (resolvedIsMaster ? 'metrics' : 'clients')

  const sectionMeta = getSectionMeta(activeTab, location.pathname, resolvedIsMaster)
  const SectionIcon = sectionMeta.icon
  const transitionKey = location.pathname.startsWith('/cliente/')
    ? location.pathname
    : activeTab

  const allMenuItems: {
    id: CrmTabId
    label: string
    icon: typeof BarChart3
    show: boolean
  }[] = [
    { id: 'metrics', label: 'Inteligência & Métricas', icon: BarChart3, show: true },
    { id: 'clients', label: 'Clientes & Renovações', icon: Users, show: true },
    { id: 'kanban', label: 'Funil de Vendas', icon: Kanban, show: true },
    { id: 'resellers', label: 'Gestão de Revendas', icon: UserCheck, show: resolvedIsMaster },
    {
      id: 'settings',
      label: resolvedIsMaster ? 'Configurações Globais de API' : 'Configurações Globais',
      icon: Settings,
      show: true,
    },
  ]
  const menuItems = allMenuItems.filter((item) => item.show)

  const handleTabClick = (id: CrmTabId | 'loja-creditos') => {
    setSidebarOpen(false)
    if (id === 'loja-creditos') {
      useCrmStore.getState().abrirLojaCreditos()
      return
    }
    if (typeof onTabChange === 'function') {
      onTabChange(id)
    }
  }

  const handleLogoutClick = () => {
    setSidebarOpen(false)
    if (typeof onLogout === 'function') {
      onLogout()
    } else {
      void logout()
    }
  }

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between select-none">
      <div>
        <div className="relative h-20 px-5 border-b border-white/[0.07] flex items-center justify-center">
          <img
            src="/logo-oficial.png"
            alt="OnePlay"
            className="h-9 max-h-[38px] w-auto max-w-[180px] object-contain select-none pointer-events-none drop-shadow-[0_2px_14px_rgba(34,211,238,0.16)]"
          />

          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="md:hidden absolute right-3 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white transition-all duration-200"
            aria-label="Fechar menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 px-3 mb-3">
            {resolvedIsMaster ? 'Administração Master' : 'Operação Comercial'}
          </p>
          <nav className="space-y-1.5">
            {menuItems.map((item) => {
              const Icon = item.icon
              const isActive = activeTab === item.id

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTabClick(item.id)}
                  className={`group w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 ease-out ${isActive
                    ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-500/35 shadow-[0_0_20px_rgba(34,211,238,0.14)]'
                    : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] hover:translate-x-0.5 border border-transparent'
                    }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors duration-200 ${isActive ? 'text-cyan-400' : 'text-zinc-400 group-hover:text-cyan-300'
                      }`}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              )
            })}
          </nav>
        </div>
      </div>

      <div className="p-4 border-t border-white/[0.07] bg-white/[0.015]">
        <div className="mb-3.5 p-3 rounded-xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <CreditCard className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-xs text-zinc-200 font-medium truncate tabular-nums">
              {resolvedIsMaster ? 'Saldo: Ilimitado' : `Saldo: ${resolvedCredits}`}
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleTabClick('loja-creditos')}
            className="text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2.5 py-1 rounded-lg transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-500/25 hover:border-emerald-400/50 hover:text-emerald-100 hover:shadow-[0_0_14px_rgba(52,211,153,0.18)] shrink-0"
          >
            Loja
          </button>
        </div>

        <div className="flex items-center justify-between mb-3 px-1 gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-zinc-100 truncate">{resolvedName}</p>
            <p className="text-[11px] text-zinc-400 font-mono truncate">{resolvedEmail}</p>
          </div>
          <span
            className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${resolvedIsMaster
              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
              : 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
              }`}
          >
            {resolvedIsMaster ? 'MASTER' : 'PARCEIRO'}
          </span>
        </div>

        <button
          type="button"
          onClick={handleLogoutClick}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 hover:-translate-y-0.5 active:translate-y-0 text-rose-300 hover:text-rose-200 border border-rose-500/20 hover:border-rose-500/40 text-xs font-medium transition-all duration-200"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Encerrar Sessão</span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="relative flex min-h-screen w-full bg-cinematic text-zinc-100">
      {/* Camada Fixa do Fundo Cinematográfico + Overlay Escuro em Alta Opacidade para Contraste Absoluto */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 bg-[url('/bg-cinema-neon.png')] bg-cover bg-center bg-no-repeat"
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(0, 0, 0, 0.90) 0%, rgba(2, 4, 10, 0.85) 50%, rgba(0, 0, 0, 0.93) 100%)',
          }}
        />
      </div>

      {/* Sidebar Fixa Desktop (w-64 = 16rem = md:pl-64) */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 z-40 w-64 glass-sidebar flex-col justify-between">
        {sidebarContent}
      </aside>

      {/* Drawer Mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] glass-sidebar flex flex-col justify-between transition-transform duration-300 ease-out md:hidden ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        {sidebarContent}
      </aside>

      {/* Shell de Compensação Estrita da Sidebar Fixa (exclusivamente pl-0 md:pl-64, sem conflito de shorthand p-*) */}
      <div className="relative z-10 flex flex-1 min-w-0 w-full flex-col min-h-screen pl-0 md:pl-64">
        {/* Wrapper de Respiro Lateral e Vertical Uniforme (idêntico para Painel Master e Painel Revendedor) */}
        <div className="flex flex-1 min-w-0 w-full flex-col px-4 py-4 sm:px-6 sm:py-6 md:pl-7 md:pr-6 lg:pl-9 lg:pr-8 lg:py-7">
          {/* <main> como Palco Flutuante Unificado .glass-card (idêntico no Painel Master e Painel Revendedor) */}
          <main className="glass-card relative flex flex-1 min-w-0 w-full max-w-[1640px] mx-auto flex-col rounded-2xl lg:rounded-3xl overflow-x-clip">
            {/* Barra de Topo Persistente sempre ancorada ao topo do palco com Relógio Fixo de Precisão à direita */}
            <header className="sticky top-0 z-30 glass-header rounded-t-2xl lg:rounded-t-3xl px-5 sm:px-7 lg:px-9 py-3.5 sm:py-0 sm:min-h-[4.5rem] flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3.5 min-w-0">
                <HamburgerButton />
                <div className="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.14)]">
                  <SectionIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-sm sm:text-base lg:text-lg font-semibold tracking-tight text-zinc-100 truncate">
                    {sectionMeta.title}
                  </h1>
                  <p className="hidden md:block text-xs text-zinc-400 truncate mt-0.5">
                    {sectionMeta.subtitle}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                <NotificationBell />
                <SystemClock />
              </div>
            </header>

            <SmartBanner />

            {/* Área Interna do Palco com Alinhamento Horizontal Idêntico ao Cabeçalho (px-5 sm:px-7 lg:px-9) */}
            <div className="flex flex-1 flex-col min-w-0 w-full px-5 sm:px-7 lg:px-9 py-5 sm:py-7 lg:py-8 gap-6">
              <div
                key={transitionKey}
                className="tech-stage-enter flex flex-1 flex-col min-w-0 w-full gap-6"
              >
                {children ?? <Outlet />}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

export default MainLayout
