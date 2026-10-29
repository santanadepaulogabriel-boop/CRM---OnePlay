import { Menu } from 'lucide-react'
import { useCrmStore } from '../stores/useCrmStore'

interface HamburgerButtonProps {
  className?: string
}

export function HamburgerButton({ className = '' }: HamburgerButtonProps) {
  const toggleSidebar = useCrmStore((state) => state.toggleSidebar)

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className={`md:hidden flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-[#06080d]/60 backdrop-blur-2xl text-zinc-300 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:text-zinc-100 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] shrink-0 ${className}`}
      aria-label="Abrir menu lateral"
      title="Abrir menu"
    >
      <Menu className="h-4 w-4 text-zinc-300" />
    </button>
  )
}

export default HamburgerButton
