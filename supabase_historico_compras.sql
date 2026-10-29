-- ==============================================================================
-- FLUXO SEMI-AUTOMÁTICO DE COMPRA DE CRÉDITOS: historico_compras + processar_pagamento_pix
-- Execute no SQL Editor do Supabase.
-- ==============================================================================

-- 1. Criação da tabela de histórico de compras
CREATE TABLE IF NOT EXISTS historico_compras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID,
    agente_id UUID REFERENCES agentes(id) ON DELETE SET NULL,
    agente_nome TEXT,
    agente_email TEXT,
    pacote TEXT NOT NULL,
    quantidade INTEGER NOT NULL,
    valor NUMERIC(10,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'cancelado')),
    aprovado_em TIMESTAMPTZ,
    aprovado_por UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_historico_compras_status ON historico_compras(status);
CREATE INDEX IF NOT EXISTS idx_historico_compras_tenant_id ON historico_compras(tenant_id);
CREATE INDEX IF NOT EXISTS idx_historico_compras_created_at ON historico_compras(created_at DESC);

-- Habilitar Row Level Security
ALTER TABLE historico_compras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historico_compras_authenticated" ON historico_compras;
CREATE POLICY "historico_compras_authenticated"
ON historico_compras FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 2. RPC Atômica para aprovação de pagamento PIX e injeção do saldo
CREATE OR REPLACE FUNCTION processar_pagamento_pix(
    tenant_id UUID,
    pacote INTEGER,
    valor NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_novo_saldo INTEGER;
    v_agente_id UUID;
BEGIN
    -- Identifica o agente pelo tenant_id ou id
    SELECT id, COALESCE(creditos, 0) + pacote
    INTO v_agente_id, v_novo_saldo
    FROM agentes
    WHERE id = tenant_id;

    IF v_agente_id IS NULL THEN
        RAISE EXCEPTION 'Agente/Tenant com ID % não encontrado.', tenant_id;
    END IF;

    -- Injeta o saldo na conta do revendedor de forma atômica
    UPDATE agentes
    SET creditos = v_novo_saldo
    WHERE id = v_agente_id;

    -- Atualiza os pedidos correspondentes para 'aprovado'
    UPDATE historico_compras
    SET status = 'aprovado',
        aprovado_em = NOW()
    WHERE (tenant_id = processar_pagamento_pix.tenant_id OR agente_id = processar_pagamento_pix.tenant_id)
      AND status = 'pendente'
      AND quantidade = pacote;

    RETURN jsonb_build_object(
        'success', true,
        'agente_id', v_agente_id,
        'creditos_adicionados', pacote,
        'novo_saldo', v_novo_saldo
    );
END;
$$;

-- Sobrecarga com prefixo p_ para compatibilidade total
CREATE OR REPLACE FUNCTION processar_pagamento_pix(
    p_tenant_id UUID,
    p_pacote INTEGER,
    p_valor NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN processar_pagamento_pix(p_tenant_id, p_pacote, p_valor);
END;
$$;
