-- NONNUMBERED bull catalog editing after38candidates. Offline only; no history rewrite.
BEGIN;
SELECT alert_cron.lock_source();
DO $admission$ DECLARE fingerprint text;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed animal catalog edit installation owner required';END IF;
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
 IF fingerprint IS DISTINCT FROM '7e357e3178db5a801e60189e511c5880' THEN RAISE EXCEPTION 'Unreviewed catalog edit source graph %',fingerprint;END IF;
 PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_death.snapshot(uuid)') AND md5(p.prosrc)='a6bf1457f7ab6b1adf5cae9c9c78d308' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') OR EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role'))v(role) WHERE has_function_privilege(v.role,'hato_death.snapshot(uuid)','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed animal catalog edit snapshot helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_treatment_creation.web_actor()') AND md5(p.prosrc)='1d8ec54936d4f658da49a965b828224c' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed animal catalog edit actor helper';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_birth_undo.assert_registry()') AND md5(prosrc)='8cce85aa9cbd1281cc12e2f264e9ba42' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,'hato_birth_undo.assert_registry()','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed catalog edit assert_registry helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_birth_undo.lock_domain()') AND md5(prosrc)='836f4e31322431b1f333f3a2191c942c' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,'hato_birth_undo.lock_domain()','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed catalog edit lock_domain helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_birth_undo.capture_domain()') AND md5(prosrc)='54112d98b97f312ef67124a8d537868a' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,'hato_birth_undo.capture_domain()','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed catalog edit capture_domain helper';END IF;
 PERFORM hato_birth_undo.assert_registry();
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
WHERE n.nspname='public' AND c.relname IN('hato_pajillas','hato_pajillas_uso','v_hato_pajillas_stock')) AS e(baseline);
 IF fingerprint IS DISTINCT FROM 'e0e432ae1b0ae23408509079dde7921c' THEN RAISE EXCEPTION 'Unreviewed pajilla use inventory graph %',fingerprint;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_pajilla_use.inventory()') AND md5(prosrc)='56e38e19c11fe0f46810e1a578778ce8' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,'hato_pajilla_use.inventory()','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed catalog inventory snapshot helper';END IF;
 PERFORM hato_animal_registration.assert_retired_insert();
END $admission$;
CREATE SCHEMA hato_catalog_edit;
REVOKE ALL ON SCHEMA hato_catalog_edit FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_catalog_edit.requests(request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,intent jsonb,original jsonb,plan jsonb,effective_date date,state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,acknowledged boolean NOT NULL DEFAULT false,
 CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR intent IS NOT NULL AND original IS NOT NULL AND plan IS NOT NULL AND effective_date IS NOT NULL),CHECK(NOT acknowledged OR state IN('committed','canceled')));
CREATE UNIQUE INDEX one_original_registration ON hato_catalog_edit.requests(owner_id) WHERE state IN('pending','committed') AND NOT acknowledged;
CREATE TABLE hato_catalog_edit.audit(request_key uuid PRIMARY KEY REFERENCES hato_catalog_edit.requests(request_key),receipt jsonb NOT NULL);
ALTER TABLE hato_catalog_edit.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_catalog_edit.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_catalog_edit FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_catalog_edit.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' THEN RAISE EXCEPTION 'Immutable catalog edit proof';END IF;
 IF ((to_jsonb(NEW)-'acknowledged')=(to_jsonb(OLD)-'acknowledged') AND NOT OLD.acknowledged AND NEW.acknowledged AND OLD.state IN('committed','canceled')) OR (OLD.state='pending' AND NEW.state IN('committed','canceled') AND (to_jsonb(NEW)-'state'-'receipt')=(to_jsonb(OLD)-'state'-'receipt')) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Immutable original catalog edit';
END $$;
CREATE TRIGGER immutable_registration_request BEFORE UPDATE OR DELETE ON hato_catalog_edit.requests FOR EACH ROW EXECUTE FUNCTION hato_catalog_edit.immutable();
CREATE TRIGGER immutable_registration_audit BEFORE UPDATE OR DELETE ON hato_catalog_edit.audit FOR EACH ROW EXECUTE FUNCTION hato_catalog_edit.immutable();
CREATE TRIGGER no_truncate_registration_request BEFORE TRUNCATE ON hato_catalog_edit.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_catalog_edit.immutable();
CREATE TRIGGER no_truncate_registration_audit BEFORE TRUNCATE ON hato_catalog_edit.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_catalog_edit.immutable();
CREATE FUNCTION hato_catalog_edit.controls() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_catalog_edit.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_catalog_edit.audit x));
$$;
CREATE FUNCTION hato_catalog_edit.result(r hato_catalog_edit.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'owner',r.owner_id,'state',r.state,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'receipt',r.receipt,'acknowledged',coalesce(r.acknowledged,false));
$$;
CREATE FUNCTION hato_catalog_edit.validate(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v jsonb;o jsonb;
BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(p)x) IS DISTINCT FROM ARRAY['bullId','changes','observedBull','version'] OR p->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p->'bullId') IS DISTINCT FROM 'string' OR (p->>'bullId')::uuid::text IS DISTINCT FROM p->>'bullId' THEN RAISE EXCEPTION 'Exact original bull edit intent required';END IF;
 v=p->'changes';o=p->'observedBull';
 IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(v)x) IS DISTINCT FROM ARRAY['activo','nombre','raza','tipo'] OR jsonb_typeof(v->'nombre') IS DISTINCT FROM 'string' OR btrim(v->>'nombre')='' OR btrim(v->>'nombre') IS DISTINCT FROM v->>'nombre' OR length(v->>'nombre')>4000 OR jsonb_typeof(v->'activo') IS DISTINCT FROM 'boolean' OR jsonb_typeof(v->'tipo') NOT IN('null','string') OR (v->>'tipo' IS NOT NULL AND v->>'tipo' NOT IN('monta','inseminacion')) OR jsonb_typeof(v->'raza') NOT IN('null','string') OR (v->>'raza' IS NOT NULL AND (btrim(v->>'raza')='' OR btrim(v->>'raza') IS DISTINCT FROM v->>'raza' OR length(v->>'raza')>4000)) THEN RAISE EXCEPTION 'Invalid bull edit values';END IF;
 IF jsonb_typeof(o) IS DISTINCT FROM 'object' OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(o)x) IS DISTINCT FROM ARRAY['activo','id','nombre','raza','tipo'] OR o->>'id' IS DISTINCT FROM p->>'bullId' OR jsonb_typeof(o->'nombre') IS DISTINCT FROM 'string' OR jsonb_typeof(o->'activo') IS DISTINCT FROM 'boolean' OR jsonb_typeof(o->'tipo') NOT IN('null','string') OR (o->>'tipo' IS NOT NULL AND o->>'tipo' NOT IN('monta','inseminacion')) OR jsonb_typeof(o->'raza') NOT IN('null','string') THEN RAISE EXCEPTION 'Exact observed bull required';END IF;
END $$;
CREATE FUNCTION hato_catalog_edit.snapshot() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT hato_pajilla_use.inventory();
$$;
CREATE FUNCTION public.fn_hato_catalog_edit_web(p_action text,p_request_key uuid,p_intent jsonb,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_catalog_edit.requests;expected hato_catalog_edit.requests;before_domain jsonb;expected_domain jsonb;before_controls jsonb;expected_controls jsonb;herd jsonb;toro public.hato_toros;written_toro public.hato_toros;created jsonb;table_name text;receipt_value jsonb;a hato_catalog_edit.audit;wa hato_catalog_edit.audit;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner OR p_request_key IS NULL THEN RAISE EXCEPTION 'Original catalog edit owner/key required' USING ERRCODE='42501';END IF;
 actor=hato_treatment_creation.web_actor();
 IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve','acknowledge') OR (p_action<>'prepare' AND p_intent IS NOT NULL) THEN RAISE EXCEPTION 'Invalid original catalog edit action';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-catalog edit-owner:'||p_expected_owner::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-catalog edit-key:'||p_request_key::text,0));
 SELECT * INTO r FROM hato_catalog_edit.requests WHERE request_key=p_request_key FOR UPDATE;
 IF FOUND AND r.owner_id IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original catalog edit owner changed' USING ERRCODE='42501';END IF;
 IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_catalog_edit.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original catalog edit audit missing';END IF;
 IF p_action='status' THEN IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='unknown';r.acknowledged=false;END IF;RETURN hato_catalog_edit.result(r);END IF;
 PERFORM hato_birth_undo.lock_domain();PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
 before_domain=hato_birth_undo.capture_domain();expected_domain=before_domain;before_controls=hato_catalog_edit.controls();expected_controls=before_controls;
 herd=hato_catalog_edit.snapshot();
 IF p_action='prepare' THEN
  PERFORM hato_catalog_edit.validate(p_intent);
  IF r.request_key IS NOT NULL THEN IF r.intent IS NOT NULL AND r.intent IS DISTINCT FROM p_intent THEN RAISE EXCEPTION 'Original catalog edit intent changed';END IF;RETURN hato_catalog_edit.result(r);END IF;
  IF EXISTS(SELECT 1 FROM hato_catalog_edit.requests WHERE owner_id=p_expected_owner AND state IN('pending','committed') AND NOT acknowledged) THEN RAISE EXCEPTION 'Recover original catalog edit before replacement';END IF;
  SELECT * INTO toro FROM public.hato_toros WHERE id=(p_intent->>'bullId')::uuid;
  IF NOT FOUND OR (to_jsonb(toro)-'created_at'-'created_by') IS DISTINCT FROM p_intent->'observedBull' THEN RAISE EXCEPTION 'Observed bull changed before review';END IF;
  IF EXISTS(SELECT 1 FROM public.hato_toros WHERE id<>toro.id AND lower(nombre)=lower(p_intent->'changes'->>'nombre')) THEN RAISE EXCEPTION 'Bull name already exists' USING ERRCODE='23505';END IF;
  created=to_jsonb(toro)||(p_intent->'changes');table_name='hato_toros';
  r.request_key=p_request_key;r.owner_id=p_expected_owner;r.intent=p_intent;r.original=herd;r.plan=jsonb_build_object('table',table_name,'row',created);r.effective_date=(now() AT TIME ZONE 'America/Bogota')::date;r.state='pending';r.acknowledged=false;expected=r;
  INSERT INTO hato_catalog_edit.requests SELECT expected.* RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'catalog edit reservation suppressed/mutated';END IF;
 ELSIF p_action='resolve' THEN
  IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='canceled';r.acknowledged=false;expected=r;INSERT INTO hato_catalog_edit.requests SELECT expected.* RETURNING * INTO r;
  ELSIF r.state='pending' THEN expected=r;expected.state='canceled';UPDATE hato_catalog_edit.requests SET state='canceled' WHERE request_key=p_request_key RETURNING * INTO r;
  ELSE RETURN hato_catalog_edit.result(r);END IF;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'catalog edit cancellation suppressed/mutated';END IF;
 ELSIF p_action='acknowledge' THEN
  IF r.state IS NULL OR r.state NOT IN('committed','canceled') THEN RAISE EXCEPTION 'Verify terminal original catalog edit first';END IF;
  IF r.acknowledged THEN RETURN hato_catalog_edit.result(r);END IF;
  expected=r;expected.acknowledged=true;UPDATE hato_catalog_edit.requests SET acknowledged=true WHERE request_key=p_request_key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'catalog edit acknowledgment suppressed/mutated';END IF;
 ELSIF p_action='post' THEN
  IF r.state IS NULL THEN RAISE EXCEPTION 'Original prepared catalog edit required';END IF;
  IF r.state='committed' THEN RETURN hato_catalog_edit.result(r);ELSIF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled catalog edit cannot post';END IF;
  IF r.effective_date IS DISTINCT FROM (now() AT TIME ZONE 'America/Bogota')::date OR herd IS DISTINCT FROM r.original THEN RAISE EXCEPTION 'Original catalog edit source/day changed; resolve original';END IF;
  created=r.plan->'row';table_name='hato_toros';
  toro=jsonb_populate_record(NULL::public.hato_toros,created);
  UPDATE public.hato_toros SET nombre=toro.nombre,tipo=toro.tipo,raza=toro.raza,activo=toro.activo WHERE id=toro.id RETURNING * INTO written_toro;
  IF NOT FOUND OR to_jsonb(written_toro) IS DISTINCT FROM created THEN RAISE EXCEPTION 'Catalog bull edit suppressed/mutated';END IF;
  expected_domain=jsonb_set(expected_domain,ARRAY['public.hato_toros'],(SELECT jsonb_agg(v.x ORDER BY v.x::text) FROM (SELECT x FROM jsonb_array_elements(before_domain->'public.hato_toros')x WHERE x->>'id'<>toro.id::text UNION ALL SELECT created)v));
  receipt_value=jsonb_build_object('version',1,'requestKey',p_request_key,'owner',p_expected_owner,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'actor',actor,'recordedAt',now(),'before',(SELECT x FROM jsonb_array_elements(r.original->'toros')x WHERE x->>'id'=r.intent->>'bullId'),'after',created,'footprints',jsonb_build_object('before',encode(sha256(convert_to(before_domain::text,'UTF8')),'hex'),'after',encode(sha256(convert_to(expected_domain::text,'UTF8')),'hex')));
  a.request_key=p_request_key;a.receipt=receipt_value;INSERT INTO hato_catalog_edit.audit SELECT a.* RETURNING * INTO wa;
  IF NOT FOUND OR to_jsonb(wa) IS DISTINCT FROM to_jsonb(a) THEN RAISE EXCEPTION 'catalog edit trusted audit suppressed/mutated';END IF;
  expected=r;expected.state='committed';expected.receipt=receipt_value;UPDATE hato_catalog_edit.requests SET state='committed',receipt=receipt_value WHERE request_key=p_request_key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'catalog edit committed control suppressed/mutated';END IF;
  expected_controls=jsonb_set(expected_controls,'{audit}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((expected_controls->'audit')||jsonb_build_array(to_jsonb(a)))x));
 END IF;
 expected_controls=jsonb_set(expected_controls,'{requests}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(before_controls->'requests')x WHERE x->>'request_key'<>p_request_key::text)||jsonb_build_array(to_jsonb(expected)))x));
 IF hato_catalog_edit.controls() IS DISTINCT FROM expected_controls OR hato_birth_undo.capture_domain() IS DISTINCT FROM expected_domain OR hato_treatment_creation.web_actor() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'catalog edit final authority/domain/control readback mismatch';END IF;
 RETURN hato_catalog_edit.result(r);
END $$;
CREATE FUNCTION public.fn_hato_catalog_edit_recover_web(p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r hato_catalog_edit.requests;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Current catalog edit owner required' USING ERRCODE='42501';END IF;
 PERFORM hato_treatment_creation.web_actor();PERFORM pg_advisory_xact_lock(hashtextextended('hato-catalog edit-owner:'||p_expected_owner::text,0));
 SELECT * INTO r FROM hato_catalog_edit.requests WHERE owner_id=p_expected_owner AND state IN('pending','committed') AND NOT acknowledged;
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN public.fn_hato_catalog_edit_web('status',r.request_key,NULL,p_expected_owner);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_catalog_edit FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_catalog_edit_web(text,uuid,jsonb,uuid),public.fn_hato_catalog_edit_recover_web(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_catalog_edit_web(text,uuid,jsonb,uuid),public.fn_hato_catalog_edit_recover_web(uuid) TO authenticated;
COMMIT;
