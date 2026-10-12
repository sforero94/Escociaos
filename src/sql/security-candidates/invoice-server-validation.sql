-- LOCAL REVIEW CANDIDATE ONLY. Requires coordinated route/caller cutover.
BEGIN;
LOCK TABLE storage.objects,storage.buckets,public.compras,public.fin_gastos,public.fin_ingresos IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='facturas' AND public=false) THEN RAISE EXCEPTION 'Expected private invoice bucket'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='storage.objects'::regclass AND relrowsecurity) THEN RAISE EXCEPTION 'Storage RLS required'; END IF;
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='facturas' AND name LIKE 'verified/%') THEN RAISE EXCEPTION 'Reserved invoice namespace collides with legacy objects'; END IF;
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN ('storage.objects'::regclass,'storage.buckets'::regclass,'public.compras'::regclass,'public.fin_gastos'::regclass,'public.fin_ingresos'::regclass)) THEN RAISE EXCEPTION 'Invoice installation requires reviewed current Storage/reference triggers'; END IF;
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
CREATE POLICY invoice_server_insert_only ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(bucket_id<>'facturas');
CREATE POLICY invoice_server_update_only ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(bucket_id<>'facturas') WITH CHECK(bucket_id<>'facturas');
CREATE POLICY invoice_committed_namespace_only ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.invoice_object_committed(bucket_id,name));
COMMIT;
