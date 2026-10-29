-- ==============================================================================
-- ONEPLAY CRM - AUDITORIA & ISOLAMENTO ENTERPRISE MULTI-TENANT (SUPABASE RLS)
-- Principal Security & Enterprise Architecture
-- Execute este script completo no SQL Editor do Supabase Dashboard.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. VINCULAÇÃO CRIPTOGRÁFICA DE IDENTIDADE (agentes <-> auth.users / auth.uid())
-- ==============================================================================

ALTER TABLE public.agentes
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.agentes
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'reseller';

ALTER TABLE public.agentes
  ADD COLUMN IF NOT EXISTS creditos INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_agentes_auth_user_id ON public.agentes(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_agentes_email_lower ON public.agentes((LOWER(email)));

-- Sincroniza automaticamente auth_user_id com auth.users pelo e-mail autenticado
UPDATE public.agentes a
SET auth_user_id = u.id
FROM auth.users u
WHERE a.auth_user_id IS NULL
  AND LOWER(a.email) = LOWER(u.email);

-- Normaliza coluna role ('master' vs 'reseller')
UPDATE public.agentes
SET role = CASE
  WHEN LOWER(COALESCE(nivel_acesso, '')) = 'master' THEN 'master'
  ELSE 'reseller'
END
WHERE role IS NULL OR role NOT IN ('master', 'reseller');

-- ==============================================================================
-- 2. FUNÇÕES DE SEGURANÇA NO SERVIDOR (PREVENÇÃO DE PRIVILEGE ESCALATION)
-- Nota: NUNCA confiar em user_metadata do JWT (editável pelo cliente).
-- Validamos diretamente na tabela protegida public.agentes via auth.uid().
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.is_master_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agentes a
    WHERE (
      a.auth_user_id = auth.uid()
      OR a.id = auth.uid()
      OR LOWER(a.email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
    )
    AND (
      LOWER(COALESCE(a.nivel_acesso, '')) = 'master'
      OR LOWER(COALESCE(a.role, '')) = 'master'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.current_reseller_agent_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT a.id
  FROM public.agentes a
  WHERE a.auth_user_id = auth.uid()
     OR a.id = auth.uid()
     OR LOWER(a.email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
  ORDER BY (a.auth_user_id = auth.uid()) DESC
  LIMIT 1;
$$;

-- RPC pública segura para obter apenas o telefone de suporte do Master
-- (Permite que a Loja de Créditos redirecione ao WhatsApp sem expor a tabela agentes)
CREATE OR REPLACE FUNCTION public.obter_contato_master()
RETURNS TABLE (nome TEXT, telefone TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.nome, a.telefone
  FROM public.agentes a
  WHERE LOWER(COALESCE(a.nivel_acesso, a.role, '')) = 'master'
    AND a.telefone IS NOT NULL
  ORDER BY a.created_at ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.is_master_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_master_user() TO authenticated;

REVOKE ALL ON FUNCTION public.current_reseller_agent_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_reseller_agent_id() TO authenticated;

REVOKE ALL ON FUNCTION public.obter_contato_master() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obter_contato_master() TO authenticated;

-- ==============================================================================
-- 3. PADRONIZAÇÃO DA COLUNA reseller_id NAS TABELAS PRINCIPAIS
-- ==============================================================================

-- 3.1 Clientes (clientes)
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS reseller_id UUID;
CREATE INDEX IF NOT EXISTS idx_clientes_reseller_id ON public.clientes(reseller_id);

UPDATE public.clientes
SET reseller_id = COALESCE(agente_id, vendedor_id, tenant_id)
WHERE reseller_id IS NULL
  AND COALESCE(agente_id, vendedor_id, tenant_id) IS NOT NULL;

-- 3.2 Pagamentos / Faturas (faturas)
ALTER TABLE public.faturas ADD COLUMN IF NOT EXISTS reseller_id UUID;
ALTER TABLE public.faturas ADD COLUMN IF NOT EXISTS agente_id UUID;
ALTER TABLE public.faturas ADD COLUMN IF NOT EXISTS vendedor_id UUID;
CREATE INDEX IF NOT EXISTS idx_faturas_reseller_id ON public.faturas(reseller_id);

UPDATE public.faturas f
SET reseller_id = COALESCE(f.agente_id, f.vendedor_id, f.tenant_id, c.reseller_id)
FROM public.clientes c
WHERE f.cliente_id = c.id
  AND f.reseller_id IS NULL;

UPDATE public.faturas
SET reseller_id = COALESCE(agente_id, vendedor_id, tenant_id)
WHERE reseller_id IS NULL
  AND COALESCE(agente_id, vendedor_id, tenant_id) IS NOT NULL;

-- 3.3 Pedidos de Créditos (historico_compras)
ALTER TABLE public.historico_compras ADD COLUMN IF NOT EXISTS reseller_id UUID;
CREATE INDEX IF NOT EXISTS idx_historico_compras_reseller_id ON public.historico_compras(reseller_id);

UPDATE public.historico_compras
SET reseller_id = COALESCE(agente_id, tenant_id)
WHERE reseller_id IS NULL
  AND COALESCE(agente_id, tenant_id) IS NOT NULL;

-- 3.4 Interações e Servidores
ALTER TABLE public.interacoes ADD COLUMN IF NOT EXISTS reseller_id UUID;
CREATE INDEX IF NOT EXISTS idx_interacoes_reseller_id ON public.interacoes(reseller_id);

UPDATE public.interacoes i
SET reseller_id = COALESCE(i.tenant_id, c.reseller_id)
FROM public.clientes c
WHERE i.cliente_id = c.id
  AND i.reseller_id IS NULL;

ALTER TABLE public.servidores ADD COLUMN IF NOT EXISTS reseller_id UUID;
CREATE INDEX IF NOT EXISTS idx_servidores_reseller_id ON public.servidores(reseller_id);

UPDATE public.servidores
SET reseller_id = tenant_id
WHERE reseller_id IS NULL AND tenant_id IS NOT NULL;

-- ==============================================================================
-- 4. TRIGGERS ANTI-SPOOFING (GARANTE POSSE FORÇADA POR auth.uid() NO BACKEND)
-- Impede que um revendedor forje reseller_id / tenant_id via chamada API direta.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.enforce_reseller_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_agent_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão não autenticada.';
  END IF;

  IF NOT public.is_master_user() THEN
    v_agent_id := COALESCE(public.current_reseller_agent_id(), auth.uid());

    IF TG_OP = 'UPDATE' THEN
      IF OLD.reseller_id IS DISTINCT FROM NEW.reseller_id THEN
        NEW.reseller_id := OLD.reseller_id;
      END IF;
    ELSE
      NEW.reseller_id := v_agent_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_clientes_ownership ON public.clientes;
CREATE TRIGGER trg_enforce_clientes_ownership
BEFORE INSERT OR UPDATE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.enforce_reseller_ownership();

DROP TRIGGER IF EXISTS trg_enforce_faturas_ownership ON public.faturas;
CREATE TRIGGER trg_enforce_faturas_ownership
BEFORE INSERT OR UPDATE ON public.faturas
FOR EACH ROW EXECUTE FUNCTION public.enforce_reseller_ownership();

DROP TRIGGER IF EXISTS trg_enforce_historico_compras_ownership ON public.historico_compras;
CREATE TRIGGER trg_enforce_historico_compras_ownership
BEFORE INSERT OR UPDATE ON public.historico_compras
FOR EACH ROW EXECUTE FUNCTION public.enforce_reseller_ownership();

-- Bloqueia auto-promoção ou manipulação de saldo de créditos por revendedores em agentes
CREATE OR REPLACE FUNCTION public.protect_agentes_sensitive_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NOT public.is_master_user() THEN
    IF NEW.creditos IS DISTINCT FROM OLD.creditos
       OR LOWER(COALESCE(NEW.nivel_acesso, '')) IS DISTINCT FROM LOWER(COALESCE(OLD.nivel_acesso, ''))
       OR LOWER(COALESCE(NEW.role, '')) IS DISTINCT FROM LOWER(COALESCE(OLD.role, ''))
       OR LOWER(COALESCE(NEW.email, '')) IS DISTINCT FROM LOWER(COALESCE(OLD.email, ''))
    THEN
      RAISE EXCEPTION 'Operação bloqueada: apenas a conta Master pode alterar créditos, nível de acesso ou e-mail.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_agentes_fields ON public.agentes;
CREATE TRIGGER trg_protect_agentes_fields
BEFORE UPDATE ON public.agentes
FOR EACH ROW EXECUTE FUNCTION public.protect_agentes_sensitive_fields();

-- ==============================================================================
-- 5. POLÍTICAS RLS ESTRITAS BASEADAS EM auth.uid()
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 5.1 TABELA: clientes (Clients)
-- Remove políticas antigas permissivas (ex: OR tenant_id IS NULL / vendedor_id IS NULL)
-- ------------------------------------------------------------------------------
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_clientes_select" ON public.clientes;
DROP POLICY IF EXISTS "tenant_clientes_insert" ON public.clientes;
DROP POLICY IF EXISTS "tenant_clientes_update" ON public.clientes;
DROP POLICY IF EXISTS "tenant_clientes_delete" ON public.clientes;
DROP POLICY IF EXISTS "clientes_multitenant_select" ON public.clientes;
DROP POLICY IF EXISTS "clientes_multitenant_insert" ON public.clientes;
DROP POLICY IF EXISTS "clientes_multitenant_update" ON public.clientes;
DROP POLICY IF EXISTS "clientes_multitenant_delete" ON public.clientes;
DROP POLICY IF EXISTS "rls_clientes_select" ON public.clientes;
DROP POLICY IF EXISTS "rls_clientes_insert" ON public.clientes;
DROP POLICY IF EXISTS "rls_clientes_update" ON public.clientes;
DROP POLICY IF EXISTS "rls_clientes_delete" ON public.clientes;

CREATE POLICY "rls_clientes_select"
ON public.clientes FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR reseller_id = auth.uid()
    OR reseller_id = public.current_reseller_agent_id()
    OR tenant_id = auth.uid()
    OR vendedor_id = auth.uid()
    OR agente_id = public.current_reseller_agent_id()
  )
);

CREATE POLICY "rls_clientes_insert"
ON public.clientes FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR reseller_id = auth.uid()
    OR reseller_id = public.current_reseller_agent_id()
    OR tenant_id = auth.uid()
  )
);

CREATE POLICY "rls_clientes_update"
ON public.clientes FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR reseller_id = auth.uid()
    OR reseller_id = public.current_reseller_agent_id()
    OR tenant_id = auth.uid()
    OR vendedor_id = auth.uid()
    OR agente_id = public.current_reseller_agent_id()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR reseller_id = auth.uid()
    OR reseller_id = public.current_reseller_agent_id()
    OR tenant_id = auth.uid()
  )
);

CREATE POLICY "rls_clientes_delete"
ON public.clientes FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR reseller_id = auth.uid()
    OR reseller_id = public.current_reseller_agent_id()
    OR tenant_id = auth.uid()
  )
);

-- ------------------------------------------------------------------------------
-- 5.2 TABELA: faturas (Payments)
-- ------------------------------------------------------------------------------
ALTER TABLE public.faturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faturas FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_faturas_select" ON public.faturas;
DROP POLICY IF EXISTS "tenant_faturas_insert" ON public.faturas;
DROP POLICY IF EXISTS "tenant_faturas_update" ON public.faturas;
DROP POLICY IF EXISTS "tenant_faturas_delete" ON public.faturas;
DROP POLICY IF EXISTS "rls_faturas_select" ON public.faturas;
DROP POLICY IF EXISTS "rls_faturas_insert" ON public.faturas;
DROP POLICY IF EXISTS "rls_faturas_update" ON public.faturas;
DROP POLICY IF EXISTS "rls_faturas_delete" ON public.faturas;

CREATE POLICY "rls_faturas_select"
ON public.faturas FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR reseller_id = auth.uid()
    OR reseller_id = public.current_reseller_agent_id()
    OR tenant_id = auth.uid()
    OR agente_id = public.current_reseller_agent_id()
  )
);

CREATE POLICY "rls_faturas_insert"
ON public.faturas FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR (
      (reseller_id = auth.uid() OR reseller_id = public.current_reseller_agent_id() OR tenant_id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.clientes c
        WHERE c.id = faturas.cliente_id
          AND (
            c.reseller_id = auth.uid()
            OR c.reseller_id = public.current_reseller_agent_id()
            OR c.tenant_id = auth.uid()
            OR c.agente_id = public.current_reseller_agent_id()
          )
      )
    )
  )
);

CREATE POLICY "rls_faturas_update"
ON public.faturas FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR reseller_id = auth.uid()
    OR reseller_id = public.current_reseller_agent_id()
    OR tenant_id = auth.uid()
    OR agente_id = public.current_reseller_agent_id()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR reseller_id = auth.uid()
    OR reseller_id = public.current_reseller_agent_id()
    OR tenant_id = auth.uid()
  )
);

CREATE POLICY "rls_faturas_delete"
ON public.faturas FOR DELETE
TO authenticated
USING (
  auth.uid() IS NOT NULL AND public.is_master_user()
);

-- ------------------------------------------------------------------------------
-- 5.3 TABELA: historico_compras (Credits Requests)
-- Revendedor só vê os seus próprios pedidos e só pode inserir com status 'pendente'.
-- Aprovação / Alteração / Exclusão exclusiva do Master!
-- ------------------------------------------------------------------------------
ALTER TABLE public.historico_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico_compras FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "historico_compras_authenticated" ON public.historico_compras;
DROP POLICY IF EXISTS "rls_credits_requests_select" ON public.historico_compras;
DROP POLICY IF EXISTS "rls_credits_requests_insert" ON public.historico_compras;
DROP POLICY IF EXISTS "rls_credits_requests_update" ON public.historico_compras;
DROP POLICY IF EXISTS "rls_credits_requests_delete" ON public.historico_compras;

CREATE POLICY "rls_credits_requests_select"
ON public.historico_compras FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR reseller_id = auth.uid()
    OR reseller_id = public.current_reseller_agent_id()
    OR tenant_id = auth.uid()
    OR agente_id = public.current_reseller_agent_id()
  )
);

CREATE POLICY "rls_credits_requests_insert"
ON public.historico_compras FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR (
      status = 'pendente'
      AND (
        reseller_id = auth.uid()
        OR reseller_id = public.current_reseller_agent_id()
        OR tenant_id = auth.uid()
        OR agente_id = public.current_reseller_agent_id()
      )
    )
  )
);

CREATE POLICY "rls_credits_requests_update"
ON public.historico_compras FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL AND public.is_master_user())
WITH CHECK (auth.uid() IS NOT NULL AND public.is_master_user());

CREATE POLICY "rls_credits_requests_delete"
ON public.historico_compras FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL AND public.is_master_user());

-- ------------------------------------------------------------------------------
-- 5.4 TABELA: agentes (Isolamento de Contas e Saldos)
-- ------------------------------------------------------------------------------
ALTER TABLE public.agentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agentes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agentes_authenticated_all" ON public.agentes;
DROP POLICY IF EXISTS "rls_agentes_select" ON public.agentes;
DROP POLICY IF EXISTS "rls_agentes_insert" ON public.agentes;
DROP POLICY IF EXISTS "rls_agentes_update" ON public.agentes;
DROP POLICY IF EXISTS "rls_agentes_delete" ON public.agentes;

CREATE POLICY "rls_agentes_select"
ON public.agentes FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR auth_user_id = auth.uid()
    OR id = auth.uid()
    OR LOWER(email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
  )
);

CREATE POLICY "rls_agentes_insert"
ON public.agentes FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR NOT EXISTS (SELECT 1 FROM public.agentes)
  )
);

CREATE POLICY "rls_agentes_update"
ON public.agentes FOR UPDATE
TO authenticated
USING (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR auth_user_id = auth.uid()
    OR id = auth.uid()
    OR LOWER(email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR auth_user_id = auth.uid()
    OR id = auth.uid()
    OR LOWER(email) = LOWER(COALESCE(auth.jwt() ->> 'email', ''))
  )
);

CREATE POLICY "rls_agentes_delete"
ON public.agentes FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL AND public.is_master_user());

-- ------------------------------------------------------------------------------
-- 5.5 TABELAS AUXILIARES: interacoes & servidores
-- ------------------------------------------------------------------------------
ALTER TABLE public.interacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interacoes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_interacoes_select" ON public.interacoes;
DROP POLICY IF EXISTS "tenant_interacoes_insert" ON public.interacoes;
DROP POLICY IF EXISTS "tenant_interacoes_update" ON public.interacoes;
DROP POLICY IF EXISTS "tenant_interacoes_delete" ON public.interacoes;
DROP POLICY IF EXISTS "rls_interacoes_all" ON public.interacoes;

CREATE POLICY "rls_interacoes_all"
ON public.interacoes FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR reseller_id = auth.uid()
    OR reseller_id = public.current_reseller_agent_id()
    OR tenant_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.clientes c
      WHERE c.id = interacoes.cliente_id
        AND (
          c.reseller_id = auth.uid()
          OR c.reseller_id = public.current_reseller_agent_id()
          OR c.tenant_id = auth.uid()
        )
    )
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR reseller_id = auth.uid()
    OR reseller_id = public.current_reseller_agent_id()
    OR tenant_id = auth.uid()
  )
);

ALTER TABLE public.servidores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.servidores FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_servidores_select" ON public.servidores;
DROP POLICY IF EXISTS "tenant_servidores_insert" ON public.servidores;
DROP POLICY IF EXISTS "tenant_servidores_update" ON public.servidores;
DROP POLICY IF EXISTS "tenant_servidores_delete" ON public.servidores;
DROP POLICY IF EXISTS "rls_servidores_select" ON public.servidores;
DROP POLICY IF EXISTS "rls_servidores_write_master" ON public.servidores;

CREATE POLICY "rls_servidores_select"
ON public.servidores FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR reseller_id = auth.uid()
    OR reseller_id = public.current_reseller_agent_id()
    OR tenant_id = auth.uid()
    OR tenant_id IS NULL
  )
);

CREATE POLICY "rls_servidores_write_master"
ON public.servidores FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL AND public.is_master_user())
WITH CHECK (auth.uid() IS NOT NULL AND public.is_master_user());

-- ==============================================================================
-- 6. SUPORTE EXPLÍCITO PARA (clients, payments, credits_requests) COM auth.uid()
-- Se existirem como tabelas físicas, aplica RLS direto com auth.uid();
-- Caso contrário, expõe Views Security Invoker que herdam 100% do RLS acima.
-- ==============================================================================

DO $$
DECLARE
  v_kind CHAR;
BEGIN
  -- 6.1 clients
  SELECT c.relkind INTO v_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'clients';

  IF v_kind = 'r' THEN
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS reseller_id UUID DEFAULT auth.uid()';
    EXECUTE 'ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.clients FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "rls_clients_isolation" ON public.clients';
    EXECUTE '
      CREATE POLICY "rls_clients_isolation"
      ON public.clients FOR ALL
      TO authenticated
      USING (auth.uid() IS NOT NULL AND (public.is_master_user() OR reseller_id = auth.uid() OR reseller_id = public.current_reseller_agent_id()))
      WITH CHECK (auth.uid() IS NOT NULL AND (public.is_master_user() OR reseller_id = auth.uid() OR reseller_id = public.current_reseller_agent_id()))
    ';
  ELSE
    EXECUTE 'CREATE OR REPLACE VIEW public.clients WITH (security_invoker = true) AS SELECT * FROM public.clientes';
  END IF;

  -- 6.2 payments
  v_kind := NULL;
  SELECT c.relkind INTO v_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'payments';

  IF v_kind = 'r' THEN
    EXECUTE 'ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS reseller_id UUID DEFAULT auth.uid()';
    EXECUTE 'ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.payments FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "rls_payments_isolation" ON public.payments';
    EXECUTE '
      CREATE POLICY "rls_payments_isolation"
      ON public.payments FOR ALL
      TO authenticated
      USING (auth.uid() IS NOT NULL AND (public.is_master_user() OR reseller_id = auth.uid() OR reseller_id = public.current_reseller_agent_id()))
      WITH CHECK (auth.uid() IS NOT NULL AND (public.is_master_user() OR reseller_id = auth.uid() OR reseller_id = public.current_reseller_agent_id()))
    ';
  ELSE
    EXECUTE 'CREATE OR REPLACE VIEW public.payments WITH (security_invoker = true) AS SELECT * FROM public.faturas';
  END IF;

  -- 6.3 credits_requests
  v_kind := NULL;
  SELECT c.relkind INTO v_kind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'credits_requests';

  IF v_kind = 'r' THEN
    EXECUTE 'ALTER TABLE public.credits_requests ADD COLUMN IF NOT EXISTS reseller_id UUID DEFAULT auth.uid()';
    EXECUTE 'ALTER TABLE public.credits_requests ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.credits_requests FORCE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "rls_credits_requests_select_tbl" ON public.credits_requests';
    EXECUTE 'DROP POLICY IF EXISTS "rls_credits_requests_insert_tbl" ON public.credits_requests';
    EXECUTE 'DROP POLICY IF EXISTS "rls_credits_requests_master_write_tbl" ON public.credits_requests';
    EXECUTE '
      CREATE POLICY "rls_credits_requests_select_tbl"
      ON public.credits_requests FOR SELECT
      TO authenticated
      USING (auth.uid() IS NOT NULL AND (public.is_master_user() OR reseller_id = auth.uid() OR reseller_id = public.current_reseller_agent_id()))
    ';
    EXECUTE '
      CREATE POLICY "rls_credits_requests_insert_tbl"
      ON public.credits_requests FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() IS NOT NULL AND (public.is_master_user() OR reseller_id = auth.uid() OR reseller_id = public.current_reseller_agent_id()))
    ';
    EXECUTE '
      CREATE POLICY "rls_credits_requests_master_write_tbl"
      ON public.credits_requests FOR UPDATE
      TO authenticated
      USING (auth.uid() IS NOT NULL AND public.is_master_user())
      WITH CHECK (auth.uid() IS NOT NULL AND public.is_master_user())
    ';
  ELSE
    EXECUTE 'CREATE OR REPLACE VIEW public.credits_requests WITH (security_invoker = true) AS SELECT * FROM public.historico_compras';
  END IF;
END $$;

-- ==============================================================================
-- 7. BLINDAGEM DA RPC processar_pagamento_pix (EXCLUSIVA DO MASTER)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.processar_pagamento_pix(
    tenant_id UUID,
    pacote INTEGER,
    valor NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_novo_saldo INTEGER;
    v_agente_id UUID;
BEGIN
    IF auth.uid() IS NULL OR NOT public.is_master_user() THEN
        RAISE EXCEPTION 'Acesso negado: apenas a administração Master pode aprovar liberações de créditos.';
    END IF;

    SELECT id, COALESCE(creditos, 0) + pacote
    INTO v_agente_id, v_novo_saldo
    FROM public.agentes
    WHERE id = tenant_id OR auth_user_id = tenant_id
    LIMIT 1;

    IF v_agente_id IS NULL THEN
        RAISE EXCEPTION 'Revendedor com ID % não encontrado.', tenant_id;
    END IF;

    UPDATE public.agentes
    SET creditos = v_novo_saldo
    WHERE id = v_agente_id;

    UPDATE public.historico_compras
    SET status = 'aprovado',
        aprovado_em = NOW(),
        aprovado_por = auth.uid()
    WHERE (
        historico_compras.reseller_id = processar_pagamento_pix.tenant_id
        OR historico_compras.tenant_id = processar_pagamento_pix.tenant_id
        OR historico_compras.agente_id = v_agente_id
      )
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

