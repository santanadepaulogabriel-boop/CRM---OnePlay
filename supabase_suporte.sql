-- ==============================================================================
-- ATUALIZAÇÃO DA COLUNA DE SUPORTE TÉCNICO (em_suporte)
-- Execute este script no SQL Editor do seu Supabase Console.
-- ==============================================================================

-- 1. Adiciona a coluna booleana 'em_suporte' à tabela 'clientes' caso não exista
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS em_suporte BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Índice otimizado para o filtro de Suporte Técnico do Kanban
CREATE INDEX IF NOT EXISTS idx_clientes_em_suporte ON clientes(em_suporte);

-- 3. Adiciona também à tabela 'leads' (caso exista no banco)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads') THEN
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS em_suporte BOOLEAN NOT NULL DEFAULT FALSE;
        CREATE INDEX IF NOT EXISTS idx_leads_em_suporte ON leads(em_suporte);
    END IF;
END $$;
