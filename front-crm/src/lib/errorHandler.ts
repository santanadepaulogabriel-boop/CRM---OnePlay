/**
 * Utilitário central de tratamento de erros.
 * Garante que qualquer erro (instância de Error, PostgrestError do Supabase, objeto serializável ou string)
 * seja convertido em texto claro e legível, eliminando a exibição de "[object Object]" em notificações ou logs.
 */
export function getErrorMessage(err: unknown): string {
  if (!err) return 'Ocorreu um erro desconhecido.'
  if (typeof err === 'string') return err
  if (err instanceof Error && err.message) return err.message

  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>
    // 1. PostgrestError padrão do Supabase: { message, details, hint, code }
    if (typeof obj.message === 'string' && obj.message.trim()) {
      const details = typeof obj.details === 'string' && obj.details.trim() ? ` (${obj.details})` : ''
      const hint = typeof obj.hint === 'string' && obj.hint.trim() ? ` Dica: ${obj.hint}` : ''
      return `${obj.message}${details}${hint}`
    }

    // 2. Erros de autenticação do Supabase: { error_description } ou { error }
    if (typeof obj.error_description === 'string' && obj.error_description.trim()) {
      return obj.error_description
    }
    if (typeof obj.error === 'string' && obj.error.trim()) {
      return obj.error
    }

    // 3. Fallback com JSON.stringify
    try {
      const json = JSON.stringify(err)
      if (json && json !== '{}' && json !== '[]') {
        return json
      }
    } catch {
      // Ignora erro de serialização circular
    }
  }

  const str = String(err)
  return str === '[object Object]' ? 'Erro de comunicação com o Supabase. Verifique o console.' : str
}
