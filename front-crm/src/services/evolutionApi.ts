/**
 * OnePlay CRM — Serviço Modular de Automação WhatsApp (Evolution API v1 / v2)
 * Suporta credenciais via Variáveis de Ambiente (.env.local) ou Configurações Armazenadas por Perfil.
 */

export interface EvolutionApiConfig {
  baseUrl: string
  apiKey: string
  instanceName: string
}

export type EvolutionConnectionState =
  | 'open'
  | 'connecting'
  | 'close'
  | 'unconfigured'
  | 'error'

export interface EvolutionInstanceStatus {
  connected: boolean
  state: EvolutionConnectionState
  instanceName: string
  message: string
  raw?: unknown
}

export interface EvolutionSendResult {
  success: boolean
  phone: string
  messageId?: string
  statusMessage: string
  error?: string
  raw?: unknown
}

export interface BillingMessageParams {
  nome: string
  vencimento?: string | null
  plano?: string | null
  valorMensal?: number | string | null
  status?: string | null
  tipo?: 'cobranca' | 'vencido' | 'boas-vindas'
}

const STORAGE_PREFIX = 'oneplay_evolution_config'
const REQUEST_TIMEOUT_MS = 12_000

function getStorageKey(userId?: string | null): string {
  const cleanId = String(userId || '').trim()
  return cleanId ? `${STORAGE_PREFIX}_${cleanId}` : STORAGE_PREFIX
}

function sanitizeBaseUrl(url: string): string {
  return String(url || '').trim().replace(/\/+$/, '')
}

/**
 * Normaliza números telefónicos para o padrão internacional exigido pela Evolution API (DDI + DDD + Número).
 */
export function normalizeEvolutionPhone(phone: string): string {
  if (!phone) return ''
  let digits = String(phone).replace(/\D/g, '')
  if (!digits) return ''

  // Remove prefixo internacional 00 caso informado
  if (digits.startsWith('00')) {
    digits = digits.slice(2)
  }

  // Números nacionais brasileiros (DDD + 8 ou 9 dígitos) recebem DDI 55 automaticamente
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`
  }

  return digits
}

/**
 * Obtém a configuração ativa da Evolution API combinando:
 * 1. Configurações salvas no perfil do operador (localStorage isolado por utilizador ou global)
 * 2. Variáveis de ambiente Vite (`VITE_EVOLUTION_API_URL`, `VITE_EVOLUTION_API_KEY`, `VITE_EVOLUTION_INSTANCE_NAME`)
 */
export function getEvolutionConfig(userId?: string | null): EvolutionApiConfig {
  const envUrl = sanitizeBaseUrl(
    String(
      import.meta.env.VITE_EVOLUTION_API_URL ??
        import.meta.env.VITE_EVOLUTION_BASE_URL ??
        ''
    )
  )
  const envKey = String(
    import.meta.env.VITE_EVOLUTION_API_KEY ??
      import.meta.env.VITE_EVOLUTION_GLOBAL_API_KEY ??
      ''
  ).trim()
  const envInstance = String(
    import.meta.env.VITE_EVOLUTION_INSTANCE_NAME ??
      import.meta.env.VITE_EVOLUTION_INSTANCE ??
      'oneplay-crm'
  ).trim()

  let stored: Partial<EvolutionApiConfig> = {}
  try {
    const userRaw = userId ? localStorage.getItem(getStorageKey(userId)) : null
    const globalRaw = localStorage.getItem(STORAGE_PREFIX)
    const rawToParse = userRaw || globalRaw
    if (rawToParse) {
      const parsed = JSON.parse(rawToParse) as Partial<EvolutionApiConfig>
      if (parsed && typeof parsed === 'object') {
        stored = parsed
      }
    }
  } catch {
    // Fallback silencioso para variáveis de ambiente
  }

  return {
    baseUrl: sanitizeBaseUrl(stored.baseUrl || envUrl),
    apiKey: String(stored.apiKey || envKey).trim(),
    instanceName: String(stored.instanceName || envInstance || 'oneplay-crm').trim(),
  }
}

/**
 * Persiste as credenciais da Evolution API no escopo do operador autenticado (ou global).
 */
export function saveEvolutionConfig(
  config: Partial<EvolutionApiConfig>,
  userId?: string | null,
  options?: { syncGlobal?: boolean }
): EvolutionApiConfig {
  const current = getEvolutionConfig(userId)
  const next: EvolutionApiConfig = {
    baseUrl:
      config.baseUrl !== undefined ? sanitizeBaseUrl(config.baseUrl) : current.baseUrl,
    apiKey: config.apiKey !== undefined ? String(config.apiKey).trim() : current.apiKey,
    instanceName:
      config.instanceName !== undefined
        ? String(config.instanceName).trim()
        : current.instanceName,
  }

  try {
    const serialized = JSON.stringify(next)
    localStorage.setItem(getStorageKey(userId), serialized)
    if (options?.syncGlobal || !userId) {
      localStorage.setItem(STORAGE_PREFIX, serialized)
    }
  } catch {
    // Ignora falhas de quota em ambientes restritos
  }

  return next
}

export function isEvolutionConfigured(userId?: string | null): boolean {
  const cfg = getEvolutionConfig(userId)
  return Boolean(cfg.baseUrl && cfg.apiKey && cfg.instanceName)
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timer)
  }
}

function extractApiErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message
    if (Array.isArray(obj.message) && obj.message.length > 0) {
      return obj.message.map((m) => String(m)).join('; ')
    }
    const resp = obj.response as Record<string, unknown> | undefined
    if (resp) {
      if (typeof resp.message === 'string' && resp.message.trim()) return resp.message
      if (Array.isArray(resp.message) && resp.message.length > 0) {
        return resp.message.map((m) => String(m)).join('; ')
      }
    }
    if (typeof obj.error === 'string' && obj.error.trim()) return obj.error
  }

  if (status === 401 || status === 403) {
    return 'Global API Key inválida ou sem permissão na Evolution API.'
  }
  if (status === 404) {
    return 'Instância ou endpoint não encontrado na Evolution API.'
  }
  return `Falha na comunicação com a Evolution API (HTTP ${status}).`
}

/**
 * Verifica o estado em tempo real da instância WhatsApp na Evolution API (`GET /instance/connectionState/{instance}`).
 */
export async function checkInstanceStatus(options?: {
  userId?: string | null
  configOverride?: Partial<EvolutionApiConfig>
}): Promise<EvolutionInstanceStatus> {
  const baseCfg = getEvolutionConfig(options?.userId)
  const cfg: EvolutionApiConfig = {
    baseUrl:
      options?.configOverride?.baseUrl !== undefined
        ? sanitizeBaseUrl(options.configOverride.baseUrl)
        : baseCfg.baseUrl,
    apiKey:
      options?.configOverride?.apiKey !== undefined
        ? String(options.configOverride.apiKey).trim()
        : baseCfg.apiKey,
    instanceName:
      options?.configOverride?.instanceName !== undefined
        ? String(options.configOverride.instanceName).trim()
        : baseCfg.instanceName,
  }

  if (!cfg.baseUrl || !cfg.apiKey || !cfg.instanceName) {
    return {
      connected: false,
      state: 'unconfigured',
      instanceName: cfg.instanceName || '—',
      message:
        'Credenciais da Evolution API pendentes (configure URL Base, API Key e Instância).',
    }
  }

  const endpoint = `${cfg.baseUrl}/instance/connectionState/${encodeURIComponent(cfg.instanceName)}`

  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          apikey: cfg.apiKey,
        },
      },
      8_000
    )

    const body = await response.json().catch(() => null)

    if (!response.ok) {
      return {
        connected: false,
        state: 'error',
        instanceName: cfg.instanceName,
        message: extractApiErrorMessage(body, response.status),
        raw: body,
      }
    }

    const record = (body ?? {}) as Record<string, unknown>
    const instanceObj = (record.instance ?? {}) as Record<string, unknown>
    const rawState = String(
      instanceObj.state ?? record.state ?? record.status ?? ''
    )
      .trim()
      .toLowerCase()

    if (rawState === 'open' || rawState === 'connected') {
      return {
        connected: true,
        state: 'open',
        instanceName: cfg.instanceName,
        message: `Instância "${cfg.instanceName}" online e operacional.`,
        raw: body,
      }
    }

    if (rawState === 'connecting') {
      return {
        connected: false,
        state: 'connecting',
        instanceName: cfg.instanceName,
        message: `Instância "${cfg.instanceName}" aguardando leitura de QR Code.`,
        raw: body,
      }
    }

    return {
      connected: false,
      state: 'close',
      instanceName: cfg.instanceName,
      message: `Instância "${cfg.instanceName}" desconectada na Evolution API.`,
      raw: body,
    }
  } catch (err: unknown) {
    const isTimeout = err instanceof DOMException && err.name === 'AbortError'
    return {
      connected: false,
      state: 'error',
      instanceName: cfg.instanceName,
      message: isTimeout
        ? 'Tempo limite excedido ao consultar a Evolution API.'
        : 'Não foi possível conectar ao servidor da Evolution API (verifique a URL Base e CORS).',
    }
  }
}

/**
 * Envia mensagem de texto diretamente via Evolution API (`POST /message/sendText/{instance}`),
 * com compatibilidade automática entre Evolution API v2 (`{ number, text }`) e v1 (`{ number, textMessage }`).
 */
export async function sendMessage(
  phone: string,
  message: string,
  options?: {
    userId?: string | null
    delayMs?: number
  }
): Promise<EvolutionSendResult> {
  const normalizedPhone = normalizeEvolutionPhone(phone)
  const cleanText = String(message || '').trim()

  if (!normalizedPhone || normalizedPhone.length < 10) {
    return {
      success: false,
      phone: normalizedPhone,
      statusMessage: 'Número de WhatsApp inválido.',
      error: 'O cliente não possui um número de WhatsApp válido cadastrado.',
    }
  }

  if (!cleanText) {
    return {
      success: false,
      phone: normalizedPhone,
      statusMessage: 'Mensagem vazia.',
      error: 'O conteúdo da mensagem não pode estar vazio.',
    }
  }

  const cfg = getEvolutionConfig(options?.userId)
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.instanceName) {
    return {
      success: false,
      phone: normalizedPhone,
      statusMessage: 'Evolution API não configurada.',
      error:
        'Configure a URL Base, Global API Key e Instância da Evolution API em Configurações Globais (ou no .env.local).',
    }
  }

  const endpoint = `${cfg.baseUrl}/message/sendText/${encodeURIComponent(cfg.instanceName)}`
  const delay = options?.delayMs ?? 900

  try {
    // 1. Formato nativo Evolution API v2
    let response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: cfg.apiKey,
      },
      body: JSON.stringify({
        number: normalizedPhone,
        text: cleanText,
        delay,
        linkPreview: false,
      }),
    })

    let body = await response.json().catch(() => null)

    // 2. Fallback automático para Evolution API v1 caso o DTO exija `textMessage`
    if (
      response.status === 400 &&
      JSON.stringify(body || '').toLowerCase().includes('textmessage')
    ) {
      response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          apikey: cfg.apiKey,
        },
        body: JSON.stringify({
          number: normalizedPhone,
          options: {
            delay,
            presence: 'composing',
            linkPreview: false,
          },
          textMessage: {
            text: cleanText,
          },
        }),
      })
      body = await response.json().catch(() => null)
    }

    if (!response.ok) {
      const apiErr = extractApiErrorMessage(body, response.status)
      return {
        success: false,
        phone: normalizedPhone,
        statusMessage: 'Falha no disparo via Evolution API.',
        error: apiErr,
        raw: body,
      }
    }

    const record = (body ?? {}) as Record<string, unknown>
    const keyObj = (record.key ?? {}) as Record<string, unknown>
    const messageId =
      typeof keyObj.id === 'string'
        ? keyObj.id
        : typeof record.messageId === 'string'
          ? record.messageId
          : undefined

    return {
      success: true,
      phone: normalizedPhone,
      messageId,
      statusMessage: 'Mensagem enviada com sucesso via Evolution API!',
      raw: body,
    }
  } catch (err: unknown) {
    const isTimeout = err instanceof DOMException && err.name === 'AbortError'
    return {
      success: false,
      phone: normalizedPhone,
      statusMessage: 'Erro de conexão com a Evolution API.',
      error: isTimeout
        ? 'O servidor da Evolution API demorou demasiado a responder (timeout).'
        : 'Não foi possível contactar a Evolution API. Verifique a URL Base e a conexão da instância.',
    }
  }
}

/**
 * Gera a mensagem comercial pré-formatada de cobrança/renovação para o assinante,
 * respeitando modelos personalizados salvos no perfil do operador.
 */
export function buildBillingMessage(
  params: BillingMessageParams,
  userId?: string | null
): string {
  const nome = String(params.nome || 'Cliente').trim() || 'Cliente'
  const plano = String(params.plano || 'Plano Mensal').trim() || 'Plano Mensal'
  const vencimento =
    params.vencimento && params.vencimento !== 'Sem data'
      ? String(params.vencimento).trim()
      : 'em breve'

  const valorStr =
    params.valorMensal != null && Number.isFinite(Number(params.valorMensal))
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
          Number(params.valorMensal)
        )
      : null

  const statusLower = String(params.status || '').trim().toLowerCase()
  const tipo =
    params.tipo ??
    (statusLower === 'vencido' || statusLower === 'inativo'
      ? 'vencido'
      : 'cobranca')

  if (tipo === 'boas-vindas') {
    return `Olá *${nome}*, seja muito bem-vindo ao OnePlay! O seu acesso ao *${plano}* já está ativo e liberado. Salve este contato para atendimento prioritário e renovações. Excelente sessão!`
  }

  // Verifica se o operador salvou um modelo customizado de cobrança em Configurações
  if (tipo === 'cobranca') {
    try {
      const customKey = userId
        ? `oneplay_cobranca_template_${userId}`
        : 'oneplay_cobranca_template'
      const savedTemplate =
        localStorage.getItem(customKey) || localStorage.getItem('oneplay_cobranca_template')
      if (savedTemplate && savedTemplate.trim()) {
        return savedTemplate
          .replace(/\[Nome\]|\{nome\}/gi, nome)
          .replace(/\[Data\]|\{vencimento\}/gi, vencimento)
          .replace(/\[Plano\]|\{plano\}/gi, plano)
      }
    } catch {
      // Fallback para template padrão
    }
  }

  if (tipo === 'vencido') {
    const detalheValor = valorStr ? ` (${valorStr})` : ''
    return `Olá *${nome}*, identificamos que a sua assinatura OnePlay (*${plano}*${detalheValor}) venceu em *${vencimento}*. Podemos reativar o seu acesso imediatamente via PIX para continuar aproveitando toda a programação. Vamos renovar hoje?`
  }

  const detalheVencimento =
    vencimento === 'em breve' ? 'vence em breve' : `vence em *${vencimento}*`
  const detalheValor = valorStr ? ` no valor de *${valorStr}*` : ''

  return `Olá *${nome}*, sua assinatura OnePlay (*${plano}*${detalheValor}) ${detalheVencimento}. Para evitar interrupções no seu acesso e garantir a renovação imediata, responda esta mensagem!`
}
