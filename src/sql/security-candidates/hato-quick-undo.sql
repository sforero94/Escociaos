-- NONNUMBERED prospective protected insemination/exact-usage undo foundation after32candidates.
-- Offline only. Actual Telegram caller and all other coupled lifecycles remain separate.
BEGIN;
SELECT alert_cron.lock_source();
DO $admission$ DECLARE fingerprint text;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed quick undo installation owner required';END IF;
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
 IF fingerprint IS DISTINCT FROM '5ae11977b7a8e2f574bd41bb07f76ddc' THEN RAISE EXCEPTION 'Unreviewed quick undo source graph';END IF;
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
 IF fingerprint IS DISTINCT FROM 'e0e432ae1b0ae23408509079dde7921c' THEN RAISE EXCEPTION 'Unreviewed quick undo inventory graph %',fingerprint;END IF;
 PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_death.snapshot(uuid)') AND md5(p.prosrc)='a6bf1457f7ab6b1adf5cae9c9c78d308' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') OR EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role'))v(role) WHERE has_function_privilege(v.role,'hato_death.snapshot(uuid)','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed quick undo snapshot helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_treatment_creation.web_actor()') AND md5(p.prosrc)='1d8ec54936d4f658da49a965b828224c' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed quick undo actor helper';END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid IN('public.hato_eventos'::regclass,'public.hato_pajillas_uso'::regclass)) THEN RAISE EXCEPTION 'Unreviewed incoming event FK boundary';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_pajilla_use.inventory()') AND md5(p.prosrc)='56e38e19c11fe0f46810e1a578778ce8' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed quick undo inventory helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_quick_telegram.actor(bigint,bigint,bigint)') AND md5(p.prosrc)='4ac2d6408c68abb39954ba8168ab1065' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))g(role) WHERE has_function_privilege(g.role,'hato_quick_telegram.actor(bigint,bigint,bigint)','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed quick undo actor helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_quick_telegram.snapshot(uuid)') AND md5(p.prosrc)='cd740e9d054bbd2f2b480260acb24a96' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))g(role) WHERE has_function_privilege(g.role,'hato_quick_telegram.snapshot(uuid)','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed quick undo snapshot helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_undo.authorize(bigint)') AND md5(p.prosrc)='1188bde9748558e694915fe5de80a0df' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))g(role) WHERE has_function_privilege(g.role,'hato_undo.authorize(bigint)','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed quick undo authorize helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_sale.lock_source()') AND md5(prosrc)='35bd07189be4bbf2dc0c964109c064bf' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed coupled financial lock_source helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_sale.finance()') AND md5(prosrc)='faaf8458321604398f8f75a1cdb398af' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed coupled financial finance helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_quick_telegram.immutable()') AND md5(prosrc)='664305954ad21beb1c01bb8a57b5ca82' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed quick creation immutable guard';END IF;
END $admission$;
-- Preserve audit/request refusal while avoiding request-only fields on audit rows.
CREATE OR REPLACE FUNCTION hato_quick_telegram.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' THEN RAISE EXCEPTION 'Immutable original quick proof';END IF;IF OLD.state<>'pending' OR NEW.state NOT IN('committed','canceled') OR (to_jsonb(NEW)-'state'-'receipt') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'receipt') THEN RAISE EXCEPTION 'Immutable original quick proof';END IF;RETURN NEW;END $$;

CREATE SCHEMA hato_quick_undo;
REVOKE ALL ON SCHEMA hato_quick_undo FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_quick_undo.requests(request_key uuid PRIMARY KEY,actor jsonb NOT NULL,sender bigint NOT NULL,chat_id bigint NOT NULL,message_id bigint NOT NULL,UNIQUE(sender,chat_id,message_id),CHECK(sender>0 AND chat_id=sender AND message_id>0),event_id uuid,original jsonb,effective_date date,state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR event_id IS NOT NULL AND original IS NOT NULL AND effective_date IS NOT NULL));
CREATE TABLE hato_quick_undo.audit(request_key uuid PRIMARY KEY REFERENCES hato_quick_undo.requests(request_key),receipt jsonb NOT NULL);
ALTER TABLE hato_quick_undo.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_quick_undo.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_quick_undo FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_quick_undo.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' THEN RAISE EXCEPTION 'Immutable coupled undo proof';END IF;
 IF OLD.state<>'pending' OR NEW.state NOT IN('committed','canceled') OR (to_jsonb(NEW)-'state'-'receipt') IS DISTINCT FROM(to_jsonb(OLD)-'state'-'receipt') THEN RAISE EXCEPTION 'Immutable coupled undo proof';END IF;RETURN NEW;END $$;
CREATE TRIGGER immutable_request BEFORE UPDATE OR DELETE ON hato_quick_undo.requests FOR EACH ROW EXECUTE FUNCTION hato_quick_undo.immutable();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON hato_quick_undo.audit FOR EACH ROW EXECUTE FUNCTION hato_quick_undo.immutable();
CREATE TRIGGER no_truncate_request BEFORE TRUNCATE ON hato_quick_undo.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_quick_undo.immutable();
CREATE TRIGGER no_truncate_audit BEFORE TRUNCATE ON hato_quick_undo.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_quick_undo.immutable();
CREATE FUNCTION hato_quick_undo.result(r hato_quick_undo.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'actor',r.actor,'action',jsonb_build_object('sender',r.sender,'chatId',r.chat_id,'messageId',r.message_id),'eventId',r.event_id,'original',r.original,'effectiveDate',r.effective_date,'state',r.state,'receipt',r.receipt);
$$;
CREATE FUNCTION hato_quick_undo.provenance(target uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE q hato_quick_telegram.requests;creation_receipt jsonb;event jsonb;usage jsonb;current_graph jsonb; matches integer;
BEGIN
 SELECT count(*) INTO matches FROM hato_quick_telegram.requests r WHERE r.state='committed' AND r.receipt->'after'->'events' @>jsonb_build_array(jsonb_build_object('id',target)) AND r.plan->'events' @>jsonb_build_array(jsonb_build_object('id',target));
 IF matches<>1 THEN RAISE EXCEPTION 'Unique protected quick creation provenance required';END IF;
 SELECT * INTO STRICT q FROM hato_quick_telegram.requests r WHERE r.state='committed' AND r.plan->'events' @>jsonb_build_array(jsonb_build_object('id',target));creation_receipt=q.receipt;
 IF NOT EXISTS(SELECT 1 FROM hato_quick_telegram.audit a WHERE a.request_key=q.request_key AND a.receipt=creation_receipt) OR q.intent->>'kind'<>'inseminacion' OR q.intent->>'pajillaId' IS NULL OR jsonb_array_length(q.plan->'events')<>1 OR jsonb_typeof(creation_receipt->'usage') IS DISTINCT FROM 'object' OR creation_receipt->'plan' IS DISTINCT FROM q.plan OR creation_receipt->'original' IS DISTINCT FROM q.original OR creation_receipt->'intent' IS DISTINCT FROM q.intent OR creation_receipt->>'requestKey' IS DISTINCT FROM q.request_key::text OR creation_receipt->'actor' IS DISTINCT FROM q.actor THEN RAISE EXCEPTION 'Exact protected coupled creation audit required';END IF;
 SELECT to_jsonb(e) INTO event FROM public.hato_eventos e WHERE id=target;
 SELECT to_jsonb(u) INTO usage FROM public.hato_pajillas_uso u WHERE id=(creation_receipt->'usage'->>'id')::uuid;
 IF event IS DISTINCT FROM((q.plan->'events'->0)||jsonb_build_object('created_at',creation_receipt->'recordedAt')) OR usage IS DISTINCT FROM creation_receipt->'usage' OR usage IS DISTINCT FROM((q.plan->'usage')||jsonb_build_object('created_at',creation_receipt->'recordedAt')) OR event->>'tipo' IS DISTINCT FROM 'servicio' OR event->>'tipo_servicio' IS DISTINCT FROM 'inseminacion' OR event->>'fuente' IS DISTINCT FROM 'telegram' OR event->>'animal_id' IS DISTINCT FROM usage->>'animal_id' OR event->>'fecha' IS DISTINCT FROM usage->>'fecha_uso' OR event->'datos'->>'pajilla_uso_id' IS DISTINCT FROM usage->>'id' OR event->>'fin_ingreso_id' IS NOT NULL OR event->>'transaccion_ganado_id' IS NOT NULL OR event->>'cria_id' IS NOT NULL OR event->>'alerta_id' IS NOT NULL OR event->>'chequeo_vaca_id' IS NOT NULL THEN RAISE EXCEPTION 'Original coupled dependents changed or unavailable';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.hato_pajillas l WHERE l.id=(usage->>'pajilla_id')::uuid AND l.toro_id=(event->>'toro_id')::uuid) OR NOT EXISTS(SELECT 1 FROM public.hato_toros b WHERE b.id=(event->>'toro_id')::uuid AND b.tipo='inseminacion') THEN RAISE EXCEPTION 'Original linked catalog reference changed';END IF;
 current_graph=hato_quick_telegram.snapshot((event->>'animal_id')::uuid);
 IF current_graph->'graph' IS DISTINCT FROM creation_receipt->'after' OR current_graph->'graph'->'animal'->>'estado' IS DISTINCT FROM 'activa' THEN RAISE EXCEPTION 'Related clinical graph changed since protected creation';END IF;
 IF EXISTS(SELECT 1 FROM public.hato_eventos e WHERE id<>target AND datos->>'pajilla_uso_id'=usage->>'id') THEN RAISE EXCEPTION 'Referenced usage must be preserved';END IF;
 RETURN jsonb_build_object('creation',hato_quick_telegram.result(q),'snapshot',current_graph,'event',event,'usage',usage);
END $$;
-- The existing correction guard requires a genuine nested trusted trigger.
CREATE FUNCTION hato_quick_undo.write_trace() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE request hato_quick_undo.requests;trace public.hato_correcciones;written public.hato_correcciones;actor uuid;
BEGIN
 SELECT * INTO STRICT request FROM hato_quick_undo.requests WHERE request_key=NEW.request_key;
 actor=hato_undo.authorize(request.sender);
 IF current_user<>'postgres' OR auth.uid() IS NOT NULL OR request.state<>'pending' OR NEW.receipt->'actor' IS DISTINCT FROM request.actor OR request.actor->>'profileId' IS DISTINCT FROM actor::text OR NEW.receipt->'original' IS DISTINCT FROM request.original OR NEW.receipt->>'requestKey' IS DISTINCT FROM request.request_key::text OR EXISTS(SELECT 1 FROM public.hato_eventos WHERE id=request.event_id) OR EXISTS(SELECT 1 FROM public.hato_pajillas_uso WHERE id=(request.original->'usage'->>'id')::uuid) THEN RAISE EXCEPTION 'Trusted coupled correction context required';END IF;
 trace=jsonb_populate_record(NULL::public.hato_correcciones,NEW.receipt->'correction');
 IF to_jsonb(trace) IS DISTINCT FROM NEW.receipt->'correction' OR trace.tabla<>'hato_eventos' OR trace.fila_id IS DISTINCT FROM request.event_id OR trace.operacion<>'delete' OR trace.datos_anteriores IS DISTINCT FROM request.original->'event' OR trace.datos_nuevos IS NOT NULL OR trace.corregido_por IS DISTINCT FROM actor OR trace.corregido_en IS DISTINCT FROM now() OR trace.animal_id IS DISTINCT FROM(request.original->'event'->>'animal_id')::uuid OR trace.motivo IS NOT NULL THEN RAISE EXCEPTION 'Exact nested coupled correction required';END IF;
 INSERT INTO public.hato_correcciones SELECT trace.* RETURNING * INTO written;IF NOT FOUND OR to_jsonb(written) IS DISTINCT FROM to_jsonb(trace) THEN RAISE EXCEPTION 'Coupled trusted correction suppressed/mutated';END IF;RETURN NEW;
END $$;
CREATE TRIGGER trusted_correction AFTER INSERT ON hato_quick_undo.audit FOR EACH ROW EXECUTE FUNCTION hato_quick_undo.write_trace();
CREATE FUNCTION public.fn_hato_quick_undo(p_action text,p_sender bigint,p_chat_id bigint,p_message_id bigint,p_event_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;profile uuid;r hato_quick_undo.requests;expected hato_quick_undo.requests;before_source jsonb;expected_source jsonb;before_inventory jsonb;expected_inventory jsonb;before_creation jsonb;before_finance jsonb;expected_graph jsonb;actual jsonb;original jsonb;event jsonb;usage jsonb;deleted jsonb;corrections jsonb;trace public.hato_correcciones;new_receipt jsonb;audit hato_quick_undo.audit;written_audit hato_quick_undo.audit;key uuid;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve') OR (p_action<>'prepare' AND p_event_id IS NOT NULL) OR auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Trusted native coupled undo action required';END IF;
 profile=hato_undo.authorize(p_sender);actor=hato_quick_telegram.actor(p_sender,p_chat_id,p_message_id);
 IF actor->>'profileId' IS DISTINCT FROM profile::text THEN RAISE EXCEPTION 'Fresh linked Gerencia required';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-quick-undo:'||p_sender::text||':'||p_chat_id::text||':'||p_message_id::text,0));
 SELECT * INTO r FROM hato_quick_undo.requests WHERE sender=p_sender AND chat_id=p_chat_id AND message_id=p_message_id FOR UPDATE;key=r.request_key;
 IF FOUND AND r.actor IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Original coupled undo actor changed' USING ERRCODE='42501';END IF;
 IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_quick_undo.audit a WHERE a.request_key=key AND a.receipt=r.receipt) THEN RAISE EXCEPTION 'Original coupled undo audit missing';END IF;
 IF p_action='status' THEN IF key IS NULL THEN r.actor=actor;r.sender=p_sender;r.chat_id=p_chat_id;r.message_id=p_message_id;r.state='unknown';END IF;RETURN hato_quick_undo.result(r);END IF;
 PERFORM hato_sale.lock_source();LOCK TABLE public.hato_toros,public.hato_pajillas,public.hato_pajillas_uso IN SHARE ROW EXCLUSIVE MODE;LOCK TABLE public.v_hato_pajillas_stock IN SHARE MODE;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid IN('public.hato_eventos'::regclass,'public.hato_pajillas_uso'::regclass)) THEN RAISE EXCEPTION 'Unreviewed coupled undo incoming FK boundary';END IF;
 PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
 before_finance=hato_sale.finance();before_source=alert_cron.source();expected_source=before_source;before_inventory=hato_pajilla_use.inventory();expected_inventory=before_inventory;
 before_creation=jsonb_build_object('requests',(SELECT jsonb_agg(to_jsonb(x) ORDER BY request_key) FROM hato_quick_telegram.requests x),'audit',(SELECT jsonb_agg(to_jsonb(x) ORDER BY request_key) FROM hato_quick_telegram.audit x));
 IF p_action='prepare' THEN
  IF key IS NOT NULL THEN IF r.event_id IS NOT NULL AND r.event_id IS DISTINCT FROM p_event_id THEN RAISE EXCEPTION 'Original coupled undo target changed';END IF;RETURN hato_quick_undo.result(r);END IF;
  IF p_event_id IS NULL THEN RAISE EXCEPTION 'Original event required';END IF;
  IF EXISTS(SELECT 1 FROM hato_quick_undo.requests x WHERE event_id=p_event_id AND state IN('pending','committed')) THEN RAISE EXCEPTION 'Recover original protected undo action; no replacement';END IF;
  original=hato_quick_undo.provenance(p_event_id);
  key=gen_random_uuid();r.request_key=key;r.actor=actor;r.sender=p_sender;r.chat_id=p_chat_id;r.message_id=p_message_id;r.event_id=p_event_id;r.original=original;r.effective_date=(now() AT TIME ZONE 'America/Bogota')::date;r.state='pending';expected=r;
  INSERT INTO hato_quick_undo.requests SELECT expected.* RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Coupled undo reservation suppressed/mutated';END IF;
 ELSIF p_action='resolve' THEN
  IF key IS NULL THEN key=gen_random_uuid();r.request_key=key;r.actor=actor;r.sender=p_sender;r.chat_id=p_chat_id;r.message_id=p_message_id;r.state='canceled';expected=r;INSERT INTO hato_quick_undo.requests SELECT expected.* RETURNING * INTO r;
  ELSIF r.state='pending' THEN expected=r;expected.state='canceled';UPDATE hato_quick_undo.requests SET state='canceled' WHERE request_key=key RETURNING * INTO r;
  ELSE RETURN hato_quick_undo.result(r);END IF;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Coupled undo cancellation suppressed/mutated';END IF;
 ELSE
  IF key IS NULL THEN RAISE EXCEPTION 'Original prepared coupled undo required';END IF;
  IF r.state='committed' THEN RETURN hato_quick_undo.result(r);ELSIF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled coupled undo cannot post';END IF;
  original=r.original;
  IF r.effective_date IS DISTINCT FROM(now() AT TIME ZONE 'America/Bogota')::date OR hato_quick_undo.provenance(r.event_id) IS DISTINCT FROM original THEN RAISE EXCEPTION 'Original coupled undo source changed or day elapsed';END IF;
  event=original->'event';usage=original->'usage';corrections=before_source->'domain'->'corrections';
  DELETE FROM public.hato_eventos WHERE id=r.event_id RETURNING to_jsonb(hato_eventos) INTO deleted;IF NOT FOUND OR deleted IS DISTINCT FROM event THEN RAISE EXCEPTION 'Coupled event delete suppressed/mutated';END IF;
  DELETE FROM public.hato_pajillas_uso WHERE id=(usage->>'id')::uuid RETURNING to_jsonb(hato_pajillas_uso) INTO deleted;IF NOT FOUND OR deleted IS DISTINCT FROM usage THEN RAISE EXCEPTION 'Coupled usage delete suppressed/mutated';END IF;
  -- Genuine Telegram profile belongs in the trusted trace; never fabricate an Auth UID.
  trace=jsonb_populate_record(NULL::public.hato_correcciones,jsonb_build_object('id',gen_random_uuid(),'tabla','hato_eventos','fila_id',r.event_id,'operacion','delete','datos_anteriores',event,'datos_nuevos',NULL,'animal_id',(event->>'animal_id')::uuid,'corregido_por',profile,'corregido_en',now(),'motivo',NULL));
  expected_source=jsonb_set(expected_source,'{domain,events}',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM jsonb_array_elements(expected_source->'domain'->'events')x WHERE x->>'id'<>r.event_id::text));
  expected_source=jsonb_set(expected_source,'{domain,corrections}',(SELECT jsonb_agg(x ORDER BY x->>'id') FROM jsonb_array_elements(corrections||jsonb_build_array(to_jsonb(trace)))x));
  expected_source=jsonb_set(expected_source,'{animalsView}',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY animal_id),'[]') FROM public.v_hato_estado_actual x));
  expected_inventory=jsonb_set(expected_inventory,'{uses}',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM jsonb_array_elements(before_inventory->'uses')x WHERE x->>'id'<>usage->>'id'));
  expected_graph=jsonb_set(original->'snapshot'->'graph','{events}',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM jsonb_array_elements(original->'snapshot'->'graph'->'events')x WHERE x->>'id'<>r.event_id::text));
  actual=hato_death.snapshot((event->>'animal_id')::uuid);IF actual IS DISTINCT FROM expected_graph THEN RAISE EXCEPTION 'Coupled final clinical graph mismatch';END IF;
  new_receipt=jsonb_build_object('version',1,'requestKey',key,'actor',actor,'action',jsonb_build_object('sender',p_sender,'chatId',p_chat_id,'messageId',p_message_id),'eventId',r.event_id,'original',original,'effectiveDate',r.effective_date,'recordedAt',now(),'after',jsonb_build_object('event',NULL,'usage',NULL,'graph',actual,'inventory',expected_inventory),'correction',to_jsonb(trace));
  audit.request_key=key;audit.receipt=new_receipt;INSERT INTO hato_quick_undo.audit SELECT audit.* RETURNING * INTO written_audit;IF NOT FOUND OR to_jsonb(written_audit) IS DISTINCT FROM to_jsonb(audit) THEN RAISE EXCEPTION 'Coupled operation audit suppressed/mutated';END IF;
  expected=r;expected.state='committed';expected.receipt=new_receipt;UPDATE hato_quick_undo.requests SET state='committed',receipt=new_receipt WHERE request_key=key RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Coupled undo control suppressed/mutated';END IF;
 END IF;
 IF hato_undo.authorize(p_sender) IS DISTINCT FROM profile OR hato_quick_telegram.actor(p_sender,p_chat_id,p_message_id) IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Coupled final authority changed';END IF;
 IF alert_cron.source() IS DISTINCT FROM expected_source OR hato_pajilla_use.inventory() IS DISTINCT FROM expected_inventory THEN RAISE EXCEPTION 'Coupled final source/inventory mismatch';END IF;
 IF hato_sale.finance() IS DISTINCT FROM before_finance THEN RAISE EXCEPTION 'Coupled financial preservation mismatch';END IF;
 IF before_creation IS DISTINCT FROM jsonb_build_object('requests',(SELECT jsonb_agg(to_jsonb(x) ORDER BY request_key) FROM hato_quick_telegram.requests x),'audit',(SELECT jsonb_agg(to_jsonb(x) ORDER BY request_key) FROM hato_quick_telegram.audit x)) THEN RAISE EXCEPTION 'Original creation proof changed';END IF;
 SELECT * INTO r FROM hato_quick_undo.requests WHERE request_key=key;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Coupled final control readback mismatch';END IF;
 IF r.state='committed' AND (NOT EXISTS(SELECT 1 FROM hato_quick_undo.audit a WHERE a.request_key=key AND a.receipt=r.receipt) OR NOT EXISTS(SELECT 1 FROM public.hato_correcciones x WHERE id=trace.id AND to_jsonb(x)=to_jsonb(trace)) OR hato_death.snapshot((event->>'animal_id')::uuid) IS DISTINCT FROM r.receipt->'after'->'graph') THEN RAISE EXCEPTION 'Coupled final audit/trace mismatch';END IF;
 RETURN hato_quick_undo.result(r);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_quick_undo FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_quick_undo(text,bigint,bigint,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_quick_undo(text,bigint,bigint,bigint,uuid) TO service_role;
COMMIT;
