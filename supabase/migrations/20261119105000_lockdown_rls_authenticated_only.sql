-- Migration: 20261119105000_lockdown_rls_authenticated_only
-- Stage I (TZ v1.0, Test #12): Lock down borners_portfolio_kv & borners_portfolio_history strictly to authenticated company members.
-- Uses ALTER POLICY (non-destructive in-place tightening) + membership guard inside upsert_portfolio_kv_safe.

ALTER TABLE public.borners_portfolio_kv ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borners_portfolio_history ENABLE ROW LEVEL SECURITY;

-- Restrict all borners_portfolio_kv policies strictly to authenticated company members (ZERO anon access!)
ALTER POLICY borners_kv_select_policy ON public.borners_portfolio_kv
  TO authenticated
  USING (
    (SELECT private.is_company_member())
    AND (
      key = ANY (ARRAY['portfolio_core_v1'::text, 'platform_workspace_v1'::text])
      OR key LIKE 'photo_gallery:%'
      OR key LIKE 'concept_media:%'
    )
  );

ALTER POLICY borners_kv_insert_policy ON public.borners_portfolio_kv
  TO authenticated
  WITH CHECK (
    (SELECT private.is_company_member())
    AND (
      key = ANY (ARRAY['portfolio_core_v1'::text, 'platform_workspace_v1'::text])
      OR key LIKE 'photo_gallery:%'
      OR key LIKE 'concept_media:%'
    )
  );

ALTER POLICY borners_kv_update_policy ON public.borners_portfolio_kv
  TO authenticated
  USING (
    (SELECT private.is_company_member())
    AND (
      key = ANY (ARRAY['portfolio_core_v1'::text, 'platform_workspace_v1'::text])
      OR key LIKE 'photo_gallery:%'
      OR key LIKE 'concept_media:%'
    )
  )
  WITH CHECK (
    (SELECT private.is_company_member())
    AND (
      key = ANY (ARRAY['portfolio_core_v1'::text, 'platform_workspace_v1'::text])
      OR key LIKE 'photo_gallery:%'
      OR key LIKE 'concept_media:%'
    )
  );

-- Restrict all borners_portfolio_history policies strictly to authenticated company members
ALTER POLICY borners_history_select_policy ON public.borners_portfolio_history
  TO authenticated
  USING (
    (SELECT private.is_company_member())
    AND kv_key = ANY (ARRAY['portfolio_core_v1'::text, 'platform_workspace_v1'::text])
  );

ALTER POLICY borners_history_insert_policy ON public.borners_portfolio_history
  TO authenticated
  WITH CHECK (
    (SELECT private.is_company_member())
    AND kv_key = ANY (ARRAY['portfolio_core_v1'::text, 'platform_workspace_v1'::text])
  );

-- Harden upsert_portfolio_kv_safe with explicit membership check in addition to SECURITY INVOKER RLS
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
  IF NOT (SELECT private.is_company_member()) THEN
    RAISE EXCEPTION 'Forbidden: BORNERS GROUP membership required' USING ERRCODE = '42501';
  END IF;

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
