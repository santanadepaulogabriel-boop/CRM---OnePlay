-- ==============================================================================
-- 5. TABELA DE SERVIDORES IPTV & DNS (CONFIGURAÇÕES DINÂMICAS)
-- Permite cadastro, edição e status de servidores sem hardcode
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

-- Habilitar RLS
ALTER TABLE servidores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_servidores_select" ON servidores;
DROP POLICY IF EXISTS "tenant_servidores_insert" ON servidores;
DROP POLICY IF EXISTS "tenant_servidores_update" ON servidores;
DROP POLICY IF EXISTS "tenant_servidores_delete" ON servidores;

-- Políticas de segurança multi-tenant
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

-- Índices de busca rápida
CREATE INDEX IF NOT EXISTS idx_servidores_tenant_id ON servidores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_servidores_status ON servidores(status);

-- Inserir servidores padrão caso a tabela esteja vazia
INSERT INTO servidores (nome, url, status)
SELECT 'Servidor Alpha BR', 'http://srv1.oneplay.live:80', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM servidores WHERE nome = 'Servidor Alpha BR');

INSERT INTO servidores (nome, url, status)
SELECT 'Servidor CDN Global', 'http://cdn.oneplay.live:8080', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM servidores WHERE nome = 'Servidor CDN Global');

INSERT INTO servidores (nome, url, status)
SELECT 'Backup P2P Turbo', 'http://p2p.oneplay.live:2086', 'ativo'
WHERE NOT EXISTS (SELECT 1 FROM servidores WHERE nome = 'Backup P2P Turbo');
