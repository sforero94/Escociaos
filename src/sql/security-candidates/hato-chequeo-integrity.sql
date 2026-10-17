-- NONNUMBERED bull chequeoing after39candidates. Offline only; no history rewrite.
BEGIN;
SELECT alert_cron.lock_source();
DO $admission$ DECLARE fingerprint text;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed animal chequeo installation owner required';END IF;
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
 IF fingerprint IS DISTINCT FROM '7e357e3178db5a801e60189e511c5880' THEN RAISE EXCEPTION 'Unreviewed chequeo source graph %',fingerprint;END IF;
 PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_death.snapshot(uuid)') AND md5(p.prosrc)='a6bf1457f7ab6b1adf5cae9c9c78d308' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') OR EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role'))v(role) WHERE has_function_privilege(v.role,'hato_death.snapshot(uuid)','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed animal chequeo snapshot helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_treatment_creation.web_actor()') AND md5(p.prosrc)='1d8ec54936d4f658da49a965b828224c' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed animal chequeo actor helper';END IF;

 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_birth_undo.assert_registry()') AND md5(prosrc)='8cce85aa9cbd1281cc12e2f264e9ba42' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,'hato_birth_undo.assert_registry()','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed chequeo assert_registry helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_birth_undo.lock_domain()') AND md5(prosrc)='836f4e31322431b1f333f3a2191c942c' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,'hato_birth_undo.lock_domain()','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed chequeo lock_domain helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_birth_undo.capture_domain()') AND md5(prosrc)='54112d98b97f312ef67124a8d537868a' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,'hato_birth_undo.capture_domain()','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed chequeo capture_domain helper';END IF;
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
DO $capture_admit$ BEGIN
 IF (SELECT array_agg(attname::text ORDER BY attnum) FROM pg_attribute WHERE attrelid='public.hato_capturas_foto'::regclass AND attnum>0 AND NOT attisdropped) IS DISTINCT FROM ARRAY['id','creado_en','actualizado_en','tipo','origen','desenlace','anio','mes','fecha','storage_bucket','storage_prefijo','storage_rutas','storage_ok','fotos_recibidas','modelo','celdas_leidas_ocr','celdas_confirmadas','filas_escritas','detalle','created_by'] OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.hato_capturas_foto'::regclass AND NOT tgisinternal) THEN RAISE EXCEPTION 'Unreviewed chequeo capture shape/trigger';END IF;
END $capture_admit$;
CREATE SCHEMA hato_chequeo_integrity;
REVOKE ALL ON SCHEMA hato_chequeo_integrity FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_chequeo_integrity.requests(request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,intent jsonb,original jsonb,plan jsonb,effective_date date,state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,acknowledged boolean NOT NULL DEFAULT false,
 CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR intent IS NOT NULL AND original IS NOT NULL AND plan IS NOT NULL AND effective_date IS NOT NULL),CHECK(NOT acknowledged OR state IN('committed','canceled')));
CREATE UNIQUE INDEX one_original_registration ON hato_chequeo_integrity.requests(owner_id) WHERE state IN('pending','committed') AND NOT acknowledged;
CREATE TABLE hato_chequeo_integrity.audit(request_key uuid PRIMARY KEY REFERENCES hato_chequeo_integrity.requests(request_key),receipt jsonb NOT NULL);
ALTER TABLE hato_chequeo_integrity.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_chequeo_integrity.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_chequeo_integrity FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_chequeo_integrity.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' THEN RAISE EXCEPTION 'Immutable chequeo proof';END IF;
 IF ((to_jsonb(NEW)-'acknowledged')=(to_jsonb(OLD)-'acknowledged') AND NOT OLD.acknowledged AND NEW.acknowledged AND OLD.state IN('committed','canceled')) OR (OLD.state='pending' AND NEW.state IN('committed','canceled') AND (to_jsonb(NEW)-'state'-'receipt')=(to_jsonb(OLD)-'state'-'receipt')) THEN RETURN NEW;END IF;
 RAISE EXCEPTION 'Immutable original chequeo';
END $$;
CREATE TRIGGER immutable_registration_request BEFORE UPDATE OR DELETE ON hato_chequeo_integrity.requests FOR EACH ROW EXECUTE FUNCTION hato_chequeo_integrity.immutable();
CREATE TRIGGER immutable_registration_audit BEFORE UPDATE OR DELETE ON hato_chequeo_integrity.audit FOR EACH ROW EXECUTE FUNCTION hato_chequeo_integrity.immutable();
CREATE TRIGGER no_truncate_registration_request BEFORE TRUNCATE ON hato_chequeo_integrity.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_chequeo_integrity.immutable();
CREATE TRIGGER no_truncate_registration_audit BEFORE TRUNCATE ON hato_chequeo_integrity.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_chequeo_integrity.immutable();
CREATE FUNCTION hato_chequeo_integrity.controls() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('requests',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_chequeo_integrity.requests x),'audit',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY request_key),'[]') FROM hato_chequeo_integrity.audit x));
$$;
CREATE FUNCTION hato_chequeo_integrity.result(r hato_chequeo_integrity.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'owner',r.owner_id,'state',r.state,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'receipt',r.receipt,'acknowledged',coalesce(r.acknowledged,false));
$$;
CREATE FUNCTION hato_chequeo_integrity.source() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('animals',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.hato_animales t),'headers',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.hato_chequeos t),'details',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.hato_chequeo_vacas t),'events',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.hato_eventos t),'toros',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.hato_toros t),'captures',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.hato_capturas_foto t),'config',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY clave),'[]') FROM public.hato_config t));
$$;
CREATE FUNCTION hato_chequeo_integrity.service_actor(owner_id uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' OR owner_id IS NULL THEN RAISE EXCEPTION 'Trusted chequeo service principal required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.usuarios WHERE id=owner_id AND activo IS TRUE AND rol IN('Administrador','Gerencia') FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current active chequeo actor required' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('origin','web','profileId',owner_id);
END $$;
CREATE FUNCTION public.fn_hato_chequeo_source_service(p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN PERFORM hato_chequeo_integrity.service_actor(p_expected_owner);PERFORM hato_birth_undo.lock_domain();RETURN hato_chequeo_integrity.source();END $$;
CREATE FUNCTION hato_chequeo_integrity.plan(payload jsonb,original jsonb,owner_id uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE header public.hato_chequeos;detail public.hato_chequeo_vacas;event public.hato_eventos;bull public.hato_toros;v jsonb;e jsonb;old jsonb;matched jsonb;details jsonb='[]';events jsonb='[]';bulls jsonb='[]';old_details jsonb;old_events jsonb;day date;idx integer;name text;bid uuid;staging uuid=gen_random_uuid();
BEGIN
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(payload)k) IS DISTINCT FROM ARRAY['chequeo','eventos','vacas'] OR jsonb_typeof(payload->'chequeo') IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(payload->'chequeo')k) IS DISTINCT FROM ARRAY['fecha','veterinario'] OR jsonb_typeof(payload->'vacas') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'vacas') NOT BETWEEN 1 AND 1000 OR jsonb_typeof(payload->'eventos') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'eventos')>10000 THEN RAISE EXCEPTION 'Exact bounded chequeo payload required';END IF;
 day=(payload->'chequeo'->>'fecha')::date;
 IF day IS NULL OR day::text IS DISTINCT FROM payload->'chequeo'->>'fecha' OR jsonb_typeof(payload->'chequeo'->'veterinario') NOT IN('string','null') THEN RAISE EXCEPTION 'Canonical chequeo date required';END IF;
 IF(SELECT count(*) FROM public.hato_chequeos WHERE fecha=day)>1 THEN RAISE EXCEPTION 'Ambiguous chequeo header requires separate review';END IF;
 SELECT * INTO header FROM public.hato_chequeos WHERE fecha=day;
 IF NOT FOUND THEN header=jsonb_populate_record(NULL::public.hato_chequeos,jsonb_build_object('id',gen_random_uuid(),'fecha',day,'veterinario',payload->'chequeo'->'veterinario','estado','cerrado','fuente','web','created_by',owner_id));
 ELSIF payload->'chequeo'->>'veterinario' IS NOT NULL THEN header.veterinario=payload->'chequeo'->>'veterinario';END IF;
 old_details=(SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM jsonb_array_elements(original->'details')x WHERE x->>'chequeo_id'=header.id::text);
 old_events=(SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM jsonb_array_elements(original->'events')x WHERE x->>'chequeo_vaca_id' IN(SELECT d->>'id' FROM jsonb_array_elements(old_details)d));
 FOR v IN SELECT value FROM jsonb_array_elements(payload->'vacas') LOOP
  IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(v)k WHERE k NOT IN('animal_id','pl_raw','np_raw','ultima_cria_raw','sx_raw','fecha_servicio_raw','toro_raw','tp_raw','estado_raw','secar_raw','pp_raw','ttto_raw','pl','num_partos','fecha_servicio','toro','tipo_servicio','fecha_secar','fecha_probable_parto','meses_prenez','estado','normalizacion_issues')) THEN RAISE EXCEPTION 'Exact derived detail fields required';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.hato_animales WHERE id=(v->>'animal_id')::uuid) OR EXISTS(SELECT 1 FROM jsonb_array_elements(details)d WHERE d->>'animal_id'=v->>'animal_id') THEN RAISE EXCEPTION 'Unique current matched animal required';END IF;
  detail=jsonb_populate_record(NULL::public.hato_chequeo_vacas,v||jsonb_build_object('id',gen_random_uuid(),'chequeo_id',header.id));details=details||jsonb_build_array(to_jsonb(detail));
 END LOOP;
 FOR e IN SELECT value FROM jsonb_array_elements(payload->'eventos') LOOP
  IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(e)k) IS DISTINCT FROM ARRAY['cria_destino','datos','fecha','fecha_confianza','sx_raw','tipo','tipo_servicio','toro_nombre','vaca_index'] OR e->>'tipo' NOT IN('servicio','celo','confirmacion_prenez','parto','aborto','secado_real','rechequeo') THEN RAISE EXCEPTION 'Exact derived clinical event required';END IF;
  idx=(e->>'vaca_index')::integer;
  IF idx IS NULL OR idx<0 OR idx>=jsonb_array_length(details) THEN RAISE EXCEPTION 'Derived event detail index out of range';END IF;
  name=nullif(btrim(e->>'toro_nombre'),'');bid=NULL;
  IF name IS NOT NULL THEN
   SELECT id INTO bid FROM public.hato_toros WHERE lower(nombre)=lower(name);
   IF bid IS NULL THEN SELECT (x->>'id')::uuid INTO bid FROM jsonb_array_elements(bulls)x WHERE lower(x->>'nombre')=lower(name);END IF;
   IF bid IS NULL THEN bull=jsonb_populate_record(NULL::public.hato_toros,jsonb_build_object('id',gen_random_uuid(),'nombre',name,'activo',true,'created_by',owner_id));bulls=bulls||jsonb_build_array(to_jsonb(bull));bid=bull.id;END IF;
  END IF;
  event=jsonb_populate_record(NULL::public.hato_eventos,(e-'vaca_index'-'toro_nombre')||jsonb_build_object('id',gen_random_uuid(),'animal_id',details->idx->'animal_id','chequeo_vaca_id',details->idx->'id','toro_id',bid,'fuente','chequeo','created_by',owner_id));events=events||jsonb_build_array(to_jsonb(event));
 END LOOP;
 FOR old IN SELECT value FROM jsonb_array_elements(old_events) LOOP
  IF old->>'alerta_id' IS NOT NULL OR old->>'fin_ingreso_id' IS NOT NULL OR old->>'transaccion_ganado_id' IS NOT NULL OR coalesce(old->'datos','{}')?'pajilla_uso_id' THEN RAISE EXCEPTION 'Other coupled chequeo event requires separate review';END IF;
  IF old->>'cria_id' IS NOT NULL THEN
   IF old->>'tipo'<>'parto' OR(SELECT count(*) FROM jsonb_array_elements(events)x WHERE (x-'id'-'chequeo_vaca_id'-'created_by'-'created_at'-'cria_id')=(old-'id'-'chequeo_vaca_id'-'created_by'-'created_at'-'cria_id'))<>1 THEN RAISE EXCEPTION 'Changed or missing linked birth requires Santiago review';END IF;
   SELECT x INTO matched FROM jsonb_array_elements(events)x WHERE (x-'id'-'chequeo_vaca_id'-'created_by'-'created_at'-'cria_id')=(old-'id'-'chequeo_vaca_id'-'created_by'-'created_at'-'cria_id');
   events=(SELECT jsonb_agg(CASE WHEN x=matched THEN old||jsonb_build_object('chequeo_vaca_id',matched->'chequeo_vaca_id') ELSE x END ORDER BY ordinal) FROM jsonb_array_elements(events) WITH ORDINALITY a(x,ordinal));
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(old_events)o WHERE o->>'cria_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(events)birth_row WHERE birth_row->>'id'=o->>'id')) THEN RAISE EXCEPTION 'Ambiguous linked births require Santiago review';END IF;
 RETURN jsonb_build_object('header',to_jsonb(header),'details',details,'events',events,'bulls',bulls,'oldDetails',old_details,'oldEvents',old_events,'stagingHeaderId',staging);
END $$;
CREATE FUNCTION public.fn_hato_chequeo_prepare_service(p_expected_owner uuid,p_request_key uuid,p_intent jsonb,p_original jsonb,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r hato_chequeo_integrity.requests;expected hato_chequeo_integrity.requests;before_domain jsonb;before_controls jsonb;expected_controls jsonb;
BEGIN
 PERFORM hato_chequeo_integrity.service_actor(p_expected_owner);
 IF p_request_key IS NULL OR jsonb_typeof(p_intent) IS DISTINCT FROM 'object' OR octet_length(p_intent::text)>1048576 THEN RAISE EXCEPTION 'Bounded original chequeo intent required';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-chequeo-owner:'||p_expected_owner::text,0));PERFORM pg_advisory_xact_lock(hashtextextended('hato-chequeo-key:'||p_request_key::text,0));
 SELECT * INTO r FROM hato_chequeo_integrity.requests WHERE request_key=p_request_key FOR UPDATE;
 IF FOUND THEN IF r.owner_id<>p_expected_owner OR(r.intent IS NOT NULL AND r.intent IS DISTINCT FROM p_intent) THEN RAISE EXCEPTION 'Original chequeo owner/intent changed';END IF;RETURN hato_chequeo_integrity.result(r);END IF;
 IF EXISTS(SELECT 1 FROM hato_chequeo_integrity.requests WHERE owner_id=p_expected_owner AND state IN('pending','committed') AND NOT acknowledged) THEN RAISE EXCEPTION 'Recover original chequeo before replacement';END IF;
 IF p_original IS NULL AND p_payload IS NULL THEN RETURN NULL;END IF;
 PERFORM hato_birth_undo.lock_domain();PERFORM correction_audit_integrity.assert_boundary();
 IF hato_chequeo_integrity.source() IS DISTINCT FROM p_original THEN RAISE EXCEPTION 'Chequeo planning source changed';END IF;
 before_domain=hato_birth_undo.capture_domain();before_controls=hato_chequeo_integrity.controls();
 expected.request_key=p_request_key;expected.owner_id=p_expected_owner;expected.intent=p_intent;expected.original=p_original;expected.plan=hato_chequeo_integrity.plan(p_payload,p_original,p_expected_owner);IF p_intent->>'capturaId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hato_capturas_foto WHERE id=(p_intent->>'capturaId')::uuid AND created_by=p_expected_owner AND tipo='chequeo') THEN RAISE EXCEPTION 'Current owned chequeo capture required';END IF;expected.plan=expected.plan||jsonb_build_object('capture',(SELECT x FROM jsonb_array_elements(p_original->'captures')x WHERE x->>'id'=p_intent->>'capturaId'));expected.effective_date=(now() AT TIME ZONE 'America/Bogota')::date;expected.state='pending';expected.acknowledged=false;
 INSERT INTO hato_chequeo_integrity.requests SELECT expected.* RETURNING * INTO r;
 expected_controls=jsonb_set(before_controls,'{requests}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((before_controls->'requests')||jsonb_build_array(to_jsonb(expected)))x));
 IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) OR hato_chequeo_integrity.controls() IS DISTINCT FROM expected_controls OR hato_birth_undo.capture_domain() IS DISTINCT FROM before_domain OR hato_chequeo_integrity.service_actor(p_expected_owner) IS NULL THEN RAISE EXCEPTION 'Chequeo prepare readback mismatch';END IF;
 RETURN hato_chequeo_integrity.result(r);
END $$;
CREATE FUNCTION hato_chequeo_integrity.patch(domain jsonb,table_name text,removed jsonb,added jsonb) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_set(domain,ARRAY['public.'||table_name],(SELECT coalesce(jsonb_agg(v.x ORDER BY v.x::text),'[]') FROM (SELECT x FROM jsonb_array_elements(domain->('public.'||table_name))x WHERE x->>'id' NOT IN(SELECT y->>'id' FROM jsonb_array_elements(removed)y) UNION ALL SELECT x FROM jsonb_array_elements(added)x)v));
$$;
CREATE FUNCTION hato_chequeo_integrity.mutation(table_name text,operation text,before_row jsonb,after_row jsonb) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('table',table_name,'operation',operation,'before',before_row,'after',after_row);
$$;
CREATE FUNCTION public.fn_hato_chequeo_web(p_action text,p_request_key uuid,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_chequeo_integrity.requests;expected hato_chequeo_integrity.requests;expected_domain jsonb;before_domain jsonb;before_controls jsonb;expected_controls jsonb;capture_after jsonb;changes jsonb='[]';traces jsonb;change jsonb;trace jsonb;v jsonb;w jsonb;old jsonb;after_rows jsonb;header jsonb;stage jsonb;details jsonb='[]';events jsonb='[]';bulls jsonb='[]';receipt_value jsonb;a hato_chequeo_integrity.audit;wa hato_chequeo_integrity.audit;staged boolean;
BEGIN
 IF auth.uid() IS DISTINCT FROM p_expected_owner OR p_expected_owner IS NULL OR p_request_key IS NULL THEN RAISE EXCEPTION 'Original chequeo owner/key required' USING ERRCODE='42501';END IF;
 actor=hato_treatment_creation.web_actor();
 IF p_action IS NULL OR p_action NOT IN('post','status','resolve','acknowledge') THEN RAISE EXCEPTION 'Invalid original chequeo action';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-chequeo-owner:'||p_expected_owner::text,0));PERFORM pg_advisory_xact_lock(hashtextextended('hato-chequeo-key:'||p_request_key::text,0));
 SELECT * INTO r FROM hato_chequeo_integrity.requests WHERE request_key=p_request_key FOR UPDATE;
 IF FOUND AND r.owner_id<>p_expected_owner THEN RAISE EXCEPTION 'Original chequeo owner changed';END IF;
 IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_chequeo_integrity.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original chequeo audit missing';END IF;
 IF p_action='status' THEN IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='unknown';r.acknowledged=false;END IF;RETURN hato_chequeo_integrity.result(r);END IF;
 PERFORM hato_birth_undo.lock_domain();PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
 before_domain=hato_birth_undo.capture_domain();expected_domain=before_domain;before_controls=hato_chequeo_integrity.controls();expected_controls=before_controls;
 IF p_action='resolve' THEN
  IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='canceled';r.acknowledged=false;expected=r;INSERT INTO hato_chequeo_integrity.requests SELECT expected.* RETURNING * INTO r;
  ELSIF r.state='pending' THEN expected=r;expected.state='canceled';UPDATE hato_chequeo_integrity.requests SET state='canceled' WHERE request_key=p_request_key RETURNING * INTO r;
  ELSE RETURN hato_chequeo_integrity.result(r);END IF;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Chequeo cancellation suppressed/mutated';END IF;
 ELSIF p_action='acknowledge' THEN
  IF r.state IS NULL OR r.state NOT IN('committed','canceled') THEN RAISE EXCEPTION 'Verify terminal original chequeo first';END IF;
  IF r.acknowledged THEN RETURN hato_chequeo_integrity.result(r);END IF;
  expected=r;expected.acknowledged=true;UPDATE hato_chequeo_integrity.requests SET acknowledged=true WHERE request_key=p_request_key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Chequeo acknowledgment suppressed/mutated';END IF;
 ELSE
  IF r.state IS NULL THEN RAISE EXCEPTION 'Original prepared chequeo required';END IF;
  IF r.state='committed' THEN RETURN hato_chequeo_integrity.result(r);ELSIF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled chequeo cannot post';END IF;
  IF r.effective_date IS DISTINCT FROM (now() AT TIME ZONE 'America/Bogota')::date OR hato_chequeo_integrity.source() IS DISTINCT FROM r.original THEN RAISE EXCEPTION 'Original chequeo source/day changed; resolve original';END IF;
  header=r.plan->'header';SELECT x INTO old FROM jsonb_array_elements(r.original->'headers')x WHERE x->>'id'=header->>'id';
  IF old IS NULL THEN header=header||jsonb_build_object('created_at',now());INSERT INTO public.hato_chequeos SELECT (jsonb_populate_record(NULL::public.hato_chequeos,header)).* RETURNING to_jsonb(hato_chequeos.*) INTO w;
  ELSE UPDATE public.hato_chequeos SET veterinario=header->>'veterinario' WHERE id=(header->>'id')::uuid RETURNING to_jsonb(hato_chequeos.*) INTO w;END IF;
  IF NOT FOUND OR w IS DISTINCT FROM header THEN RAISE EXCEPTION 'Chequeo header suppressed/mutated';END IF;
  expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_chequeos',jsonb_build_array(header),jsonb_build_array(header));
  FOR v IN SELECT value FROM jsonb_array_elements(r.plan->'bulls') LOOP
   v=v||jsonb_build_object('created_at',now());INSERT INTO public.hato_toros SELECT (jsonb_populate_record(NULL::public.hato_toros,v)).* RETURNING to_jsonb(hato_toros.*) INTO w;
   IF NOT FOUND OR w IS DISTINCT FROM v THEN RAISE EXCEPTION 'Chequeo bull suppressed/mutated';END IF;bulls=bulls||jsonb_build_array(v);
  END LOOP;
  staged=jsonb_array_length(r.plan->'oldDetails')>0;
  IF staged THEN
   stage=header||jsonb_build_object('id',r.plan->'stagingHeaderId','created_by',p_expected_owner,'created_at',now());
   INSERT INTO public.hato_chequeos SELECT (jsonb_populate_record(NULL::public.hato_chequeos,stage)).* RETURNING to_jsonb(hato_chequeos.*) INTO w;
   IF NOT FOUND OR w IS DISTINCT FROM stage THEN RAISE EXCEPTION 'Chequeo staging header suppressed/mutated';END IF;
  END IF;
  FOR v IN SELECT value FROM jsonb_array_elements(r.plan->'details') LOOP
   v=v||jsonb_build_object('created_at',now());details=details||jsonb_build_array(v);
   IF staged THEN v=v||jsonb_build_object('chequeo_id',r.plan->'stagingHeaderId');END IF;
   INSERT INTO public.hato_chequeo_vacas SELECT (jsonb_populate_record(NULL::public.hato_chequeo_vacas,v)).* RETURNING to_jsonb(hato_chequeo_vacas.*) INTO w;
   IF NOT FOUND OR w IS DISTINCT FROM v THEN RAISE EXCEPTION 'Chequeo detail insert suppressed/mutated';END IF;
  END LOOP;
  FOR v IN SELECT value FROM jsonb_array_elements(r.plan->'events') LOOP
   SELECT x INTO old FROM jsonb_array_elements(r.plan->'oldEvents')x WHERE x->>'id'=v->>'id';
   IF old IS NULL THEN v=v||jsonb_build_object('created_at',now());INSERT INTO public.hato_eventos SELECT (jsonb_populate_record(NULL::public.hato_eventos,v)).* RETURNING to_jsonb(hato_eventos.*) INTO w;
   ELSE
    IF(old-'chequeo_vaca_id') IS DISTINCT FROM(v-'chequeo_vaca_id') OR old->>'cria_id' IS NULL THEN RAISE EXCEPTION 'Original linked birth facts changed';END IF;
    UPDATE public.hato_eventos SET chequeo_vaca_id=(v->>'chequeo_vaca_id')::uuid WHERE id=(v->>'id')::uuid RETURNING to_jsonb(hato_eventos.*) INTO w;
    changes=changes||jsonb_build_array(hato_chequeo_integrity.mutation('hato_eventos','update',old,v));
   END IF;
   IF NOT FOUND OR w IS DISTINCT FROM v THEN RAISE EXCEPTION 'Chequeo event insert/reassociation suppressed/mutated';END IF;events=events||jsonb_build_array(v);
  END LOOP;
  FOR old IN SELECT value FROM jsonb_array_elements(r.plan->'oldEvents') LOOP
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(events)x WHERE x->>'id'=old->>'id') THEN
    IF old->>'cria_id' IS NOT NULL THEN RAISE EXCEPTION 'Linked birth missing requires Santiago review';END IF;
    DELETE FROM public.hato_eventos WHERE id=(old->>'id')::uuid RETURNING to_jsonb(hato_eventos.*) INTO w;
    IF NOT FOUND OR w IS DISTINCT FROM old THEN RAISE EXCEPTION 'Chequeo old event delete suppressed/mutated';END IF;
    changes=changes||jsonb_build_array(hato_chequeo_integrity.mutation('hato_eventos','delete',old,NULL));
   END IF;
  END LOOP;
  FOR old IN SELECT value FROM jsonb_array_elements(r.plan->'oldDetails') LOOP
   DELETE FROM public.hato_chequeo_vacas WHERE id=(old->>'id')::uuid RETURNING to_jsonb(hato_chequeo_vacas.*) INTO w;
   IF NOT FOUND OR w IS DISTINCT FROM old THEN RAISE EXCEPTION 'Chequeo old detail delete suppressed/mutated';END IF;
   changes=changes||jsonb_build_array(hato_chequeo_integrity.mutation('hato_chequeo_vacas','delete',old,NULL));
  END LOOP;
  IF staged THEN
   FOR v IN SELECT value FROM jsonb_array_elements(details) LOOP
    old=v||jsonb_build_object('chequeo_id',r.plan->'stagingHeaderId');UPDATE public.hato_chequeo_vacas SET chequeo_id=(v->>'chequeo_id')::uuid WHERE id=(v->>'id')::uuid RETURNING to_jsonb(hato_chequeo_vacas.*) INTO w;
    IF NOT FOUND OR w IS DISTINCT FROM v THEN RAISE EXCEPTION 'Chequeo detail promotion suppressed/mutated';END IF;
    changes=changes||jsonb_build_array(hato_chequeo_integrity.mutation('hato_chequeo_vacas','update',old,v));
   END LOOP;
   DELETE FROM public.hato_chequeos WHERE id=(stage->>'id')::uuid RETURNING to_jsonb(hato_chequeos.*) INTO w;
   IF NOT FOUND OR w IS DISTINCT FROM stage THEN RAISE EXCEPTION 'Chequeo staging cleanup suppressed/mutated';END IF;
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]') INTO traces FROM public.hato_correcciones t WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(before_domain->'public.hato_correcciones')x WHERE x->>'id'=t.id::text);
  IF jsonb_array_length(traces)<>jsonb_array_length(changes) THEN RAISE EXCEPTION 'Exact chequeo correction trace count required';END IF;
  FOR change IN SELECT value FROM jsonb_array_elements(changes) LOOP
   IF(SELECT count(*) FROM jsonb_array_elements(traces)t WHERE t->>'tabla'=change->>'table' AND t->>'operacion'=change->>'operation' AND t->'datos_anteriores'=change->'before' AND t->'datos_nuevos'=change->'after' AND t->>'fila_id'=change->'before'->>'id' AND t->>'animal_id'=change->'before'->>'animal_id' AND t->>'corregido_por'=p_expected_owner::text AND(t->>'corregido_en')::timestamptz=now() AND t->>'motivo' IS NOT DISTINCT FROM change->'after'->'datos'->>'motivo_correccion')<>1 THEN RAISE EXCEPTION 'Exact trusted chequeo correction trace required';END IF;
  END LOOP;
  expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_toros','[]',bulls);
  expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_chequeo_vacas',r.plan->'oldDetails',details);
  expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_eventos',r.plan->'oldEvents',events);
  expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_correcciones','[]',traces);
  capture_after=r.plan->'capture';
  IF capture_after IS DISTINCT FROM 'null'::jsonb THEN
   capture_after=capture_after||jsonb_build_object('desenlace','ok','actualizado_en',now(),'celdas_confirmadas',jsonb_array_length(r.intent->'filas'),'filas_escritas',jsonb_array_length(details),'detalle',NULL);
   UPDATE public.hato_capturas_foto SET desenlace='ok',actualizado_en=now(),celdas_confirmadas=jsonb_array_length(r.intent->'filas'),filas_escritas=jsonb_array_length(details),detalle=NULL WHERE id=(capture_after->>'id')::uuid AND created_by=p_expected_owner AND tipo='chequeo' RETURNING to_jsonb(hato_capturas_foto.*) INTO w;
   IF NOT FOUND OR w IS DISTINCT FROM capture_after THEN RAISE EXCEPTION 'Chequeo capture suppressed/mutated';END IF;
   expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_capturas_foto',jsonb_build_array(r.plan->'capture'),jsonb_build_array(capture_after));
  END IF;
  after_rows=jsonb_build_object('capture',capture_after,'header',header,'details',details,'events',events,'bulls',bulls);
  receipt_value=jsonb_build_object('version',1,'requestKey',p_request_key,'owner',p_expected_owner,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'actor',actor,'recordedAt',now(),'after',after_rows,'corrections',traces,'footprints',jsonb_build_object('before',encode(sha256(convert_to(before_domain::text,'UTF8')),'hex'),'after',encode(sha256(convert_to(expected_domain::text,'UTF8')),'hex')));
  a.request_key=p_request_key;a.receipt=receipt_value;INSERT INTO hato_chequeo_integrity.audit SELECT a.* RETURNING * INTO wa;
  IF NOT FOUND OR to_jsonb(wa) IS DISTINCT FROM to_jsonb(a) THEN RAISE EXCEPTION 'Chequeo operation audit suppressed/mutated';END IF;
  expected=r;expected.state='committed';expected.receipt=receipt_value;UPDATE hato_chequeo_integrity.requests SET state='committed',receipt=receipt_value WHERE request_key=p_request_key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Chequeo committed control suppressed/mutated';END IF;
  expected_controls=jsonb_set(expected_controls,'{audit}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((expected_controls->'audit')||jsonb_build_array(to_jsonb(a)))x));
 END IF;
 expected_controls=jsonb_set(expected_controls,'{requests}',(SELECT jsonb_agg(x ORDER BY x->>'request_key') FROM jsonb_array_elements((SELECT coalesce(jsonb_agg(x),'[]') FROM jsonb_array_elements(before_controls->'requests')x WHERE x->>'request_key'<>p_request_key::text)||jsonb_build_array(to_jsonb(expected)))x));
 IF hato_chequeo_integrity.controls() IS DISTINCT FROM expected_controls OR hato_birth_undo.capture_domain() IS DISTINCT FROM expected_domain OR hato_treatment_creation.web_actor() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Chequeo final authority/domain/control readback mismatch';END IF;
 RETURN hato_chequeo_integrity.result(r);
END $$;
CREATE FUNCTION public.fn_hato_chequeo_recover_web(p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r hato_chequeo_integrity.requests;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Current chequeo owner required';END IF;
 PERFORM hato_treatment_creation.web_actor();PERFORM pg_advisory_xact_lock(hashtextextended('hato-chequeo-owner:'||p_expected_owner::text,0));
 SELECT * INTO r FROM hato_chequeo_integrity.requests WHERE owner_id=p_expected_owner AND state IN('pending','committed') AND NOT acknowledged;
 IF NOT FOUND THEN RETURN NULL;END IF;RETURN public.fn_hato_chequeo_web('status',r.request_key,p_expected_owner);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_chequeo_integrity FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_chequeo_web(text,uuid,uuid),public.fn_hato_chequeo_recover_web(uuid),public.fn_hato_chequeo_source_service(uuid),public.fn_hato_chequeo_prepare_service(uuid,uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_chequeo_web(text,uuid,uuid),public.fn_hato_chequeo_recover_web(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hato_chequeo_source_service(uuid),public.fn_hato_chequeo_prepare_service(uuid,uuid,jsonb,jsonb,jsonb) TO service_role;
COMMIT;
