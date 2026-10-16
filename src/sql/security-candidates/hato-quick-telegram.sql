-- NONNUMBERED Telegram quick-event + selected pajilla transaction after29candidates. Offline only.
-- Santiago Option1, October16: selected usage and event are all-or-nothing.
-- Zero/negative stock warns only. Existing events/usages are never adopted or repaired.
BEGIN;
SELECT alert_cron.lock_source();
DO $admission$ DECLARE fingerprint text;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed quick installation owner required';END IF;
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
 IF fingerprint IS DISTINCT FROM '5ae11977b7a8e2f574bd41bb07f76ddc' THEN RAISE EXCEPTION 'Unreviewed quick source graph';END IF;
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
 IF fingerprint IS DISTINCT FROM 'e0e432ae1b0ae23408509079dde7921c' THEN RAISE EXCEPTION 'Unreviewed quick inventory graph %',fingerprint;END IF;
 PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_death.snapshot(uuid)') AND md5(p.prosrc)='a6bf1457f7ab6b1adf5cae9c9c78d308' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') OR EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role'))v(role) WHERE has_function_privilege(v.role,'hato_death.snapshot(uuid)','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed quick snapshot helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_treatment_creation.telegram_actor(bigint,bigint,bigint)') AND md5(p.prosrc)='e58604b57f82fd09c9ba612591b9c3e6' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed quick actor helper';END IF;
END $admission$;
CREATE SCHEMA hato_quick_telegram;
REVOKE ALL ON SCHEMA hato_quick_telegram FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_quick_telegram.requests(request_key uuid PRIMARY KEY,actor jsonb NOT NULL,sender bigint NOT NULL,chat_id bigint NOT NULL,message_id bigint NOT NULL,UNIQUE(sender,chat_id,message_id),CHECK(sender>0 AND chat_id=sender AND message_id>0),intent jsonb,original jsonb,plan jsonb,effective_date date,state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,
 CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR intent IS NOT NULL AND original IS NOT NULL AND plan IS NOT NULL AND effective_date IS NOT NULL));
CREATE TABLE hato_quick_telegram.audit(request_key uuid PRIMARY KEY REFERENCES hato_quick_telegram.requests(request_key),receipt jsonb NOT NULL);
ALTER TABLE hato_quick_telegram.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_quick_telegram.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_quick_telegram FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_quick_telegram.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' OR OLD.state<>'pending' OR NEW.state NOT IN('committed','canceled') OR (to_jsonb(NEW)-'state'-'receipt') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'receipt') THEN RAISE EXCEPTION 'Immutable original quick proof';END IF;RETURN NEW;END $$;
CREATE TRIGGER immutable_quick_request BEFORE UPDATE OR DELETE ON hato_quick_telegram.requests FOR EACH ROW EXECUTE FUNCTION hato_quick_telegram.immutable();
CREATE TRIGGER immutable_quick_audit BEFORE UPDATE OR DELETE ON hato_quick_telegram.audit FOR EACH ROW EXECUTE FUNCTION hato_quick_telegram.immutable();
CREATE TRIGGER no_truncate_quick_request BEFORE TRUNCATE ON hato_quick_telegram.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_quick_telegram.immutable();
CREATE TRIGGER no_truncate_quick_audit BEFORE TRUNCATE ON hato_quick_telegram.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_quick_telegram.immutable();
CREATE FUNCTION hato_quick_telegram.actor(p_sender bigint,p_chat bigint,p_message bigint) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT hato_treatment_creation.telegram_actor(p_sender,p_chat,p_message);
$$;
CREATE FUNCTION hato_quick_telegram.snapshot(target uuid) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('graph',hato_death.snapshot(target),'animals',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_animales x),'config',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY clave),'[]') FROM public.hato_config x),'toros',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_toros x),'lots',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_pajillas x),'uses',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_pajillas_uso x),'stock',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY pajilla_id),'[]') FROM public.v_hato_pajillas_stock x),'view',(SELECT to_jsonb(x) FROM public.v_hato_estado_actual x WHERE animal_id=target));
$$;
CREATE FUNCTION hato_quick_telegram.payloads(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE day date;BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p)k) IS DISTINCT FROM ARRAY['animalId','fecha','kind','observedAnimal','pajillaId','toroId','version'] OR p->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p->'animalId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'observedAnimal') IS DISTINCT FROM 'object' OR jsonb_typeof(p->'fecha') IS DISTINCT FROM 'string' OR p->>'kind' NOT IN('monta','inseminacion','secado','aborto') OR jsonb_typeof(p->'kind') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Exact bounded quick intent required';END IF;
 IF p->>'kind' IN('monta','inseminacion') THEN
  IF jsonb_typeof(p->'toroId') IS DISTINCT FROM 'string' OR ((p->>'toroId')::uuid)::text IS DISTINCT FROM p->>'toroId' THEN RAISE EXCEPTION 'Canonical selected bull required';END IF;
 ELSE IF p->'toroId' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Unexpected bull';END IF;END IF;
 IF p->'pajillaId' IS DISTINCT FROM 'null'::jsonb AND (p->>'kind'<>'inseminacion' OR jsonb_typeof(p->'pajillaId') IS DISTINCT FROM 'string' OR ((p->>'pajillaId')::uuid)::text IS DISTINCT FROM p->>'pajillaId') THEN RAISE EXCEPTION 'Canonical selected lot required';END IF;
 day=(p->>'fecha')::date;IF NOT isfinite(day) OR to_char(day,'YYYY-MM-DD') IS DISTINCT FROM p->>'fecha' THEN RAISE EXCEPTION 'Canonical quick date required';END IF;
 RETURN jsonb_build_array(jsonb_build_object('tipo',CASE p->>'kind' WHEN 'monta' THEN 'servicio' WHEN 'inseminacion' THEN 'servicio' WHEN 'secado' THEN 'secado_real' ELSE 'aborto' END,'tipo_servicio',CASE WHEN p->>'kind' IN('monta','inseminacion') THEN p->>'kind' ELSE NULL END,'toro_id',p->'toroId','fecha',day,'fecha_confianza','exacta','fuente','telegram'));
END $$;
CREATE FUNCTION hato_quick_telegram.result(r hato_quick_telegram.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'actor',r.actor,'action',jsonb_build_object('sender',r.sender,'chatId',r.chat_id,'messageId',r.message_id),'state',r.state,'intent',r.intent,'original',r.original,'plan',r.plan,'effectiveDate',r.effective_date,'receipt',r.receipt);
$$;
CREATE FUNCTION public.fn_hato_quick_telegram(p_action text,p_sender bigint,p_chat_id bigint,p_message_id bigint,p_intent jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_quick_telegram.requests;expected hato_quick_telegram.requests;before_source jsonb;expected_source jsonb;original jsonb;actual jsonb;payloads jsonb;v jsonb;planned_events jsonb='[]';posted_events jsonb='[]';usage public.hato_pajillas_uso;written_usage public.hato_pajillas_uso;e public.hato_eventos;written_event public.hato_eventos;usage_json jsonb='null';before_inventory jsonb;expected_inventory jsonb;day date;target uuid;key uuid;view_inputs jsonb;new_receipt jsonb;audit hato_quick_telegram.audit;written_audit hato_quick_telegram.audit;
BEGIN
 actor=hato_quick_telegram.actor(p_sender,p_chat_id,p_message_id);IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve') THEN RAISE EXCEPTION 'Invalid quick action';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-quick-telegram:'||p_sender::text||':'||p_chat_id::text||':'||p_message_id::text,0));
 SELECT * INTO r FROM hato_quick_telegram.requests WHERE sender=p_sender AND chat_id=p_chat_id AND message_id=p_message_id FOR UPDATE;
 IF FOUND THEN key=r.request_key;IF r.actor IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Original quick actor changed' USING ERRCODE='42501';END IF;END IF;
 IF p_action<>'prepare' AND p_intent IS NOT NULL THEN RAISE EXCEPTION 'Original quick intent cannot be replaced';END IF;
 IF p_action='status' THEN
  IF r.request_key IS NULL THEN r.actor=actor;r.sender=p_sender;r.chat_id=p_chat_id;r.message_id=p_message_id;r.state='unknown';RETURN hato_quick_telegram.result(r);END IF;
  IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_quick_telegram.audit WHERE request_key=key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original quick audit missing';END IF;RETURN hato_quick_telegram.result(r);
 END IF;
 PERFORM alert_cron.lock_source();LOCK TABLE public.hato_toros,public.hato_pajillas,public.hato_pajillas_uso IN SHARE ROW EXCLUSIVE MODE;LOCK TABLE public.v_hato_pajillas_stock IN SHARE MODE;before_inventory=jsonb_build_object('lots',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_pajillas x),'uses',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_pajillas_uso x));expected_inventory=before_inventory;before_source=alert_cron.source();expected_source=before_source;
 view_inputs=jsonb_build_object('checks',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeo_vacas x),'headers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeos x),'toros',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_toros x));
 IF p_action='prepare' THEN
  payloads=hato_quick_telegram.payloads(p_intent);target=(p_intent->>'animalId')::uuid;
  IF target::text IS DISTINCT FROM p_intent->>'animalId' THEN RAISE EXCEPTION 'Canonical quick animal required';END IF;
  IF r.request_key IS NOT NULL THEN IF r.intent IS NOT NULL AND r.intent IS DISTINCT FROM p_intent THEN RAISE EXCEPTION 'Original quick intent changed';END IF;RETURN hato_quick_telegram.result(r);END IF;
  original=hato_quick_telegram.snapshot(target);day=(now() AT TIME ZONE 'America/Bogota')::date;
  IF jsonb_typeof(original->'graph'->'animal') IS DISTINCT FROM 'object' OR original->'graph'->'animal' IS DISTINCT FROM p_intent->'observedAnimal' OR original->'graph'->'animal'->>'estado'<>'activa' THEN RAISE EXCEPTION 'Observed active quick animal changed';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(payloads)x WHERE (x->>'fecha')::date>day) THEN RAISE EXCEPTION 'Future quick fact refused';END IF;
  -- Same fact cannot acquire replacement IDs after an uncertain original action.
  IF EXISTS(SELECT 1 FROM hato_quick_telegram.requests x WHERE x.state IN('pending','committed') AND (x.intent-'observedAnimal'-'pajillaId')=(p_intent-'observedAnimal'-'pajillaId')) THEN RAISE EXCEPTION 'Quick event already has an original protected action; recover or resolve it';END IF;
  IF EXISTS(SELECT 1 FROM public.hato_eventos x WHERE x.animal_id=target AND x.tipo=payloads->0->>'tipo' AND x.fecha=(p_intent->>'fecha')::date AND x.toro_id IS NOT DISTINCT FROM (p_intent->>'toroId')::uuid AND x.tipo_servicio IS NOT DISTINCT FROM payloads->0->>'tipo_servicio' AND x.chequeo_vaca_id IS NULL) THEN RAISE EXCEPTION 'Existing manual event cannot become prospective proof';END IF;
  IF p_intent->>'toroId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hato_toros WHERE id=(p_intent->>'toroId')::uuid AND activo AND tipo=p_intent->>'kind') THEN RAISE EXCEPTION 'Selected active bull changed';END IF;
  IF p_intent->>'pajillaId' IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.hato_pajillas WHERE id=(p_intent->>'pajillaId')::uuid AND toro_id=(p_intent->>'toroId')::uuid AND activa) THEN RAISE EXCEPTION 'Selected active lot/bull changed';END IF;
   IF EXISTS(SELECT 1 FROM public.hato_pajillas_uso WHERE pajilla_id=(p_intent->>'pajillaId')::uuid AND animal_id=target AND fecha_uso=(p_intent->>'fecha')::date) THEN RAISE EXCEPTION 'Existing usage cannot become prospective proof';END IF;
   usage=jsonb_populate_record(NULL::public.hato_pajillas_uso,jsonb_build_object('id',gen_random_uuid(),'pajilla_id',p_intent->'pajillaId','animal_id',target,'fecha_uso',p_intent->'fecha','created_by',(actor->>'profileId')::uuid));usage_json=to_jsonb(usage);
  END IF;
  FOR v IN SELECT x FROM jsonb_array_elements(payloads)x LOOP
   v=v||jsonb_build_object('datos',jsonb_build_object('origen','telegram','registrado_por',actor->'displayName')||CASE WHEN usage.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('pajilla_uso_id',usage.id) END);
   e=jsonb_populate_record(NULL::public.hato_eventos,v||jsonb_build_object('id',gen_random_uuid(),'animal_id',target,'created_by',(actor->>'profileId')::uuid));planned_events=planned_events||jsonb_build_array(to_jsonb(e));
  END LOOP;
  key=gen_random_uuid();r.request_key=key;r.actor=actor;r.sender=p_sender;r.chat_id=p_chat_id;r.message_id=p_message_id;r.intent=p_intent;r.original=original;r.plan=jsonb_build_object('events',planned_events,'usage',usage_json);r.effective_date=day;r.state='pending';expected=r;
  INSERT INTO hato_quick_telegram.requests SELECT expected.* RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Quick reservation suppressed/mutated';END IF;
 ELSIF p_action='resolve' THEN
  IF r.request_key IS NULL THEN key=gen_random_uuid();r.request_key=key;r.actor=actor;r.sender=p_sender;r.chat_id=p_chat_id;r.message_id=p_message_id;r.state='canceled';expected=r;INSERT INTO hato_quick_telegram.requests SELECT expected.* RETURNING * INTO r;
  ELSIF r.state='pending' THEN expected=r;expected.state='canceled';UPDATE hato_quick_telegram.requests SET state='canceled' WHERE request_key=key RETURNING * INTO r;
  ELSE RETURN hato_quick_telegram.result(r);END IF;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Quick cancellation suppressed/mutated';END IF;
 ELSIF p_action='post' THEN
  IF r.request_key IS NULL THEN RAISE EXCEPTION 'Original prepared quick required';END IF;
  IF r.state='committed' THEN IF NOT EXISTS(SELECT 1 FROM hato_quick_telegram.audit WHERE request_key=key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original quick audit missing';END IF;RETURN hato_quick_telegram.result(r);ELSIF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled quick cannot post';END IF;
  target=(r.intent->>'animalId')::uuid;original=r.original;
  IF r.effective_date IS DISTINCT FROM (now() AT TIME ZONE 'America/Bogota')::date THEN RAISE EXCEPTION 'Prepared quick day elapsed; resolve original request';END IF;
  IF hato_quick_telegram.snapshot(target) IS DISTINCT FROM original THEN RAISE EXCEPTION 'Original quick source graph changed';END IF;
  IF r.plan->'usage'<>'null'::jsonb THEN
   usage=jsonb_populate_record(NULL::public.hato_pajillas_uso,(r.plan->'usage')||jsonb_build_object('created_at',now()));
   INSERT INTO public.hato_pajillas_uso SELECT usage.* RETURNING * INTO written_usage;IF NOT FOUND OR to_jsonb(written_usage) IS DISTINCT FROM to_jsonb(usage) THEN RAISE EXCEPTION 'Quick usage suppressed/mutated';END IF;usage_json=to_jsonb(usage);
   expected_inventory=jsonb_set(expected_inventory,'{uses}',(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements((expected_inventory->'uses')||jsonb_build_array(usage_json))x));
  END IF;
  FOR v IN SELECT x FROM jsonb_array_elements(r.plan->'events')x LOOP
   e=jsonb_populate_record(NULL::public.hato_eventos,v||jsonb_build_object('created_at',now()));INSERT INTO public.hato_eventos SELECT e.* RETURNING * INTO written_event;
   IF NOT FOUND OR to_jsonb(written_event) IS DISTINCT FROM to_jsonb(e) THEN RAISE EXCEPTION 'Quick event suppressed/mutated';END IF;posted_events=posted_events||jsonb_build_array(to_jsonb(e));
  END LOOP;
  expected_source=jsonb_set(expected_source,'{domain,events}',(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements((expected_source->'domain'->'events')||posted_events)x));
  expected_source=jsonb_set(expected_source,'{animalsView}',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY animal_id),'[]') FROM public.v_hato_estado_actual x));
  actual=hato_death.snapshot(target);
  IF actual IS DISTINCT FROM jsonb_set(original->'graph','{events}',(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements((original->'graph'->'events')||posted_events)x)) OR (usage.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hato_pajillas_uso x WHERE id=usage.id AND to_jsonb(x)=usage_json)) THEN RAISE EXCEPTION 'Quick target/usage readback mismatch';END IF;
  new_receipt=jsonb_build_object('version',1,'requestKey',key,'actor',actor,'action',jsonb_build_object('sender',p_sender,'chatId',p_chat_id,'messageId',p_message_id),'intent',r.intent,'original',original,'plan',r.plan,'effectiveDate',r.effective_date,'recordedAt',now(),'after',actual,'usage',usage_json);
  audit.request_key=key;audit.receipt=new_receipt;INSERT INTO hato_quick_telegram.audit SELECT audit.* RETURNING * INTO written_audit;IF NOT FOUND OR to_jsonb(written_audit) IS DISTINCT FROM to_jsonb(audit) THEN RAISE EXCEPTION 'Quick trusted audit suppressed/mutated';END IF;
  expected=r;expected.state='committed';expected.receipt=new_receipt;UPDATE hato_quick_telegram.requests SET state='committed',receipt=new_receipt WHERE request_key=key RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Quick committed control suppressed/mutated';END IF;
 END IF;
 IF hato_quick_telegram.actor(p_sender,p_chat_id,p_message_id) IS DISTINCT FROM actor OR alert_cron.source() IS DISTINCT FROM expected_source THEN RAISE EXCEPTION 'Quick final authority/source mismatch';END IF;
 IF jsonb_build_object('lots',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_pajillas x),'uses',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_pajillas_uso x)) IS DISTINCT FROM expected_inventory THEN RAISE EXCEPTION 'Quick final inventory mismatch';END IF;
 IF view_inputs IS DISTINCT FROM jsonb_build_object('checks',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeo_vacas x),'headers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeos x),'toros',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_toros x)) THEN RAISE EXCEPTION 'Quick view/reference inputs changed';END IF;
 SELECT * INTO r FROM hato_quick_telegram.requests WHERE request_key=key;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Quick final request readback mismatch';END IF;
 IF r.state='committed' AND (hato_death.snapshot(target) IS DISTINCT FROM r.receipt->'after' OR NOT EXISTS(SELECT 1 FROM hato_quick_telegram.audit WHERE request_key=key AND receipt=r.receipt) OR (usage.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hato_pajillas_uso x WHERE id=usage.id AND to_jsonb(x)=usage_json))) THEN RAISE EXCEPTION 'Quick final audit/target/usage mismatch';END IF;
 RETURN hato_quick_telegram.result(r);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_quick_telegram FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_quick_telegram(text,bigint,bigint,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_quick_telegram(text,bigint,bigint,bigint,jsonb) TO service_role;
COMMIT;
