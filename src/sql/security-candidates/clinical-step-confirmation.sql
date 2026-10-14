-- LOCAL REVIEW FOUNDATION: no caller cutover/production application authorized.
-- After nine protocols, coordinated-writer-retirement, clinical-creation-retirement.
-- Legacy177/direct UPDATE remain unchanged until actual callers are integrated.
BEGIN;
LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos,public.hato_alertas,
 public.hato_animales,public.usuarios,public.telegram_usuarios IN SHARE ROW EXCLUSIVE MODE;
DO $admission$
DECLARE fingerprint text;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed installation owner required';END IF;
SELECT md5(jsonb_agg(jsonb_build_object(
 'table',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))x),
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'collation',CASE WHEN a.attcollation=0 THEN NULL ELSE (SELECT n.nspname||'.'||co.collname FROM pg_collation co JOIN pg_namespace n ON n.oid=co.collnamespace WHERE co.oid=a.attcollation) END,'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) FROM aclexplode(a.attacl)x)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(x.conname,pg_get_constraintdef(x.oid),x.convalidated,x.condeferrable,x.condeferred) ORDER BY x.conname) FROM pg_constraint x WHERE x.conrelid=c.oid),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready,i.indislive,i.indimmediate,i.indnullsnotdistinct) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(pg_get_triggerdef(t.oid),t.tgenabled,t.tgtype,t.tgdeferrable,t.tginitdeferred,md5(f.prosrc),pg_get_userbyid(f.proowner),f.prosecdef,f.proconfig) ORDER BY t.tgname) FROM pg_trigger t JOIN pg_proc f ON f.oid=t.tgfoid WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
 'inherits',(SELECT count(*) FROM pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid),
 'rules',(SELECT count(*) FROM pg_rewrite WHERE ev_class=c.oid)
) ORDER BY c.relname)::text) INTO fingerprint FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN('hato_animales','hato_tratamientos','hato_tratamiento_pasos','hato_alertas','usuarios','telegram_usuarios');
 IF fingerprint IS DISTINCT FROM 'bd3b53e6dc7d4934eca9e196391315ee' THEN RAISE EXCEPTION 'Unreviewed clinical confirmation schema';END IF;
 IF EXISTS(SELECT 1 FROM(VALUES('hato_treatment_creation.web_actor()','1d8ec54936d4f658da49a965b828224c'),('hato_treatment_creation.telegram_actor(bigint,bigint,bigint)','e58604b57f82fd09c9ba612591b9c3e6'))e(signature,body)
  WHERE NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(e.signature) AND md5(p.prosrc)=e.body
   AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname='postgres')))
 THEN RAISE EXCEPTION 'Unreviewed clinical actor helper';END IF;
END $admission$;
CREATE SCHEMA clinical_step_confirmation;
REVOKE ALL ON SCHEMA clinical_step_confirmation FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE clinical_step_confirmation.requests(
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
CREATE TABLE clinical_step_confirmation.audit(
 request_key uuid PRIMARY KEY REFERENCES clinical_step_confirmation.requests(request_key),
 actor jsonb NOT NULL,intent jsonb NOT NULL,receipt jsonb NOT NULL
);
ALTER TABLE clinical_step_confirmation.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_step_confirmation.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA clinical_step_confirmation FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION clinical_step_confirmation.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='audit' OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Immutable clinical confirmation proof';END IF;
 IF OLD.state<>'pending' OR NEW.state NOT IN('committed','canceled')
 OR(to_jsonb(NEW)-'state'-'receipt') IS DISTINCT FROM(to_jsonb(OLD)-'state'-'receipt')
 OR(NEW.state='committed') IS DISTINCT FROM(NEW.receipt IS NOT NULL)
 THEN RAISE EXCEPTION 'Immutable clinical confirmation proof';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_clinical_request BEFORE UPDATE OR DELETE ON clinical_step_confirmation.requests
 FOR EACH ROW EXECUTE FUNCTION clinical_step_confirmation.immutable();
CREATE TRIGGER immutable_clinical_audit BEFORE UPDATE OR DELETE ON clinical_step_confirmation.audit
 FOR EACH ROW EXECUTE FUNCTION clinical_step_confirmation.immutable();
CREATE FUNCTION clinical_step_confirmation.intent(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE d date;s uuid;a uuid;
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR p->'version' IS DISTINCT FROM '1'::jsonb
 OR(SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p)k) IS DISTINCT FROM ARRAY['alertId','fechaEjecutada','stepId','version']
 OR jsonb_typeof(p->'stepId') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'fechaEjecutada') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p->'alertId') NOT IN('null','string') THEN RAISE EXCEPTION 'Exact clinical confirmation intent required';END IF;
 s=(p->>'stepId')::uuid;a=(p->>'alertId')::uuid;d=(p->>'fechaEjecutada')::date;
 IF s::text IS DISTINCT FROM p->>'stepId' OR (a IS NOT NULL AND a::text IS DISTINCT FROM p->>'alertId')
 OR NOT isfinite(d) OR to_char(d,'YYYY-MM-DD') IS DISTINCT FROM p->>'fechaEjecutada'
 OR d>(now() AT TIME ZONE 'America/Bogota')::date THEN RAISE EXCEPTION 'Canonical actual execution date/IDs required';END IF;
 RETURN jsonb_build_object('version',1,'stepId',s,'fechaEjecutada',d,'alertId',a);
END $$;
CREATE FUNCTION clinical_step_confirmation.snapshot(p_step uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE h public.hato_tratamientos;s public.hato_tratamiento_pasos;a public.hato_animales;
BEGIN
 SELECT * INTO s FROM public.hato_tratamiento_pasos WHERE id=p_step;
 IF NOT FOUND THEN RAISE EXCEPTION 'Clinical step missing';END IF;
 SELECT * INTO h FROM public.hato_tratamientos WHERE id=s.tratamiento_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Clinical header missing';END IF;
 SELECT * INTO a FROM public.hato_animales WHERE id=h.animal_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Clinical animal missing';END IF;
 RETURN jsonb_build_object('animal',to_jsonb(a),'header',to_jsonb(h),
  'steps',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.hato_tratamiento_pasos x WHERE x.tratamiento_id=h.id),
  'alerts',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.hato_alertas x WHERE x.paso_id IN(SELECT id FROM public.hato_tratamiento_pasos WHERE tratamiento_id=h.id)));
END $$;
CREATE FUNCTION clinical_step_confirmation.domain_state() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('headers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_tratamientos x),
 'steps',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_tratamiento_pasos x),
 'alerts',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_alertas x))
$$;
CREATE FUNCTION clinical_step_confirmation.response(r clinical_step_confirmation.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'actor',r.actor,'intent',r.intent,'original',r.original,
 'action',CASE WHEN r.sender IS NULL THEN NULL ELSE jsonb_build_object('sender',r.sender,'chatId',r.chat_id,'messageId',r.message_id) END,'state',r.state,'receipt',r.receipt)
$$;
CREATE FUNCTION clinical_step_confirmation.dispatch(p_actor jsonb,p_action text,p_key uuid,p_intent jsonb,
 p_sender bigint DEFAULT NULL,p_chat bigint DEFAULT NULL,p_message bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r clinical_step_confirmation.requests;expected_request clinical_step_confirmation.requests;
 audit_row clinical_step_confirmation.audit;expected_audit clinical_step_confirmation.audit;
 key uuid=p_key;intent jsonb;original jsonb;actual jsonb;target uuid;day date;header public.hato_tratamientos;
 step public.hato_tratamiento_pasos;expected_step public.hato_tratamiento_pasos;
 expected_header public.hato_tratamientos;alert public.hato_alertas;expected_alert public.hato_alertas;
 before_domain jsonb;control_domain jsonb;expected_domain jsonb;new_receipt jsonb;label text;fresh_actor jsonb;found_request boolean;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve') THEN RAISE EXCEPTION 'Invalid clinical action';END IF;
 IF p_action='prepare' THEN intent=clinical_step_confirmation.intent(p_intent);
 ELSIF p_intent IS NOT NULL THEN RAISE EXCEPTION 'Recovery/post cannot replace original intent';END IF;
 IF p_actor->>'origin'='web' THEN
  IF key IS NULL THEN RAISE EXCEPTION 'Original web key required';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('clinical-step:web:'||key::text,0));
  SELECT * INTO r FROM clinical_step_confirmation.requests WHERE request_key=key FOR UPDATE;
 ELSIF p_actor->>'origin'='telegram' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('clinical-step:telegram:'||p_sender::text||':'||p_chat::text||':'||p_message::text,0));
  SELECT * INTO r FROM clinical_step_confirmation.requests WHERE sender=p_sender AND chat_id=p_chat AND message_id=p_message FOR UPDATE;
 ELSE RAISE EXCEPTION 'Invalid trusted clinical actor';END IF;
 found_request=FOUND;
 IF found_request THEN
  IF r.actor IS DISTINCT FROM p_actor OR(p_action='prepare' AND r.intent IS NOT NULL AND r.intent IS DISTINCT FROM intent)
   THEN RAISE EXCEPTION 'Changed original clinical actor/intent';END IF;
  key=r.request_key;
 ELSIF p_action='status' THEN
  RETURN jsonb_build_object('version',1,'requestKey',p_key,'actor',p_actor,'intent',NULL,'original',NULL,
   'action',CASE WHEN p_sender IS NULL THEN NULL ELSE jsonb_build_object('sender',p_sender,'chatId',p_chat,'messageId',p_message) END,'state','unknown','receipt',NULL);
 ELSIF p_action='post' THEN RAISE EXCEPTION 'Original prepared clinical confirmation required';
 ELSE
  IF key IS NULL THEN key=gen_random_uuid();END IF;
  r.request_key=key;r.actor=p_actor;r.sender=p_sender;r.chat_id=p_chat;r.message_id=p_message;r.created_at=now();r.receipt=NULL;
  IF p_action='resolve' THEN
   LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos,public.hato_alertas IN SHARE ROW EXCLUSIVE MODE;
   control_domain=clinical_step_confirmation.domain_state();
   r.state='canceled';r.intent=NULL;r.original=NULL;
  ELSE
   LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos,public.hato_alertas IN SHARE ROW EXCLUSIVE MODE;
   control_domain=clinical_step_confirmation.domain_state();
   original=clinical_step_confirmation.snapshot((intent->>'stepId')::uuid);
   SELECT * INTO step FROM public.hato_tratamiento_pasos WHERE id=(intent->>'stepId')::uuid;
   IF original->'header'->>'estado' IS DISTINCT FROM 'activo' OR step.fecha_ejecutada IS NOT NULL
    OR(intent->>'fechaEjecutada')::date<(original->'header'->>'fecha_inicio')::date
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(original->'alerts') a WHERE a->>'animal_id' IS DISTINCT FROM original->'animal'->>'id')
    THEN RAISE EXCEPTION 'Current pending clinical step/date/graph required';END IF;
   IF intent->>'alertId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(original->'alerts') a
    WHERE a->>'id'=intent->>'alertId' AND a->>'paso_id'=intent->>'stepId' AND a->>'tipo'='tratamiento_paso'
     AND a->>'estado' IN('pendiente','enviada','escalada','respondida'))
    THEN RAISE EXCEPTION 'Original open treatment alert required';END IF;
   r.state='pending';r.intent=intent;r.original=original;
  END IF;
  expected_request=r;
  INSERT INTO clinical_step_confirmation.requests SELECT r.* RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected_request) THEN RAISE EXCEPTION 'Clinical reservation suppressed/mutated';END IF;
 END IF;
 expected_request=r;
 IF r.state='committed' THEN
  SELECT * INTO audit_row FROM clinical_step_confirmation.audit WHERE request_key=key;
  IF NOT FOUND OR audit_row.actor IS DISTINCT FROM r.actor OR audit_row.intent IS DISTINCT FROM r.intent OR audit_row.receipt IS DISTINCT FROM r.receipt
   THEN RAISE EXCEPTION 'Committed clinical audit proof missing';END IF;
 ELSIF p_action='resolve' AND r.state='pending' THEN
  LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos,public.hato_alertas IN SHARE ROW EXCLUSIVE MODE;
  control_domain=clinical_step_confirmation.domain_state();
  expected_request.state='canceled';
  UPDATE clinical_step_confirmation.requests SET state='canceled' WHERE request_key=key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected_request) THEN RAISE EXCEPTION 'Clinical cancellation suppressed/mutated';END IF;
 ELSIF p_action='post' THEN
  IF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled clinical confirmation cannot post';END IF;
  LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos,public.hato_alertas IN SHARE ROW EXCLUSIVE MODE;
  actual=clinical_step_confirmation.snapshot((r.intent->>'stepId')::uuid);
  IF actual IS DISTINCT FROM r.original THEN RAISE EXCEPTION 'Original clinical graph changed; review again';END IF;
  target=(r.intent->>'stepId')::uuid;day=(r.intent->>'fechaEjecutada')::date;
  IF day>(now() AT TIME ZONE 'America/Bogota')::date THEN RAISE EXCEPTION 'Actual nonfuture clinical date required';END IF;
  before_domain=clinical_step_confirmation.domain_state();expected_domain=before_domain;
  SELECT * INTO step FROM public.hato_tratamiento_pasos WHERE id=target;
  SELECT * INTO header FROM public.hato_tratamientos WHERE id=step.tratamiento_id;
  IF NOT FOUND OR header.estado<>'activo' OR step.fecha_ejecutada IS NOT NULL OR day<header.fecha_inicio
   THEN RAISE EXCEPTION 'Current pending clinical step/date required';END IF;
  expected_step=step;expected_step.fecha_ejecutada=day;
  UPDATE public.hato_tratamiento_pasos SET fecha_ejecutada=day WHERE id=target AND fecha_ejecutada IS NULL RETURNING * INTO step;
  IF NOT FOUND OR to_jsonb(step) IS DISTINCT FROM to_jsonb(expected_step) THEN RAISE EXCEPTION 'Clinical step suppressed/mutated';END IF;
  expected_domain=jsonb_set(expected_domain,'{steps}',(SELECT jsonb_agg(CASE WHEN x->>'id'=target::text THEN to_jsonb(expected_step) ELSE x END ORDER BY x->>'id') FROM jsonb_array_elements(before_domain->'steps')x));
  IF p_actor->>'origin'='web' THEN
   SELECT email INTO label FROM public.usuarios WHERE id=(p_actor->>'profileId')::uuid;
  ELSE label=coalesce(nullif(p_actor->>'displayName',''),'Telegram '||p_sender::text);END IF;
  FOR expected_alert IN SELECT * FROM public.hato_alertas WHERE paso_id=target AND animal_id=header.animal_id
   AND tipo='tratamiento_paso' AND estado IN('pendiente','enviada','escalada','respondida') ORDER BY id LOOP
   expected_alert.estado='confirmada';expected_alert.respuesta='si';expected_alert.respondida_por=label;expected_alert.updated_at=now();
   UPDATE public.hato_alertas SET estado='confirmada',respuesta='si',respondida_por=label,updated_at=now()
    WHERE id=expected_alert.id RETURNING * INTO alert;
   IF NOT FOUND OR to_jsonb(alert) IS DISTINCT FROM to_jsonb(expected_alert) THEN RAISE EXCEPTION 'Clinical alert suppressed/mutated';END IF;
   expected_domain=jsonb_set(expected_domain,'{alerts}',(SELECT jsonb_agg(CASE WHEN x->>'id'=expected_alert.id::text THEN to_jsonb(expected_alert) ELSE x END ORDER BY x->>'id') FROM jsonb_array_elements(expected_domain->'alerts')x));
  END LOOP;
  expected_header=header;
  IF NOT EXISTS(SELECT 1 FROM public.hato_tratamiento_pasos WHERE tratamiento_id=header.id AND fecha_ejecutada IS NULL) THEN
   expected_header.estado='completado';
   UPDATE public.hato_tratamientos SET estado='completado' WHERE id=header.id RETURNING * INTO header;
   IF NOT FOUND OR to_jsonb(header) IS DISTINCT FROM to_jsonb(expected_header) THEN RAISE EXCEPTION 'Clinical header suppressed/mutated';END IF;
  END IF;
  expected_domain=jsonb_set(expected_domain,'{headers}',(SELECT jsonb_agg(CASE WHEN x->>'id'=expected_header.id::text THEN to_jsonb(expected_header) ELSE x END ORDER BY x->>'id') FROM jsonb_array_elements(before_domain->'headers')x));
  new_receipt=jsonb_build_object('version',1,'recordedAt',now(),'requestKey',key,'actor',p_actor,'intent',r.intent,'original',r.original,
   'action',CASE WHEN r.sender IS NULL THEN NULL ELSE jsonb_build_object('sender',r.sender,'chatId',r.chat_id,'messageId',r.message_id) END,
   'before',r.original,'after',clinical_step_confirmation.snapshot(target));
  -- Compare the intended complete domain BEFORE accepting the receipt, and again
  -- after audit/request triggers, including unrelated siblings and other animals.
  IF clinical_step_confirmation.domain_state() IS DISTINCT FROM expected_domain THEN RAISE EXCEPTION 'Clinical final domain mismatch';END IF;
  expected_audit.request_key=key;expected_audit.actor=p_actor;expected_audit.intent=r.intent;expected_audit.receipt=new_receipt;
  INSERT INTO clinical_step_confirmation.audit SELECT expected_audit.* RETURNING * INTO audit_row;
  IF NOT FOUND OR to_jsonb(audit_row) IS DISTINCT FROM to_jsonb(expected_audit) THEN RAISE EXCEPTION 'Clinical audit suppressed/mutated';END IF;
  expected_request.state='committed';expected_request.receipt=new_receipt;
  UPDATE clinical_step_confirmation.requests SET state='committed',receipt=new_receipt WHERE request_key=key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected_request) THEN RAISE EXCEPTION 'Clinical committed request suppressed/mutated';END IF;
  SELECT * INTO audit_row FROM clinical_step_confirmation.audit WHERE request_key=key;
  IF NOT FOUND OR to_jsonb(audit_row) IS DISTINCT FROM to_jsonb(expected_audit) OR clinical_step_confirmation.domain_state() IS DISTINCT FROM expected_domain
   THEN RAISE EXCEPTION 'Clinical final audit/domain mismatch';END IF;
 END IF;
 IF p_actor->>'origin'='web' THEN fresh_actor=hato_treatment_creation.web_actor();
 ELSE fresh_actor=hato_treatment_creation.telegram_actor(p_sender,p_chat,p_message);END IF;
 IF fresh_actor IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Clinical authority changed';END IF;
 IF control_domain IS NOT NULL AND clinical_step_confirmation.domain_state() IS DISTINCT FROM control_domain
  THEN RAISE EXCEPTION 'Clinical control changed domain';END IF;
 IF control_domain IS NOT NULL AND p_action='prepare' AND r.state='pending'
  AND clinical_step_confirmation.snapshot((r.intent->>'stepId')::uuid) IS DISTINCT FROM r.original
  THEN RAISE EXCEPTION 'Clinical preparation target mismatch';END IF;
 SELECT * INTO r FROM clinical_step_confirmation.requests WHERE request_key=key;
 IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected_request) THEN RAISE EXCEPTION 'Clinical final request mismatch';END IF;
 IF p_action='post' AND r.state='committed' AND new_receipt IS NOT NULL
  AND clinical_step_confirmation.snapshot(target) IS DISTINCT FROM new_receipt->'after'
  THEN RAISE EXCEPTION 'Clinical final target graph mismatch';END IF;
 RETURN clinical_step_confirmation.response(r);
END $$;
CREATE FUNCTION public.fn_clinical_step_web(p_action text,p_request_key uuid,p_intent jsonb,p_expected_owner uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original clinical owner changed' USING ERRCODE='42501';END IF;
 RETURN clinical_step_confirmation.dispatch(hato_treatment_creation.web_actor(),p_action,p_request_key,p_intent);
END $$;
CREATE FUNCTION public.fn_clinical_step_telegram(p_action text,p_sender bigint,p_chat_id bigint,p_message_id bigint,p_intent jsonb DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 RETURN clinical_step_confirmation.dispatch(hato_treatment_creation.telegram_actor(p_sender,p_chat_id,p_message_id),p_action,NULL,p_intent,p_sender,p_chat_id,p_message_id);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA clinical_step_confirmation FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_clinical_step_web(text,uuid,jsonb,uuid),public.fn_clinical_step_telegram(text,bigint,bigint,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_clinical_step_web(text,uuid,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_clinical_step_telegram(text,bigint,bigint,bigint,jsonb) TO service_role;
COMMIT;
