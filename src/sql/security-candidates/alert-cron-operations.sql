-- NONNUMBERED operator recovery/monitoring after21 candidates. Offline only.
BEGIN;
SELECT alert_cron.lock_source();
DO $admission$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed operator installation owner required';END IF;
 IF (SELECT md5(jsonb_build_object('namespace',(SELECT jsonb_build_object('owner',pg_get_userbyid(n.nspowner),'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type) FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner)))x)) FROM pg_namespace n WHERE n.nspname='alert_cron'),'relations',(SELECT md5(jsonb_agg(jsonb_build_object(
 'view',CASE WHEN c.relkind='v' THEN pg_get_viewdef(c.oid) ELSE NULL END,'table',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,
 'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))x),
 'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'collation',CASE WHEN a.attcollation=0 THEN NULL ELSE (SELECT n.nspname||'.'||co.collname FROM pg_collation co JOIN pg_namespace n ON n.oid=co.collnamespace WHERE co.oid=a.attcollation) END,'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,pg_get_userbyid(x.grantor),x.privilege_type,x.is_grantable) FROM aclexplode(a.attacl)x)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_array(x.conname,pg_get_constraintdef(x.oid),x.convalidated,x.condeferrable,x.condeferred) ORDER BY x.conname) FROM pg_constraint x WHERE x.conrelid=c.oid),
 'indexes',(SELECT jsonb_agg(jsonb_build_array(pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready,i.indislive,i.indimmediate,i.indnullsnotdistinct) ORDER BY pg_get_indexdef(i.indexrelid)) FROM pg_index i WHERE i.indrelid=c.oid),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.policyname) FROM pg_policies p WHERE p.schemaname='alert_cron' AND p.tablename=c.relname),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(pg_get_triggerdef(t.oid),t.tgenabled,t.tgtype,t.tgdeferrable,t.tginitdeferred,md5(f.prosrc),pg_get_userbyid(f.proowner),f.prosecdef,f.proconfig) ORDER BY t.tgname) FROM pg_trigger t JOIN pg_proc f ON f.oid=t.tgfoid WHERE t.tgrelid=c.oid AND NOT t.tgisinternal),
 'inherits',(SELECT count(*) FROM pg_inherits WHERE inhrelid=c.oid OR inhparent=c.oid),
 'rules',(SELECT count(*) FROM pg_rewrite WHERE ev_class=c.oid)
) ORDER BY c.relname)::text) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='alert_cron'),'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'body',md5(p.prosrc),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'acl',(SELECT jsonb_agg(jsonb_build_array(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.grantee) END,x.privilege_type,x.is_grantable) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x)) ORDER BY p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='alert_cron' OR n.nspname='public' AND p.proname LIKE 'fn_alert_cron_%'))::text)) IS DISTINCT FROM '90ef9268e1de036a9782bcaef25cf9a6' THEN RAISE EXCEPTION 'Unreviewed original cron operations graph';END IF;
 PERFORM clinical_step_confirmation.assert_retired_writers();PERFORM correction_audit_integrity.assert_boundary();
END $admission$;
CREATE TABLE alert_cron.operator_requests(
 request_key uuid PRIMARY KEY,owner_id uuid NOT NULL,intent jsonb,original jsonb,
 state text NOT NULL CHECK(state IN('pending','committed','canceled')),receipt jsonb,
 CHECK((state='committed')=(receipt IS NOT NULL)),CHECK(state='canceled' OR intent IS NOT NULL AND original IS NOT NULL));
CREATE TABLE alert_cron.operator_audit(request_key uuid PRIMARY KEY REFERENCES alert_cron.operator_requests(request_key),receipt jsonb NOT NULL);
CREATE TABLE alert_cron.replacement_links(original_id uuid PRIMARY KEY REFERENCES alert_cron.runs(id),replacement_id uuid NOT NULL UNIQUE REFERENCES alert_cron.runs(id),request_key uuid NOT NULL UNIQUE REFERENCES alert_cron.operator_requests(request_key));
ALTER TABLE alert_cron.operator_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_cron.operator_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_cron.replacement_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON alert_cron.operator_requests,alert_cron.operator_audit,alert_cron.replacement_links FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION alert_cron.operator_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='TRUNCATE' OR TG_OP='DELETE' OR TG_TABLE_NAME<>'operator_requests' OR OLD.state<>'pending' OR NEW.state NOT IN('committed','canceled') OR (to_jsonb(NEW)-'state'-'receipt') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'receipt') THEN RAISE EXCEPTION 'Immutable original operator proof';END IF;RETURN NEW;
END $$;
CREATE TRIGGER immutable_operator_request BEFORE UPDATE OR DELETE ON alert_cron.operator_requests FOR EACH ROW EXECUTE FUNCTION alert_cron.operator_immutable();
CREATE TRIGGER immutable_operator_audit BEFORE UPDATE OR DELETE ON alert_cron.operator_audit FOR EACH ROW EXECUTE FUNCTION alert_cron.operator_immutable();
CREATE TRIGGER immutable_replacement_link BEFORE UPDATE OR DELETE ON alert_cron.replacement_links FOR EACH ROW EXECUTE FUNCTION alert_cron.operator_immutable();
CREATE TRIGGER no_truncate_operator_request BEFORE TRUNCATE ON alert_cron.operator_requests FOR EACH STATEMENT EXECUTE FUNCTION alert_cron.operator_immutable();
CREATE TRIGGER no_truncate_operator_audit BEFORE TRUNCATE ON alert_cron.operator_audit FOR EACH STATEMENT EXECUTE FUNCTION alert_cron.operator_immutable();
CREATE TRIGGER no_truncate_replacement_link BEFORE TRUNCATE ON alert_cron.replacement_links FOR EACH STATEMENT EXECUTE FUNCTION alert_cron.operator_immutable();
CREATE FUNCTION alert_cron.operator_actor(p_owner uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF p_owner IS NULL OR auth.uid() IS DISTINCT FROM p_owner THEN RAISE EXCEPTION 'Original operator owner required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM public.usuarios WHERE id=p_owner AND activo IS TRUE AND rol='Gerencia' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fresh active Gerencia operator required' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('origin','web','profileId',p_owner);
END $$;
CREATE FUNCTION alert_cron.run_summary(r alert_cron.runs) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',r.id,'slot',r.slot,'actor',r.actor,'referenceAt',r.reference_at,'state',r.state,
 'revision',md5(to_jsonb(r)::text),'sourceChanged',CASE WHEN r.state='prepared' THEN r.source IS DISTINCT FROM alert_cron.source() ELSE false END,
 'generated',CASE WHEN r.state='committed' THEN jsonb_array_length(r.plan->'generate') ELSE 0 END,
 'changed',CASE WHEN r.state='committed' THEN jsonb_array_length(r.plan->'updates') ELSE 0 END,
 'replacementId',(SELECT replacement_id FROM alert_cron.replacement_links WHERE original_id=r.id));
$$;
CREATE FUNCTION alert_cron.delivery_summary(d alert_cron.deliveries) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',d.id,'runId',d.run_id,'alertId',d.alert_id,'registrationId',d.registration_id,'recipient',d.recipient,'phase',d.phase,'round',d.round,'state',d.state,'claimedAt',d.claimed_at,
 'revision',md5(jsonb_build_object('delivery',to_jsonb(d),'evidence',(SELECT to_jsonb(e) FROM alert_cron.delivery_evidence e WHERE delivery_id=d.id))::text),
 'evidence',(SELECT jsonb_build_object('kind',kind,'messageId',message_id,'recordedAt',recorded_at) FROM alert_cron.delivery_evidence WHERE delivery_id=d.id),
 'acknowledged',EXISTS(SELECT 1 FROM alert_cron.operator_requests o WHERE o.state='committed' AND o.intent->>'kind'='acknowledge_hold' AND o.intent->>'targetId'=d.id::text));
$$;
CREATE FUNCTION alert_cron.operator_snapshot(p_kind text,p_id uuid) RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE r alert_cron.runs;d alert_cron.deliveries;
BEGIN
 IF p_kind IN('cancel_run','replan_run') THEN
  SELECT * INTO r FROM alert_cron.runs WHERE alert_cron.runs.id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original job required';END IF;
  RETURN jsonb_build_object('control',to_jsonb(r),'summary',alert_cron.run_summary(r),'evidence',NULL);
 ELSIF p_kind IN('cancel_delivery','acknowledge_hold') THEN
  SELECT * INTO d FROM alert_cron.deliveries WHERE alert_cron.deliveries.id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original delivery required';END IF;
  RETURN jsonb_build_object('control',to_jsonb(d),'summary',alert_cron.delivery_summary(d),'evidence',(SELECT to_jsonb(e) FROM alert_cron.delivery_evidence e WHERE delivery_id=d.id));
 ELSE RAISE EXCEPTION 'Invalid operator action';END IF;
END $$;
CREATE FUNCTION alert_cron.operator_result(r alert_cron.operator_requests) RETURNS jsonb LANGUAGE sql SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',1,'requestKey',r.request_key,'owner',r.owner_id,'state',r.state,'intent',r.intent,'original',r.original->'snapshot'->'summary','receipt',r.receipt);
$$;
CREATE TABLE alert_cron.run_metrics(run_id uuid PRIMARY KEY REFERENCES alert_cron.runs(id),source_digest text NOT NULL,coverage jsonb NOT NULL,recorded_at timestamptz NOT NULL);
ALTER TABLE alert_cron.run_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON alert_cron.run_metrics FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable_run_metrics BEFORE UPDATE OR DELETE ON alert_cron.run_metrics FOR EACH ROW EXECUTE FUNCTION alert_cron.operator_immutable();
CREATE TRIGGER no_truncate_run_metrics BEFORE TRUNCATE ON alert_cron.run_metrics FOR EACH STATEMENT EXECUTE FUNCTION alert_cron.operator_immutable();
CREATE FUNCTION public.fn_alert_cron_record_metrics(p_run uuid,p_source jsonb,p_coverage jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r alert_cron.runs;metrics alert_cron.run_metrics;expected alert_cron.run_metrics;before_source jsonb;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted coverage executor required' USING ERRCODE='42501';END IF;
 SELECT * INTO r FROM alert_cron.runs WHERE id=p_run FOR UPDATE;
 IF NOT FOUND OR r.state<>'committed' OR r.source IS DISTINCT FROM p_source OR jsonb_typeof(p_coverage) IS DISTINCT FROM 'object' OR octet_length(p_coverage::text)>100000 THEN RAISE EXCEPTION 'Original committed coverage source required';END IF;
 PERFORM alert_cron.lock_source();before_source=alert_cron.source();
 SELECT * INTO metrics FROM alert_cron.run_metrics WHERE run_id=p_run;
 IF FOUND THEN IF metrics.coverage IS DISTINCT FROM p_coverage OR metrics.source_digest IS DISTINCT FROM md5(r.source::text) THEN RAISE EXCEPTION 'Original coverage changed';END IF;RETURN to_jsonb(metrics);END IF;
 expected.run_id=p_run;expected.source_digest=md5(r.source::text);expected.coverage=p_coverage;expected.recorded_at=now();
 INSERT INTO alert_cron.run_metrics SELECT expected.* RETURNING * INTO metrics;
 IF NOT FOUND OR to_jsonb(metrics) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Protected coverage suppressed/mutated';END IF;
 PERFORM alert_cron.log(p_run,p_run,'coverage',jsonb_build_object('origin','executor','principal','service_role','job','hato_alertas_tick'),NULL,to_jsonb(metrics));
 SELECT * INTO metrics FROM alert_cron.run_metrics WHERE run_id=p_run;
 IF NOT FOUND OR to_jsonb(metrics) IS DISTINCT FROM to_jsonb(expected) OR alert_cron.source() IS DISTINCT FROM before_source THEN RAISE EXCEPTION 'Protected coverage readback/source mismatch';END IF;
 RETURN to_jsonb(metrics);
END $$;
CREATE FUNCTION public.fn_alert_cron_monitor(p_owner uuid,p_before jsonb DEFAULT NULL,p_run uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE source_before jsonb;result jsonb;
BEGIN
 PERFORM alert_cron.lock_source();PERFORM alert_cron.operator_actor(p_owner);source_before=alert_cron.source();
 IF p_before IS NOT NULL AND (jsonb_typeof(p_before)<>'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_before)k) IS DISTINCT FROM ARRAY['at','id'] OR (p_before->>'id')::uuid IS NULL OR (p_before->>'at')::timestamptz IS NULL) THEN RAISE EXCEPTION 'Original monitor cursor required';END IF;
 WITH selected AS(SELECT * FROM alert_cron.runs WHERE (p_run IS NULL OR id=p_run) AND (p_before IS NULL OR (reference_at,id)<((p_before->>'at')::timestamptz,(p_before->>'id')::uuid)) ORDER BY reference_at DESC,id DESC LIMIT 51),visible AS(SELECT * FROM selected ORDER BY reference_at DESC,id DESC LIMIT 50)
 SELECT jsonb_build_object('version',1,'owner',p_owner,'observedAt',now(),'runs',coalesce((SELECT jsonb_agg(alert_cron.run_summary(v) ORDER BY reference_at DESC,id DESC) FROM visible v),'[]'),
 'metrics',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY run_id) FROM alert_cron.run_metrics m WHERE run_id IN(SELECT id FROM visible)),'[]'),'selectedRun',p_run,'deliveries',CASE WHEN p_run IS NULL THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(alert_cron.delivery_summary(d) ORDER BY d.id) FROM alert_cron.deliveries d WHERE run_id=p_run),'[]') END,
 'audit',CASE WHEN p_run IS NULL THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'objectId',object_id,'event',event,'actor',actor,'recordedAt',recorded_at) ORDER BY recorded_at DESC,id DESC) FROM(SELECT * FROM alert_cron.audit WHERE run_id=p_run ORDER BY recorded_at DESC,id DESC LIMIT 200)x),'[]') END,
 'auditMore',CASE WHEN p_run IS NULL THEN false ELSE (SELECT count(*)>200 FROM alert_cron.audit WHERE run_id=p_run) END,
 'operations',coalesce((SELECT jsonb_agg(alert_cron.operator_result(o) ORDER BY request_key) FROM(SELECT * FROM alert_cron.operator_requests WHERE owner_id=p_owner AND state='committed' AND intent->>'kind'='replan_run' AND (intent->>'targetId' IN(SELECT id::text FROM visible) OR receipt->'replacement'->>'id' IN(SELECT id::text FROM visible)) ORDER BY request_key LIMIT 50)o),'[]'),
 'more',(SELECT count(*)>50 FROM selected),'before',(SELECT jsonb_build_object('at',reference_at,'id',id) FROM visible ORDER BY reference_at,id LIMIT 1)) INTO result;
 IF alert_cron.source() IS DISTINCT FROM source_before THEN RAISE EXCEPTION 'Monitoring changed source';END IF;
 RETURN result;
END $$;
CREATE FUNCTION public.fn_alert_cron_operator(p_action text,p_request_key uuid,p_intent jsonb,p_expected_owner uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE actor jsonb;r alert_cron.operator_requests;expected alert_cron.operator_requests;snapshot jsonb;current_snapshot jsonb;before_source jsonb;expected_source jsonb;
 job alert_cron.runs;expected_job alert_cron.runs;delivery alert_cron.deliveries;expected_delivery alert_cron.deliveries;child alert_cron.runs;link alert_cron.replacement_links;actual_link alert_cron.replacement_links;
 new_receipt jsonb;audit alert_cron.operator_audit;actual_audit alert_cron.operator_audit;target uuid;kind text;
BEGIN
 actor=alert_cron.operator_actor(p_expected_owner);
 IF p_request_key IS NULL OR p_action NOT IN('prepare','post','status','cancel','execute') THEN RAISE EXCEPTION 'Original operator key/action required';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('alert-cron-operator:'||p_request_key::text,0));
 SELECT * INTO r FROM alert_cron.operator_requests WHERE request_key=p_request_key FOR UPDATE;
 IF FOUND AND r.owner_id IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Original operator owner changed' USING ERRCODE='42501';END IF;
 IF p_action NOT IN('prepare') AND p_intent IS NOT NULL THEN RAISE EXCEPTION 'Original operator intent cannot be replaced';END IF;
 IF p_action='status' THEN RETURN CASE WHEN r.request_key IS NULL THEN jsonb_build_object('version',1,'requestKey',p_request_key,'owner',p_expected_owner,'state','unknown','intent',NULL,'original',NULL,'receipt',NULL) ELSE alert_cron.operator_result(r) END;END IF;
 IF coalesce(p_intent->>'kind',r.intent->>'kind') IN('cancel_run','replan_run') THEN
  PERFORM 1 FROM alert_cron.runs WHERE id=coalesce(p_intent->>'targetId',r.intent->>'targetId')::uuid FOR UPDATE;
 END IF;
 PERFORM alert_cron.lock_source();before_source=alert_cron.source();expected_source=before_source;
 IF p_action='prepare' THEN
  IF jsonb_typeof(p_intent) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_intent)k) IS DISTINCT FROM ARRAY['kind','observed','reason','targetId'] OR p_intent->>'kind' NOT IN('cancel_run','replan_run','cancel_delivery','acknowledge_hold') OR jsonb_typeof(p_intent->'reason') IS DISTINCT FROM 'string' OR length(btrim(p_intent->>'reason')) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Exact bounded operator intent/reason required';END IF;
  target=(p_intent->>'targetId')::uuid;kind=p_intent->>'kind';IF target::text IS DISTINCT FROM p_intent->>'targetId' THEN RAISE EXCEPTION 'Canonical operator target required';END IF;
  IF r.request_key IS NOT NULL THEN IF r.intent IS NOT NULL AND r.intent IS DISTINCT FROM p_intent THEN RAISE EXCEPTION 'Original operator intent changed';END IF;RETURN alert_cron.operator_result(r);END IF;
  snapshot=alert_cron.operator_snapshot(kind,target);
  IF snapshot->'summary' IS DISTINCT FROM p_intent->'observed' THEN RAISE EXCEPTION 'Observed operator target changed';END IF;
  r.request_key=p_request_key;r.owner_id=p_expected_owner;r.intent=p_intent;r.original=jsonb_build_object('snapshot',snapshot,'source',before_source,'referenceAt',now());r.state='pending';expected=r;
  INSERT INTO alert_cron.operator_requests SELECT expected.* RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Operator reservation suppressed/mutated';END IF;
 ELSIF p_action='cancel' THEN
  IF r.request_key IS NULL THEN
   r.request_key=p_request_key;r.owner_id=p_expected_owner;r.state='canceled';expected=r;INSERT INTO alert_cron.operator_requests SELECT expected.* RETURNING * INTO r;
  ELSIF r.state='pending' THEN expected=r;expected.state='canceled';UPDATE alert_cron.operator_requests SET state='canceled' WHERE request_key=p_request_key RETURNING * INTO r;
  ELSE RETURN alert_cron.operator_result(r);END IF;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Operator cancellation suppressed/mutated';END IF;
 ELSIF p_action='execute' THEN
  IF r.state IS DISTINCT FROM 'committed' OR r.intent->>'kind'<>'replan_run' THEN RAISE EXCEPTION 'Committed original replan operation required';END IF;
  SELECT x.* INTO child FROM alert_cron.runs x JOIN alert_cron.replacement_links l ON l.replacement_id=x.id WHERE l.request_key=p_request_key;
  IF NOT FOUND OR child.id::text IS DISTINCT FROM r.receipt->'replacement'->>'id' OR child.actor IS DISTINCT FROM r.original->'snapshot'->'control'->'actor' THEN RAISE EXCEPTION 'Original replacement link changed';END IF;
  PERFORM alert_cron.check_initiator(child.actor);
  RETURN jsonb_build_object('operation',alert_cron.operator_result(r),'run',to_jsonb(child));
 ELSIF p_action='post' THEN
  IF r.request_key IS NULL THEN RAISE EXCEPTION 'Original prepared operator request required';END IF;
  IF r.state<>'pending' THEN RETURN alert_cron.operator_result(r);END IF;
  kind=r.intent->>'kind';target=(r.intent->>'targetId')::uuid;snapshot=r.original->'snapshot';current_snapshot=alert_cron.operator_snapshot(kind,target);
  IF current_snapshot IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'Original operator control/evidence changed';END IF;
  IF kind IN('cancel_run','replan_run') THEN
   SELECT * INTO job FROM alert_cron.runs WHERE id=target;
   IF job.state<>'prepared' OR job.receipt IS NOT NULL OR job.plan IS NOT NULL OR EXISTS(SELECT 1 FROM alert_cron.deliveries WHERE run_id=target) THEN RAISE EXCEPTION 'Only unused unposted prepared jobs may be canceled/replanned';END IF;
   IF kind='replan_run' THEN
    IF job.source IS NOT DISTINCT FROM before_source OR r.original->'source' IS DISTINCT FROM before_source THEN RAISE EXCEPTION 'Original stale source/review required';END IF;
    IF ((r.original->>'referenceAt')::timestamptz AT TIME ZONE 'America/Bogota')::date IS DISTINCT FROM (now() AT TIME ZONE 'America/Bogota')::date THEN RAISE EXCEPTION 'Review day changed';END IF;
    IF job.actor->>'origin'='manual' AND job.actor->>'profileId' IS DISTINCT FROM p_expected_owner::text THEN RAISE EXCEPTION 'Original manual initiator must replan';END IF;
    PERFORM alert_cron.check_initiator(job.actor);
   END IF;
   expected_job=job;expected_job.state='canceled';UPDATE alert_cron.runs SET state='canceled' WHERE id=target RETURNING * INTO job;
   IF NOT FOUND OR to_jsonb(job) IS DISTINCT FROM to_jsonb(expected_job) THEN RAISE EXCEPTION 'Original job cancellation suppressed/mutated';END IF;
   PERFORM alert_cron.log(target,target,'operator_cancel_job',actor,snapshot->'control',to_jsonb(job));
   IF kind='replan_run' THEN
    child=jsonb_populate_record(NULL::alert_cron.runs,alert_cron.reserve('replan:'||target::text,job.actor));
    link.original_id=target;link.replacement_id=child.id;link.request_key=p_request_key;
    INSERT INTO alert_cron.replacement_links SELECT link.* RETURNING * INTO actual_link;
    IF NOT FOUND OR to_jsonb(actual_link) IS DISTINCT FROM to_jsonb(link) THEN RAISE EXCEPTION 'Replacement link suppressed/mutated';END IF;
   END IF;
  ELSE
   SELECT * INTO delivery FROM alert_cron.deliveries WHERE id=target;
   IF kind='cancel_delivery' THEN
    IF delivery.state<>'queued' OR delivery.claim_key IS NOT NULL OR delivery.claimed_at IS NOT NULL THEN RAISE EXCEPTION 'Only unclaimed queued delivery may be canceled';END IF;
    expected_delivery=delivery;expected_delivery.state='canceled';UPDATE alert_cron.deliveries SET state='canceled' WHERE id=target RETURNING * INTO delivery;
    IF NOT FOUND OR to_jsonb(delivery) IS DISTINCT FROM to_jsonb(expected_delivery) THEN RAISE EXCEPTION 'Queued cancellation suppressed/mutated';END IF;
    PERFORM alert_cron.log(delivery.run_id,target,'operator_cancel_delivery',actor,snapshot->'control',to_jsonb(delivery));
   ELSIF delivery.state NOT IN('sending','unknown') OR snapshot->'evidence'<>'null'::jsonb THEN RAISE EXCEPTION 'Only unresolved original send may be acknowledged held';END IF;
  END IF;
  new_receipt=jsonb_build_object('version',1,'requestKey',p_request_key,'owner',p_expected_owner,'intent',r.intent,'original',snapshot->'summary','after',(alert_cron.operator_snapshot(kind,target))->'summary','replacement',CASE WHEN child.id IS NULL THEN NULL ELSE alert_cron.run_summary(child) END,'recordedAt',now());
  IF kind='acknowledge_hold' THEN new_receipt=jsonb_set(new_receipt,'{after,acknowledged}','true');END IF;
  audit.request_key=p_request_key;audit.receipt=new_receipt;INSERT INTO alert_cron.operator_audit SELECT audit.* RETURNING * INTO actual_audit;
  IF NOT FOUND OR to_jsonb(actual_audit) IS DISTINCT FROM to_jsonb(audit) THEN RAISE EXCEPTION 'Operator audit suppressed/mutated';END IF;
  expected=r;expected.state='committed';expected.receipt=new_receipt;UPDATE alert_cron.operator_requests SET state='committed',receipt=new_receipt WHERE request_key=p_request_key RETURNING * INTO r;
  IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Operator committed control suppressed/mutated';END IF;
 ELSE RAISE EXCEPTION 'Invalid original operator action';END IF;
 SELECT * INTO r FROM alert_cron.operator_requests WHERE request_key=p_request_key;
 IF NOT FOUND OR to_jsonb(r) IS DISTINCT FROM to_jsonb(expected) OR alert_cron.source() IS DISTINCT FROM expected_source THEN RAISE EXCEPTION 'Operator final control/source mismatch';END IF;
 IF r.state='committed' AND (alert_cron.operator_snapshot(r.intent->>'kind',(r.intent->>'targetId')::uuid))->'summary' IS DISTINCT FROM r.receipt->'after' THEN RAISE EXCEPTION 'Operator final target readback mismatch';END IF;
 IF r.state='committed' AND NOT EXISTS(SELECT 1 FROM alert_cron.operator_audit WHERE request_key=p_request_key AND alert_cron.operator_audit.receipt=r.receipt) THEN RAISE EXCEPTION 'Operator audit readback mismatch';END IF;
 RETURN alert_cron.operator_result(r);
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA alert_cron FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_alert_cron_monitor(uuid,jsonb,uuid),public.fn_alert_cron_operator(text,uuid,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_alert_cron_monitor(uuid,jsonb,uuid),public.fn_alert_cron_operator(text,uuid,jsonb,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_alert_cron_record_metrics(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_alert_cron_record_metrics(uuid,jsonb,jsonb) TO service_role;
COMMIT;
