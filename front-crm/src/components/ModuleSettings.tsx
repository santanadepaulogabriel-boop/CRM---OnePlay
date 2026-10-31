import React, { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Loader2,
  MessageSquare,
  Power,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { isMasterUser } from '../lib/multiTenant'
import {
  checkInstanceStatus,
  getEvolutionConfig,
  saveEvolutionConfig,
  type EvolutionInstanceStatus,
} from '../services/evolutionApi'

export const ModuleSettings: React.FC = () => {
  const { usuario } = useAuth()
  const toast = useToast()
  const isMaster = isMasterUser(usuario)
  const storageKey =
    !isMaster && usuario?.id
      ? `oneplay_whatsapp_module_${usuario.id}`
      : 'oneplay_whatsapp_module'

  const [whatsappActive, setWhatsappActive] = useState<boolean>(() => {
    try {
      const savedState = localStorage.getItem(storageKey)
      return savedState ? Boolean(JSON.parse(savedState)) : true
    } catch {
      return true
    }
  })

  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [instanceName, setInstanceName] = useState('oneplay-crm')
  const [showApiKey, setShowApiKey] = useState(false)
  const [testingStatus, setTestingStatus] = useState(false)
  const [instanceStatus, setInstanceStatus] = useState<EvolutionInstanceStatus | null>(null)

  useEffect(() => {
    try {
      const savedState = localStorage.getItem(storageKey)
      setWhatsappActive(savedState ? Boolean(JSON.parse(savedState)) : true)
    } catch {
      setWhatsappActive(true)
    }

    const cfg = getEvolutionConfig(usuario?.id)
    setBaseUrl(cfg.baseUrl)
    setApiKey(cfg.apiKey)
    setInstanceName(cfg.instanceName || 'oneplay-crm')
  }, [storageKey, usuario?.id])

  const handleVerificarConexao = useCallback(
    async (silent = false) => {
      setTestingStatus(true)
      try {
        const res = await checkInstanceStatus({
          userId: usuario?.id,
          configOverride: {
            baseUrl,
            apiKey,
            instanceName,
          },
        })
        setInstanceStatus(res)
        if (!silent) {
          if (res.connected) {
            toast.success(res.message, 'Evolution API')
          } else {
            toast.warning(res.message, 'Status da Instância')
          }
        }
      } finally {
        setTestingStatus(false)
      }
    },
    [usuario?.id, baseUrl, apiKey, instanceName, toast]
  )

  useEffect(() => {
    const cfg = getEvolutionConfig(usuario?.id)
    if (cfg.baseUrl && cfg.apiKey) {
      void handleVerificarConexao(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario?.id])

  const handleToggle = () => {
    const next = !whatsappActive
    setWhatsappActive(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Ignore storage error
    }
  }

  const handleSalvarCredenciais = (e: React.FormEvent) => {
    e.preventDefault()
    const saved = saveEvolutionConfig(
      {
        baseUrl,
        apiKey,
        instanceName: instanceName || 'oneplay-crm',
      },
      usuario?.id,
      { syncGlobal: isMaster }
    )
    setBaseUrl(saved.baseUrl)
    setApiKey(saved.apiKey)
    setInstanceName(saved.instanceName)
    toast.success('Credenciais da Evolution API salvas com sucesso!', 'Evolution API')
    void handleVerificarConexao(true)
  }

  return (
    <section className="w-full mt-6 space-y-5 text-zinc-100">
      <div className="glass-card rounded-2xl p-6 space-y-6">
        {/* Cabeçalho do Módulo WhatsApp + Evolution API */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-start gap-4">
            <div
              className={`p-3 rounded-2xl border shrink-0 transition-colors ${whatsappActive
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.15)]'
                  : 'bg-white/[0.04] border-white/10 text-zinc-400'
                }`}
            >
              <MessageSquare className="w-5 h-5" />
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h3 className="text-sm font-semibold tracking-tight text-zinc-100 flex items-center gap-2">
                  <span>
                    Integração Evolution API — WhatsApp{' '}
                    {isMaster ? 'Corporativo' : 'da Carteira'}
                  </span>
                </h3>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${whatsappActive
                      ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
                      : 'bg-white/[0.04] text-zinc-400 border-white/10'
                    }`}
                >
                  {whatsappActive ? 'Ativo na Operação' : 'Pausado'}
                </span>

                {instanceStatus && (
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${instanceStatus.connected
                        ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                        : instanceStatus.state === 'unconfigured'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                      }`}
                  >
                    {instanceStatus.connected ? (
                      <Wifi className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <WifiOff className="w-3 h-3" />
                    )}
                    <span>
                      {instanceStatus.connected
                        ? `Instância Online (${instanceStatus.instanceName})`
                        : instanceStatus.state === 'unconfigured'
                          ? 'Credenciais Pendentes'
                          : 'Instância Desconectada'}
                    </span>
                  </span>
                )}
              </div>

              <p className="text-xs text-zinc-400 max-w-2xl leading-relaxed">
                {isMaster
                  ? 'Conecte o motor Evolution API para disparo automático de cobranças, lembretes de vencimento e renovações em um clique (suporta variáveis VITE_EVOLUTION_* ou credenciais armazenadas abaixo).'
                  : 'Configure a sua instância exclusiva da Evolution API para disparo direto de cobranças e renovações via WhatsApp na sua carteira isolada.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 self-end md:self-center shrink-0">
            <div className="hidden sm:flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-300">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>{isMaster ? 'Evolution Gateway' : 'Perfil Isolado'}</span>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            </div>

            <button
              type="button"
              onClick={handleToggle}
              className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border transition-colors duration-200 ease-in-out focus:outline-none ${whatsappActive
                  ? 'bg-cyan-500/80 border-cyan-400/50 shadow-[0_0_16px_rgba(34,211,238,0.28)]'
                  : 'bg-white/[0.08] border-white/15'
                }`}
            >
              <span className="sr-only">Alternar Módulo WhatsApp</span>
              <span
                className={`pointer-events-none flex h-6 w-6 translate-y-[1px] items-center justify-center rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${whatsappActive ? 'translate-x-7' : 'translate-x-0.5'
                  }`}
              >
                <Power
                  className={`w-3 h-3 ${whatsappActive ? 'text-cyan-600' : 'text-zinc-500'}`}
                />
              </span>
            </button>
          </div>
        </div>

        {/* Formulário de Credenciais da Evolution API */}
        <form
          onSubmit={handleSalvarCredenciais}
          className="pt-5 border-t border-white/[0.08] space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <span>URL Base da Evolution API</span>
              </label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.seudominio.com"
                className="glass-input h-9 w-full rounded-xl px-3.5 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                <KeyRound className="w-3.5 h-3.5 text-cyan-400" />
                <span>Global API Key / Token</span>
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Insira sua Global API Key..."
                  className="glass-input h-9 w-full rounded-xl pl-3.5 pr-9 text-xs font-mono text-zinc-100 placeholder-zinc-500 outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 transition-colors"
                  aria-label="Mostrar ou ocultar Global API Key"
                >
                  {showApiKey ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                <Server className="w-3.5 h-3.5 text-cyan-400" />
                <span>Nome da Instância</span>
              </label>
              <input
                type="text"
                value={instanceName}
                onChange={(e) => setInstanceName(e.target.value)}
                placeholder="oneplay-crm"
                className="glass-input h-9 w-full rounded-xl px-3.5 text-xs font-mono text-zinc-100 placeholder-zinc-500 outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20"
              />
            </div>
          </div>

          {instanceStatus && (
            <div
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${instanceStatus.connected
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : instanceStatus.state === 'unconfigured'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                }`}
            >
              {instanceStatus.connected ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{instanceStatus.message}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-zinc-500">
              Variáveis suportadas via ambiente:{' '}
              <code className="text-zinc-300 font-mono">VITE_EVOLUTION_API_URL</code>,{' '}
              <code className="text-zinc-300 font-mono">VITE_EVOLUTION_API_KEY</code> e{' '}
              <code className="text-zinc-300 font-mono">VITE_EVOLUTION_INSTANCE_NAME</code>.
            </p>

            <div className="flex items-center gap-2.5 ml-auto">
              <button
                type="button"
                disabled={testingStatus}
                onClick={() => void handleVerificarConexao(false)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-xs font-medium text-zinc-200 hover:border-cyan-500/35 hover:text-white transition-all disabled:opacity-50"
              >
                {testingStatus ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-400" />
                )}
                <span>Testar Instância</span>
              </button>

              <button
                type="submit"
                className="btn-enterprise-primary h-9"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Credenciais</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  )
}

export default ModuleSettings
