import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Key,
  Loader2,
  Lock,
  MessageCircle,
  Plus,
  Power,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  atualizarStatusServidor,
  criarServidor,
  listarServidores,
  type Servidor,
} from '../lib/servidores'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useCrmStore } from '../stores/useCrmStore'
import { getSafeHomeRoute, isMasterUser } from '../lib/multiTenant'
import { EmptyState, StatusBadge } from '../components/ui/TierOnePrimitives'

const SQL_MIGRATION = `-- Execute este comando no SQL Editor do seu Supabase:
CREATE TABLE IF NOT EXISTS servidores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    nome TEXT NOT NULL,
    url TEXT,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE servidores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_servidores_select" ON servidores FOR SELECT TO authenticated USING (tenant_id = auth.uid() OR tenant_id IS NULL);
CREATE POLICY "tenant_servidores_insert" ON servidores FOR INSERT TO authenticated WITH CHECK (COALESCE(tenant_id, auth.uid()) = auth.uid());
CREATE POLICY "tenant_servidores_update" ON servidores FOR UPDATE TO authenticated USING (tenant_id = auth.uid() OR tenant_id IS NULL) WITH CHECK (COALESCE(tenant_id, auth.uid()) = auth.uid());
CREATE POLICY "tenant_servidores_delete" ON servidores FOR DELETE TO authenticated USING (tenant_id = auth.uid());`

const inputClass =
  'glass-input w-full rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-500 outline-none transition focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20'

const glassPanel =
  'glass-card relative overflow-hidden rounded-2xl'

const neonButton =
  'inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/15 px-3.5 py-1.5 text-xs font-semibold text-cyan-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-400/50 hover:bg-cyan-500/25 hover:text-white hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] disabled:opacity-50 disabled:hover:translate-y-0'

const secondaryButton =
  'inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-zinc-200 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:text-zinc-100 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] disabled:opacity-50 disabled:hover:translate-y-0'

export default function Configuracoes() {
  const { usuario, loading: loadingAuth } = useAuth()
  const isMaster = isMasterUser(usuario)
  const toast = useToast()
  const [abaAtiva, setAbaAtiva] = useState<'servidores' | 'api' | 'regras' | 'seguranca'>(
    'servidores'
  )

  const [apiKeyToken, setApiKeyToken] = useState<string | null>(null)
  const [loadingApiKey, setLoadingApiKey] = useState(false)
  const [gerandoApiKey, setGerandoApiKey] = useState(false)
  const [mostrarToken, setMostrarToken] = useState(false)

  const carregarApiKey = useCallback(async () => {
    if (!usuario?.id || !isMaster) return
    setLoadingApiKey(true)
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .or(`tenant_id.eq.${usuario.id},user_id.eq.${usuario.id}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!error && data && data.token) {
        setApiKeyToken(String(data.token))
      } else {
        const localKey = localStorage.getItem(`oneplay_apikey_${usuario.id}`)
        setApiKeyToken(localKey || null)
      }
    } catch {
      const localKey = localStorage.getItem(`oneplay_apikey_${usuario.id}`)
      if (localKey) setApiKeyToken(localKey)
    } finally {
      setLoadingApiKey(false)
    }
  }, [usuario?.id, isMaster])

  useEffect(() => {
    void carregarApiKey()
  }, [carregarApiKey])

  const handleGerarToken = async () => {
    if (!usuario?.id) return
    setGerandoApiKey(true)
    try {
      const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      const novoToken = `op_live_${randomHex}`

      await supabase
        .from('api_keys')
        .insert({
          tenant_id: usuario.id,
          user_id: usuario.id,
          nome: 'Token Único OnePlay CRM',
          token: novoToken,
        })
        .select()
        .single()

      setApiKeyToken(novoToken)
      localStorage.setItem(`oneplay_apikey_${usuario.id}`, novoToken)
      toast.success('Token Único de API gerado com sucesso!')
    } catch {
      toast.error('Erro ao gerar token único de API.')
    } finally {
      setGerandoApiKey(false)
    }
  }

  const handleCopiarToken = () => {
    if (!apiKeyToken) return
    void navigator.clipboard.writeText(apiKeyToken)
    toast.success('Token copiado com sucesso!')
  }

  const [servidores, setServidores] = useState<Servidor[]>([])
  const [loading, setLoading] = useState(true)
  const [fromDatabase, setFromDatabase] = useState(true)
  const [dbError, setDbError] = useState<string | null>(null)
  const [copiedSql, setCopiedSql] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novaUrl, setNovaUrl] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  const [novaSenha, setNovaSenha] = useState('')
  const [confirmarSenha, setConfirmarSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [mostrarConfirmar, setMostrarConfirmar] = useState(false)
  const [salvandoSenha, setSalvandoSenha] = useState(false)
  const [senhaError, setSenhaError] = useState<string | null>(null)
  const [senhaFeedback, setSenhaFeedback] = useState<string | null>(null)

  const [msgCobranca, setMsgCobranca] = useState<string>(() => {
    return (
      localStorage.getItem('oneplay_cobranca_template') ||
      'Olá, [Nome]! Constatamos que sua mensalidade OnePlay venceu em [Data]. Para reativar seu acesso instantaneamente e não perder sua programação, realize a renovação via chave PIX. Deseja receber a chave agora?'
    )
  })
  const [cobrancaFeedback, setCobrancaFeedback] = useState<string | null>(null)

  function handleSalvarMsgCobranca(e: FormEvent) {
    e.preventDefault()
    localStorage.setItem('oneplay_cobranca_template', msgCobranca)
    setCobrancaFeedback('Mensagem de cobrança do WhatsApp salva com sucesso!')
    setTimeout(() => setCobrancaFeedback(null), 3500)
  }

  async function handleAlterarSenha(e: FormEvent) {
    e.preventDefault()
    setSenhaError(null)
    setSenhaFeedback(null)

    if (novaSenha.length < 6) {
      setSenhaError('A nova senha deve ter no mínimo 6 caracteres.')
      return
    }

    if (novaSenha !== confirmarSenha) {
      setSenhaError('As senhas não coincidem.')
      return
    }

    setSalvandoSenha(true)
    try {
      const { error: updErr } = await supabase.auth.updateUser({
        password: novaSenha,
        data: { primeiro_acesso: false },
      })
      if (updErr) throw updErr

      if (usuario?.email) {
        await supabase
          .from('agentes')
          .update({ precisa_trocar_senha: false })
          .ilike('email', usuario.email.trim().toLowerCase())
      }

      setSenhaFeedback('Sua senha foi atualizada com sucesso!')
      setNovaSenha('')
      setConfirmarSenha('')
      setTimeout(() => setSenhaFeedback(null), 4000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setSenhaError(msg || 'Erro ao alterar a senha.')
    } finally {
      setSalvandoSenha(false)
    }
  }

  const carregarServidores = useCallback(async () => {
    if (!isMaster) {
      setLoading(false)
      return
    }
    setLoading(true)
    const res = await listarServidores('master', usuario?.id)
    setServidores(res.servidores)
    useCrmStore.getState().setServidores(res.servidores)
    setFromDatabase(res.fromDatabase)
    setDbError(res.error)
    setLoading(false)
  }, [usuario, isMaster])

  useEffect(() => {
    void carregarServidores()
  }, [carregarServidores])

  const handleCriarServidor = async (e: FormEvent) => {
    e.preventDefault()
    if (!novoNome.trim()) {
      setModalError('Informe o nome do servidor')
      return
    }

    setSalvando(true)
    setModalError(null)

    const userId = usuario?.id || useCrmStore.getState().user?.id
    const res = await criarServidor({
      nome: novoNome.trim(),
      url: novaUrl.trim(),
      status: 'ativo',
      tenant_id: userId ?? null,
    })

    setSalvando(false)

    if (res.error && !res.servidor) {
      setModalError(`Erro ao salvar: ${res.error}`)
      return
    }

    setNovoNome('')
    setNovaUrl('')
    setModalOpen(false)
    setFeedback('Servidor adicionado com sucesso!')
    setTimeout(() => setFeedback(null), 3000)
    void carregarServidores()
  }

  const handleToggleStatus = async (srv: Servidor) => {
    const novoStatus = srv.status === 'ativo' ? 'inativo' : 'ativo'
    setServidores((list) =>
      list.map((s) => (s.id === srv.id ? { ...s, status: novoStatus } : s))
    )
    await atualizarStatusServidor(srv.id, novoStatus)
    setFeedback(`Servidor ${srv.nome} alterado para ${novoStatus}`)
    setTimeout(() => setFeedback(null), 3000)
  }

  const handleRemover = async (id: string, nome: string) => {
    if (!window.confirm(`Tem certeza que deseja remover o servidor "${nome}"?`)) {
      return
    }
    const res = await useCrmStore.getState().excluirServidor(id)
    if (!res.success) {
      toast.error(`Falha ao remover servidor no banco de dados: ${res.error}`)
      return
    }
    setServidores((list) => list.filter((s) => s.id !== id))
    toast.success(`Servidor "${nome}" removido com sucesso.`)
  }

  const copiarSql = () => {
    void navigator.clipboard.writeText(SQL_MIGRATION)
    setCopiedSql(true)
    setTimeout(() => setCopiedSql(false), 3000)
  }

  const ativosCount = (servidores || []).filter((s) => s?.status === 'ativo').length

  if (!loadingAuth && usuario && !isMaster) {
    return <Navigate to={getSafeHomeRoute(usuario)} replace />
  }

  return (
    <div className="relative flex flex-1 min-w-0 flex-col w-full">
      <div className="relative flex flex-1 min-w-0 flex-col w-full">
        {/* Barra de Abas e Ações Internas de Configuração */}
        <div className="mb-6 glass-card rounded-2xl p-2 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
            <button
              type="button"
              onClick={() => setAbaAtiva('servidores')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                abaAtiva === 'servidores'
                  ? 'border border-cyan-500/35 bg-cyan-500/15 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.14)]'
                  : 'border border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100'
              }`}
            >
              <Server className="h-3.5 w-3.5 text-cyan-400" />
              <span>Servidores &amp; DNS</span>
              <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-mono text-zinc-200 tabular-nums [font-variant-numeric:tabular-nums]">
                {(servidores || []).length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva('api')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                abaAtiva === 'api'
                  ? 'border border-cyan-500/35 bg-cyan-500/15 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.14)]'
                  : 'border border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100'
              }`}
            >
              <Key className="h-3.5 w-3.5 text-violet-400" />
              <span>API &amp; Webhooks</span>
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva('regras')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                abaAtiva === 'regras'
                  ? 'border border-cyan-500/35 bg-cyan-500/15 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.14)]'
                  : 'border border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100'
              }`}
            >
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              <span>Regras &amp; Modelos</span>
            </button>

            <button
              type="button"
              onClick={() => setAbaAtiva('seguranca')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                abaAtiva === 'seguranca'
                  ? 'border border-cyan-500/35 bg-cyan-500/15 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.14)]'
                  : 'border border-transparent text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>Segurança</span>
            </button>
          </div>

          <div className="flex items-center gap-2 self-end lg:self-auto shrink-0 px-1">
            <button
              type="button"
              onClick={() => void carregarServidores()}
              disabled={loading}
              title="Recarregar servidores"
              className="btn-enterprise-secondary !py-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
              <span>Atualizar</span>
            </button>

            {abaAtiva === 'servidores' && (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="btn-enterprise-primary !py-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Adicionar Servidor</span>
              </button>
            )}

            {abaAtiva === 'api' && !apiKeyToken && (
              <button
                type="button"
                onClick={() => void handleGerarToken()}
                disabled={gerandoApiKey}
                className="btn-enterprise-primary !py-1.5"
              >
                {gerandoApiKey ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>Gerar Token Único</span>
              </button>
            )}

            {abaAtiva === 'api' && apiKeyToken && (
              <button
                type="button"
                onClick={handleCopiarToken}
                className="btn-enterprise-primary !py-1.5"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copiar Token</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 w-full space-y-6">
          {feedback && (
            <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 backdrop-blur-xl px-4 py-2.5 text-xs font-medium text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{feedback}</span>
            </div>
          )}

          {!fromDatabase && abaAtiva === 'servidores' && (
            <div className={`${glassPanel} border-amber-500/30 p-5`}>
              <div className="pointer-events-none absolute -top-12 -right-12 h-36 w-36 rounded-full bg-radial from-amber-500/15 to-transparent" />
              <div className="relative flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-xs font-semibold text-amber-300">
                      Tabela 'servidores' ainda não detectada no Supabase
                    </h3>
                    <p className="mt-1 text-xs text-zinc-300 leading-relaxed">
                      O CRM está utilizando cache local inteligente. Para persistir na nuvem, execute o
                      script SQL abaixo no editor do Supabase:
                    </p>
                    {dbError && (
                      <p className="mt-2 font-mono text-[11px] text-amber-200/90 bg-[#030509]/70 p-2 rounded-lg border border-amber-500/20">
                        {dbError}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={copiarSql}
                  className="inline-flex items-center gap-1.5 shrink-0 rounded-xl border border-amber-500/30 bg-amber-500/15 px-3.5 py-2 text-xs font-medium text-amber-200 transition-all duration-300 hover:-translate-y-1 hover:bg-amber-500/25 hover:shadow-[0_0_20px_rgba(251,191,36,0.2)]"
                >
                  {copiedSql ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  <span>{copiedSql ? 'SQL Copiado' : 'Copiar Script SQL'}</span>
                </button>
              </div>
            </div>
          )}

          {/* ABA 1: SERVIDORES & DNS */}
          {abaAtiva === 'servidores' && (
            <section className={`${glassPanel} p-6 space-y-5`}>
              <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-radial from-cyan-500/10 to-transparent" />

              <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
                      Servidores &amp; DNS
                    </h2>
                    <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-mono text-zinc-300 tabular-nums [font-variant-numeric:tabular-nums]">
                      {(servidores || []).length} cadastrado(s)
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Rotas IPTV disponíveis nos formulários de cadastro e edição de clientes
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                  <StatusBadge variant="ativo" label={`${ativosCount} ativo(s)`} />
                  <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className={secondaryButton}
                  >
                    <Plus className="h-3.5 w-3.5 text-cyan-400" />
                    <span>Novo Servidor</span>
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 space-y-3"
                    >
                      <div className="h-4 w-28 rounded bg-white/10 animate-pulse" />
                      <div className="h-7 w-full rounded bg-white/10 animate-pulse" />
                      <div className="h-6 w-20 rounded bg-white/5 animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : (servidores || []).length === 0 ? (
                <EmptyState
                  icon={Server}
                  title="Nenhuma rota IPTV cadastrada"
                  description="Adicione seus servidores principais e de backup (URL/DNS e porta) para disponibilizá-los automaticamente no cadastro e renovação de clientes."
                  action={
                    <button
                      type="button"
                      onClick={() => setModalOpen(true)}
                      className={neonButton}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Cadastrar Primeiro Servidor</span>
                    </button>
                  }
                  className="bg-white/[0.01] shadow-none"
                />
              ) : (
                <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {(servidores || []).map((srv) => {
                    if (!srv) return null
                    const isAtivo = srv.status === 'ativo'
                    return (
                      <article
                        key={srv.id}
                        className={`group relative overflow-hidden rounded-2xl border p-4 flex flex-col justify-between backdrop-blur-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)] ${
                          isAtivo
                            ? 'border-white/5 bg-[#06080d]/60'
                            : 'border-white/5 bg-[#06080d]/40 opacity-70'
                        }`}
                      >
                        <div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-radial from-cyan-500/10 to-transparent" />

                        <div className="relative">
                          <div className="flex items-center justify-between gap-2 mb-3">
                            <span className="font-medium text-sm text-zinc-100 truncate">
                              {srv.nome}
                            </span>
                            <StatusBadge
                              variant={isAtivo ? 'ativo' : 'neutral'}
                              label={isAtivo ? 'Ativo' : 'Pausado'}
                            />
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-zinc-300 font-mono break-all bg-[#030509]/70 px-2.5 py-2 rounded-xl border border-white/5 mb-3">
                            <Globe className="h-3.5 w-3.5 text-cyan-400/80 shrink-0" />
                            <span>{srv.url || 'URL não informada'}</span>
                          </div>
                        </div>

                        <div className="relative flex items-center justify-between pt-3 border-t border-white/5 text-xs">
                          <span className="text-zinc-500 tabular-nums [font-variant-numeric:tabular-nums]">
                            {srv.created_at
                              ? new Date(srv.created_at).toLocaleDateString('pt-BR')
                              : 'Padrão'}
                          </span>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void handleToggleStatus(srv)}
                              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-zinc-200 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-500/30 hover:text-cyan-200 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                            >
                              <Power className="h-3 w-3 text-cyan-400" />
                              <span>{isAtivo ? 'Pausar' : 'Ativar'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => void handleRemover(srv.id, srv.nome)}
                              title="Remover servidor"
                              className="rounded-lg p-1.5 text-zinc-500 transition-all duration-300 hover:bg-red-500/15 hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {/* ABA 2: API E WEBHOOKS */}
          {abaAtiva === 'api' && (
            <section className={`${glassPanel} p-6 space-y-6`}>
              <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-radial from-cyan-500/10 to-transparent" />

              <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
                <div>
                  <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
                    Cofre de API &amp; Webhooks
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Credenciais de integração para automação com Typebot, n8n e funis externos
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void carregarApiKey()}
                  disabled={loadingApiKey}
                  className={secondaryButton}
                >
                  <RefreshCw className={`h-3.5 w-3.5 text-cyan-400 ${loadingApiKey ? 'animate-spin' : ''}`} />
                  <span>Recarregar</span>
                </button>
              </div>

              {loadingApiKey ? (
                <div className="space-y-3">
                  <div className="h-24 w-full rounded-2xl bg-white/5 animate-pulse" />
                  <div className="h-32 w-full rounded-2xl bg-white/5 animate-pulse" />
                </div>
              ) : !apiKeyToken ? (
                <EmptyState
                  icon={Key}
                  title="Gere sua Credencial de Integração"
                  description="Crie um token único criptografado para conectar fluxos do Typebot, n8n ou landing pages diretamente ao seu Funil de Vendas com isolamento Multi-Tenant."
                  action={
                    <button
                      type="button"
                      onClick={() => void handleGerarToken()}
                      disabled={gerandoApiKey}
                      className={neonButton}
                    >
                      {gerandoApiKey ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      <span>{gerandoApiKey ? 'Gerando...' : 'Gerar Token Único'}</span>
                    </button>
                  }
                  className="bg-white/[0.01] shadow-none"
                />
              ) : (
                <div className="relative space-y-5">
                  <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-[#030509]/50 p-5 space-y-4">
                    <div className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full bg-radial from-cyan-500/10 to-transparent" />

                    <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-xs text-zinc-400">Token de Autenticação</span>
                        <div className="flex items-center gap-2.5 mt-1">
                          <span className="text-sm font-medium text-zinc-100">Chave Principal</span>
                          <StatusBadge variant="ativo" label="Ativo" />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleGerarToken()}
                        disabled={gerandoApiKey}
                        className={secondaryButton}
                      >
                        <RefreshCw
                          className={`h-3 w-3 text-cyan-400 ${gerandoApiKey ? 'animate-spin' : ''}`}
                        />
                        <span>Regerar Token</span>
                      </button>
                    </div>

                    <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                      <div className="flex-1 flex items-center justify-between rounded-xl border border-white/10 bg-[#030509]/80 px-4 py-2.5 font-mono text-xs text-zinc-100">
                        <span className="select-all break-all">
                          {mostrarToken
                            ? apiKeyToken
                            : `${apiKeyToken.slice(0, 6)}••••••••••••${apiKeyToken.slice(-4)}`}
                        </span>
                        <button
                          type="button"
                          onClick={() => setMostrarToken((v) => !v)}
                          className="text-zinc-400 hover:text-cyan-300 transition-colors ml-3 p-1"
                        >
                          {mostrarToken ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={handleCopiarToken}
                        className={`${neonButton} py-2.5 justify-center shrink-0`}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copiar Token</span>
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/5 bg-[#030509]/50 p-5 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
                      <Code2 className="h-4 w-4 text-cyan-400" />
                      <span>Exemplo de Requisição HTTP POST</span>
                    </div>

                    <div className="rounded-xl bg-[#030509]/90 border border-white/5 p-4 text-xs font-mono text-zinc-300 space-y-1.5 overflow-x-auto">
                      <div className="text-cyan-400">POST https://crm.oneplay.live/api/v1/leads</div>
                      <div className="text-zinc-400">
                        Authorization: Bearer {apiKeyToken.slice(0, 6)}...{apiKeyToken.slice(-4)}
                      </div>
                      <div className="text-zinc-500">Content-Type: application/json</div>
                      <pre className="text-zinc-200 pt-2">
                        {`{\n  "nome": "Carlos Souza",\n  "whatsapp": "5511999998888",\n  "plano": "Mensal",\n  "estagio": "teste"\n}`}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ABA 3: REGRAS & MODELOS */}
          {abaAtiva === 'regras' && (
            <div className="space-y-6">
              <section className={`${glassPanel} p-6 space-y-5`}>
                <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-radial from-cyan-500/10 to-transparent" />

                <div className="relative pb-4 border-b border-white/5">
                  <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
                    Regras Operacionais &amp; SLA
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Parâmetros de expiração de testes rápidos e controle de atendimento
                  </p>
                </div>

                <div className="relative grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-2xl border border-white/5 bg-[#030509]/50 p-4 space-y-2.5 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-amber-400" />
                      <h3 className="text-xs font-semibold text-zinc-100">Testes Express</h3>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Calculados somando 4h ou 24h ao horário oficial no momento da ativação.
                    </p>
                    <div className="rounded-lg bg-[#030509]/80 border border-white/5 px-2.5 py-1.5 text-[11px] text-cyan-300 font-mono tabular-nums">
                      NOW() + INTERVAL 'N hours'
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/5 bg-[#030509]/50 p-4 space-y-2.5 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                    <div className="flex items-center gap-2">
                      <Activity className="h-4 w-4 text-cyan-400" />
                      <h3 className="text-xs font-semibold text-zinc-100">Janela de Follow-up</h3>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Oportunidades sem movimentação há mais de 24 horas entram em fila prioritária.
                    </p>
                    <div className="rounded-lg bg-[#030509]/80 border border-white/5 px-2.5 py-1.5 text-[11px] text-cyan-300 font-mono tabular-nums">
                      tolerancia = 24 horas
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/5 bg-[#030509]/50 p-4 space-y-2.5 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-violet-400" />
                      <h3 className="text-xs font-semibold text-zinc-100">SLA de Suporte</h3>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Chamados na coluna Suporte Técnico operam com meta de resolução de até 8 horas.
                    </p>
                    <div className="rounded-lg bg-[#030509]/80 border border-white/5 px-2.5 py-1.5 text-[11px] text-cyan-300 font-mono tabular-nums">
                      sla_suporte = 8 horas
                    </div>
                  </div>
                </div>
              </section>

              <section className={`${glassPanel} p-6 space-y-5`}>
                <div className="pb-4 border-b border-white/5">
                  <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
                    Modelos de Mensagens WhatsApp
                  </h2>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Templates utilizados nos disparos rápidos do Funil e Retenção
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="rounded-2xl border border-white/5 bg-[#030509]/50 p-4 space-y-2.5 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-100">Follow-up Pós-Teste</span>
                      <StatusBadge variant="neutral" label="Funil" showDot={false} />
                    </div>
                    <p className="text-xs text-zinc-400 font-mono leading-relaxed">
                      Olá, {'{nome}'}! Vi que realizou seu teste na OnePlay. Posso ativar sua assinatura hoje?
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/5 bg-[#030509]/50 p-4 space-y-2.5 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-100">Aviso de Vencimento</span>
                      <StatusBadge variant="vencendo" label="Alerta" />
                    </div>
                    <p className="text-xs text-zinc-400 font-mono leading-relaxed">
                      Olá, {'{nome}'}! Sua assinatura vence em {'{vencimento}'}. Deseja renovar via PIX?
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/5 bg-[#030509]/50 p-4 space-y-2.5 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-100">Teste Rápido</span>
                      <StatusBadge variant="teste" label="Leads" />
                    </div>
                    <p className="text-xs text-zinc-400 font-mono leading-relaxed">
                      Seu teste OnePlay de {'{horas}'}h foi ativado com sucesso! Válido até {'{expiracao}'}.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/5 bg-[#030509]/50 p-4 space-y-2.5 transition-all duration-300 hover:-translate-y-1 hover:border-cyan-500/30 hover:shadow-[0_0_20px_rgba(34,211,238,0.2)]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-100">Reativação</span>
                      <StatusBadge variant="vencido" label="Vencido" />
                    </div>
                    <p className="text-xs text-zinc-400 font-mono leading-relaxed">
                      Olá, {'{nome}'}! Constatamos que sua mensalidade venceu. Renove via PIX para reativar.
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={handleSalvarMsgCobranca}
                  className="rounded-2xl border border-white/5 bg-[#030509]/50 p-5 space-y-3.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <MessageCircle className="h-4 w-4 text-emerald-400" />
                      <div>
                        <h3 className="text-xs font-semibold text-zinc-100">
                          Template Personalizado de Cobrança (Retenção)
                        </h3>
                        <p className="text-xs text-zinc-400">
                          Variáveis dinâmicas:{' '}
                          <span className="font-mono text-cyan-300">[Nome]</span> e{' '}
                          <span className="font-mono text-cyan-300">[Data]</span>
                        </p>
                      </div>
                    </div>

                    <button type="submit" className={neonButton}>
                      <Check className="h-3.5 w-3.5" />
                      <span>Salvar Modelo</span>
                    </button>
                  </div>

                  <textarea
                    value={msgCobranca}
                    onChange={(e) => setMsgCobranca(e.target.value)}
                    rows={3}
                    className={`${inputClass} font-mono leading-relaxed resize-y`}
                  />

                  {cobrancaFeedback && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>{cobrancaFeedback}</span>
                    </div>
                  )}
                </form>
              </section>
            </div>
          )}

          {/* ABA 4: SEGURANÇA */}
          {abaAtiva === 'seguranca' && (
            <section className={`${glassPanel} p-6 space-y-5`}>
              <div className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-radial from-cyan-500/10 to-transparent" />

              <div className="relative pb-4 border-b border-white/5">
                <h2 className="text-sm font-semibold tracking-tight text-zinc-100">
                  Segurança &amp; Credenciais
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Atualize sua senha pessoal de acesso ao painel
                </p>
              </div>

              <form onSubmit={handleAlterarSenha} className="relative max-w-md space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Nova Senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                    <input
                      type={mostrarSenha ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={novaSenha}
                      onChange={(e) => setNovaSenha(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className={`${inputClass} pl-9 pr-9`}
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenha((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
                      tabIndex={-1}
                    >
                      {mostrarSenha ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Confirmar Nova Senha
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                    <input
                      type={mostrarConfirmar ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmarSenha}
                      onChange={(e) => setConfirmarSenha(e.target.value)}
                      placeholder="Repita a nova senha"
                      className={`${inputClass} pl-9 pr-9`}
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarConfirmar((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
                      tabIndex={-1}
                    >
                      {mostrarConfirmar ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {senhaError && (
                  <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{senhaError}</span>
                  </div>
                )}

                {senhaFeedback && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>{senhaFeedback}</span>
                  </div>
                )}

                <button type="submit" disabled={salvandoSenha} className={`${neonButton} py-2`}>
                  {salvandoSenha && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Atualizar Senha</span>
                </button>
              </form>
            </section>
          )}
        </div>
      </div>

      {/* Modal Glassmorphic: Adicionar Novo Servidor */}
      {modalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in"
        >
          <div className="relative overflow-hidden w-full max-w-md rounded-2xl border border-white/5 bg-[#06080d]/60 backdrop-blur-2xl p-6 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] space-y-5 animate-in zoom-in-95">
            <div className="pointer-events-none absolute -top-14 -right-14 h-40 w-40 rounded-full bg-radial from-cyan-500/10 to-transparent" />

            <div className="relative flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-400">
                  <Server className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold tracking-tight text-zinc-100">
                  Cadastrar Servidor IPTV
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl p-1.5 text-zinc-400 hover:bg-white/5 hover:text-zinc-100 transition-all duration-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCriarServidor} className="relative space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Nome do Servidor <span className="text-cyan-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="Ex: Servidor Principal 4K"
                  className={inputClass}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  URL / DNS / Porta
                </label>
                <input
                  type="text"
                  value={novaUrl}
                  onChange={(e) => setNovaUrl(e.target.value)}
                  placeholder="Ex: http://dns.oneplay.live:8080"
                  className={`${inputClass} font-mono`}
                />
              </div>

              {modalError && (
                <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className={secondaryButton}
                >
                  Cancelar
                </button>
                <button type="submit" disabled={salvando} className={neonButton}>
                  {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{salvando ? 'Salvando...' : 'Salvar Servidor'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
