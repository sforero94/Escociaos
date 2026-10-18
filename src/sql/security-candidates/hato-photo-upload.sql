-- NONNUMBERED prospective milk-photo upload foundation after46candidates.
-- OFFLINE REVIEW ONLY. No existing caller/grant cutover, no object/byte deletion.
BEGIN;
SELECT hato_birth_undo.lock_domain();
DO $$ BEGIN IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed photo installation owner required';END IF;PERFORM hato_milk_week.assert_baseline();END $$;
CREATE SCHEMA hato_photo_upload;
REVOKE ALL ON SCHEMA hato_photo_upload FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_photo_upload.requests(
 request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,intent jsonb,bucket jsonb,paths jsonb,
 state text NOT NULL CHECK(state IN('reserved','held','verified','canceled')),permission_id uuid,receipt jsonb,acknowledged boolean NOT NULL DEFAULT false,
 CHECK((state IN('held','verified'))=(permission_id IS NOT NULL)),CHECK((state='verified')=(receipt IS NOT NULL)),
 CHECK(state='canceled' OR intent IS NOT NULL AND bucket IS NOT NULL AND paths IS NOT NULL),CHECK(NOT acknowledged OR state IN('verified','canceled')));
CREATE UNIQUE INDEX one_unresolved_photo ON hato_photo_upload.requests(owner_id) WHERE NOT acknowledged AND state<>'canceled';
CREATE TABLE hato_photo_upload.audit(id uuid PRIMARY KEY,request_key uuid NOT NULL REFERENCES hato_photo_upload.requests,action text NOT NULL,actor jsonb NOT NULL,recorded_at timestamptz NOT NULL,before_value jsonb,after_value jsonb NOT NULL);
ALTER TABLE hato_photo_upload.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_photo_upload.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_photo_upload FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_photo_upload.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' THEN RAISE EXCEPTION 'Immutable photo original/audit';END IF;
 IF (OLD.state='reserved' AND NEW.state='held' AND OLD.permission_id IS NULL AND NEW.permission_id IS NOT NULL AND (to_jsonb(NEW)-'state'-'permission_id')=(to_jsonb(OLD)-'state'-'permission_id'))
 OR (OLD.state='reserved' AND NEW.state='canceled' AND (to_jsonb(NEW)-'state')=(to_jsonb(OLD)-'state'))
 OR (OLD.state='held' AND NEW.state='verified' AND (to_jsonb(NEW)-'state'-'receipt')=(to_jsonb(OLD)-'state'-'receipt'))
 OR (OLD.state IN('verified','canceled') AND NOT OLD.acknowledged AND NEW.acknowledged AND (to_jsonb(NEW)-'acknowledged')=(to_jsonb(OLD)-'acknowledged')) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Photo original or one-time permission cannot be replaced';
END $$;
CREATE TRIGGER immutable_photo_request BEFORE UPDATE OR DELETE ON hato_photo_upload.requests FOR EACH ROW EXECUTE FUNCTION hato_photo_upload.immutable();
CREATE TRIGGER immutable_photo_audit BEFORE UPDATE OR DELETE ON hato_photo_upload.audit FOR EACH ROW EXECUTE FUNCTION hato_photo_upload.immutable();
CREATE TRIGGER no_truncate_photo_request BEFORE TRUNCATE ON hato_photo_upload.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_photo_upload.immutable();
CREATE TRIGGER no_truncate_photo_audit BEFORE TRUNCATE ON hato_photo_upload.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_photo_upload.immutable();
-- Catalog query pins metadata hashes; no private definitions are copied.
CREATE FUNCTION hato_photo_upload.baseline() RETURNS text LANGUAGE sql SET search_path=pg_catalog AS $baseline$
-- Derived catalog fingerprint query; contains no exported definitions or domain rows.
WITH targets AS (
 SELECT c.oid,n.nspname,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,c.relkind
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE (n.nspname='storage' AND c.relkind IN('r','p')) OR c.oid='public.hato_capturas_foto'::regclass
), sections AS (
 SELECT 'relations' label,coalesce(jsonb_agg(jsonb_build_array(nspname,relname,pg_get_userbyid(relowner),relacl,relrowsecurity,relforcerowsecurity,relkind) ORDER BY nspname,relname),'[]') value FROM targets
 UNION ALL SELECT 'columns',coalesce(jsonb_agg(jsonb_build_array(t.nspname,t.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attgenerated,a.attidentity,pg_get_expr(d.adbin,d.adrelid),a.attacl,a.attcollation::regcollation::text) ORDER BY t.nspname,t.relname,a.attnum),'[]') FROM targets t JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum
 UNION ALL SELECT 'constraints',coalesce(jsonb_agg(jsonb_build_array(t.nspname,t.relname,c.conname,pg_get_constraintdef(c.oid),c.convalidated,c.condeferrable,c.condeferred) ORDER BY t.nspname,t.relname,c.conname),'[]') FROM targets t JOIN pg_constraint c ON c.conrelid=t.oid
 UNION ALL SELECT 'indexes',coalesce(jsonb_agg(jsonb_build_array(t.nspname,t.relname,i.indexrelid::regclass::text,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready,i.indislive,i.indimmediate,i.indisunique,i.indisprimary,i.indnullsnotdistinct) ORDER BY t.nspname,t.relname,i.indexrelid::regclass::text),'[]') FROM targets t JOIN pg_index i ON i.indrelid=t.oid
 UNION ALL SELECT 'triggers',coalesce(jsonb_agg(jsonb_build_array(t.nspname,t.relname,g.tgname,pg_get_triggerdef(g.oid),g.tgenabled) ORDER BY t.nspname,t.relname,g.tgname),'[]') FROM targets t JOIN pg_trigger g ON g.tgrelid=t.oid AND NOT g.tgisinternal
 UNION ALL SELECT 'policies',coalesce(jsonb_agg(jsonb_build_array(p.schemaname,p.tablename,p.policyname,p.permissive,p.roles,p.cmd,p.qual,p.with_check) ORDER BY p.schemaname,p.tablename,p.policyname),'[]') FROM pg_policies p JOIN targets t ON t.nspname=p.schemaname AND t.relname=p.tablename
 UNION ALL SELECT 'functions',coalesce(jsonb_agg(jsonb_build_array(n.nspname,f.proname,pg_get_function_identity_arguments(f.oid),pg_get_userbyid(f.proowner),f.prosecdef,f.proconfig,f.proacl,md5(f.prosrc),f.provolatile,f.prokind) ORDER BY n.nspname,f.proname,pg_get_function_identity_arguments(f.oid)),'[]') FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname='storage' OR f.oid IN(SELECT tgfoid FROM pg_trigger WHERE tgrelid IN(SELECT oid FROM targets) AND NOT tgisinternal)
 UNION ALL SELECT 'rules',coalesce(jsonb_agg(jsonb_build_array(t.nspname,t.relname,r.rulename,md5(pg_get_ruledef(r.oid))) ORDER BY t.nspname,t.relname,r.rulename),'[]') FROM pg_rewrite r JOIN targets t ON t.oid=r.ev_class
 UNION ALL SELECT 'inheritance',coalesce(jsonb_agg(jsonb_build_array(i.inhrelid::regclass::text,i.inhparent::regclass::text) ORDER BY i.inhrelid::regclass::text,i.inhparent::regclass::text),'[]') FROM pg_inherits i WHERE i.inhrelid IN(SELECT oid FROM targets) OR i.inhparent IN(SELECT oid FROM targets)
 UNION ALL SELECT 'schema',jsonb_build_array(pg_get_userbyid(n.nspowner),n.nspacl) FROM pg_namespace n WHERE n.nspname='storage'
 UNION ALL SELECT 'enum',coalesce(jsonb_agg(jsonb_build_array(t.typname,pg_get_userbyid(t.typowner),t.typacl,e.enumlabel,e.enumsortorder) ORDER BY t.typname,e.enumsortorder),'[]') FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace LEFT JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='storage' AND (t.typname IN('buckettype','_buckettype') OR t.typtype='e')
 UNION ALL SELECT 'default_acl',coalesce(jsonb_agg(jsonb_build_array(pg_get_userbyid(d.defaclrole),d.defaclobjtype,d.defaclacl) ORDER BY pg_get_userbyid(d.defaclrole),d.defaclobjtype),'[]') FROM pg_default_acl d JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname='storage'
)
SELECT md5(jsonb_object_agg(label,value)::text) FROM sections;
$baseline$;
CREATE FUNCTION hato_photo_upload.assert_baseline() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM hato_milk_week.assert_baseline();
 IF hato_photo_upload.baseline() IS DISTINCT FROM '70caf16e036f622987b0d5ab24e0a073' THEN RAISE EXCEPTION 'Unreviewed photo/Storage baseline';END IF;
END $$;
SELECT hato_photo_upload.assert_baseline();
CREATE FUNCTION hato_photo_upload.actor(p_owner uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE p public.usuarios;BEGIN
 SELECT * INTO p FROM public.usuarios WHERE id=p_owner FOR SHARE;
 IF NOT FOUND OR p.activo IS DISTINCT FROM true OR p.rol IS NULL OR p.rol::text NOT IN('Administrador','Gerencia') THEN RAISE EXCEPTION 'Fresh active photo Admin/Gerencia required' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('origin','web','profileId',p_owner);
END $$;
CREATE FUNCTION hato_photo_upload.controls() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_photo_upload.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM hato_photo_upload.audit x));
$$;
CREATE FUNCTION hato_photo_upload.storage_rows() RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE result jsonb='{}';t record;value jsonb;BEGIN
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage' AND c.relkind IN('r','p') ORDER BY c.relname LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),''[]'') FROM storage.%I x',t.relname) INTO value;result=result||jsonb_build_object(t.relname,value);
 END LOOP;RETURN result;
END $$;
-- Preserve controls belonging to every previously installed protocol as well.
CREATE FUNCTION hato_photo_upload.other_controls() RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE result jsonb='{}';t record;value jsonb;BEGIN
 FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('public','respaldos','storage','hato_photo_upload','information_schema') AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN('r','p') ORDER BY n.nspname,c.relname LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),''[]'') FROM %I.%I x',t.nspname,t.relname) INTO value;result=result||jsonb_build_object(t.nspname||'.'||t.relname,value);
 END LOOP;RETURN result;
END $$;
CREATE FUNCTION hato_photo_upload.result(r hato_photo_upload.requests,p_permit uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'owner',r.owner_id,'state',r.state,'intent',r.intent,'bucket',r.bucket,'paths',r.paths,'permissionId',r.permission_id,'permit',p_permit,'receipt',r.receipt,'acknowledged',r.acknowledged);
$$;
CREATE FUNCTION hato_photo_upload.validate(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f jsonb;i integer=0;BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p)k) IS DISTINCT FROM ARRAY['files','month','version','year'] OR p->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p->'year') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'month') IS DISTINCT FROM 'number' OR (p->>'year')::numeric NOT BETWEEN 2020 AND 2100 OR (p->>'month')::numeric NOT BETWEEN 1 AND 12 OR trunc((p->>'year')::numeric)<>(p->>'year')::numeric OR trunc((p->>'month')::numeric)<>(p->>'month')::numeric OR jsonb_typeof(p->'files') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Exact bounded milk photo manifest required';END IF;
 IF jsonb_array_length(p->'files') NOT BETWEEN 1 AND 6 OR octet_length(p::text)>8192 THEN RAISE EXCEPTION 'Bounded photo manifest required';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(p->'files') LOOP
  i=i+1;
  IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(f)k) IS DISTINCT FROM ARRAY['extension','mime','page','sha256','size'] OR f->'page' IS DISTINCT FROM to_jsonb(i) OR jsonb_typeof(f->'sha256') IS DISTINCT FROM 'string' OR (f->>'sha256') !~ '^[0-9a-f]{64}$' OR jsonb_typeof(f->'size') IS DISTINCT FROM 'number' OR (f->>'size')::numeric NOT BETWEEN 1 AND 15728640 OR trunc((f->>'size')::numeric)<>(f->>'size')::numeric OR jsonb_typeof(f->'mime') IS DISTINCT FROM 'string' OR jsonb_typeof(f->'extension') IS DISTINCT FROM 'string' OR NOT ((f->>'mime'='image/jpeg' AND f->>'extension'='jpg') OR(f->>'mime'='image/png' AND f->>'extension'='png') OR(f->>'mime'='image/webp' AND f->>'extension'='webp') OR(f->>'mime'='image/heic' AND f->>'extension'='heic') OR(f->>'mime'='image/heif' AND f->>'extension'='heif')) THEN RAISE EXCEPTION 'Canonical ordered actual-byte photo manifest required';END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.fn_hato_photo_upload_service(p_action text,p_request_key uuid,p_owner uuid,p_payload jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_photo_upload.requests;expected hato_photo_upload.requests;written hato_photo_upload.requests;before_domain jsonb;expected_domain jsonb;before_storage jsonb;before_foreign jsonb;before_controls jsonb;expected_controls jsonb;a hato_photo_upload.audit;wa hato_photo_upload.audit;old_value jsonb;permit uuid;f jsonb;ob jsonb;object_row jsonb;bucket_row jsonb;paths jsonb='[]';objects jsonb='[]';capture public.hato_capturas_foto;capture_written jsonb;receipt_value jsonb;i integer;
BEGIN
 IF auth.uid() IS NOT NULL OR p_owner IS NULL OR p_request_key IS NULL THEN RAISE EXCEPTION 'Trusted server owner and original key required' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('reserve','claim','observe','status','cancel','acknowledge') OR (p_action NOT IN('reserve','observe') AND p_payload IS NOT NULL) THEN RAISE EXCEPTION 'Exact photo action required';END IF;
 actor=hato_photo_upload.actor(p_owner);
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-photo-owner:'||p_owner::text,0));
 PERFORM hato_birth_undo.lock_domain();LOCK TABLE hato_photo_upload.requests,hato_photo_upload.audit IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE storage.buckets,storage.objects IN SHARE ROW EXCLUSIVE MODE;
 PERFORM hato_photo_upload.assert_baseline();
 SELECT * INTO r FROM hato_photo_upload.requests WHERE request_key=p_request_key FOR UPDATE;
 IF FOUND AND r.owner_id IS DISTINCT FROM p_owner THEN RAISE EXCEPTION 'Photo original owner changed' USING ERRCODE='42501';END IF;
 IF p_action='status' THEN
  IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_owner;r.state='unknown';r.acknowledged=false;END IF;
  RETURN hato_photo_upload.result(r);
 END IF;
 before_domain=hato_birth_undo.capture_domain();expected_domain=before_domain;before_storage=hato_photo_upload.storage_rows();before_foreign=hato_photo_upload.other_controls();before_controls=hato_photo_upload.controls();expected_controls=before_controls;old_value=CASE WHEN r.request_key IS NULL THEN NULL ELSE to_jsonb(r) END;
 IF p_action='reserve' THEN
  PERFORM hato_photo_upload.validate(p_payload);
  IF r.request_key IS NOT NULL THEN IF r.intent IS NOT NULL AND r.intent IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'Original photo manifest changed';END IF;RETURN hato_photo_upload.result(r);END IF;
  IF EXISTS(SELECT 1 FROM hato_photo_upload.requests WHERE owner_id=p_owner AND state<>'canceled' AND NOT acknowledged) THEN RAISE EXCEPTION 'Recover original photo before replacement';END IF;
  SELECT to_jsonb(b) INTO bucket_row FROM storage.buckets b WHERE id='hato-pesajes-fotos';
  IF bucket_row IS NULL OR bucket_row->'public' IS DISTINCT FROM 'false'::jsonb OR bucket_row->>'type'<>'STANDARD' THEN RAISE EXCEPTION 'Existing private standard milk bucket required';END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(p_payload->'files') LOOP paths=paths||jsonb_build_array('verified-milk/'||p_owner::text||'/'||p_request_key::text||'/page-'||(f->>'page')||'.'||(f->>'extension'));END LOOP;
  IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='hato-pesajes-fotos' AND name IN(SELECT jsonb_array_elements_text(paths))) OR EXISTS(SELECT 1 FROM public.hato_capturas_foto c WHERE c.id=p_request_key OR (c.storage_bucket='hato-pesajes-fotos' AND c.storage_rutas && ARRAY(SELECT jsonb_array_elements_text(paths)))) THEN RAISE EXCEPTION 'Prospective photo identity already claimed';END IF;
  r.request_key=p_request_key;r.owner_id=p_owner;r.intent=p_payload;r.bucket=bucket_row;r.paths=paths;r.state='reserved';r.acknowledged=false;
 ELSIF p_action='cancel' THEN
  IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_owner;r.state='canceled';r.acknowledged=false;
  ELSIF r.state='reserved' THEN r.state='canceled';
  ELSIF r.state IN('held','verified') THEN RAISE EXCEPTION 'Issued photo permission cannot be canceled or replaced';
  ELSE RETURN hato_photo_upload.result(r);END IF;
 ELSIF p_action='claim' THEN
  IF r.state IS NULL THEN RAISE EXCEPTION 'Original reserved photo required';END IF;
  IF r.state<>'reserved' THEN RETURN hato_photo_upload.result(r);END IF;
  SELECT to_jsonb(b) INTO bucket_row FROM storage.buckets b WHERE id='hato-pesajes-fotos';
  IF bucket_row IS DISTINCT FROM r.bucket OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='hato-pesajes-fotos' AND name IN(SELECT jsonb_array_elements_text(r.paths))) OR EXISTS(SELECT 1 FROM public.hato_capturas_foto c WHERE c.id=r.request_key OR (c.storage_bucket='hato-pesajes-fotos' AND c.storage_rutas && ARRAY(SELECT jsonb_array_elements_text(r.paths)))) THEN RAISE EXCEPTION 'Original photo source changed before permission';END IF;
  r.state='held';r.permission_id=gen_random_uuid();permit=r.permission_id;
 ELSIF p_action='acknowledge' THEN
  IF r.state IS NULL OR r.state NOT IN('verified','canceled') THEN RAISE EXCEPTION 'Verified terminal photo required';END IF;
  IF r.acknowledged THEN RETURN hato_photo_upload.result(r);END IF;r.acknowledged=true;
 ELSIF p_action='observe' THEN
  IF r.state='verified' THEN RETURN hato_photo_upload.result(r);END IF;
  IF r.state IS DISTINCT FROM 'held' OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_payload)k) IS DISTINCT FROM ARRAY['objects','permissionId'] OR p_payload->>'permissionId' IS DISTINCT FROM r.permission_id::text OR jsonb_typeof(p_payload->'objects') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Original held permission and actual-byte observation required';END IF;
  IF octet_length(p_payload::text)>65536 OR jsonb_array_length(p_payload->'objects')<>jsonb_array_length(r.intent->'files') THEN RAISE EXCEPTION 'Complete bounded photo observation required';END IF;
  SELECT to_jsonb(b) INTO bucket_row FROM storage.buckets b WHERE id='hato-pesajes-fotos';
  IF bucket_row IS DISTINCT FROM r.bucket OR EXISTS(SELECT 1 FROM public.hato_capturas_foto c WHERE c.id=r.request_key OR (c.storage_bucket='hato-pesajes-fotos' AND c.storage_rutas && ARRAY(SELECT jsonb_array_elements_text(r.paths)))) THEN RAISE EXCEPTION 'Original photo source changed before verification';END IF;
  i=0;
  FOR f IN SELECT value FROM jsonb_array_elements(r.intent->'files') LOOP
   ob=p_payload->'objects'->i;
   IF jsonb_typeof(ob) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(ob)k) IS DISTINCT FROM ARRAY['mime','page','row','sha256','size'] THEN RAISE EXCEPTION 'Exact observed object required';END IF;
   IF ob-'row' IS DISTINCT FROM f-'extension' THEN RAISE EXCEPTION 'Actual observed bytes differ from original manifest';END IF;
   SELECT to_jsonb(o) INTO object_row FROM storage.objects o WHERE bucket_id='hato-pesajes-fotos' AND name=r.paths->>i;
   IF object_row IS NULL OR object_row IS DISTINCT FROM ob->'row' THEN RAISE EXCEPTION 'Current full Storage object identity changed';END IF;
   objects=objects||jsonb_build_array(ob);i=i+1;
  END LOOP;
  capture.id=r.request_key;capture.creado_en=now();capture.actualizado_en=now();capture.tipo='pesaje';capture.origen='web';capture.desenlace='pendiente';capture.anio=(r.intent->>'year')::int;capture.mes=(r.intent->>'month')::int;capture.storage_bucket='hato-pesajes-fotos';capture.storage_prefijo='verified-milk/'||p_owner::text||'/'||r.request_key::text;capture.storage_rutas=ARRAY(SELECT jsonb_array_elements_text(r.paths));capture.storage_ok=true;capture.fotos_recibidas=jsonb_array_length(r.paths);capture.created_by=p_owner;
  INSERT INTO public.hato_capturas_foto SELECT capture.* RETURNING to_jsonb(hato_capturas_foto.*) INTO capture_written;
  IF NOT FOUND OR capture_written IS DISTINCT FROM to_jsonb(capture) THEN RAISE EXCEPTION 'Photo capture suppressed/mutated';END IF;
  expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_capturas_foto','[]',jsonb_build_array(capture_written));
  receipt_value=jsonb_build_object('version',1,'requestKey',r.request_key,'owner',r.owner_id,'actor',actor,'recordedAt',now(),'intent',r.intent,'bucket',r.bucket,'paths',r.paths,'permissionId',r.permission_id,'objects',objects,'capture',capture_written);
  r.state='verified';r.receipt=receipt_value;
 END IF;
 expected=r;
 IF old_value IS NULL THEN INSERT INTO hato_photo_upload.requests SELECT expected.* RETURNING * INTO written;
 ELSE UPDATE hato_photo_upload.requests SET state=expected.state,permission_id=expected.permission_id,receipt=expected.receipt,acknowledged=expected.acknowledged WHERE request_key=p_request_key RETURNING * INTO written;END IF;
 IF NOT FOUND OR to_jsonb(written) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Photo control suppressed/mutated';END IF;
 a.id=gen_random_uuid();a.request_key=p_request_key;a.action=p_action;a.actor=actor;a.recorded_at=now();a.before_value=old_value;a.after_value=to_jsonb(expected);
 INSERT INTO hato_photo_upload.audit SELECT a.* RETURNING * INTO wa;
 IF NOT FOUND OR to_jsonb(wa) IS DISTINCT FROM to_jsonb(a) THEN RAISE EXCEPTION 'Trusted photo audit suppressed/mutated';END IF;
 expected_controls=jsonb_set(expected_controls,'{requests}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(before_controls->'requests')x WHERE x->>'request_key'<>p_request_key::text)||jsonb_build_array(to_jsonb(expected)))x));
 expected_controls=jsonb_set(expected_controls,'{audit}',(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements((before_controls->'audit')||jsonb_build_array(to_jsonb(a)))x));
 PERFORM hato_photo_upload.assert_baseline();
 IF hato_photo_upload.controls() IS DISTINCT FROM expected_controls OR hato_birth_undo.capture_domain() IS DISTINCT FROM expected_domain OR hato_photo_upload.storage_rows() IS DISTINCT FROM before_storage OR hato_photo_upload.other_controls() IS DISTINCT FROM before_foreign OR hato_photo_upload.actor(p_owner) IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Photo final domain/Storage/control/authority mismatch';END IF;
 RETURN hato_photo_upload.result(expected,permit);
END $$;
-- The human reader cannot attest bytes, mint a permission or insert a capture.
CREATE FUNCTION public.fn_hato_photo_upload_recover_web(p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r hato_photo_upload.requests;BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Current photo owner required' USING ERRCODE='42501';END IF;
 PERFORM hato_treatment_creation.web_actor();PERFORM hato_photo_upload.assert_baseline();
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-photo-owner:'||p_expected_owner::text,0));
 SELECT * INTO r FROM hato_photo_upload.requests WHERE owner_id=p_expected_owner AND state<>'canceled' AND NOT acknowledged;
 IF NOT FOUND THEN RETURN NULL;END IF;RETURN hato_photo_upload.result(r);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_photo_upload FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_photo_upload_service(text,uuid,uuid,jsonb),public.fn_hato_photo_upload_recover_web(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_photo_upload_service(text,uuid,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_photo_upload_recover_web(uuid) TO authenticated;
COMMIT;
