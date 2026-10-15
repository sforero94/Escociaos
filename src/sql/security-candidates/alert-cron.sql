-- NONNUMBERED cron/job/outbox foundation after all19 candidates. No tick cutover or grant retirement.
BEGIN;
LOCK TABLE public.hato_alertas,public.hato_tratamientos,public.hato_tratamiento_pasos,public.hato_animales,
 public.hato_eventos,public.usuarios,public.telegram_usuarios,public.hato_config,public.hato_alertas_config,
 public.telegram_alertas_suscripciones IN SHARE ROW EXCLUSIVE MODE;
DO $admission$ DECLARE fingerprint text;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed cron installation owner required';END IF;
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
WHERE n.nspname='public' AND c.relname IN('hato_animales','hato_eventos','hato_alertas','usuarios','telegram_usuarios','hato_config','hato_alertas_config','telegram_alertas_suscripciones','hato_tratamientos','hato_tratamiento_pasos','v_hato_estado_actual')) AS e(baseline);
 IF fingerprint IS DISTINCT FROM 'e7d5d83a6cd3121738dba36eb3243ef5' THEN RAISE EXCEPTION 'Unreviewed cron source graph';END IF;
 PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
END $admission$;
CREATE SCHEMA alert_cron;
REVOKE ALL ON SCHEMA alert_cron FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE alert_cron.runs(
 id uuid PRIMARY KEY,slot text NOT NULL UNIQUE,actor jsonb NOT NULL,reference_at timestamptz NOT NULL,
 source jsonb,state text NOT NULL CHECK(state IN('prepared','committed','canceled')),plan jsonb,receipt jsonb,
 CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR source IS NOT NULL));
CREATE TABLE alert_cron.deliveries(
 id uuid PRIMARY KEY,run_id uuid NOT NULL REFERENCES alert_cron.runs(id),alert_id uuid NOT NULL,
 registration_id uuid NOT NULL,recipient bigint NOT NULL,phase text NOT NULL CHECK(phase IN('delivery','escalation')),
 round integer NOT NULL CHECK(round BETWEEN 1 AND 3),body jsonb NOT NULL,context jsonb NOT NULL,
 state text NOT NULL CHECK(state IN('queued','sending','sent','rejected','unknown','not_attempted','canceled')),
 claim_key uuid,claimed_at timestamptz,result jsonb,
 UNIQUE(alert_id,recipient,phase,round),CHECK((claim_key IS NULL)=(claimed_at IS NULL)),CHECK(state<>'queued' OR claim_key IS NULL));
CREATE TABLE alert_cron.audit(id uuid PRIMARY KEY,run_id uuid NOT NULL REFERENCES alert_cron.runs(id),object_id uuid NOT NULL,
 event text NOT NULL,actor jsonb NOT NULL,before_value jsonb,after_value jsonb NOT NULL,recorded_at timestamptz NOT NULL);
ALTER TABLE alert_cron.runs ENABLE ROW LEVEL SECURITY;ALTER TABLE alert_cron.deliveries ENABLE ROW LEVEL SECURITY;ALTER TABLE alert_cron.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA alert_cron FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION alert_cron.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' THEN RAISE EXCEPTION 'Immutable cron proof';END IF;
 IF TG_TABLE_NAME='runs' THEN
  IF OLD.state<>'prepared' OR NEW.state NOT IN('committed','canceled') OR(to_jsonb(NEW)-'state'-'plan'-'receipt') IS DISTINCT FROM(to_jsonb(OLD)-'state'-'plan'-'receipt') THEN RAISE EXCEPTION 'Immutable cron run';END IF;
 ELSE
  IF(to_jsonb(NEW)-'state'-'claim_key'-'claimed_at'-'result') IS DISTINCT FROM(to_jsonb(OLD)-'state'-'claim_key'-'claimed_at'-'result')
  OR NOT((OLD.state='queued' AND NEW.state IN('sending','canceled') AND OLD.claim_key IS NULL)
   OR(OLD.state='sending' AND NEW.state IN('sent','rejected','unknown','not_attempted') AND NEW.claim_key IS NOT DISTINCT FROM OLD.claim_key AND NEW.claimed_at IS NOT DISTINCT FROM OLD.claimed_at)) THEN RAISE EXCEPTION 'Immutable delivery body/transition';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER immutable_cron_run BEFORE UPDATE OR DELETE ON alert_cron.runs FOR EACH ROW EXECUTE FUNCTION alert_cron.immutable();
CREATE TRIGGER immutable_cron_delivery BEFORE UPDATE OR DELETE ON alert_cron.deliveries FOR EACH ROW EXECUTE FUNCTION alert_cron.immutable();
CREATE TRIGGER immutable_cron_audit BEFORE UPDATE OR DELETE ON alert_cron.audit FOR EACH ROW EXECUTE FUNCTION alert_cron.immutable();
CREATE TRIGGER no_truncate_cron_run BEFORE TRUNCATE ON alert_cron.runs FOR EACH STATEMENT EXECUTE FUNCTION alert_cron.immutable();
CREATE TRIGGER no_truncate_cron_delivery BEFORE TRUNCATE ON alert_cron.deliveries FOR EACH STATEMENT EXECUTE FUNCTION alert_cron.immutable();
CREATE TRIGGER no_truncate_cron_audit BEFORE TRUNCATE ON alert_cron.audit FOR EACH STATEMENT EXECUTE FUNCTION alert_cron.immutable();
CREATE FUNCTION alert_cron.lock_source() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos,public.hato_alertas,public.hato_eventos,
 public.hato_animales,public.usuarios,public.telegram_usuarios,public.hato_config,public.hato_alertas_config,
 public.telegram_alertas_suscripciones IN SHARE ROW EXCLUSIVE MODE;
 -- LOCK on a view recursively locks its underlying relations until commit.
 LOCK TABLE public.v_hato_estado_actual IN SHARE MODE;
END $$;
CREATE FUNCTION alert_cron.check_initiator(actor jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF actor->>'origin'='manual' THEN
  PERFORM 1 FROM public.usuarios WHERE id=(actor->>'profileId')::uuid AND activo IS TRUE AND rol='Gerencia' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fresh active Gerencia initiator required' USING ERRCODE='42501';END IF;
 ELSIF actor IS DISTINCT FROM '{"origin":"cron","principal":"service_role","job":"hato_alertas_tick"}'::jsonb THEN RAISE EXCEPTION 'Invalid trusted job actor';END IF;
END $$;
CREATE FUNCTION alert_cron.source() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('domain',alert_response.domain_state(),
 'animalsView',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY animal_id),'[]') FROM public.v_hato_estado_actual x),
 'config',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY clave),'[]') FROM public.hato_config x),
 'alertConfig',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY tipo),'[]') FROM public.hato_alertas_config x),
 'subscriptions',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') FROM public.telegram_alertas_suscripciones x WHERE alerta_clave LIKE 'hato.%'),
 'registrations',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'telegram_id',x.telegram_id,'usuario_id',x.usuario_id,'activo',x.activo,'modulos_permitidos',x.modulos_permitidos) ORDER BY x.id),'[]') FROM public.telegram_usuarios x WHERE EXISTS(SELECT 1 FROM public.telegram_alertas_suscripciones s WHERE s.telegram_usuario_id=x.id AND s.alerta_clave LIKE 'hato.%')),
 'profiles',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'activo',activo,'rol',rol) ORDER BY id),'[]') FROM public.usuarios));
$$;
CREATE FUNCTION alert_cron.log(p_run uuid,p_object uuid,p_event text,p_actor jsonb,p_before jsonb,p_after jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE expected alert_cron.audit;actual alert_cron.audit;
BEGIN
 expected.id=gen_random_uuid();expected.run_id=p_run;expected.object_id=p_object;expected.event=p_event;expected.actor=p_actor;expected.before_value=p_before;expected.after_value=p_after;expected.recorded_at=now();
 INSERT INTO alert_cron.audit SELECT expected.* RETURNING * INTO actual;
 IF NOT FOUND OR to_jsonb(actual) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Cron audit suppressed/mutated';END IF;
 SELECT * INTO actual FROM alert_cron.audit WHERE id=expected.id;
 IF NOT FOUND OR to_jsonb(actual) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Cron audit readback mismatch';END IF;
END $$;
CREATE FUNCTION alert_cron.reserve(p_slot text,p_actor jsonb,p_cancel boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r alert_cron.runs;e alert_cron.runs;before_source jsonb;
BEGIN
 PERFORM alert_cron.check_initiator(p_actor);PERFORM pg_advisory_xact_lock(hashtextextended('alert-cron:'||p_slot,0));
 SELECT * INTO r FROM alert_cron.runs WHERE slot=p_slot FOR UPDATE;
 IF FOUND THEN IF r.actor IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Original job actor changed';END IF;RETURN to_jsonb(r);END IF;
 PERFORM alert_cron.lock_source();
 r.id=gen_random_uuid();r.slot=p_slot;r.actor=p_actor;r.reference_at=now();r.state=CASE WHEN p_cancel THEN 'canceled' ELSE 'prepared' END;r.source=CASE WHEN p_cancel THEN NULL ELSE alert_cron.source() END;e=r;before_source=alert_cron.source();
 INSERT INTO alert_cron.runs SELECT e.* RETURNING * INTO r;
 IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(e) THEN RAISE EXCEPTION 'Cron reservation suppressed/mutated';END IF;
 PERFORM alert_cron.log(r.id,r.id,'reserve',p_actor,NULL,to_jsonb(r));
 SELECT * INTO r FROM alert_cron.runs WHERE id=e.id;
 IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(e) OR alert_cron.source() IS DISTINCT FROM before_source THEN RAISE EXCEPTION 'Cron reservation readback mismatch';END IF;
 RETURN to_jsonb(r);
END $$;
CREATE FUNCTION alert_cron.delivery_context(p_alert uuid,p_registration uuid,p_phase text) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE a public.hato_alertas;r public.telegram_usuarios;profile jsonb;clinical jsonb;data jsonb;
BEGIN
 SELECT * INTO a FROM public.hato_alertas WHERE id=p_alert;
 IF NOT FOUND OR a.estado NOT IN('pendiente','enviada','escalada') THEN RAISE EXCEPTION 'Current open delivery alert required';END IF;
 SELECT * INTO r FROM public.telegram_usuarios WHERE id=p_registration FOR SHARE;
 IF NOT FOUND OR r.activo IS DISTINCT FROM true OR ('hato_produccion'=ANY(r.modulos_permitidos)) IS DISTINCT FROM true OR r.telegram_id IS NULL OR r.telegram_id<=0 THEN RAISE EXCEPTION 'Current permitted delivery recipient required';END IF;
 IF r.usuario_id IS NOT NULL THEN SELECT jsonb_build_object('id',id,'activo',activo) INTO profile FROM public.usuarios WHERE id=r.usuario_id AND activo IS TRUE FOR SHARE;IF NOT FOUND THEN RAISE EXCEPTION 'Current linked recipient profile required';END IF;END IF;
 PERFORM 1 FROM public.hato_alertas_config WHERE tipo=a.tipo AND activo IS TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active alert configuration required';END IF;
 PERFORM 1 FROM public.telegram_alertas_suscripciones WHERE telegram_usuario_id=r.id AND alerta_clave='hato.'||a.tipo AND CASE WHEN p_phase='delivery' THEN recibe ELSE escalamiento END IS TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current subscription required';END IF;
 IF a.paso_id IS NOT NULL THEN SELECT jsonb_build_object('header',to_jsonb(h),'steps',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.hato_tratamiento_pasos s WHERE tratamiento_id=h.id)) INTO clinical FROM public.hato_tratamientos h WHERE id=(SELECT tratamiento_id FROM public.hato_tratamiento_pasos WHERE id=a.paso_id);END IF;
 data=to_jsonb(a)-'updated_at'-'intentos'-'destinatario_telegram_id';data=jsonb_set(data,'{datos}',coalesce(a.datos,'{}'::jsonb)-'enviada_en');
 IF a.estado IN('pendiente','enviada') THEN data=jsonb_set(data,'{estado}','"delivery_open"'::jsonb);END IF;
 RETURN jsonb_build_object('alert',data,'animal',(SELECT to_jsonb(x) FROM public.hato_animales x WHERE id=a.animal_id),
 'events',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_eventos x WHERE animal_id=a.animal_id),'clinical',clinical,
 'recipient',jsonb_build_object('id',r.id,'telegramId',r.telegram_id,'profileId',r.usuario_id,'modules',r.modulos_permitidos),'profile',profile,
 'config',(SELECT to_jsonb(x) FROM public.hato_alertas_config x WHERE tipo=a.tipo),
 'subscription',(SELECT to_jsonb(x) FROM public.telegram_alertas_suscripciones x WHERE telegram_usuario_id=r.id AND alerta_clave='hato.'||a.tipo));
END $$;
CREATE FUNCTION alert_cron.post(p_id uuid,p_plan jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r alert_cron.runs;expected_run alert_cron.runs;item jsonb;patch jsonb;before_source jsonb;expected_domain jsonb;before_row jsonb;
 a public.hato_alertas;expected_alert public.hato_alertas;delivery alert_cron.deliveries;actual_delivery alert_cron.deliveries;new_receipt jsonb;target uuid;registration uuid;
 seen uuid[]='{}';seen_rules text[]='{}';round_no integer;executor jsonb='{"origin":"executor","principal":"service_role","job":"hato_alertas_tick"}';
BEGIN
 IF p_plan IS NULL OR jsonb_typeof(p_plan)<>'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_plan)k) IS DISTINCT FROM ARRAY['deliveries','generate','updates']
 OR jsonb_typeof(p_plan->'generate') IS DISTINCT FROM 'array' OR jsonb_typeof(p_plan->'updates') IS DISTINCT FROM 'array' OR jsonb_typeof(p_plan->'deliveries') IS DISTINCT FROM 'array'
 OR jsonb_array_length(p_plan->'generate')>500 OR jsonb_array_length(p_plan->'updates')>500 OR jsonb_array_length(p_plan->'deliveries')>1000 THEN RAISE EXCEPTION 'Exact bounded trusted cron plan required';END IF;
 SELECT * INTO r FROM alert_cron.runs WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original cron reservation required';END IF;PERFORM alert_cron.check_initiator(r.actor);
 IF r.state='committed' THEN IF r.plan IS DISTINCT FROM p_plan THEN RAISE EXCEPTION 'Original cron plan changed';END IF;RETURN r.receipt;END IF;
 IF r.state<>'prepared' THEN RAISE EXCEPTION 'Canceled cron run';END IF;
 PERFORM alert_cron.lock_source();
 before_source=alert_cron.source();IF before_source IS DISTINCT FROM r.source THEN RAISE EXCEPTION 'Original cron source changed';END IF;
 expected_domain=r.source->'domain';
 FOR item IN SELECT value FROM jsonb_array_elements(p_plan->'generate') LOOP
  IF jsonb_typeof(item)<>'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(item)k) IS DISTINCT FROM ARRAY['animal_id','datos','fecha_programada','paso_id','regla_clave','tipo']
   OR item->>'tipo' NOT IN('secado_due','tratamiento_paso','rechequeo_due','servicio_sin_confirmacion','parto_proximo') OR jsonb_typeof(item->'datos')<>'object'
   OR jsonb_typeof(item->'regla_clave')<>'string' OR length(item->>'regla_clave') NOT BETWEEN 1 AND 500 OR item->>'regla_clave'=ANY(seen_rules) THEN RAISE EXCEPTION 'Exact unique generated alert required';END IF;
  seen_rules=array_append(seen_rules,item->>'regla_clave');
  expected_alert=jsonb_populate_record(NULL::public.hato_alertas,item||jsonb_build_object('id',gen_random_uuid(),'estado','pendiente','intentos',0,'created_at',now(),'updated_at',now(),'created_by',r.actor->>'profileId'));
  IF expected_alert.regla_clave LIKE 'manual:%' OR NOT isfinite(expected_alert.fecha_programada) OR to_char(expected_alert.fecha_programada,'YYYY-MM-DD') IS DISTINCT FROM item->>'fecha_programada' THEN RAISE EXCEPTION 'Canonical generated rule/date required';END IF;
  IF expected_alert.tipo='tratamiento_paso' THEN
   PERFORM 1 FROM public.hato_tratamiento_pasos s JOIN public.hato_tratamientos h ON h.id=s.tratamiento_id WHERE s.id=expected_alert.paso_id AND h.animal_id=expected_alert.animal_id AND h.estado='activo' AND s.fecha_ejecutada IS NULL FOR SHARE OF s,h;
   IF NOT FOUND THEN RAISE EXCEPTION 'Current pending generated step required';END IF;
  ELSIF expected_alert.paso_id IS NOT NULL THEN RAISE EXCEPTION 'Unexpected generated clinical link';END IF;
  INSERT INTO public.hato_alertas SELECT expected_alert.* RETURNING * INTO a;
  IF NOT FOUND OR to_jsonb(a) IS DISTINCT FROM to_jsonb(expected_alert) THEN RAISE EXCEPTION 'Generated alert suppressed/mutated';END IF;
  expected_domain=jsonb_set(expected_domain,'{alerts}',(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements((expected_domain->'alerts')||jsonb_build_array(to_jsonb(expected_alert)))x));
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(p_plan->'updates') LOOP
  IF jsonb_typeof(item)<>'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(item)k) IS DISTINCT FROM ARRAY['id','patch'] THEN RAISE EXCEPTION 'Exact lifecycle patch required';END IF;
  target=(item->>'id')::uuid;patch=item->'patch';
  IF target IS NULL OR target::text IS DISTINCT FROM item->>'id' OR target=ANY(seen) OR jsonb_typeof(patch)<>'object'
   OR NOT(patch?'estado') OR EXISTS(SELECT 1 FROM jsonb_object_keys(patch)k WHERE k NOT IN('estado','datos')) OR patch->>'estado' NOT IN('descartada','escalada','expirada') THEN RAISE EXCEPTION 'Canonical unique lifecycle target/fields required';END IF;
  seen=array_append(seen,target);SELECT * INTO expected_alert FROM public.hato_alertas WHERE id=target;
  IF NOT FOUND OR expected_alert.estado NOT IN('pendiente','enviada','escalada','respondida') THEN RAISE EXCEPTION 'Current open lifecycle target required';END IF;
  expected_alert.estado=patch->>'estado';expected_alert.updated_at=now();IF patch?'datos' THEN expected_alert.datos=patch->'datos';END IF;
  IF expected_alert.estado='escalada' THEN expected_alert.escalada_at=now();END IF;
  UPDATE public.hato_alertas SET estado=expected_alert.estado,datos=expected_alert.datos,escalada_at=expected_alert.escalada_at,updated_at=expected_alert.updated_at WHERE id=target RETURNING * INTO a;
  IF NOT FOUND OR to_jsonb(a) IS DISTINCT FROM to_jsonb(expected_alert) THEN RAISE EXCEPTION 'Lifecycle alert suppressed/mutated';END IF;
  expected_domain=jsonb_set(expected_domain,'{alerts}',(SELECT jsonb_agg(CASE WHEN x->>'id'=target::text THEN to_jsonb(expected_alert) ELSE x END ORDER BY x->>'id') FROM jsonb_array_elements(expected_domain->'alerts')x));
 END LOOP;
 seen='{}';
 FOR item IN SELECT value FROM jsonb_array_elements(p_plan->'deliveries') LOOP
  IF jsonb_typeof(item)<>'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(item)k) IS DISTINCT FROM ARRAY['phase','registrationId','reglaClave','text'] OR item->>'phase' NOT IN('delivery','escalation') OR jsonb_typeof(item->'text')<>'string' OR length(item->>'text') NOT BETWEEN 1 AND 3500 THEN RAISE EXCEPTION 'Exact frozen delivery required';END IF;
  SELECT * INTO expected_alert FROM public.hato_alertas WHERE regla_clave=item->>'reglaClave';IF NOT FOUND THEN RAISE EXCEPTION 'Current delivery alert required';END IF;
  target=expected_alert.id;registration=(item->>'registrationId')::uuid;
  IF registration::text IS DISTINCT FROM item->>'registrationId' THEN RAISE EXCEPTION 'Canonical delivery registration required';END IF;
  IF NOT target=ANY(seen) AND item->>'phase'='delivery' THEN
   IF expected_alert.estado NOT IN('pendiente','enviada') OR expected_alert.intentos>=3 OR(expected_alert.intentos>0 AND now()-expected_alert.updated_at<interval '48 hours') THEN RAISE EXCEPTION 'Original delivery cadence/attempt budget required';END IF;
   expected_alert.intentos=expected_alert.intentos+1;expected_alert.updated_at=now();
   UPDATE public.hato_alertas SET intentos=expected_alert.intentos,updated_at=expected_alert.updated_at WHERE id=target RETURNING * INTO a;
   IF NOT FOUND OR to_jsonb(a) IS DISTINCT FROM to_jsonb(expected_alert) THEN RAISE EXCEPTION 'Delivery attempt suppressed/mutated';END IF;
   expected_domain=jsonb_set(expected_domain,'{alerts}',(SELECT jsonb_agg(CASE WHEN x->>'id'=target::text THEN to_jsonb(expected_alert) ELSE x END ORDER BY x->>'id') FROM jsonb_array_elements(expected_domain->'alerts')x));seen=array_append(seen,target);
  ELSIF item->>'phase'='escalation' AND expected_alert.estado<>'escalada' THEN RAISE EXCEPTION 'Current escalated alert required';END IF;
  delivery.id=gen_random_uuid();delivery.run_id=r.id;delivery.alert_id=target;delivery.registration_id=registration;delivery.phase=item->>'phase';delivery.round=CASE WHEN delivery.phase='delivery' THEN expected_alert.intentos ELSE 1 END;
  delivery.context=alert_cron.delivery_context(target,registration,delivery.phase);delivery.recipient=(delivery.context->'recipient'->>'telegramId')::bigint;
  delivery.body=jsonb_build_object('text',item->>'text','callbackToken',delivery.id);delivery.state='queued';delivery.claim_key=NULL;delivery.claimed_at=NULL;delivery.result=NULL;
  INSERT INTO alert_cron.deliveries SELECT delivery.* RETURNING * INTO actual_delivery;
  IF NOT FOUND OR to_jsonb(actual_delivery) IS DISTINCT FROM to_jsonb(delivery) THEN RAISE EXCEPTION 'Frozen delivery suppressed/mutated';END IF;
  PERFORM alert_cron.log(r.id,delivery.id,'queue',executor,NULL,to_jsonb(delivery));
 END LOOP;
 IF alert_response.domain_state() IS DISTINCT FROM expected_domain OR alert_cron.source() IS DISTINCT FROM jsonb_set(before_source,'{domain}',expected_domain) THEN RAISE EXCEPTION 'Cron final source/domain mismatch';END IF;
 new_receipt=jsonb_build_object('version',1,'runId',r.id,'initiator',r.actor,'executor',executor,'recordedAt',now(),'source',r.source,'plan',p_plan,'after',alert_cron.source(),
  'deliveries',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM alert_cron.deliveries x WHERE run_id=r.id));
 expected_run=r;expected_run.state='committed';expected_run.plan=p_plan;expected_run.receipt=new_receipt;
 UPDATE alert_cron.runs SET state='committed',plan=p_plan,receipt=new_receipt WHERE id=r.id RETURNING * INTO r;
 IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected_run) THEN RAISE EXCEPTION 'Cron committed control suppressed/mutated';END IF;
 PERFORM alert_cron.log(r.id,r.id,'commit',executor,NULL,to_jsonb(r));
 SELECT * INTO r FROM alert_cron.runs WHERE id=p_id;
 IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected_run) OR alert_response.domain_state() IS DISTINCT FROM expected_domain OR alert_cron.source() IS DISTINCT FROM new_receipt->'after' THEN RAISE EXCEPTION 'Cron final receipt/source mismatch';END IF;
 RETURN new_receipt;
END $$;
CREATE FUNCTION alert_cron.delivery(p_action text,p_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE d alert_cron.deliveries;e alert_cron.deliveries;r alert_cron.runs;before_source jsonb;before_row jsonb;context jsonb;
 executor jsonb='{"origin":"executor","principal":"service_role","job":"hato_alertas_tick"}';granted boolean=false;
BEGIN
 PERFORM alert_cron.lock_source();
 SELECT * INTO d FROM alert_cron.deliveries WHERE id=p_id FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'Original delivery required';END IF;
 SELECT * INTO r FROM alert_cron.runs WHERE id=d.run_id;
 IF p_action='claim' THEN PERFORM alert_cron.check_initiator(r.actor);END IF;
 before_source=alert_cron.source();before_row=to_jsonb(d);e=d;
 IF p_action='claim' THEN
  IF jsonb_typeof(p_payload)<>'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_payload)k) IS DISTINCT FROM ARRAY['claimKey'] OR (p_payload->>'claimKey')::uuid::text IS DISTINCT FROM p_payload->>'claimKey' THEN RAISE EXCEPTION 'Original claim key required';END IF;
  IF d.state='queued' THEN
   context=alert_cron.delivery_context(d.alert_id,d.registration_id,d.phase);
   IF context IS DISTINCT FROM d.context THEN RAISE EXCEPTION 'Original frozen delivery source changed';END IF;
   e.state='sending';e.claim_key=(p_payload->>'claimKey')::uuid;e.claimed_at=now();
   UPDATE alert_cron.deliveries SET state=e.state,claim_key=e.claim_key,claimed_at=e.claimed_at WHERE id=d.id RETURNING * INTO d;
   IF NOT FOUND OR to_jsonb(d) IS DISTINCT FROM to_jsonb(e) THEN RAISE EXCEPTION 'Delivery claim suppressed/mutated';END IF;
   PERFORM alert_cron.log(d.run_id,d.id,'claim',executor,before_row,to_jsonb(d));granted=true;
  END IF;
 ELSIF p_action='settle' THEN
  IF jsonb_typeof(p_payload)<>'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_payload)k) IS DISTINCT FROM ARRAY['claimKey','outcome'] OR d.claim_key IS NULL OR d.claim_key::text IS DISTINCT FROM p_payload->>'claimKey'
   OR jsonb_typeof(p_payload->'outcome')<>'object' OR p_payload->'outcome'->>'outcome' NOT IN('sent','rejected','unknown','not_attempted') THEN RAISE EXCEPTION 'Original sending outcome required';END IF;
  IF d.state='sending' THEN
   IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_payload->'outcome')k) IS DISTINCT FROM
    (CASE p_payload->'outcome'->>'outcome' WHEN 'sent' THEN ARRAY['ok','outcome','telegramMessageId'] WHEN 'rejected' THEN ARRAY['error','errorCode','ok','outcome'] ELSE ARRAY['error','ok','outcome'] END)
    OR p_payload->'outcome'->'ok' IS DISTINCT FROM to_jsonb(p_payload->'outcome'->>'outcome'='sent') THEN RAISE EXCEPTION 'Exact verified outcome proof required';END IF;
   IF p_payload->'outcome'->>'outcome'='sent' THEN
    IF jsonb_typeof(p_payload->'outcome'->'telegramMessageId') IS DISTINCT FROM 'number' OR (p_payload->'outcome'->>'telegramMessageId')::numeric NOT BETWEEN 1 AND 9007199254740991 OR (p_payload->'outcome'->>'telegramMessageId')::numeric<>trunc((p_payload->'outcome'->>'telegramMessageId')::numeric) THEN RAISE EXCEPTION 'Verified accepted message ID required';END IF;
   ELSE
    IF jsonb_typeof(p_payload->'outcome'->'error') IS DISTINCT FROM 'string' OR length(p_payload->'outcome'->>'error')>1000 THEN RAISE EXCEPTION 'Bounded original outcome reason required';END IF;
    IF p_payload->'outcome'->>'outcome'='rejected' AND (jsonb_typeof(p_payload->'outcome'->'errorCode') IS DISTINCT FROM 'number' OR (p_payload->'outcome'->>'errorCode')::numeric NOT BETWEEN 400 AND 499 OR (p_payload->'outcome'->>'errorCode')::numeric<>trunc((p_payload->'outcome'->>'errorCode')::numeric)) THEN RAISE EXCEPTION 'Definite API rejection code required';END IF;
   END IF;
   e.state=p_payload->'outcome'->>'outcome';e.result=p_payload->'outcome';
   UPDATE alert_cron.deliveries SET state=e.state,result=e.result WHERE id=d.id RETURNING * INTO d;
   IF NOT FOUND OR to_jsonb(d) IS DISTINCT FROM to_jsonb(e) THEN RAISE EXCEPTION 'Delivery outcome suppressed/mutated';END IF;
   PERFORM alert_cron.log(d.run_id,d.id,'settle',executor,before_row,to_jsonb(d));
  ELSIF d.result IS DISTINCT FROM p_payload->'outcome' THEN RAISE EXCEPTION 'Original terminal delivery outcome changed';END IF;
 ELSIF p_action<>'delivery_status' THEN RAISE EXCEPTION 'Invalid delivery action';END IF;
 SELECT * INTO d FROM alert_cron.deliveries WHERE id=p_id;
 IF NOT FOUND OR to_jsonb(d) IS DISTINCT FROM to_jsonb(e) OR alert_cron.source() IS DISTINCT FROM before_source THEN RAISE EXCEPTION 'Delivery final control/source mismatch';END IF;
 RETURN jsonb_build_object('version',1,'sendPermission',granted,'delivery',to_jsonb(d));
END $$;
CREATE FUNCTION public.fn_alert_cron_service(p_action text,p_key uuid,p_payload jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r alert_cron.runs;e alert_cron.runs;source jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted service executor required' USING ERRCODE='42501';END IF;
 IF p_action='prepare' THEN
  IF p_key IS NOT NULL OR p_payload IS NOT NULL THEN RAISE EXCEPTION 'Scheduled job slot is server-owned';END IF;
  RETURN alert_cron.reserve('cron:'||(now() AT TIME ZONE 'America/Bogota')::date::text,'{"origin":"cron","principal":"service_role","job":"hato_alertas_tick"}');
 ELSIF p_action IN('claim','settle','delivery_status') THEN RETURN alert_cron.delivery(p_action,p_key,p_payload);
 ELSIF p_action='post' THEN RETURN alert_cron.post(p_key,p_payload);
 ELSIF p_action='status' THEN
  IF p_payload IS NOT NULL THEN RAISE EXCEPTION 'Status cannot replace payload';END IF;
  SELECT * INTO r FROM alert_cron.runs WHERE id=p_key;IF NOT FOUND THEN RAISE EXCEPTION 'Original job required';END IF;PERFORM alert_cron.check_initiator(r.actor);RETURN to_jsonb(r);
 ELSE RAISE EXCEPTION 'Invalid cron service action';END IF;
END $$;
CREATE FUNCTION public.fn_alert_cron_web(p_action text,p_request_key uuid,p_expected_owner uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;job_slot text;r alert_cron.runs;e alert_cron.runs;source jsonb;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner OR p_request_key IS NULL THEN RAISE EXCEPTION 'Original manual job owner/key required' USING ERRCODE='42501';END IF;
 actor=jsonb_build_object('origin','manual','profileId',p_expected_owner);PERFORM alert_cron.check_initiator(actor);job_slot='manual:'||p_expected_owner::text||':'||p_request_key::text;
 IF p_action='prepare' THEN RETURN alert_cron.reserve(job_slot,actor);
 ELSIF p_action='status' THEN SELECT * INTO r FROM alert_cron.runs WHERE alert_cron.runs.slot=job_slot;RETURN CASE WHEN FOUND THEN to_jsonb(r) ELSE jsonb_build_object('state','unknown') END;
 ELSIF p_action='cancel' THEN
  PERFORM alert_cron.reserve(job_slot,actor,true);SELECT * INTO r FROM alert_cron.runs WHERE alert_cron.runs.slot=job_slot FOR UPDATE;
  IF r.state='prepared' THEN e=r;e.state='canceled';source=alert_cron.source();UPDATE alert_cron.runs SET state='canceled' WHERE id=r.id RETURNING * INTO r;
   IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(e) THEN RAISE EXCEPTION 'Manual cancel suppressed/mutated';END IF;
   PERFORM alert_cron.log(r.id,r.id,'cancel',actor,NULL,to_jsonb(r));IF alert_cron.source() IS DISTINCT FROM source THEN RAISE EXCEPTION 'Manual cancel changed source';END IF;
  END IF;RETURN to_jsonb(r);
 ELSE RAISE EXCEPTION 'Manual caller cannot submit job plans or send claims';END IF;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA alert_cron FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_alert_cron_service(text,uuid,jsonb),public.fn_alert_cron_web(text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_alert_cron_service(text,uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_alert_cron_web(text,uuid,uuid) TO authenticated;
COMMIT;
