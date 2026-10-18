-- NONNUMBERED narrow legacy chequeo RPC retirement after40coordinated candidates. Offline only.
BEGIN;
SELECT hato_birth_undo.lock_domain();
DO $admit$ BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed chequeo retirement owner required';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.fn_hato_commit_chequeo(jsonb,uuid)') AND md5(p.prosrc)='da542ea9e2b976a5ac89348b0cd35376' AND p.prosecdef AND p.proconfig=ARRAY['search_path=public, pg_temp'] AND pg_get_userbyid(p.proowner)='postgres' AND l.lanname='plpgsql' AND p.prorettype='jsonb'::regtype AND p.proargnames=ARRAY['payload','p_created_by'] AND p.pronargdefaults=0) THEN RAISE EXCEPTION 'Unreviewed legacy chequeo function';END IF;
 IF EXISTS(SELECT 1 FROM aclexplode((SELECT coalesce(proacl,acldefault('f',proowner)) FROM pg_proc WHERE oid='public.fn_hato_commit_chequeo(jsonb,uuid)'::regprocedure))x WHERE pg_get_userbyid(x.grantee) NOT IN('postgres','service_role') OR x.privilege_type<>'EXECUTE' OR x.is_grantable AND pg_get_userbyid(x.grantee)<>'postgres') OR NOT has_function_privilege('service_role','public.fn_hato_commit_chequeo(jsonb,uuid)','EXECUTE') THEN RAISE EXCEPTION 'Unreviewed legacy chequeo grants';END IF;
 IF EXISTS(SELECT 1 FROM(VALUES ('hato_chequeo_integrity.immutable()','d6a2489a4c5db4bec0ec44ff9ef1b983',false),('hato_chequeo_integrity.controls()','ab51caf7b8a5b14825d6061016e18e8d',false),('hato_chequeo_integrity.result(hato_chequeo_integrity.requests)','ac0cc6016799b1654e0f5f294e9ddc16',false),('hato_chequeo_integrity.source()','dd090ce3547460ff8a3eec40fd67ae67',false),('hato_chequeo_integrity.service_actor(uuid)','fa77dea489815a55cac63b5701d06519',false),('public.fn_hato_chequeo_source_service(uuid)','7d88b3bc80e5afed4d03a7d6c762763f',true),('hato_chequeo_integrity.plan(jsonb,jsonb,uuid)','a6854bf696a95973b0b3de059b8ac43f',false),('public.fn_hato_chequeo_prepare_service(uuid,uuid,jsonb,jsonb,jsonb)','c78109d91ee91f90b2de984a4a54b0b1',true),('hato_chequeo_integrity.patch(jsonb,text,jsonb,jsonb)','cb7166cdb6bbd79d7ca78fb9aa797d3b',false),('hato_chequeo_integrity.mutation(text,text,jsonb,jsonb)','bf20508382bf82af07df040e95dc948e',false),('public.fn_hato_chequeo_web(text,uuid,uuid)','cfdcd7a796756d86f46667dac56fbf63',true),('public.fn_hato_chequeo_recover_web(uuid)','3b7040315584946409242a1715189931',true))e(signature,body,definer) WHERE NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(e.signature) AND md5(p.prosrc)=e.body AND p.prosecdef=e.definer AND pg_get_userbyid(p.proowner)='postgres' AND p.proconfig=ARRAY['search_path=pg_catalog'])) THEN RAISE EXCEPTION 'Unreviewed prepared chequeo helper/entry';END IF;
END $admit$;
CREATE OR REPLACE FUNCTION public.fn_hato_commit_chequeo(payload jsonb,p_created_by uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$BEGIN RAISE EXCEPTION 'Legacy chequeo RPC retired; recover/use the prepared original chequeo' USING ERRCODE='42501';END$$;
REVOKE ALL ON FUNCTION public.fn_hato_commit_chequeo(jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION hato_chequeo_integrity.assert_retired() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang WHERE p.oid=to_regprocedure('public.fn_hato_commit_chequeo(jsonb,uuid)') AND md5(p.prosrc)='b8845f7d2aa6af6643f3a0094758a88f' AND NOT p.prosecdef AND NOT p.proisstrict AND NOT p.proleakproof AND p.provolatile='v' AND p.proparallel='u' AND p.prokind='f' AND NOT p.proretset AND p.pronargdefaults=0 AND p.proargnames=ARRAY['payload','p_created_by'] AND p.proconfig=ARRAY['search_path=pg_catalog'] AND l.lanname='plpgsql' AND pg_get_userbyid(p.proowner)='postgres' AND p.prorettype='jsonb'::regtype
 AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x WHERE x.grantee<>p.proowner)) OR EXISTS(SELECT 1 FROM(VALUES('anon'),('authenticated'),('service_role'))r(role) WHERE has_function_privilege(r.role,'public.fn_hato_commit_chequeo(jsonb,uuid)','EXECUTE')) THEN RAISE EXCEPTION 'Unreviewed retired chequeo boundary' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION hato_chequeo_integrity.assert_retired() FROM PUBLIC,anon,authenticated,service_role;
DO $bind$ DECLARE signature text;definition text;patched text;BEGIN
 FOREACH signature IN ARRAY ARRAY['public.fn_hato_chequeo_web(text,uuid,uuid)','public.fn_hato_chequeo_prepare_service(uuid,uuid,jsonb,jsonb,jsonb)','public.fn_hato_chequeo_source_service(uuid)'] LOOP
  definition=pg_get_functiondef(to_regprocedure(signature));patched=regexp_replace(definition,'BEGIN','BEGIN PERFORM hato_chequeo_integrity.assert_retired();');
  IF patched=definition THEN RAISE EXCEPTION 'Chequo retirement entry binding missing';END IF;
  IF signature<>'public.fn_hato_chequeo_source_service(uuid)' THEN patched=replace(patched,'RETURN hato_chequeo_integrity.result(r);','PERFORM hato_chequeo_integrity.assert_retired();RETURN hato_chequeo_integrity.result(r);');END IF;
  EXECUTE patched;
 END LOOP;
END $bind$;
SELECT hato_chequeo_integrity.assert_retired();
COMMIT;
