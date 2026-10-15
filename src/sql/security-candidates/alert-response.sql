-- NONNUMBERED prepared alert response foundation. After all16 reviewed candidates.
-- No caller cutover/direct alert-event grant retirement or production application.
BEGIN;
LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos,public.hato_alertas,
 public.hato_animales,public.usuarios,public.telegram_usuarios,public.hato_eventos IN SHARE ROW EXCLUSIVE MODE;
DO $admission$
DECLARE fingerprint text;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed alert response installation owner required';END IF;
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
 IF fingerprint IS DISTINCT FROM '40586a4e97eaccf8982e30ff7c14a124' THEN RAISE EXCEPTION 'Unreviewed alert response schema';END IF;
 PERFORM clinical_step_confirmation.assert_retired_writers();
 PERFORM correction_audit_integrity.assert_boundary();
 IF EXISTS(SELECT 1 FROM(VALUES('hato_treatment_creation.web_actor()','1d8ec54936d4f658da49a965b828224c'),('hato_treatment_creation.telegram_actor(bigint,bigint,bigint)','e58604b57f82fd09c9ba612591b9c3e6'))e(signature,body)
  WHERE NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(e.signature) AND md5(p.prosrc)=e.body
   AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname='postgres')))
 THEN RAISE EXCEPTION 'Unreviewed alert response actor helper';END IF;
END $admission$;
CREATE SCHEMA alert_response;
REVOKE ALL ON SCHEMA alert_response FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE alert_response.requests(
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
CREATE TABLE alert_response.audit(
 request_key uuid PRIMARY KEY REFERENCES alert_response.requests(request_key),
 actor jsonb NOT NULL,intent jsonb NOT NULL,receipt jsonb NOT NULL
);
ALTER TABLE alert_response.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_response.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA alert_response FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION alert_response.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='audit' OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Immutable alert response proof';END IF;
 IF OLD.state<>'pending' OR NEW.state NOT IN('committed','canceled')
 OR(to_jsonb(NEW)-'state'-'receipt') IS DISTINCT FROM(to_jsonb(OLD)-'state'-'receipt')
 OR(NEW.state='committed') IS DISTINCT FROM(NEW.receipt IS NOT NULL)
 THEN RAISE EXCEPTION 'Immutable alert response proof';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_alert_response_request BEFORE UPDATE OR DELETE ON alert_response.requests
 FOR EACH ROW EXECUTE FUNCTION alert_response.immutable();
CREATE TRIGGER immutable_alert_response_audit BEFORE UPDATE OR DELETE ON alert_response.audit
 FOR EACH ROW EXECUTE FUNCTION alert_response.immutable();
CREATE FUNCTION alert_response.intent(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE id uuid;d date;
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR p->'version' IS DISTINCT FROM '1'::jsonb
 OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p)k) IS DISTINCT FROM ARRAY['alertId','fecha','respuesta','version']
 OR jsonb_typeof(p->'alertId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'fecha') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p->'respuesta') IS DISTINCT FROM 'string' OR p->>'respuesta' NOT IN('si','no','otro')
 THEN RAISE EXCEPTION 'Exact alert response intent required';END IF;
 id=(p->>'alertId')::uuid;d=(p->>'fecha')::date;
 IF id::text IS DISTINCT FROM p->>'alertId' OR NOT isfinite(d) OR to_char(d,'YYYY-MM-DD') IS DISTINCT FROM p->>'fecha'
 OR d>(now() AT TIME ZONE 'America/Bogota')::date THEN RAISE EXCEPTION 'Canonical actual alert date/ID required';END IF;
 RETURN jsonb_build_object('version',1,'alertId',id,'fecha',d,'respuesta',p->>'respuesta');
END $$;
CREATE FUNCTION alert_response.snapshot(p_alert uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE a public.hato_alertas;animal public.hato_animales;clinical jsonb;
BEGIN
 SELECT * INTO a FROM public.hato_alertas WHERE id=p_alert;
 IF NOT FOUND THEN RAISE EXCEPTION 'Alert missing';END IF;
 IF a.animal_id IS NOT NULL THEN
  SELECT * INTO animal FROM public.hato_animales WHERE id=a.animal_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alert animal missing';END IF;
 END IF;
 IF a.tipo='tratamiento_paso' AND a.paso_id IS NOT NULL THEN clinical=clinical_step_confirmation.snapshot(a.paso_id);END IF;
 RETURN jsonb_build_object('alert',to_jsonb(a),'animal',CASE WHEN a.animal_id IS NULL THEN NULL ELSE to_jsonb(animal) END,
 'events',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_eventos x WHERE animal_id=a.animal_id),'clinical',clinical);
END $$;
CREATE FUNCTION alert_response.domain_state() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('alerts',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_alertas x),
 'events',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_eventos x),
 'animals',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_animales x),
 'headers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_tratamientos x),
 'steps',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_tratamiento_pasos x),
 'corrections',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_correcciones x))
$$;
CREATE FUNCTION alert_response.response(r alert_response.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'actor',r.actor,'intent',r.intent,'original',r.original,
 'action',CASE WHEN r.sender IS NULL THEN NULL ELSE jsonb_build_object('sender',r.sender,'chatId',r.chat_id,'messageId',r.message_id) END,'state',r.state,'receipt',r.receipt)
$$;
CREATE FUNCTION alert_response.dispatch(p_actor jsonb,p_action text,p_key uuid,p_intent jsonb,
 p_sender bigint DEFAULT NULL,p_chat bigint DEFAULT NULL,p_message bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r alert_response.requests;expected_request alert_response.requests;
 audit_row alert_response.audit;expected_audit alert_response.audit;
 key uuid=p_key;intent jsonb;original jsonb;actual jsonb;target uuid;day date;
 alert public.hato_alertas;expected_alert public.hato_alertas;event public.hato_eventos;expected_event public.hato_eventos;
 before_domain jsonb;control_domain jsonb;expected_domain jsonb;new_receipt jsonb;label text;fresh_actor jsonb;found_request boolean;event_id uuid;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve') THEN RAISE EXCEPTION 'Invalid alert response action';END IF;
 IF p_action='prepare' THEN intent=alert_response.intent(p_intent);
 ELSIF p_intent IS NOT NULL THEN RAISE EXCEPTION 'Recovery/post cannot replace original intent';END IF;
 IF p_actor->>'origin'='web' THEN
  IF key IS NULL THEN RAISE EXCEPTION 'Original web key required';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('alert-response:web:'||key::text,0));
  SELECT * INTO r FROM alert_response.requests WHERE request_key=key FOR UPDATE;
 ELSIF p_actor->>'origin'='telegram' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('alert-response:telegram:'||p_sender::text||':'||p_chat::text||':'||p_message::text,0));
  SELECT * INTO r FROM alert_response.requests WHERE sender=p_sender AND chat_id=p_chat AND message_id=p_message FOR UPDATE;
 ELSE RAISE EXCEPTION 'Invalid trusted alert response actor';END IF;
 found_request=FOUND;
 IF found_request THEN
  IF r.actor IS DISTINCT FROM p_actor OR(p_action='prepare' AND r.intent IS NOT NULL AND r.intent IS DISTINCT FROM intent)
   THEN RAISE EXCEPTION 'Changed original alert response actor/intent';END IF;
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
   control_domain=alert_response.domain_state();
   r.state='canceled';r.intent=NULL;r.original=NULL;
  ELSE
   LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos,public.hato_alertas,public.hato_eventos IN SHARE ROW EXCLUSIVE MODE;
   control_domain=alert_response.domain_state();
   original=alert_response.snapshot((intent->>'alertId')::uuid);
   IF original->'alert'->>'estado' NOT IN('pendiente','enviada','escalada','respondida') THEN RAISE EXCEPTION 'Original open alert required';END IF;
   IF original->'alert'->>'tipo'='tratamiento_paso' AND intent->>'respuesta'='si' THEN RAISE EXCEPTION 'Use prepared clinical confirmation';END IF;
   IF original->'alert'->>'tipo'='secado_due' AND intent->>'respuesta'='si'
    AND(original->'animal' IS NULL OR original->'animal'='null'::jsonb OR original->'animal'->>'estado' IS DISTINCT FROM 'activa')
    THEN RAISE EXCEPTION 'Current active secado animal required';END IF;
   r.state='pending';r.intent=intent;r.original=original;
  END IF;
  expected_request=r;
  INSERT INTO alert_response.requests SELECT r.* RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected_request) THEN RAISE EXCEPTION 'Alert response reservation suppressed/mutated';END IF;
 END IF;
 expected_request=r;
 IF r.state='committed' THEN
  SELECT * INTO audit_row FROM alert_response.audit WHERE request_key=key;
  IF NOT FOUND OR audit_row.actor IS DISTINCT FROM r.actor OR audit_row.intent IS DISTINCT FROM r.intent OR audit_row.receipt IS DISTINCT FROM r.receipt
   THEN RAISE EXCEPTION 'Committed clinical audit proof missing';END IF;
 ELSIF p_action='resolve' AND r.state='pending' THEN
  LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos,public.hato_alertas,public.hato_eventos IN SHARE ROW EXCLUSIVE MODE;
  control_domain=alert_response.domain_state();
  expected_request.state='canceled';
  UPDATE alert_response.requests SET state='canceled' WHERE request_key=key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected_request) THEN RAISE EXCEPTION 'Alert response cancellation suppressed/mutated';END IF;
 ELSIF p_action='post' THEN
  IF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled clinical confirmation cannot post';END IF;
  LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos,public.hato_alertas,public.hato_eventos IN SHARE ROW EXCLUSIVE MODE;
  day=(r.intent->>'fecha')::date;
  IF day>(now() AT TIME ZONE 'America/Bogota')::date THEN RAISE EXCEPTION 'Actual nonfuture alert date required';END IF;
  before_domain=alert_response.domain_state();
  target=(r.intent->>'alertId')::uuid;day=(r.intent->>'fecha')::date;
  actual=alert_response.snapshot(target);
  IF actual IS DISTINCT FROM r.original THEN RAISE EXCEPTION 'Original alert response graph changed';END IF;
  SELECT * INTO expected_alert FROM public.hato_alertas WHERE id=target;
  expected_domain=before_domain;
  IF r.intent->>'respuesta'='si' AND expected_alert.tipo='secado_due' THEN
   event_id=gen_random_uuid();
   expected_event=jsonb_populate_record(NULL::public.hato_eventos,jsonb_build_object('id',event_id,'animal_id',expected_alert.animal_id,
    'tipo','secado_real','fecha',day,'fecha_confianza','aproximada','alerta_id',target,'fuente','alerta','created_at',now(),
    'created_by',(p_actor->>'profileId')::uuid));
   INSERT INTO public.hato_eventos SELECT expected_event.* RETURNING * INTO event;
   IF NOT FOUND OR to_jsonb(event) IS DISTINCT FROM to_jsonb(expected_event) THEN RAISE EXCEPTION 'Secado event suppressed/mutated';END IF;
   expected_domain=jsonb_set(expected_domain,'{events}',(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements((before_domain->'events')||jsonb_build_array(to_jsonb(expected_event)))x));
  END IF;
  IF p_actor->>'origin'='web' THEN SELECT email INTO label FROM public.usuarios WHERE id=(p_actor->>'profileId')::uuid;
  ELSE label=coalesce(p_actor->>'displayName','Telegram '||(p_actor->>'sender'));END IF;
  expected_alert.estado=CASE WHEN r.intent->>'respuesta'='si' THEN 'confirmada' ELSE 'respondida' END;
  expected_alert.respuesta=r.intent->>'respuesta';expected_alert.respondida_por=label;expected_alert.updated_at=now();
  UPDATE public.hato_alertas SET estado=expected_alert.estado,respuesta=expected_alert.respuesta,respondida_por=label,updated_at=expected_alert.updated_at WHERE id=target RETURNING * INTO alert;
  IF NOT FOUND OR to_jsonb(alert) IS DISTINCT FROM to_jsonb(expected_alert) THEN RAISE EXCEPTION 'Alert response suppressed/mutated';END IF;
  expected_domain=jsonb_set(expected_domain,'{alerts}',(SELECT jsonb_agg(CASE WHEN x->>'id'=target::text THEN to_jsonb(expected_alert) ELSE x END ORDER BY x->>'id') FROM jsonb_array_elements(before_domain->'alerts')x));
  IF alert_response.domain_state() IS DISTINCT FROM expected_domain THEN RAISE EXCEPTION 'Alert response final domain mismatch';END IF;
  actual=alert_response.snapshot(target);
  new_receipt=jsonb_build_object('version',1,'recordedAt',now(),'requestKey',key,'actor',p_actor,'intent',r.intent,'original',r.original,
   'action',CASE WHEN p_sender IS NULL THEN NULL ELSE jsonb_build_object('sender',p_sender,'chatId',p_chat,'messageId',p_message) END,
   'before',r.original,'after',actual);
  expected_audit.request_key=key;expected_audit.actor=p_actor;expected_audit.intent=r.intent;expected_audit.receipt=new_receipt;
  INSERT INTO alert_response.audit SELECT expected_audit.* RETURNING * INTO audit_row;
  IF NOT FOUND OR to_jsonb(audit_row) IS DISTINCT FROM to_jsonb(expected_audit) THEN RAISE EXCEPTION 'Alert response audit suppressed/mutated';END IF;
  expected_request.state='committed';expected_request.receipt=new_receipt;
  UPDATE alert_response.requests SET state='committed',receipt=new_receipt WHERE request_key=key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected_request) THEN RAISE EXCEPTION 'Alert response committed request suppressed/mutated';END IF;
  SELECT * INTO audit_row FROM alert_response.audit WHERE request_key=key;
  IF NOT FOUND OR to_jsonb(audit_row) IS DISTINCT FROM to_jsonb(expected_audit) OR alert_response.domain_state() IS DISTINCT FROM expected_domain
   THEN RAISE EXCEPTION 'Alert response final audit/domain mismatch';END IF;
 END IF;
 IF p_actor->>'origin'='web' THEN fresh_actor=hato_treatment_creation.web_actor();
 ELSE fresh_actor=hato_treatment_creation.telegram_actor(p_sender,p_chat,p_message);END IF;
 IF fresh_actor IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Alert response authority changed';END IF;
 IF control_domain IS NOT NULL AND alert_response.domain_state() IS DISTINCT FROM control_domain
  THEN RAISE EXCEPTION 'Alert response control changed domain';END IF;
 IF control_domain IS NOT NULL AND p_action='prepare' AND r.state='pending'
  AND alert_response.snapshot((r.intent->>'alertId')::uuid) IS DISTINCT FROM r.original
  THEN RAISE EXCEPTION 'Alert response preparation target mismatch';END IF;
 SELECT * INTO r FROM alert_response.requests WHERE request_key=key;
 IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected_request) THEN RAISE EXCEPTION 'Alert response final request mismatch';END IF;
 IF p_action='post' AND r.state='committed' AND new_receipt IS NOT NULL
  AND alert_response.snapshot(target) IS DISTINCT FROM new_receipt->'after'
  THEN RAISE EXCEPTION 'Alert response final target graph mismatch';END IF;
 RETURN alert_response.response(r);
END $$;
CREATE FUNCTION public.fn_alert_response_web(p_action text,p_request_key uuid,p_intent jsonb,p_expected_owner uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original alert response owner changed' USING ERRCODE='42501';END IF;
 RETURN alert_response.dispatch(hato_treatment_creation.web_actor(),p_action,p_request_key,p_intent);
END $$;
CREATE FUNCTION public.fn_alert_response_telegram(p_action text,p_sender bigint,p_chat_id bigint,p_message_id bigint,p_intent jsonb DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 RETURN alert_response.dispatch(hato_treatment_creation.telegram_actor(p_sender,p_chat_id,p_message_id),p_action,NULL,p_intent,p_sender,p_chat_id,p_message_id);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA alert_response FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_alert_response_web(text,uuid,jsonb,uuid),public.fn_alert_response_telegram(text,bigint,bigint,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_alert_response_web(text,uuid,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_alert_response_telegram(text,bigint,bigint,bigint,jsonb) TO service_role;
COMMIT;
