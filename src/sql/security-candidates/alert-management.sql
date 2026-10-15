-- NONNUMBERED prepared alert management foundation. After all18 reviewed candidates.
-- No caller cutover/direct alert-event grant retirement or production application.
BEGIN;
LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos,public.hato_alertas,
 public.hato_animales,public.usuarios,public.telegram_usuarios,public.hato_eventos IN SHARE ROW EXCLUSIVE MODE;
DO $admission$
DECLARE fingerprint text;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed alert management installation owner required';END IF;
 SELECT baseline INTO fingerprint FROM (SELECT md5(jsonb_agg(jsonb_build_object(
 'table',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))x),
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'collation',CASE WHEN a.attcollation=0 THEN NULL ELSE (SELECT n.nspname||'.'||co.collname FROM pg_collation co JOIN pg_namespace n ON n.oid=co.collnamespace WHERE co.oid=a.attcollation) END,'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) FROM aclexplode(a.attacl)x)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(x.conname,pg_get_constraintdef(x.oid),x.convalidated,x.condeferrable,x.condeferred) ORDER BY x.conname) FROM pg_constraint x WHERE x.conrelid=c.oid),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready,i.indislive,i.indimmediate,i.indnullsnotdistinct) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(pg_get_triggerdef(t.oid),t.tgenabled,t.tgtype,t.tgdeferrable,t.tginitdeferred,md5(f.prosrc),pg_get_userbyid(f.proowner),f.prosecdef,f.proconfig) ORDER BY t.tgname) FROM pg_trigger t JOIN pg_proc f ON f.oid=t.tgfoid WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
 'inherits',(SELECT count(*) FROM pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid),
 'rules',(SELECT count(*) FROM pg_rewrite WHERE ev_class=c.oid)
) ORDER BY c.relname)::text) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN('hato_animales','hato_eventos','hato_alertas','usuarios','telegram_usuarios')) AS evidence(baseline);
 IF fingerprint IS DISTINCT FROM '6c625fc3fb7a3f0ce01cf0e4fcff7d7e' THEN RAISE EXCEPTION 'Unreviewed alert management schema';END IF;
 PERFORM clinical_step_confirmation.assert_retired_writers();
 PERFORM correction_audit_integrity.assert_boundary();
 IF EXISTS(SELECT 1 FROM(VALUES('hato_treatment_creation.web_actor()','1d8ec54936d4f658da49a965b828224c'),('hato_treatment_creation.telegram_actor(bigint,bigint,bigint)','e58604b57f82fd09c9ba612591b9c3e6'))e(signature,body)
  WHERE NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(e.signature) AND md5(p.prosrc)=e.body
   AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname='postgres')))
 THEN RAISE EXCEPTION 'Unreviewed alert management actor helper';END IF;
END $admission$;
CREATE SCHEMA alert_management;
REVOKE ALL ON SCHEMA alert_management FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE alert_management.requests(
 request_key uuid PRIMARY KEY,actor jsonb NOT NULL,intent jsonb,original jsonb,
 sender bigint,chat_id bigint,message_id bigint,
 state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(sender,chat_id,message_id),
 CHECK((sender IS NULL AND chat_id IS NULL AND message_id IS NULL AND actor->>'origin'='web') OR
  (sender>0 AND chat_id=sender AND message_id>0 AND actor->>'origin'='telegram')),
 CHECK((state='committed')=(receipt IS NOT NULL)),
 CHECK(state='canceled' OR(intent IS NOT NULL AND original IS NOT NULL))
);
CREATE TABLE alert_management.audit(
 request_key uuid PRIMARY KEY REFERENCES alert_management.requests(request_key),
 actor jsonb NOT NULL,intent jsonb NOT NULL,receipt jsonb NOT NULL
);
ALTER TABLE alert_management.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_management.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA alert_management FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION alert_management.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='audit' OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Immutable alert management proof';END IF;
 IF OLD.state<>'pending' OR NEW.state NOT IN('committed','canceled')
 OR(to_jsonb(NEW)-'state'-'receipt') IS DISTINCT FROM(to_jsonb(OLD)-'state'-'receipt')
 OR(NEW.state='committed') IS DISTINCT FROM(NEW.receipt IS NOT NULL)
 THEN RAISE EXCEPTION 'Immutable alert management proof';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_alert_management_request BEFORE UPDATE OR DELETE ON alert_management.requests
 FOR EACH ROW EXECUTE FUNCTION alert_management.immutable();
CREATE TRIGGER immutable_alert_management_audit BEFORE UPDATE OR DELETE ON alert_management.audit
 FOR EACH ROW EXECUTE FUNCTION alert_management.immutable();
CREATE FUNCTION alert_management.intent(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE kind text;day date;id uuid;item jsonb;seen uuid[]='{}';
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR p->'version' IS DISTINCT FROM '1'::jsonb OR jsonb_typeof(p->'kind') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Exact alert management intent required';END IF;
 kind=p->>'kind';
 IF kind='create' THEN
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p)k) IS DISTINCT FROM ARRAY['animalId','fechaProgramada','kind','nota','pasoId','tipo','version']
  OR jsonb_typeof(p->'tipo') IS DISTINCT FROM 'string' OR p->>'tipo' NOT IN('secado_due','tratamiento_paso','rechequeo_due','servicio_sin_confirmacion','parto_proximo') THEN RAISE EXCEPTION 'Exact manual creation intent required';END IF;
  IF p->'animalId'<>'null'::jsonb THEN id=(p->>'animalId')::uuid;IF jsonb_typeof(p->'animalId')<>'string' OR id::text IS DISTINCT FROM p->>'animalId' THEN RAISE EXCEPTION 'Canonical animal required';END IF;
  ELSIF p->>'tipo'<>'rechequeo_due' THEN RAISE EXCEPTION 'Selected animal required';END IF;
  IF p->>'tipo'='rechequeo_due' AND p->'animalId'<>'null'::jsonb THEN RAISE EXCEPTION 'Herd reminder cannot replace selected animal';END IF;
  IF p->'pasoId'<>'null'::jsonb THEN id=(p->>'pasoId')::uuid;IF jsonb_typeof(p->'pasoId')<>'string' OR id::text IS DISTINCT FROM p->>'pasoId' THEN RAISE EXCEPTION 'Canonical step required';END IF;END IF;
  IF (p->>'tipo'='tratamiento_paso') IS DISTINCT FROM (p->'pasoId'<>'null'::jsonb) THEN RAISE EXCEPTION 'Existing clinical linkage required only for treatment';END IF;
 ELSIF kind IN('edit','discard') THEN
  IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p)k) IS DISTINCT FROM (CASE WHEN kind='edit' THEN ARRAY['alerts','fechaProgramada','kind','nota','version'] ELSE ARRAY['alerts','kind','version'] END)
   OR jsonb_typeof(p->'alerts') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'alerts') NOT BETWEEN 1 AND 50
   OR(kind='edit' AND jsonb_array_length(p->'alerts')<>1) THEN RAISE EXCEPTION 'Exact bounded observed alerts required';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p->'alerts') LOOP
   id=(item->>'id')::uuid;
   IF id IS NULL OR id::text IS DISTINCT FROM item->>'id' OR id=ANY(seen) THEN RAISE EXCEPTION 'Canonical unique original targets required';END IF;
   seen=array_append(seen,id);
  END LOOP;
  IF p->'alerts' IS DISTINCT FROM (SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements(p->'alerts')x) THEN RAISE EXCEPTION 'Sorted original targets required';END IF;
 ELSE RAISE EXCEPTION 'Invalid management kind';END IF;
 IF kind IN('create','edit') THEN
  IF jsonb_typeof(p->'fechaProgramada') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'nota') IS DISTINCT FROM 'string' OR length(p->>'nota')>4000 OR btrim(p->>'nota') IS DISTINCT FROM p->>'nota' THEN RAISE EXCEPTION 'Canonical date and bounded note required';END IF;
  day=(p->>'fechaProgramada')::date;
  IF NOT isfinite(day) OR to_char(day,'YYYY-MM-DD') IS DISTINCT FROM p->>'fechaProgramada' THEN RAISE EXCEPTION 'Canonical scheduled date required';END IF;
 END IF;
 RETURN p;
END $$;
CREATE FUNCTION alert_management.snapshot(p jsonb,p_target uuid,p_after boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE animal public.hato_animales;clinical jsonb;targets jsonb='[]';item jsonb;actual jsonb;
BEGIN
 IF p->>'kind'='create' THEN
  IF p->'animalId'<>'null'::jsonb THEN
   SELECT * INTO animal FROM public.hato_animales WHERE id=(p->>'animalId')::uuid FOR SHARE;
   IF NOT FOUND OR animal.estado<>'activa' THEN RAISE EXCEPTION 'Current active selected animal required';END IF;
  END IF;
  IF p->'pasoId'<>'null'::jsonb THEN
   clinical=clinical_step_confirmation.snapshot((p->>'pasoId')::uuid);
   IF clinical->'animal'->>'id' IS DISTINCT FROM p->>'animalId' OR clinical->'header'->>'estado'<>'activo'
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(clinical->'steps')x WHERE x->>'id'=p->>'pasoId' AND x->'fecha_ejecutada'='null'::jsonb) THEN RAISE EXCEPTION 'Existing pending selected clinical step required';END IF;
  END IF;
  IF p_after THEN targets=jsonb_build_array(alert_response.snapshot(p_target));
  ELSIF EXISTS(SELECT 1 FROM public.hato_alertas WHERE id=p_target) THEN RAISE EXCEPTION 'Reserved alert ID already exists';END IF;
 ELSE
  FOR item IN SELECT value FROM jsonb_array_elements(p->'alerts') LOOP
   actual=alert_response.snapshot((item->>'id')::uuid);
   targets=targets||jsonb_build_array(actual);
  END LOOP;
 END IF;
 RETURN jsonb_build_object('targetId',p_target,'targets',targets,'animal',CASE WHEN animal.id IS NULL THEN NULL ELSE to_jsonb(animal) END,'clinical',clinical,'events',CASE WHEN p->>'kind'='create' THEN (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY id),'[]') FROM public.hato_eventos e WHERE animal_id=(p->>'animalId')::uuid) ELSE '[]'::jsonb END);
END $$;
CREATE FUNCTION alert_management.domain_state() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$ SELECT alert_response.domain_state() $$;
CREATE FUNCTION alert_management.response(r alert_management.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'actor',r.actor,'intent',r.intent,'original',r.original,
 'action',CASE WHEN r.sender IS NULL THEN NULL ELSE jsonb_build_object('sender',r.sender,'chatId',r.chat_id,'messageId',r.message_id) END,'state',r.state,'receipt',r.receipt)
$$;
CREATE FUNCTION alert_management.dispatch(p_actor jsonb,p_action text,p_key uuid,p_intent jsonb,
 p_sender bigint DEFAULT NULL,p_chat bigint DEFAULT NULL,p_message bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r alert_management.requests;expected_request alert_management.requests;
 audit_row alert_management.audit;expected_audit alert_management.audit;
 key uuid=p_key;intent jsonb;original jsonb;actual jsonb;target uuid;day date;
 alert public.hato_alertas;expected_alert public.hato_alertas;event public.hato_eventos;expected_event public.hato_eventos;
 before_domain jsonb;control_domain jsonb;expected_domain jsonb;new_receipt jsonb;label text;fresh_actor jsonb;found_request boolean;event_id uuid;
BEGIN
 IF p_actor->>'origin' IS DISTINCT FROM 'web' THEN RAISE EXCEPTION 'Human management actor required';END IF;
 IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve') THEN RAISE EXCEPTION 'Invalid alert management action';END IF;
 IF p_action='prepare' THEN intent=alert_management.intent(p_intent);
 ELSIF p_intent IS NOT NULL THEN RAISE EXCEPTION 'Recovery/post cannot replace original intent';END IF;
 IF p_actor->>'origin'='web' THEN
  IF key IS NULL THEN RAISE EXCEPTION 'Original web key required';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('alert-management:web:'||key::text,0));
  SELECT * INTO r FROM alert_management.requests WHERE request_key=key FOR UPDATE;
 ELSIF p_actor->>'origin'='telegram' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('alert-management:telegram:'||p_sender::text||':'||p_chat::text||':'||p_message::text,0));
  SELECT * INTO r FROM alert_management.requests WHERE sender=p_sender AND chat_id=p_chat AND message_id=p_message FOR UPDATE;
 ELSE RAISE EXCEPTION 'Invalid trusted alert management actor';END IF;
 found_request=FOUND;
 IF found_request THEN
  IF r.actor IS DISTINCT FROM p_actor OR(p_action='prepare' AND r.intent IS NOT NULL AND r.intent IS DISTINCT FROM intent)
   THEN RAISE EXCEPTION 'Changed original alert management actor/intent';END IF;
  key=r.request_key;
 ELSIF p_action='status' THEN
  RETURN jsonb_build_object('version',1,'requestKey',p_key,'actor',p_actor,'intent',NULL,'original',NULL,
   'action',CASE WHEN p_sender IS NULL THEN NULL ELSE jsonb_build_object('sender',p_sender,'chatId',p_chat,'messageId',p_message) END,'state','unknown','receipt',NULL);
 ELSIF p_action='post' THEN RAISE EXCEPTION 'Original prepared clinical confirmation required';
 ELSE
  IF key IS NULL THEN key=gen_random_uuid();END IF;
  r.request_key=key;r.actor=p_actor;r.sender=p_sender;r.chat_id=p_chat;r.message_id=p_message;r.created_at=now();r.receipt=NULL;
  IF p_action='resolve' THEN
   LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos,public.hato_alertas,public.hato_eventos IN SHARE ROW EXCLUSIVE MODE;
   control_domain=alert_management.domain_state();
   r.state='canceled';r.intent=NULL;r.original=NULL;
  ELSE
   LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos,public.hato_alertas,public.hato_eventos IN SHARE ROW EXCLUSIVE MODE;
   control_domain=alert_management.domain_state();
   original=alert_management.snapshot(intent,CASE WHEN intent->>'kind'='create' THEN gen_random_uuid() ELSE NULL END);
   IF intent->>'kind'<>'create' THEN
    FOR actual IN SELECT value FROM jsonb_array_elements(original->'targets') LOOP
     IF actual->'alert'->>'estado' NOT IN('pendiente','enviada','escalada') OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(intent->'alerts')x WHERE x=actual->'alert') THEN RAISE EXCEPTION 'Observed active alert changed';END IF;
    END LOOP;
   END IF;
   r.state='pending';r.intent=intent;r.original=original;
  END IF;
  expected_request=r;
  INSERT INTO alert_management.requests SELECT r.* RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected_request) THEN RAISE EXCEPTION 'Alert response reservation suppressed/mutated';END IF;
 END IF;
 expected_request=r;
 IF r.state='committed' THEN
  SELECT * INTO audit_row FROM alert_management.audit WHERE request_key=key;
  IF NOT FOUND OR audit_row.actor IS DISTINCT FROM r.actor OR audit_row.intent IS DISTINCT FROM r.intent OR audit_row.receipt IS DISTINCT FROM r.receipt
   THEN RAISE EXCEPTION 'Committed clinical audit proof missing';END IF;
 ELSIF p_action='resolve' AND r.state='pending' THEN
  LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos,public.hato_alertas,public.hato_eventos IN SHARE ROW EXCLUSIVE MODE;
  control_domain=alert_management.domain_state();
  expected_request.state='canceled';
  UPDATE alert_management.requests SET state='canceled' WHERE request_key=key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected_request) THEN RAISE EXCEPTION 'Alert response cancellation suppressed/mutated';END IF;
 ELSIF p_action='post' THEN
  IF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled clinical confirmation cannot post';END IF;
  LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos,public.hato_alertas,public.hato_eventos IN SHARE ROW EXCLUSIVE MODE;
  before_domain=alert_management.domain_state();
  target=(r.original->>'targetId')::uuid;
  actual=alert_management.snapshot(r.intent,target);
  IF actual IS DISTINCT FROM r.original THEN RAISE EXCEPTION 'Original management source graph changed';END IF;
  expected_domain=before_domain;
  SELECT email INTO label FROM public.usuarios WHERE id=(p_actor->>'profileId')::uuid;
  IF r.intent->>'kind'='create' THEN
   expected_alert=jsonb_populate_record(NULL::public.hato_alertas,jsonb_build_object('id',target,'tipo',r.intent->>'tipo','animal_id',r.intent->'animalId',
    'regla_clave','manual:'||(r.intent->>'tipo')||':'||coalesce(r.intent->>'animalId','hato')||':'||(r.intent->>'fechaProgramada')||':'||key::text,
    'fecha_programada',r.intent->>'fechaProgramada','estado','pendiente','intentos',0,'paso_id',r.intent->'pasoId',
    'datos',jsonb_build_object('origen','manual')||CASE WHEN r.intent->>'nota'='' THEN '{}'::jsonb ELSE jsonb_build_object('nota',r.intent->>'nota') END,
    'created_at',now(),'updated_at',now(),'created_by',p_actor->>'profileId'));
   INSERT INTO public.hato_alertas SELECT expected_alert.* RETURNING * INTO alert;
   IF NOT FOUND OR to_jsonb(alert) IS DISTINCT FROM to_jsonb(expected_alert) THEN RAISE EXCEPTION 'Manual alert insert suppressed/mutated';END IF;
   expected_domain=jsonb_set(expected_domain,'{alerts}',(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements((before_domain->'alerts')||jsonb_build_array(to_jsonb(expected_alert)))x));
  ELSE
   FOR actual IN SELECT value FROM jsonb_array_elements(r.original->'targets') LOOP
    expected_alert=jsonb_populate_record(NULL::public.hato_alertas,actual->'alert');
    IF r.intent->>'kind'='edit' THEN
     IF expected_alert.datos IS NOT NULL AND jsonb_typeof(expected_alert.datos)<>'object' THEN RAISE EXCEPTION 'Cannot replace legacy non-object alert data';END IF;
     expected_alert.fecha_programada=(r.intent->>'fechaProgramada')::date;
     expected_alert.datos=coalesce(expected_alert.datos,'{}'::jsonb)-'nota_gestor';
     IF r.intent->>'nota'<>'' THEN expected_alert.datos=expected_alert.datos||jsonb_build_object('nota_gestor',r.intent->>'nota');END IF;
    ELSE expected_alert.estado='descartada';expected_alert.respondida_por=label;END IF;
    expected_alert.updated_at=now();
    UPDATE public.hato_alertas SET fecha_programada=expected_alert.fecha_programada,datos=expected_alert.datos,estado=expected_alert.estado,respondida_por=expected_alert.respondida_por,updated_at=expected_alert.updated_at WHERE id=expected_alert.id RETURNING * INTO alert;
    IF NOT FOUND OR to_jsonb(alert) IS DISTINCT FROM to_jsonb(expected_alert) THEN RAISE EXCEPTION 'Managed alert update suppressed/mutated';END IF;
    expected_domain=jsonb_set(expected_domain,'{alerts}',(SELECT jsonb_agg(CASE WHEN x->>'id'=expected_alert.id::text THEN to_jsonb(expected_alert) ELSE x END ORDER BY x->>'id') FROM jsonb_array_elements(expected_domain->'alerts')x));
   END LOOP;
  END IF;
  IF alert_management.domain_state() IS DISTINCT FROM expected_domain THEN RAISE EXCEPTION 'Management final domain mismatch';END IF;
  actual=alert_management.snapshot(r.intent,target,true);
  new_receipt=jsonb_build_object('version',1,'recordedAt',now(),'requestKey',key,'actor',p_actor,'intent',r.intent,'original',r.original,
   'action',CASE WHEN p_sender IS NULL THEN NULL ELSE jsonb_build_object('sender',p_sender,'chatId',p_chat,'messageId',p_message) END,
   'before',r.original,'after',actual);
  expected_audit.request_key=key;expected_audit.actor=p_actor;expected_audit.intent=r.intent;expected_audit.receipt=new_receipt;
  INSERT INTO alert_management.audit SELECT expected_audit.* RETURNING * INTO audit_row;
  IF NOT FOUND OR to_jsonb(audit_row) IS DISTINCT FROM to_jsonb(expected_audit) THEN RAISE EXCEPTION 'Alert response audit suppressed/mutated';END IF;
  expected_request.state='committed';expected_request.receipt=new_receipt;
  UPDATE alert_management.requests SET state='committed',receipt=new_receipt WHERE request_key=key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected_request) THEN RAISE EXCEPTION 'Alert response committed request suppressed/mutated';END IF;
  SELECT * INTO audit_row FROM alert_management.audit WHERE request_key=key;
  IF NOT FOUND OR to_jsonb(audit_row) IS DISTINCT FROM to_jsonb(expected_audit) OR alert_management.domain_state() IS DISTINCT FROM expected_domain
   THEN RAISE EXCEPTION 'Alert response final audit/domain mismatch';END IF;
 END IF;
 IF p_actor->>'origin'='web' THEN fresh_actor=hato_treatment_creation.web_actor();
 ELSE fresh_actor=hato_treatment_creation.telegram_actor(p_sender,p_chat,p_message);END IF;
 IF fresh_actor IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Alert response authority changed';END IF;
 IF control_domain IS NOT NULL AND alert_management.domain_state() IS DISTINCT FROM control_domain
  THEN RAISE EXCEPTION 'Alert response control changed domain';END IF;
 IF control_domain IS NOT NULL AND p_action='prepare' AND r.state='pending'
  AND alert_management.snapshot(r.intent,(r.original->>'targetId')::uuid) IS DISTINCT FROM r.original
  THEN RAISE EXCEPTION 'Alert response preparation target mismatch';END IF;
 SELECT * INTO r FROM alert_management.requests WHERE request_key=key;
 IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected_request) THEN RAISE EXCEPTION 'Alert response final request mismatch';END IF;
 IF p_action='post' AND r.state='committed' AND new_receipt IS NOT NULL
  AND alert_management.snapshot(r.intent,target,true) IS DISTINCT FROM new_receipt->'after'
  THEN RAISE EXCEPTION 'Alert response final target graph mismatch';END IF;
 RETURN alert_management.response(r);
END $$;
CREATE FUNCTION public.fn_alert_management_web(p_action text,p_request_key uuid,p_intent jsonb,p_expected_owner uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original alert management owner changed' USING ERRCODE='42501';END IF;
 RETURN alert_management.dispatch(hato_treatment_creation.web_actor(),p_action,p_request_key,p_intent);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA alert_management FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_alert_management_web(text,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_alert_management_web(text,uuid,jsonb,uuid) TO authenticated;
COMMIT;
