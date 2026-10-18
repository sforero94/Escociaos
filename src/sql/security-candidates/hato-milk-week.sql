-- NONNUMBERED protected week milk edit/delete after45candidates. OFFLINE ONLY.
BEGIN;
SELECT hato_birth_undo.lock_domain();
DO $$ BEGIN IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed milk week installation owner required';END IF;PERFORM hato_milk_weighing.assert_baseline();END $$;
CREATE SCHEMA hato_milk_week;
REVOKE ALL ON SCHEMA hato_milk_week FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_milk_week.requests(request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,intent jsonb,original jsonb,plan jsonb,effective_date date,state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,acknowledged boolean NOT NULL DEFAULT false,
 CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR intent IS NOT NULL AND original IS NOT NULL AND plan IS NOT NULL AND effective_date IS NOT NULL),CHECK(NOT acknowledged OR state IN('committed','canceled')));
CREATE UNIQUE INDEX one_original_registration ON hato_milk_week.requests(owner_id) WHERE state IN('pending','committed') AND NOT acknowledged;
CREATE TABLE hato_milk_week.audit(request_key uuid PRIMARY KEY REFERENCES hato_milk_week.requests(request_key),receipt jsonb NOT NULL);
ALTER TABLE hato_milk_week.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_milk_week.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_milk_weighing FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_milk_week.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' THEN RAISE EXCEPTION 'Immutable milk weighing proof';END IF;
 IF ((to_jsonb(NEW)-'acknowledged')=(to_jsonb(OLD)-'acknowledged') AND NOT OLD.acknowledged AND NEW.acknowledged AND OLD.state IN('committed','canceled')) OR (OLD.state='pending' AND NEW.state IN('committed','canceled') AND (to_jsonb(NEW)-'state'-'receipt')=(to_jsonb(OLD)-'state'-'receipt')) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Immutable original milk weighing';
END $$;
CREATE TRIGGER immutable_registration_request BEFORE UPDATE OR DELETE ON hato_milk_week.requests FOR EACH ROW EXECUTE FUNCTION hato_milk_week.immutable();
CREATE TRIGGER immutable_registration_audit BEFORE UPDATE OR DELETE ON hato_milk_week.audit FOR EACH ROW EXECUTE FUNCTION hato_milk_week.immutable();
CREATE TRIGGER no_truncate_registration_request BEFORE TRUNCATE ON hato_milk_week.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_milk_week.immutable();
CREATE TRIGGER no_truncate_registration_audit BEFORE TRUNCATE ON hato_milk_week.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_milk_week.immutable();
CREATE FUNCTION hato_milk_week.controls() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_milk_week.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_milk_week.audit x));
$$;
CREATE FUNCTION hato_milk_week.result(r hato_milk_week.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'owner',r.owner_id,'state',r.state,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'receipt',r.receipt,'acknowledged',coalesce(r.acknowledged,false));
$$;

CREATE FUNCTION hato_milk_week.assert_baseline() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM hato_milk_weighing.assert_baseline();
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid='public.hato_pesajes_leche'::regclass) OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class='public.hato_pesajes_leche'::regclass) THEN RAISE EXCEPTION 'Unreviewed milk week dependency/rule';END IF;
END $$;
CREATE FUNCTION hato_milk_week.actor() RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE actor jsonb;BEGIN actor=hato_treatment_creation.web_actor();
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=(actor->>'profileId')::uuid AND activo IS TRUE AND rol::text='Gerencia') THEN RAISE EXCEPTION 'Fresh Gerencia milk week writer required' USING ERRCODE='42501';END IF;RETURN actor;
END $$;
CREATE FUNCTION hato_milk_week.snapshot(p_start text,p_end text) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF p_start IS NULL OR p_end IS NULL OR (p_start::date)::text IS DISTINCT FROM p_start OR(p_end::date)::text IS DISTINCT FROM p_end OR p_end::date-p_start::date<>6 OR p_start::date<'2020-01-01'::date OR p_end::date>='2101-01-01'::date THEN RAISE EXCEPTION 'Exact bounded milk week required';END IF;
 RETURN jsonb_build_object('rows',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.hato_pesajes_leche x WHERE fecha BETWEEN p_start::date AND p_end::date),'animals',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.hato_animales x WHERE EXISTS(SELECT 1 FROM public.hato_pesajes_leche p WHERE p.animal_id=x.id AND p.fecha BETWEEN p_start::date AND p_end::date)));
END $$;
CREATE FUNCTION hato_milk_week.validate(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE x jsonb;v jsonb;BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p)k) IS DISTINCT FROM ARRAY['changes','end','observed','start','version'] OR p->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p->'start') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'end') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'observed') IS DISTINCT FROM 'array' OR jsonb_typeof(p->'changes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Exact milk week intent required';END IF;
 PERFORM hato_milk_week.snapshot(p->>'start',p->>'end');
 IF jsonb_array_length(p->'changes') NOT BETWEEN 1 AND 2000 OR jsonb_array_length(p->'observed')>5000 OR octet_length(p::text)>2097152 THEN RAISE EXCEPTION 'Bounded milk week selection required';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p->'changes') LOOP
  IF jsonb_typeof(x) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(x)k) IS DISTINCT FROM ARRAY['am','id','pm','remove','total'] OR jsonb_typeof(x->'id') IS DISTINCT FROM 'string' OR(x->>'id')::uuid::text IS DISTINCT FROM x->>'id' OR jsonb_typeof(x->'remove') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Exact selected milk row change required';END IF;
  IF(x->>'remove')::boolean THEN
   IF x->'am' IS DISTINCT FROM 'null'::jsonb OR x->'pm' IS DISTINCT FROM 'null'::jsonb OR x->'total' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Explicit milk deletion must not invent readings';END IF;
  ELSE
   IF jsonb_typeof(x->'total') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Explicit nonnegative milk total required';END IF;
   FOR v IN SELECT x->'am' UNION ALL SELECT x->'pm' UNION ALL SELECT x->'total' LOOP IF jsonb_typeof(v) NOT IN('null','number') OR(jsonb_typeof(v)='number' AND v::text::numeric<0) THEN RAISE EXCEPTION 'Nonnegative finite week reading required';END IF;END LOOP;
   IF (x->'am'<>'null'::jsonb OR x->'pm'<>'null'::jsonb) AND(x->>'total')::numeric IS DISTINCT FROM round(coalesce((x->>'am')::numeric,0)+coalesce((x->>'pm')::numeric,0),3) THEN RAISE EXCEPTION 'Exact rounded shift sum required';END IF;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'changes') selected(value) GROUP BY selected.value->>'id' HAVING count(*)<>1) THEN RAISE EXCEPTION 'Duplicate milk week target';END IF;
END $$;
CREATE FUNCTION public.fn_hato_milk_week_web(p_action text,p_request_key uuid,p_intent jsonb,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_milk_week.requests;expected hato_milk_week.requests;before_domain jsonb;expected_domain jsonb;before_controls jsonb;expected_controls jsonb;herd jsonb;cell jsonb;old jsonb;created jsonb;written jsonb;row_value public.hato_pesajes_leche;accepted jsonb='[]';rejected jsonb='[]';before_rows jsonb='[]';after_rows jsonb='[]';changes jsonb='[]';traces jsonb;change jsonb;iso integer;receipt_value jsonb;a hato_milk_week.audit;wa hato_milk_week.audit;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner OR p_request_key IS NULL THEN RAISE EXCEPTION 'Original milk weighing owner/key required' USING ERRCODE='42501';END IF;
 PERFORM hato_milk_week.assert_baseline();actor=hato_milk_week.actor();
 IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve','acknowledge') OR (p_action<>'prepare' AND p_intent IS NOT NULL) THEN RAISE EXCEPTION 'Invalid original milk weighing action';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-milk-week-owner:'||p_expected_owner::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-milk-week-key:'||p_request_key::text,0));
 SELECT * INTO r FROM hato_milk_week.requests WHERE request_key=p_request_key FOR UPDATE;
 IF FOUND AND r.owner_id IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original milk weighing owner changed' USING ERRCODE='42501';END IF;
 IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_milk_week.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original milk weighing audit missing';END IF;
 IF p_action='status' THEN IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='unknown';r.acknowledged=false;END IF;RETURN hato_milk_week.result(r);END IF;
 PERFORM hato_birth_undo.lock_domain();PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
 before_domain=hato_birth_undo.capture_domain();expected_domain=before_domain;before_controls=hato_milk_week.controls();expected_controls=before_controls;
 herd=CASE WHEN p_action='prepare' THEN hato_milk_week.snapshot(p_intent->>'start',p_intent->>'end') WHEN r.intent IS NOT NULL THEN hato_milk_week.snapshot(r.intent->>'start',r.intent->>'end') ELSE NULL END;
 IF p_action='prepare' THEN
  PERFORM hato_milk_week.validate(p_intent);
  IF r.request_key IS NOT NULL THEN IF r.intent IS NOT NULL AND r.intent IS DISTINCT FROM p_intent THEN RAISE EXCEPTION 'Original milk weighing intent changed';END IF;RETURN hato_milk_week.result(r);END IF;
  IF EXISTS(SELECT 1 FROM hato_milk_week.requests WHERE owner_id=p_expected_owner AND state IN('pending','committed') AND NOT acknowledged) THEN RAISE EXCEPTION 'Recover original milk weighing before replacement';END IF;
  IF herd->'rows' IS DISTINCT FROM p_intent->'observed' THEN RAISE EXCEPTION 'Displayed full milk week changed; reload before review';END IF;
  FOR cell IN SELECT value FROM jsonb_array_elements(p_intent->'changes') LOOP
   SELECT value INTO old FROM jsonb_array_elements(herd->'rows') WHERE value->>'id'=cell->>'id';
   IF old IS NULL THEN RAISE EXCEPTION 'Selected original milk row missing or outside week';END IF;
   IF (cell->>'remove')::boolean THEN created='null'::jsonb;
   ELSE
    IF cell->'am'='null'::jsonb AND cell->'pm'='null'::jsonb AND (old->'litros_am'<>'null'::jsonb OR old->'litros_pm'<>'null'::jsonb) THEN RAISE EXCEPTION 'Cleared shifts require explicit row deletion';END IF;
    created=old||jsonb_build_object('litros_am',cell->'am','litros_pm',cell->'pm','litros_total',cell->'total');
    IF created=old THEN RAISE EXCEPTION 'Unchanged row is not a milk correction';END IF;
   END IF;
   accepted=accepted||jsonb_build_array(jsonb_build_object('before',old,'after',created));
  END LOOP;
  r.request_key=p_request_key;r.owner_id=p_expected_owner;r.intent=p_intent;r.original=herd;r.plan=jsonb_build_object('changes',accepted);r.effective_date=(now() AT TIME ZONE 'America/Bogota')::date;r.state='pending';r.acknowledged=false;expected=r;
  INSERT INTO hato_milk_week.requests SELECT expected.* RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'milk weighing reservation suppressed/mutated';END IF;
 ELSIF p_action='resolve' THEN
  IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='canceled';r.acknowledged=false;expected=r;INSERT INTO hato_milk_week.requests SELECT expected.* RETURNING * INTO r;
  ELSIF r.state='pending' THEN expected=r;expected.state='canceled';UPDATE hato_milk_week.requests SET state='canceled' WHERE request_key=p_request_key RETURNING * INTO r;
  ELSE RETURN hato_milk_week.result(r);END IF;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'milk weighing cancellation suppressed/mutated';END IF;
 ELSIF p_action='acknowledge' THEN
  IF r.state IS NULL OR r.state NOT IN('committed','canceled') THEN RAISE EXCEPTION 'Verify terminal original milk weighing first';END IF;
  IF r.acknowledged THEN RETURN hato_milk_week.result(r);END IF;
  expected=r;expected.acknowledged=true;UPDATE hato_milk_week.requests SET acknowledged=true WHERE request_key=p_request_key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'milk weighing acknowledgment suppressed/mutated';END IF;
 ELSIF p_action='post' THEN
  IF r.state IS NULL THEN RAISE EXCEPTION 'Original prepared milk weighing required';END IF;
  IF r.state='committed' THEN RETURN hato_milk_week.result(r);ELSIF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled milk weighing cannot post';END IF;
  IF r.effective_date IS DISTINCT FROM (now() AT TIME ZONE 'America/Bogota')::date OR herd IS DISTINCT FROM r.original THEN RAISE EXCEPTION 'Original milk weighing source/day changed; resolve original';END IF;
  FOR cell IN SELECT value FROM jsonb_array_elements(r.plan->'changes') LOOP
   old=cell->'before';created=cell->'after';
   IF created='null'::jsonb THEN
    DELETE FROM public.hato_pesajes_leche WHERE id=(old->>'id')::uuid RETURNING to_jsonb(hato_pesajes_leche.*) INTO written;
    IF NOT FOUND OR written IS DISTINCT FROM old THEN RAISE EXCEPTION 'Milk week deletion suppressed/mutated';END IF;
   ELSE
    row_value=jsonb_populate_record(NULL::public.hato_pesajes_leche,created);
    UPDATE public.hato_pesajes_leche SET litros_am=row_value.litros_am,litros_pm=row_value.litros_pm,litros_total=row_value.litros_total WHERE id=row_value.id RETURNING to_jsonb(hato_pesajes_leche.*) INTO written;
    IF NOT FOUND OR written IS DISTINCT FROM created THEN RAISE EXCEPTION 'Milk week correction suppressed/mutated';END IF;
    after_rows=after_rows||jsonb_build_array(created);
   END IF;
   before_rows=before_rows||jsonb_build_array(old);changes=changes||jsonb_build_array(hato_chequeo_integrity.mutation('hato_pesajes_leche',CASE WHEN created='null'::jsonb THEN 'delete' ELSE 'update' END,old,created));
  END LOOP;
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') INTO traces FROM public.hato_correcciones t WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(before_domain->'public.hato_correcciones')x WHERE x->>'id'=t.id::text);
  IF jsonb_array_length(traces)<>jsonb_array_length(changes) THEN RAISE EXCEPTION 'Exact milk correction trace count required';END IF;
  FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
   IF(SELECT count(*) FROM jsonb_array_elements(traces)t WHERE t->>'tabla'='hato_pesajes_leche' AND t->>'operacion'=change->>'operation' AND t->'datos_anteriores'=change->'before' AND t->'datos_nuevos'=change->'after' AND t->>'fila_id'=change->'before'->>'id' AND t->>'animal_id'=change->'before'->>'animal_id' AND t->>'corregido_por'=p_expected_owner::text AND(t->>'corregido_en')::timestamptz=now() AND t->>'motivo' IS NULL)<>1 THEN RAISE EXCEPTION 'Exact trusted milk correction trace required';END IF;
  END LOOP;
  expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_pesajes_leche',before_rows,after_rows);expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_correcciones','[]',traces);
  receipt_value=jsonb_build_object('version',1,'requestKey',p_request_key,'owner',p_expected_owner,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'actor',actor,'recordedAt',now(),'before',before_rows,'after',after_rows,'corrections',traces,'footprints',jsonb_build_object('before',encode(sha256(convert_to(before_domain::text,'UTF8')),'hex'),'after',encode(sha256(convert_to(expected_domain::text,'UTF8')),'hex')));
  a.request_key=p_request_key;a.receipt=receipt_value;INSERT INTO hato_milk_week.audit SELECT a.* RETURNING * INTO wa;
  IF NOT FOUND OR to_jsonb(wa) IS DISTINCT FROM to_jsonb(a) THEN RAISE EXCEPTION 'milk weighing trusted audit suppressed/mutated';END IF;
  expected=r;expected.state='committed';expected.receipt=receipt_value;UPDATE hato_milk_week.requests SET state='committed',receipt=receipt_value WHERE request_key=p_request_key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'milk weighing committed control suppressed/mutated';END IF;
  expected_controls=jsonb_set(expected_controls,'{audit}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((expected_controls->'audit')||jsonb_build_array(to_jsonb(a)))x));
 END IF;
 expected_controls=jsonb_set(expected_controls,'{requests}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(before_controls->'requests')x WHERE x->>'request_key'<>p_request_key::text)||jsonb_build_array(to_jsonb(expected)))x));
 PERFORM hato_milk_week.assert_baseline();
 IF hato_milk_week.controls() IS DISTINCT FROM expected_controls OR hato_birth_undo.capture_domain() IS DISTINCT FROM expected_domain OR hato_milk_week.actor() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'milk weighing final authority/domain/control readback mismatch';END IF;
 RETURN hato_milk_week.result(r);
END $$;
CREATE FUNCTION public.fn_hato_milk_week_recover_web(p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r hato_milk_week.requests;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Current milk weighing owner required' USING ERRCODE='42501';END IF;
 PERFORM hato_milk_week.actor();PERFORM pg_advisory_xact_lock(hashtextextended('hato-milk-week-owner:'||p_expected_owner::text,0));
 SELECT * INTO r FROM hato_milk_week.requests WHERE owner_id=p_expected_owner AND state IN('pending','committed') AND NOT acknowledged;
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN public.fn_hato_milk_week_web('status',r.request_key,NULL,p_expected_owner);
END $$;

CREATE FUNCTION public.fn_hato_milk_week_source_web(p_expected_owner uuid,p_start text,p_end text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Current week reader owner required' USING ERRCODE='42501';END IF;
 PERFORM hato_treatment_creation.web_actor();PERFORM hato_birth_undo.lock_domain();PERFORM hato_milk_week.assert_baseline();
 RETURN hato_milk_week.snapshot(p_start,p_end);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_milk_week FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_milk_week_web(text,uuid,jsonb,uuid),public.fn_hato_milk_week_recover_web(uuid),public.fn_hato_milk_week_source_web(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_milk_week_web(text,uuid,jsonb,uuid),public.fn_hato_milk_week_recover_web(uuid),public.fn_hato_milk_week_source_web(uuid,text,text) TO authenticated;
SELECT hato_milk_week.assert_baseline();
COMMIT;
