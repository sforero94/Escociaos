-- LOCAL REVIEW ONLY. Requires authorized owner-switching installer; no new role membership.
BEGIN;
SET LOCAL ROLE postgres;
SET LOCAL search_path=pg_catalog;
SELECT hato_birth_undo.lock_domain();
DO $admit$ BEGIN
IF md5(pg_get_functiondef('hato_income_metadata.assert_baseline()'::regprocedure)) IS DISTINCT FROM '4ba9d8a7f64e8cd867110ef51040484d' THEN RAISE EXCEPTION 'Unreviewed original invoice dependency';END IF;
IF (SELECT md5(jsonb_build_array(pg_get_userbyid(p.proowner),p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proparallel,p.proleakproof,p.proisstrict)::text) FROM pg_proc p WHERE p.oid='hato_income_metadata.assert_baseline()'::regprocedure) IS DISTINCT FROM '746f03c46998c9dc2f2d63c62a5fc2d0' THEN RAISE EXCEPTION 'Unreviewed original invoice dependency authority';END IF;
IF md5(pg_get_functiondef('hato_native_photo_upload.assert_baseline()'::regprocedure)) IS DISTINCT FROM 'f5932174fd2b44536d652e3884af0546' THEN RAISE EXCEPTION 'Unreviewed original invoice dependency';END IF;
IF (SELECT md5(jsonb_build_array(pg_get_userbyid(p.proowner),p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proparallel,p.proleakproof,p.proisstrict)::text) FROM pg_proc p WHERE p.oid='hato_native_photo_upload.assert_baseline()'::regprocedure) IS DISTINCT FROM '746f03c46998c9dc2f2d63c62a5fc2d0' THEN RAISE EXCEPTION 'Unreviewed original invoice dependency authority';END IF;
IF md5(pg_get_functiondef('hato_native_photo_upload.assert_observer_baseline()'::regprocedure)) IS DISTINCT FROM 'bc47bfef94c5520e14b11b420e55bed2' THEN RAISE EXCEPTION 'Unreviewed original invoice dependency';END IF;
IF (SELECT md5(jsonb_build_array(pg_get_userbyid(p.proowner),p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proparallel,p.proleakproof,p.proisstrict)::text) FROM pg_proc p WHERE p.oid='hato_native_photo_upload.assert_observer_baseline()'::regprocedure) IS DISTINCT FROM '746f03c46998c9dc2f2d63c62a5fc2d0' THEN RAISE EXCEPTION 'Unreviewed original invoice dependency authority';END IF;
IF md5(pg_get_functiondef('hato_photo_upload.assert_baseline()'::regprocedure)) IS DISTINCT FROM '22865b8a57d8b90ff0373a01de842261' THEN RAISE EXCEPTION 'Unreviewed original invoice dependency';END IF;
IF (SELECT md5(jsonb_build_array(pg_get_userbyid(p.proowner),p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proparallel,p.proleakproof,p.proisstrict)::text) FROM pg_proc p WHERE p.oid='hato_photo_upload.assert_baseline()'::regprocedure) IS DISTINCT FROM '746f03c46998c9dc2f2d63c62a5fc2d0' THEN RAISE EXCEPTION 'Unreviewed original invoice dependency authority';END IF;
IF md5(pg_get_functiondef('hato_photo_upload.assert_observer_baseline()'::regprocedure)) IS DISTINCT FROM '13fe85ebc3284871d1a9d5278885609b' THEN RAISE EXCEPTION 'Unreviewed original invoice dependency';END IF;
IF (SELECT md5(jsonb_build_array(pg_get_userbyid(p.proowner),p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proparallel,p.proleakproof,p.proisstrict)::text) FROM pg_proc p WHERE p.oid='hato_photo_upload.assert_observer_baseline()'::regprocedure) IS DISTINCT FROM '746f03c46998c9dc2f2d63c62a5fc2d0' THEN RAISE EXCEPTION 'Unreviewed original invoice dependency authority';END IF;
IF md5(pg_get_functiondef('hato_quincena.assert_baseline()'::regprocedure)) IS DISTINCT FROM '422cc06822a193650e110ed7f3540bfd' THEN RAISE EXCEPTION 'Unreviewed original invoice dependency';END IF;
IF (SELECT md5(jsonb_build_array(pg_get_userbyid(p.proowner),p.proacl,p.proconfig,p.prosecdef,p.provolatile,p.proparallel,p.proleakproof,p.proisstrict)::text) FROM pg_proc p WHERE p.oid='hato_quincena.assert_baseline()'::regprocedure) IS DISTINCT FROM '746f03c46998c9dc2f2d63c62a5fc2d0' THEN RAISE EXCEPTION 'Unreviewed original invoice dependency authority';END IF;
END $admit$;
SET LOCAL ROLE postgres;
-- LOCAL REVIEW CANDIDATE ONLY. Requires coordinated route/caller cutover.

LOCK TABLE storage.objects,storage.buckets,public.compras,public.fin_gastos,public.fin_ingresos IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='facturas' AND public=false) THEN RAISE EXCEPTION 'Expected private invoice bucket'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='storage.objects'::regclass AND relrowsecurity) THEN RAISE EXCEPTION 'Storage RLS required'; END IF;
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='facturas' AND name LIKE 'verified/%') THEN RAISE EXCEPTION 'Reserved invoice namespace collides with legacy objects'; END IF;
 IF (WITH targets AS(SELECT c.oid,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid IN ('storage.objects'::regclass,'storage.buckets'::regclass,'public.compras'::regclass,'public.fin_gastos'::regclass,'public.fin_ingresos'::regclass)),
sections AS(
 SELECT 'relations' label,jsonb_agg(jsonb_build_array(relname,pg_get_userbyid(relowner),relacl,relrowsecurity,relforcerowsecurity,relkind) ORDER BY relname) value FROM targets
 UNION ALL SELECT 'columns',jsonb_agg(jsonb_build_array(t.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attgenerated,a.attidentity,pg_get_expr(d.adbin,d.adrelid),a.attacl,a.attcollation::regcollation::text) ORDER BY t.relname,a.attnum) FROM targets t JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum
 UNION ALL SELECT 'constraints',jsonb_agg(jsonb_build_array(t.relname,c.conname,pg_get_constraintdef(c.oid),c.convalidated,c.condeferrable,c.condeferred) ORDER BY t.relname,c.conname) FROM targets t JOIN pg_constraint c ON c.conrelid=t.oid
 UNION ALL SELECT 'indexes',jsonb_agg(jsonb_build_array(t.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready,i.indislive,i.indimmediate,i.indisunique,i.indisprimary,i.indnullsnotdistinct) ORDER BY t.relname,i.indexrelid::regclass::text) FROM targets t JOIN pg_index i ON i.indrelid=t.oid
 UNION ALL SELECT 'triggers',jsonb_agg(jsonb_build_array(t.relname,g.tgname,pg_get_triggerdef(g.oid),g.tgenabled) ORDER BY t.relname,g.tgname) FROM targets t JOIN pg_trigger g ON g.tgrelid=t.oid AND NOT g.tgisinternal
 UNION ALL SELECT 'policies',jsonb_agg(jsonb_build_array(p.tablename,p.policyname,p.permissive,p.roles,p.cmd,p.qual,p.with_check) ORDER BY p.tablename,p.policyname) FROM pg_policies p JOIN targets t ON t.relname=p.tablename AND p.schemaname=(SELECT ns.nspname FROM pg_class rel JOIN pg_namespace ns ON ns.oid=rel.relnamespace WHERE rel.oid=t.oid)
 UNION ALL SELECT 'functions',jsonb_agg(jsonb_build_array(n.nspname,f.proname,pg_get_function_identity_arguments(f.oid),pg_get_userbyid(f.proowner),f.prosecdef,f.proconfig,f.proacl,md5(f.prosrc),f.provolatile,f.prokind) ORDER BY n.nspname,f.proname,pg_get_function_identity_arguments(f.oid)) FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE (n.nspname='public' AND f.proname IN('fn_hato_guardar_quincena_venta','fn_hato_eliminar_quincena_venta')) OR f.oid IN(SELECT tgfoid FROM pg_trigger WHERE tgrelid IN(SELECT oid FROM targets) AND NOT tgisinternal)
 UNION ALL SELECT 'incoming_fk',jsonb_agg(jsonb_build_array(n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid),k.convalidated,k.condeferrable,k.condeferred) ORDER BY n.nspname,c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE k.contype='f' AND k.confrelid IN(SELECT oid FROM targets)
 UNION ALL SELECT 'rules',coalesce(jsonb_agg(jsonb_build_array(t.relname,r.rulename,md5(pg_get_ruledef(r.oid))) ORDER BY t.relname,r.rulename),'[]') FROM pg_rewrite r JOIN targets t ON t.oid=r.ev_class
)
SELECT md5((SELECT jsonb_object_agg(label,value)::text FROM sections))) IS DISTINCT FROM '94ba3817264f13d72579356004e7638f' THEN RAISE EXCEPTION 'Unreviewed combined invoice catalog';END IF;
END $$;
CREATE SCHEMA invoice_upload;
REVOKE ALL ON SCHEMA invoice_upload FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE invoice_upload.targets(owner uuid NOT NULL,target_key uuid NOT NULL,generation uuid NOT NULL,active boolean NOT NULL,PRIMARY KEY(owner,target_key));
CREATE TABLE invoice_upload.requests(
 owner uuid NOT NULL,request_key uuid NOT NULL,receipt_id uuid NOT NULL UNIQUE,path text NOT NULL UNIQUE,
 identity jsonb NOT NULL,state text NOT NULL CHECK(state IN('pending','uploaded','committed','quarantined')),
 cleanup_pending boolean NOT NULL DEFAULT false,cleanup_observed_at timestamptz,cleanup_observed_absent boolean,reason text,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(owner,request_key));
CREATE TABLE invoice_upload.executions(owner uuid NOT NULL,request_key uuid NOT NULL,execution_id uuid NOT NULL,settled boolean NOT NULL DEFAULT false,PRIMARY KEY(owner,request_key,execution_id),FOREIGN KEY(owner,request_key) REFERENCES invoice_upload.requests(owner,request_key));
REVOKE ALL ON ALL TABLES IN SCHEMA invoice_upload FROM PUBLIC,anon,authenticated,service_role;
-- Recognize reader aliases without rewriting stored legacy references. Percent
-- decoding is repeated conservatively; malformed/deep encoding fails closed.
CREATE FUNCTION invoice_upload.path_segments(p_value text) RETURNS text
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE parts text[]='{}'; segment text; BEGIN
 FOREACH segment IN ARRAY string_to_array(p_value,'/') LOOP
  IF segment IN('','.') THEN CONTINUE;
  ELSIF segment='..' THEN IF cardinality(parts)>0 THEN parts=parts[1:cardinality(parts)-1];END IF;
  ELSE parts=array_append(parts,segment);END IF;
 END LOOP;
 RETURN array_to_string(parts,'/');
END $$;
CREATE FUNCTION invoice_upload.canonical_path(p_value text) RETURNS text
 LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE v text=coalesce(p_value,''); decoded text; buf bytea; i int; depth int; ch text; origin text; BEGIN
 v=btrim(v,E' \t\r\n\f'||chr(160));
 FOR depth IN 1..8 LOOP
  IF v !~ '%[0-7][0-9A-Fa-f]' THEN EXIT; END IF;
  buf=''::bytea;i=1;
  WHILE i<=length(v) LOOP
   ch=substr(v,i,1);
   IF ch='%' AND substr(v,i+1,2)~'^[0-7][0-9A-Fa-f]$' AND substr(v,i+1,2)<>'00' THEN buf=buf||decode(substr(v,i+1,2),'hex');i=i+3;
   ELSE buf=buf||convert_to(ch,'UTF8');i=i+1;END IF;
  END LOOP;
  BEGIN decoded=convert_from(buf,'UTF8');EXCEPTION WHEN character_not_in_repertoire OR untranslatable_character THEN RAISE EXCEPTION 'Ambiguous invoice encoding';END;
  IF decoded=v THEN EXIT;END IF;v=decoded;
 END LOOP;
 IF depth=8 AND v~'%[0-7][0-9A-Fa-f]' THEN RAISE EXCEPTION 'Deep invoice encoding';END IF;
 v=replace(btrim(v,E' \t\r\n\f'||chr(11)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279)),chr(92),'/');
 v=regexp_replace(v,'[?#].*$','');
 IF v~'^[Hh][Tt][Tt][Pp][Ss]?://' THEN
  origin=substring(v from '^[Hh][Tt][Tt][Pp][Ss]?://[^/]+');
  v=origin||'/'||invoice_upload.path_segments(substr(v,length(origin)+1));
  IF v !~* '^[Hh][Tt][Tt][Pp][Ss]?://[^/]+/storage/v1/(object|render/image)/(public/|sign/|authenticated/)?facturas/' THEN RETURN v;END IF;
  v=regexp_replace(v,'^[Hh][Tt][Tt][Pp][Ss]?://[^/]+/storage/v1/(object|render/image)/(public/|sign/|authenticated/)?facturas/','','i');
 END IF;
 v=invoice_upload.path_segments(v);
 IF v LIKE 'facturas/%' THEN v=substr(v,10);END IF;
 RETURN v;
END $$;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='facturas' AND invoice_upload.canonical_path(name) LIKE 'verified/%')
  OR EXISTS(SELECT 1 FROM public.compras WHERE invoice_upload.canonical_path(url_factura) LIKE 'verified/%' OR invoice_upload.canonical_path(link_factura) LIKE 'verified/%')
  OR EXISTS(SELECT 1 FROM public.fin_gastos WHERE invoice_upload.canonical_path(url_factura) LIKE 'verified/%')
  OR EXISTS(SELECT 1 FROM public.fin_ingresos WHERE invoice_upload.canonical_path(url_factura) LIKE 'verified/%') THEN RAISE EXCEPTION 'Reserved invoice namespace collides with legacy references';END IF;
END $$;
CREATE FUNCTION invoice_upload.guard_reference() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE col text; v_path text; r invoice_upload.requests; BEGIN
 FOREACH col IN ARRAY TG_ARGV LOOP
  v_path=invoice_upload.canonical_path(to_jsonb(NEW)->>col);
  IF v_path LIKE 'verified/%' THEN
   SELECT * INTO r FROM invoice_upload.requests WHERE requests.path=v_path FOR SHARE;
   IF NOT FOUND OR r.state<>'committed' THEN RAISE EXCEPTION 'Invoice reference requires protected committed byte receipt';END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER invoice_verified_reference BEFORE INSERT OR UPDATE OF url_factura,link_factura ON public.compras
 FOR EACH ROW EXECUTE FUNCTION invoice_upload.guard_reference('url_factura','link_factura');
CREATE TRIGGER invoice_verified_reference BEFORE INSERT OR UPDATE OF url_factura ON public.fin_gastos
 FOR EACH ROW EXECUTE FUNCTION invoice_upload.guard_reference('url_factura');
CREATE TRIGGER invoice_verified_reference BEFORE INSERT OR UPDATE OF url_factura ON public.fin_ingresos
 FOR EACH ROW EXECUTE FUNCTION invoice_upload.guard_reference('url_factura');
CREATE FUNCTION invoice_upload.active_actor(a uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT a IS NOT NULL AND EXISTS(SELECT 1 FROM public.usuarios WHERE id=a AND activo IS TRUE AND rol::text IN('Administrador','Gerencia'))
$$;
CREATE FUNCTION invoice_upload.response(r invoice_upload.requests) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('actor',r.owner,'identity',r.identity,'receiptId',r.receipt_id,'path',r.path,'state',r.state,'cleanupPending',r.cleanup_pending)
$$;
CREATE FUNCTION public.fn_invoice_upload_target(p_actor uuid,p_target_key uuid,p_action text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE t invoice_upload.targets; affected jsonb; item jsonb; observed jsonb; BEGIN
 PERFORM 1 FROM public.usuarios WHERE id=p_actor FOR SHARE;
 IF NOT invoice_upload.active_actor(p_actor) OR p_target_key IS NULL OR p_action NOT IN('activate','invalidate') THEN RAISE EXCEPTION 'Current active human invoice actor required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('invoice-target:'||p_actor::text||p_target_key::text,0));
 SELECT * INTO t FROM invoice_upload.targets WHERE owner=p_actor AND target_key=p_target_key FOR UPDATE;
 IF NOT FOUND THEN
  INSERT INTO invoice_upload.targets VALUES(p_actor,p_target_key,gen_random_uuid(),p_action='activate');
 ELSIF p_action='invalidate' THEN
  UPDATE invoice_upload.targets SET active=false WHERE owner=p_actor AND target_key=p_target_key;
 ELSIF NOT t.active THEN RAISE EXCEPTION 'Closed invoice target cannot be reopened';
 END IF;
 IF p_action='invalidate' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') INTO affected FROM invoice_upload.requests r WHERE owner=p_actor AND identity->>'targetKey'=p_target_key::text AND state<>'committed';
  UPDATE invoice_upload.requests SET state='quarantined',cleanup_pending=true,reason='target invalidated'
   WHERE owner=p_actor AND identity->>'targetKey'=p_target_key::text AND state<>'committed';
  FOR item IN SELECT value FROM jsonb_array_elements(affected) LOOP
   SELECT to_jsonb(r) INTO observed FROM invoice_upload.requests r WHERE owner=p_actor AND request_key=(item->>'request_key')::uuid;
   IF observed IS DISTINCT FROM (item||jsonb_build_object('state','quarantined','cleanup_pending',true,'reason','target invalidated')) THEN RAISE EXCEPTION 'Invoice target quarantine suppressed or mutated'; END IF;
  END LOOP;
 END IF;
 SELECT * INTO t FROM invoice_upload.targets WHERE owner=p_actor AND target_key=p_target_key;
 IF NOT FOUND OR t.active IS DISTINCT FROM (p_action='activate') THEN RAISE EXCEPTION 'Invoice target fence suppressed'; END IF;
 RETURN jsonb_build_object('actor',p_actor,'targetKey',p_target_key,'generation',t.generation,'active',t.active);
END $$;
CREATE FUNCTION public.fn_invoice_upload_step(p_actor uuid,p_action text,p_identity jsonb,p_observed_sha text DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r invoice_upload.requests; expected invoice_upload.requests; t invoice_upload.targets; k uuid; rid uuid; ext text; BEGIN
 IF p_actor IS NULL OR p_identity IS NULL OR jsonb_typeof(p_identity)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_identity))<>10
  OR NOT(p_identity ?& ARRAY['requestKey','protocolVersion','targetKey','generation','tipo','sha256','size','mime','extension','sourceExtension'])
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['requestKey','targetKey','generation','tipo','sha256','mime','extension','sourceExtension']) AS fields(k) WHERE jsonb_typeof(p_identity->fields.k) IS DISTINCT FROM 'string')
  OR p_identity->'protocolVersion'<>'1'::jsonb OR jsonb_typeof(p_identity->'size')<>'number'
  OR (p_identity->>'size')::numeric NOT BETWEEN 1 AND 5242880 OR (p_identity->>'size')::numeric<>trunc((p_identity->>'size')::numeric)
  OR p_identity->>'sha256'!~'^[0-9a-f]{64}$' OR p_identity->>'tipo' NOT IN('compra','venta') THEN RAISE EXCEPTION 'Invalid invoice identity'; END IF;
 k=(p_identity->>'requestKey')::uuid;
 ext=CASE p_identity->>'mime' WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/gif' THEN 'gif' WHEN 'application/pdf' THEN 'pdf' END;
 IF ext IS NULL OR p_identity->>'extension'<>ext OR (CASE WHEN ext='jpg' THEN p_identity->>'sourceExtension' NOT IN('jpg','jpeg') ELSE p_identity->>'sourceExtension'<>ext END) THEN RAISE EXCEPTION 'Invalid invoice MIME/extension'; END IF;
 -- Lock order profile -> target -> request matches invalidation/finalization.
 PERFORM 1 FROM public.usuarios WHERE id=p_actor FOR SHARE;
 SELECT * INTO t FROM invoice_upload.targets WHERE owner=p_actor AND target_key=(p_identity->>'targetKey')::uuid FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('invoice-request:'||p_actor::text||k::text,0));
 SELECT * INTO r FROM invoice_upload.requests WHERE owner=p_actor AND request_key=k FOR UPDATE;
 IF FOUND AND r.identity IS DISTINCT FROM p_identity THEN RAISE EXCEPTION 'Changed invoice attempt'; END IF;
 IF r.owner IS NOT NULL AND (r.path<>'verified/'||r.receipt_id::text||'.'||ext) THEN RAISE EXCEPTION 'Invoice path proof mismatch'; END IF;
 expected=r;
 IF p_action='status' THEN
  IF NOT invoice_upload.active_actor(p_actor) THEN RAISE EXCEPTION 'Current active human invoice actor required'; END IF;
  IF r.owner IS NULL THEN RETURN jsonb_build_object('actor',p_actor,'identity',p_identity,'state','unknown'); END IF;
  RETURN invoice_upload.response(r);
 END IF;
 IF p_action='reserve' THEN
  IF NOT invoice_upload.active_actor(p_actor) OR t.owner IS NULL OR NOT t.active OR t.generation::text<>p_identity->>'generation' THEN RAISE EXCEPTION 'Current active invoice target required'; END IF;
  IF r.owner IS NULL THEN
   rid=gen_random_uuid();
   INSERT INTO invoice_upload.requests(owner,request_key,receipt_id,path,identity,state)
    VALUES(p_actor,k,rid,'verified/'||rid::text||'.'||ext,p_identity,'pending');
   SELECT * INTO r FROM invoice_upload.requests WHERE owner=p_actor AND request_key=k;
   IF NOT FOUND OR r.identity IS DISTINCT FROM p_identity OR r.state<>'pending' OR r.receipt_id<>rid OR r.created_at IS DISTINCT FROM now() OR r.cleanup_pending OR r.reason IS NOT NULL OR r.cleanup_observed_at IS NOT NULL OR r.cleanup_observed_absent IS NOT NULL OR r.path<>'verified/'||rid::text||'.'||ext THEN RAISE EXCEPTION 'Invoice reservation suppressed'; END IF;
  END IF;
 ELSIF r.owner IS NULL THEN RAISE EXCEPTION 'Invoice reservation required';
 ELSIF p_action IN('write-claim','write-settled') THEN
  IF p_observed_sha IS NULL THEN RAISE EXCEPTION 'Write execution UUID required';END IF;
  IF p_action='write-claim' THEN
   IF r.state<>'pending' OR NOT invoice_upload.active_actor(p_actor) OR t.owner IS NULL OR NOT t.active OR t.generation::text<>p_identity->>'generation' THEN RAISE EXCEPTION 'Current active pending write required';END IF;
   INSERT INTO invoice_upload.executions VALUES(p_actor,k,p_observed_sha::uuid,false);
   IF NOT EXISTS(SELECT 1 FROM invoice_upload.executions WHERE owner=p_actor AND request_key=k AND execution_id=p_observed_sha::uuid AND NOT settled) THEN RAISE EXCEPTION 'Write claim suppressed';END IF;
  ELSE
   UPDATE invoice_upload.executions SET settled=true WHERE owner=p_actor AND request_key=k AND execution_id=p_observed_sha::uuid;
   IF NOT EXISTS(SELECT 1 FROM invoice_upload.executions WHERE owner=p_actor AND request_key=k AND execution_id=p_observed_sha::uuid AND settled) THEN RAISE EXCEPTION 'Write settlement suppressed';END IF;
  END IF;
 ELSIF p_action='uploaded' THEN
  IF r.state='pending' THEN expected.state='uploaded';UPDATE invoice_upload.requests SET state='uploaded' WHERE owner=p_actor AND request_key=k; END IF;
 ELSIF p_action='finalize' THEN
  IF r.state='committed' THEN
   IF NOT invoice_upload.active_actor(p_actor) THEN RAISE EXCEPTION 'Current active human invoice actor required'; END IF;
   RETURN invoice_upload.response(r);
  END IF;
  IF r.state='uploaded' AND invoice_upload.active_actor(p_actor) AND t.owner IS NOT NULL AND t.active
    AND t.generation::text=p_identity->>'generation' AND p_observed_sha=p_identity->>'sha256' THEN
   expected.state='committed';expected.reason=NULL;
   UPDATE invoice_upload.requests SET state='committed',reason=NULL WHERE owner=p_actor AND request_key=k;
  ELSE
   expected.state='quarantined';expected.cleanup_pending=true;expected.reason='actor, target or byte proof failed';
   UPDATE invoice_upload.requests SET state='quarantined',cleanup_pending=true,reason='actor, target or byte proof failed' WHERE owner=p_actor AND request_key=k;
  END IF;
 ELSIF p_action='quarantine' THEN
  IF r.state<>'committed' THEN expected.state='quarantined';expected.cleanup_pending=true;expected.reason='upload failed or mismatched';UPDATE invoice_upload.requests SET state='quarantined',cleanup_pending=true,reason='upload failed or mismatched' WHERE owner=p_actor AND request_key=k; END IF;
 ELSIF p_action IN('cleanup-authorize','cleanup-observed') THEN
  IF r.state<>'quarantined' OR EXISTS(SELECT 1 FROM public.compras WHERE invoice_upload.canonical_path(url_factura)=r.path OR invoice_upload.canonical_path(link_factura)=r.path)
   OR EXISTS(SELECT 1 FROM public.fin_gastos WHERE invoice_upload.canonical_path(url_factura)=r.path) OR EXISTS(SELECT 1 FROM public.fin_ingresos WHERE invoice_upload.canonical_path(url_factura)=r.path) THEN RAISE EXCEPTION 'Invoice cleanup requires uncommitted unreferenced quarantine'; END IF;
  IF p_action='cleanup-observed' THEN
   expected.cleanup_observed_at=now();expected.cleanup_observed_absent=coalesce(p_observed_sha='absent',false);
   expected.cleanup_pending=NOT(expected.cleanup_observed_absent AND NOT EXISTS(SELECT 1 FROM invoice_upload.executions WHERE owner=p_actor AND request_key=k AND NOT settled));
   UPDATE invoice_upload.requests SET cleanup_observed_at=expected.cleanup_observed_at,cleanup_observed_absent=expected.cleanup_observed_absent,cleanup_pending=expected.cleanup_pending WHERE owner=p_actor AND request_key=k;
  END IF;
 ELSE RAISE EXCEPTION 'Unsupported invoice step'; END IF;
 SELECT * INTO r FROM invoice_upload.requests WHERE owner=p_actor AND request_key=k;
 IF NOT FOUND OR r.identity IS DISTINCT FROM p_identity OR (p_action='uploaded' AND r.state='pending') THEN RAISE EXCEPTION 'Invoice state readback failed'; END IF;
 IF p_action<>'reserve' AND to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Invoice exact state readback failed'; END IF;
 IF p_action IN('reserve','write-claim') AND (NOT invoice_upload.active_actor(p_actor) OR NOT EXISTS(SELECT 1 FROM invoice_upload.targets WHERE owner=p_actor AND target_key=(p_identity->>'targetKey')::uuid AND active AND generation::text=p_identity->>'generation')) THEN RAISE EXCEPTION 'Invoice late reservation authority mutation';END IF;
 IF p_action='finalize' AND r.state='committed' AND (NOT invoice_upload.active_actor(p_actor) OR NOT EXISTS(SELECT 1 FROM invoice_upload.targets WHERE owner=p_actor AND target_key=(p_identity->>'targetKey')::uuid AND active AND generation::text=p_identity->>'generation')) THEN RAISE EXCEPTION 'Invoice late actor or target mutation'; END IF;
 IF p_action='finalize' AND r.state NOT IN('committed','quarantined') THEN RAISE EXCEPTION 'Invoice finalization suppressed'; END IF;
 RETURN invoice_upload.response(r);
END $$;
CREATE FUNCTION public.invoice_object_committed(p_bucket text,p_name text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT p_bucket<>'facturas' OR p_name NOT LIKE 'verified/%' OR EXISTS(
  SELECT 1 FROM invoice_upload.requests WHERE path=p_name AND state='committed')
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA invoice_upload FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_invoice_upload_target(uuid,uuid,text),public.fn_invoice_upload_step(uuid,text,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_invoice_upload_target(uuid,uuid,text),public.fn_invoice_upload_step(uuid,text,jsonb,text) TO service_role;
REVOKE ALL ON FUNCTION public.invoice_object_committed(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.invoice_object_committed(text,text) TO authenticated;
SET LOCAL ROLE supabase_storage_admin;
CREATE POLICY invoice_server_insert_only ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(bucket_id<>'facturas');
CREATE POLICY invoice_server_update_only ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'facturas') WITH CHECK(bucket_id<>'facturas');
CREATE POLICY invoice_committed_namespace_only ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.invoice_object_committed(bucket_id,name));

CREATE POLICY invoice_server_delete_only ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING(bucket_id<>'facturas');
SET LOCAL ROLE postgres;

CREATE FUNCTION invoice_upload.assert_controls() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $control$ BEGIN RAISE EXCEPTION 'Uninitialized invoice controls';END $control$;REVOKE ALL ON FUNCTION invoice_upload.assert_controls() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION invoice_upload.guard_reference()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE col text; v_path text; r invoice_upload.requests; BEGIN
 PERFORM invoice_upload.assert_controls();
 FOREACH col IN ARRAY TG_ARGV LOOP
  v_path=invoice_upload.canonical_path(to_jsonb(NEW)->>col);
  IF v_path LIKE 'verified/%' THEN
   SELECT * INTO r FROM invoice_upload.requests WHERE requests.path=v_path FOR SHARE;
   IF NOT FOUND OR r.state<>'committed' THEN RAISE EXCEPTION 'Invoice reference requires protected committed byte receipt';END IF;
  END IF;
 END LOOP;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_invoice_upload_target(p_actor uuid, p_target_key uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE t invoice_upload.targets; affected jsonb; item jsonb; observed jsonb; BEGIN
 PERFORM invoice_upload.assert_controls();
 PERFORM 1 FROM public.usuarios WHERE id=p_actor FOR SHARE;
 IF NOT invoice_upload.active_actor(p_actor) OR p_target_key IS NULL OR p_action NOT IN('activate','invalidate') THEN RAISE EXCEPTION 'Current active human invoice actor required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('invoice-target:'||p_actor::text||p_target_key::text,0));
 SELECT * INTO t FROM invoice_upload.targets WHERE owner=p_actor AND target_key=p_target_key FOR UPDATE;
 IF NOT FOUND THEN
  INSERT INTO invoice_upload.targets VALUES(p_actor,p_target_key,gen_random_uuid(),p_action='activate');
 ELSIF p_action='invalidate' THEN
  UPDATE invoice_upload.targets SET active=false WHERE owner=p_actor AND target_key=p_target_key;
 ELSIF NOT t.active THEN RAISE EXCEPTION 'Closed invoice target cannot be reopened';
 END IF;
 IF p_action='invalidate' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') INTO affected FROM invoice_upload.requests r WHERE owner=p_actor AND identity->>'targetKey'=p_target_key::text AND state<>'committed';
  UPDATE invoice_upload.requests SET state='quarantined',cleanup_pending=true,reason='target invalidated'
   WHERE owner=p_actor AND identity->>'targetKey'=p_target_key::text AND state<>'committed';
  FOR item IN SELECT value FROM jsonb_array_elements(affected) LOOP
   SELECT to_jsonb(r) INTO observed FROM invoice_upload.requests r WHERE owner=p_actor AND request_key=(item->>'request_key')::uuid;
   IF observed IS DISTINCT FROM (item||jsonb_build_object('state','quarantined','cleanup_pending',true,'reason','target invalidated')) THEN RAISE EXCEPTION 'Invoice target quarantine suppressed or mutated'; END IF;
  END LOOP;
 END IF;
 SELECT * INTO t FROM invoice_upload.targets WHERE owner=p_actor AND target_key=p_target_key;
 IF NOT FOUND OR t.active IS DISTINCT FROM (p_action='activate') THEN RAISE EXCEPTION 'Invoice target fence suppressed'; END IF;
 RETURN jsonb_build_object('actor',p_actor,'targetKey',p_target_key,'generation',t.generation,'active',t.active);
END $function$;

CREATE OR REPLACE FUNCTION public.fn_invoice_upload_step(p_actor uuid, p_action text, p_identity jsonb, p_observed_sha text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE r invoice_upload.requests; expected invoice_upload.requests; t invoice_upload.targets; k uuid; rid uuid; ext text; BEGIN
 PERFORM invoice_upload.assert_controls();
 IF p_actor IS NULL OR p_identity IS NULL OR jsonb_typeof(p_identity)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_identity))<>10
  OR NOT(p_identity ?& ARRAY['requestKey','protocolVersion','targetKey','generation','tipo','sha256','size','mime','extension','sourceExtension'])
  OR EXISTS(SELECT 1 FROM unnest(ARRAY['requestKey','targetKey','generation','tipo','sha256','mime','extension','sourceExtension']) AS fields(k) WHERE jsonb_typeof(p_identity->fields.k) IS DISTINCT FROM 'string')
  OR p_identity->'protocolVersion'<>'1'::jsonb OR jsonb_typeof(p_identity->'size')<>'number'
  OR (p_identity->>'size')::numeric NOT BETWEEN 1 AND 5242880 OR (p_identity->>'size')::numeric<>trunc((p_identity->>'size')::numeric)
  OR p_identity->>'sha256'!~'^[0-9a-f]{64}$' OR p_identity->>'tipo' NOT IN('compra','venta') THEN RAISE EXCEPTION 'Invalid invoice identity'; END IF;
 k=(p_identity->>'requestKey')::uuid;
 ext=CASE p_identity->>'mime' WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' WHEN 'image/gif' THEN 'gif' WHEN 'application/pdf' THEN 'pdf' END;
 IF ext IS NULL OR p_identity->>'extension'<>ext OR (CASE WHEN ext='jpg' THEN p_identity->>'sourceExtension' NOT IN('jpg','jpeg') ELSE p_identity->>'sourceExtension'<>ext END) THEN RAISE EXCEPTION 'Invalid invoice MIME/extension'; END IF;
 -- Lock order profile -> target -> request matches invalidation/finalization.
 PERFORM 1 FROM public.usuarios WHERE id=p_actor FOR SHARE;
 SELECT * INTO t FROM invoice_upload.targets WHERE owner=p_actor AND target_key=(p_identity->>'targetKey')::uuid FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('invoice-request:'||p_actor::text||k::text,0));
 SELECT * INTO r FROM invoice_upload.requests WHERE owner=p_actor AND request_key=k FOR UPDATE;
 IF FOUND AND r.identity IS DISTINCT FROM p_identity THEN RAISE EXCEPTION 'Changed invoice attempt'; END IF;
 IF r.owner IS NOT NULL AND (r.path<>'verified/'||r.receipt_id::text||'.'||ext) THEN RAISE EXCEPTION 'Invoice path proof mismatch'; END IF;
 expected=r;
 IF p_action='status' THEN
  IF NOT invoice_upload.active_actor(p_actor) THEN RAISE EXCEPTION 'Current active human invoice actor required'; END IF;
  IF r.owner IS NULL THEN RETURN jsonb_build_object('actor',p_actor,'identity',p_identity,'state','unknown'); END IF;
  RETURN invoice_upload.response(r);
 END IF;
 IF p_action='reserve' THEN
  IF NOT invoice_upload.active_actor(p_actor) OR t.owner IS NULL OR NOT t.active OR t.generation::text<>p_identity->>'generation' THEN RAISE EXCEPTION 'Current active invoice target required'; END IF;
  IF r.owner IS NULL THEN
   rid=gen_random_uuid();
   INSERT INTO invoice_upload.requests(owner,request_key,receipt_id,path,identity,state)
    VALUES(p_actor,k,rid,'verified/'||rid::text||'.'||ext,p_identity,'pending');
   SELECT * INTO r FROM invoice_upload.requests WHERE owner=p_actor AND request_key=k;
   IF NOT FOUND OR r.identity IS DISTINCT FROM p_identity OR r.state<>'pending' OR r.receipt_id<>rid OR r.created_at IS DISTINCT FROM now() OR r.cleanup_pending OR r.reason IS NOT NULL OR r.cleanup_observed_at IS NOT NULL OR r.cleanup_observed_absent IS NOT NULL OR r.path<>'verified/'||rid::text||'.'||ext THEN RAISE EXCEPTION 'Invoice reservation suppressed'; END IF;
  END IF;
 ELSIF r.owner IS NULL THEN RAISE EXCEPTION 'Invoice reservation required';
 ELSIF p_action IN('write-claim','write-settled') THEN
  IF p_observed_sha IS NULL THEN RAISE EXCEPTION 'Write execution UUID required';END IF;
  IF p_action='write-claim' THEN
   IF r.state<>'pending' OR NOT invoice_upload.active_actor(p_actor) OR t.owner IS NULL OR NOT t.active OR t.generation::text<>p_identity->>'generation' THEN RAISE EXCEPTION 'Current active pending write required';END IF;
   INSERT INTO invoice_upload.executions VALUES(p_actor,k,p_observed_sha::uuid,false);
   IF NOT EXISTS(SELECT 1 FROM invoice_upload.executions WHERE owner=p_actor AND request_key=k AND execution_id=p_observed_sha::uuid AND NOT settled) THEN RAISE EXCEPTION 'Write claim suppressed';END IF;
  ELSE
   UPDATE invoice_upload.executions SET settled=true WHERE owner=p_actor AND request_key=k AND execution_id=p_observed_sha::uuid;
   IF NOT EXISTS(SELECT 1 FROM invoice_upload.executions WHERE owner=p_actor AND request_key=k AND execution_id=p_observed_sha::uuid AND settled) THEN RAISE EXCEPTION 'Write settlement suppressed';END IF;
  END IF;
 ELSIF p_action='uploaded' THEN
  IF r.state='pending' THEN expected.state='uploaded';UPDATE invoice_upload.requests SET state='uploaded' WHERE owner=p_actor AND request_key=k; END IF;
 ELSIF p_action='finalize' THEN
  IF r.state='committed' THEN
   IF NOT invoice_upload.active_actor(p_actor) THEN RAISE EXCEPTION 'Current active human invoice actor required'; END IF;
   RETURN invoice_upload.response(r);
  END IF;
  IF r.state='uploaded' AND invoice_upload.active_actor(p_actor) AND t.owner IS NOT NULL AND t.active
    AND t.generation::text=p_identity->>'generation' AND p_observed_sha=p_identity->>'sha256' THEN
   expected.state='committed';expected.reason=NULL;
   UPDATE invoice_upload.requests SET state='committed',reason=NULL WHERE owner=p_actor AND request_key=k;
  ELSE
   expected.state='quarantined';expected.cleanup_pending=true;expected.reason='actor, target or byte proof failed';
   UPDATE invoice_upload.requests SET state='quarantined',cleanup_pending=true,reason='actor, target or byte proof failed' WHERE owner=p_actor AND request_key=k;
  END IF;
 ELSIF p_action='quarantine' THEN
  IF r.state<>'committed' THEN expected.state='quarantined';expected.cleanup_pending=true;expected.reason='upload failed or mismatched';UPDATE invoice_upload.requests SET state='quarantined',cleanup_pending=true,reason='upload failed or mismatched' WHERE owner=p_actor AND request_key=k; END IF;
 ELSIF p_action IN('cleanup-authorize','cleanup-observed') THEN
  IF r.state<>'quarantined' OR EXISTS(SELECT 1 FROM public.compras WHERE invoice_upload.canonical_path(url_factura)=r.path OR invoice_upload.canonical_path(link_factura)=r.path)
   OR EXISTS(SELECT 1 FROM public.fin_gastos WHERE invoice_upload.canonical_path(url_factura)=r.path) OR EXISTS(SELECT 1 FROM public.fin_ingresos WHERE invoice_upload.canonical_path(url_factura)=r.path) THEN RAISE EXCEPTION 'Invoice cleanup requires uncommitted unreferenced quarantine'; END IF;
  IF p_action='cleanup-observed' THEN
   expected.cleanup_observed_at=now();expected.cleanup_observed_absent=coalesce(p_observed_sha='absent',false);
   expected.cleanup_pending=NOT(expected.cleanup_observed_absent AND NOT EXISTS(SELECT 1 FROM invoice_upload.executions WHERE owner=p_actor AND request_key=k AND NOT settled));
   UPDATE invoice_upload.requests SET cleanup_observed_at=expected.cleanup_observed_at,cleanup_observed_absent=expected.cleanup_observed_absent,cleanup_pending=expected.cleanup_pending WHERE owner=p_actor AND request_key=k;
  END IF;
 ELSE RAISE EXCEPTION 'Unsupported invoice step'; END IF;
 SELECT * INTO r FROM invoice_upload.requests WHERE owner=p_actor AND request_key=k;
 IF NOT FOUND OR r.identity IS DISTINCT FROM p_identity OR (p_action='uploaded' AND r.state='pending') THEN RAISE EXCEPTION 'Invoice state readback failed'; END IF;
 IF p_action<>'reserve' AND to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Invoice exact state readback failed'; END IF;
 IF p_action IN('reserve','write-claim') AND (NOT invoice_upload.active_actor(p_actor) OR NOT EXISTS(SELECT 1 FROM invoice_upload.targets WHERE owner=p_actor AND target_key=(p_identity->>'targetKey')::uuid AND active AND generation::text=p_identity->>'generation')) THEN RAISE EXCEPTION 'Invoice late reservation authority mutation';END IF;
 IF p_action='finalize' AND r.state='committed' AND (NOT invoice_upload.active_actor(p_actor) OR NOT EXISTS(SELECT 1 FROM invoice_upload.targets WHERE owner=p_actor AND target_key=(p_identity->>'targetKey')::uuid AND active AND generation::text=p_identity->>'generation')) THEN RAISE EXCEPTION 'Invoice late actor or target mutation'; END IF;
 IF p_action='finalize' AND r.state NOT IN('committed','quarantined') THEN RAISE EXCEPTION 'Invoice finalization suppressed'; END IF;
 RETURN invoice_upload.response(r);
END $function$;

CREATE OR REPLACE FUNCTION invoice_upload.assert_controls() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $control$ BEGIN IF (SELECT md5(jsonb_build_array((WITH targets AS(SELECT c.oid,c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid IN ('storage.objects'::regclass,'storage.buckets'::regclass,'public.compras'::regclass,'public.fin_gastos'::regclass,'public.fin_ingresos'::regclass)),
sections AS(
 SELECT 'relations' label,jsonb_agg(jsonb_build_array(relname,pg_get_userbyid(relowner),relacl,relrowsecurity,relforcerowsecurity,relkind) ORDER BY relname) value FROM targets
 UNION ALL SELECT 'columns',jsonb_agg(jsonb_build_array(t.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attgenerated,a.attidentity,pg_get_expr(d.adbin,d.adrelid),a.attacl,a.attcollation::regcollation::text) ORDER BY t.relname,a.attnum) FROM targets t JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=t.oid AND d.adnum=a.attnum
 UNION ALL SELECT 'constraints',jsonb_agg(jsonb_build_array(t.relname,c.conname,pg_get_constraintdef(c.oid),c.convalidated,c.condeferrable,c.condeferred) ORDER BY t.relname,c.conname) FROM targets t JOIN pg_constraint c ON c.conrelid=t.oid
 UNION ALL SELECT 'indexes',jsonb_agg(jsonb_build_array(t.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready,i.indislive,i.indimmediate,i.indisunique,i.indisprimary,i.indnullsnotdistinct) ORDER BY t.relname,i.indexrelid::regclass::text) FROM targets t JOIN pg_index i ON i.indrelid=t.oid
 UNION ALL SELECT 'triggers',jsonb_agg(jsonb_build_array(t.relname,g.tgname,pg_get_triggerdef(g.oid),g.tgenabled) ORDER BY t.relname,g.tgname) FROM targets t JOIN pg_trigger g ON g.tgrelid=t.oid AND NOT g.tgisinternal
 UNION ALL SELECT 'policies',jsonb_agg(jsonb_build_array(p.tablename,p.policyname,p.permissive,p.roles,p.cmd,p.qual,p.with_check) ORDER BY p.tablename,p.policyname) FROM pg_policies p JOIN targets t ON t.relname=p.tablename AND p.schemaname=(SELECT ns.nspname FROM pg_class rel JOIN pg_namespace ns ON ns.oid=rel.relnamespace WHERE rel.oid=t.oid)
 UNION ALL SELECT 'functions',jsonb_agg(jsonb_build_array(n.nspname,f.proname,pg_get_function_identity_arguments(f.oid),pg_get_userbyid(f.proowner),f.prosecdef,f.proconfig,f.proacl,md5(f.prosrc),f.provolatile,f.prokind) ORDER BY n.nspname,f.proname,pg_get_function_identity_arguments(f.oid)) FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE (n.nspname='public' AND f.proname IN('fn_hato_guardar_quincena_venta','fn_hato_eliminar_quincena_venta')) OR f.oid IN(SELECT tgfoid FROM pg_trigger WHERE tgrelid IN(SELECT oid FROM targets) AND NOT tgisinternal)
 UNION ALL SELECT 'incoming_fk',jsonb_agg(jsonb_build_array(n.nspname,c.relname,k.conname,pg_get_constraintdef(k.oid),k.convalidated,k.condeferrable,k.condeferred) ORDER BY n.nspname,c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE k.contype='f' AND k.confrelid IN(SELECT oid FROM targets)
 UNION ALL SELECT 'rules',coalesce(jsonb_agg(jsonb_build_array(t.relname,r.rulename,md5(pg_get_ruledef(r.oid))) ORDER BY t.relname,r.rulename),'[]') FROM pg_rewrite r JOIN targets t ON t.oid=r.ev_class
)
SELECT md5((SELECT jsonb_object_agg(label,value)::text FROM sections))),(WITH sections AS(
 SELECT 'schema' k,jsonb_agg(jsonb_build_array(pg_get_userbyid(nspowner),nspacl)) v FROM pg_namespace WHERE nspname='invoice_upload'
 UNION ALL SELECT 'tables',jsonb_agg(jsonb_build_array(c.relname,pg_get_userbyid(c.relowner),c.relacl,c.relrowsecurity,c.relforcerowsecurity,c.relkind) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='invoice_upload' AND c.relkind IN('r','p')
 UNION ALL SELECT 'columns',jsonb_agg(jsonb_build_array(c.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attacl,pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='invoice_upload' AND c.relkind IN('r','p')
 UNION ALL SELECT 'constraints',jsonb_agg(jsonb_build_array(c.relname,k.conname,pg_get_constraintdef(k.oid),k.convalidated,k.condeferrable,k.condeferred) ORDER BY c.relname,k.conname) FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='invoice_upload'
 UNION ALL SELECT 'indexes',jsonb_agg(jsonb_build_array(c.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready,i.indislive) ORDER BY c.relname,i.indexrelid::regclass::text) FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='invoice_upload'
 UNION ALL SELECT 'triggers',coalesce(jsonb_agg(jsonb_build_array(c.relname,t.tgname,pg_get_triggerdef(t.oid),t.tgenabled) ORDER BY c.relname,t.tgname),'[]') FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='invoice_upload' AND NOT t.tgisinternal
 UNION ALL SELECT 'policies',coalesce(jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname),'[]') FROM pg_policies p WHERE schemaname='invoice_upload'
 UNION ALL SELECT 'functions',jsonb_agg(jsonb_build_array(n.nspname,f.proname,pg_get_function_identity_arguments(f.oid),pg_get_userbyid(f.proowner),f.proacl,f.prosecdef,f.proconfig,f.provolatile,f.proparallel,f.proisstrict,f.proleakproof,f.prorettype::regtype::text,f.proretset,f.proargnames,f.proargmodes,f.prokind,(SELECT lanname FROM pg_language WHERE oid=f.prolang),CASE WHEN n.nspname='invoice_upload' AND f.proname='assert_controls' THEN NULL ELSE md5(f.prosrc) END) ORDER BY n.nspname,f.proname,pg_get_function_identity_arguments(f.oid)) FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname='invoice_upload' OR(n.nspname='public' AND f.proname IN('fn_invoice_upload_target','fn_invoice_upload_step','invoice_object_committed'))
 UNION ALL SELECT 'rules',coalesce(jsonb_agg(jsonb_build_array(c.relname,w.rulename,pg_get_ruledef(w.oid)) ORDER BY c.relname,w.rulename),'[]') FROM pg_rewrite w JOIN pg_class c ON c.oid=w.ev_class JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='invoice_upload'
) SELECT md5((SELECT jsonb_object_agg(k,v)::text FROM sections))))::text)) IS DISTINCT FROM '4939b69a474a3669b4c0ae38ebe2ccd1' THEN RAISE EXCEPTION 'Unreviewed invoice private authority';END IF;END $control$;
CREATE OR REPLACE FUNCTION hato_income_metadata.assert_baseline()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 PERFORM hato_quincena.assert_baseline();PERFORM hato_income_metadata.assert_controls();
 IF hato_income_metadata.baseline() IS DISTINCT FROM '9fdd55c45b5c4b66d41442f3e7e81a83' THEN RAISE EXCEPTION 'Unreviewed quincena financial source baseline';END IF;
END $function$;

CREATE OR REPLACE FUNCTION hato_native_photo_upload.assert_baseline()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 PERFORM hato_milk_week.assert_baseline();
 IF hato_native_photo_upload.baseline() IS DISTINCT FROM 'edfd3314f5f31b3de46c7d2416413f73' THEN RAISE EXCEPTION 'Unreviewed photo/Storage baseline';END IF;
END $function$;

CREATE OR REPLACE FUNCTION hato_native_photo_upload.assert_observer_baseline()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE f record;BEGIN
 PERFORM hato_photo_upload.assert_observer_baseline();PERFORM hato_native_photo_upload.assert_baseline();
 FOR f IN SELECT * FROM(VALUES
('hato_native_photo_upload.immutable()','d966dfa7162790dee21c58b20333849b',false),
('hato_native_photo_upload.baseline()','62ab7a509bd6629558d56aebc4bb2a77',false),
('hato_native_photo_upload.assert_baseline()','f79d423cde30f034c6e768ee202615f9',false),
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
END $function$;

CREATE OR REPLACE FUNCTION hato_photo_upload.assert_baseline()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 PERFORM hato_milk_week.assert_baseline();
 IF hato_photo_upload.baseline() IS DISTINCT FROM 'edfd3314f5f31b3de46c7d2416413f73' THEN RAISE EXCEPTION 'Unreviewed photo/Storage baseline';END IF;
END $function$;

CREATE OR REPLACE FUNCTION hato_photo_upload.assert_observer_baseline()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE f record;BEGIN
 PERFORM hato_photo_upload.assert_baseline();
 FOR f IN SELECT * FROM (VALUES
('hato_photo_upload.immutable()','d966dfa7162790dee21c58b20333849b',false),
('hato_photo_upload.baseline()','62ab7a509bd6629558d56aebc4bb2a77',false),
('hato_photo_upload.assert_baseline()','c34ad78ad42537791efb99ea8098b94e',false),
('hato_photo_upload.actor(uuid)','d31d72c323243c962b2dd79ca896e42b',false),
('hato_photo_upload.controls()','33f8a7fa3ba62e853cabe6687473cd24',false),
('hato_photo_upload.storage_rows()','46db6bef292e64bc82cd2dff4b4f302c',false),
('hato_photo_upload.other_controls()','c238f4c6d7c22b2c8dd4ad03ca029d61',false),
('hato_photo_upload.result(hato_photo_upload.requests,uuid)','d7eecd63d4a4d88de37d483e90b46e9a',false),
('hato_photo_upload.validate(jsonb)','3094c7514adbeeaf3079270a055803b1',false),
('public.fn_hato_photo_upload_service(text,uuid,uuid,jsonb)','51687054a3fa6ee9f72ec44953f2516b',true),
('public.fn_hato_photo_upload_recover_web(uuid)','eaa59962b8dc91e961f537c82661d9cf',true)
 ) pin(signature,body,secdef) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(f.signature) AND md5(p.prosrc)=f.body AND p.prosecdef=f.secdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed photo upload function: %',f.signature;END IF;
 END LOOP;
 IF has_function_privilege('anon','public.fn_hato_photo_upload_service(text,uuid,uuid,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.fn_hato_photo_upload_service(text,uuid,uuid,jsonb)','EXECUTE') OR NOT has_function_privilege('service_role','public.fn_hato_photo_upload_service(text,uuid,uuid,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Unreviewed upload service authority';END IF;
END $function$;

CREATE OR REPLACE FUNCTION hato_quincena.assert_baseline()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 PERFORM hato_upload_discard.assert_history_baseline();PERFORM hato_quincena.assert_controls();
 IF hato_quincena.baseline() IS DISTINCT FROM '9fdd55c45b5c4b66d41442f3e7e81a83' THEN RAISE EXCEPTION 'Unreviewed quincena financial source baseline';END IF;
END $function$;

COMMIT;
