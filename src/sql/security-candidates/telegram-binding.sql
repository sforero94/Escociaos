-- NONNUMBERED REVIEW CANDIDATE. Apply in an approved release before matching bot callers.
-- Consumed codes refuse replay; the normal /start path uses the existing registration.
-- No role mapping, module expansion, profile mutation, reactivation, or new RLS policy.
BEGIN;
CREATE FUNCTION public.telegram_consume_binding_code(p_code text, p_telegram_id bigint, p_username text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  registration public.telegram_usuarios%ROWTYPE;
  candidate public.telegram_usuarios%ROWTYPE;
  returned public.telegram_usuarios%ROWTYPE;
  durable public.telegram_usuarios%ROWTYPE;
  profile public.usuarios%ROWTYPE;
  final_profile public.usuarios%ROWTYPE;
  matches integer := 0;
  affected integer := 0;
  ignored_columns text[] := ARRAY['telegram_id','telegram_username','codigo_vinculacion','codigo_expira_at','updated_at'];
BEGIN
  IF p_code IS NULL OR p_code !~ '^[A-Z0-9]{8}$'
     OR p_telegram_id IS NULL OR p_telegram_id <= 0 OR p_telegram_id > 9007199254740991
     OR (p_username IS NOT NULL AND length(p_username) > 64) THEN
    RAISE EXCEPTION 'Invalid Telegram binding request' USING ERRCODE='22023';
  END IF;
  -- Lock a deterministic candidate set, not a read followed by an unconditional PATCH.
  -- Existing code index is nonunique: an ambiguous code must consume neither row.
  FOR candidate IN SELECT * FROM public.telegram_usuarios WHERE codigo_vinculacion=p_code ORDER BY id FOR UPDATE LOOP
    registration := candidate;
    matches := matches + 1;
  END LOOP;
  IF matches <> 1 OR registration.telegram_id IS NOT NULL
     OR registration.activo IS DISTINCT FROM true OR registration.codigo_expira_at IS NULL
     OR NOT isfinite(registration.codigo_expira_at) OR registration.codigo_expira_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Binding code unavailable, revoked, expired or already consumed' USING ERRCODE='42501';
  END IF;
  IF registration.usuario_id IS NOT NULL THEN
    SELECT * INTO profile FROM public.usuarios WHERE id=registration.usuario_id FOR SHARE;
    IF NOT FOUND OR profile.activo IS DISTINCT FROM true OR profile.rol IS NULL THEN
      RAISE EXCEPTION 'Current linked application profile required' USING ERRCODE='42501';
    END IF;
  END IF;
  -- The existing UNIQUE telegram_id constraint prevents sender takeover of a second row.
  UPDATE public.telegram_usuarios SET telegram_id=p_telegram_id, telegram_username=p_username,
    codigo_vinculacion=NULL, codigo_expira_at=NULL
  WHERE id=registration.id AND codigo_vinculacion=p_code AND telegram_id IS NULL
    AND activo=true AND codigo_expira_at > clock_timestamp()
  RETURNING * INTO returned;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Binding update not confirmed'; END IF;
  SELECT * INTO durable FROM public.telegram_usuarios WHERE id=registration.id FOR UPDATE;
  IF NOT FOUND OR durable.telegram_id IS DISTINCT FROM p_telegram_id
     OR durable.telegram_username IS DISTINCT FROM p_username OR durable.codigo_vinculacion IS NOT NULL
     OR durable.codigo_expira_at IS NOT NULL OR durable.activo IS DISTINCT FROM true
     OR registration.codigo_expira_at <= clock_timestamp()
     OR (to_jsonb(durable)-ignored_columns) IS DISTINCT FROM (to_jsonb(registration)-ignored_columns)
     OR (to_jsonb(returned)-'updated_at') IS DISTINCT FROM (to_jsonb(durable)-'updated_at') THEN
    RAISE EXCEPTION 'Durable binding differs from requested identity or authority';
  END IF;
  IF durable.usuario_id IS NOT NULL THEN
    SELECT * INTO final_profile FROM public.usuarios WHERE id=durable.usuario_id FOR SHARE;
    IF NOT FOUND OR final_profile.activo IS DISTINCT FROM true OR final_profile.rol IS DISTINCT FROM profile.rol THEN
      RAISE EXCEPTION 'Linked profile authority changed during binding' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN jsonb_build_object('registration',to_jsonb(durable), 'linked_profile',
    CASE WHEN durable.usuario_id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',final_profile.id,'activo',final_profile.activo,'rol',final_profile.rol) END);
END $$;
REVOKE ALL ON FUNCTION public.telegram_consume_binding_code(text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_consume_binding_code(text,bigint,text) TO service_role;
COMMIT;
