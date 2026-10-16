-- NONNUMBERED Browser standalone pajilla usage after30candidates. Offline only.
-- Standalone usage creates no clinical event; animal is optional.
-- Zero/negative stock warns only; no historical row adoption or repair.
BEGIN;
SELECT alert_cron.lock_source();
DO $admission$ DECLARE fingerprint text;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed pajilla use installation owner required';END IF;
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
 IF fingerprint IS DISTINCT FROM '5ae11977b7a8e2f574bd41bb07f76ddc' THEN RAISE EXCEPTION 'Unreviewed pajilla use source graph';END IF;
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
 PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_death.snapshot(uuid)') AND md5(p.prosrc)='a6bf1457f7ab6b1adf5cae9c9c78d308' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') OR EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role'))v(role) WHERE has_function_privilege(v.role,'hato_death.snapshot(uuid)','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed pajilla use snapshot helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_treatment_creation.web_actor()') AND md5(p.prosrc)='1d8ec54936d4f658da49a965b828224c' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed pajilla use actor helper';END IF;
END $admission$;
CREATE SCHEMA hato_pajilla_use;
REVOKE ALL ON SCHEMA hato_pajilla_use FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_pajilla_use.requests(request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,intent jsonb,original jsonb,plan jsonb,effective_date date,state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,
 CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR intent IS NOT NULL AND original IS NOT NULL AND plan IS NOT NULL AND effective_date IS NOT NULL));
CREATE TABLE hato_pajilla_use.audit(request_key uuid PRIMARY KEY REFERENCES hato_pajilla_use.requests(request_key),receipt jsonb NOT NULL);
CREATE TABLE hato_pajilla_use.finished(request_key uuid PRIMARY KEY REFERENCES hato_pajilla_use.requests(request_key),owner_id uuid NOT NULL,acknowledged_at timestamptz NOT NULL);
ALTER TABLE hato_pajilla_use.finished ENABLE ROW LEVEL SECURITY;
ALTER TABLE hato_pajilla_use.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_pajilla_use.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_pajilla_use FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_pajilla_use.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME IN('audit','finished') THEN RAISE EXCEPTION 'Immutable original pajilla use proof';END IF;
 IF OLD.state<>'pending' OR NEW.state NOT IN('committed','canceled') OR (to_jsonb(NEW)-'state'-'receipt') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'receipt') THEN RAISE EXCEPTION 'Immutable original pajilla use proof';END IF;RETURN NEW;END $$;
CREATE TRIGGER immutable_request BEFORE UPDATE OR DELETE ON hato_pajilla_use.requests FOR EACH ROW EXECUTE FUNCTION hato_pajilla_use.immutable();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON hato_pajilla_use.audit FOR EACH ROW EXECUTE FUNCTION hato_pajilla_use.immutable();
CREATE TRIGGER no_truncate_request BEFORE TRUNCATE ON hato_pajilla_use.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_pajilla_use.immutable();
CREATE TRIGGER no_truncate_audit BEFORE TRUNCATE ON hato_pajilla_use.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_pajilla_use.immutable();
CREATE TRIGGER immutable_finished BEFORE UPDATE OR DELETE ON hato_pajilla_use.finished FOR EACH ROW EXECUTE FUNCTION hato_pajilla_use.immutable();
CREATE TRIGGER no_truncate_finished BEFORE TRUNCATE ON hato_pajilla_use.finished FOR EACH STATEMENT EXECUTE FUNCTION hato_pajilla_use.immutable();
CREATE FUNCTION hato_pajilla_use.inventory() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('lots',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_pajillas x),'uses',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_pajillas_uso x),'toros',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_toros x));
$$;
CREATE FUNCTION hato_pajilla_use.snapshot(p jsonb) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('lot',(SELECT to_jsonb(x) FROM public.hato_pajillas x WHERE id=(p->>'pajillaId')::uuid),'toro',(SELECT to_jsonb(x) FROM public.hato_toros x WHERE id=(SELECT toro_id FROM public.hato_pajillas WHERE id=(p->>'pajillaId')::uuid)),'graph',CASE WHEN p->>'animalId' IS NULL THEN NULL ELSE hato_death.snapshot((p->>'animalId')::uuid) END,'uses',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_pajillas_uso x WHERE pajilla_id=(p->>'pajillaId')::uuid),'stock',(SELECT to_jsonb(x) FROM public.v_hato_pajillas_stock x WHERE pajilla_id=(p->>'pajillaId')::uuid));
$$;
CREATE FUNCTION hato_pajilla_use.validate_intent(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE d date;BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p)k) IS DISTINCT FROM ARRAY['animalId','fechaUso','pajillaId','version'] OR p->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p->'pajillaId') IS DISTINCT FROM 'string' OR ((p->>'pajillaId')::uuid)::text IS DISTINCT FROM p->>'pajillaId' OR jsonb_typeof(p->'fechaUso') IS DISTINCT FROM 'string' OR (p->'animalId' IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(p->'animalId') IS DISTINCT FROM 'string' OR ((p->>'animalId')::uuid)::text IS DISTINCT FROM p->>'animalId')) THEN RAISE EXCEPTION 'Exact bounded pajilla use intent required';END IF;
 d=(p->>'fechaUso')::date;IF NOT isfinite(d) OR to_char(d,'YYYY-MM-DD') IS DISTINCT FROM p->>'fechaUso' THEN RAISE EXCEPTION 'Canonical usage date required';END IF;
END $$;
CREATE FUNCTION hato_pajilla_use.result(r hato_pajilla_use.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'owner',r.owner_id,'state',r.state,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'receipt',r.receipt);
$$;
CREATE FUNCTION public.fn_hato_pajilla_use_web(p_action text,p_request_key uuid,p_intent jsonb,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_pajilla_use.requests;expected hato_pajilla_use.requests;original jsonb;actual jsonb;expected_after jsonb;before_source jsonb;before_inventory jsonb;expected_inventory jsonb;usage public.hato_pajillas_uso;written public.hato_pajillas_uso;new_receipt jsonb;audit hato_pajilla_use.audit;written_audit hato_pajilla_use.audit;day date;view_inputs jsonb;ack hato_pajilla_use.finished;written_ack hato_pajilla_use.finished;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner OR p_request_key IS NULL THEN RAISE EXCEPTION 'Original pajilla use owner/key required' USING ERRCODE='42501';END IF;
 actor=hato_treatment_creation.web_actor();IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve','finish') THEN RAISE EXCEPTION 'Invalid pajilla use action';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-pajilla-use-owner:'||p_expected_owner::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-pajilla-use:'||p_request_key::text,0));
 SELECT * INTO r FROM hato_pajilla_use.requests WHERE request_key=p_request_key FOR UPDATE;
 IF FOUND AND r.owner_id IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original pajilla use owner changed' USING ERRCODE='42501';END IF;
 IF p_action<>'prepare' AND p_intent IS NOT NULL THEN RAISE EXCEPTION 'Original pajilla use intent cannot be replaced';END IF;
 IF p_action='status' THEN
  IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='unknown';RETURN hato_pajilla_use.result(r);END IF;
  IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_pajilla_use.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original pajilla use audit missing';END IF;RETURN hato_pajilla_use.result(r);
 END IF;
 PERFORM alert_cron.lock_source();LOCK TABLE public.hato_toros,public.hato_pajillas,public.hato_pajillas_uso IN SHARE ROW EXCLUSIVE MODE;LOCK TABLE public.v_hato_pajillas_stock IN SHARE MODE;
 before_source=alert_cron.source();before_inventory=hato_pajilla_use.inventory();expected_inventory=before_inventory;
 view_inputs=jsonb_build_object('checks',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeo_vacas x),'headers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeos x));
 IF p_action='prepare' THEN
  PERFORM hato_pajilla_use.validate_intent(p_intent);
  IF r.request_key IS NOT NULL THEN IF r.intent IS NOT NULL AND r.intent IS DISTINCT FROM p_intent THEN RAISE EXCEPTION 'Original pajilla use intent changed';END IF;RETURN hato_pajilla_use.result(r);END IF;
  original=hato_pajilla_use.snapshot(p_intent);day=(now() AT TIME ZONE 'America/Bogota')::date;
  IF jsonb_typeof(original->'lot') IS DISTINCT FROM 'object' OR jsonb_typeof(original->'toro') IS DISTINCT FROM 'object' OR jsonb_typeof(original->'stock') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Selected lot/bull missing';END IF;
  IF p_intent->>'animalId' IS NOT NULL AND (jsonb_typeof(original->'graph'->'animal') IS DISTINCT FROM 'object' OR original->'graph'->'animal'->>'estado' IS DISTINCT FROM 'activa') THEN RAISE EXCEPTION 'Selected active animal changed';END IF;
  IF (p_intent->>'fechaUso')::date>day THEN RAISE EXCEPTION 'Future usage fact refused';END IF;
  -- NULL animal deliberately permits distinct real uses on the same day; no identity is inferred.
  IF p_intent->>'animalId' IS NOT NULL AND EXISTS(SELECT 1 FROM public.hato_pajillas_uso WHERE pajilla_id=(p_intent->>'pajillaId')::uuid AND animal_id=(p_intent->>'animalId')::uuid AND fecha_uso=(p_intent->>'fechaUso')::date) THEN RAISE EXCEPTION 'Existing usage cannot become prospective proof';END IF;
  IF EXISTS(SELECT 1 FROM hato_pajilla_use.requests x WHERE owner_id=p_expected_owner AND (state='pending' OR state='committed' AND NOT EXISTS(SELECT 1 FROM hato_pajilla_use.finished f WHERE f.request_key=x.request_key))) THEN RAISE EXCEPTION 'Usage already has an original unfinished action; recover, resolve or finish it';END IF;
  usage=jsonb_populate_record(NULL::public.hato_pajillas_uso,jsonb_build_object('id',gen_random_uuid(),'pajilla_id',p_intent->'pajillaId','animal_id',p_intent->'animalId','fecha_uso',p_intent->'fechaUso','created_by',p_expected_owner));
  r.request_key=p_request_key;r.owner_id=p_expected_owner;r.intent=p_intent;r.original=original;r.plan=to_jsonb(usage);r.effective_date=day;r.state='pending';expected=r;
  INSERT INTO hato_pajilla_use.requests SELECT expected.* RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Pajilla use reservation suppressed/mutated';END IF;
 ELSIF p_action='resolve' THEN
  IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='canceled';expected=r;INSERT INTO hato_pajilla_use.requests SELECT expected.* RETURNING * INTO r;
  ELSIF r.state='pending' THEN expected=r;expected.state='canceled';UPDATE hato_pajilla_use.requests SET state='canceled' WHERE request_key=p_request_key RETURNING * INTO r;
  ELSE RETURN hato_pajilla_use.result(r);END IF;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Pajilla use cancellation suppressed/mutated';END IF;
 ELSIF p_action='finish' THEN
  IF r.request_key IS NULL OR r.state NOT IN('committed','canceled') THEN RAISE EXCEPTION 'Verified terminal original usage required';END IF;
  IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_pajilla_use.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original pajilla use audit missing';END IF;
  expected=r;SELECT * INTO ack FROM hato_pajilla_use.finished WHERE request_key=p_request_key;
  IF FOUND THEN IF ack.owner_id IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original completion owner changed';END IF;
  ELSE ack.request_key=p_request_key;ack.owner_id=p_expected_owner;ack.acknowledged_at=now();INSERT INTO hato_pajilla_use.finished SELECT ack.* RETURNING * INTO written_ack;IF NOT FOUND OR to_jsonb(written_ack) IS DISTINCT FROM to_jsonb(ack) THEN RAISE EXCEPTION 'Usage completion suppressed/mutated';END IF;END IF;
 ELSIF p_action='post' THEN
  IF r.request_key IS NULL THEN RAISE EXCEPTION 'Original prepared pajilla use required';END IF;
  IF r.state='committed' THEN IF NOT EXISTS(SELECT 1 FROM hato_pajilla_use.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original pajilla use audit missing';END IF;RETURN hato_pajilla_use.result(r);ELSIF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled usage cannot post';END IF;
  IF r.effective_date IS DISTINCT FROM (now() AT TIME ZONE 'America/Bogota')::date THEN RAISE EXCEPTION 'Prepared usage day elapsed; resolve original request';END IF;
  original=r.original;IF hato_pajilla_use.snapshot(r.intent) IS DISTINCT FROM original THEN RAISE EXCEPTION 'Original pajilla use source graph changed';END IF;
  usage=jsonb_populate_record(NULL::public.hato_pajillas_uso,r.plan||jsonb_build_object('created_at',now()));
  INSERT INTO public.hato_pajillas_uso SELECT usage.* RETURNING * INTO written;IF NOT FOUND OR to_jsonb(written) IS DISTINCT FROM to_jsonb(usage) THEN RAISE EXCEPTION 'Pajilla usage suppressed/mutated';END IF;
  expected_inventory=jsonb_set(expected_inventory,'{uses}',(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements((expected_inventory->'uses')||jsonb_build_array(to_jsonb(usage)))x));
  expected_after=jsonb_set(original,'{uses}',(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements((original->'uses')||jsonb_build_array(to_jsonb(usage)))x));
  expected_after=jsonb_set(expected_after,'{stock,usos}',to_jsonb((original->'stock'->>'usos')::bigint+1));expected_after=jsonb_set(expected_after,'{stock,cantidad_actual}',to_jsonb((original->'stock'->>'cantidad_actual')::bigint-1));
  actual=hato_pajilla_use.snapshot(r.intent);IF actual IS DISTINCT FROM expected_after THEN RAISE EXCEPTION 'Pajilla use exact target/inventory mismatch';END IF;
  new_receipt=jsonb_build_object('version',1,'requestKey',p_request_key,'owner',p_expected_owner,'intent',r.intent,'original',original,'plan',r.plan,'effectiveDate',r.effective_date,'actor',actor,'recordedAt',now(),'after',actual,'usage',to_jsonb(usage));
  audit.request_key=p_request_key;audit.receipt=new_receipt;INSERT INTO hato_pajilla_use.audit SELECT audit.* RETURNING * INTO written_audit;IF NOT FOUND OR to_jsonb(written_audit) IS DISTINCT FROM to_jsonb(audit) THEN RAISE EXCEPTION 'Pajilla use trusted audit suppressed/mutated';END IF;
  expected=r;expected.state='committed';expected.receipt=new_receipt;UPDATE hato_pajilla_use.requests SET state='committed',receipt=new_receipt WHERE request_key=p_request_key RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Pajilla use committed control suppressed/mutated';END IF;
 END IF;
 IF hato_treatment_creation.web_actor() IS DISTINCT FROM actor OR alert_cron.source() IS DISTINCT FROM before_source THEN RAISE EXCEPTION 'Pajilla use final authority/domain mismatch';END IF;
 IF hato_pajilla_use.inventory() IS DISTINCT FROM expected_inventory THEN RAISE EXCEPTION 'Pajilla use final inventory mismatch';END IF;
 IF view_inputs IS DISTINCT FROM jsonb_build_object('checks',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeo_vacas x),'headers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeos x)) THEN RAISE EXCEPTION 'Pajilla use view inputs changed';END IF;
 SELECT * INTO r FROM hato_pajilla_use.requests WHERE request_key=p_request_key;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Pajilla use final request mismatch';END IF;
 IF p_action='post' AND r.state='committed' AND (hato_pajilla_use.snapshot(r.intent) IS DISTINCT FROM r.receipt->'after' OR NOT EXISTS(SELECT 1 FROM hato_pajilla_use.audit WHERE request_key=p_request_key AND receipt=r.receipt)) THEN RAISE EXCEPTION 'Pajilla use final audit/target mismatch';END IF;
 IF p_action='finish' AND NOT EXISTS(SELECT 1 FROM hato_pajilla_use.finished x WHERE x.request_key=p_request_key AND to_jsonb(x)=to_jsonb(ack)) THEN RAISE EXCEPTION 'Usage completion final readback mismatch';END IF;
 RETURN hato_pajilla_use.result(r);
END $$;
CREATE FUNCTION public.fn_hato_pajilla_use_recover_web(p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_pajilla_use.requests;n integer;BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original recovery owner required' USING ERRCODE='42501';END IF;
 actor=hato_treatment_creation.web_actor();PERFORM pg_advisory_xact_lock(hashtextextended('hato-pajilla-use-owner:'||p_expected_owner::text,0));
 SELECT count(*) INTO n FROM hato_pajilla_use.requests x WHERE owner_id=p_expected_owner AND (state='pending' OR state='committed' AND NOT EXISTS(SELECT 1 FROM hato_pajilla_use.finished f WHERE f.request_key=x.request_key));
 IF n=0 THEN RETURN NULL;ELSIF n<>1 THEN RAISE EXCEPTION 'Ambiguous original usage; no replacement allowed';END IF;
 SELECT * INTO r FROM hato_pajilla_use.requests x WHERE owner_id=p_expected_owner AND (state='pending' OR state='committed' AND NOT EXISTS(SELECT 1 FROM hato_pajilla_use.finished f WHERE f.request_key=x.request_key));
 IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_pajilla_use.audit WHERE request_key=r.request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original pajilla use audit missing';END IF;
 IF hato_treatment_creation.web_actor() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Recovery actor changed';END IF;RETURN hato_pajilla_use.result(r);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_pajilla_use FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_pajilla_use_web(text,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_pajilla_use_recover_web(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_pajilla_use_recover_web(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hato_pajilla_use_web(text,uuid,jsonb,uuid) TO authenticated;
COMMIT;
