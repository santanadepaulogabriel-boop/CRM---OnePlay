-- ==============================================================================
-- MULTI-TENANT (REVENDEDORES): tabela de agentes + vínculo agente_id em clientes
-- Execute no SQL Editor do Supabase.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS agentes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    telefone TEXT,
    nivel_acesso TEXT NOT NULL DEFAULT 'Revendedor' CHECK (nivel_acesso IN ('Master', 'Revendedor')),
    precisa_trocar_senha BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Suporte a migrações caso a tabela já exista
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE agentes ADD COLUMN IF NOT EXISTS precisa_trocar_senha BOOLEAN DEFAULT TRUE;

-- Cada subscrição fica vinculada a quem a vendeu
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS agente_id UUID REFERENCES agentes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clientes_agente_id ON clientes(agente_id);

-- Acesso para utilizadores autenticados
ALTER TABLE agentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agentes_authenticated_all" ON agentes;
CREATE POLICY "agentes_authenticated_all"
ON agentes FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
