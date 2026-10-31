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
      className={`md:hidden btn-enterprise-icon ${className}`}
      aria-label="Abrir menu lateral"
      title="Abrir menu"
    >
      <Menu className="h-4 w-4 text-zinc-300" />
    </button>
  )
}

export default HamburgerButton
