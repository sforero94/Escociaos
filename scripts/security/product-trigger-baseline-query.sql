-- Local review query; execute only against the disposable schema replay.
-- Stable names and semantic ACLs; never bind deployment OIDs or ACL entry order.
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
FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
JOIN pg_catalog.pg_proc f ON f.oid=t.tgfoid JOIN pg_catalog.pg_namespace n ON n.oid=f.pronamespace
JOIN pg_catalog.pg_language l ON l.oid=f.prolang
WHERE NOT t.tgisinternal AND t.tgrelid IN ('public.productos'::regclass,'public.movimientos_inventario'::regclass);
