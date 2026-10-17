-- NONNUMBERED standalone browser animal registration foundation after35candidates. Offline only.
BEGIN;
SELECT alert_cron.lock_source();
DO $admission$ DECLARE fingerprint text;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed animal registration installation owner required';END IF;
 SELECT baseline INTO fingerprint FROM (SELECT md5(jsonb_agg(jsonb_build_object(
 'view',CASE WHEN c.relkind='v' THEN pg_get_viewdef(c.oid) ELSE NULL END,'table',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))x),
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'collation',CASE WHEN a.attcollation=0 THEN NULL ELSE (SELECT n.nspname||'.'||co.collname FROM pg_collation co JOIN pg_namespace n ON n.oid=co.collnamespace WHERE co.oid=a.attcollation) END,'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) FROM aclexplode(a.attacl)x)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(x.conname,pg_get_constraintdef(x.oid),x.convalidated,x.condeferrable,x.condeferred) ORDER BY x.conname) FROM pg_constraint x WHERE x.conrelid=c.oid),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready,i.indislive,i.indimmediate,i.indnullsnotdistinct) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(pg_get_triggerdef(t.oid),t.tgenabled,t.tgtype,t.tgdeferrable,t.tginitdeferred,md5(f.prosrc),pg_get_userbyid(f.proowner),f.prosecdef,f.proconfig) ORDER BY t.tgname) FROM pg_trigger t JOIN pg_proc f ON f.oid=t.tgfoid WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
 'inherits',(SELECT count(*) FROM pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid),
 'rules',(SELECT count(*) FROM pg_rewrite WHERE ev_class=c.oid)
) ORDER BY c.relname)::text) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN('hato_animales','hato_eventos','hato_alertas','usuarios','telegram_usuarios','hato_config','hato_alertas_config','telegram_alertas_suscripciones','hato_tratamientos','hato_tratamiento_pasos','v_hato_estado_actual','hato_chequeos','hato_chequeo_vacas','hato_toros')) AS e(baseline);
 IF fingerprint IS DISTINCT FROM '5ae11977b7a8e2f574bd41bb07f76ddc' THEN RAISE EXCEPTION 'Unreviewed animal registration source graph';END IF;
 PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_death.snapshot(uuid)') AND md5(p.prosrc)='a6bf1457f7ab6b1adf5cae9c9c78d308' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') OR EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role'))v(role) WHERE has_function_privilege(v.role,'hato_death.snapshot(uuid)','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed animal registration snapshot helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_treatment_creation.web_actor()') AND md5(p.prosrc)='1d8ec54936d4f658da49a965b828224c' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed animal registration actor helper';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_birth_undo.assert_registry()') AND md5(prosrc)='8cce85aa9cbd1281cc12e2f264e9ba42' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,'hato_birth_undo.assert_registry()','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed registration assert_registry helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_birth_undo.lock_domain()') AND md5(prosrc)='836f4e31322431b1f333f3a2191c942c' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,'hato_birth_undo.lock_domain()','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed registration lock_domain helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_birth_undo.capture_domain()') AND md5(prosrc)='54112d98b97f312ef67124a8d537868a' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,'hato_birth_undo.capture_domain()','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed registration capture_domain helper';END IF;
 PERFORM hato_birth_undo.assert_registry();
END $admission$;
CREATE SCHEMA hato_animal_registration;
REVOKE ALL ON SCHEMA hato_animal_registration FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_animal_registration.requests(request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,intent jsonb,original jsonb,plan jsonb,effective_date date,state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,acknowledged boolean NOT NULL DEFAULT false,
 CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR intent IS NOT NULL AND original IS NOT NULL AND plan IS NOT NULL AND effective_date IS NOT NULL),CHECK(NOT acknowledged OR state IN('committed','canceled')));
CREATE UNIQUE INDEX one_original_registration ON hato_animal_registration.requests(owner_id) WHERE state IN('pending','committed') AND NOT acknowledged;
CREATE TABLE hato_animal_registration.audit(request_key uuid PRIMARY KEY REFERENCES hato_animal_registration.requests(request_key),receipt jsonb NOT NULL);
ALTER TABLE hato_animal_registration.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_animal_registration.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_animal_registration FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_animal_registration.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' THEN RAISE EXCEPTION 'Immutable registration proof';END IF;
 IF ((to_jsonb(NEW)-'acknowledged')=(to_jsonb(OLD)-'acknowledged') AND NOT OLD.acknowledged AND NEW.acknowledged AND OLD.state IN('committed','canceled')) OR (OLD.state='pending' AND NEW.state IN('committed','canceled') AND (to_jsonb(NEW)-'state'-'receipt')=(to_jsonb(OLD)-'state'-'receipt')) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Immutable original registration';
END $$;
CREATE TRIGGER immutable_registration_request BEFORE UPDATE OR DELETE ON hato_animal_registration.requests FOR EACH ROW EXECUTE FUNCTION hato_animal_registration.immutable();
CREATE TRIGGER immutable_registration_audit BEFORE UPDATE OR DELETE ON hato_animal_registration.audit FOR EACH ROW EXECUTE FUNCTION hato_animal_registration.immutable();
CREATE TRIGGER no_truncate_registration_request BEFORE TRUNCATE ON hato_animal_registration.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_animal_registration.immutable();
CREATE TRIGGER no_truncate_registration_audit BEFORE TRUNCATE ON hato_animal_registration.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_animal_registration.immutable();
CREATE FUNCTION hato_animal_registration.controls() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_animal_registration.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_animal_registration.audit x));
$$;
CREATE FUNCTION hato_animal_registration.result(r hato_animal_registration.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'owner',r.owner_id,'state',r.state,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'receipt',r.receipt,'acknowledged',coalesce(r.acknowledged,false));
$$;
CREATE FUNCTION hato_animal_registration.validate(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v jsonb;k text;d date;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(p)x) IS DISTINCT FROM ARRAY['input','version'] OR p->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p->'input') IS DISTINCT FROM 'object' OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(p->'input')x) IS DISTINCT FROM ARRAY['etapa','fecha_nacimiento','nombre','numero','origen','raza'] THEN RAISE EXCEPTION 'Exact bounded registration intent required';END IF;
 v=p->'input';
 IF jsonb_typeof(v->'numero') NOT IN('number','null') OR (v->>'numero' IS NOT NULL AND ((v->>'numero')::numeric<>trunc((v->>'numero')::numeric) OR abs((v->>'numero')::numeric)>2147483647 OR (v->>'numero')::numeric BETWEEN 800 AND 999)) OR v->>'etapa' NOT IN('ternera','novilla','vaca','toro') OR jsonb_typeof(v->'etapa') IS DISTINCT FROM 'string' OR v->>'origen' NOT IN('compra','nacimiento') OR jsonb_typeof(v->'origen') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid registration values';END IF;
 FOREACH k IN ARRAY ARRAY['nombre','raza'] LOOP IF jsonb_typeof(v->k) NOT IN('null','string') OR (v->>k IS NOT NULL AND (length(v->>k)>4000 OR btrim(v->>k)='' OR btrim(v->>k) IS DISTINCT FROM v->>k)) THEN RAISE EXCEPTION 'Invalid registration text';END IF;END LOOP;
 IF jsonb_typeof(v->'fecha_nacimiento') NOT IN('null','string') THEN RAISE EXCEPTION 'Canonical registration birth date required';END IF;
 IF v->>'fecha_nacimiento' IS NOT NULL THEN d=(v->>'fecha_nacimiento')::date;IF NOT isfinite(d) OR to_char(d,'YYYY-MM-DD') IS DISTINCT FROM v->>'fecha_nacimiento' THEN RAISE EXCEPTION 'Canonical registration birth date required';END IF;END IF;
END $$;
CREATE FUNCTION public.fn_hato_animal_registration_web(p_action text,p_request_key uuid,p_intent jsonb,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_animal_registration.requests;expected hato_animal_registration.requests;before_domain jsonb;expected_domain jsonb;before_controls jsonb;expected_controls jsonb;herd jsonb;animal public.hato_animales;written public.hato_animales;receipt_value jsonb;a hato_animal_registration.audit;wa hato_animal_registration.audit;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner OR p_request_key IS NULL THEN RAISE EXCEPTION 'Original registration owner/key required' USING ERRCODE='42501';END IF;
 actor=hato_treatment_creation.web_actor();
 IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve','acknowledge') OR (p_action<>'prepare' AND p_intent IS NOT NULL) THEN RAISE EXCEPTION 'Invalid original registration action';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-registration-owner:'||p_expected_owner::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-registration-key:'||p_request_key::text,0));
 SELECT * INTO r FROM hato_animal_registration.requests WHERE request_key=p_request_key FOR UPDATE;
 IF FOUND AND r.owner_id IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original registration owner changed' USING ERRCODE='42501';END IF;
 IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_animal_registration.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original registration audit missing';END IF;
 IF p_action='status' THEN IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='unknown';r.acknowledged=false;END IF;RETURN hato_animal_registration.result(r);END IF;
 PERFORM hato_birth_undo.lock_domain();PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
 before_domain=hato_birth_undo.capture_domain();expected_domain=before_domain;before_controls=hato_animal_registration.controls();expected_controls=before_controls;
 herd=(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_animales x);
 IF p_action='prepare' THEN
  PERFORM hato_animal_registration.validate(p_intent);
  IF r.request_key IS NOT NULL THEN IF r.intent IS NOT NULL AND r.intent IS DISTINCT FROM p_intent THEN RAISE EXCEPTION 'Original registration intent changed';END IF;RETURN hato_animal_registration.result(r);END IF;
  IF EXISTS(SELECT 1 FROM hato_animal_registration.requests WHERE owner_id=p_expected_owner AND state IN('pending','committed') AND NOT acknowledged) THEN RAISE EXCEPTION 'Recover original registration before replacement';END IF;
  IF p_intent->'input'->>'numero' IS NOT NULL AND EXISTS(SELECT 1 FROM public.hato_animales WHERE estado='activa' AND numero=(p_intent->'input'->>'numero')::integer) THEN RAISE EXCEPTION 'Active animal tag collision' USING ERRCODE='23505';END IF;
  animal=jsonb_populate_record(NULL::public.hato_animales,(p_intent->'input')||jsonb_build_object('id',gen_random_uuid(),'sexo','hembra','estado','activa','fecha_nacimiento_confianza','desconocida','confianza','alta','created_by',p_expected_owner,'etapa_forzada',false));
  r.request_key=p_request_key;r.owner_id=p_expected_owner;r.intent=p_intent;r.original=jsonb_build_object('animals',herd);r.plan=to_jsonb(animal);r.effective_date=(now() AT TIME ZONE 'America/Bogota')::date;r.state='pending';r.acknowledged=false;expected=r;
  INSERT INTO hato_animal_registration.requests SELECT expected.* RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Registration reservation suppressed/mutated';END IF;
 ELSIF p_action='resolve' THEN
  IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='canceled';r.acknowledged=false;expected=r;INSERT INTO hato_animal_registration.requests SELECT expected.* RETURNING * INTO r;
  ELSIF r.state='pending' THEN expected=r;expected.state='canceled';UPDATE hato_animal_registration.requests SET state='canceled' WHERE request_key=p_request_key RETURNING * INTO r;
  ELSE RETURN hato_animal_registration.result(r);END IF;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Registration cancellation suppressed/mutated';END IF;
 ELSIF p_action='acknowledge' THEN
  IF r.state IS NULL OR r.state NOT IN('committed','canceled') THEN RAISE EXCEPTION 'Verify terminal original registration first';END IF;
  IF r.acknowledged THEN RETURN hato_animal_registration.result(r);END IF;
  expected=r;expected.acknowledged=true;UPDATE hato_animal_registration.requests SET acknowledged=true WHERE request_key=p_request_key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Registration acknowledgment suppressed/mutated';END IF;
 ELSIF p_action='post' THEN
  IF r.state IS NULL THEN RAISE EXCEPTION 'Original prepared registration required';END IF;
  IF r.state='committed' THEN RETURN hato_animal_registration.result(r);ELSIF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled registration cannot post';END IF;
  IF r.effective_date IS DISTINCT FROM (now() AT TIME ZONE 'America/Bogota')::date OR jsonb_build_object('animals',herd) IS DISTINCT FROM r.original THEN RAISE EXCEPTION 'Original registration source/day changed; resolve original';END IF;
  animal=jsonb_populate_record(NULL::public.hato_animales,r.plan||jsonb_build_object('created_at',now()));
  INSERT INTO public.hato_animales SELECT animal.* RETURNING * INTO written;
  IF NOT FOUND OR to_jsonb(written) IS DISTINCT FROM to_jsonb(animal) THEN RAISE EXCEPTION 'Registration animal suppressed/mutated';END IF;
  expected_domain=jsonb_set(expected_domain,ARRAY['public.hato_animales'],(SELECT jsonb_agg(x ORDER BY x::text) FROM jsonb_array_elements((before_domain->'public.hato_animales')||jsonb_build_array(to_jsonb(animal)))x));
  receipt_value=jsonb_build_object('version',1,'requestKey',p_request_key,'owner',p_expected_owner,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'actor',actor,'recordedAt',now(),'before',NULL,'after',to_jsonb(animal),'footprints',jsonb_build_object('before',encode(sha256(convert_to(before_domain::text,'UTF8')),'hex'),'after',encode(sha256(convert_to(expected_domain::text,'UTF8')),'hex')));
  a.request_key=p_request_key;a.receipt=receipt_value;INSERT INTO hato_animal_registration.audit SELECT a.* RETURNING * INTO wa;
  IF NOT FOUND OR to_jsonb(wa) IS DISTINCT FROM to_jsonb(a) THEN RAISE EXCEPTION 'Registration trusted audit suppressed/mutated';END IF;
  expected=r;expected.state='committed';expected.receipt=receipt_value;UPDATE hato_animal_registration.requests SET state='committed',receipt=receipt_value WHERE request_key=p_request_key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Registration committed control suppressed/mutated';END IF;
  expected_controls=jsonb_set(expected_controls,'{audit}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((expected_controls->'audit')||jsonb_build_array(to_jsonb(a)))x));
 END IF;
 expected_controls=jsonb_set(expected_controls,'{requests}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(before_controls->'requests')x WHERE x->>'request_key'<>p_request_key::text)||jsonb_build_array(to_jsonb(expected)))x));
 IF hato_animal_registration.controls() IS DISTINCT FROM expected_controls OR hato_birth_undo.capture_domain() IS DISTINCT FROM expected_domain OR hato_treatment_creation.web_actor() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Registration final authority/domain/control readback mismatch';END IF;
 RETURN hato_animal_registration.result(r);
END $$;
CREATE FUNCTION public.fn_hato_animal_registration_recover_web(p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r hato_animal_registration.requests;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Current registration owner required' USING ERRCODE='42501';END IF;
 PERFORM hato_treatment_creation.web_actor();PERFORM pg_advisory_xact_lock(hashtextextended('hato-registration-owner:'||p_expected_owner::text,0));
 SELECT * INTO r FROM hato_animal_registration.requests WHERE owner_id=p_expected_owner AND state IN('pending','committed') AND NOT acknowledged;
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN public.fn_hato_animal_registration_web('status',r.request_key,NULL,p_expected_owner);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_animal_registration FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_animal_registration_web(text,uuid,jsonb,uuid),public.fn_hato_animal_registration_recover_web(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_animal_registration_web(text,uuid,jsonb,uuid),public.fn_hato_animal_registration_recover_web(uuid) TO authenticated;
COMMIT;
