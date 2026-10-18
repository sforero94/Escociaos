-- NONNUMBERED protected milk weighing foundation after42candidates. OFFLINE ONLY.
BEGIN;
SELECT hato_birth_undo.lock_domain();
DO $$ BEGIN IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed milk installation owner required';END IF;PERFORM correction_audit_integrity.assert_boundary();PERFORM hato_catalog_creation.assert_retired_writers();PERFORM hato_chequeo_integrity.assert_retired();END $$;
CREATE SCHEMA hato_milk_weighing;
REVOKE ALL ON SCHEMA hato_milk_weighing FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_milk_weighing.requests(request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,intent jsonb,original jsonb,plan jsonb,effective_date date,state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,acknowledged boolean NOT NULL DEFAULT false,
 CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR intent IS NOT NULL AND original IS NOT NULL AND plan IS NOT NULL AND effective_date IS NOT NULL),CHECK(NOT acknowledged OR state IN('committed','canceled')));
CREATE UNIQUE INDEX one_original_registration ON hato_milk_weighing.requests(owner_id) WHERE state IN('pending','committed') AND NOT acknowledged;
CREATE TABLE hato_milk_weighing.audit(request_key uuid PRIMARY KEY REFERENCES hato_milk_weighing.requests(request_key),receipt jsonb NOT NULL);
ALTER TABLE hato_milk_weighing.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_milk_weighing.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_milk_weighing FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_milk_weighing.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' THEN RAISE EXCEPTION 'Immutable milk weighing proof';END IF;
 IF ((to_jsonb(NEW)-'acknowledged')=(to_jsonb(OLD)-'acknowledged') AND NOT OLD.acknowledged AND NEW.acknowledged AND OLD.state IN('committed','canceled')) OR (OLD.state='pending' AND NEW.state IN('committed','canceled') AND (to_jsonb(NEW)-'state'-'receipt')=(to_jsonb(OLD)-'state'-'receipt')) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Immutable original milk weighing';
END $$;
CREATE TRIGGER immutable_registration_request BEFORE UPDATE OR DELETE ON hato_milk_weighing.requests FOR EACH ROW EXECUTE FUNCTION hato_milk_weighing.immutable();
CREATE TRIGGER immutable_registration_audit BEFORE UPDATE OR DELETE ON hato_milk_weighing.audit FOR EACH ROW EXECUTE FUNCTION hato_milk_weighing.immutable();
CREATE TRIGGER no_truncate_registration_request BEFORE TRUNCATE ON hato_milk_weighing.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_milk_weighing.immutable();
CREATE TRIGGER no_truncate_registration_audit BEFORE TRUNCATE ON hato_milk_weighing.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_milk_weighing.immutable();
CREATE FUNCTION hato_milk_weighing.controls() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_milk_weighing.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_milk_weighing.audit x));
$$;
CREATE FUNCTION hato_milk_weighing.result(r hato_milk_weighing.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'owner',r.owner_id,'state',r.state,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'receipt',r.receipt,'acknowledged',coalesce(r.acknowledged,false));
$$;
CREATE FUNCTION hato_milk_weighing.assert_baseline() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM correction_audit_integrity.assert_boundary();PERFORM hato_catalog_creation.assert_retired_writers();PERFORM hato_chequeo_integrity.assert_retired();
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.hato_pesajes_leche'::regclass AND relkind='r' AND relowner=(SELECT oid FROM pg_roles WHERE rolname='postgres') AND relrowsecurity AND NOT relforcerowsecurity) OR (SELECT count(*) FROM pg_attribute WHERE attrelid='public.hato_pesajes_leche'::regclass AND attnum>0 AND NOT attisdropped)<>9 OR EXISTS(SELECT 1 FROM(VALUES ('id','uuid',true,'gen_random_uuid()'),('animal_id','uuid',true,''),('fecha','date',true,''),('litros_am','numeric',false,''),('litros_pm','numeric',false,''),('litros_total','numeric',true,''),('fuente','text',false,''),('created_at','timestamp with time zone',false,'now()'),('created_by','uuid',false,''))e(name,type,required,default_value) WHERE NOT EXISTS(SELECT 1 FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.hato_pesajes_leche'::regclass AND a.attname=e.name AND format_type(a.atttypid,a.atttypmod)=e.type AND a.attnotnull=e.required AND a.attgenerated='' AND a.attidentity='' AND coalesce(pg_get_expr(d.adbin,d.adrelid),'')=e.default_value)) THEN RAISE EXCEPTION 'Unreviewed milk weighing columns/authority';END IF;
 IF (SELECT count(*) FROM pg_constraint WHERE conrelid='public.hato_pesajes_leche'::regclass)<>5 OR EXISTS(SELECT 1 FROM(VALUES ('hato_pesajes_leche_animal_id_fecha_key','UNIQUE (animal_id, fecha)'),('hato_pesajes_leche_animal_id_fkey','FOREIGN KEY (animal_id) REFERENCES hato_animales(id)'),('hato_pesajes_leche_created_by_fkey','FOREIGN KEY (created_by) REFERENCES auth.users(id)'),('hato_pesajes_leche_litros_total_no_negativo','CHECK ((litros_total >= (0)::numeric))'),('hato_pesajes_leche_pkey','PRIMARY KEY (id)'))e(name,definition) WHERE NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.hato_pesajes_leche'::regclass AND conname=e.name AND replace(pg_get_constraintdef(oid),'public.','')=e.definition AND convalidated AND NOT condeferrable AND NOT condeferred)) THEN RAISE EXCEPTION 'Unreviewed milk weighing constraints';END IF;
 IF (SELECT count(*) FROM pg_index WHERE indrelid='public.hato_pesajes_leche'::regclass)<>3 OR EXISTS(SELECT 1 FROM(VALUES ('hato_pesajes_leche_animal_id_fecha_key','CREATE UNIQUE INDEX hato_pesajes_leche_animal_id_fecha_key ON public.hato_pesajes_leche USING btree (animal_id, fecha)',true,false),('hato_pesajes_leche_pkey','CREATE UNIQUE INDEX hato_pesajes_leche_pkey ON public.hato_pesajes_leche USING btree (id)',true,true),('idx_hato_pesajes_leche_fecha','CREATE INDEX idx_hato_pesajes_leche_fecha ON public.hato_pesajes_leche USING btree (fecha)',false,false))e(name,definition,is_unique,is_primary) WHERE NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid='public.hato_pesajes_leche'::regclass AND c.relname=e.name AND pg_get_indexdef(i.indexrelid)=e.definition AND i.indisunique=e.is_unique AND i.indisprimary=e.is_primary AND i.indisvalid AND i.indisready AND i.indislive AND i.indimmediate AND NOT i.indisexclusion AND NOT i.indnullsnotdistinct AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnatts=i.indnkeyatts)) THEN RAISE EXCEPTION 'Unreviewed milk weighing identity indexes';END IF;
END $$;
CREATE FUNCTION hato_milk_weighing.validate(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE cell jsonb;v jsonb;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p)k) IS DISTINCT FROM ARRAY['cells','month','version','year'] OR p->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p->'year') IS DISTINCT FROM 'number' OR (p->>'year')::numeric<>trunc((p->>'year')::numeric) OR (p->>'year')::numeric NOT BETWEEN 2020 AND 2100 OR jsonb_typeof(p->'month') IS DISTINCT FROM 'number' OR (p->>'month')::numeric<>trunc((p->>'month')::numeric) OR (p->>'month')::numeric NOT BETWEEN 1 AND 12 OR jsonb_typeof(p->'cells') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Exact milk weighing intent required';END IF;
 IF jsonb_array_length(p->'cells') NOT BETWEEN 1 AND 2000 OR octet_length(p::text)>2097152 THEN RAISE EXCEPTION 'Bounded milk weighing cells required';END IF;
 FOR cell IN SELECT value FROM jsonb_array_elements(p->'cells') LOOP
  IF jsonb_typeof(cell) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(cell)k) IS DISTINCT FROM ARRAY['am','animalId','date','observed','pm'] OR jsonb_typeof(cell->'animalId') IS DISTINCT FROM 'string' OR (cell->>'animalId')::uuid::text IS DISTINCT FROM cell->>'animalId' OR jsonb_typeof(cell->'date') IS DISTINCT FROM 'string' OR (cell->>'date')::date::text IS DISTINCT FROM cell->>'date' OR extract(year FROM (cell->>'date')::date)<>(p->>'year')::int OR extract(month FROM (cell->>'date')::date)<>(p->>'month')::int OR jsonb_typeof(cell->'observed') NOT IN('null','object') THEN RAISE EXCEPTION 'Exact canonical milk cell/source required';END IF;
  IF cell->'am'='null'::jsonb AND cell->'pm'='null'::jsonb THEN RAISE EXCEPTION 'Blank milk cell is not zero';END IF;
  FOR v IN SELECT cell->'am' UNION ALL SELECT cell->'pm' LOOP IF jsonb_typeof(v) NOT IN('null','number') OR (jsonb_typeof(v)='number' AND v::text::numeric<0) THEN RAISE EXCEPTION 'Nonnegative finite milk reading required';END IF;END LOOP;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'cells')x GROUP BY x->>'animalId',x->>'date' HAVING count(*)<>1) THEN RAISE EXCEPTION 'Duplicate milk cell identity';END IF;
END $$;
CREATE FUNCTION public.fn_hato_milk_weighing_web(p_action text,p_request_key uuid,p_intent jsonb,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_milk_weighing.requests;expected hato_milk_weighing.requests;before_domain jsonb;expected_domain jsonb;before_controls jsonb;expected_controls jsonb;herd jsonb;cell jsonb;old jsonb;created jsonb;written jsonb;row_value public.hato_pesajes_leche;accepted jsonb='[]';rejected jsonb='[]';before_rows jsonb='[]';after_rows jsonb='[]';changes jsonb='[]';traces jsonb;change jsonb;iso integer;receipt_value jsonb;a hato_milk_weighing.audit;wa hato_milk_weighing.audit;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner OR p_request_key IS NULL THEN RAISE EXCEPTION 'Original milk weighing owner/key required' USING ERRCODE='42501';END IF;
 PERFORM hato_milk_weighing.assert_baseline();actor=hato_treatment_creation.web_actor();
 IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve','acknowledge') OR (p_action<>'prepare' AND p_intent IS NOT NULL) THEN RAISE EXCEPTION 'Invalid original milk weighing action';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-milk weighing-owner:'||p_expected_owner::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-milk weighing-key:'||p_request_key::text,0));
 SELECT * INTO r FROM hato_milk_weighing.requests WHERE request_key=p_request_key FOR UPDATE;
 IF FOUND AND r.owner_id IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original milk weighing owner changed' USING ERRCODE='42501';END IF;
 IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_milk_weighing.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original milk weighing audit missing';END IF;
 IF p_action='status' THEN IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='unknown';r.acknowledged=false;END IF;RETURN hato_milk_weighing.result(r);END IF;
 PERFORM hato_birth_undo.lock_domain();PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
 before_domain=hato_birth_undo.capture_domain();expected_domain=before_domain;before_controls=hato_milk_weighing.controls();expected_controls=before_controls;
 herd=jsonb_build_object('rows',before_domain->'public.hato_pesajes_leche','animals',before_domain->'public.hato_animales','config',before_domain->'public.hato_config');
 IF p_action='prepare' THEN
  PERFORM hato_milk_weighing.validate(p_intent);
  IF r.request_key IS NOT NULL THEN IF r.intent IS NOT NULL AND r.intent IS DISTINCT FROM p_intent THEN RAISE EXCEPTION 'Original milk weighing intent changed';END IF;RETURN hato_milk_weighing.result(r);END IF;
  IF EXISTS(SELECT 1 FROM hato_milk_weighing.requests WHERE owner_id=p_expected_owner AND state IN('pending','committed') AND NOT acknowledged) THEN RAISE EXCEPTION 'Recover original milk weighing before replacement';END IF;
  SELECT (valor->>'iso')::integer INTO iso FROM public.hato_config WHERE clave='dia_pesaje_semanal' AND jsonb_typeof(valor)='object' AND jsonb_typeof(valor->'iso')='number';
  IF iso IS NULL OR iso NOT BETWEEN 1 AND 7 THEN RAISE EXCEPTION 'Current milk weighing day config required';END IF;
  FOR cell IN SELECT value FROM jsonb_array_elements(p_intent->'cells') LOOP
   SELECT to_jsonb(x) INTO old FROM public.hato_pesajes_leche x WHERE animal_id=(cell->>'animalId')::uuid AND fecha=(cell->>'date')::date;
   IF coalesce(old,'null'::jsonb) IS DISTINCT FROM cell->'observed' THEN RAISE EXCEPTION 'Observed milk cell changed before review';END IF;
   IF extract(isodow FROM (cell->>'date')::date)<>iso OR NOT EXISTS(SELECT 1 FROM public.hato_animales WHERE id=(cell->>'animalId')::uuid AND estado='activa' AND etapa IN('vaca','novilla')) THEN
    rejected=rejected||jsonb_build_array(jsonb_build_object('cell',cell,'reason','current_roster_or_weekday'));CONTINUE;
   END IF;
   IF old IS NULL THEN row_value=jsonb_populate_record(NULL::public.hato_pesajes_leche,jsonb_build_object('id',gen_random_uuid(),'animal_id',cell->'animalId','fecha',cell->'date','created_by',p_expected_owner));created=to_jsonb(row_value);ELSE created=old;END IF;
   created=created||jsonb_build_object('litros_am',cell->'am','litros_pm',cell->'pm','litros_total',coalesce((cell->>'am')::numeric,0)+coalesce((cell->>'pm')::numeric,0),'fuente','web');
   accepted=accepted||jsonb_build_array(jsonb_build_object('cell',cell,'before',old,'after',created));
  END LOOP;
  IF jsonb_array_length(accepted)=0 THEN RAISE EXCEPTION 'No accepted milk cells; review current roster/config';END IF;
  r.request_key=p_request_key;r.owner_id=p_expected_owner;r.intent=p_intent;r.original=herd;r.plan=jsonb_build_object('accepted',accepted,'rejected',rejected,'weekday',iso);r.effective_date=(now() AT TIME ZONE 'America/Bogota')::date;r.state='pending';r.acknowledged=false;expected=r;
  INSERT INTO hato_milk_weighing.requests SELECT expected.* RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'milk weighing reservation suppressed/mutated';END IF;
 ELSIF p_action='resolve' THEN
  IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='canceled';r.acknowledged=false;expected=r;INSERT INTO hato_milk_weighing.requests SELECT expected.* RETURNING * INTO r;
  ELSIF r.state='pending' THEN expected=r;expected.state='canceled';UPDATE hato_milk_weighing.requests SET state='canceled' WHERE request_key=p_request_key RETURNING * INTO r;
  ELSE RETURN hato_milk_weighing.result(r);END IF;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'milk weighing cancellation suppressed/mutated';END IF;
 ELSIF p_action='acknowledge' THEN
  IF r.state IS NULL OR r.state NOT IN('committed','canceled') THEN RAISE EXCEPTION 'Verify terminal original milk weighing first';END IF;
  IF r.acknowledged THEN RETURN hato_milk_weighing.result(r);END IF;
  expected=r;expected.acknowledged=true;UPDATE hato_milk_weighing.requests SET acknowledged=true WHERE request_key=p_request_key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'milk weighing acknowledgment suppressed/mutated';END IF;
 ELSIF p_action='post' THEN
  IF r.state IS NULL THEN RAISE EXCEPTION 'Original prepared milk weighing required';END IF;
  IF r.state='committed' THEN RETURN hato_milk_weighing.result(r);ELSIF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled milk weighing cannot post';END IF;
  IF r.effective_date IS DISTINCT FROM (now() AT TIME ZONE 'America/Bogota')::date OR herd IS DISTINCT FROM r.original THEN RAISE EXCEPTION 'Original milk weighing source/day changed; resolve original';END IF;
  FOR cell IN SELECT value FROM jsonb_array_elements(r.plan->'accepted') LOOP
   old=cell->'before';created=cell->'after';
   IF old='null'::jsonb THEN created=created||jsonb_build_object('created_at',now());END IF;
   row_value=jsonb_populate_record(NULL::public.hato_pesajes_leche,created);
   IF old='null'::jsonb THEN INSERT INTO public.hato_pesajes_leche SELECT row_value.* RETURNING to_jsonb(hato_pesajes_leche.*) INTO written;
   ELSE UPDATE public.hato_pesajes_leche SET litros_am=row_value.litros_am,litros_pm=row_value.litros_pm,litros_total=row_value.litros_total,fuente=row_value.fuente WHERE id=row_value.id RETURNING to_jsonb(hato_pesajes_leche.*) INTO written;END IF;
   IF NOT FOUND OR written IS DISTINCT FROM created THEN RAISE EXCEPTION 'Milk weighing cell suppressed/mutated';END IF;
   IF old<>'null'::jsonb THEN before_rows=before_rows||jsonb_build_array(old);IF old IS DISTINCT FROM created THEN changes=changes||jsonb_build_array(hato_chequeo_integrity.mutation('hato_pesajes_leche','update',old,created));END IF;END IF;
   after_rows=after_rows||jsonb_build_array(created);
  END LOOP;
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') INTO traces FROM public.hato_correcciones t WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(before_domain->'public.hato_correcciones')x WHERE x->>'id'=t.id::text);
  IF jsonb_array_length(traces)<>jsonb_array_length(changes) THEN RAISE EXCEPTION 'Exact milk correction trace count required';END IF;
  FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
   IF(SELECT count(*) FROM jsonb_array_elements(traces)t WHERE t->>'tabla'='hato_pesajes_leche' AND t->>'operacion'='update' AND t->'datos_anteriores'=change->'before' AND t->'datos_nuevos'=change->'after' AND t->>'fila_id'=change->'before'->>'id' AND t->>'animal_id'=change->'before'->>'animal_id' AND t->>'corregido_por'=p_expected_owner::text AND(t->>'corregido_en')::timestamptz=now() AND t->>'motivo' IS NULL)<>1 THEN RAISE EXCEPTION 'Exact trusted milk correction trace required';END IF;
  END LOOP;
  expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_pesajes_leche',before_rows,after_rows);expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_correcciones','[]',traces);
  receipt_value=jsonb_build_object('version',1,'requestKey',p_request_key,'owner',p_expected_owner,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'actor',actor,'recordedAt',now(),'before',before_rows,'after',after_rows,'corrections',traces,'footprints',jsonb_build_object('before',encode(sha256(convert_to(before_domain::text,'UTF8')),'hex'),'after',encode(sha256(convert_to(expected_domain::text,'UTF8')),'hex')));
  a.request_key=p_request_key;a.receipt=receipt_value;INSERT INTO hato_milk_weighing.audit SELECT a.* RETURNING * INTO wa;
  IF NOT FOUND OR to_jsonb(wa) IS DISTINCT FROM to_jsonb(a) THEN RAISE EXCEPTION 'milk weighing trusted audit suppressed/mutated';END IF;
  expected=r;expected.state='committed';expected.receipt=receipt_value;UPDATE hato_milk_weighing.requests SET state='committed',receipt=receipt_value WHERE request_key=p_request_key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'milk weighing committed control suppressed/mutated';END IF;
  expected_controls=jsonb_set(expected_controls,'{audit}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((expected_controls->'audit')||jsonb_build_array(to_jsonb(a)))x));
 END IF;
 expected_controls=jsonb_set(expected_controls,'{requests}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(before_controls->'requests')x WHERE x->>'request_key'<>p_request_key::text)||jsonb_build_array(to_jsonb(expected)))x));
 PERFORM hato_milk_weighing.assert_baseline();
 IF hato_milk_weighing.controls() IS DISTINCT FROM expected_controls OR hato_birth_undo.capture_domain() IS DISTINCT FROM expected_domain OR hato_treatment_creation.web_actor() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'milk weighing final authority/domain/control readback mismatch';END IF;
 RETURN hato_milk_weighing.result(r);
END $$;
CREATE FUNCTION public.fn_hato_milk_weighing_recover_web(p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r hato_milk_weighing.requests;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Current milk weighing owner required' USING ERRCODE='42501';END IF;
 PERFORM hato_treatment_creation.web_actor();PERFORM pg_advisory_xact_lock(hashtextextended('hato-milk weighing-owner:'||p_expected_owner::text,0));
 SELECT * INTO r FROM hato_milk_weighing.requests WHERE owner_id=p_expected_owner AND state IN('pending','committed') AND NOT acknowledged;
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN public.fn_hato_milk_weighing_web('status',r.request_key,NULL,p_expected_owner);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_milk_weighing FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_milk_weighing_web(text,uuid,jsonb,uuid),public.fn_hato_milk_weighing_recover_web(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_milk_weighing_web(text,uuid,jsonb,uuid),public.fn_hato_milk_weighing_recover_web(uuid) TO authenticated;
SELECT hato_milk_weighing.assert_baseline();
COMMIT;
