-- LOCAL REVIEW CANDIDATE ONLY. Historical-DDL harness is not live schema parity.
-- No bot cutover until actual FK/trigger/177 parity and writer participation approved.
-- Coarse EXCLUSIVE table locks deliberately fence FK/readset races; assess contention.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='telegram_id'
    WHERE i.indrelid='public.telegram_usuarios'::regclass AND i.indisunique AND i.indisvalid
      AND i.indimmediate AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum)
    THEN RAISE EXCEPTION 'Unique immediate Telegram sender index prerequisite'; END IF;
END $$;
CREATE SCHEMA hato_undo;
REVOKE ALL ON SCHEMA hato_undo FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_undo.requests (
  actor uuid NOT NULL, request_key uuid NOT NULL, sender bigint NOT NULL,
  payload jsonb NOT NULL, result jsonb, PRIMARY KEY(actor,request_key)
);
CREATE TABLE hato_undo.audit (
  operation text NOT NULL CHECK(operation IN ('event','treatment')), target_id uuid NOT NULL,
  actor uuid NOT NULL, request_key uuid NOT NULL, sender bigint NOT NULL,
  before_snapshot jsonb NOT NULL, after_snapshot jsonb NOT NULL, receipt jsonb NOT NULL,
  before_footprint_sha256 text NOT NULL CHECK(before_footprint_sha256 ~ '^[0-9a-f]{64}$'),
  after_footprint_sha256 text NOT NULL CHECK(after_footprint_sha256 ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY(operation,target_id), UNIQUE(actor,request_key),
  FOREIGN KEY(actor,request_key) REFERENCES hato_undo.requests(actor,request_key)
);
ALTER TABLE hato_undo.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE hato_undo.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_undo FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION hato_undo.authorize(sender bigint) RETURNS uuid
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE registration public.telegram_usuarios%ROWTYPE; profile public.usuarios%ROWTYPE; matches integer:=0;
BEGIN
  IF sender IS NULL OR sender<=0 OR sender>9007199254740991 THEN RAISE EXCEPTION 'Invalid trusted Telegram sender'; END IF;
  -- Matches the registration-before-profile order of the binding protocol.
  FOR registration IN SELECT * FROM public.telegram_usuarios WHERE telegram_id=sender ORDER BY id FOR SHARE LOOP
    IF registration.activo IS TRUE THEN matches:=matches+1; END IF;
  END LOOP;
  IF matches<>1 THEN RAISE EXCEPTION 'Unique active Telegram binding required' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT registration FROM public.telegram_usuarios WHERE telegram_id=sender AND activo IS TRUE;
  SELECT * INTO profile FROM public.usuarios WHERE id=registration.usuario_id FOR SHARE;
  IF NOT FOUND OR profile.activo IS DISTINCT FROM true OR profile.rol::text IS DISTINCT FROM 'Gerencia' THEN
    RAISE EXCEPTION 'Current active Gerencia required' USING ERRCODE='42501';
  END IF;
  RETURN profile.id;
END $$;

CREATE FUNCTION hato_undo.lock_footprint(op text) RETURNS oid[]
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE roots oid[]; footprint oid[]; relation oid;
BEGIN
  IF op='event' THEN roots:=ARRAY['public.hato_eventos'::regclass::oid];
  ELSIF op='treatment' THEN roots:=ARRAY['public.hato_tratamientos'::regclass::oid,'public.hato_tratamiento_pasos'::regclass::oid];
  ELSE RAISE EXCEPTION 'Unknown undo operation'; END IF;
  -- Header BEFORE steps is compatible with 177. Table locks precede row locks.
  FOREACH relation IN ARRAY roots LOOP EXECUTE format('LOCK TABLE %s IN EXCLUSIVE MODE',relation::regclass); END LOOP;
  WITH RECURSIVE relations(id) AS (SELECT unnest(roots) UNION
    SELECT c.conrelid FROM pg_constraint c JOIN relations r ON c.confrelid=r.id WHERE c.contype='f')
  SELECT array_agg(id ORDER BY id) INTO footprint FROM relations;
  FOREACH relation IN ARRAY footprint LOOP
    IF NOT relation=ANY(roots) THEN EXECUTE format('LOCK TABLE %s IN EXCLUSIVE MODE',relation::regclass); END IF;
  END LOOP;
  RETURN footprint;
END $$;

CREATE FUNCTION hato_undo.capture(relations oid[]) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE relation oid; rows jsonb; result jsonb:='{}';
BEGIN
  FOREACH relation IN ARRAY relations LOOP
    EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),''[]''::jsonb) FROM %s r',relation::regclass) INTO rows;
    result:=result||jsonb_build_object(relation::regclass::text,rows);
  END LOOP;
  RETURN result;
END $$;

CREATE FUNCTION hato_undo.proof(op text,target uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE row_json jsonb; steps jsonb:='[]';
BEGIN
  IF target IS NULL THEN RAISE EXCEPTION 'Target required'; END IF;
  IF op='event' THEN
    SELECT to_jsonb(e) INTO row_json FROM public.hato_eventos e WHERE id=target FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Event unavailable'; END IF;
    IF row_json->>'fuente' IS DISTINCT FROM 'telegram'
      OR row_json->>'chequeo_vaca_id' IS NOT NULL OR row_json->>'cria_id' IS NOT NULL
      OR row_json->>'alerta_id' IS NOT NULL OR row_json->>'transaccion_ganado_id' IS NOT NULL
      OR row_json->>'cria_destino' IS NOT DISTINCT FROM 'retenida'
      OR row_json->>'tipo' IS NULL
      OR row_json->>'tipo' NOT IN ('celo','confirmacion_prenez','parto','aborto','secado_real','cambio_etapa','rechequeo','servicio')
      OR (row_json->>'tipo'='servicio' AND row_json->>'tipo_servicio' IS DISTINCT FROM 'monta')
      OR (row_json->'datos' IS NOT NULL AND row_json->'datos'<>'null'::jsonb
        AND (jsonb_typeof(row_json->'datos') IS DISTINCT FROM 'object' OR (row_json->'datos') ? 'pajilla_uso_id'))
    THEN RAISE EXCEPTION 'Only provably standalone Telegram events; coupled or ambiguous legacy refused'; END IF;
  ELSIF op='treatment' THEN
    SELECT to_jsonb(t) INTO row_json FROM public.hato_tratamientos t WHERE id=target FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Treatment unavailable'; END IF;
    IF row_json->>'fuente' IS DISTINCT FROM 'telegram' OR row_json->>'chequeo_id' IS NOT NULL
      OR row_json->>'estado' IS DISTINCT FROM 'activo' THEN RAISE EXCEPTION 'Standalone active Telegram treatment required'; END IF;
    PERFORM id FROM public.hato_tratamiento_pasos WHERE tratamiento_id=target ORDER BY id FOR UPDATE;
    IF EXISTS(SELECT 1 FROM public.hato_tratamiento_pasos WHERE tratamiento_id=target AND fecha_ejecutada IS NOT NULL)
      THEN RAISE EXCEPTION 'Executed treatment step must be preserved'; END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id),'[]') INTO steps FROM public.hato_tratamiento_pasos s WHERE tratamiento_id=target;
  ELSE RAISE EXCEPTION 'Unknown undo operation'; END IF;
  RETURN jsonb_build_object('target',row_json,'steps',steps);
END $$;

-- Inspect actual incoming FKs, including SET NULL/CASCADE: references refuse,
-- except the exact treatment step set intentionally cascaded and audited.
CREATE FUNCTION hato_undo.refuse_references(op text,target uuid,snapshot jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE root oid; fk record; conditions text; referenced boolean; ids uuid[];
BEGIN
  FOR root IN SELECT unnest(CASE WHEN op='event' THEN ARRAY['public.hato_eventos'::regclass::oid]
    ELSE ARRAY['public.hato_tratamientos'::regclass::oid,'public.hato_tratamiento_pasos'::regclass::oid] END) LOOP
    IF root='public.hato_tratamiento_pasos'::regclass THEN
      SELECT coalesce(array_agg((value->>'id')::uuid),ARRAY[]::uuid[]) INTO ids FROM jsonb_array_elements(snapshot->'steps');
    ELSE ids:=ARRAY[target]; END IF;
    FOR fk IN SELECT * FROM pg_constraint WHERE contype='f' AND confrelid=root LOOP
      IF op='treatment' AND root='public.hato_tratamientos'::regclass
        AND fk.conrelid='public.hato_tratamiento_pasos'::regclass AND fk.confdeltype='c'
        AND fk.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=fk.conrelid AND attname='tratamiento_id')]
        AND fk.confkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=root AND attname='id')] THEN CONTINUE; END IF;
      SELECT string_agg(format('child.%I=parent.%I',ca.attname,pa.attname),' AND ' ORDER BY keys.n) INTO conditions
      FROM unnest(fk.conkey,fk.confkey) WITH ORDINALITY keys(c,p,n)
      JOIN pg_attribute ca ON ca.attrelid=fk.conrelid AND ca.attnum=keys.c
      JOIN pg_attribute pa ON pa.attrelid=root AND pa.attnum=keys.p;
      EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s child JOIN %s parent ON %s WHERE parent.id=ANY($1))',
        fk.conrelid::regclass,root::regclass,conditions) INTO referenced USING ids;
      IF referenced THEN RAISE EXCEPTION 'Referenced clinical/history record must be preserved: %',fk.conname; END IF;
    END LOOP;
  END LOOP;
END $$;

CREATE FUNCTION public.fn_hato_undo_prepare(p_sender bigint,p_operation text,p_target_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor uuid; snapshot jsonb;
BEGIN
  actor:=hato_undo.authorize(p_sender);
  PERFORM hato_undo.lock_footprint(p_operation);
  snapshot:=hato_undo.proof(p_operation,p_target_id);
  PERFORM hato_undo.refuse_references(p_operation,p_target_id,snapshot);
  RETURN jsonb_build_object('actor',actor,'sender',p_sender,'operation',p_operation,'target_id',p_target_id,'snapshot',snapshot);
END $$;

CREATE FUNCTION hato_undo.validate_payload(actor uuid,sender bigint,payload jsonb) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
    OR payload-ARRAY['actor','sender','operation','target_id','snapshot']<>'{}'::jsonb
    OR payload->>'actor' IS DISTINCT FROM actor::text OR payload->'sender' IS DISTINCT FROM to_jsonb(sender)
    OR payload->>'operation' IS NULL OR payload->>'operation' NOT IN ('event','treatment')
    OR payload->>'target_id' IS NULL OR jsonb_typeof(payload->'snapshot') IS DISTINCT FROM 'object'
    OR (payload->'snapshot')-ARRAY['target','steps']<>'{}'::jsonb
    OR jsonb_typeof(payload->'snapshot'->'target') IS DISTINCT FROM 'object'
    OR jsonb_typeof(payload->'snapshot'->'steps') IS DISTINCT FROM 'array'
    OR payload->'snapshot'->'target'->>'id' IS DISTINCT FROM payload->>'target_id'
    THEN RAISE EXCEPTION 'Exact owner-bound canonical proof required'; END IF;
  PERFORM (payload->>'target_id')::uuid;
END $$;

CREATE FUNCTION public.fn_hato_undo(p_sender bigint,p_request_key uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
<<undo_tx>>
DECLARE actor uuid; request hato_undo.requests%ROWTYPE; evidence hato_undo.audit%ROWTYPE;
  op text; target uuid; footprint oid[]; current_proof jsonb; before_state jsonb; expected_state jsonb;
  receipt jsonb; table_name text; rows jsonb; deleted jsonb;
BEGIN
  actor:=hato_undo.authorize(p_sender);
  PERFORM hato_undo.validate_payload(actor,p_sender,p_payload);
  IF p_request_key IS NULL THEN RAISE EXCEPTION 'Stable request key required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request_key::text,0));
  SELECT * INTO request FROM hato_undo.requests WHERE requests.actor=undo_tx.actor AND request_key=p_request_key FOR UPDATE;
  IF FOUND THEN
    IF request.sender IS DISTINCT FROM p_sender OR request.payload IS DISTINCT FROM p_payload OR request.result IS NULL
      THEN RAISE EXCEPTION 'Request payload conflict or incomplete outcome'; END IF;
    IF request.result='{"cancelled":true}'::jsonb THEN RAISE EXCEPTION 'Cancelled key fenced'; END IF;
    SELECT * INTO evidence FROM hato_undo.audit WHERE audit.actor=undo_tx.actor AND request_key=p_request_key;
    IF NOT FOUND OR evidence.receipt IS DISTINCT FROM request.result
      OR evidence.sender IS DISTINCT FROM p_sender OR evidence.operation IS DISTINCT FROM p_payload->>'operation'
      OR evidence.target_id IS DISTINCT FROM (p_payload->>'target_id')::uuid
      OR evidence.before_snapshot IS DISTINCT FROM p_payload->'snapshot'
      OR evidence.after_snapshot IS DISTINCT FROM '{"target":null,"steps":[]}'::jsonb
      THEN RAISE EXCEPTION 'Replay audit unavailable'; END IF;
    RETURN request.result;
  END IF;
  op:=p_payload->>'operation'; target:=(p_payload->>'target_id')::uuid;
  footprint:=hato_undo.lock_footprint(op);
  IF EXISTS(SELECT 1 FROM hato_undo.audit WHERE operation=op AND target_id=target) THEN RAISE EXCEPTION 'Target already undone'; END IF;
  current_proof:=hato_undo.proof(op,target);
  IF current_proof IS DISTINCT FROM p_payload->'snapshot' THEN RAISE EXCEPTION 'Target changed; canonical proof stale'; END IF;
  PERFORM hato_undo.refuse_references(op,target,current_proof);
  before_state:=hato_undo.capture(footprint); expected_state:=before_state;
  INSERT INTO hato_undo.requests VALUES(actor,p_request_key,p_sender,p_payload,NULL) RETURNING * INTO request;
  IF NOT FOUND OR request.payload IS DISTINCT FROM p_payload OR request.actor IS DISTINCT FROM actor
    OR request.sender IS DISTINCT FROM p_sender OR request.request_key IS DISTINCT FROM p_request_key OR request.result IS NOT NULL
    THEN RAISE EXCEPTION 'Request insertion not confirmed'; END IF;
  IF hato_undo.capture(footprint) IS DISTINCT FROM before_state THEN RAISE EXCEPTION 'Request insertion trigger mutation refused'; END IF;
  FOR table_name,rows IN SELECT key,value FROM jsonb_each(before_state) LOOP
    IF table_name=(CASE WHEN op='event' THEN 'public.hato_eventos'::regclass::text ELSE 'public.hato_tratamientos'::regclass::text END) THEN
      SELECT coalesce(jsonb_agg(value ORDER BY value::text),'[]') INTO rows FROM jsonb_array_elements(rows) WHERE value->>'id'<>target::text;
    ELSIF op='treatment' AND table_name='public.hato_tratamiento_pasos'::regclass::text THEN
      SELECT coalesce(jsonb_agg(value ORDER BY value::text),'[]') INTO rows FROM jsonb_array_elements(rows) WHERE value->>'tratamiento_id' IS DISTINCT FROM target::text;
    END IF;
    expected_state:=jsonb_set(expected_state,ARRAY[table_name],rows);
  END LOOP;
  IF op='event' THEN DELETE FROM public.hato_eventos WHERE id=target RETURNING to_jsonb(hato_eventos) INTO deleted;
  ELSE DELETE FROM public.hato_tratamientos WHERE id=target RETURNING to_jsonb(hato_tratamientos) INTO deleted; END IF;
  IF NOT FOUND OR deleted IS DISTINCT FROM current_proof->'target' OR hato_undo.capture(footprint) IS DISTINCT FROM expected_state
    THEN RAISE EXCEPTION 'Exact atomic deletion/readback not confirmed'; END IF;
  receipt:=jsonb_build_object('actor',actor,'sender',p_sender,'request_key',p_request_key,'operation',op,'target_id',target,
    'before',current_proof,'after',jsonb_build_object('target',NULL,'steps','[]'::jsonb));
  -- Full footprint remains transient: never duplicate unrelated clinical rows
  -- in retained audit. Persist affected rows plus invariant-state attestations.
  INSERT INTO hato_undo.audit VALUES(op,target,actor,p_request_key,p_sender,current_proof,receipt->'after',receipt,
    encode(sha256(convert_to(before_state::text,'UTF8')),'hex'),
    encode(sha256(convert_to(expected_state::text,'UTF8')),'hex')) RETURNING * INTO evidence;
  IF NOT FOUND OR evidence.operation IS DISTINCT FROM op OR evidence.target_id IS DISTINCT FROM target
    OR evidence.actor IS DISTINCT FROM actor OR evidence.request_key IS DISTINCT FROM p_request_key OR evidence.sender IS DISTINCT FROM p_sender
    OR evidence.before_snapshot IS DISTINCT FROM current_proof OR evidence.after_snapshot IS DISTINCT FROM receipt->'after'
    OR evidence.before_footprint_sha256 IS DISTINCT FROM encode(sha256(convert_to(before_state::text,'UTF8')),'hex')
    OR evidence.after_footprint_sha256 IS DISTINCT FROM encode(sha256(convert_to(expected_state::text,'UTF8')),'hex')
    OR evidence.receipt IS DISTINCT FROM receipt THEN RAISE EXCEPTION 'Full audit insertion not confirmed'; END IF;
  UPDATE hato_undo.requests SET result=receipt WHERE requests.actor=undo_tx.actor AND request_key=p_request_key AND result IS NULL RETURNING * INTO request;
  IF NOT FOUND OR request.payload IS DISTINCT FROM p_payload OR request.sender IS DISTINCT FROM p_sender OR request.result IS DISTINCT FROM receipt
    THEN RAISE EXCEPTION 'Receipt persistence not confirmed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM hato_undo.requests r WHERE r.actor=undo_tx.actor AND r.request_key=p_request_key AND to_jsonb(r)=to_jsonb(request))
    OR NOT EXISTS(SELECT 1 FROM hato_undo.audit a WHERE a.operation=op AND a.target_id=target AND to_jsonb(a)=to_jsonb(evidence))
    OR hato_undo.capture(footprint) IS DISTINCT FROM expected_state THEN RAISE EXCEPTION 'After-trigger mutation refused'; END IF;
  IF hato_undo.authorize(p_sender) IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Authority changed during mutation'; END IF;
  RETURN receipt;
END $$;

CREATE FUNCTION public.fn_hato_undo_resolve(p_sender bigint,p_request_key uuid,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
<<resolve_tx>>
DECLARE actor uuid; request hato_undo.requests%ROWTYPE; footprint oid[]; before_state jsonb;
BEGIN
  actor:=hato_undo.authorize(p_sender); PERFORM hato_undo.validate_payload(actor,p_sender,p_payload);
  IF p_request_key IS NULL THEN RAISE EXCEPTION 'Stable request key required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request_key::text,0));
  SELECT * INTO request FROM hato_undo.requests WHERE requests.actor=resolve_tx.actor AND request_key=p_request_key FOR UPDATE;
  IF FOUND THEN
    IF request.payload IS DISTINCT FROM p_payload OR request.sender IS DISTINCT FROM p_sender OR request.result IS NULL
      THEN RAISE EXCEPTION 'Request payload conflict or unknown state'; END IF;
  ELSE
    footprint:=hato_undo.lock_footprint(p_payload->>'operation'); before_state:=hato_undo.capture(footprint);
    INSERT INTO hato_undo.requests VALUES(actor,p_request_key,p_sender,p_payload,'{"cancelled":true}') RETURNING * INTO request;
  END IF;
  IF request.actor IS DISTINCT FROM actor OR request.request_key IS DISTINCT FROM p_request_key
    OR request.payload IS DISTINCT FROM p_payload OR request.sender IS DISTINCT FROM p_sender OR request.result IS NULL
    OR NOT EXISTS(SELECT 1 FROM hato_undo.requests r WHERE r.actor=resolve_tx.actor AND r.request_key=p_request_key AND to_jsonb(r)=to_jsonb(request))
    THEN RAISE EXCEPTION 'Cancellation persistence not confirmed'; END IF;
  IF hato_undo.authorize(p_sender) IS DISTINCT FROM actor OR (footprint IS NOT NULL AND hato_undo.capture(footprint) IS DISTINCT FROM before_state)
    THEN RAISE EXCEPTION 'Resolution trigger mutation refused'; END IF;
  IF request.result='{"cancelled":true}'::jsonb THEN
    RETURN jsonb_build_object('state','cancelled','request_key',p_request_key,'operation',p_payload->>'operation');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM hato_undo.audit a WHERE a.actor=resolve_tx.actor AND a.request_key=p_request_key AND a.receipt=request.result
      AND a.sender=p_sender AND a.operation=p_payload->>'operation' AND a.target_id=(p_payload->>'target_id')::uuid
      AND a.before_snapshot=p_payload->'snapshot' AND a.after_snapshot='{"target":null,"steps":[]}'::jsonb)
    THEN RAISE EXCEPTION 'Committed audit unavailable'; END IF;
  RETURN jsonb_build_object('state','committed','request_key',p_request_key,'operation',p_payload->>'operation','receipt',request.result);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_undo FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_undo_prepare(bigint,text,uuid),public.fn_hato_undo(bigint,uuid,jsonb),public.fn_hato_undo_resolve(bigint,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hato_undo_prepare(bigint,text,uuid),public.fn_hato_undo(bigint,uuid,jsonb),public.fn_hato_undo_resolve(bigint,uuid,jsonb) TO service_role;
COMMIT;
