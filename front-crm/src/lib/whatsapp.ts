import type { Cliente } from './types'

/**
 * Utilitário de Sanitização:
 * Remove todos os espaços, parênteses e traços, garantindo que o número contém apenas dígitos via regex.
 * Se o número tiver 10 ou 11 dígitos (DDD + número brasileiro), adiciona o DDI 55.
 */
export function formatarTelefone(telefone: string): string {
  if (!telefone) return ''
  const apenasDigitos = telefone.replace(/\D/g, '')
  if (!apenasDigitos) return ''
  if (apenasDigitos.length === 10 || apenasDigitos.length === 11) {
    return `55${apenasDigitos}`
  }
  return apenasDigitos
}

/**
 * Gerador de Link Dinâmico:
 * Constrói uma mensagem dinâmica baseada na coluna Status ('alerta_vencimento' / 'alerta', 'inativo' / 'vencido', 'ativo'),
 * unificando minúsculas e maiúsculas (ex: 'Ativo' e 'ativo'), aplica encodeURIComponent
 * e retorna no formato https://wa.me/${telefoneSanitizado}?text=${mensagemCodificada}.
 */
export function gerarLinkWhatsApp(cliente: Partial<Cliente> & Record<string, unknown>): string {
  const tel = String(cliente.whatsapp || cliente.telefone || cliente.tel || '').trim()
  const telefoneSanitizado = formatarTelefone(tel)
  if (!telefoneSanitizado) return ''

  const nomeRaw = String(cliente.nome || cliente.nome_completo || 'Cliente').trim()
  const primeiroNome = nomeRaw.split(' ')[0] || 'Cliente'

  const statusRaw = cliente.Status ?? cliente.status
  const statusLower = typeof statusRaw === 'string' ? statusRaw.trim().toLowerCase() : ''

  let mensagem: string

  if (statusLower === 'alerta_vencimento' || statusLower === 'alerta') {
    mensagem = `Olá, ${primeiroNome}! A sua assinatura do OnePlay vence em breve. Segue o link para renovação: [INSERIR LINK]`
  } else if (statusLower === 'inativo' || statusLower === 'vencido') {
    mensagem = `Olá, ${primeiroNome}! Notamos que a sua assinatura do OnePlay está inativa. Gostaria de reativar o seu acesso agora mesmo? Segue o link para reativação: [INSERIR LINK]`
  } else {
    // 'ativo' ou padrão
    mensagem = `Olá, ${primeiroNome}! Tudo bem? Passando para saber como está sendo a sua experiência com o OnePlay. Qualquer dúvida ou suporte, estamos à disposição!`
  }

  const mensagemCodificada = encodeURIComponent(mensagem)
  return `https://wa.me/${telefoneSanitizado}?text=${mensagemCodificada}`
}
