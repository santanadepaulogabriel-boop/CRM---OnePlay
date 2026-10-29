-- ==============================================================================
-- ONEPLAY CRM - EVOLUÇÃO DE SCHEMA (NÍVEL HUBSPOT / PIPEDRIVE)
-- Multi-tenant com Row Level Security (RLS) isolado por tenant_id (auth.uid())
-- ==============================================================================

-- 0. Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. ATUALIZAÇÃO DA TABELA: clientes
-- ==============================================================================

-- 1.1 Coluna estagio_funil (Lead, Teste, Negociacao, Cliente)
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS estagio_funil TEXT DEFAULT 'Lead';

-- Restrição de valores válidos no funil de vendas
ALTER TABLE clientes 
DROP CONSTRAINT IF EXISTS chk_clientes_estagio_funil;

ALTER TABLE clientes 
ADD CONSTRAINT chk_clientes_estagio_funil 
CHECK (estagio_funil IN ('Lead', 'Teste', 'Negociacao', 'Cliente'));

-- 1.2 Adiciona coluna tenant_id caso ainda não exista (vinculada ao auth.users)
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid();

-- 1.3 Adiciona campo booleano em_suporte para sinalização de suporte técnico
ALTER TABLE clientes 
ADD COLUMN IF NOT EXISTS em_suporte BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_clientes_em_suporte ON clientes(em_suporte);

-- 1.3 Migrar dados existentes com um estágio inicial inteligente
UPDATE clientes 
SET estagio_funil = CASE 
    WHEN LOWER(COALESCE(status, '')) = 'teste' THEN 'Teste'
    WHEN LOWER(COALESCE(status, '')) = 'ativo' THEN 'Cliente'
    ELSE 'Lead'
END
WHERE estagio_funil IS NULL OR estagio_funil = 'Lead';

-- 1.4 Habilitar RLS na tabela clientes
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

-- 1.5 Políticas RLS multi-tenant para clientes
DROP POLICY IF EXISTS "tenant_clientes_select" ON clientes;
DROP POLICY IF EXISTS "tenant_clientes_insert" ON clientes;
DROP POLICY IF EXISTS "tenant_clientes_update" ON clientes;
DROP POLICY IF EXISTS "tenant_clientes_delete" ON clientes;

CREATE POLICY "tenant_clientes_select" 
ON clientes FOR SELECT 
TO authenticated 
USING (tenant_id = auth.uid() OR tenant_id IS NULL);

CREATE POLICY "tenant_clientes_insert" 
ON clientes FOR INSERT 
TO authenticated 
WITH CHECK (COALESCE(tenant_id, auth.uid()) = auth.uid());

CREATE POLICY "tenant_clientes_update" 
ON clientes FOR UPDATE 
TO authenticated 
USING (tenant_id = auth.uid() OR tenant_id IS NULL) 
WITH CHECK (COALESCE(tenant_id, auth.uid()) = auth.uid());

CREATE POLICY "tenant_clientes_delete" 
ON clientes FOR DELETE 
TO authenticated 
USING (tenant_id = auth.uid());

-- Índices de consulta rápida
CREATE INDEX IF NOT EXISTS idx_clientes_tenant_id ON clientes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_clientes_estagio_funil ON clientes(estagio_funil);


-- ==============================================================================
-- 2. CRIAÇÃO DAS TABELAS: interacoes e faturas
-- Bloco dinâmico que detecta automaticamente se clientes.id é UUID ou BIGINT
-- ==============================================================================

DO $$
DECLARE
    v_id_type text;
BEGIN
    SELECT data_type INTO v_id_type
    FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'id';

    IF v_id_type = 'uuid' THEN
        -- Esquema se clientes.id for UUID
        EXECUTE '
            CREATE TABLE IF NOT EXISTS interacoes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
                cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
                tipo TEXT NOT NULL DEFAULT ''whatsapp'' CHECK (tipo IN (''whatsapp'', ''ligacao'', ''email'', ''reuniao'', ''nota'', ''suporte'', ''outro'')),
                descricao TEXT NOT NULL,
                data TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS faturas (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
                cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
                valor NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                data_vencimento TIMESTAMPTZ NOT NULL,
                data_pagamento TIMESTAMPTZ,
                status TEXT NOT NULL DEFAULT ''pendente'' CHECK (status IN (''pago'', ''pendente'', ''atrasado'', ''cancelado'')),
                descricao TEXT,
                metodo_pagamento TEXT CHECK (metodo_pagamento IS NULL OR metodo_pagamento IN (''pix'', ''cartao'', ''boleto'', ''dinheiro'', ''outro'')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        ';
    ELSE
        -- Esquema padrão se clientes.id for BIGINT / INTEGER / IDENTITY
        EXECUTE '
            CREATE TABLE IF NOT EXISTS interacoes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
                cliente_id BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
                tipo TEXT NOT NULL DEFAULT ''whatsapp'' CHECK (tipo IN (''whatsapp'', ''ligacao'', ''email'', ''reuniao'', ''nota'', ''suporte'', ''outro'')),
                descricao TEXT NOT NULL,
                data TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS faturas (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
                cliente_id BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
                valor NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                data_vencimento TIMESTAMPTZ NOT NULL,
                data_pagamento TIMESTAMPTZ,
                status TEXT NOT NULL DEFAULT ''pendente'' CHECK (status IN (''pago'', ''pendente'', ''atrasado'', ''cancelado'')),
                descricao TEXT,
                metodo_pagamento TEXT CHECK (metodo_pagamento IS NULL OR metodo_pagamento IN (''pix'', ''cartao'', ''boleto'', ''dinheiro'', ''outro'')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        ';
    END IF;
END $$;


-- ==============================================================================
-- 3. RLS E POLÍTICAS: interacoes
-- ==============================================================================

ALTER TABLE interacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_interacoes_select" ON interacoes;
DROP POLICY IF EXISTS "tenant_interacoes_insert" ON interacoes;
DROP POLICY IF EXISTS "tenant_interacoes_update" ON interacoes;
DROP POLICY IF EXISTS "tenant_interacoes_delete" ON interacoes;

CREATE POLICY "tenant_interacoes_select" 
ON interacoes FOR SELECT 
TO authenticated 
USING (tenant_id = auth.uid());

CREATE POLICY "tenant_interacoes_insert" 
ON interacoes FOR INSERT 
TO authenticated 
WITH CHECK (COALESCE(tenant_id, auth.uid()) = auth.uid());

CREATE POLICY "tenant_interacoes_update" 
ON interacoes FOR UPDATE 
TO authenticated 
USING (tenant_id = auth.uid()) 
WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "tenant_interacoes_delete" 
ON interacoes FOR DELETE 
TO authenticated 
USING (tenant_id = auth.uid());

-- Índices para logs de contato
CREATE INDEX IF NOT EXISTS idx_interacoes_tenant_id ON interacoes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_interacoes_cliente_id ON interacoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_interacoes_data ON interacoes(data DESC);


-- ==============================================================================
-- 4. RLS E POLÍTICAS: faturas
-- ==============================================================================

ALTER TABLE faturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_faturas_select" ON faturas;
DROP POLICY IF EXISTS "tenant_faturas_insert" ON faturas;
DROP POLICY IF EXISTS "tenant_faturas_update" ON faturas;
DROP POLICY IF EXISTS "tenant_faturas_delete" ON faturas;

CREATE POLICY "tenant_faturas_select" 
ON faturas FOR SELECT 
TO authenticated 
USING (tenant_id = auth.uid());

CREATE POLICY "tenant_faturas_insert" 
ON faturas FOR INSERT 
TO authenticated 
WITH CHECK (COALESCE(tenant_id, auth.uid()) = auth.uid());

CREATE POLICY "tenant_faturas_update" 
ON faturas FOR UPDATE 
TO authenticated 
USING (tenant_id = auth.uid()) 
WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "tenant_faturas_delete" 
ON faturas FOR DELETE 
TO authenticated 
USING (tenant_id = auth.uid());

-- Índices para controle financeiro e cobrança
CREATE INDEX IF NOT EXISTS idx_faturas_tenant_id ON faturas(tenant_id);
CREATE INDEX IF NOT EXISTS idx_faturas_cliente_id ON faturas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_faturas_status ON faturas(status);
CREATE INDEX IF NOT EXISTS idx_faturas_vencimento ON faturas(data_vencimento ASC);

-- ==============================================================================
-- 5. TABELA DE SERVIDORES IPTV & DNS (CONFIGURAÇÕES DINÂMICAS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS servidores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
    nome TEXT NOT NULL,
    url TEXT,
    status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE servidores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_servidores_select" ON servidores;
DROP POLICY IF EXISTS "tenant_servidores_insert" ON servidores;
DROP POLICY IF EXISTS "tenant_servidores_update" ON servidores;
DROP POLICY IF EXISTS "tenant_servidores_delete" ON servidores;

CREATE POLICY "tenant_servidores_select" 
ON servidores FOR SELECT 
TO authenticated 
USING (tenant_id = auth.uid() OR tenant_id IS NULL);

CREATE POLICY "tenant_servidores_insert" 
ON servidores FOR INSERT 
TO authenticated 
WITH CHECK (COALESCE(tenant_id, auth.uid()) = auth.uid());

CREATE POLICY "tenant_servidores_update" 
ON servidores FOR UPDATE 
TO authenticated 
USING (tenant_id = auth.uid() OR tenant_id IS NULL) 
WITH CHECK (COALESCE(tenant_id, auth.uid()) = auth.uid());

CREATE POLICY "tenant_servidores_delete" 
ON servidores FOR DELETE 
TO authenticated 
USING (tenant_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_servidores_tenant_id ON servidores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_servidores_status ON servidores(status);

INSERT INTO servidores (nome, url, status)
SELECT 'Servidor Alpha BR', 'http://srv1.oneplay.live:80', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM servidores WHERE nome = 'Servidor Alpha BR');

INSERT INTO servidores (nome, url, status)
SELECT 'Servidor CDN Global', 'http://cdn.oneplay.live:8080', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM servidores WHERE nome = 'Servidor CDN Global');

INSERT INTO servidores (nome, url, status)
SELECT 'Backup P2P Turbo', 'http://p2p.oneplay.live:2086', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM servidores WHERE nome = 'Backup P2P Turbo');

