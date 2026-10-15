-- NONNUMBERED actual cron caller support, after all20 reviewed candidates.
-- Offline candidate only. No production application or writer grant retirement.
BEGIN;
LOCK TABLE public.hato_alertas_envios IN SHARE ROW EXCLUSIVE MODE;
SELECT alert_cron.lock_source();
DO $admission$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed caller installation owner required';END IF;
 IF (SELECT md5(jsonb_agg(jsonb_build_object(
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
WHERE n.nspname='public' AND c.relname IN('hato_alertas_envios')) IS DISTINCT FROM '922b09de2ed9670fa0708219ab342fbd' THEN RAISE EXCEPTION 'Unreviewed delivery mapping graph';END IF;
 IF EXISTS(SELECT 1 FROM (VALUES ('alert_cron.delivery','cabfdc5b2797df1530431ab0748fc12f'),('alert_cron.post','6409035e7edd0667f33974fba4f23b32'),('alert_cron.source','29790c87bda2ec76860df5e92a05ac88'),('alert_cron.delivery_context','b4e249df5f7fbd2e02387e9ff49cb1a0'))e(name,digest)
 WHERE NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname||'.'||p.proname=e.name AND md5(p.prosrc)=e.digest AND NOT p.prosecdef AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname='postgres') AND p.proconfig=ARRAY['search_path=pg_catalog'])) THEN RAISE EXCEPTION 'Unreviewed original cron function';END IF;
 PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
END $admission$;
CREATE TABLE alert_cron.delivery_evidence(delivery_id uuid PRIMARY KEY REFERENCES alert_cron.deliveries(id),
 kind text NOT NULL CHECK(kind IN('accepted_api','original_private_callback')),message_id bigint NOT NULL CHECK(message_id>0 AND message_id<=9007199254740991),
 action jsonb,recorded_at timestamptz NOT NULL);
ALTER TABLE alert_cron.delivery_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON alert_cron.delivery_evidence FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION alert_cron.immutable_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Immutable original delivery evidence';END $$;
CREATE TRIGGER immutable_delivery_evidence BEFORE UPDATE OR DELETE ON alert_cron.delivery_evidence FOR EACH ROW EXECUTE FUNCTION alert_cron.immutable_evidence();
CREATE TRIGGER no_truncate_delivery_evidence BEFORE TRUNCATE ON alert_cron.delivery_evidence FOR EACH STATEMENT EXECUTE FUNCTION alert_cron.immutable_evidence();
CREATE FUNCTION alert_cron.record_delivery(d alert_cron.deliveries,p_message bigint,p_kind text,p_action jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE proof alert_cron.delivery_evidence;expected_proof alert_cron.delivery_evidence;
 a public.hato_alertas;e public.hato_alertas;mapping public.hato_alertas_envios;actual_mapping public.hato_alertas_envios;
 before_source jsonb;expected_source jsonb;before_map jsonb;expected_maps jsonb;context jsonb;before_row jsonb;
 executor jsonb='{"origin":"executor","principal":"service_role","job":"hato_alertas_tick"}';
BEGIN
 LOCK TABLE public.hato_alertas_envios IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO proof FROM alert_cron.delivery_evidence WHERE delivery_id=d.id;
 IF FOUND THEN IF proof.message_id IS DISTINCT FROM p_message THEN RAISE EXCEPTION 'Original delivery message changed';END IF;RETURN;END IF;
 IF p_message IS NULL OR p_message NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Known original message required';END IF;
 before_source=alert_cron.source();expected_source=before_source;
 before_map=(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY alerta_id,telegram_id),'[]') FROM public.hato_alertas_envios x);expected_maps=before_map;
 expected_proof.delivery_id=d.id;expected_proof.kind=p_kind;expected_proof.message_id=p_message;expected_proof.action=p_action;expected_proof.recorded_at=now();
 INSERT INTO alert_cron.delivery_evidence SELECT expected_proof.* RETURNING * INTO proof;
 IF NOT FOUND OR to_jsonb(proof) IS DISTINCT FROM to_jsonb(expected_proof) THEN RAISE EXCEPTION 'Delivery evidence suppressed/mutated';END IF;
 -- A known external result is recorded even when the human target/config changed in flight.
 -- Metadata touches the alert only if its semantic frozen context is still current.
 BEGIN context=alert_cron.delivery_context(d.alert_id,d.registration_id,d.phase);EXCEPTION WHEN raise_exception THEN context=NULL;END;
 IF context IS NOT DISTINCT FROM d.context AND d.phase='delivery' THEN
  SELECT * INTO e FROM public.hato_alertas WHERE id=d.alert_id;before_row=to_jsonb(e);
  IF e.estado IN('pendiente','enviada') AND jsonb_typeof(e.datos)='object' THEN
   e.estado='enviada';e.updated_at=now();e.destinatario_telegram_id=coalesce(e.destinatario_telegram_id,d.recipient::text);
   IF NOT(e.datos?'enviada_en') THEN e.datos=e.datos||jsonb_build_object('enviada_en',now());END IF;
   UPDATE public.hato_alertas SET estado=e.estado,updated_at=e.updated_at,destinatario_telegram_id=e.destinatario_telegram_id,datos=e.datos WHERE id=e.id RETURNING * INTO a;
   IF NOT FOUND OR to_jsonb(a) IS DISTINCT FROM to_jsonb(e) THEN RAISE EXCEPTION 'Accepted alert metadata suppressed/mutated';END IF;
   expected_source=jsonb_set(before_source,'{domain,alerts}',(SELECT jsonb_agg(CASE WHEN x->>'id'=e.id::text THEN to_jsonb(e) ELSE x END ORDER BY x->>'id') FROM jsonb_array_elements(before_source->'domain'->'alerts')x));
   PERFORM alert_cron.log(d.run_id,d.alert_id,'accepted_metadata',executor,before_row,to_jsonb(a));
  END IF;
 END IF;
 -- The frozen evidence retains every original id even when the legacy latest-message mapping changes.
 IF d.phase='delivery' THEN
  mapping.alerta_id=d.alert_id;mapping.telegram_id=d.recipient::text;mapping.message_id=p_message;mapping.enviado_at=now();
  INSERT INTO public.hato_alertas_envios SELECT mapping.* ON CONFLICT(alerta_id,telegram_id) DO UPDATE SET message_id=EXCLUDED.message_id,enviado_at=EXCLUDED.enviado_at RETURNING * INTO actual_mapping;
  IF NOT FOUND OR to_jsonb(actual_mapping) IS DISTINCT FROM to_jsonb(mapping) THEN RAISE EXCEPTION 'Accepted message mapping suppressed/mutated';END IF;
  expected_maps=(SELECT jsonb_agg(x ORDER BY x->>'alerta_id',x->>'telegram_id') FROM(SELECT x FROM jsonb_array_elements(before_map)x WHERE NOT(x->>'alerta_id'=d.alert_id::text AND x->>'telegram_id'=d.recipient::text) UNION ALL SELECT to_jsonb(mapping))all_maps);
 END IF;
 PERFORM alert_cron.log(d.run_id,d.id,'delivery_evidence',executor,NULL,to_jsonb(proof));
 SELECT * INTO proof FROM alert_cron.delivery_evidence WHERE delivery_id=d.id;
 IF NOT FOUND OR to_jsonb(proof) IS DISTINCT FROM to_jsonb(expected_proof) OR alert_cron.source() IS DISTINCT FROM expected_source
 OR (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY alerta_id,telegram_id),'[]') FROM public.hato_alertas_envios x) IS DISTINCT FROM expected_maps THEN RAISE EXCEPTION 'Delivery evidence/domain/mapping readback mismatch';END IF;
END $$;
ALTER FUNCTION alert_cron.delivery(text,uuid,jsonb) RENAME TO delivery_foundation;
CREATE FUNCTION alert_cron.delivery(p_action text,p_id uuid,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE result jsonb;d alert_cron.deliveries;
BEGIN
 result=alert_cron.delivery_foundation(p_action,p_id,p_payload);
 IF p_action='settle' AND result->'delivery'->>'state'='sent' THEN
  SELECT * INTO d FROM alert_cron.deliveries WHERE id=p_id;
  PERFORM alert_cron.record_delivery(d,(d.result->>'telegramMessageId')::bigint,'accepted_api',NULL);
 END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION alert_cron.post(p_id uuid,p_plan jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
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
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_plan->'deliveries')i JOIN public.hato_alertas ha ON ha.regla_clave=i->>'reglaClave' JOIN alert_cron.deliveries d ON d.alert_id=ha.id WHERE d.state IN('queued','sending','unknown') AND NOT EXISTS(SELECT 1 FROM alert_cron.delivery_evidence e WHERE e.delivery_id=d.id)) THEN RAISE EXCEPTION 'Original unresolved delivery held; no replacement send permitted';END IF;
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
CREATE FUNCTION public.fn_alert_cron_private_callback(p_delivery uuid,p_sender bigint,p_chat_id bigint,p_message_id bigint,p_text text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE d alert_cron.deliveries;actor jsonb;current_alert public.hato_alertas;proof alert_cron.delivery_evidence;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted native executor required' USING ERRCODE='42501';END IF;
 PERFORM alert_cron.lock_source();actor=hato_treatment_creation.telegram_actor(p_sender,p_chat_id,p_message_id);
 SELECT * INTO d FROM alert_cron.deliveries WHERE id=p_delivery FOR UPDATE;
 IF NOT FOUND OR d.phase<>'delivery' OR d.claim_key IS NULL OR d.state NOT IN('sending','unknown','sent') OR d.recipient IS DISTINCT FROM p_sender
 OR d.registration_id::text IS DISTINCT FROM actor->>'registrationId' OR d.context->'recipient'->'profileId' IS DISTINCT FROM actor->'profileId'
 OR d.body->>'text' IS DISTINCT FROM p_text THEN RAISE EXCEPTION 'Original frozen private action required';END IF;
 IF d.state='sent' AND (d.result->>'telegramMessageId')::bigint IS DISTINCT FROM p_message_id THEN RAISE EXCEPTION 'Original accepted message required';END IF;
 PERFORM alert_cron.record_delivery(d,p_message_id,'original_private_callback',jsonb_build_object('sender',p_sender,'chatId',p_chat_id,'messageId',p_message_id));
 SELECT * INTO current_alert FROM public.hato_alertas WHERE id=d.alert_id;
 SELECT * INTO proof FROM alert_cron.delivery_evidence WHERE delivery_id=d.id;
 RETURN jsonb_build_object('version',1,'deliveryId',d.id,'alertId',d.alert_id,'type',current_alert.tipo,'stepId',current_alert.paso_id,
 'action',jsonb_build_object('sender',p_sender,'chatId',p_chat_id,'messageId',p_message_id),'evidence',to_jsonb(proof));
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA alert_cron FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_alert_cron_private_callback(uuid,bigint,bigint,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_alert_cron_private_callback(uuid,bigint,bigint,bigint,text) TO service_role;
COMMIT;
