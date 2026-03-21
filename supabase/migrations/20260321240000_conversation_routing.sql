-- Roteamento automático: carga, disponibilidade (online) e especialidade (tags)

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS auto_assign_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS routing_skill_tags TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS skill_tags TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.channels.routing_skill_tags IS 'Tags exigidas no canal; agentes com interseção em skill_tags têm prioridade; se vazio, qualquer agente elegível.';
COMMENT ON COLUMN public.organization_members.skill_tags IS 'Especialidades do agente (ex.: suporte, vendas, whatsapp).';

-- Atribui o agente com menor carga entre os online, respeitando max_concurrent_chats e tags do canal.
CREATE OR REPLACE FUNCTION public.assign_conversation_agent(
  p_organization_id uuid,
  p_channel_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tags text[];
  v_auto boolean;
  v_id uuid;
BEGIN
  SELECT c.routing_skill_tags, COALESCE(c.auto_assign_enabled, true)
  INTO v_tags, v_auto
  FROM public.channels c
  WHERE c.id = p_channel_id AND c.organization_id = p_organization_id;

  IF NOT FOUND OR v_auto = false THEN
    RETURN NULL;
  END IF;

  SELECT om.id INTO v_id
  FROM public.organization_members om
  LEFT JOIN (
    SELECT assignee_id, COUNT(*)::int AS n
    FROM public.conversations
    WHERE organization_id = p_organization_id AND status IN ('open', 'pending')
    GROUP BY assignee_id
  ) cnt ON cnt.assignee_id = om.id
  WHERE om.organization_id = p_organization_id
    AND om.role = 'agent'
    AND COALESCE(om.status, 'offline') = 'online'
    AND COALESCE(cnt.n, 0) < COALESCE(om.max_concurrent_chats, 5)
    AND (
      COALESCE(cardinality(v_tags), 0) = 0
      OR (om.skill_tags && v_tags)
    )
  ORDER BY COALESCE(cnt.n, 0) ASC, random()
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  IF COALESCE(cardinality(v_tags), 0) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT om.id INTO v_id
  FROM public.organization_members om
  LEFT JOIN (
    SELECT assignee_id, COUNT(*)::int AS n
    FROM public.conversations
    WHERE organization_id = p_organization_id AND status IN ('open', 'pending')
    GROUP BY assignee_id
  ) cnt ON cnt.assignee_id = om.id
  WHERE om.organization_id = p_organization_id
    AND om.role = 'agent'
    AND COALESCE(om.status, 'offline') = 'online'
    AND COALESCE(cnt.n, 0) < COALESCE(om.max_concurrent_chats, 5)
  ORDER BY COALESCE(cnt.n, 0) ASC, random()
  LIMIT 1;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_conversation_agent(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_conversation_agent(uuid, uuid) TO service_role;

-- Admins podem editar skill_tags / max_concurrent_chats de outros membros
-- (subquery directa a organization_members na policy causa recursão infinita em RLS — usar função SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.current_user_is_org_admin(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_is_org_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_is_org_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_is_org_admin(uuid) TO service_role;

DROP POLICY IF EXISTS "Owners and admins update member rows" ON public.organization_members;
CREATE POLICY "Owners and admins update member rows"
  ON public.organization_members FOR UPDATE TO authenticated
  USING (public.current_user_is_org_admin(organization_id))
  WITH CHECK (public.current_user_is_org_admin(organization_id));

-- Realtime (substitui polling / Socket.io no cliente)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.organization_members;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
