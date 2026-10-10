-- REVIEW CANDIDATE ONLY: not a numbered migration and not deployed.
-- Apply before deploying the matching callers. No web confirmation route exists.
-- Pending proposals live 30 minutes; successful retry receipts live 168 hours.
-- Expired proposals and receipts are deleted by scheduled cleanup. Token
-- issuance timestamps prevent historical re-registration without tombstones.
BEGIN;

CREATE TABLE public.esco_memory_proposals (
  token text PRIMARY KEY,
  owner_id uuid NOT NULL,
  payload_hash bytea NOT NULL,
  content text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp() + interval '30 minutes',
  consumed_at timestamptz,
  CHECK (content IS NULL OR (length(content) BETWEEN 1 AND 500 AND btrim(content) = content))
);
CREATE TABLE public.esco_memory_confirmation_receipts (
  token text PRIMARY KEY REFERENCES public.esco_memory_proposals(token),
  owner_id uuid NOT NULL,
  telegram_id bigint NOT NULL,
  payload_hash bytea NOT NULL,
  receipt jsonb NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.esco_memory_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esco_memory_confirmation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.esco_memory_proposals, public.esco_memory_confirmation_receipts FROM PUBLIC, anon, authenticated, service_role;

-- Internal bounded base36 decoder; not callable by clients.
CREATE FUNCTION public.esco_memory_token_issued_at(p_token text)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE issued_ms bigint := 0; issued_part text; position integer;
BEGIN
  IF p_token IS NULL OR p_token !~ '^mem_[0-9a-z]{1,10}_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid memory token' USING ERRCODE = '22023';
  END IF;
  issued_part := split_part(p_token, '_', 2);
  FOR position IN 1..length(issued_part) LOOP
    issued_ms := issued_ms * 36 + strpos('0123456789abcdefghijklmnopqrstuvwxyz', substr(issued_part, position, 1)) - 1;
  END LOOP;
  RETURN to_timestamp(issued_ms::double precision / 1000);
END $$;
REVOKE ALL ON FUNCTION public.esco_memory_token_issued_at(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.esco_register_memory_proposal(p_owner_id uuid, p_token text, p_content text, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE existing public.esco_memory_proposals%ROWTYPE; inserted public.esco_memory_proposals%ROWTYPE;
  hash bytea; profile public.usuarios%ROWTYPE; issued timestamptz; expires timestamptz; created timestamptz := clock_timestamp();
  inserted_count integer;
BEGIN
  IF p_owner_id IS NULL OR p_token IS NULL OR p_token !~ '^mem_[0-9a-z]{1,10}_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR p_content IS NULL OR length(p_content) NOT BETWEEN 1 AND 500 OR btrim(p_content) <> p_content
    OR (p_reason IS NOT NULL AND length(p_reason) > 500) THEN
    RAISE EXCEPTION 'Invalid memory proposal' USING ERRCODE = '22023';
  END IF;
  issued := public.esco_memory_token_issued_at(p_token);
  IF issued <= clock_timestamp() - interval '30 minutes' OR issued > clock_timestamp() + interval '60 seconds' THEN
    RAISE EXCEPTION 'Proposal issuance expired or future dated' USING ERRCODE = '22023';
  END IF;
  expires := issued + interval '30 minutes';
  SELECT * INTO profile FROM public.usuarios WHERE id = p_owner_id FOR SHARE;
  IF NOT FOUND OR profile.activo IS DISTINCT FROM true OR profile.rol::text <> 'Gerencia' THEN
    RAISE EXCEPTION 'Active Gerencia required' USING ERRCODE = '42501';
  END IF;
  hash := sha256(convert_to(jsonb_build_array(p_owner_id, p_token, p_content, p_reason)::text, 'UTF8'));
  INSERT INTO public.esco_memory_proposals(token, owner_id, payload_hash, content, reason, created_at, expires_at)
    VALUES(p_token, p_owner_id, hash, p_content, p_reason, created, expires) ON CONFLICT (token) DO NOTHING RETURNING * INTO inserted;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  SELECT * INTO existing FROM public.esco_memory_proposals WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal registration not confirmed'; END IF;
  IF existing.token IS DISTINCT FROM p_token OR existing.owner_id IS DISTINCT FROM p_owner_id
    OR existing.payload_hash IS DISTINCT FROM hash OR existing.content IS DISTINCT FROM p_content
    OR existing.reason IS DISTINCT FROM p_reason OR existing.expires_at IS DISTINCT FROM expires
    OR existing.consumed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Proposal payload conflict' USING ERRCODE = '22023';
  END IF;
  IF inserted_count = 1 AND (inserted.created_at IS DISTINCT FROM created OR to_jsonb(existing) IS DISTINCT FROM to_jsonb(inserted)) THEN
    RAISE EXCEPTION 'Durable proposal registration changed';
  END IF;
  IF existing.expires_at <= clock_timestamp() OR existing.content IS NULL THEN
    RAISE EXCEPTION 'Proposal unavailable' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('_memory_proposal', true, 'token', existing.token, 'content', existing.content, 'reason', existing.reason);
END $$;

CREATE FUNCTION public.esco_confirm_telegram_memory(p_owner_id uuid, p_telegram_id bigint, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE proposal public.esco_memory_proposals%ROWTYPE; receipt public.esco_memory_confirmation_receipts%ROWTYPE;
  registration public.telegram_usuarios%ROWTYPE; profile public.usuarios%ROWTYPE;
  registration_count integer := 0; memory public.esco_memorias%ROWTYPE; durable_memory public.esco_memorias%ROWTYPE;
  expected_proposal public.esco_memory_proposals%ROWTYPE; durable_proposal public.esco_memory_proposals%ROWTYPE;
  durable_receipt public.esco_memory_confirmation_receipts%ROWTYPE; confirmation_time timestamptz; result jsonb;
BEGIN
  IF p_owner_id IS NULL OR p_telegram_id IS NULL OR p_telegram_id <= 0 OR p_token IS NULL THEN
    RAISE EXCEPTION 'Invalid confirmation' USING ERRCODE = '22023';
  END IF;
  -- Admission and the resulting write share one transaction. These row locks
  -- serialize concurrent deactivation/relink/module/role changes with the write.
  FOR registration IN SELECT * FROM public.telegram_usuarios WHERE telegram_id = p_telegram_id FOR SHARE LOOP
    registration_count := registration_count + 1;
    IF registration.activo IS DISTINCT FROM true OR registration.usuario_id IS DISTINCT FROM p_owner_id
      OR NOT coalesce('consultas' = ANY(registration.modulos_permitidos), false) THEN
      RAISE EXCEPTION 'Current Telegram access required' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  IF registration_count <> 1 THEN RAISE EXCEPTION 'Unique Telegram link required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO profile FROM public.usuarios WHERE id = p_owner_id FOR SHARE;
  IF NOT FOUND OR profile.activo IS DISTINCT FROM true OR profile.rol::text <> 'Gerencia' THEN
    RAISE EXCEPTION 'Active Gerencia required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO proposal FROM public.esco_memory_proposals WHERE token = p_token FOR UPDATE;
  IF NOT FOUND OR proposal.owner_id <> p_owner_id THEN
    RAISE EXCEPTION 'Proposal unavailable' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO receipt FROM public.esco_memory_confirmation_receipts WHERE token = p_token;
  IF FOUND THEN
    IF receipt.owner_id <> p_owner_id OR receipt.telegram_id <> p_telegram_id OR receipt.payload_hash <> proposal.payload_hash THEN
      RAISE EXCEPTION 'Confirmation payload conflict' USING ERRCODE = '22023';
    END IF;
    IF receipt.confirmed_at <= clock_timestamp() - interval '168 hours' THEN
      RAISE EXCEPTION 'Confirmation receipt expired' USING ERRCODE = '22023';
    END IF;
    RETURN receipt.receipt || jsonb_build_object('replayed', true);
  END IF;
  IF proposal.consumed_at IS NOT NULL OR proposal.expires_at <= clock_timestamp() OR proposal.content IS NULL THEN
    RAISE EXCEPTION 'Proposal unavailable' USING ERRCODE = '22023';
  END IF;
  IF proposal.expires_at IS DISTINCT FROM public.esco_memory_token_issued_at(p_token) + interval '30 minutes'
    OR proposal.payload_hash IS DISTINCT FROM sha256(convert_to(jsonb_build_array(p_owner_id,p_token,proposal.content,proposal.reason)::text,'UTF8')) THEN
    RAISE EXCEPTION 'Proposal payload or expiry changed' USING ERRCODE = '22023';
  END IF;
  expected_proposal := proposal;
  INSERT INTO public.esco_memorias(user_id, content, source_channel)
    VALUES(p_owner_id, proposal.content, 'telegram') RETURNING * INTO memory;
  IF NOT FOUND OR memory.id IS NULL OR memory.user_id IS DISTINCT FROM p_owner_id
    OR memory.content IS DISTINCT FROM proposal.content OR memory.source_channel IS DISTINCT FROM 'telegram' THEN
    RAISE EXCEPTION 'Memory insert not confirmed';
  END IF;
  result := jsonb_build_object('saved', true, 'id', memory.id, 'saved_at', memory.created_at, 'content', proposal.content, 'replayed', false);
  confirmation_time := clock_timestamp();
  INSERT INTO public.esco_memory_confirmation_receipts(token, owner_id, telegram_id, payload_hash, receipt, confirmed_at)
    VALUES(p_token, p_owner_id, p_telegram_id, proposal.payload_hash, result, confirmation_time) RETURNING * INTO receipt;
  IF NOT FOUND OR receipt.token IS DISTINCT FROM p_token OR receipt.owner_id IS DISTINCT FROM p_owner_id
    OR receipt.telegram_id IS DISTINCT FROM p_telegram_id OR receipt.payload_hash IS DISTINCT FROM proposal.payload_hash
    OR receipt.receipt IS DISTINCT FROM result OR receipt.confirmed_at IS DISTINCT FROM confirmation_time THEN RAISE EXCEPTION 'Receipt insert not confirmed'; END IF;
  expected_proposal.consumed_at := confirmation_time;
  expected_proposal.content := NULL;
  expected_proposal.reason := NULL;
  UPDATE public.esco_memory_proposals SET consumed_at = confirmation_time, content = NULL, reason = NULL WHERE token = p_token RETURNING * INTO proposal;
  IF NOT FOUND OR to_jsonb(proposal) IS DISTINCT FROM to_jsonb(expected_proposal) THEN
    RAISE EXCEPTION 'Proposal consume not confirmed';
  END IF;
  -- Read all three rows after every BEFORE/AFTER trigger has completed. Returning
  -- alone observes BEFORE mutations but cannot prove durable AFTER-trigger state.
  SELECT * INTO durable_memory FROM public.esco_memorias WHERE id = memory.id FOR UPDATE;
  IF NOT FOUND OR to_jsonb(durable_memory) IS DISTINCT FROM to_jsonb(memory) THEN
    RAISE EXCEPTION 'Durable memory changed';
  END IF;
  SELECT * INTO durable_receipt FROM public.esco_memory_confirmation_receipts WHERE token = p_token FOR UPDATE;
  IF NOT FOUND OR to_jsonb(durable_receipt) IS DISTINCT FROM to_jsonb(receipt) THEN
    RAISE EXCEPTION 'Durable receipt changed';
  END IF;
  SELECT * INTO durable_proposal FROM public.esco_memory_proposals WHERE token = p_token FOR UPDATE;
  IF NOT FOUND OR to_jsonb(durable_proposal) IS DISTINCT FROM to_jsonb(expected_proposal) THEN
    RAISE EXCEPTION 'Durable proposal consume changed';
  END IF;
  RETURN result;
END $$;

CREATE FUNCTION public.esco_purge_memory_confirmation_payloads()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE receipts integer; proposals integer; purge_at timestamptz := clock_timestamp();
BEGIN
  DELETE FROM public.esco_memory_confirmation_receipts WHERE confirmed_at <= purge_at - interval '168 hours';
  GET DIAGNOSTICS receipts = ROW_COUNT;
  IF EXISTS (SELECT 1 FROM public.esco_memory_confirmation_receipts WHERE confirmed_at <= purge_at - interval '168 hours') THEN
    RAISE EXCEPTION 'Receipt purge incomplete';
  END IF;
  DELETE FROM public.esco_memory_proposals p
    WHERE p.expires_at <= purge_at
      AND NOT EXISTS (SELECT 1 FROM public.esco_memory_confirmation_receipts r WHERE r.token = p.token);
  GET DIAGNOSTICS proposals = ROW_COUNT;
  IF EXISTS (SELECT 1 FROM public.esco_memory_proposals p WHERE p.expires_at <= purge_at
    AND NOT EXISTS (SELECT 1 FROM public.esco_memory_confirmation_receipts r WHERE r.token = p.token)) THEN
    RAISE EXCEPTION 'Proposal purge incomplete';
  END IF;
  RETURN jsonb_build_object('receipts_purged', receipts, 'proposals_purged', proposals);
END $$;
REVOKE ALL ON FUNCTION public.esco_register_memory_proposal(uuid,text,text,text), public.esco_confirm_telegram_memory(uuid,bigint,text), public.esco_purge_memory_confirmation_payloads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.esco_register_memory_proposal(uuid,text,text,text), public.esco_confirm_telegram_memory(uuid,bigint,text), public.esco_purge_memory_confirmation_payloads() TO service_role;
COMMENT ON TABLE public.esco_memory_proposals IS 'Service-RPC-only 30-minute proposals; consumed rows retained only with their 168-hour confirmation receipt, then scheduled purge deletes them';
COMMIT;
