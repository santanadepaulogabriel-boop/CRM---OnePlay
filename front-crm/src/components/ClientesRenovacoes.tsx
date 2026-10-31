import React, { useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { isResellerUser } from '../lib/multiTenant'
import {
  buildBillingMessage,
  sendMessage,
  type BillingMessageParams,
  type EvolutionSendResult,
} from '../services/evolutionApi'
import Retencao from '../pages/Retencao'

export const ClientesRenovacoes: React.FC = () => {
  const { usuario } = useAuth()
  const vendedorId = isResellerUser(usuario)
    ? (usuario?.authId ?? usuario?.id ?? null)
    : null

  const handleQuickBillingDispatch = useCallback(
    async (
      phone: string,
      params: BillingMessageParams
    ): Promise<EvolutionSendResult> => {
      const mensagem = buildBillingMessage(params, usuario?.id)
      return sendMessage(phone, mensagem, { userId: usuario?.id })
    },
    [usuario?.id]
  )

  return (
    <Retencao
      vendedorId={vendedorId}
      onQuickBillingDispatch={handleQuickBillingDispatch}
    />
  )
}

export default ClientesRenovacoes
