export type StatusAssinatura = 'ativo' | 'alerta_vencimento' | 'inativo' | string

export interface Cliente {
  id: string | number
  nome?: string | null
  nome_completo?: string | null
  whatsapp?: string | null
  email?: string | null
  login_usuario?: string | null
  senha?: string | null
  plano?: string | null
  valor_mensal?: number | null
  Status?: string | null
  status?: string | null
  data_vencimento?: string | null
  estagio_funil?: string | null
  vendedor_id?: string | null
  agente_id?: string | null
  tenant_id?: string | null
  em_suporte?: boolean | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export type NovoCliente = Omit<Cliente, 'id' | 'created_at'>

