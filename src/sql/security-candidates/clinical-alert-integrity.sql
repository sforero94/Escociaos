-- NONNUMBERED prospective review candidate; after all15 coordinated candidates.
-- Do not alter historical rows or infer missing clinical execution/provenance.
BEGIN;
LOCK TABLE public.hato_alertas,public.hato_tratamientos,public.hato_tratamiento_pasos IN SHARE ROW EXCLUSIVE MODE;
DO $admission$
DECLARE fingerprint text;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed clinical alert installation owner required';END IF;
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
WHERE n.nspname='public' AND c.relname IN('hato_tratamientos','hato_tratamiento_pasos','hato_alertas')) AS evidence(baseline);
 IF fingerprint IS DISTINCT FROM '92421dd4b3aa0b7034393f0d27787e75' THEN RAISE EXCEPTION 'Unreviewed clinical alert schema';END IF;
 PERFORM clinical_step_confirmation.assert_retired_writers();
 PERFORM correction_audit_integrity.assert_boundary();
END $admission$;
CREATE SCHEMA clinical_alert_integrity;
REVOKE ALL ON SCHEMA clinical_alert_integrity FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION clinical_alert_integrity.require_execution() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.tipo='tratamiento_paso' AND NEW.estado='confirmada' THEN
  IF current_setting('role',true)='anon' THEN RAISE EXCEPTION 'Clinical alert writer authority required' USING ERRCODE='42501';END IF;
  IF current_setting('role',true)='authenticated' THEN
   PERFORM 1 FROM public.usuarios WHERE id=auth.uid() AND activo IS TRUE AND rol IN('Administrador','Gerencia') FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Clinical alert writer authority required' USING ERRCODE='42501';END IF;
  END IF;
  PERFORM 1 FROM public.hato_tratamiento_pasos s JOIN public.hato_tratamientos h ON h.id=s.tratamiento_id
  WHERE s.id=NEW.paso_id AND h.animal_id=NEW.animal_id AND s.fecha_ejecutada IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Clinical alert requires matching executed step';END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION clinical_alert_integrity.require_execution() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER clinical_alert_requires_execution BEFORE INSERT OR UPDATE ON public.hato_alertas
 FOR EACH ROW EXECUTE FUNCTION clinical_alert_integrity.require_execution();
COMMIT;
