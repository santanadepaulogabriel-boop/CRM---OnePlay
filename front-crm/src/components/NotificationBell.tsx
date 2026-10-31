import { useState, useEffect, useRef } from 'react';
import { Bell, AlertTriangle, CreditCard, ShieldCheck, Check, Trash2 } from 'lucide-react';

export interface Notificacao {
    id: string;
    titulo: string;
    descricao: string;
    tipo: 'alerta' | 'credito' | 'sistema' | 'sucesso';
    data: string;
    lida: boolean;
}

export function NotificationBell() {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    // Lista de exemplo simulada (pode ser ligada ao Supabase posteriormente)
    const [notificacoes, setNotificacoes] = useState<Notificacao[]>([
        {
            id: '1',
            titulo: 'Saldo de Créditos Baixo',
            descricao: 'Você possui apenas 5 créditos disponíveis para ativação imediata.',
            tipo: 'alerta',
            data: 'Há 10 min',
            lida: false,
        },
        {
            id: '2',
            titulo: 'Cliente Próximo ao Vencimento',
            descricao: 'O cliente Gabriel Santana F. vence amanhã (02/11). Envie uma cobrança!',
            tipo: 'credito',
            data: 'Há 1 hora',
            lida: false,
        },
        {
            id: '3',
            titulo: 'Atualização Enterprise RLS',
            descricao: 'Políticas de isolamento de dados atualizadas com sucesso no Supabase.',
            tipo: 'sistema',
            data: 'Ontem',
            lida: true,
        },
    ]);

    const naoLidasCount = notificacoes.filter((n) => !n.lida).length;

    // Fechar dropdown ao clicar fora
    useEffect(() => {
        const handleOutsideClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideClick);
        return () => document.removeEventListener('mousedown', handleOutsideClick);
    }, []);

    const marcarTodasComoLidas = () => {
        setNotificacoes((prev) => prev.map((n) => ({ ...n, lida: true })));
    };

    const limparNotificacoes = () => {
        setNotificacoes([]);
    };

    const alternarLida = (id: string) => {
        setNotificacoes((prev) =>
            prev.map((n) => (n.id === id ? { ...n, lida: !n.lida } : n))
        );
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Botão do Sino */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-zinc-300 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:text-cyan-300 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                title="Notificações do Sistema"
            >
                <Bell className="h-4 w-4" />
                {naoLidasCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[10px] font-bold text-black shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse">
                        {naoLidasCount}
                    </span>
                )}
            </button>

            {/* Painel Flutuante (Dropdown) */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl border border-white/10 bg-[#06080d]/95 backdrop-blur-2xl shadow-[0_16px_48px_0_rgba(0,0,0,0.7)] z-50 animate-in fade-in zoom-in-95 overflow-hidden">

                    {/* Cabeçalho do Painel */}
                    <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/5 bg-white/[0.02]">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">Notificações</span>
                            {naoLidasCount > 0 && (
                                <span className="rounded-full bg-cyan-500/20 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                                    {naoLidasCount} nova(s)
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {naoLidasCount > 0 && (
                                <button
                                    type="button"
                                    onClick={marcarTodasComoLidas}
                                    className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                                >
                                    Marcar lidas
                                </button>
                            )}
                            {notificacoes.length > 0 && (
                                <button
                                    type="button"
                                    onClick={limparNotificacoes}
                                    className="text-zinc-500 hover:text-zinc-300 transition-colors"
                                    title="Limpar tudo"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Lista de Notificações */}
                    <div className="max-h-80 overflow-y-auto p-2 space-y-1.5">
                        {notificacoes.length === 0 ? (
                            <div className="text-center py-10 text-zinc-500 text-xs">
                                <Bell className="h-6 w-6 mx-auto mb-2 opacity-30" />
                                <span>Nenhuma notificação no momento.</span>
                            </div>
                        ) : (
                            notificacoes.map((item) => (
                                <div
                                    key={item.id}
                                    onClick={() => alternarLida(item.id)}
                                    className={`group relative rounded-xl border p-3 transition-all cursor-pointer ${item.lida
                                            ? 'border-white/5 bg-white/[0.01] opacity-70 hover:opacity-100'
                                            : 'border-cyan-500/30 bg-cyan-500/[0.04] hover:bg-cyan-500/[0.08]'
                                        }`}
                                >
                                    <div className="flex items-start gap-2.5">
                                        {/* Ícone por tipo */}
                                        <div className="mt-0.5 shrink-0">
                                            {item.tipo === 'alerta' && <AlertTriangle className="h-4 w-4 text-amber-400" />}
                                            {item.tipo === 'credito' && <CreditCard className="h-4 w-4 text-cyan-400" />}
                                            {item.tipo === 'sistema' && <ShieldCheck className="h-4 w-4 text-violet-400" />}
                                            {item.tipo === 'sucesso' && <Check className="h-4 w-4 text-emerald-400" />}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center justify-between gap-1">
                                                <h4 className="text-xs font-semibold text-zinc-100 truncate">{item.titulo}</h4>
                                                <span className="text-[10px] text-zinc-500 shrink-0">{item.data}</span>
                                            </div>
                                            <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">{item.descricao}</p>
                                        </div>

                                        {!item.lida && (
                                            <span className="h-2 w-2 rounded-full bg-cyan-400 shrink-0 self-center shadow-[0_0_6px_rgba(34,211,238,0.8)]" />
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Rodapé do Painel */}
                    <div className="p-2 border-t border-white/5 bg-white/[0.01] text-center">
                        <span className="text-[10px] text-zinc-500">Centro de Inteligência OnePlay CRM Enterprise</span>
                    </div>

                </div>
            )}
        </div>
    );
}