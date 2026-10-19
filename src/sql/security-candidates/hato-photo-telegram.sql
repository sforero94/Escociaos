-- NONNUMBERED protected native Telegram photo upload/OCR after49candidates. OFFLINE ONLY.
BEGIN;
SELECT hato_birth_undo.lock_domain();
SELECT hato_photo_upload.assert_observer_baseline();
CREATE SCHEMA hato_native_photo_upload;
REVOKE ALL ON SCHEMA hato_native_photo_upload FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_native_photo_upload.requests(
 request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,intent jsonb,bucket jsonb,paths jsonb,
 state text NOT NULL CHECK(state IN('reserved','held','verified','canceled')),permission_id uuid,receipt jsonb,acknowledged boolean NOT NULL DEFAULT false,
 CHECK((state IN('held','verified'))=(permission_id IS NOT NULL)),CHECK((state='verified')=(receipt IS NOT NULL)),
 CHECK(state='canceled' OR intent IS NOT NULL AND bucket IS NOT NULL AND paths IS NOT NULL),CHECK(NOT acknowledged OR state IN('verified','canceled')));
CREATE UNIQUE INDEX one_unresolved_photo ON hato_native_photo_upload.requests(owner_id) WHERE NOT acknowledged AND state<>'canceled';
CREATE TABLE hato_native_photo_upload.audit(id uuid PRIMARY KEY,request_key uuid NOT NULL REFERENCES hato_native_photo_upload.requests,action text NOT NULL,actor jsonb NOT NULL,recorded_at timestamptz NOT NULL,before_value jsonb,after_value jsonb NOT NULL);
ALTER TABLE hato_native_photo_upload.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_native_photo_upload.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_native_photo_upload FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_native_photo_upload.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' THEN RAISE EXCEPTION 'Immutable photo original/audit';END IF;
 IF (OLD.state='reserved' AND NEW.state='held' AND OLD.permission_id IS NULL AND NEW.permission_id IS NOT NULL AND (to_jsonb(NEW)-'state'-'permission_id')=(to_jsonb(OLD)-'state'-'permission_id'))
 OR (OLD.state='reserved' AND NEW.state='canceled' AND (to_jsonb(NEW)-'state')=(to_jsonb(OLD)-'state'))
 OR (OLD.state='held' AND NEW.state='verified' AND (to_jsonb(NEW)-'state'-'receipt')=(to_jsonb(OLD)-'state'-'receipt'))
 OR (OLD.state IN('verified','canceled') AND NOT OLD.acknowledged AND NEW.acknowledged AND (to_jsonb(NEW)-'acknowledged')=(to_jsonb(OLD)-'acknowledged')) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Photo original or one-time permission cannot be replaced';
END $$;
CREATE TRIGGER immutable_photo_request BEFORE UPDATE OR DELETE ON hato_native_photo_upload.requests FOR EACH ROW EXECUTE FUNCTION hato_native_photo_upload.immutable();
CREATE TRIGGER immutable_photo_audit BEFORE UPDATE OR DELETE ON hato_native_photo_upload.audit FOR EACH ROW EXECUTE FUNCTION hato_native_photo_upload.immutable();
CREATE TRIGGER no_truncate_photo_request BEFORE TRUNCATE ON hato_native_photo_upload.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_native_photo_upload.immutable();
CREATE TRIGGER no_truncate_photo_audit BEFORE TRUNCATE ON hato_native_photo_upload.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_native_photo_upload.immutable();
-- Catalog query pins metadata hashes; no private definitions are copied.
CREATE FUNCTION hato_native_photo_upload.baseline() RETURNS text LANGUAGE sql SET search_path=pg_catalog AS $baseline$
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
CREATE FUNCTION hato_native_photo_upload.assert_baseline() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM hato_milk_week.assert_baseline();
 IF hato_native_photo_upload.baseline() IS DISTINCT FROM '70caf16e036f622987b0d5ab24e0a073' THEN RAISE EXCEPTION 'Unreviewed photo/Storage baseline';END IF;
END $$;
SELECT hato_native_photo_upload.assert_baseline();
CREATE TABLE hato_native_photo_upload.actions(sender bigint NOT NULL,chat_id bigint NOT NULL,message_id bigint NOT NULL,request_key uuid NOT NULL UNIQUE,actor jsonb NOT NULL,PRIMARY KEY(sender,chat_id,message_id),CHECK(sender BETWEEN 1 AND 9007199254740991 AND chat_id=sender AND message_id BETWEEN 1 AND 9007199254740991));
ALTER TABLE hato_native_photo_upload.actions ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER immutable_native_action BEFORE UPDATE OR DELETE ON hato_native_photo_upload.actions FOR EACH ROW EXECUTE FUNCTION hato_native_photo_upload.immutable();
CREATE TRIGGER no_truncate_native_action BEFORE TRUNCATE ON hato_native_photo_upload.actions FOR EACH STATEMENT EXECUTE FUNCTION hato_native_photo_upload.immutable();
CREATE FUNCTION hato_native_photo_upload.actor(p_owner uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE b hato_native_photo_upload.actions;actor jsonb;BEGIN
 SELECT * INTO STRICT b FROM hato_native_photo_upload.actions WHERE request_key=nullif(current_setting('escocia.native_photo_key',true),'')::uuid;
 actor=hato_milk_telegram.actor(b.sender,b.chat_id,b.message_id);
 IF actor IS DISTINCT FROM b.actor OR (actor->>'profileId')::uuid IS DISTINCT FROM p_owner THEN RAISE EXCEPTION 'Original native photo actor changed' USING ERRCODE='42501';END IF;
 RETURN actor;
END $$;
CREATE FUNCTION hato_native_photo_upload.controls() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_native_photo_upload.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM hato_native_photo_upload.audit x));
$$;
CREATE FUNCTION hato_native_photo_upload.storage_rows() RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE result jsonb='{}';t record;value jsonb;BEGIN
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='storage' AND c.relkind IN('r','p') ORDER BY c.relname LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),''[]'') FROM storage.%I x',t.relname) INTO value;result=result||jsonb_build_object(t.relname,value);
 END LOOP;RETURN result;
END $$;
-- Preserve controls belonging to every previously installed protocol as well.
CREATE FUNCTION hato_native_photo_upload.other_controls() RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE result jsonb='{}';t record;value jsonb;BEGIN
 FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('public','respaldos','storage','hato_native_photo_upload','information_schema') AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN('r','p') ORDER BY n.nspname,c.relname LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),''[]'') FROM %I.%I x',t.nspname,t.relname) INTO value;result=result||jsonb_build_object(t.nspname||'.'||t.relname,value);
 END LOOP;RETURN result;
END $$;
CREATE FUNCTION hato_native_photo_upload.result(r hato_native_photo_upload.requests,p_permit uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'owner',r.owner_id,'state',r.state,'intent',r.intent,'bucket',r.bucket,'paths',r.paths,'permissionId',r.permission_id,'permit',p_permit,'receipt',r.receipt,'acknowledged',r.acknowledged);
$$;
CREATE FUNCTION hato_native_photo_upload.validate(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f jsonb;i integer=0;BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p)k) IS DISTINCT FROM ARRAY['files','month','version','year'] OR p->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p->'year') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'month') IS DISTINCT FROM 'number' OR (p->>'year')::numeric NOT BETWEEN 2020 AND 2100 OR (p->>'month')::numeric NOT BETWEEN 1 AND 12 OR trunc((p->>'year')::numeric)<>(p->>'year')::numeric OR trunc((p->>'month')::numeric)<>(p->>'month')::numeric OR jsonb_typeof(p->'files') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Exact bounded milk photo manifest required';END IF;
 IF jsonb_array_length(p->'files') NOT BETWEEN 1 AND 6 OR octet_length(p::text)>8192 THEN RAISE EXCEPTION 'Bounded photo manifest required';END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(p->'files') LOOP
  i=i+1;
  IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(f)k) IS DISTINCT FROM ARRAY['extension','mime','page','sha256','size'] OR f->'page' IS DISTINCT FROM to_jsonb(i) OR jsonb_typeof(f->'sha256') IS DISTINCT FROM 'string' OR (f->>'sha256') !~ '^[0-9a-f]{64}$' OR jsonb_typeof(f->'size') IS DISTINCT FROM 'number' OR (f->>'size')::numeric NOT BETWEEN 1 AND 15728640 OR trunc((f->>'size')::numeric)<>(f->>'size')::numeric OR jsonb_typeof(f->'mime') IS DISTINCT FROM 'string' OR jsonb_typeof(f->'extension') IS DISTINCT FROM 'string' OR NOT ((f->>'mime'='image/jpeg' AND f->>'extension'='jpg') OR(f->>'mime'='image/png' AND f->>'extension'='png') OR(f->>'mime'='image/webp' AND f->>'extension'='webp') OR(f->>'mime'='image/heic' AND f->>'extension'='heic') OR(f->>'mime'='image/heif' AND f->>'extension'='heif')) THEN RAISE EXCEPTION 'Canonical ordered actual-byte photo manifest required';END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.fn_hato_native_photo_upload_service(p_action text,p_request_key uuid,p_owner uuid,p_payload jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_native_photo_upload.requests;expected hato_native_photo_upload.requests;written hato_native_photo_upload.requests;before_domain jsonb;expected_domain jsonb;before_storage jsonb;before_foreign jsonb;before_controls jsonb;expected_controls jsonb;a hato_native_photo_upload.audit;wa hato_native_photo_upload.audit;old_value jsonb;permit uuid;f jsonb;ob jsonb;object_row jsonb;bucket_row jsonb;paths jsonb='[]';objects jsonb='[]';capture public.hato_capturas_foto;capture_written jsonb;receipt_value jsonb;i integer;
BEGIN
 IF auth.uid() IS NOT NULL OR p_owner IS NULL OR p_request_key IS NULL THEN RAISE EXCEPTION 'Trusted server owner and original key required' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('reserve','claim','observe','status','cancel','acknowledge') OR (p_action NOT IN('reserve','observe') AND p_payload IS NOT NULL) THEN RAISE EXCEPTION 'Exact photo action required';END IF;
 actor=hato_native_photo_upload.actor(p_owner);
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-photo-owner:'||p_owner::text,0));
 PERFORM hato_birth_undo.lock_domain();LOCK TABLE hato_native_photo_upload.requests,hato_native_photo_upload.audit IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE storage.buckets,storage.objects IN SHARE ROW EXCLUSIVE MODE;
 PERFORM hato_native_photo_upload.assert_baseline();
 SELECT * INTO r FROM hato_native_photo_upload.requests WHERE request_key=p_request_key FOR UPDATE;
 IF FOUND AND r.owner_id IS DISTINCT FROM p_owner THEN RAISE EXCEPTION 'Photo original owner changed' USING ERRCODE='42501';END IF;
 IF p_action='status' THEN
  IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_owner;r.state='unknown';r.acknowledged=false;END IF;
  RETURN hato_native_photo_upload.result(r);
 END IF;
 before_domain=hato_birth_undo.capture_domain();expected_domain=before_domain;before_storage=hato_native_photo_upload.storage_rows();before_foreign=hato_native_photo_upload.other_controls();before_controls=hato_native_photo_upload.controls();expected_controls=before_controls;old_value=CASE WHEN r.request_key IS NULL THEN NULL ELSE to_jsonb(r) END;
 IF p_action='reserve' THEN
  PERFORM hato_native_photo_upload.validate(p_payload);
  IF r.request_key IS NOT NULL THEN IF r.intent IS NOT NULL AND r.intent IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'Original photo manifest changed';END IF;RETURN hato_native_photo_upload.result(r);END IF;
  IF EXISTS(SELECT 1 FROM hato_native_photo_upload.requests WHERE owner_id=p_owner AND state<>'canceled' AND NOT acknowledged) THEN RAISE EXCEPTION 'Recover original photo before replacement';END IF;
  SELECT to_jsonb(b) INTO bucket_row FROM storage.buckets b WHERE id='hato-pesajes-fotos';
  IF bucket_row IS NULL OR bucket_row->'public' IS DISTINCT FROM 'false'::jsonb OR bucket_row->>'type'<>'STANDARD' THEN RAISE EXCEPTION 'Existing private standard milk bucket required';END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(p_payload->'files') LOOP paths=paths||jsonb_build_array('verified-milk-native/'||p_owner::text||'/'||p_request_key::text||'/page-'||(f->>'page')||'.'||(f->>'extension'));END LOOP;
  IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='hato-pesajes-fotos' AND name IN(SELECT jsonb_array_elements_text(paths))) OR EXISTS(SELECT 1 FROM public.hato_capturas_foto c WHERE c.id=p_request_key OR (c.storage_bucket='hato-pesajes-fotos' AND c.storage_rutas && ARRAY(SELECT jsonb_array_elements_text(paths)))) THEN RAISE EXCEPTION 'Prospective photo identity already claimed';END IF;
  r.request_key=p_request_key;r.owner_id=p_owner;r.intent=p_payload;r.bucket=bucket_row;r.paths=paths;r.state='reserved';r.acknowledged=false;
 ELSIF p_action='cancel' THEN
  IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_owner;r.state='canceled';r.acknowledged=false;
  ELSIF r.state='reserved' THEN r.state='canceled';
  ELSIF r.state IN('held','verified') THEN RAISE EXCEPTION 'Issued photo permission cannot be canceled or replaced';
  ELSE RETURN hato_native_photo_upload.result(r);END IF;
 ELSIF p_action='claim' THEN
  IF r.state IS NULL THEN RAISE EXCEPTION 'Original reserved photo required';END IF;
  IF r.state<>'reserved' THEN RETURN hato_native_photo_upload.result(r);END IF;
  SELECT to_jsonb(b) INTO bucket_row FROM storage.buckets b WHERE id='hato-pesajes-fotos';
  IF bucket_row IS DISTINCT FROM r.bucket OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='hato-pesajes-fotos' AND name IN(SELECT jsonb_array_elements_text(r.paths))) OR EXISTS(SELECT 1 FROM public.hato_capturas_foto c WHERE c.id=r.request_key OR (c.storage_bucket='hato-pesajes-fotos' AND c.storage_rutas && ARRAY(SELECT jsonb_array_elements_text(r.paths)))) THEN RAISE EXCEPTION 'Original photo source changed before permission';END IF;
  r.state='held';r.permission_id=gen_random_uuid();permit=r.permission_id;
 ELSIF p_action='acknowledge' THEN
  IF r.state IS NULL OR r.state NOT IN('verified','canceled') THEN RAISE EXCEPTION 'Verified terminal photo required';END IF;
  IF r.acknowledged THEN RETURN hato_native_photo_upload.result(r);END IF;r.acknowledged=true;
 ELSIF p_action='observe' THEN
  IF r.state='verified' THEN RETURN hato_native_photo_upload.result(r);END IF;
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
  capture.id=r.request_key;capture.creado_en=now();capture.actualizado_en=now();capture.tipo='pesaje';capture.origen='telegram';capture.desenlace='pendiente';capture.anio=(r.intent->>'year')::int;capture.mes=(r.intent->>'month')::int;capture.storage_bucket='hato-pesajes-fotos';capture.storage_prefijo='verified-milk-native/'||p_owner::text||'/'||r.request_key::text;capture.storage_rutas=ARRAY(SELECT jsonb_array_elements_text(r.paths));capture.storage_ok=true;capture.fotos_recibidas=jsonb_array_length(r.paths);capture.created_by=p_owner;
  INSERT INTO public.hato_capturas_foto SELECT capture.* RETURNING to_jsonb(hato_capturas_foto.*) INTO capture_written;
  IF NOT FOUND OR capture_written IS DISTINCT FROM to_jsonb(capture) THEN RAISE EXCEPTION 'Photo capture suppressed/mutated';END IF;
  expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_capturas_foto','[]',jsonb_build_array(capture_written));
  receipt_value=jsonb_build_object('version',1,'requestKey',r.request_key,'owner',r.owner_id,'actor',actor,'recordedAt',now(),'intent',r.intent,'bucket',r.bucket,'paths',r.paths,'permissionId',r.permission_id,'objects',objects,'capture',capture_written);
  r.state='verified';r.receipt=receipt_value;
 END IF;
 expected=r;
 IF old_value IS NULL THEN INSERT INTO hato_native_photo_upload.requests SELECT expected.* RETURNING * INTO written;
 ELSE UPDATE hato_native_photo_upload.requests SET state=expected.state,permission_id=expected.permission_id,receipt=expected.receipt,acknowledged=expected.acknowledged WHERE request_key=p_request_key RETURNING * INTO written;END IF;
 IF NOT FOUND OR to_jsonb(written) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Photo control suppressed/mutated';END IF;
 a.id=gen_random_uuid();a.request_key=p_request_key;a.action=p_action;a.actor=actor;a.recorded_at=now();a.before_value=old_value;a.after_value=to_jsonb(expected);
 INSERT INTO hato_native_photo_upload.audit SELECT a.* RETURNING * INTO wa;
 IF NOT FOUND OR to_jsonb(wa) IS DISTINCT FROM to_jsonb(a) THEN RAISE EXCEPTION 'Trusted photo audit suppressed/mutated';END IF;
 expected_controls=jsonb_set(expected_controls,'{requests}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(before_controls->'requests')x WHERE x->>'request_key'<>p_request_key::text)||jsonb_build_array(to_jsonb(expected)))x));
 expected_controls=jsonb_set(expected_controls,'{audit}',(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements((before_controls->'audit')||jsonb_build_array(to_jsonb(a)))x));
 PERFORM hato_native_photo_upload.assert_baseline();
 IF hato_native_photo_upload.controls() IS DISTINCT FROM expected_controls OR hato_birth_undo.capture_domain() IS DISTINCT FROM expected_domain OR hato_native_photo_upload.storage_rows() IS DISTINCT FROM before_storage OR hato_native_photo_upload.other_controls() IS DISTINCT FROM before_foreign OR hato_native_photo_upload.actor(p_owner) IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Photo final domain/Storage/control/authority mismatch';END IF;
 RETURN hato_native_photo_upload.result(expected,permit);
END $$;
CREATE FUNCTION public.fn_hato_native_photo_upload_inspect_service(p_request_key uuid,p_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_native_photo_upload.requests;objects jsonb;bucket jsonb;before_domain jsonb;before_storage jsonb;before_controls jsonb;before_foreign jsonb;BEGIN
 IF auth.uid() IS NOT NULL OR p_owner IS NULL OR p_request_key IS NULL THEN RAISE EXCEPTION 'Trusted original photo inspector required' USING ERRCODE='42501';END IF;
 actor=hato_native_photo_upload.actor(p_owner);
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-photo-owner:'||p_owner::text,0));
 PERFORM hato_birth_undo.lock_domain();LOCK TABLE hato_native_photo_upload.requests,hato_native_photo_upload.audit IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE storage.buckets,storage.objects IN SHARE ROW EXCLUSIVE MODE;
 PERFORM hato_native_photo_upload.assert_observer_baseline();
 SELECT * INTO r FROM hato_native_photo_upload.requests WHERE request_key=p_request_key FOR SHARE;
 IF NOT FOUND OR r.owner_id IS DISTINCT FROM p_owner OR r.state NOT IN('held','verified') THEN RAISE EXCEPTION 'Original held/verified owner-bound photo required' USING ERRCODE='42501';END IF;
 before_domain=hato_birth_undo.capture_domain();before_storage=hato_native_photo_upload.storage_rows();before_controls=hato_native_photo_upload.controls();before_foreign=hato_native_photo_upload.other_controls();
 SELECT to_jsonb(b) INTO bucket FROM storage.buckets b WHERE id='hato-pesajes-fotos';
 IF bucket IS DISTINCT FROM r.bucket THEN RAISE EXCEPTION 'Original photo bucket changed';END IF;
 SELECT jsonb_agg(jsonb_build_object('page',p.ordinality,'row',(SELECT to_jsonb(o) FROM storage.objects o WHERE o.bucket_id='hato-pesajes-fotos' AND o.name=p.path)) ORDER BY p.ordinality) INTO objects FROM jsonb_array_elements_text(r.paths) WITH ORDINALITY p(path,ordinality);
 IF hato_birth_undo.capture_domain() IS DISTINCT FROM before_domain OR hato_native_photo_upload.storage_rows() IS DISTINCT FROM before_storage OR hato_native_photo_upload.controls() IS DISTINCT FROM before_controls OR hato_native_photo_upload.other_controls() IS DISTINCT FROM before_foreign OR hato_native_photo_upload.actor(p_owner) IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Photo inspection changed authority or state';END IF;
 RETURN jsonb_build_object('version',1,'original',hato_native_photo_upload.result(r),'bucket',bucket,'objects',objects);
END $$;
CREATE SCHEMA hato_native_photo_preview;
REVOKE ALL ON SCHEMA hato_native_photo_preview FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_native_photo_preview.requests(request_key uuid PRIMARY KEY REFERENCES hato_native_photo_upload.requests,owner_id uuid NOT NULL,permission_id uuid NOT NULL UNIQUE,actor jsonb NOT NULL,claimed_at timestamptz NOT NULL,source jsonb NOT NULL,capture_before jsonb NOT NULL,state text NOT NULL CHECK(state IN('held','ready')),outcome jsonb,capture_after jsonb,receipt jsonb,CHECK((state='ready')=(outcome IS NOT NULL AND capture_after IS NOT NULL AND receipt IS NOT NULL)));
CREATE TABLE hato_native_photo_preview.audit(request_key uuid PRIMARY KEY REFERENCES hato_native_photo_preview.requests,receipt jsonb NOT NULL);
ALTER TABLE hato_native_photo_preview.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_native_photo_preview.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_native_photo_preview FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_native_photo_preview.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='UPDATE' AND TG_TABLE_NAME='requests' AND OLD.state='held' AND NEW.state='ready' AND(to_jsonb(NEW)-'state'-'outcome'-'capture_after'-'receipt')=(to_jsonb(OLD)-'state'-'outcome'-'capture_after'-'receipt') THEN RETURN NEW;END IF;RAISE EXCEPTION 'Immutable original photo OCR proof';
END $$;
CREATE TRIGGER immutable_preview_request BEFORE UPDATE OR DELETE ON hato_native_photo_preview.requests FOR EACH ROW EXECUTE FUNCTION hato_native_photo_preview.immutable();
CREATE TRIGGER immutable_preview_audit BEFORE UPDATE OR DELETE ON hato_native_photo_preview.audit FOR EACH ROW EXECUTE FUNCTION hato_native_photo_preview.immutable();
CREATE TRIGGER no_truncate_preview_request BEFORE TRUNCATE ON hato_native_photo_preview.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_native_photo_preview.immutable();
CREATE TRIGGER no_truncate_preview_audit BEFORE TRUNCATE ON hato_native_photo_preview.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_native_photo_preview.immutable();
CREATE FUNCTION hato_native_photo_preview.controls() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
SELECT jsonb_build_object('requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_native_photo_preview.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_native_photo_preview.audit x));
$$;
CREATE FUNCTION hato_native_photo_preview.source() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
SELECT jsonb_build_object('rows',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_pesajes_leche x),'animals',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_animales x),'config',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY clave),'[]') FROM public.hato_config x));
$$;
CREATE FUNCTION hato_native_photo_preview.result(r hato_native_photo_upload.requests,q hato_native_photo_preview.requests,p_permit uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
SELECT jsonb_build_object('version',1,'upload',hato_native_photo_upload.result(r),'preview',CASE WHEN q.request_key IS NULL THEN NULL ELSE to_jsonb(q) END,'permit',p_permit);
$$;
CREATE FUNCTION public.fn_hato_native_photo_preview_service(p_action text,p_request_key uuid,p_owner uuid,p_payload jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r hato_native_photo_upload.requests;q hato_native_photo_preview.requests;expected hato_native_photo_preview.requests;written hato_native_photo_preview.requests;actor jsonb;permit uuid;before_domain jsonb;expected_domain jsonb;before_storage jsonb;parent_controls jsonb;before_controls jsonb;expected_controls jsonb;prior_foreign jsonb;after_foreign jsonb;capture jsonb;capture_after jsonb;row_written jsonb;outcome jsonb;receipt_value jsonb;a hato_native_photo_preview.audit;wa hato_native_photo_preview.audit;object jsonb;current_object jsonb;BEGIN
 IF auth.uid() IS NOT NULL OR p_owner IS NULL OR (p_action<>'recover' AND p_request_key IS NULL) THEN RAISE EXCEPTION 'Trusted original photo preview owner/key required' USING ERRCODE='42501';END IF;
 IF p_action IS NULL OR p_action NOT IN('recover','status','claim','record','acknowledge','cancel') OR(p_action<>'record' AND p_payload IS NOT NULL) THEN RAISE EXCEPTION 'Exact photo preview action required';END IF;
 actor=hato_native_photo_upload.actor(p_owner);PERFORM pg_advisory_xact_lock(hashtextextended('hato-photo-owner:'||p_owner::text,0));PERFORM hato_birth_undo.lock_domain();
 LOCK TABLE hato_native_photo_upload.requests,hato_native_photo_upload.audit,hato_native_photo_preview.requests,hato_native_photo_preview.audit IN SHARE ROW EXCLUSIVE MODE;LOCK TABLE storage.buckets,storage.objects IN SHARE ROW EXCLUSIVE MODE;
 PERFORM hato_native_photo_upload.assert_observer_baseline();
 IF p_action='recover' THEN SELECT * INTO r FROM hato_native_photo_upload.requests WHERE owner_id=p_owner AND NOT acknowledged AND state<>'canceled';IF NOT FOUND THEN RETURN NULL;END IF;
 ELSE SELECT * INTO r FROM hato_native_photo_upload.requests WHERE request_key=p_request_key;END IF;
 IF r.request_key IS NOT NULL AND r.owner_id IS DISTINCT FROM p_owner THEN RAISE EXCEPTION 'Original preview owner changed' USING ERRCODE='42501';END IF;
 IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_owner;r.state='unknown';r.acknowledged=false;END IF;
 SELECT * INTO q FROM hato_native_photo_preview.requests WHERE request_key=r.request_key;
 IF q.request_key IS NOT NULL AND(q.owner_id<>p_owner OR(q.state='ready' AND NOT EXISTS(SELECT 1 FROM hato_native_photo_preview.audit WHERE request_key=q.request_key AND receipt=q.receipt))) THEN RAISE EXCEPTION 'Original photo preview proof missing';END IF;
 IF p_action IN('recover','status') THEN RETURN hato_native_photo_preview.result(r,q);END IF;
 IF p_action='cancel' THEN
  IF q.request_key IS NOT NULL THEN RAISE EXCEPTION 'Issued OCR claim cannot be canceled';END IF;
  PERFORM public.fn_hato_native_photo_upload_service('cancel',r.request_key,p_owner,NULL);SELECT * INTO r FROM hato_native_photo_upload.requests WHERE request_key=r.request_key;RETURN hato_native_photo_preview.result(r,q);
 END IF;
 IF p_action='acknowledge' THEN
  IF q.state IS DISTINCT FROM 'ready' THEN RAISE EXCEPTION 'Verify retained terminal preview first';END IF;
  PERFORM public.fn_hato_native_photo_upload_service('acknowledge',r.request_key,p_owner,NULL);SELECT * INTO r FROM hato_native_photo_upload.requests WHERE request_key=r.request_key;RETURN hato_native_photo_preview.result(r,q);
 END IF;
 IF r.state<>'verified' OR r.acknowledged THEN RAISE EXCEPTION 'Unacknowledged verified original photo required';END IF;
 IF p_action='claim' AND q.request_key IS NOT NULL THEN RETURN hato_native_photo_preview.result(r,q);END IF;
 IF p_action='record' AND q.state='ready' THEN
  IF p_payload IS NULL OR p_payload->'outcome' IS DISTINCT FROM q.outcome OR p_payload->>'permissionId' IS DISTINCT FROM q.permission_id::text THEN RAISE EXCEPTION 'Retained original OCR outcome cannot change';END IF;RETURN hato_native_photo_preview.result(r,q);
 END IF;
 SELECT to_jsonb(c) INTO capture FROM public.hato_capturas_foto c WHERE id=r.request_key;
 IF capture IS DISTINCT FROM r.receipt->'capture' THEN RAISE EXCEPTION 'Original verified capture changed before OCR outcome';END IF;
 IF(SELECT to_jsonb(b) FROM storage.buckets b WHERE id='hato-pesajes-fotos') IS DISTINCT FROM r.bucket THEN RAISE EXCEPTION 'Original OCR bucket changed';END IF;
 FOR object IN SELECT value FROM jsonb_array_elements(r.receipt->'objects') LOOP SELECT to_jsonb(o) INTO current_object FROM storage.objects o WHERE id=(object->'row'->>'id')::uuid;IF current_object IS DISTINCT FROM object->'row' THEN RAISE EXCEPTION 'Original OCR object changed';END IF;END LOOP;
 before_domain=hato_birth_undo.capture_domain();expected_domain=before_domain;before_storage=hato_native_photo_upload.storage_rows();parent_controls=hato_native_photo_upload.controls();before_controls=hato_native_photo_preview.controls();expected_controls=before_controls;prior_foreign=hato_native_photo_upload.other_controls()-'hato_native_photo_preview.requests'-'hato_native_photo_preview.audit';
 IF p_action='claim' THEN
  q.request_key=r.request_key;q.owner_id=p_owner;q.permission_id=gen_random_uuid();q.actor=actor;q.claimed_at=now();q.source=hato_native_photo_preview.source();q.capture_before=capture;q.state='held';expected=q;
  INSERT INTO hato_native_photo_preview.requests SELECT expected.* RETURNING * INTO written;permit=q.permission_id;
 ELSE
  IF q.state IS DISTINCT FROM 'held' OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_payload)k) IS DISTINCT FROM ARRAY['outcome','permissionId'] OR p_payload->>'permissionId' IS DISTINCT FROM q.permission_id::text OR hato_native_photo_preview.source() IS DISTINCT FROM q.source OR capture IS DISTINCT FROM q.capture_before THEN RAISE EXCEPTION 'Original OCR claim/source changed';END IF;
  outcome=p_payload->'outcome';
  IF octet_length(outcome::text)>2097152 OR jsonb_typeof(outcome) IS DISTINCT FROM 'object' OR jsonb_typeof(outcome->'ok') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Bounded known OCR outcome required';END IF;
  IF(outcome->>'ok')::boolean THEN
   IF(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(outcome)k) IS DISTINCT FROM ARRAY['ok','resultado'] OR jsonb_typeof(outcome->'resultado') IS DISTINCT FROM 'object' OR outcome->'resultado'->>'capturaId' IS DISTINCT FROM r.request_key::text OR outcome->'resultado'->'anio' IS DISTINCT FROM r.intent->'year' OR outcome->'resultado'->'mes' IS DISTINCT FROM r.intent->'month' OR jsonb_typeof(outcome->'resultado'->'diff') IS DISTINCT FROM 'array' OR jsonb_typeof(outcome->'resultado'->'ocr') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Original photo/period preview binding required';END IF;
   capture_after=capture||jsonb_build_object('actualizado_en',now(),'modelo',outcome->'resultado'->'ocr'->>'modelo','celdas_leidas_ocr',(SELECT count(*) FROM jsonb_array_elements(outcome->'resultado'->'diff')d WHERE d->'litrosAm'<>'null'::jsonb OR d->'litrosPm'<>'null'::jsonb));
  ELSE
   IF(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(outcome)k) IS DISTINCT FROM ARRAY['error','ok','status'] OR outcome->'status' NOT IN('422','500','502') OR jsonb_typeof(outcome->'error') IS DISTINCT FROM 'string' OR length(outcome->>'error') NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Known bounded OCR rejection required';END IF;
   capture_after=capture||jsonb_build_object('actualizado_en',now(),'desenlace',CASE WHEN outcome->'status'='500' THEN 'error' ELSE 'ocr_fallo' END,'detalle',outcome->>'error');
  END IF;
  UPDATE public.hato_capturas_foto SET actualizado_en=now(),modelo=capture_after->>'modelo',celdas_leidas_ocr=(capture_after->>'celdas_leidas_ocr')::int,desenlace=capture_after->>'desenlace',detalle=capture_after->>'detalle' WHERE id=r.request_key RETURNING to_jsonb(hato_capturas_foto.*) INTO row_written;
  IF NOT FOUND OR row_written IS DISTINCT FROM capture_after THEN RAISE EXCEPTION 'OCR capture outcome suppressed/mutated';END IF;
  expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_capturas_foto',jsonb_build_array(capture),jsonb_build_array(capture_after));
  receipt_value=jsonb_build_object('version',1,'requestKey',r.request_key,'owner',p_owner,'permissionId',q.permission_id,'actor',actor,'recordedAt',now(),'source',q.source,'outcome',outcome,'captureBefore',capture,'captureAfter',capture_after);
  a.request_key=r.request_key;a.receipt=receipt_value;INSERT INTO hato_native_photo_preview.audit SELECT a.* RETURNING * INTO wa;IF NOT FOUND OR to_jsonb(wa) IS DISTINCT FROM to_jsonb(a) THEN RAISE EXCEPTION 'OCR audit suppressed/mutated';END IF;
  expected=q;expected.state='ready';expected.outcome=outcome;expected.capture_after=capture_after;expected.receipt=receipt_value;
  UPDATE hato_native_photo_preview.requests SET state='ready',outcome=expected.outcome,capture_after=expected.capture_after,receipt=expected.receipt WHERE request_key=q.request_key RETURNING * INTO written;
  expected_controls=jsonb_set(expected_controls,'{audit}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((before_controls->'audit')||jsonb_build_array(to_jsonb(a)))x));
 END IF;
 IF NOT FOUND OR to_jsonb(written) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'OCR claim/control suppressed/mutated';END IF;
 expected_controls=jsonb_set(expected_controls,'{requests}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(before_controls->'requests')x WHERE x->>'request_key'<>r.request_key::text)||jsonb_build_array(to_jsonb(expected)))x));
 after_foreign=hato_native_photo_upload.other_controls()-'hato_native_photo_preview.requests'-'hato_native_photo_preview.audit';PERFORM hato_native_photo_upload.assert_observer_baseline();
 IF hato_native_photo_preview.controls() IS DISTINCT FROM expected_controls OR hato_birth_undo.capture_domain() IS DISTINCT FROM expected_domain OR hato_native_photo_upload.storage_rows() IS DISTINCT FROM before_storage OR hato_native_photo_upload.controls() IS DISTINCT FROM parent_controls OR prior_foreign IS DISTINCT FROM after_foreign OR actor IS DISTINCT FROM hato_native_photo_upload.actor(p_owner) THEN RAISE EXCEPTION 'OCR final domain/Storage/control/authority mismatch';END IF;
 RETURN hato_native_photo_preview.result(r,expected,permit);
END $$;
CREATE FUNCTION hato_native_photo_upload.assert_observer_baseline() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE f record;BEGIN
 PERFORM hato_photo_upload.assert_observer_baseline();PERFORM hato_native_photo_upload.assert_baseline();
 FOR f IN SELECT * FROM(VALUES
('hato_native_photo_upload.immutable()','d966dfa7162790dee21c58b20333849b',false),
('hato_native_photo_upload.baseline()','62ab7a509bd6629558d56aebc4bb2a77',false),
('hato_native_photo_upload.assert_baseline()','e80dfd0edfc1b110e34d0c79e37c426e',false),
('hato_native_photo_upload.actor(uuid)','b51dca3e2e6d28e3c4f2d3eecfe6b16f',false),
('hato_native_photo_upload.controls()','94f8abdd80170b98ca43da5c03544d13',false),
('hato_native_photo_upload.storage_rows()','46db6bef292e64bc82cd2dff4b4f302c',false),
('hato_native_photo_upload.other_controls()','22bd79d38f029517545ee8b0d4b6c8fe',false),
('hato_native_photo_upload.result(hato_native_photo_upload.requests,uuid)','d7eecd63d4a4d88de37d483e90b46e9a',false),
('hato_native_photo_upload.validate(jsonb)','3094c7514adbeeaf3079270a055803b1',false),
('public.fn_hato_native_photo_upload_service(text,uuid,uuid,jsonb)','02c216cc09c6855755924a00ee07e1d7',true),
('public.fn_hato_native_photo_upload_inspect_service(uuid,uuid)','462ee73dcacec2b8c3bc5d866b68a9f7',true),
('hato_native_photo_preview.immutable()','3aab8f3f90fcff21d583ff8c39344088',false),
('hato_native_photo_preview.controls()','5f362aa4e2a0cf482888f16e35b47a7d',false),
('hato_native_photo_preview.source()','73f1ee19eba48fd09731d0a081a0f15a',false),
('hato_native_photo_preview.result(hato_native_photo_upload.requests,hato_native_photo_preview.requests,uuid)','7c652df9efacaacff99ffb2ae3496cd2',false),
('public.fn_hato_native_photo_preview_service(text,uuid,uuid,jsonb)','c6a414fabdd6b828adb609182ded3e03',true)) pin(signature,body,secdef) LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(f.signature) AND md5(p.prosrc)=f.body AND p.prosecdef=f.secdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed native photo core: %',f.signature;END IF;
 IF has_function_privilege('anon',f.signature,'EXECUTE') OR has_function_privilege('authenticated',f.signature,'EXECUTE') OR has_function_privilege('service_role',f.signature,'EXECUTE') THEN RAISE EXCEPTION 'Native core must remain private';END IF;
 END LOOP;
END $$;

CREATE FUNCTION public.fn_hato_photo_telegram(p_channel text,p_action text,p_sender bigint,p_chat_id bigint,p_message_id bigint,p_payload jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;b hato_native_photo_upload.actions;written hato_native_photo_upload.actions;value jsonb;owner uuid;before_bindings jsonb;before_domain jsonb;before_storage jsonb;before_controls jsonb;before_foreign jsonb;BEGIN
 actor=hato_milk_telegram.actor(p_sender,p_chat_id,p_message_id);owner=(actor->>'profileId')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-photo-owner:'||owner::text,0));PERFORM hato_birth_undo.lock_domain();
 LOCK TABLE hato_native_photo_upload.actions IN SHARE ROW EXCLUSIVE MODE;
 PERFORM hato_native_photo_upload.assert_observer_baseline();
 IF p_channel='recover' AND p_action='status' AND p_payload IS NULL THEN
 SELECT a.* INTO b FROM hato_native_photo_upload.actions a JOIN hato_native_photo_upload.requests r USING(request_key) WHERE r.owner_id=owner AND NOT r.acknowledged AND r.state<>'canceled';
 ELSE SELECT * INTO b FROM hato_native_photo_upload.actions WHERE sender=p_sender AND chat_id=p_chat_id AND message_id=p_message_id;END IF;
 IF b.request_key IS NULL THEN
 IF p_channel='upload' AND p_action IN('reserve','cancel') THEN
 before_domain=hato_birth_undo.capture_domain();before_storage=hato_native_photo_upload.storage_rows();before_controls=hato_native_photo_upload.controls();before_foreign=hato_native_photo_upload.other_controls();SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY sender,chat_id,message_id),'[]') INTO before_bindings FROM hato_native_photo_upload.actions x;
 b.sender=p_sender;b.chat_id=p_chat_id;b.message_id=p_message_id;b.request_key=gen_random_uuid();b.actor=actor;
 INSERT INTO hato_native_photo_upload.actions SELECT b.* RETURNING * INTO written;
 IF NOT FOUND OR to_jsonb(written) IS DISTINCT FROM to_jsonb(b) OR before_domain IS DISTINCT FROM hato_birth_undo.capture_domain() OR before_storage IS DISTINCT FROM hato_native_photo_upload.storage_rows() OR before_controls IS DISTINCT FROM hato_native_photo_upload.controls() OR before_foreign IS DISTINCT FROM hato_native_photo_upload.other_controls() OR (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY sender,chat_id,message_id),'[]') FROM hato_native_photo_upload.actions x WHERE request_key<>b.request_key) IS DISTINCT FROM before_bindings THEN RAISE EXCEPTION 'Native binding suppressed/mutated';END IF;
 ELSE IF p_payload IS NOT NULL OR p_action<>'status' OR p_channel NOT IN('recover','preview') THEN RAISE EXCEPTION 'Original native binding required';END IF;RETURN jsonb_build_object('version',1,'actor',actor,'action',jsonb_build_object('sender',p_sender,'chatId',p_chat_id,'messageId',p_message_id),'requestKey',NULL,'result',NULL);END IF;
 END IF;
 IF b.actor IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Original native mapping changed';END IF;
 PERFORM set_config('escocia.native_photo_key',b.request_key::text,true);
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY sender,chat_id,message_id),'[]') INTO before_bindings FROM hato_native_photo_upload.actions x;
 IF p_channel='upload' THEN value=public.fn_hato_native_photo_upload_service(p_action,b.request_key,owner,p_payload);
 ELSIF p_channel='inspect' AND p_action='status' AND p_payload IS NULL THEN value=public.fn_hato_native_photo_upload_inspect_service(b.request_key,owner);
 ELSIF p_channel IN('preview','recover') THEN IF p_channel='recover' THEN p_action='status';END IF;value=public.fn_hato_native_photo_preview_service(p_action,b.request_key,owner,p_payload);
 ELSE RAISE EXCEPTION 'Exact native photo channel required';END IF;
 IF actor IS DISTINCT FROM hato_native_photo_upload.actor(owner) OR before_bindings IS DISTINCT FROM(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY sender,chat_id,message_id),'[]') FROM hato_native_photo_upload.actions x) THEN RAISE EXCEPTION 'Native photo actor/binding changed';END IF;
 RETURN jsonb_build_object('version',1,'actor',actor,'action',jsonb_build_object('sender',b.sender,'chatId',b.chat_id,'messageId',b.message_id),'requestKey',b.request_key,'result',value);
END $$;
-- Both insertion lanes refuse a competing unresolved original, including browser/native overlap.
CREATE FUNCTION hato_native_photo_upload.guard_owner() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-photo-owner:'||NEW.owner_id::text,0));
 IF TG_TABLE_SCHEMA='hato_photo_upload' THEN
 IF EXISTS(SELECT 1 FROM hato_native_photo_upload.requests WHERE owner_id=NEW.owner_id AND NOT acknowledged AND state<>'canceled') THEN RAISE EXCEPTION 'Recover original native photo';END IF;
 ELSE IF EXISTS(SELECT 1 FROM hato_photo_upload.requests WHERE owner_id=NEW.owner_id AND NOT acknowledged AND state<>'canceled') THEN RAISE EXCEPTION 'Recover original browser photo';END IF;END IF;RETURN NEW;
END $$;
CREATE TRIGGER cross_lane_original BEFORE INSERT ON hato_photo_upload.requests FOR EACH ROW EXECUTE FUNCTION hato_native_photo_upload.guard_owner();
CREATE TRIGGER cross_lane_original BEFORE INSERT ON hato_native_photo_upload.requests FOR EACH ROW EXECUTE FUNCTION hato_native_photo_upload.guard_owner();
REVOKE ALL ON ALL TABLES IN SCHEMA hato_native_photo_upload,hato_native_photo_preview FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_native_photo_upload,hato_native_photo_preview FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_native_photo_upload_service(text,uuid,uuid,jsonb),public.fn_hato_native_photo_upload_inspect_service(uuid,uuid),public.fn_hato_native_photo_preview_service(text,uuid,uuid,jsonb),public.fn_hato_photo_telegram(text,text,bigint,bigint,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_photo_telegram(text,text,bigint,bigint,bigint,jsonb) TO service_role;
SELECT hato_native_photo_upload.assert_observer_baseline();
COMMIT;
