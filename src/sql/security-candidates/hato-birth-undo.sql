-- NONNUMBERED protected Telegram retained birth/intact-calf undo foundation after33candidates.
-- Offline only. Actual caller and browser cycle/other coupled lifecycle remain separate.
BEGIN;
SELECT alert_cron.lock_source();
DO $admission$ DECLARE fingerprint text;BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed birth undo installation owner required';END IF;
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
 IF fingerprint IS DISTINCT FROM '5ae11977b7a8e2f574bd41bb07f76ddc' THEN RAISE EXCEPTION 'Unreviewed birth undo source graph';END IF;
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
 IF fingerprint IS DISTINCT FROM 'e0e432ae1b0ae23408509079dde7921c' THEN RAISE EXCEPTION 'Unreviewed birth undo inventory graph %',fingerprint;END IF;
 PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_death.snapshot(uuid)') AND md5(p.prosrc)='a6bf1457f7ab6b1adf5cae9c9c78d308' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') OR EXISTS(SELECT 1 FROM (VALUES('anon'),('authenticated'),('service_role'))v(role) WHERE has_function_privilege(v.role,'hato_death.snapshot(uuid)','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed birth undo snapshot helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_treatment_creation.web_actor()') AND md5(p.prosrc)='1d8ec54936d4f658da49a965b828224c' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed birth undo actor helper';END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid IN('public.hato_eventos'::regclass,'public.hato_pajillas_uso'::regclass)) THEN RAISE EXCEPTION 'Unreviewed incoming event FK boundary';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_pajilla_use.inventory()') AND md5(p.prosrc)='56e38e19c11fe0f46810e1a578778ce8' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed birth undo inventory helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_quick_telegram.actor(bigint,bigint,bigint)') AND md5(p.prosrc)='4ac2d6408c68abb39954ba8168ab1065' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))g(role) WHERE has_function_privilege(g.role,'hato_quick_telegram.actor(bigint,bigint,bigint)','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed birth undo actor helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_quick_telegram.snapshot(uuid)') AND md5(p.prosrc)='cd740e9d054bbd2f2b480260acb24a96' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))g(role) WHERE has_function_privilege(g.role,'hato_quick_telegram.snapshot(uuid)','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed birth undo snapshot helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('hato_undo.authorize(bigint)') AND md5(p.prosrc)='1188bde9748558e694915fe5de80a0df' AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(p.proowner)='postgres') OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))g(role) WHERE has_function_privilege(g.role,'hato_undo.authorize(bigint)','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed birth undo authorize helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_sale.lock_source()') AND md5(prosrc)='35bd07189be4bbf2dc0c964109c064bf' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed coupled financial lock_source helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_sale.finance()') AND md5(prosrc)='faaf8458321604398f8f75a1cdb398af' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed coupled financial finance helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_birth_telegram.actor(bigint,bigint,bigint)') AND md5(prosrc)='4ac2d6408c68abb39954ba8168ab1065' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed birth undo actor helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_birth_telegram.snapshot(uuid)') AND md5(prosrc)='c287addaca05fd22158c95f3af10d46a' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed birth undo snapshot helper';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('hato_birth_telegram.immutable()') AND md5(prosrc)='fb884bc3bd480db07a5f5cab921f8565' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed birth undo immutable helper';END IF;
END $admission$;
CREATE OR REPLACE FUNCTION hato_birth_telegram.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' THEN RAISE EXCEPTION 'Immutable original birth proof';END IF;IF OLD.state<>'pending' OR NEW.state NOT IN('committed','canceled') OR (to_jsonb(NEW)-'state'-'receipt') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'receipt') THEN RAISE EXCEPTION 'Immutable original birth proof';END IF;RETURN NEW;END $$;
CREATE SCHEMA hato_birth_undo;
REVOKE ALL ON SCHEMA hato_birth_undo FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE hato_birth_undo.requests(request_key uuid PRIMARY KEY,actor jsonb NOT NULL,sender bigint NOT NULL,chat_id bigint NOT NULL,message_id bigint NOT NULL,UNIQUE(sender,chat_id,message_id),CHECK(sender>0 AND chat_id=sender AND message_id>0),event_id uuid,original jsonb,effective_date date,state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR event_id IS NOT NULL AND original IS NOT NULL AND effective_date IS NOT NULL));
CREATE TABLE hato_birth_undo.audit(request_key uuid PRIMARY KEY REFERENCES hato_birth_undo.requests(request_key),receipt jsonb NOT NULL);
ALTER TABLE hato_birth_undo.requests ENABLE ROW LEVEL SECURITY;ALTER TABLE hato_birth_undo.audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA hato_birth_undo FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_birth_undo.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN IF TG_OP IN('DELETE','TRUNCATE') OR TG_TABLE_NAME='audit' THEN RAISE EXCEPTION 'Immutable birth undo proof';END IF;
 IF OLD.state<>'pending' OR NEW.state NOT IN('committed','canceled') OR(to_jsonb(NEW)-'state'-'receipt') IS DISTINCT FROM(to_jsonb(OLD)-'state'-'receipt') THEN RAISE EXCEPTION 'Immutable birth undo proof';END IF;RETURN NEW;END $$;
CREATE TRIGGER immutable_request BEFORE UPDATE OR DELETE ON hato_birth_undo.requests FOR EACH ROW EXECUTE FUNCTION hato_birth_undo.immutable();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON hato_birth_undo.audit FOR EACH ROW EXECUTE FUNCTION hato_birth_undo.immutable();
CREATE TRIGGER no_truncate_request BEFORE TRUNCATE ON hato_birth_undo.requests FOR EACH STATEMENT EXECUTE FUNCTION hato_birth_undo.immutable();
CREATE TRIGGER no_truncate_audit BEFORE TRUNCATE ON hato_birth_undo.audit FOR EACH STATEMENT EXECUTE FUNCTION hato_birth_undo.immutable();
-- Same explicit telemetry identity-table exclusion as the verified schema replay.
-- No animal/event FK exists there; telemetry identity generation is not certified.
CREATE FUNCTION hato_birth_undo.assert_registry() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE actual text;
BEGIN
 SELECT md5(string_agg(n.nspname||'.'||c.relname||'|'||c.relkind::text,E'\n' ORDER BY n.nspname||'.'||c.relname||'|'||c.relkind::text)) INTO actual FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','respaldos') AND c.relkind IN('r','p') AND NOT(n.nspname='public' AND c.relname='clima_lecturas');
 IF actual IS DISTINCT FROM '411d60d55170b23e40420df77e02015c' THEN RAISE EXCEPTION 'Unreviewed birth undo domain inventory';END IF;
 SELECT md5(string_agg(n.nspname||'.'||t.relname||'|'||c.conname||'|'||replace(pg_get_constraintdef(c.oid),'public.','')||'|'||CASE WHEN c.convalidated THEN '1' ELSE '0' END||'|'||CASE WHEN c.condeferrable THEN '1' ELSE '0' END||'|'||CASE WHEN c.condeferred THEN '1' ELSE '0' END,E'\n' ORDER BY n.nspname||'.'||t.relname||'|'||c.conname)) INTO actual FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE c.contype='f' AND c.confrelid IN('public.hato_animales'::regclass,'public.hato_eventos'::regclass);
 IF actual IS DISTINCT FROM '31bb00c7059ac9189af82b7871066018' THEN RAISE EXCEPTION 'Unreviewed birth undo incoming FK inventory';END IF;
END $$;
CREATE FUNCTION hato_birth_undo.lock_domain() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t record;
BEGIN PERFORM hato_birth_undo.assert_registry();PERFORM hato_sale.lock_source();FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','respaldos') AND c.relkind IN('r','p') AND NOT(n.nspname='public' AND c.relname='clima_lecturas') ORDER BY n.nspname,c.relname LOOP EXECUTE format('LOCK TABLE %I.%I IN SHARE ROW EXCLUSIVE MODE',t.nspname,t.relname);END LOOP;END $$;
CREATE FUNCTION hato_birth_undo.capture_domain() RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t record;rows jsonb;result jsonb='{}';
BEGIN PERFORM hato_birth_undo.assert_registry();FOR t IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','respaldos') AND c.relkind IN('r','p') AND NOT(n.nspname='public' AND c.relname='clima_lecturas') ORDER BY n.nspname,c.relname LOOP EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),''[]'') FROM %I.%I x',t.nspname,t.relname) INTO rows;result=result||jsonb_build_object(t.nspname||'.'||t.relname,rows);END LOOP;RETURN result;END $$;
CREATE FUNCTION hato_birth_undo.assert_unreferenced(calf uuid,event uuid,domain jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE t text;rows jsonb;row_json jsonb;
BEGIN FOR t,rows IN SELECT key,value FROM jsonb_each(domain) LOOP FOR row_json IN SELECT value FROM jsonb_array_elements(rows) LOOP
 IF(t='public.hato_animales' AND row_json->>'id'=calf::text) OR(t='public.hato_eventos' AND row_json->>'id'=event::text) THEN CONTINUE;END IF;
 IF position(calf::text in lower(row_json::text))>0 OR position(replace(calf::text,'-','') in lower(row_json::text))>0 OR position(event::text in lower(row_json::text))>0 OR position(replace(event::text,'-','') in lower(row_json::text))>0 THEN RAISE EXCEPTION 'Referenced calf/history must be preserved: %',t;END IF;
 END LOOP;END LOOP;END $$;
SELECT hato_birth_undo.assert_registry();
CREATE FUNCTION hato_birth_undo.result(r hato_birth_undo.requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'actor',r.actor,'action',jsonb_build_object('sender',r.sender,'chatId',r.chat_id,'messageId',r.message_id),'eventId',r.event_id,'original',r.original,'effectiveDate',r.effective_date,'state',r.state,'receipt',r.receipt);
$$;
CREATE FUNCTION hato_birth_undo.provenance(target uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE q hato_birth_telegram.requests;creation_receipt jsonb;event jsonb;calf jsonb;snapshot jsonb;matches integer;
BEGIN
 SELECT count(*) INTO matches FROM hato_birth_telegram.requests r WHERE r.state='committed' AND r.plan->'events' @>jsonb_build_array(jsonb_build_object('id',target));
 IF matches<>1 THEN RAISE EXCEPTION 'Unique protected retained birth provenance required';END IF;
 SELECT * INTO STRICT q FROM hato_birth_telegram.requests r WHERE r.state='committed' AND r.plan->'events' @>jsonb_build_array(jsonb_build_object('id',target));creation_receipt=q.receipt;
 IF NOT EXISTS(SELECT 1 FROM hato_birth_telegram.audit a WHERE a.request_key=q.request_key AND a.receipt=creation_receipt) OR q.intent->>'criaDestino' IS DISTINCT FROM 'retenida' OR jsonb_array_length(q.plan->'events')<>1 OR jsonb_typeof(creation_receipt->'calf') IS DISTINCT FROM 'object' OR creation_receipt->'plan' IS DISTINCT FROM q.plan OR creation_receipt->'original' IS DISTINCT FROM q.original OR creation_receipt->'intent' IS DISTINCT FROM q.intent OR creation_receipt->>'requestKey' IS DISTINCT FROM q.request_key::text OR creation_receipt->'actor' IS DISTINCT FROM q.actor THEN RAISE EXCEPTION 'Exact protected retained birth audit required';END IF;
 SELECT to_jsonb(e) INTO event FROM public.hato_eventos e WHERE id=target;SELECT to_jsonb(a) INTO calf FROM public.hato_animales a WHERE id=(creation_receipt->'calf'->>'id')::uuid;
 IF event IS DISTINCT FROM((q.plan->'events'->0)||jsonb_build_object('created_at',creation_receipt->'recordedAt')) OR calf IS DISTINCT FROM creation_receipt->'calf' OR calf IS DISTINCT FROM((q.plan->'calf')||jsonb_build_object('created_at',creation_receipt->'recordedAt')) OR event->>'tipo' IS DISTINCT FROM 'parto' OR event->>'cria_destino' IS DISTINCT FROM 'retenida' OR event->>'fuente' IS DISTINCT FROM 'telegram' OR event->>'cria_id' IS DISTINCT FROM calf->>'id' OR event->>'animal_id' IS DISTINCT FROM calf->>'madre_id' OR calf->>'nombre' IS DISTINCT FROM 'SIN NOMBRE' OR calf->>'estado' IS DISTINCT FROM 'activa' OR calf->'import_meta'->>'origen' IS DISTINCT FROM 'parto_automatico' OR event->>'fin_ingreso_id' IS NOT NULL OR event->>'transaccion_ganado_id' IS NOT NULL OR event->>'alerta_id' IS NOT NULL OR event->>'chequeo_vaca_id' IS NOT NULL THEN RAISE EXCEPTION 'Original retained event/calf changed or unavailable';END IF;
 snapshot=hato_birth_telegram.snapshot((event->>'animal_id')::uuid);
 IF snapshot->'graph' IS DISTINCT FROM creation_receipt->'after' OR snapshot->'graph'->'animal'->>'estado' IS DISTINCT FROM 'activa' THEN RAISE EXCEPTION 'Mother clinical graph changed since protected birth';END IF;
 RETURN jsonb_build_object('creation',hato_birth_telegram.result(q),'snapshot',snapshot,'event',event,'calf',calf);
END $$;
CREATE FUNCTION hato_birth_undo.write_traces() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE request hato_birth_undo.requests;actor uuid;x jsonb;expected_old jsonb;trace public.hato_correcciones;written public.hato_correcciones;ids uuid[]='{}';tables text[]='{}';
BEGIN SELECT * INTO STRICT request FROM hato_birth_undo.requests WHERE request_key=NEW.request_key;actor=hato_undo.authorize(request.sender);
 IF current_user<>'postgres' OR auth.uid() IS NOT NULL OR request.state<>'pending' OR NEW.receipt->'actor' IS DISTINCT FROM request.actor OR request.actor->>'profileId' IS DISTINCT FROM actor::text OR NEW.receipt->'original' IS DISTINCT FROM request.original OR NEW.receipt->>'requestKey' IS DISTINCT FROM request.request_key::text OR EXISTS(SELECT 1 FROM public.hato_eventos WHERE id=request.event_id) OR EXISTS(SELECT 1 FROM public.hato_animales WHERE id=(request.original->'calf'->>'id')::uuid) OR jsonb_array_length(NEW.receipt->'corrections')<>2 THEN RAISE EXCEPTION 'Trusted retained-birth correction context required';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(NEW.receipt->'corrections') LOOP trace=jsonb_populate_record(NULL::public.hato_correcciones,x);expected_old=CASE WHEN trace.tabla='hato_eventos' THEN request.original->'event' WHEN trace.tabla='hato_animales' THEN request.original->'calf' ELSE NULL END;
 IF expected_old IS NULL OR to_jsonb(trace) IS DISTINCT FROM x OR trace.id=ANY(ids) OR trace.tabla=ANY(tables) OR trace.fila_id IS DISTINCT FROM(expected_old->>'id')::uuid OR trace.operacion<>'delete' OR trace.datos_anteriores IS DISTINCT FROM expected_old OR trace.datos_nuevos IS NOT NULL OR trace.corregido_por IS DISTINCT FROM actor OR trace.corregido_en IS DISTINCT FROM now() OR trace.animal_id IS DISTINCT FROM(CASE WHEN trace.tabla='hato_eventos' THEN request.original->'event'->>'animal_id' ELSE request.original->'calf'->>'id' END)::uuid OR trace.motivo IS NOT NULL THEN RAISE EXCEPTION 'Exact retained-birth correction trace required';END IF;
 ids=array_append(ids,trace.id);tables=array_append(tables,trace.tabla);INSERT INTO public.hato_correcciones SELECT trace.* RETURNING * INTO written;IF NOT FOUND OR to_jsonb(written) IS DISTINCT FROM x THEN RAISE EXCEPTION 'Retained-birth trace suppressed/mutated';END IF;
 END LOOP;RETURN NEW;
END $$;
CREATE TRIGGER trusted_corrections AFTER INSERT ON hato_birth_undo.audit FOR EACH ROW EXECUTE FUNCTION hato_birth_undo.write_traces();
CREATE FUNCTION public.fn_hato_birth_undo(p_action text,p_sender bigint,p_chat_id bigint,p_message_id bigint,p_event_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;profile uuid;r hato_birth_undo.requests;expected hato_birth_undo.requests;before_domain jsonb;expected_domain jsonb;before_creation jsonb;expected_graph jsonb;actual jsonb;original jsonb;event jsonb;calf jsonb;deleted jsonb;traces jsonb='[]';trace public.hato_correcciones;old_row jsonb;kind text;receipt_value jsonb;audit hato_birth_undo.audit;written_audit hato_birth_undo.audit;key uuid;
BEGIN
 IF p_action IS NULL OR p_action NOT IN('prepare','post','status','resolve') OR (p_action<>'prepare' AND p_event_id IS NOT NULL) OR auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'Trusted native coupled undo action required';END IF;
 profile=hato_undo.authorize(p_sender);actor=hato_birth_telegram.actor(p_sender,p_chat_id,p_message_id);
 IF actor->>'profileId' IS DISTINCT FROM profile::text THEN RAISE EXCEPTION 'Fresh linked Gerencia required';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('hato-birth-undo:'||p_sender::text||':'||p_chat_id::text||':'||p_message_id::text,0));
 SELECT * INTO r FROM hato_birth_undo.requests WHERE sender=p_sender AND chat_id=p_chat_id AND message_id=p_message_id FOR UPDATE;key=r.request_key;
 IF FOUND AND r.actor IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Original coupled undo actor changed' USING ERRCODE='42501';END IF;
 IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM hato_birth_undo.audit a WHERE a.request_key=key AND a.receipt=r.receipt) THEN RAISE EXCEPTION 'Original coupled undo audit missing';END IF;
 IF p_action='status' THEN IF key IS NULL THEN r.actor=actor;r.sender=p_sender;r.chat_id=p_chat_id;r.message_id=p_message_id;r.state='unknown';END IF;RETURN hato_birth_undo.result(r);END IF;
 PERFORM hato_birth_undo.lock_domain();PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
 before_domain=hato_birth_undo.capture_domain();expected_domain=before_domain;
 before_creation=jsonb_build_object('requests',(SELECT jsonb_agg(to_jsonb(x) ORDER BY request_key) FROM hato_birth_telegram.requests x),'audit',(SELECT jsonb_agg(to_jsonb(x) ORDER BY request_key) FROM hato_birth_telegram.audit x));
 IF p_action='prepare' THEN
  IF key IS NOT NULL THEN IF r.event_id IS NOT NULL AND r.event_id IS DISTINCT FROM p_event_id THEN RAISE EXCEPTION 'Original coupled undo target changed';END IF;RETURN hato_birth_undo.result(r);END IF;
  IF p_event_id IS NULL THEN RAISE EXCEPTION 'Original event required';END IF;
  IF EXISTS(SELECT 1 FROM hato_birth_undo.requests x WHERE event_id=p_event_id AND state IN('pending','committed')) THEN RAISE EXCEPTION 'Recover original protected undo action; no replacement';END IF;
  original=hato_birth_undo.provenance(p_event_id);PERFORM hato_birth_undo.assert_unreferenced((original->'calf'->>'id')::uuid,p_event_id,before_domain);
  key=gen_random_uuid();r.request_key=key;r.actor=actor;r.sender=p_sender;r.chat_id=p_chat_id;r.message_id=p_message_id;r.event_id=p_event_id;r.original=original;r.effective_date=(now() AT TIME ZONE 'America/Bogota')::date;r.state='pending';expected=r;
  INSERT INTO hato_birth_undo.requests SELECT expected.* RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Coupled undo reservation suppressed/mutated';END IF;
 ELSIF p_action='resolve' THEN
  IF key IS NULL THEN key=gen_random_uuid();r.request_key=key;r.actor=actor;r.sender=p_sender;r.chat_id=p_chat_id;r.message_id=p_message_id;r.state='canceled';expected=r;INSERT INTO hato_birth_undo.requests SELECT expected.* RETURNING * INTO r;
  ELSIF r.state='pending' THEN expected=r;expected.state='canceled';UPDATE hato_birth_undo.requests SET state='canceled' WHERE request_key=key RETURNING * INTO r;
  ELSE RETURN hato_birth_undo.result(r);END IF;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Coupled undo cancellation suppressed/mutated';END IF;
 ELSE
  IF key IS NULL THEN RAISE EXCEPTION 'Original prepared coupled undo required';END IF;
  IF r.state='committed' THEN RETURN hato_birth_undo.result(r);ELSIF r.state<>'pending' THEN RAISE EXCEPTION 'Canceled coupled undo cannot post';END IF;
  original=r.original;
  IF r.effective_date IS DISTINCT FROM(now() AT TIME ZONE 'America/Bogota')::date OR hato_birth_undo.provenance(r.event_id) IS DISTINCT FROM original THEN RAISE EXCEPTION 'Original coupled undo source changed or day elapsed';END IF;
  event=original->'event';calf=original->'calf';PERFORM hato_birth_undo.assert_unreferenced((calf->>'id')::uuid,r.event_id,before_domain);
  DELETE FROM public.hato_eventos WHERE id=r.event_id RETURNING to_jsonb(hato_eventos) INTO deleted;IF NOT FOUND OR deleted IS DISTINCT FROM event THEN RAISE EXCEPTION 'Retained birth event delete suppressed/mutated';END IF;
  DELETE FROM public.hato_animales WHERE id=(calf->>'id')::uuid RETURNING to_jsonb(hato_animales) INTO deleted;IF NOT FOUND OR deleted IS DISTINCT FROM calf THEN RAISE EXCEPTION 'Retained calf delete suppressed/mutated';END IF;
  FOREACH kind IN ARRAY ARRAY['hato_eventos','hato_animales'] LOOP old_row=CASE WHEN kind='hato_eventos' THEN event ELSE calf END;
   trace=jsonb_populate_record(NULL::public.hato_correcciones,jsonb_build_object('id',gen_random_uuid(),'tabla',kind,'fila_id',(old_row->>'id')::uuid,'operacion','delete','datos_anteriores',old_row,'datos_nuevos',NULL,'animal_id',CASE WHEN kind='hato_eventos' THEN(event->>'animal_id')::uuid ELSE(calf->>'id')::uuid END,'corregido_por',profile,'corregido_en',now(),'motivo',NULL));traces=traces||jsonb_build_array(to_jsonb(trace));
  END LOOP;
  expected_domain=jsonb_set(expected_domain,ARRAY['public.hato_eventos'],(SELECT coalesce(jsonb_agg(x ORDER BY x::text),'[]') FROM jsonb_array_elements(expected_domain->'public.hato_eventos')x WHERE x->>'id'<>r.event_id::text));
  expected_domain=jsonb_set(expected_domain,ARRAY['public.hato_animales'],(SELECT coalesce(jsonb_agg(x ORDER BY x::text),'[]') FROM jsonb_array_elements(expected_domain->'public.hato_animales')x WHERE x->>'id'<>calf->>'id'));
  expected_domain=jsonb_set(expected_domain,ARRAY['public.hato_correcciones'],(SELECT jsonb_agg(x ORDER BY x::text) FROM jsonb_array_elements((expected_domain->'public.hato_correcciones')||traces)x));
  expected_graph=jsonb_set(original->'snapshot'->'graph','{events}',(SELECT coalesce(jsonb_agg(x ORDER BY x->>'id'),'[]') FROM jsonb_array_elements(original->'snapshot'->'graph'->'events')x WHERE x->>'id'<>r.event_id::text));
  actual=hato_death.snapshot((event->>'animal_id')::uuid);IF actual IS DISTINCT FROM expected_graph THEN RAISE EXCEPTION 'Retained birth final mother graph mismatch';END IF;
  receipt_value=jsonb_build_object('version',1,'requestKey',key,'actor',actor,'action',jsonb_build_object('sender',p_sender,'chatId',p_chat_id,'messageId',p_message_id),'eventId',r.event_id,'original',original,'effectiveDate',r.effective_date,'recordedAt',now(),'after',jsonb_build_object('event',NULL,'calf',NULL,'graph',actual,'animals',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM public.hato_animales x)),'corrections',traces,'footprints',jsonb_build_object('before',encode(sha256(convert_to(before_domain::text,'UTF8')),'hex'),'after',encode(sha256(convert_to(expected_domain::text,'UTF8')),'hex')));
  audit.request_key=key;audit.receipt=receipt_value;INSERT INTO hato_birth_undo.audit SELECT audit.* RETURNING * INTO written_audit;IF NOT FOUND OR to_jsonb(written_audit) IS DISTINCT FROM to_jsonb(audit) THEN RAISE EXCEPTION 'Retained birth operation audit suppressed/mutated';END IF;
  expected=r;expected.state='committed';expected.receipt=receipt_value;UPDATE hato_birth_undo.requests SET state='committed',receipt=receipt_value WHERE request_key=key RETURNING * INTO r;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Coupled undo control suppressed/mutated';END IF;
 END IF;
 IF hato_undo.authorize(p_sender) IS DISTINCT FROM profile OR hato_birth_telegram.actor(p_sender,p_chat_id,p_message_id) IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Coupled final authority changed';END IF;
 IF hato_birth_undo.capture_domain() IS DISTINCT FROM expected_domain THEN RAISE EXCEPTION 'Retained birth final whole-domain mismatch';END IF;
 IF before_creation IS DISTINCT FROM jsonb_build_object('requests',(SELECT jsonb_agg(to_jsonb(x) ORDER BY request_key) FROM hato_birth_telegram.requests x),'audit',(SELECT jsonb_agg(to_jsonb(x) ORDER BY request_key) FROM hato_birth_telegram.audit x)) THEN RAISE EXCEPTION 'Original creation proof changed';END IF;
 SELECT * INTO r FROM hato_birth_undo.requests WHERE request_key=key;IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Coupled final control readback mismatch';END IF;
 IF r.state='committed' AND (NOT EXISTS(SELECT 1 FROM hato_birth_undo.audit a WHERE a.request_key=key AND a.receipt=r.receipt) OR EXISTS(SELECT 1 FROM jsonb_array_elements(traces)t WHERE NOT EXISTS(SELECT 1 FROM public.hato_correcciones x WHERE id=(t->>'id')::uuid AND to_jsonb(x)=t)) OR hato_death.snapshot((event->>'animal_id')::uuid) IS DISTINCT FROM r.receipt->'after'->'graph') THEN RAISE EXCEPTION 'Retained birth final audit/trace mismatch';END IF;
 RETURN hato_birth_undo.result(r);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hato_birth_undo FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_hato_birth_undo(text,bigint,bigint,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_birth_undo(text,bigint,bigint,bigint,uuid) TO service_role;
COMMIT;
