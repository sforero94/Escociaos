-- NONNUMBERED atomic cycle/current animal lifecycle after27candidates. Offline only.
BEGIN;
SELECT alert_cron.lock_source();
DO $admission$ DECLARE fingerprint text;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed cycle installation owner required';END IF;
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
 IF fingerprint IS DISTINCT FROM '5ae11977b7a8e2f574bd41bb07f76ddc' THEN RAISE EXCEPTION 'Unreviewed cycle source graph';END IF;
 PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_death.snapshot(uuid)') AND md5(p.prosrc)='a6bf1457f7ab6b1adf5cae9c9c78d308' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') OR EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role'))v(role) WHERE has_function_privilege(v.role,'hato_death.snapshot(uuid)','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed cycle snapshot helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_treatment_creation.web_actor()') AND md5(p.prosrc)='1d8ec54936d4f658da49a965b828224c' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed cycle actor helper';END IF;
END $admission$;
CREATE SCHEMA hato_cycle;
REVOKE ALL ON SCHEMA hato_cycle FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_cycle.requests(request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,intent jsonb,original jsonb,plan jsonb,effective_date date,state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,
 CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR intent IS NOT NULL AND original IS NOT NULL AND plan IS NOT NULL AND effective_date IS NOT NULL));
CREATE TABLE hato_cycle.audit(request_key uuid PRIMARY KEY REFERENCES hato_cycle.requests(request_key),receipt jsonb NOT NULL);
ALTER TABLE hato_cycle.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_cycle.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_cycle FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_cycle.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' OR OLD.state<>'pending' OR NEW.state NOT IN('committed','canceled') OR (to_jsonb(NEW)-'state'-'receipt') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'receipt') THEN RAISE EXCEPTION 'Immutable original cycle proof';END IF;RETURN NEW;END $$;
CREATE TRIGGER immutable_cycle_request BEFORE UPDATE OR DELETE ON hato_cycle.requests FOR EACH ROW EXECUTE FUNCTION hato_cycle.immutable();
CREATE TRIGGER immutable_cycle_audit BEFORE UPDATE OR DELETE ON hato_cycle.audit FOR EACH ROW EXECUTE FUNCTION hato_cycle.immutable();
CREATE TRIGGER no_truncate_cycle_request BEFORE TRUNCATE ON hato_cycle.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_cycle.immutable();
CREATE TRIGGER no_truncate_cycle_audit BEFORE TRUNCATE ON hato_cycle.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_cycle.immutable();
CREATE FUNCTION hato_cycle.actor() RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE actor jsonb;BEGIN actor=hato_treatment_creation.web_actor();IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND activo AND rol::text='Gerencia') THEN RAISE EXCEPTION 'Active Gerencia required' USING ERRCODE='42501';END IF;RETURN actor;END $$;
CREATE FUNCTION hato_cycle.snapshot(target uuid) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('graph',hato_death.snapshot(target),'animals',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_animales x),'config',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY clave),'[]') FROM public.hato_config x),'toros',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_toros x),'view',(SELECT to_jsonb(x) FROM public.v_hato_estado_actual x WHERE animal_id=target));
$$;
CREATE FUNCTION hato_cycle.payloads(i jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE a jsonb;v jsonb;events jsonb='[]';day date;service_day date;m double precision;
BEGIN
 IF jsonb_typeof(i) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(i)k) IS DISTINCT FROM ARRAY['ancla','criaDestino','fecha','fechaConfianza','marca','nota'] OR jsonb_typeof(i->'marca') IS DISTINCT FROM 'string' OR i->>'marca' NOT IN('preñada','confirmada','seca','parida') OR jsonb_typeof(i->'fecha') IS DISTINCT FROM 'string' OR jsonb_typeof(i->'fechaConfianza') IS DISTINCT FROM 'string' OR i->>'fechaConfianza' NOT IN('exacta','aproximada') OR jsonb_typeof(i->'nota') IS DISTINCT FROM 'string' OR length(i->>'nota')>4000 OR btrim(i->>'nota') IS DISTINCT FROM i->>'nota' THEN RAISE EXCEPTION 'Exact bounded cycle input required';END IF;
 day=(i->>'fecha')::date;IF NOT isfinite(day) OR to_char(day,'YYYY-MM-DD') IS DISTINCT FROM i->>'fecha' THEN RAISE EXCEPTION 'Canonical cycle date required';END IF;
 IF (i->>'marca'='parida' AND (jsonb_typeof(i->'criaDestino') IS DISTINCT FROM 'string' OR i->>'criaDestino' NOT IN('retenida','hembra_vendida','macho_vendido','muerta','aborto'))) OR (i->>'marca'<>'parida' AND i->'criaDestino' IS DISTINCT FROM 'null'::jsonb) THEN RAISE EXCEPTION 'Exact cycle calf destination required';END IF;
 a=i->'ancla';IF jsonb_typeof(a) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(a)k) IS DISTINCT FROM ARRAY['fechaServicio','mesesPrenez','modo'] OR jsonb_typeof(a->'modo') IS DISTINCT FROM 'string' OR a->>'modo' NOT IN('ninguna','fecha_conocida','meses_prenez') THEN RAISE EXCEPTION 'Exact cycle anchor required';END IF;
 IF i->>'marca' NOT IN('preñada','confirmada') AND a IS DISTINCT FROM jsonb_build_object('modo','ninguna','fechaServicio',NULL,'mesesPrenez',NULL) THEN RAISE EXCEPTION 'Unrelated cycle anchor';END IF;
 IF a->>'modo'='ninguna' THEN IF a->'fechaServicio' IS DISTINCT FROM 'null'::jsonb OR a->'mesesPrenez' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Absent anchor cannot invent values';END IF;
 ELSIF a->>'modo'='fecha_conocida' THEN
  IF jsonb_typeof(a->'fechaServicio') IS DISTINCT FROM 'string' OR a->'mesesPrenez' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Exact known anchor required';END IF;
  service_day=(a->>'fechaServicio')::date;IF NOT isfinite(service_day) OR to_char(service_day,'YYYY-MM-DD') IS DISTINCT FROM a->>'fechaServicio' THEN RAISE EXCEPTION 'Canonical service date required';END IF;
 ELSE
  IF jsonb_typeof(a->'mesesPrenez') IS DISTINCT FROM 'number' OR a->'fechaServicio' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Exact months anchor required';END IF;
  m=(a->>'mesesPrenez')::double precision;IF m<=0 OR m>120000 THEN RAISE EXCEPTION 'Bounded positive months required';END IF;
  service_day=day-floor(m*30.44+0.5)::integer;
  IF NOT isfinite(service_day) OR to_char(service_day,'YYYY-MM-DD')!~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Canonical derived anchor required';END IF;
 END IF;
 IF service_day IS NOT NULL THEN events=jsonb_build_array(jsonb_build_object('tipo','servicio','fecha',service_day,'fecha_confianza',CASE WHEN a->>'modo'='fecha_conocida' THEN 'exacta' ELSE 'aproximada' END,'datos',jsonb_build_object('origen','marca_manual'),'fuente','web'));END IF;
 v=jsonb_build_object('origen','marca_manual');IF i->>'nota'<>'' THEN v=v||jsonb_build_object('nota',i->>'nota');END IF;
 IF i->>'marca' IN('preñada','confirmada') THEN v=v||jsonb_build_object('metodo',CASE WHEN i->>'marca'='preñada' THEN 'presuncion' ELSE 'palpacion' END);END IF;
 RETURN events||jsonb_build_array(jsonb_build_object('tipo',CASE i->>'marca' WHEN 'parida' THEN 'parto' WHEN 'seca' THEN 'secado_real' ELSE 'confirmacion_prenez' END,'fecha',day,'fecha_confianza',i->>'fechaConfianza','cria_destino',i->'criaDestino','datos',v,'fuente','web'));
END $$;
CREATE FUNCTION hato_cycle.result(r hato_cycle.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'owner',r.owner_id,'state',r.state,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'receipt',r.receipt);
$$;
CREATE FUNCTION public.fn_hato_cycle_web(p_action text,p_request_key uuid,p_intent jsonb,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_cycle.requests;expected hato_cycle.requests;before_source jsonb;expected_source jsonb;original jsonb;actual jsonb;payloads jsonb;v jsonb;planned_events jsonb='[]';posted_events jsonb='[]';calf public.hato_animales;written_calf public.hato_animales;e public.hato_eventos;written_event public.hato_eventos;calf_json jsonb='null';father uuid;next_tag integer;day date;target uuid;view_inputs jsonb;new_receipt jsonb;audit hato_cycle.audit;written_audit hato_cycle.audit;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner OR p_request_key IS NULL THEN RAISE EXCEPTION 'Original cycle owner/key required' USING ERRCODE='42501';END IF;
 actor=hato_cycle.actor();IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve') THEN RAISE EXCEPTION 'Invalid cycle action';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-cycle:'||p_request_key::text,0));SELECT * INTO r FROM hato_cycle.requests WHERE request_key=p_request_key FOR UPDATE;
 IF FOUND AND r.owner_id IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original cycle owner changed' USING ERRCODE='42501';END IF;
 IF p_action<>'prepare' AND p_intent IS NOT NULL THEN RAISE EXCEPTION 'Original cycle intent cannot be replaced';END IF;
 IF p_action='status' THEN
  IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='unknown';RETURN hato_cycle.result(r);END IF;
  IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_cycle.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original cycle audit missing';END IF;RETURN hato_cycle.result(r);
 END IF;
 PERFORM alert_cron.lock_source();LOCK TABLE public.hato_toros IN SHARE ROW EXCLUSIVE MODE;before_source=alert_cron.source();expected_source=before_source;
 view_inputs=jsonb_build_object('checks',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeo_vacas x),'headers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeos x),'toros',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_toros x));
 IF p_action='prepare' THEN
  IF jsonb_typeof(p_intent) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_intent)k) IS DISTINCT FROM ARRAY['animalId','input','observedAnimal','version'] OR p_intent->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p_intent->'animalId') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Exact cycle intent required';END IF;
  target=(p_intent->>'animalId')::uuid;IF target::text IS DISTINCT FROM p_intent->>'animalId' THEN RAISE EXCEPTION 'Canonical cycle animal required';END IF;payloads=hato_cycle.payloads(p_intent->'input');
  IF r.request_key IS NOT NULL THEN IF r.intent IS NOT NULL AND r.intent IS DISTINCT FROM p_intent THEN RAISE EXCEPTION 'Original cycle intent changed';END IF;RETURN hato_cycle.result(r);END IF;
  original=hato_cycle.snapshot(target);day=(now() AT TIME ZONE 'America/Bogota')::date;
  IF jsonb_typeof(original->'graph'->'animal') IS DISTINCT FROM 'object' OR original->'graph'->'animal' IS DISTINCT FROM p_intent->'observedAnimal' OR original->'graph'->'animal'->>'estado'<>'activa' THEN RAISE EXCEPTION 'Observed active cycle animal changed';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(payloads)x WHERE (x->>'fecha')::date>day) THEN RAISE EXCEPTION 'Future cycle fact refused';END IF;
  IF p_intent->'input'->>'criaDestino'='retenida' THEN
   SELECT max(numero)+1 INTO next_tag FROM public.hato_animales WHERE estado='activa' AND numero>0 AND numero<800;
   IF next_tag IS NULL OR next_tag>=800 THEN RAISE EXCEPTION 'No nonprovisional calf tag available; no birth or calf posted';END IF;
   SELECT CASE WHEN count(DISTINCT toro_id)=1 AND count(*)=count(toro_id) THEN min(toro_id::text)::uuid ELSE NULL END INTO father FROM public.hato_eventos WHERE animal_id=target AND tipo='servicio' AND (p_intent->'input'->>'fecha')::date-fecha BETWEEN 240 AND 310;
   calf=jsonb_populate_record(NULL::public.hato_animales,jsonb_build_object('id',gen_random_uuid(),'numero',next_tag,'nombre','SIN NOMBRE','sexo','hembra','etapa','ternera','estado','activa','fecha_nacimiento',p_intent->'input'->'fecha','fecha_nacimiento_confianza',p_intent->'input'->'fechaConfianza','madre_id',target,'padre_toro_id',father,'finca_id',original->'graph'->'animal'->'finca_id','origen','nacimiento','confianza','alta','etapa_forzada',false,'import_meta',jsonb_build_object('origen','parto_automatico','fuente','web','madre_id',target,'fecha_parto',p_intent->'input'->'fecha','ticket','ESCO-135'),'notas','Ficha creada automáticamente al registrar el parto (ESCO-135). Falta ponerle nombre.','created_by',p_expected_owner));calf_json=to_jsonb(calf);
  END IF;
  FOR v IN SELECT x FROM jsonb_array_elements(payloads)x LOOP
   e=jsonb_populate_record(NULL::public.hato_eventos,v||jsonb_build_object('id',gen_random_uuid(),'animal_id',target,'created_by',p_expected_owner,'cria_id',CASE WHEN v->>'tipo'='parto' THEN calf.id ELSE NULL END));planned_events=planned_events||jsonb_build_array(to_jsonb(e));
  END LOOP;
  r.request_key=p_request_key;r.owner_id=p_expected_owner;r.intent=p_intent;r.original=original;r.plan=jsonb_build_object('events',planned_events,'calf',calf_json);r.effective_date=day;r.state='pending';expected=r;
  INSERT INTO hato_cycle.requests SELECT expected.* RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Cycle reservation suppressed/mutated';END IF;
 ELSIF p_action='resolve' THEN
  IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='canceled';expected=r;INSERT INTO hato_cycle.requests SELECT expected.* RETURNING * INTO r;
  ELSIF r.state='pending' THEN expected=r;expected.state='canceled';UPDATE hato_cycle.requests SET state='canceled' WHERE request_key=p_request_key RETURNING * INTO r;
  ELSE RETURN hato_cycle.result(r);END IF;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Cycle cancellation suppressed/mutated';END IF;
 ELSIF p_action='post' THEN
  IF r.request_key IS NULL THEN RAISE EXCEPTION 'Original prepared cycle required';END IF;
  IF r.state='committed' THEN IF NOT EXISTS(SELECT 1 FROM hato_cycle.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original cycle audit missing';END IF;RETURN hato_cycle.result(r);ELSIF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled cycle cannot post';END IF;
  target=(r.intent->>'animalId')::uuid;original=r.original;
  IF r.effective_date IS DISTINCT FROM (now() AT TIME ZONE 'America/Bogota')::date THEN RAISE EXCEPTION 'Prepared cycle day elapsed; resolve original request';END IF;
  IF hato_cycle.snapshot(target) IS DISTINCT FROM original THEN RAISE EXCEPTION 'Original cycle source graph changed';END IF;
  IF r.plan->'calf'<>'null'::jsonb THEN
   calf=jsonb_populate_record(NULL::public.hato_animales,(r.plan->'calf')||jsonb_build_object('created_at',now()));
   INSERT INTO public.hato_animales SELECT calf.* RETURNING * INTO written_calf;IF NOT FOUND OR to_jsonb(written_calf) IS DISTINCT FROM to_jsonb(calf) THEN RAISE EXCEPTION 'Cycle calf suppressed/mutated';END IF;calf_json=to_jsonb(calf);
   expected_source=jsonb_set(expected_source,'{domain,animals}',(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements((expected_source->'domain'->'animals')||jsonb_build_array(calf_json))x));
  END IF;
  FOR v IN SELECT x FROM jsonb_array_elements(r.plan->'events')x LOOP
   e=jsonb_populate_record(NULL::public.hato_eventos,v||jsonb_build_object('created_at',now()));INSERT INTO public.hato_eventos SELECT e.* RETURNING * INTO written_event;
   IF NOT FOUND OR to_jsonb(written_event) IS DISTINCT FROM to_jsonb(e) THEN RAISE EXCEPTION 'Cycle event suppressed/mutated';END IF;posted_events=posted_events||jsonb_build_array(to_jsonb(e));
  END LOOP;
  expected_source=jsonb_set(expected_source,'{domain,events}',(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements((expected_source->'domain'->'events')||posted_events)x));
  expected_source=jsonb_set(expected_source,'{animalsView}',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY animal_id),'[]') FROM public.v_hato_estado_actual x));
  actual=hato_death.snapshot(target);
  IF actual IS DISTINCT FROM jsonb_set(original->'graph','{events}',(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements((original->'graph'->'events')||posted_events)x)) OR (calf.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hato_animales x WHERE id=calf.id AND to_jsonb(x)=calf_json)) THEN RAISE EXCEPTION 'Cycle target/calf readback mismatch';END IF;
  new_receipt=jsonb_build_object('version',1,'requestKey',p_request_key,'owner',p_expected_owner,'intent',r.intent,'original',original,'plan',r.plan,'effectiveDate',r.effective_date,'actor',actor,'recordedAt',now(),'after',actual,'calf',calf_json);
  audit.request_key=p_request_key;audit.receipt=new_receipt;INSERT INTO hato_cycle.audit SELECT audit.* RETURNING * INTO written_audit;IF NOT FOUND OR to_jsonb(written_audit) IS DISTINCT FROM to_jsonb(audit) THEN RAISE EXCEPTION 'Cycle trusted audit suppressed/mutated';END IF;
  expected=r;expected.state='committed';expected.receipt=new_receipt;UPDATE hato_cycle.requests SET state='committed',receipt=new_receipt WHERE request_key=p_request_key RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Cycle committed control suppressed/mutated';END IF;
 END IF;
 IF hato_cycle.actor() IS DISTINCT FROM actor OR alert_cron.source() IS DISTINCT FROM expected_source THEN RAISE EXCEPTION 'Cycle final authority/source mismatch';END IF;
 IF view_inputs IS DISTINCT FROM jsonb_build_object('checks',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeo_vacas x),'headers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeos x),'toros',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_toros x)) THEN RAISE EXCEPTION 'Cycle view/reference inputs changed';END IF;
 SELECT * INTO r FROM hato_cycle.requests WHERE request_key=p_request_key;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Cycle final request readback mismatch';END IF;
 IF r.state='committed' AND (hato_death.snapshot(target) IS DISTINCT FROM r.receipt->'after' OR NOT EXISTS(SELECT 1 FROM hato_cycle.audit WHERE request_key=p_request_key AND receipt=r.receipt) OR (calf.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hato_animales x WHERE id=calf.id AND to_jsonb(x)=calf_json))) THEN RAISE EXCEPTION 'Cycle final audit/target/calf mismatch';END IF;
 RETURN hato_cycle.result(r);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_cycle FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_cycle_web(text,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_cycle_web(text,uuid,jsonb,uuid) TO authenticated;
COMMIT;
