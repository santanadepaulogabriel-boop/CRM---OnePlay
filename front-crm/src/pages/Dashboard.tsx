import { LogOut } from 'lucide-react'
import { signOut } from '../lib/auth'

export default function Dashboard() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-semibold">Painel Principal e Kanban em breve</h1>
      <button
        type="button"
        onClick={() => signOut()}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
      >
        <LogOut className="h-4 w-4" />
        Sair
      </button>
    </main>
  )
}
