-- NONNUMBERED Standalone event correction foundation after31candidates. Offline only.
-- No caller cutover or grant retirement in this foundation.
-- Existing identity/source/raw records stay intact; coupled events refuse.
BEGIN;
SELECT alert_cron.lock_source();
DO $admission$ DECLARE fingerprint text;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed event correction installation owner required';END IF;
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
 IF fingerprint IS DISTINCT FROM '5ae11977b7a8e2f574bd41bb07f76ddc' THEN RAISE EXCEPTION 'Unreviewed event correction source graph';END IF;
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
 IF fingerprint IS DISTINCT FROM 'e0e432ae1b0ae23408509079dde7921c' THEN RAISE EXCEPTION 'Unreviewed event correction inventory graph %',fingerprint;END IF;
 PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_death.snapshot(uuid)') AND md5(p.prosrc)='a6bf1457f7ab6b1adf5cae9c9c78d308' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') OR EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role'))v(role) WHERE has_function_privilege(v.role,'hato_death.snapshot(uuid)','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed event correction snapshot helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_treatment_creation.web_actor()') AND md5(p.prosrc)='1d8ec54936d4f658da49a965b828224c' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed event correction actor helper';END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid='public.hato_eventos'::regclass) THEN RAISE EXCEPTION 'Unreviewed incoming event FK boundary';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_pajilla_use.inventory()') AND md5(p.prosrc)='56e38e19c11fe0f46810e1a578778ce8' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed correction inventory helper';END IF;
END $admission$;
CREATE SCHEMA hato_event_correction;
REVOKE ALL ON SCHEMA hato_event_correction FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_event_correction.requests(request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,intent jsonb,original jsonb,plan jsonb,effective_date date,state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR intent IS NOT NULL AND original IS NOT NULL AND plan IS NOT NULL AND effective_date IS NOT NULL));
CREATE TABLE hato_event_correction.audit(request_key uuid PRIMARY KEY REFERENCES hato_event_correction.requests(request_key),receipt jsonb NOT NULL);
ALTER TABLE hato_event_correction.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_event_correction.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_event_correction FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_event_correction.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' THEN RAISE EXCEPTION 'Immutable event correction proof';END IF;
 IF OLD.state<>'pending' OR NEW.state NOT IN('committed','canceled') OR (to_jsonb(NEW)-'state'-'receipt') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'receipt') THEN RAISE EXCEPTION 'Immutable event correction proof';END IF;RETURN NEW;END $$;
CREATE TRIGGER immutable_request BEFORE UPDATE OR DELETE ON hato_event_correction.requests FOR EACH ROW EXECUTE FUNCTION hato_event_correction.immutable();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON hato_event_correction.audit FOR EACH ROW EXECUTE FUNCTION hato_event_correction.immutable();
CREATE TRIGGER no_truncate_request BEFORE TRUNCATE ON hato_event_correction.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_event_correction.immutable();
CREATE TRIGGER no_truncate_audit BEFORE TRUNCATE ON hato_event_correction.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_event_correction.immutable();
CREATE FUNCTION hato_event_correction.validate_intent(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE v jsonb;d date;field_name text;BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p)k) IS DISTINCT FROM ARRAY['changes','eventId','mode','observedEvent','version'] OR p->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p->'eventId') IS DISTINCT FROM 'string' OR ((p->>'eventId')::uuid)::text IS DISTINCT FROM p->>'eventId' OR jsonb_typeof(p->'observedEvent') IS DISTINCT FROM 'object' OR p->>'eventId' IS DISTINCT FROM p->'observedEvent'->>'id' OR jsonb_typeof(p->'mode') IS DISTINCT FROM 'string' OR p->>'mode' NOT IN('edit','delete') THEN RAISE EXCEPTION 'Exact bounded event correction intent required';END IF;
 IF p->>'mode'='delete' THEN IF p->'changes' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Delete cannot carry edits';END IF;RETURN;END IF;
 v=p->'changes';IF jsonb_typeof(v) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v)k) IS DISTINCT FROM ARRAY['cria_destino','fecha','fecha_confianza','motivo','nota','tipo_servicio','toro_id'] OR jsonb_typeof(v->'fecha') IS DISTINCT FROM 'string' OR jsonb_typeof(v->'fecha_confianza') IS DISTINCT FROM 'string' OR v->>'fecha_confianza' NOT IN('exacta','aproximada','desconocida') OR (v->'tipo_servicio' IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(v->'tipo_servicio') IS DISTINCT FROM 'string' OR v->>'tipo_servicio' NOT IN('monta','inseminacion'))) OR (v->'cria_destino' IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(v->'cria_destino') IS DISTINCT FROM 'string' OR v->>'cria_destino' NOT IN('retenida','hembra_vendida','macho_vendido','muerta','aborto'))) OR (v->'toro_id' IS DISTINCT FROM 'null'::jsonb AND (jsonb_typeof(v->'toro_id') IS DISTINCT FROM 'string' OR ((v->>'toro_id')::uuid)::text IS DISTINCT FROM v->>'toro_id')) THEN RAISE EXCEPTION 'Exact editable event values required';END IF;
 d=(v->>'fecha')::date;IF NOT isfinite(d) OR to_char(d,'YYYY-MM-DD') IS DISTINCT FROM v->>'fecha' THEN RAISE EXCEPTION 'Canonical corrected date required';END IF;
 FOREACH field_name IN ARRAY ARRAY['nota','motivo'] LOOP IF jsonb_typeof(v->field_name) IS DISTINCT FROM 'string' OR length(v->>field_name)>4000 OR btrim(v->>field_name) IS DISTINCT FROM v->>field_name THEN RAISE EXCEPTION 'Bounded canonical correction text required';END IF;END LOOP;
END $$;
CREATE FUNCTION hato_event_correction.snapshot(p jsonb) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('event',(SELECT to_jsonb(x) FROM public.hato_eventos x WHERE id=(p->>'eventId')::uuid),'graph',hato_death.snapshot((p->'observedEvent'->>'animal_id')::uuid),'toro',(SELECT to_jsonb(x) FROM public.hato_toros x WHERE id=(CASE WHEN p->>'mode'='edit' THEN p->'changes'->>'toro_id' ELSE p->'observedEvent'->>'toro_id' END)::uuid));
$$;
CREATE FUNCTION hato_event_correction.planned(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE e jsonb=p->'observedEvent';v jsonb=p->'changes';data jsonb=coalesce(nullif(p->'observedEvent'->'datos','null'::jsonb),'{}');BEGIN
 IF p->>'mode'='delete' THEN RETURN jsonb_build_object('event',NULL);END IF;
 IF v->>'nota'='' THEN data=data-'nota';ELSE data=data||jsonb_build_object('nota',v->'nota');END IF;
 IF v->>'motivo'<>'' THEN data=data||jsonb_build_object('motivo_correccion',v->'motivo');END IF;
 RETURN jsonb_build_object('event',e||(v-'nota'-'motivo')||jsonb_build_object('datos',nullif(data,'{}'::jsonb)));
END $$;
CREATE FUNCTION hato_event_correction.standalone(e jsonb,p jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF e->>'tipo' NOT IN('servicio','celo','confirmacion_prenez','parto','aborto','secado_real','rechequeo') OR e->>'cria_id' IS NOT NULL OR e->>'alerta_id' IS NOT NULL OR e->>'transaccion_ganado_id' IS NOT NULL OR e->>'fin_ingreso_id' IS NOT NULL OR e->>'cria_destino'='retenida' OR e->>'tipo_servicio'='inseminacion' OR (e->'datos'<>'null'::jsonb AND (jsonb_typeof(e->'datos') IS DISTINCT FROM 'object' OR (e->'datos')?'pajilla_uso_id')) THEN RAISE EXCEPTION 'Coupled or ambiguous event requires coordinated lifecycle';END IF;
 IF EXISTS(SELECT 1 FROM public.hato_pajillas_uso WHERE animal_id=(e->>'animal_id')::uuid AND fecha_uso=(e->>'fecha')::date) THEN RAISE EXCEPTION 'Potential inventory association requires coordinated lifecycle';END IF;
 IF p->>'mode'='edit' THEN
  IF p->'changes'->>'cria_destino'='retenida' OR p->'changes'->>'tipo_servicio'='inseminacion' THEN RAISE EXCEPTION 'Coupled new event state requires coordinated lifecycle';END IF;
  IF e->>'tipo'<>'servicio' AND ((p->'changes'->'tipo_servicio') IS DISTINCT FROM e->'tipo_servicio' OR (p->'changes'->'toro_id') IS DISTINCT FROM e->'toro_id') THEN RAISE EXCEPTION 'Only service bull/type is editable';END IF;
  IF e->>'tipo'<>'parto' AND (p->'changes'->'cria_destino') IS DISTINCT FROM e->'cria_destino' THEN RAISE EXCEPTION 'Only birth destination is editable';END IF;
  IF EXISTS(SELECT 1 FROM public.hato_pajillas_uso WHERE animal_id=(e->>'animal_id')::uuid AND fecha_uso=(p->'changes'->>'fecha')::date) THEN RAISE EXCEPTION 'Potential new inventory association requires coordinated lifecycle';END IF;
 END IF;
END $$;
CREATE FUNCTION hato_event_correction.result(r hato_event_correction.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'owner',r.owner_id,'state',r.state,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'receipt',r.receipt);
$$;
CREATE FUNCTION public.fn_hato_event_correction_web(p_action text,p_request_key uuid,p_intent jsonb,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_event_correction.requests;expected hato_event_correction.requests;original jsonb;actual jsonb;planned_event jsonb;expected_after jsonb;before_source jsonb;expected_source jsonb;before_inventory jsonb;view_inputs jsonb;e public.hato_eventos;written public.hato_eventos;correction public.hato_correcciones;correction_rows jsonb;new_receipt jsonb;audit hato_event_correction.audit;written_audit hato_event_correction.audit;day date;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner OR p_request_key IS NULL THEN RAISE EXCEPTION 'Original event correction owner/key required' USING ERRCODE='42501';END IF;
 actor=hato_treatment_creation.web_actor();IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve') THEN RAISE EXCEPTION 'Invalid event correction action';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-event-correction:'||p_request_key::text,0));SELECT * INTO r FROM hato_event_correction.requests WHERE request_key=p_request_key FOR UPDATE;
 IF FOUND AND r.owner_id IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original event correction owner changed' USING ERRCODE='42501';END IF;
 IF coalesce(r.intent->>'mode',p_intent->>'mode')='delete' AND NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_expected_owner AND activo AND rol='Gerencia') THEN RAISE EXCEPTION 'Fresh Gerencia required for event deletion' USING ERRCODE='42501';END IF;
 IF p_action<>'prepare' AND p_intent IS NOT NULL THEN RAISE EXCEPTION 'Original event correction intent cannot be replaced';END IF;
 IF p_action='status' THEN
  IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='unknown';RETURN hato_event_correction.result(r);END IF;
  IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_event_correction.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original event correction audit missing';END IF;RETURN hato_event_correction.result(r);
 END IF;
 PERFORM alert_cron.lock_source();LOCK TABLE public.hato_toros,public.hato_pajillas,public.hato_pajillas_uso IN SHARE ROW EXCLUSIVE MODE;LOCK TABLE public.v_hato_pajillas_stock IN SHARE MODE;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid='public.hato_eventos'::regclass) THEN RAISE EXCEPTION 'Unreviewed incoming event FK boundary';END IF;
 before_source=alert_cron.source();expected_source=before_source;before_inventory=hato_pajilla_use.inventory();view_inputs=jsonb_build_object('checks',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeo_vacas x),'headers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeos x));
 IF p_action='prepare' THEN
  PERFORM hato_event_correction.validate_intent(p_intent);
  IF r.request_key IS NOT NULL THEN IF r.intent IS NOT NULL AND r.intent IS DISTINCT FROM p_intent THEN RAISE EXCEPTION 'Original event correction intent changed';END IF;RETURN hato_event_correction.result(r);END IF;
  original=hato_event_correction.snapshot(p_intent);day=(now() AT TIME ZONE 'America/Bogota')::date;
  IF jsonb_typeof(original->'event') IS DISTINCT FROM 'object' OR original->'event' IS DISTINCT FROM p_intent->'observedEvent' OR jsonb_typeof(original->'graph'->'animal') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Observed event/animal changed';END IF;
  PERFORM hato_event_correction.standalone(original->'event',p_intent);
  IF p_intent->>'mode'='edit' AND ((p_intent->'changes'->>'fecha')::date>day OR (p_intent->'changes'->>'toro_id' IS NOT NULL AND jsonb_typeof(original->'toro') IS DISTINCT FROM 'object')) THEN RAISE EXCEPTION 'Corrected date or selected bull invalid';END IF;
  IF p_intent->>'mode'='edit' AND p_intent->'changes'->>'motivo'='' AND original->'event'->'datos'?'motivo_correccion' AND jsonb_typeof(original->'event'->'datos'->'motivo_correccion') NOT IN('string','null') THEN RAISE EXCEPTION 'Explicit reason required for ambiguous existing correction reason';END IF;
  r.plan=hato_event_correction.planned(p_intent);IF p_intent->>'mode'='edit' AND r.plan->'event'=original->'event' THEN RAISE EXCEPTION 'No event correction requested';END IF;
  r.request_key=p_request_key;r.owner_id=p_expected_owner;r.intent=p_intent;r.original=original;r.effective_date=day;r.state='pending';expected=r;
  INSERT INTO hato_event_correction.requests SELECT expected.* RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Event correction reservation suppressed/mutated';END IF;
 ELSIF p_action='resolve' THEN
  IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='canceled';expected=r;INSERT INTO hato_event_correction.requests SELECT expected.* RETURNING * INTO r;
  ELSIF r.state='pending' THEN expected=r;expected.state='canceled';UPDATE hato_event_correction.requests SET state='canceled' WHERE request_key=p_request_key RETURNING * INTO r;
  ELSE RETURN hato_event_correction.result(r);END IF;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Event correction cancellation suppressed/mutated';END IF;
 ELSIF p_action='post' THEN
  IF r.request_key IS NULL THEN RAISE EXCEPTION 'Original prepared event correction required';END IF;
  IF r.state='committed' THEN IF NOT EXISTS(SELECT 1 FROM hato_event_correction.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original event correction audit missing';END IF;RETURN hato_event_correction.result(r);ELSIF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled correction cannot post';END IF;
  original=r.original;IF r.effective_date IS DISTINCT FROM (now() AT TIME ZONE 'America/Bogota')::date THEN RAISE EXCEPTION 'Prepared correction day elapsed';END IF;
  IF hato_event_correction.snapshot(r.intent) IS DISTINCT FROM original THEN RAISE EXCEPTION 'Original event correction graph changed';END IF;
  PERFORM hato_event_correction.standalone(original->'event',r.intent);correction_rows=before_source->'domain'->'corrections';planned_event=r.plan->'event';
  IF r.intent->>'mode'='edit' THEN
   e=jsonb_populate_record(NULL::public.hato_eventos,planned_event);
   UPDATE public.hato_eventos SET fecha=e.fecha,fecha_confianza=e.fecha_confianza,tipo_servicio=e.tipo_servicio,toro_id=e.toro_id,cria_destino=e.cria_destino,datos=e.datos WHERE id=e.id RETURNING * INTO written;
   IF NOT FOUND OR to_jsonb(written) IS DISTINCT FROM planned_event THEN RAISE EXCEPTION 'Event correction target suppressed/mutated';END IF;
  ELSE
   DELETE FROM public.hato_eventos WHERE id=(r.intent->>'eventId')::uuid RETURNING * INTO written;
   IF NOT FOUND OR to_jsonb(written) IS DISTINCT FROM original->'event' THEN RAISE EXCEPTION 'Event correction delete suppressed/mutated';END IF;
  END IF;
  SELECT * INTO correction FROM public.hato_correcciones WHERE id NOT IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(correction_rows)x);
  IF NOT FOUND OR (SELECT count(*) FROM public.hato_correcciones WHERE id NOT IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(correction_rows)x))<>1 OR correction.tabla<>'hato_eventos' OR correction.fila_id IS DISTINCT FROM (r.intent->>'eventId')::uuid OR correction.operacion IS DISTINCT FROM (CASE WHEN r.intent->>'mode'='edit' THEN 'update' ELSE 'delete' END) OR correction.datos_anteriores IS DISTINCT FROM original->'event' OR coalesce(to_jsonb(correction.datos_nuevos),'null'::jsonb) IS DISTINCT FROM planned_event OR correction.animal_id IS DISTINCT FROM (original->'event'->>'animal_id')::uuid OR correction.corregido_por IS DISTINCT FROM p_expected_owner OR correction.corregido_en IS DISTINCT FROM now() OR correction.motivo IS DISTINCT FROM (CASE WHEN r.intent->>'mode'='edit' THEN planned_event->'datos'->>'motivo_correccion' ELSE NULL END) THEN RAISE EXCEPTION 'Exact trusted event correction trace required';END IF;
  expected_source=jsonb_set(expected_source,'{domain,events}',(SELECT coalesce(jsonb_agg(CASE WHEN x->>'id'=r.intent->>'eventId' THEN planned_event ELSE x END ORDER BY x->>'id'),'[]') FROM jsonb_array_elements(expected_source->'domain'->'events')x WHERE x->>'id'<>r.intent->>'eventId' OR planned_event<>'null'::jsonb));
  expected_source=jsonb_set(expected_source,'{domain,corrections}',(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements(correction_rows||jsonb_build_array(to_jsonb(correction)))x));
  expected_source=jsonb_set(expected_source,'{animalsView}',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY animal_id),'[]') FROM public.v_hato_estado_actual x));
  expected_after=jsonb_set(original,'{event}',planned_event);expected_after=jsonb_set(expected_after,'{graph,events}',(SELECT coalesce(jsonb_agg(CASE WHEN x->>'id'=r.intent->>'eventId' THEN planned_event ELSE x END ORDER BY x->>'id'),'[]') FROM jsonb_array_elements(original->'graph'->'events')x WHERE x->>'id'<>r.intent->>'eventId' OR planned_event<>'null'::jsonb));
  actual=hato_event_correction.snapshot(r.intent);IF actual IS DISTINCT FROM expected_after THEN RAISE EXCEPTION 'Event correction exact graph mismatch';END IF;
  new_receipt=jsonb_build_object('version',1,'requestKey',p_request_key,'owner',p_expected_owner,'intent',r.intent,'original',original,'plan',r.plan,'effectiveDate',r.effective_date,'actor',actor,'recordedAt',now(),'after',actual,'correction',to_jsonb(correction));
  audit.request_key=p_request_key;audit.receipt=new_receipt;INSERT INTO hato_event_correction.audit SELECT audit.* RETURNING * INTO written_audit;IF NOT FOUND OR to_jsonb(written_audit) IS DISTINCT FROM to_jsonb(audit) THEN RAISE EXCEPTION 'Event correction operation audit suppressed/mutated';END IF;
  expected=r;expected.state='committed';expected.receipt=new_receipt;UPDATE hato_event_correction.requests SET state='committed',receipt=new_receipt WHERE request_key=p_request_key RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Event correction control suppressed/mutated';END IF;
 END IF;
 IF coalesce(r.intent->>'mode',p_intent->>'mode')='delete' AND NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_expected_owner AND activo AND rol='Gerencia') THEN RAISE EXCEPTION 'Fresh Gerencia required for event deletion' USING ERRCODE='42501';END IF;
 IF hato_treatment_creation.web_actor() IS DISTINCT FROM actor OR alert_cron.source() IS DISTINCT FROM expected_source OR hato_pajilla_use.inventory() IS DISTINCT FROM before_inventory THEN RAISE EXCEPTION 'Event correction final authority/source mismatch';END IF;
 IF view_inputs IS DISTINCT FROM jsonb_build_object('checks',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeo_vacas x),'headers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeos x)) THEN RAISE EXCEPTION 'Event correction view inputs changed';END IF;
 SELECT * INTO r FROM hato_event_correction.requests WHERE request_key=p_request_key;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Event correction final control mismatch';END IF;
 IF r.state='committed' AND (hato_event_correction.snapshot(r.intent) IS DISTINCT FROM r.receipt->'after' OR NOT EXISTS(SELECT 1 FROM hato_event_correction.audit WHERE request_key=p_request_key AND receipt=r.receipt)) THEN RAISE EXCEPTION 'Event correction final audit/graph mismatch';END IF;RETURN hato_event_correction.result(r);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_event_correction FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_event_correction_web(text,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_event_correction_web(text,uuid,jsonb,uuid) TO authenticated;
COMMIT;
