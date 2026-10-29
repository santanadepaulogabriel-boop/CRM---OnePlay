import { useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useCrmStore } from '../stores/useCrmStore'

/**
 * Hook de Feature Gating para Revendedores OnePlay:
 * Intercepta chamadas de ações críticas (Novo Cliente, Renovar Assinatura, Conversão de Leads)
 * quando o agente for revendedor e possuir saldo de créditos <= 0.
 *
 * Funções liberadas: Navegação, visualização de cartões, painel de métricas e configurações.
 */
export function useFeatureGating() {
  const { usuario } = useAuth()
  const creditosStore = useCrmStore((state) => state.creditos)
  const modalAcessoRestritoOpen = useCrmStore((state) => state.modalAcessoRestritoOpen)
  const abrirModalAcessoRestrito = useCrmStore((state) => state.abrirModalAcessoRestrito)
  const fecharModalAcessoRestrito = useCrmStore((state) => state.fecharModalAcessoRestrito)

  const isMaster =
    String(usuario?.nivel_acesso || '').toLowerCase() === 'master' ||
    String(usuario?.role || '').toLowerCase() === 'master'

  const saldo = typeof creditosStore === 'number' ? creditosStore : Number(usuario?.creditos ?? 0)
  const isBloqueado = !isMaster && saldo <= 0

  /**
   * Protege ações críticas de provisionamento e alteração de assinatura.
   * Se o revendedor não possuir créditos (> 0), bloqueia a execução da ação normal
   * e dispara a exibição do ModalAcessoRestrito.
   *
   * @param acao Função a ser executada caso o acesso esteja liberado.
   * @returns boolean Retorna true se liberado, false se interceptado pelo soft lock.
   */
  const protegerAcao = useCallback(
    (acao?: () => void | Promise<void>) => {
      if (isBloqueado) {
        abrirModalAcessoRestrito()
        return false
      }
      if (acao) {
        void acao()
      }
      return true
    },
    [isBloqueado, abrirModalAcessoRestrito]
  )

  return {
    isBloqueado,
    isMaster,
    saldo,
    modalAcessoRestritoOpen,
    protegerAcao,
    abrirModalAcessoRestrito,
    fecharModalAcessoRestrito,
  }
}
