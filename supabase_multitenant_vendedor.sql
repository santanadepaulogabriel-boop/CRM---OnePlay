-- ==============================================================================
-- ONEPLAY CRM - ARQUITETURA MULTI-TENANT POR VENDEDOR (vendedor_id)
-- Execute este script no SQL Editor do seu Supabase Dashboard.
-- ==============================================================================

-- 1. Garante que a tabela clientes possua a coluna vendedor_id
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS vendedor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Compatibilidade / Migração de dados legados:
-- Se a tabela possuir agente_id ou tenant_id, preenche vendedor_id automaticamente
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clientes' AND column_name = 'agente_id'
    ) THEN
        EXECUTE 'UPDATE clientes SET vendedor_id = agente_id WHERE vendedor_id IS NULL AND agente_id IS NOT NULL';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'clientes' AND column_name = 'tenant_id'
    ) THEN
        EXECUTE 'UPDATE clientes SET vendedor_id = tenant_id WHERE vendedor_id IS NULL AND tenant_id IS NOT NULL';
    END IF;
END $$;

-- 3. Criação de índice otimizado para consultas filtradas por vendedor_id
CREATE INDEX IF NOT EXISTS idx_clientes_vendedor_id ON clientes(vendedor_id);

-- 4. Criação da tabela de leads (caso utilizada separadamente ou para novas oportunidades)
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendedor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    nome_completo TEXT NOT NULL,
    whatsapp TEXT,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'lead' CHECK (status IN ('lead', 'teste', 'followup', 'negociacao', 'convertido', 'inativo')),
    estagio_funil TEXT NOT NULL DEFAULT 'lead' CHECK (estagio_funil IN ('lead', 'teste', 'followup', 'negociacao', 'cliente')),
    valor_mensal NUMERIC(10,2) DEFAULT 0.00,
    observacoes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Garante que leads possua a coluna vendedor_id e índice
ALTER TABLE leads ADD COLUMN IF NOT EXISTS vendedor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_leads_vendedor_id ON leads(vendedor_id);

-- 5. Atualização da tabela de perfis de agentes (role: 'master' ou 'revendedor')
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agentes') THEN
        ALTER TABLE agentes ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'revendedor';
        UPDATE agentes 
        SET role = CASE 
            WHEN LOWER(COALESCE(nivel_acesso, '')) = 'master' THEN 'master' 
            ELSE 'revendedor' 
        END
        WHERE role IS NULL;
    END IF;
END $$;

-- 6. Políticas RLS (Row Level Security) Multi-Tenant para clientes
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clientes_multitenant_select" ON clientes;
CREATE POLICY "clientes_multitenant_select" ON clientes
FOR SELECT TO authenticated
USING (
    -- Usuário 'master' pode ver todos os registros
    COALESCE(auth.jwt()->'user_metadata'->>'role', '') = 'master'
    OR COALESCE(auth.jwt()->'app_metadata'->>'role', '') = 'master'
    -- 'revendedor' vê apenas seus próprios clientes
    OR vendedor_id = auth.uid()
    OR vendedor_id IS NULL
);

DROP POLICY IF EXISTS "clientes_multitenant_insert" ON clientes;
CREATE POLICY "clientes_multitenant_insert" ON clientes
FOR INSERT TO authenticated
WITH CHECK (
    -- Vincula automaticamente ao usuário autenticado ou permite master
    COALESCE(vendedor_id, auth.uid()) = auth.uid()
    OR COALESCE(auth.jwt()->'user_metadata'->>'role', '') = 'master'
);

DROP POLICY IF EXISTS "clientes_multitenant_update" ON clientes;
CREATE POLICY "clientes_multitenant_update" ON clientes
FOR UPDATE TO authenticated
USING (
    COALESCE(auth.jwt()->'user_metadata'->>'role', '') = 'master'
    OR vendedor_id = auth.uid()
    OR vendedor_id IS NULL
)
WITH CHECK (
    COALESCE(auth.jwt()->'user_metadata'->>'role', '') = 'master'
    OR vendedor_id = auth.uid()
    OR vendedor_id IS NULL
);
