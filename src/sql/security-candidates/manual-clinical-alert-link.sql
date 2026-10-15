-- NONNUMBERED prospective manual treatment-alert linkage, after all17 candidates.
-- Existing unlinked rows remain unchanged. No direct-grant retirement.
BEGIN;
LOCK TABLE public.hato_tratamientos,public.hato_tratamiento_pasos,public.hato_alertas,
 public.hato_animales,public.usuarios,public.telegram_usuarios,public.hato_eventos IN SHARE ROW EXCLUSIVE MODE;
DO $admission$
DECLARE fingerprint text;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed manual clinical alert installation owner required';END IF;
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
 IF fingerprint IS DISTINCT FROM '40586a4e97eaccf8982e30ff7c14a124' THEN RAISE EXCEPTION 'Unreviewed manual clinical alert schema';END IF;
 PERFORM clinical_step_confirmation.assert_retired_writers();
 PERFORM correction_audit_integrity.assert_boundary();
 IF EXISTS(SELECT 1 FROM(VALUES('hato_treatment_creation.web_actor()','1d8ec54936d4f658da49a965b828224c'),('hato_treatment_creation.telegram_actor(bigint,bigint,bigint)','e58604b57f82fd09c9ba612591b9c3e6'))e(signature,body)
  WHERE NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(e.signature) AND md5(p.prosrc)=e.body
   AND NOT p.prosecdef AND p.proconfig=ARRAY['search_path=pg_catalog'] AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname='postgres')))
 THEN RAISE EXCEPTION 'Unreviewed manual clinical alert actor helper';END IF;
END $admission$;
CREATE SCHEMA manual_clinical_alert;
REVOKE ALL ON SCHEMA manual_clinical_alert FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION manual_clinical_alert.require_pending_step() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.tipo='tratamiento_paso' AND (NEW.regla_clave LIKE 'manual:%' OR NEW.datos->>'origen'='manual')
 AND (TG_OP='INSERT' OR NEW.tipo IS DISTINCT FROM OLD.tipo OR NEW.paso_id IS DISTINCT FROM OLD.paso_id
  OR NEW.animal_id IS DISTINCT FROM OLD.animal_id OR NEW.regla_clave IS DISTINCT FROM OLD.regla_clave
  OR NEW.datos->>'origen' IS DISTINCT FROM OLD.datos->>'origen') THEN
  -- A manual alert is never authority to invent a treatment or execute a step.
  PERFORM hato_treatment_creation.web_actor();
  PERFORM 1 FROM public.hato_tratamientos h JOIN public.hato_tratamiento_pasos s ON s.tratamiento_id=h.id
   WHERE s.id=NEW.paso_id AND h.animal_id=NEW.animal_id AND h.estado='activo' AND s.fecha_ejecutada IS NULL
   FOR SHARE OF h,s;
  IF NOT FOUND THEN RAISE EXCEPTION 'Existing pending clinical step for selected animal required';END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION manual_clinical_alert.require_pending_step() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER require_manual_pending_clinical_step BEFORE INSERT OR UPDATE ON public.hato_alertas
 FOR EACH ROW EXECUTE FUNCTION manual_clinical_alert.require_pending_step();
COMMIT;
