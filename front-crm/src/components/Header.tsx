import { LogOut, Sparkles } from 'lucide-react'
import { signOut } from '../lib/auth'
import { HamburgerButton } from './HamburgerButton'

export { HamburgerButton }

export default function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[#06080d]/70 backdrop-blur-2xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <HamburgerButton />
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-400 shadow-[0_0_16px_rgba(34,211,238,0.18)]">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-base font-semibold tracking-tight text-zinc-100">OnePlay CRM</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#06080d]/60 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      </div>
    </header>
  )
}
