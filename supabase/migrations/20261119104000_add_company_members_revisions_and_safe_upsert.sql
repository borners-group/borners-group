-- Migration: 20261119104000_add_company_members_revisions_and_safe_upsert
-- Stage I (TZ v1.0): Company membership table, RLS helper, optimistic concurrency revisions & safe upsert RPC

-- 1. Private helper schema
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- 2. Company members table (authorized users of BORNERS GROUP)
CREATE TABLE IF NOT EXISTS public.company_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN ('owner', 'partner', 'admin', 'manager')),
  company_code text NOT NULL DEFAULT 'BORNERS_GROUP',
  display_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_members_self_select ON public.company_members;
CREATE POLICY company_members_self_select ON public.company_members
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.company_members FROM anon;
GRANT SELECT ON public.company_members TO authenticated;

-- 3. Security definer helper checking current auth.uid() membership
CREATE OR REPLACE FUNCTION private.is_company_member()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members
    WHERE user_id = (SELECT auth.uid())
  );
$$;

REVOKE EXECUTE ON FUNCTION private.is_company_member() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.is_company_member() FROM anon;
GRANT EXECUTE ON FUNCTION private.is_company_member() TO authenticated, service_role;

-- 4. Add optimistic concurrency revision & audit columns
ALTER TABLE public.borners_portfolio_kv
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by_email text;

ALTER TABLE public.borners_portfolio_history
  ADD COLUMN IF NOT EXISTS revision bigint,
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS actor_email text;

CREATE INDEX IF NOT EXISTS idx_borners_history_kv_key_recorded_at
  ON public.borners_portfolio_history (kv_key, recorded_at DESC);

-- 5. Safe optimistic-concurrency upsert RPC (SECURITY INVOKER -> respects RLS!)
CREATE OR REPLACE FUNCTION public.upsert_portfolio_kv_safe(
  p_key text,
  p_payload jsonb,
  p_expected_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_existing RECORD;
  v_new_revision bigint;
  v_new_updated_at timestamptz;
  v_uid uuid;
  v_email text;
BEGIN
  IF NOT (
    p_key IN ('portfolio_core_v1', 'platform_workspace_v1')
    OR p_key LIKE 'photo_gallery:%'
    OR p_key LIKE 'concept_media:%'
  ) THEN
    RAISE EXCEPTION 'Disallowed kv key: %', p_key;
  END IF;

  v_uid := (SELECT auth.uid());
  v_email := COALESCE((SELECT auth.jwt() ->> 'email'), '');

  SELECT revision, updated_at, payload
    INTO v_existing
    FROM public.borners_portfolio_kv
   WHERE key = p_key
   FOR UPDATE;

  IF FOUND AND p_expected_revision IS NOT NULL AND v_existing.revision <> p_expected_revision THEN
    RETURN jsonb_build_object(
      'ok', false,
      'conflict', true,
      'server_revision', v_existing.revision,
      'server_updated_at', v_existing.updated_at,
      'server_payload', v_existing.payload
    );
  END IF;

  INSERT INTO public.borners_portfolio_kv (key, payload, updated_at, revision, updated_by, updated_by_email)
  VALUES (p_key, p_payload, now(), 1, v_uid, v_email)
  ON CONFLICT (key) DO UPDATE
    SET payload = EXCLUDED.payload,
        updated_at = now(),
        revision = public.borners_portfolio_kv.revision + 1,
        updated_by = v_uid,
        updated_by_email = v_email
  RETURNING revision, updated_at
    INTO v_new_revision, v_new_updated_at;

  IF p_key IN ('portfolio_core_v1', 'platform_workspace_v1') THEN
    INSERT INTO public.borners_portfolio_history (kv_key, payload, recorded_at, revision, actor_user_id, actor_email)
    VALUES (p_key, p_payload, v_new_updated_at, v_new_revision, v_uid, v_email);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'conflict', false,
    'server_revision', v_new_revision,
    'server_updated_at', v_new_updated_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_portfolio_kv_safe(text, jsonb, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_portfolio_kv_safe(text, jsonb, bigint) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_portfolio_kv_safe(text, jsonb, bigint) TO authenticated, service_role;
