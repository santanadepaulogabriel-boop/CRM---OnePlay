-- ==============================================================================
-- ONEPLAY CRM - ARQUITETURA MULTI-TENANT POR VENDEDOR (vendedor_id / user_id)
-- Execute este script no SQL Editor do seu Supabase Dashboard.
-- Totalmente idempotente: elimina erros de coluna inexistente e isola 100% cada revendedor.
-- ==============================================================================

-- 1. Garante colunas de vínculo Multi-Tenant na tabela public.clientes
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS vendedor_id UUID DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS agente_id UUID,
  ADD COLUMN IF NOT EXISTS reseller_id UUID,
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Caso exista FK legada restritiva em vendedor_id que impeça gravar agentes.id, flexibiliza mantendo UUID
DO $$
DECLARE
  v_con RECORD;
BEGIN
  FOR v_con IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.clientes'::regclass
      AND contype = 'f'
      AND conname ILIKE '%vendedor_id%'
  LOOP
    EXECUTE format('ALTER TABLE public.clientes DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;
END $$;

-- 2. Sincronização / Backfill automático entre colunas de posse existentes
UPDATE public.clientes
SET vendedor_id = COALESCE(vendedor_id, user_id, reseller_id, agente_id, tenant_id)
WHERE vendedor_id IS NULL
  AND COALESCE(user_id, reseller_id, agente_id, tenant_id) IS NOT NULL;

UPDATE public.clientes
SET user_id = COALESCE(user_id, vendedor_id, reseller_id, tenant_id, agente_id)
WHERE user_id IS NULL
  AND COALESCE(vendedor_id, reseller_id, tenant_id, agente_id) IS NOT NULL;

UPDATE public.clientes
SET reseller_id = COALESCE(reseller_id, agente_id, vendedor_id, user_id, tenant_id)
WHERE reseller_id IS NULL
  AND COALESCE(agente_id, vendedor_id, user_id, tenant_id) IS NOT NULL;

-- 3. Índices otimizados para queries filtradas por revendedor autenticado
CREATE INDEX IF NOT EXISTS idx_clientes_vendedor_id ON public.clientes(vendedor_id);
CREATE INDEX IF NOT EXISTS idx_clientes_user_id ON public.clientes(user_id);
CREATE INDEX IF NOT EXISTS idx_clientes_reseller_id ON public.clientes(reseller_id);
CREATE INDEX IF NOT EXISTS idx_clientes_agente_id ON public.clientes(agente_id);

-- 4. Funções auxiliares de segurança Multi-Tenant (validadas via public.agentes + auth.uid())
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'agentes') THEN
    ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS auth_user_id UUID;
    ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'reseller';
    ALTER TABLE public.agentes ADD COLUMN IF NOT EXISTS creditos INTEGER NOT NULL DEFAULT 0;

    UPDATE public.agentes a
    SET auth_user_id = u.id
    FROM auth.users u
    WHERE a.auth_user_id IS NULL
      AND LOWER(a.email) = LOWER(u.email);

    UPDATE public.agentes
    SET role = CASE
      WHEN LOWER(COALESCE(nivel_acesso, '')) = 'master' THEN 'master'
      ELSE 'reseller'
    END
    WHERE role IS NULL OR role NOT IN ('master', 'reseller', 'revendedor');
  END IF;
END $$;

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

GRANT EXECUTE ON FUNCTION public.is_master_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_reseller_agent_id() TO authenticated;

-- 5. Trigger automática para carimbar vendedor_id / user_id / reseller_id no INSERT/UPDATE do revendedor
CREATE OR REPLACE FUNCTION public.sync_clientes_vendedor_ownership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_agent_id UUID;
BEGIN
  IF v_uid IS NOT NULL AND NOT public.is_master_user() THEN
    v_agent_id := COALESCE(public.current_reseller_agent_id(), v_uid);

    IF TG_OP = 'INSERT' THEN
      NEW.vendedor_id := COALESCE(NEW.vendedor_id, v_uid);
      NEW.user_id := COALESCE(NEW.user_id, v_uid);
      NEW.agente_id := COALESCE(NEW.agente_id, v_agent_id);
      NEW.reseller_id := COALESCE(NEW.reseller_id, v_agent_id);
      NEW.tenant_id := COALESCE(NEW.tenant_id, v_uid);
    ELSIF TG_OP = 'UPDATE' THEN
      NEW.vendedor_id := COALESCE(OLD.vendedor_id, v_uid);
      NEW.user_id := COALESCE(OLD.user_id, v_uid);
      NEW.reseller_id := COALESCE(OLD.reseller_id, v_agent_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_clientes_vendedor_ownership ON public.clientes;
CREATE TRIGGER trg_sync_clientes_vendedor_ownership
BEFORE INSERT OR UPDATE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.sync_clientes_vendedor_ownership();

-- 6. Tabela opcional de leads com o mesmo isolamento por vendedor_id
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendedor_id UUID DEFAULT auth.uid(),
    user_id UUID DEFAULT auth.uid(),
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

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS vendedor_id UUID DEFAULT auth.uid();
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS idx_leads_vendedor_id ON public.leads(vendedor_id);

-- 7. Políticas RLS (Row Level Security) Multi-Tenant Estritas para public.clientes
-- Nota: Revendedores NUNCA visualizam registos com vendedor_id IS NULL (exclusivos Master).
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes FORCE ROW LEVEL SECURITY;

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
    OR vendedor_id = auth.uid()
    OR vendedor_id = public.current_reseller_agent_id()
    OR user_id = auth.uid()
    OR user_id = public.current_reseller_agent_id()
    OR reseller_id = auth.uid()
    OR reseller_id = public.current_reseller_agent_id()
    OR agente_id = public.current_reseller_agent_id()
    OR tenant_id = auth.uid()
  )
);

CREATE POLICY "rls_clientes_insert"
ON public.clientes FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR vendedor_id = auth.uid()
    OR vendedor_id = public.current_reseller_agent_id()
    OR user_id = auth.uid()
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
    OR vendedor_id = auth.uid()
    OR vendedor_id = public.current_reseller_agent_id()
    OR user_id = auth.uid()
    OR user_id = public.current_reseller_agent_id()
    OR reseller_id = auth.uid()
    OR reseller_id = public.current_reseller_agent_id()
    OR agente_id = public.current_reseller_agent_id()
    OR tenant_id = auth.uid()
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    public.is_master_user()
    OR vendedor_id = auth.uid()
    OR vendedor_id = public.current_reseller_agent_id()
    OR user_id = auth.uid()
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
    OR vendedor_id = auth.uid()
    OR vendedor_id = public.current_reseller_agent_id()
    OR user_id = auth.uid()
    OR reseller_id = auth.uid()
    OR reseller_id = public.current_reseller_agent_id()
    OR tenant_id = auth.uid()
  )
);

-- 8. Recarrega imediatamente o cache de schema do PostgREST (elimina PGRST204)
NOTIFY pgrst, 'reload schema';
