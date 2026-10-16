-- NONNUMBERED atomic animal edit/current animal lifecycle after26candidates. Offline only.
BEGIN;
SELECT alert_cron.lock_source();
DO $admission$ DECLARE fingerprint text;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed animal edit installation owner required';END IF;
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
 IF fingerprint IS DISTINCT FROM '5ae11977b7a8e2f574bd41bb07f76ddc' THEN RAISE EXCEPTION 'Unreviewed animal edit source graph';END IF;
 PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_death.snapshot(uuid)') AND md5(p.prosrc)='a6bf1457f7ab6b1adf5cae9c9c78d308' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') OR EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role'))v(role) WHERE has_function_privilege(v.role,'hato_death.snapshot(uuid)','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed animal edit snapshot helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_treatment_creation.web_actor()') AND md5(p.prosrc)='1d8ec54936d4f658da49a965b828224c' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed animal edit actor helper';END IF;
END $admission$;
CREATE SCHEMA hato_animal_edit;
REVOKE ALL ON SCHEMA hato_animal_edit FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_animal_edit.requests(request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,intent jsonb,original jsonb,effective_date date,state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,
 CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR intent IS NOT NULL AND original IS NOT NULL AND effective_date IS NOT NULL));
CREATE TABLE hato_animal_edit.audit(request_key uuid PRIMARY KEY REFERENCES hato_animal_edit.requests(request_key),receipt jsonb NOT NULL);
ALTER TABLE hato_animal_edit.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_animal_edit.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_animal_edit FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_animal_edit.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' OR OLD.state<>'pending' OR NEW.state NOT IN('committed','canceled') OR (to_jsonb(NEW)-'state'-'receipt') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'receipt') THEN RAISE EXCEPTION 'Immutable original animal edit proof';END IF;RETURN NEW;
END $$;
CREATE TRIGGER immutable_animal_edit_request BEFORE UPDATE OR DELETE ON hato_animal_edit.requests FOR EACH ROW EXECUTE FUNCTION hato_animal_edit.immutable();
CREATE TRIGGER immutable_animal_edit_audit BEFORE UPDATE OR DELETE ON hato_animal_edit.audit FOR EACH ROW EXECUTE FUNCTION hato_animal_edit.immutable();
CREATE TRIGGER no_truncate_animal_edit_request BEFORE TRUNCATE ON hato_animal_edit.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_animal_edit.immutable();
CREATE TRIGGER no_truncate_animal_edit_audit BEFORE TRUNCATE ON hato_animal_edit.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_animal_edit.immutable();
CREATE FUNCTION hato_animal_edit.validate_changes(v jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE k text;d date;
BEGIN
 IF jsonb_typeof(v->'numero') NOT IN('number','null') OR (v->>'numero' IS NOT NULL AND ((v->>'numero')::numeric<>trunc((v->>'numero')::numeric) OR abs((v->>'numero')::numeric)>2147483647)) OR jsonb_typeof(v->'etapa') IS DISTINCT FROM 'string' OR v->>'etapa' NOT IN('ternera','novilla','vaca','toro') OR jsonb_typeof(v->'etapa_forzada') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid editable animal values';END IF;
 FOREACH k IN ARRAY ARRAY['nombre','raza'] LOOP
  IF jsonb_typeof(v->k) NOT IN('null','string') OR (v->>k IS NOT NULL AND (length(v->>k)>4000 OR btrim(v->>k)='' OR btrim(v->>k) IS DISTINCT FROM v->>k)) THEN RAISE EXCEPTION 'Invalid editable animal text';END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['madre_id','padre_toro_id'] LOOP
  IF jsonb_typeof(v->k) NOT IN('null','string') OR (v->>k IS NOT NULL AND (v->>k)::uuid::text IS DISTINCT FROM v->>k) THEN RAISE EXCEPTION 'Canonical genealogy reference required';END IF;
 END LOOP;
 IF jsonb_typeof(v->'fecha_nacimiento') NOT IN('null','string') THEN RAISE EXCEPTION 'Canonical birth date required';END IF;
 IF v->>'fecha_nacimiento' IS NOT NULL THEN d=(v->>'fecha_nacimiento')::date;IF NOT isfinite(d) OR to_char(d,'YYYY-MM-DD') IS DISTINCT FROM v->>'fecha_nacimiento' THEN RAISE EXCEPTION 'Canonical birth date required';END IF;END IF;
END $$;
CREATE FUNCTION hato_animal_edit.snapshot(target uuid,changes jsonb) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT hato_death.snapshot(target)||jsonb_build_object('refs',jsonb_build_object('mother',(SELECT to_jsonb(x) FROM public.hato_animales x WHERE id=(changes->>'madre_id')::uuid),'toro',(SELECT to_jsonb(x) FROM public.hato_toros x WHERE id=(changes->>'padre_toro_id')::uuid)));
$$;
CREATE FUNCTION hato_animal_edit.result(r hato_animal_edit.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'owner',r.owner_id,'state',r.state,'intent',r.intent,'original',r.original,'effectiveDate',r.effective_date,'receipt',r.receipt);
$$;
CREATE FUNCTION public.fn_hato_animal_edit_web(p_action text,p_request_key uuid,p_intent jsonb,p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r hato_animal_edit.requests;expected hato_animal_edit.requests;before_source jsonb;expected_source jsonb;original jsonb;actual jsonb;
 animal public.hato_animales;expected_animal public.hato_animales;
 correction public.hato_correcciones;correction_rows jsonb;expected_corrections jsonb;audit hato_animal_edit.audit;actual_audit hato_animal_edit.audit;new_receipt jsonb;day date;target uuid;view_inputs jsonb;
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner OR p_request_key IS NULL THEN RAISE EXCEPTION 'Original animal edit owner/key required' USING ERRCODE='42501';END IF;
 actor=hato_treatment_creation.web_actor();
 IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve') THEN RAISE EXCEPTION 'Invalid animal edit action';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-animal edit:'||p_request_key::text,0));
 SELECT * INTO r FROM hato_animal_edit.requests WHERE request_key=p_request_key FOR UPDATE;
 IF FOUND AND r.owner_id IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original animal edit owner changed' USING ERRCODE='42501';END IF;
 IF p_action<>'prepare' AND p_intent IS NOT NULL THEN RAISE EXCEPTION 'Original animal edit intent cannot be replaced';END IF;
 IF p_action='status' THEN
  IF r.request_key IS NULL THEN RETURN jsonb_build_object('version',1,'requestKey',p_request_key,'owner',p_expected_owner,'state','unknown','intent',NULL,'original',NULL,'effectiveDate',NULL,'receipt',NULL);END IF;
  IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_animal_edit.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original animal edit audit missing';END IF;
  RETURN hato_animal_edit.result(r);
 END IF;
 PERFORM alert_cron.lock_source();LOCK TABLE public.hato_toros IN SHARE ROW EXCLUSIVE MODE;before_source=alert_cron.source();expected_source=before_source;
 view_inputs=jsonb_build_object('checks',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeo_vacas x),'headers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeos x),'toros',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_toros x));
 IF p_action='prepare' THEN
  IF jsonb_typeof(p_intent) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_intent)k) IS DISTINCT FROM ARRAY['animalId','changes','observedAnimal','version'] OR p_intent->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p_intent->'animalId') IS DISTINCT FROM 'string' OR jsonb_typeof(p_intent->'observedAnimal') IS DISTINCT FROM 'object' OR jsonb_typeof(p_intent->'changes') IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_intent->'changes')k) IS DISTINCT FROM ARRAY['etapa','etapa_forzada','fecha_nacimiento','madre_id','nombre','numero','padre_toro_id','raza'] THEN RAISE EXCEPTION 'Exact bounded animal edit intent required';END IF;
  target=(p_intent->>'animalId')::uuid;
  IF target::text IS DISTINCT FROM p_intent->>'animalId' THEN RAISE EXCEPTION 'Canonical actual animal required';END IF;
  PERFORM hato_animal_edit.validate_changes(p_intent->'changes');
  IF r.request_key IS NOT NULL THEN IF r.intent IS NOT NULL AND r.intent IS DISTINCT FROM p_intent THEN RAISE EXCEPTION 'Original animal edit intent changed';END IF;RETURN hato_animal_edit.result(r);END IF;
  original=hato_animal_edit.snapshot(target,p_intent->'changes');
  IF jsonb_typeof(original->'animal') IS DISTINCT FROM 'object' OR original->'animal' IS DISTINCT FROM p_intent->'observedAnimal' THEN RAISE EXCEPTION 'Observed animal changed';END IF;
  IF p_intent->'changes'->>'madre_id'=target::text OR (p_intent->'changes'->>'madre_id' IS NOT NULL AND original->'refs'->'mother'='null'::jsonb) OR (p_intent->'changes'->>'padre_toro_id' IS NOT NULL AND original->'refs'->'toro'='null'::jsonb) THEN RAISE EXCEPTION 'Selected genealogy reference missing or self';END IF;
  -- A newly selected mother follows the existing conservative picker; retain unchanged historical links.
  IF p_intent->'changes'->>'madre_id' IS DISTINCT FROM original->'animal'->>'madre_id' AND p_intent->'changes'->>'madre_id' IS NOT NULL AND (original->'refs'->'mother'->>'etapa'='toro' OR (original->'refs'->'mother'->>'fecha_nacimiento' IS NOT NULL AND original->'animal'->>'fecha_nacimiento' IS NOT NULL AND original->'refs'->'mother'->>'fecha_nacimiento'>=original->'animal'->>'fecha_nacimiento')) THEN RAISE EXCEPTION 'New mother is outside existing picker contract';END IF;
  IF p_intent->'changes'->>'padre_toro_id' IS DISTINCT FROM original->'animal'->>'padre_toro_id' AND p_intent->'changes'->>'padre_toro_id' IS NOT NULL AND original->'refs'->'toro'->'activo' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'New father is outside existing active picker contract';END IF;
  r.request_key=p_request_key;r.owner_id=p_expected_owner;r.intent=p_intent;r.original=original;r.effective_date=(now() AT TIME ZONE 'America/Bogota')::date;r.state='pending';expected=r;
  INSERT INTO hato_animal_edit.requests SELECT expected.* RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Animal edit reservation suppressed/mutated';END IF;
 ELSIF p_action='resolve' THEN
  IF r.request_key IS NULL THEN r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='canceled';expected=r;INSERT INTO hato_animal_edit.requests SELECT expected.* RETURNING * INTO r;
  ELSIF r.state='pending' THEN expected=r;expected.state='canceled';UPDATE hato_animal_edit.requests SET state='canceled' WHERE request_key=p_request_key RETURNING * INTO r;
  ELSE RETURN hato_animal_edit.result(r);END IF;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Animal edit cancellation suppressed/mutated';END IF;
 ELSIF p_action='post' THEN
  IF r.request_key IS NULL THEN RAISE EXCEPTION 'Original prepared animal edit required';END IF;
  IF r.state='committed' THEN
   IF NOT EXISTS(SELECT 1 FROM hato_animal_edit.audit WHERE request_key=p_request_key AND receipt=r.receipt) THEN RAISE EXCEPTION 'Original animal edit audit missing';END IF;RETURN hato_animal_edit.result(r);
  ELSIF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled animal edit cannot post';END IF;
  target=(r.intent->>'animalId')::uuid;day=r.effective_date;IF day IS DISTINCT FROM (now() AT TIME ZONE 'America/Bogota')::date THEN RAISE EXCEPTION 'Prepared animal edit day elapsed; resolve original request';END IF;original=r.original;
  IF hato_animal_edit.snapshot(target,r.intent->'changes') IS DISTINCT FROM original THEN RAISE EXCEPTION 'Original animal edit source graph changed';END IF;
  correction_rows=before_source->'domain'->'corrections';
  expected_animal=jsonb_populate_record(NULL::public.hato_animales,(original->'animal')||(r.intent->'changes'));
  -- Estado/date/notes/identity/attribution are never in the edit allowlist.
  UPDATE public.hato_animales SET numero=expected_animal.numero,nombre=expected_animal.nombre,etapa=expected_animal.etapa,raza=expected_animal.raza,fecha_nacimiento=expected_animal.fecha_nacimiento,etapa_forzada=expected_animal.etapa_forzada,madre_id=expected_animal.madre_id,padre_toro_id=expected_animal.padre_toro_id WHERE id=target RETURNING * INTO animal;
  IF NOT FOUND OR to_jsonb(animal) IS DISTINCT FROM to_jsonb(expected_animal) THEN RAISE EXCEPTION 'Animal edit animal state suppressed/mutated';END IF;
  SELECT * INTO correction FROM public.hato_correcciones WHERE id NOT IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(correction_rows)x);
  IF NOT FOUND OR (SELECT count(*) FROM public.hato_correcciones WHERE id NOT IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(correction_rows)x))<>1 OR correction.tabla<>'hato_animales' OR correction.fila_id<>target OR correction.operacion<>'update' OR correction.datos_anteriores IS DISTINCT FROM original->'animal' OR correction.datos_nuevos IS DISTINCT FROM to_jsonb(expected_animal) OR correction.animal_id<>target OR correction.corregido_por IS DISTINCT FROM p_expected_owner OR correction.corregido_en IS DISTINCT FROM now() OR correction.motivo IS NOT NULL THEN RAISE EXCEPTION 'Exact trusted animal edit correction audit required';END IF;
  expected_corrections=(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements(correction_rows||jsonb_build_array(to_jsonb(correction)))x);
  expected_source=jsonb_set(expected_source,'{domain,animals}',(SELECT jsonb_agg(CASE WHEN x->>'id'=target::text THEN to_jsonb(expected_animal) ELSE x END ORDER BY x->>'id') FROM jsonb_array_elements(expected_source->'domain'->'animals')x));
  expected_source=jsonb_set(expected_source,'{domain,corrections}',expected_corrections);
  -- The admitted view is derived from exact checked animals/events and unchanged chequeo inputs.
  expected_source=jsonb_set(expected_source,'{animalsView}',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY animal_id),'[]') FROM public.v_hato_estado_actual x));
  IF alert_cron.source() IS DISTINCT FROM expected_source THEN RAISE EXCEPTION 'Animal edit final source mismatch';END IF;
  actual=hato_animal_edit.snapshot(target,r.intent->'changes');
  IF actual IS DISTINCT FROM jsonb_set(original,'{animal}',to_jsonb(expected_animal)) THEN RAISE EXCEPTION 'Animal edit exact target graph mismatch';END IF;
  new_receipt=jsonb_build_object('version',1,'requestKey',p_request_key,'owner',p_expected_owner,'intent',r.intent,'original',original,'effectiveDate',r.effective_date,'actor',actor,'recordedAt',now(),'after',actual,'correction',to_jsonb(correction));
  audit.request_key=p_request_key;audit.receipt=new_receipt;INSERT INTO hato_animal_edit.audit SELECT audit.* RETURNING * INTO actual_audit;
  IF NOT FOUND OR to_jsonb(actual_audit) IS DISTINCT FROM to_jsonb(audit) THEN RAISE EXCEPTION 'Animal edit trusted audit suppressed/mutated';END IF;
  expected=r;expected.state='committed';expected.receipt=new_receipt;UPDATE hato_animal_edit.requests SET state='committed',receipt=new_receipt WHERE request_key=p_request_key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Animal edit committed control suppressed/mutated';END IF;
 END IF;
 IF view_inputs IS DISTINCT FROM jsonb_build_object('checks',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeo_vacas x),'headers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_chequeos x),'toros',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_toros x)) THEN RAISE EXCEPTION 'Animal edit derived-view inputs changed';END IF;
 IF hato_treatment_creation.web_actor() IS DISTINCT FROM actor OR alert_cron.source() IS DISTINCT FROM expected_source THEN RAISE EXCEPTION 'Animal edit final authority/source mismatch';END IF;
 SELECT * INTO r FROM hato_animal_edit.requests WHERE request_key=p_request_key;
 IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Animal edit final request readback mismatch';END IF;
 IF r.state='committed' AND (hato_animal_edit.snapshot((r.intent->>'animalId')::uuid,r.intent->'changes') IS DISTINCT FROM r.receipt->'after' OR NOT EXISTS(SELECT 1 FROM hato_animal_edit.audit WHERE request_key=p_request_key AND receipt=r.receipt)) THEN RAISE EXCEPTION 'Animal edit final audit/target readback mismatch';END IF;
 RETURN hato_animal_edit.result(r);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_animal_edit FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_animal_edit_web(text,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_animal_edit_web(text,uuid,jsonb,uuid) TO authenticated;
COMMIT;
