-- LOCAL REVIEW FOUNDATION. No caller/cutover/production authorization.
-- Reconciled structure-only catalog baseline, verified on a disposable local replay.
-- Hosted runtime, all competing writers and coordinated release remain separate.
BEGIN;
LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos,public.hato_animales,public.usuarios,public.telegram_usuarios IN SHARE ROW EXCLUSIVE MODE;
DO $$
DECLARE t regclass; cols text[]; expected text[];v_digest text;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed postgres installation owner required';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.fn_hato_registrar_tratamiento(uuid,text,date,text,date,text,text,uuid)'::regprocedure
  AND NOT prosecdef AND prorettype='uuid'::regtype AND prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql') AND provolatile='v' AND NOT proisstrict AND proparallel='u'
  AND proacl IS NOT NULL AND NOT EXISTS(SELECT 1 FROM aclexplode(proacl) x WHERE x.grantee NOT IN(SELECT oid FROM pg_roles WHERE rolname IN('postgres','authenticated','service_role')) OR x.grantor<>(SELECT oid FROM pg_roles WHERE rolname='postgres') OR x.privilege_type<>'EXECUTE' OR x.is_grantable) AND md5(prosrc)='5504439a268818623461faa6ba669481' AND proconfig=ARRAY['search_path=public, pg_temp']
  AND proowner=(SELECT oid FROM pg_roles WHERE rolname='postgres')) THEN RAISE EXCEPTION 'Unreviewed historical treatment function';END IF;
 IF has_function_privilege('anon','public.fn_hato_registrar_tratamiento(uuid,text,date,text,date,text,text,uuid)','EXECUTE')
  OR NOT has_function_privilege('authenticated','public.fn_hato_registrar_tratamiento(uuid,text,date,text,date,text,text,uuid)','EXECUTE')
  OR NOT has_function_privilege('service_role','public.fn_hato_registrar_tratamiento(uuid,text,date,text,date,text,text,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Historical function ACL changed';END IF;
 FOREACH t IN ARRAY ARRAY['public.hato_tratamientos'::regclass,'public.hato_tratamiento_pasos'::regclass] LOOP
  expected=CASE WHEN t='public.hato_tratamientos'::regclass THEN ARRAY['id','animal_id','chequeo_id','protocolo_id','nombre','fecha_inicio','estado','nota','created_at','created_by','fuente'] ELSE ARRAY['id','tratamiento_id','paso_num','descripcion','offset_dias','fecha_programada','fecha_ejecutada','requiere_confirmacion','created_at'] END;
  SELECT array_agg(attname::text ORDER BY attnum) INTO cols FROM pg_attribute WHERE attrelid=t AND attnum>0 AND NOT attisdropped;
  IF cols IS DISTINCT FROM expected OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=t AND relrowsecurity AND relowner=(SELECT oid FROM pg_roles WHERE rolname='postgres')) THEN RAISE EXCEPTION 'Unreviewed treatment schema/owner/RLS';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_inherits WHERE inhparent=ANY(ARRAY['public.hato_tratamientos'::regclass,'public.hato_tratamiento_pasos'::regclass,'public.hato_animales'::regclass,'public.usuarios'::regclass,'public.telegram_usuarios'::regclass]) OR inhrelid=ANY(ARRAY['public.hato_tratamientos'::regclass,'public.hato_tratamiento_pasos'::regclass,'public.hato_animales'::regclass,'public.usuarios'::regclass,'public.telegram_usuarios'::regclass]))
 OR EXISTS(SELECT 1 FROM pg_rewrite WHERE ev_class=ANY(ARRAY['public.hato_tratamientos'::regclass,'public.hato_tratamiento_pasos'::regclass,'public.hato_animales'::regclass,'public.usuarios'::regclass,'public.telegram_usuarios'::regclass])) THEN RAISE EXCEPTION 'Unsupported treatment inheritance/rewrite rule';END IF;
 -- BEGIN REVIEWED TREATMENT TRIGGER BASELINE
SELECT pg_catalog.md5(coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
 'table',c.relname,'trigger',t.tgname,'definition',pg_catalog.pg_get_triggerdef(t.oid),
 'enabled',t.tgenabled,'type',t.tgtype,'deferrable',t.tgdeferrable,'initially_deferred',t.tginitdeferred,
 'constraint_trigger',t.tgconstraint<>0,
 'function',pg_catalog.jsonb_build_object('schema',n.nspname,'name',f.proname,
  'arguments',pg_catalog.pg_get_function_identity_arguments(f.oid),'returns',pg_catalog.pg_get_function_result(f.oid),
  'body_md5',pg_catalog.md5(f.prosrc),'owner',pg_catalog.pg_get_userbyid(f.proowner),
  'language',l.lanname,'security_definer',f.prosecdef,'configuration',f.proconfig,
  'volatile',f.provolatile,'strict',f.proisstrict,'parallel',f.proparallel,'leakproof',f.proleakproof,
  'acl_is_null',f.proacl IS NULL,
  'acl',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(
    CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
    pg_catalog.pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable)
    ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END,
    pg_catalog.pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable)
   FROM pg_catalog.aclexplode(coalesce(f.proacl,pg_catalog.acldefault('f',f.proowner))) a)))
 ORDER BY c.relname,t.tgname),'[]'::jsonb)::text)
INTO v_digest
FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
JOIN pg_catalog.pg_proc f ON f.oid=t.tgfoid JOIN pg_catalog.pg_namespace n ON n.oid=f.pronamespace
JOIN pg_catalog.pg_language l ON l.oid=f.prolang
WHERE NOT t.tgisinternal AND t.tgrelid IN ('public.hato_tratamientos'::regclass,'public.hato_tratamiento_pasos'::regclass,'public.hato_animales'::regclass,'public.usuarios'::regclass,'public.telegram_usuarios'::regclass);

 IF v_digest IS DISTINCT FROM '589b0bfd39d77f52c262cb2e63697ffa' THEN RAISE EXCEPTION 'Reviewed treatment trigger baseline drift';END IF;
 -- END REVIEWED TREATMENT TRIGGER BASELINE
 IF NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='telegram_id' WHERE i.indrelid='public.telegram_usuarios'::regclass AND i.indisunique AND i.indisvalid AND i.indimmediate AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum) THEN RAISE EXCEPTION 'Unique immediate sender index required';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='id' WHERE i.indrelid='public.usuarios'::regclass AND i.indisunique AND i.indisvalid AND i.indimmediate AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts=1 AND i.indkey[0]=a.attnum) THEN RAISE EXCEPTION 'Unique immediate profile identity required';END IF;
SELECT md5(jsonb_agg(jsonb_build_object('table',c.relname,'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'type',contype,'validated',convalidated,'deferred',condeferrable,'initiallyDeferred',condeferred,'definition',pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid=c.oid),
 'policies',(SELECT jsonb_agg(jsonb_build_object('name',polname,'command',polcmd,'permissive',polpermissive,'roles',(SELECT jsonb_agg(CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END ORDER BY CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END) FROM unnest(polroles) role_id),'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) ORDER BY polname) FROM pg_policy WHERE polrelid=c.oid),
 'grants',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'grantor',pg_get_userbyid(x.grantor),'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x)) ORDER BY c.relname)::text)
 INTO v_digest FROM pg_class c WHERE c.oid IN('public.hato_tratamientos'::regclass,'public.hato_tratamiento_pasos'::regclass);
 IF v_digest IS DISTINCT FROM '23cb4a9df6fc50d057015f6d59a84dab' THEN RAISE EXCEPTION 'Unsupported reviewed treatment schema/default/constraint/policy/ACL fingerprint';END IF;
SELECT md5(jsonb_agg(jsonb_build_object('table',c.relname,'owner',pg_get_userbyid(c.relowner),'kind',c.relkind,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('name',conname,'type',contype,'validated',convalidated,'deferred',condeferrable,'initiallyDeferred',condeferred,'definition',pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid=c.oid),
 'policies',(SELECT jsonb_agg(jsonb_build_object('name',polname,'command',polcmd,'permissive',polpermissive,'roles',(SELECT jsonb_agg(CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END ORDER BY CASE WHEN role_id=0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_id) END) FROM unnest(polroles) role_id),'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) ORDER BY polname) FROM pg_policy WHERE polrelid=c.oid),
 'grants',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,'grantor',pg_get_userbyid(x.grantor),'privilege',x.privilege_type,'grantable',x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x)) ORDER BY c.relname)::text)
 INTO v_digest FROM pg_class c WHERE c.oid IN('public.hato_animales'::regclass,'public.usuarios'::regclass,'public.telegram_usuarios'::regclass);
 IF v_digest IS DISTINCT FROM '57b8450fd225db5c20522b6edcfd4a06' THEN RAISE EXCEPTION 'Unsupported reviewed animal/identity schema/default/constraint/ACL fingerprint';END IF;
END $$;
CREATE SCHEMA hato_treatment_creation;
REVOKE ALL ON SCHEMA hato_treatment_creation FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_treatment_creation.requests(
 request_key uuid PRIMARY KEY, actor jsonb NOT NULL,payload jsonb NOT NULL,
 sender bigint,chat_id bigint,message_id bigint,
 state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(sender,chat_id,message_id),
 CHECK((actor->>'origin'='web' AND sender IS NULL AND chat_id IS NULL AND message_id IS NULL)
 OR (actor->>'origin'='telegram' AND sender>0 AND chat_id=sender AND message_id>0)));
CREATE TABLE hato_treatment_creation.audit(request_key uuid PRIMARY KEY REFERENCES hato_treatment_creation.requests(request_key),actor jsonb NOT NULL,payload jsonb NOT NULL,receipt jsonb NOT NULL);
-- A native private-message cancellation can precede a lost first prepare.
CREATE TABLE hato_treatment_creation.action_fences(
 sender bigint NOT NULL,chat_id bigint NOT NULL,message_id bigint NOT NULL,
 actor jsonb NOT NULL,request_key uuid NOT NULL UNIQUE,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(sender,chat_id,message_id),CHECK(sender>0 AND chat_id=sender AND message_id>0));
ALTER TABLE hato_treatment_creation.action_fences ENABLE ROW LEVEL SECURITY;
ALTER TABLE hato_treatment_creation.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE hato_treatment_creation.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_treatment_creation FROM PUBLIC,anon,authenticated,service_role;

-- Receipt attests creation forever; later domain corrections never edit this proof.
CREATE FUNCTION hato_treatment_creation.immutable_proof() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='audit' OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Immutable treatment creation proof';END IF;
 IF OLD.state<>'pending' OR NEW.state NOT IN('committed','canceled') OR
  (to_jsonb(NEW)-'state'-'receipt') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'receipt') OR
  (NEW.state='canceled' AND NEW.receipt IS NOT NULL) OR (NEW.state='committed' AND NEW.receipt IS NULL)
 THEN RAISE EXCEPTION 'Immutable treatment attempt identity/terminal state';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_creation_proof BEFORE UPDATE OR DELETE ON hato_treatment_creation.audit FOR EACH ROW EXECUTE FUNCTION hato_treatment_creation.immutable_proof();
CREATE TRIGGER immutable_creation_identity BEFORE UPDATE OR DELETE ON hato_treatment_creation.requests FOR EACH ROW EXECUTE FUNCTION hato_treatment_creation.immutable_proof();

CREATE FUNCTION hato_treatment_creation.immutable_fence() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Immutable original treatment cancellation fence';END $$;
CREATE TRIGGER immutable_action_fence BEFORE UPDATE OR DELETE ON hato_treatment_creation.action_fences FOR EACH ROW EXECUTE FUNCTION hato_treatment_creation.immutable_fence();

CREATE FUNCTION hato_treatment_creation.web_actor() RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE p public.usuarios; a uuid=auth.uid(); BEGIN
 IF a IS NULL THEN RAISE EXCEPTION 'Human JWT required' USING ERRCODE='42501';END IF;
 SELECT * INTO p FROM public.usuarios WHERE id=a FOR SHARE;
 IF NOT FOUND OR p.activo IS DISTINCT FROM true OR p.rol IS NULL OR p.rol::text NOT IN('Administrador','Gerencia') THEN RAISE EXCEPTION 'Active Administrador/Gerencia required' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('origin','web','profileId',a);
END $$;
CREATE FUNCTION hato_treatment_creation.telegram_actor(p_sender bigint,p_chat bigint,p_message bigint) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r public.telegram_usuarios;p public.usuarios; BEGIN
 IF p_sender IS NULL OR p_sender<1 OR p_sender>9007199254740991 OR p_chat IS DISTINCT FROM p_sender OR p_message IS NULL OR p_message<1 OR p_message>9007199254740991 THEN RAISE EXCEPTION 'Original private confirmation action required';END IF;
 SELECT * INTO r FROM public.telegram_usuarios WHERE telegram_id=p_sender FOR SHARE;
 IF NOT FOUND OR r.activo IS DISTINCT FROM true OR r.modulos_permitidos IS NULL OR ('hato_produccion'=ANY(r.modulos_permitidos)) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Active current Hato registration required' USING ERRCODE='42501';END IF;
 IF r.usuario_id IS NOT NULL THEN
  SELECT * INTO p FROM public.usuarios WHERE id=r.usuario_id FOR SHARE;
  IF NOT FOUND OR p.activo IS DISTINCT FROM true THEN RAISE EXCEPTION 'Active linked profile required' USING ERRCODE='42501';END IF;
 END IF;
 RETURN jsonb_build_object('origin','telegram','registrationId',r.id,'profileId',r.usuario_id,'sender',p_sender,'displayName',r.nombre_display);
END $$;
CREATE FUNCTION hato_treatment_creation.canonical_payload(p jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE k text;start_date date;next_date date; BEGIN
 IF p IS NULL OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p))<>8
  OR NOT(p ?& ARRAY['version','animalId','nombre','fechaInicio','nota','fechaProximoPaso','descripcionPaso','observedAnimal']) OR p->'version' IS DISTINCT FROM '1'::jsonb THEN RAISE EXCEPTION 'Invalid treatment proposal';END IF;
 FOREACH k IN ARRAY ARRAY['animalId','nombre','fechaInicio'] LOOP
  IF jsonb_typeof(p->k) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid treatment text';END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['nota','fechaProximoPaso','descripcionPaso'] LOOP
  IF jsonb_typeof(p->k) IS DISTINCT FROM 'string' AND p->k IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Invalid optional treatment field';END IF;
 END LOOP;
 IF btrim(p->>'nombre')='' OR p->>'fechaInicio'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR ((p->>'fechaProximoPaso') IS NOT NULL AND p->>'fechaProximoPaso'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
  OR jsonb_typeof(p->'observedAnimal') IS DISTINCT FROM 'object' OR p->'observedAnimal'->>'id' IS DISTINCT FROM ((p->>'animalId')::uuid)::text THEN RAISE EXCEPTION 'Invalid original animal/date/name';END IF;
 start_date=(p->>'fechaInicio')::date;next_date=(p->>'fechaProximoPaso')::date;
 IF next_date IS NOT NULL AND next_date<start_date THEN RAISE EXCEPTION 'Follow-up precedes treatment';END IF;
 RETURN p||jsonb_build_object('animalId',((p->>'animalId')::uuid)::text,'nombre',btrim(p->>'nombre'),'nota',nullif(btrim(p->>'nota'),''),'descripcionPaso',nullif(btrim(p->>'descripcionPaso'),''));
END $$;
CREATE FUNCTION hato_treatment_creation.response(r hato_treatment_creation.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'actor',r.actor,'payload',r.payload,'action',CASE WHEN r.sender IS NULL THEN NULL ELSE jsonb_build_object('sender',r.sender,'chatId',r.chat_id,'messageId',r.message_id) END,'state',r.state,'receipt',r.receipt)
$$;
CREATE FUNCTION hato_treatment_creation.domain_state() RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('headers',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.hato_tratamientos t),'[]'),'steps',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.hato_tratamiento_pasos s),'[]'))
$$;

CREATE FUNCTION hato_treatment_creation.step(p_actor jsonb,p_action text,p_key uuid,p_payload jsonb,p_sender bigint DEFAULT NULL,p_chat bigint DEFAULT NULL,p_message bigint DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r hato_treatment_creation.requests;expected_r hato_treatment_creation.requests;audit_row hato_treatment_creation.audit;expected_audit hato_treatment_creation.audit;
 payload jsonb;animal public.hato_animales;header public.hato_tratamientos;expected_header public.hato_tratamientos;followup public.hato_tratamiento_pasos;expected_followup public.hato_tratamiento_pasos;
 created_steps jsonb='[]';before_state jsonb;after_state jsonb;new_receipt jsonb;key uuid=p_key;actual_actor jsonb;found_request boolean;fence hato_treatment_creation.action_fences;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve') THEN RAISE EXCEPTION 'Invalid treatment action';END IF;
 payload=hato_treatment_creation.canonical_payload(p_payload);
 IF p_actor->>'origin'='web' THEN
  IF key IS NULL THEN RAISE EXCEPTION 'Original web request UUID required';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hato-treatment:web:'||key::text,0));
  SELECT * INTO r FROM hato_treatment_creation.requests WHERE request_key=key FOR UPDATE;
 ELSIF p_actor->>'origin'='telegram' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('hato-treatment:telegram:'||p_sender::text||':'||p_chat::text||':'||p_message::text,0));
  SELECT * INTO r FROM hato_treatment_creation.requests WHERE sender=p_sender AND chat_id=p_chat AND message_id=p_message FOR UPDATE;
 ELSE RAISE EXCEPTION 'Invalid trusted actor mode';END IF;
 found_request=FOUND;
 IF found_request THEN
  IF r.actor IS DISTINCT FROM p_actor OR r.payload IS DISTINCT FROM payload OR (p_key IS NOT NULL AND r.request_key IS DISTINCT FROM p_key) THEN RAISE EXCEPTION 'Changed original treatment attempt';END IF;
  IF p_sender IS NOT NULL AND p_action='status' AND p_key IS NULL AND r.state='committed' THEN RAISE EXCEPTION 'Known committed Telegram attempt requires original UUID';END IF;
  key=r.request_key;
 ELSIF p_action='status' THEN
  RETURN jsonb_build_object('version',1,'requestKey',p_key,'actor',p_actor,'payload',payload,'action',CASE WHEN p_sender IS NULL THEN NULL ELSE jsonb_build_object('sender',p_sender,'chatId',p_chat,'messageId',p_message) END,'state','unknown','receipt',NULL);
 ELSIF p_action='post' THEN RAISE EXCEPTION 'Original treatment reservation required';
 ELSE
  IF p_sender IS NOT NULL THEN
   SELECT * INTO fence FROM hato_treatment_creation.action_fences WHERE sender=p_sender AND chat_id=p_chat AND message_id=p_message FOR SHARE;
   IF FOUND THEN
    IF fence.actor IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Changed original cancellation actor';END IF;
    key=fence.request_key;
   END IF;
  END IF;
  IF p_sender IS NOT NULL AND p_key IS NOT NULL THEN RAISE EXCEPTION 'Telegram first reservation uses server-owned UUID';END IF;
  IF key IS NULL THEN key=gen_random_uuid();END IF;
  r.request_key=key;r.actor=p_actor;r.payload=payload;r.sender=p_sender;r.chat_id=p_chat;r.message_id=p_message;r.state=CASE WHEN p_action='resolve' OR fence.request_key IS NOT NULL THEN 'canceled' ELSE 'pending' END;r.receipt=NULL;r.created_at=now();
  IF p_action='prepare' AND r.state='pending' THEN
   SELECT * INTO animal FROM public.hato_animales WHERE id=(payload->>'animalId')::uuid FOR SHARE;
   IF NOT FOUND OR to_jsonb(animal) IS DISTINCT FROM payload->'observedAnimal' THEN RAISE EXCEPTION 'Original animal changed; review again';END IF;
  END IF;
  INSERT INTO hato_treatment_creation.requests SELECT r.* RETURNING * INTO expected_r;
  SELECT * INTO expected_r FROM hato_treatment_creation.requests WHERE request_key=key;
  IF NOT FOUND OR to_jsonb(expected_r) IS DISTINCT FROM to_jsonb(r) THEN RAISE EXCEPTION 'Treatment reservation suppressed/mutated';END IF;
 END IF;
 expected_r=r;
 IF r.state='committed' THEN
  SELECT * INTO audit_row FROM hato_treatment_creation.audit WHERE request_key=key;
  IF NOT FOUND OR audit_row.actor IS DISTINCT FROM p_actor OR audit_row.payload IS DISTINCT FROM payload OR audit_row.receipt IS DISTINCT FROM r.receipt THEN RAISE EXCEPTION 'Treatment committed audit proof missing';END IF;
  RETURN hato_treatment_creation.response(r);
 END IF;
 IF p_action='resolve' AND r.state='pending' THEN
  expected_r.state='canceled';UPDATE hato_treatment_creation.requests SET state='canceled' WHERE request_key=key;
 ELSIF p_action='post' THEN
  IF p_key IS NULL OR r.state IS DISTINCT FROM 'pending' THEN RAISE EXCEPTION 'Canceled treatment cannot post';END IF;
  -- Header-before-step table locks align with undo/177 and fence direct child writes.
  LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO animal FROM public.hato_animales WHERE id=(payload->>'animalId')::uuid FOR SHARE;
  IF NOT FOUND OR to_jsonb(animal) IS DISTINCT FROM payload->'observedAnimal' THEN RAISE EXCEPTION 'Original animal changed; review again';END IF;
  before_state=hato_treatment_creation.domain_state();
  expected_header.id=gen_random_uuid();expected_header.animal_id=animal.id;expected_header.chequeo_id=NULL;expected_header.protocolo_id=NULL;
  expected_header.nombre=payload->>'nombre';expected_header.fecha_inicio=(payload->>'fechaInicio')::date;expected_header.estado=CASE WHEN payload->>'fechaProximoPaso' IS NULL THEN 'completado' ELSE 'activo' END;
  expected_header.nota=payload->>'nota';expected_header.fuente=p_actor->>'origin';expected_header.created_at=now();expected_header.created_by=(p_actor->>'profileId')::uuid;
  INSERT INTO public.hato_tratamientos SELECT expected_header.* RETURNING * INTO header;
  IF NOT FOUND OR to_jsonb(header) IS DISTINCT FROM to_jsonb(expected_header) THEN RAISE EXCEPTION 'Treatment header suppressed/mutated';END IF;
  IF payload->>'fechaProximoPaso' IS NOT NULL THEN
   expected_followup.id=gen_random_uuid();expected_followup.tratamiento_id=header.id;expected_followup.paso_num=1;expected_followup.descripcion=payload->>'descripcionPaso';
   expected_followup.offset_dias=(payload->>'fechaProximoPaso')::date-(payload->>'fechaInicio')::date;expected_followup.fecha_programada=(payload->>'fechaProximoPaso')::date;
   expected_followup.fecha_ejecutada=NULL;expected_followup.requiere_confirmacion=true;expected_followup.created_at=now();
   INSERT INTO public.hato_tratamiento_pasos SELECT expected_followup.* RETURNING * INTO followup;
   IF NOT FOUND OR to_jsonb(followup) IS DISTINCT FROM to_jsonb(expected_followup) THEN RAISE EXCEPTION 'Requested treatment step suppressed/mutated';END IF;
   created_steps=jsonb_build_array(to_jsonb(expected_followup));
  END IF;
  new_receipt=jsonb_build_object('version',1,'requestKey',key,'actor',p_actor,'payload',payload,'action',CASE WHEN p_sender IS NULL THEN NULL ELSE jsonb_build_object('sender',p_sender,'chatId',p_chat,'messageId',p_message) END,'before',jsonb_build_object('animal',to_jsonb(animal)),'after',jsonb_build_object('header',to_jsonb(expected_header),'steps',created_steps));
  expected_audit.request_key=key;expected_audit.actor=p_actor;expected_audit.payload=payload;expected_audit.receipt=new_receipt;
  INSERT INTO hato_treatment_creation.audit SELECT expected_audit.* RETURNING * INTO audit_row;
  IF NOT FOUND OR to_jsonb(audit_row) IS DISTINCT FROM to_jsonb(expected_audit) THEN RAISE EXCEPTION 'Treatment audit suppressed/mutated';END IF;
  expected_r.state='committed';expected_r.receipt=new_receipt;
  UPDATE hato_treatment_creation.requests SET state='committed',receipt=new_receipt WHERE request_key=key;
  -- Final persisted rows and full sibling set must match the original transaction plan.
  SELECT * INTO header FROM public.hato_tratamientos WHERE id=expected_header.id;
  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY id),'[]') INTO created_steps FROM public.hato_tratamiento_pasos s WHERE tratamiento_id=expected_header.id;
  IF NOT FOUND OR to_jsonb(header) IS DISTINCT FROM to_jsonb(expected_header) OR created_steps IS DISTINCT FROM new_receipt->'after'->'steps' THEN RAISE EXCEPTION 'Final treatment state mismatch';END IF;
  after_state=hato_treatment_creation.domain_state();
  IF jsonb_build_object('headers',(SELECT coalesce(jsonb_agg(v),'[]') FROM jsonb_array_elements(after_state->'headers') v WHERE v->>'id'<>expected_header.id::text),'steps',(SELECT coalesce(jsonb_agg(v),'[]') FROM jsonb_array_elements(after_state->'steps') v WHERE v->>'tratamiento_id'<>expected_header.id::text)) IS DISTINCT FROM before_state THEN RAISE EXCEPTION 'Unexpected treatment sibling effects';END IF;
  SELECT * INTO audit_row FROM hato_treatment_creation.audit WHERE request_key=key;
  IF NOT FOUND OR to_jsonb(audit_row) IS DISTINCT FROM to_jsonb(expected_audit) THEN RAISE EXCEPTION 'Final treatment audit mismatch';END IF;
 END IF;
 SELECT * INTO r FROM hato_treatment_creation.requests WHERE request_key=key;
 IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected_r) THEN RAISE EXCEPTION 'Final treatment request mismatch';END IF;
 actual_actor=CASE WHEN p_actor->>'origin'='web' THEN hato_treatment_creation.web_actor() ELSE hato_treatment_creation.telegram_actor(p_sender,p_chat,p_message) END;
 IF actual_actor IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Treatment authority changed';END IF;
 IF p_action IN('prepare','post') AND r.state<>'canceled' AND NOT EXISTS(SELECT 1 FROM public.hato_animales a WHERE id=(payload->>'animalId')::uuid AND to_jsonb(a)=payload->'observedAnimal') THEN RAISE EXCEPTION 'Treatment target changed during write';END IF;
 RETURN hato_treatment_creation.response(r);
END $$;

CREATE FUNCTION public.fn_hato_treatment_create_web(p_action text,p_request_key uuid,p_payload jsonb,p_expected_owner uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original human owner changed' USING ERRCODE='42501';END IF;
 RETURN hato_treatment_creation.step(hato_treatment_creation.web_actor(),p_action,p_request_key,p_payload);END $$;
CREATE FUNCTION public.fn_hato_treatment_create_telegram(p_action text,p_sender bigint,p_chat_id bigint,p_message_id bigint,p_payload jsonb,p_request_key uuid DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN RETURN hato_treatment_creation.step(hato_treatment_creation.telegram_actor(p_sender,p_chat_id,p_message_id),p_action,p_request_key,p_payload,p_sender,p_chat_id,p_message_id);END $$;
-- Capture the complete original row under fresh locked native Hato authority.
CREATE FUNCTION public.fn_hato_treatment_snapshot_telegram(p_sender bigint,p_chat_id bigint,p_message_id bigint,p_animal_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;animal public.hato_animales;
BEGIN
 actor=hato_treatment_creation.telegram_actor(p_sender,p_chat_id,p_message_id);
 SELECT * INTO animal FROM public.hato_animales WHERE id=p_animal_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Treatment animal does not exist';END IF;
 IF hato_treatment_creation.telegram_actor(p_sender,p_chat_id,p_message_id) IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Treatment snapshot authority changed';END IF;
 RETURN jsonb_build_object('actor',actor,'animal',to_jsonb(animal));
END $$;
-- Recovery accepts only trusted native sender/chat/message identifiers, never a
-- client proposal or retry UUID. Original payload/key are read under the same lock.
CREATE FUNCTION public.fn_hato_treatment_create_telegram_action(p_action text,p_sender bigint,p_chat_id bigint,p_message_id bigint) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb; r hato_treatment_creation.requests; fence hato_treatment_creation.action_fences;expected_fence hato_treatment_creation.action_fences;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('post','status','resolve') THEN RAISE EXCEPTION 'Invalid native treatment recovery action';END IF;
 actor=hato_treatment_creation.telegram_actor(p_sender,p_chat_id,p_message_id);
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-treatment:telegram:'||p_sender::text||':'||p_chat_id::text||':'||p_message_id::text,0));
 SELECT * INTO r FROM hato_treatment_creation.requests WHERE sender=p_sender AND chat_id=p_chat_id AND message_id=p_message_id FOR UPDATE;
 IF FOUND THEN
  IF r.actor IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Changed original treatment recovery actor';END IF;
  RETURN hato_treatment_creation.step(actor,CASE WHEN r.state='canceled' AND p_action='post' THEN 'status' ELSE p_action END,r.request_key,r.payload,p_sender,p_chat_id,p_message_id);
 END IF;
 SELECT * INTO fence FROM hato_treatment_creation.action_fences WHERE sender=p_sender AND chat_id=p_chat_id AND message_id=p_message_id FOR UPDATE;
 IF FOUND AND fence.actor IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Changed original cancellation actor';END IF;
 IF fence.request_key IS NULL AND p_action='resolve' THEN
  expected_fence.sender=p_sender;expected_fence.chat_id=p_chat_id;expected_fence.message_id=p_message_id;
  expected_fence.actor=actor;expected_fence.request_key=gen_random_uuid();expected_fence.created_at=now();
  INSERT INTO hato_treatment_creation.action_fences SELECT expected_fence.*;
  SELECT * INTO fence FROM hato_treatment_creation.action_fences WHERE sender=p_sender AND chat_id=p_chat_id AND message_id=p_message_id;
  IF NOT FOUND OR to_jsonb(fence) IS DISTINCT FROM to_jsonb(expected_fence) THEN RAISE EXCEPTION 'Treatment cancellation fence suppressed/mutated';END IF;
 END IF;
 IF hato_treatment_creation.telegram_actor(p_sender,p_chat_id,p_message_id) IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Treatment recovery authority changed';END IF;
 RETURN jsonb_build_object('version',1,'requestKey',fence.request_key,'actor',actor,'payload',NULL,
  'action',jsonb_build_object('sender',p_sender,'chatId',p_chat_id,'messageId',p_message_id),
  'state',CASE WHEN fence.request_key IS NULL THEN 'unknown' ELSE 'canceled' END,'receipt',NULL);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_treatment_creation FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_treatment_create_web(text,uuid,jsonb,uuid),public.fn_hato_treatment_create_telegram(text,bigint,bigint,bigint,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_treatment_snapshot_telegram(bigint,bigint,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_treatment_snapshot_telegram(bigint,bigint,bigint,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fn_hato_treatment_create_telegram_action(text,bigint,bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_treatment_create_telegram_action(text,bigint,bigint,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_treatment_create_web(text,uuid,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hato_treatment_create_telegram(text,bigint,bigint,bigint,jsonb,uuid) TO service_role;
-- Old RPC execute remains unchanged until separately authorized coordinated release.
COMMIT;
