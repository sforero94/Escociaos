-- NONNUMBERED atomic death/current animal lifecycle after22candidates. Offline only.
BEGIN;
SELECT alert_cron.lock_source();
DO $admission$ DECLARE fingerprint text;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed death installation owner required';END IF;
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
WHERE n.nspname='public' AND c.relname IN('hato_animales','hato_eventos','hato_alertas','usuarios','telegram_usuarios','hato_config','hato_alertas_config','telegram_alertas_suscripciones','hato_tratamientos','hato_tratamiento_pasos','v_hato_estado_actual','hato_chequeos','hato_chequeo_vacas')) AS e(baseline);
 IF fingerprint IS DISTINCT FROM 'e38c55e63d4edead8ad75bb4907bdbbf' THEN RAISE EXCEPTION 'Unreviewed death source graph';END IF;
 PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
END $admission$;
CREATE SCHEMA hato_death;
REVOKE ALL ON SCHEMA hato_death FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_death.requests(request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,intent jsonb,original jsonb,event_id uuid,state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,
 CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR intent IS NOT NULL AND original IS NOT NULL AND event_id IS NOT NULL));
CREATE TABLE hato_death.audit(request_key uuid PRIMARY KEY REFERENCES hato_death.requests(request_key),receipt jsonb NOT NULL);
ALTER TABLE hato_death.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_death.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_death FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_death.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' OR OLD.state<>'pending' OR NEW.state NOT IN('committed','canceled') OR (to_jsonb(NEW)-'state'-'receipt') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'receipt') THEN RAISE EXCEPTION 'Immutable original death proof';END IF;RETURN NEW;
END $$;
CREATE TRIGGER immutable_death_request BEFORE UPDATE OR DELETE ON hato_death.requests FOR EACH ROW EXECUTE FUNCTION hato_death.immutable();
CREATE TRIGGER immutable_death_audit BEFORE UPDATE OR DELETE ON hato_death.audit FOR EACH ROW EXECUTE FUNCTION hato_death.immutable();
CREATE TRIGGER no_truncate_death_request BEFORE TRUNCATE ON hato_death.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_death.immutable();
CREATE TRIGGER no_truncate_death_audit BEFORE TRUNCATE ON hato_death.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_death.immutable();
CREATE FUNCTION hato_death.snapshot(p_animal uuid) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('animal',(SELECT to_jsonb(x) FROM public.hato_animales x WHERE id=p_animal),
 'events',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_eventos x WHERE animal_id=p_animal),
 'headers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_tratamientos x WHERE animal_id=p_animal),
 'steps',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_tratamiento_pasos x WHERE tratamiento_id IN(SELECT id FROM public.hato_tratamientos WHERE animal_id=p_animal)),
 'checks',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeo_vacas x WHERE animal_id=p_animal),
 'checkHeaders',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeos x WHERE id IN(SELECT chequeo_id FROM public.hato_chequeo_vacas WHERE animal_id=p_animal)),
 'alerts',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_alertas x WHERE animal_id=p_animal));
$$;
CREATE FUNCTION hato_death.result(r hato_death.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'owner',r.owner_id,'state',r.state,'intent',r.intent,'original',r.original,'eventId',r.event_id,'receipt',r.receipt);
$$;
CREATE FUNCTION public.fn_hato_death_web(p_action text,p_request_key uuid,p_intent jsonb,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_death.requests;expected hato_death.requests;before_source jsonb;expected_source jsonb;original jsonb;actual jsonb;
 animal public.hato_animales;expected_animal public.hato_animales;event public.hato_eventos;expected_event public.hato_eventos;
 correction public.hato_correcciones;correction_rows jsonb;expected_corrections jsonb;audit hato_death.audit;actual_audit hato_death.audit;new_receipt jsonb;day date;target uuid;view_inputs jsonb;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner OR p_request_key IS NULL THEN RAISE EXCEPTION 'Original death owner/key required' USING ERRCODE='42501';END IF;
 actor=hato_treatment_creation.web_actor();
 IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve') THEN RAISE EXCEPTION 'Invalid death action';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-death:'||p_request_key::text,0));
 SELECT * INTO r FROM hato_death.requests WHERE request_key=p_request_key FOR UPDATE;
 IF FOUND AND r.owner_id IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original death owner changed' USING ERRCODE='42501';END IF;
 IF p_action<>'prepare' AND p_intent IS NOT NULL THEN RAISE EXCEPTION 'Original death intent cannot be replaced';END IF;
 IF p_action='status' THEN
  IF r.request_key IS NULL THEN RETURN jsonb_build_object('version',1,'requestKey',p_request_key,'owner',p_expected_owner,'state','unknown','intent',NULL,'original',NULL,'eventId',NULL,'receipt',NULL);END IF;
  IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_death.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original death audit missing';END IF;
  RETURN hato_death.result(r);
 END IF;
 PERFORM alert_cron.lock_source();before_source=alert_cron.source();expected_source=before_source;
 view_inputs=jsonb_build_object('checks',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeo_vacas x),'headers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeos x));
 IF p_action='prepare' THEN
  IF jsonb_typeof(p_intent) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_intent)k) IS DISTINCT FROM ARRAY['animalId','cause','date','observedAnimal','version'] OR p_intent->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p_intent->'animalId') IS DISTINCT FROM 'string' OR jsonb_typeof(p_intent->'date') IS DISTINCT FROM 'string' OR jsonb_typeof(p_intent->'cause') IS DISTINCT FROM 'string' OR length(p_intent->>'cause')>4000 OR btrim(p_intent->>'cause') IS DISTINCT FROM p_intent->>'cause' THEN RAISE EXCEPTION 'Exact bounded death intent required';END IF;
  target=(p_intent->>'animalId')::uuid;day=(p_intent->>'date')::date;
  IF target::text IS DISTINCT FROM p_intent->>'animalId' OR NOT isfinite(day) OR to_char(day,'YYYY-MM-DD') IS DISTINCT FROM p_intent->>'date' OR day>(now() AT TIME ZONE 'America/Bogota')::date THEN RAISE EXCEPTION 'Canonical actual death date/animal required';END IF;
  IF r.request_key IS NOT NULL THEN IF r.intent IS NOT NULL AND r.intent IS DISTINCT FROM p_intent THEN RAISE EXCEPTION 'Original death intent changed';END IF;RETURN hato_death.result(r);END IF;
  original=hato_death.snapshot(target);
  IF original->'animal'->>'estado' IS DISTINCT FROM 'activa' OR original->'animal' IS DISTINCT FROM p_intent->'observedAnimal' THEN RAISE EXCEPTION 'Observed active animal changed';END IF;
  r.request_key=p_request_key;r.owner_id=p_expected_owner;r.intent=p_intent;r.original=original;r.event_id=gen_random_uuid();r.state='pending';expected=r;
  INSERT INTO hato_death.requests SELECT expected.* RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Death reservation suppressed/mutated';END IF;
 ELSIF p_action='resolve' THEN
  IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='canceled';expected=r;INSERT INTO hato_death.requests SELECT expected.* RETURNING * INTO r;
  ELSIF r.state='pending' THEN expected=r;expected.state='canceled';UPDATE hato_death.requests SET state='canceled' WHERE request_key=p_request_key RETURNING * INTO r;
  ELSE RETURN hato_death.result(r);END IF;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Death cancellation suppressed/mutated';END IF;
 ELSIF p_action='post' THEN
  IF r.request_key IS NULL THEN RAISE EXCEPTION 'Original prepared death required';END IF;
  IF r.state='committed' THEN
   IF NOT EXISTS(SELECT 1 FROM hato_death.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original death audit missing';END IF;RETURN hato_death.result(r);
  ELSIF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled death cannot post';END IF;
  target=(r.intent->>'animalId')::uuid;day=(r.intent->>'date')::date;original=r.original;
  IF hato_death.snapshot(target) IS DISTINCT FROM original THEN RAISE EXCEPTION 'Original death source graph changed';END IF;
  expected_event=jsonb_populate_record(NULL::public.hato_eventos,jsonb_build_object('id',r.event_id,'animal_id',target,'tipo','muerte','fecha',day,'fecha_confianza','exacta','fuente','web','datos',CASE WHEN r.intent->>'cause'='' THEN NULL ELSE jsonb_build_object('causa',r.intent->>'cause') END,'created_by',p_expected_owner,'created_at',now()));
  correction_rows=before_source->'domain'->'corrections';
  INSERT INTO public.hato_eventos SELECT expected_event.* RETURNING * INTO event;
  IF NOT FOUND OR to_jsonb(event) IS DISTINCT FROM to_jsonb(expected_event) THEN RAISE EXCEPTION 'Death event suppressed/mutated';END IF;
  expected_animal=jsonb_populate_record(NULL::public.hato_animales,original->'animal');expected_animal.estado='muerta';expected_animal.fecha_estado=day;
  -- The existing reviewed human correction writer must record this exact original and result.
  UPDATE public.hato_animales SET estado=expected_animal.estado,fecha_estado=expected_animal.fecha_estado WHERE id=target RETURNING * INTO animal;
  IF NOT FOUND OR to_jsonb(animal) IS DISTINCT FROM to_jsonb(expected_animal) THEN RAISE EXCEPTION 'Death animal state suppressed/mutated';END IF;
  SELECT * INTO correction FROM public.hato_correcciones WHERE id NOT IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(correction_rows)x);
  IF NOT FOUND OR (SELECT count(*) FROM public.hato_correcciones WHERE id NOT IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(correction_rows)x))<>1 OR correction.tabla<>'hato_animales' OR correction.fila_id<>target OR correction.operacion<>'update' OR correction.datos_anteriores IS DISTINCT FROM original->'animal' OR correction.datos_nuevos IS DISTINCT FROM to_jsonb(expected_animal) OR correction.animal_id<>target OR correction.corregido_por IS DISTINCT FROM p_expected_owner OR correction.corregido_en IS DISTINCT FROM now() OR correction.motivo IS NOT NULL THEN RAISE EXCEPTION 'Exact trusted death correction audit required';END IF;
  expected_corrections=(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements(correction_rows||jsonb_build_array(to_jsonb(correction)))x);
  expected_source=jsonb_set(expected_source,'{domain,events}',(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements((expected_source->'domain'->'events')||jsonb_build_array(to_jsonb(expected_event)))x));
  expected_source=jsonb_set(expected_source,'{domain,animals}',(SELECT jsonb_agg(CASE WHEN x->>'id'=target::text THEN to_jsonb(expected_animal) ELSE x END ORDER BY x->>'id') FROM jsonb_array_elements(expected_source->'domain'->'animals')x));
  expected_source=jsonb_set(expected_source,'{domain,corrections}',expected_corrections);
  -- The admitted view is derived from exact checked animals/events and unchanged chequeo inputs.
  expected_source=jsonb_set(expected_source,'{animalsView}',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY animal_id),'[]') FROM public.v_hato_estado_actual x));
  IF alert_cron.source() IS DISTINCT FROM expected_source THEN RAISE EXCEPTION 'Death final source mismatch';END IF;
  actual=hato_death.snapshot(target);
  IF actual IS DISTINCT FROM jsonb_set(jsonb_set(original,'{animal}',to_jsonb(expected_animal)),'{events}',(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements((original->'events')||jsonb_build_array(to_jsonb(expected_event)))x)) THEN RAISE EXCEPTION 'Death exact target graph mismatch';END IF;
  new_receipt=jsonb_build_object('version',1,'requestKey',p_request_key,'owner',p_expected_owner,'intent',r.intent,'original',original,'eventId',r.event_id,'actor',actor,'recordedAt',now(),'after',actual,'correction',to_jsonb(correction));
  audit.request_key=p_request_key;audit.receipt=new_receipt;INSERT INTO hato_death.audit SELECT audit.* RETURNING * INTO actual_audit;
  IF NOT FOUND OR to_jsonb(actual_audit) IS DISTINCT FROM to_jsonb(audit) THEN RAISE EXCEPTION 'Death trusted audit suppressed/mutated';END IF;
  expected=r;expected.state='committed';expected.receipt=new_receipt;UPDATE hato_death.requests SET state='committed',receipt=new_receipt WHERE request_key=p_request_key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Death committed control suppressed/mutated';END IF;
 END IF;
 IF view_inputs IS DISTINCT FROM jsonb_build_object('checks',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeo_vacas x),'headers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeos x)) THEN RAISE EXCEPTION 'Death derived-view inputs changed';END IF;
 IF hato_treatment_creation.web_actor() IS DISTINCT FROM actor OR alert_cron.source() IS DISTINCT FROM expected_source THEN RAISE EXCEPTION 'Death final authority/source mismatch';END IF;
 SELECT * INTO r FROM hato_death.requests WHERE request_key=p_request_key;
 IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Death final request readback mismatch';END IF;
 IF r.state='committed' AND (hato_death.snapshot((r.intent->>'animalId')::uuid) IS DISTINCT FROM r.receipt->'after' OR NOT EXISTS(SELECT 1 FROM hato_death.audit WHERE request_key=p_request_key AND receipt=r.receipt)) THEN RAISE EXCEPTION 'Death final audit/target readback mismatch';END IF;
 RETURN hato_death.result(r);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_death FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_death_web(text,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_death_web(text,uuid,jsonb,uuid) TO authenticated;
COMMIT;
