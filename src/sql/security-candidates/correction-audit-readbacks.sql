-- NONNUMBERED prospective review candidate. After correction-audit-integrity.sql.
-- No historical repair; existing NULL-UID service compatibility remains explicit.
BEGIN;
LOCK TABLE public.hato_correcciones,public.globalgap_correcciones IN SHARE ROW EXCLUSIVE MODE;
DO $admit$
BEGIN
 PERFORM correction_audit_integrity.assert_boundary();
 IF EXISTS(SELECT 1 FROM(VALUES('public.fn_hato_registrar_correccion()','6c8470bf94a7e2437c08bf1df123ac03'),('public.fn_globalgap_registrar_correccion()','b21c3326a874e3c541120c8973d5f8bc'))e(signature,body)
 WHERE NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure(e.signature) AND md5(prosrc)=e.body AND prosecdef
 AND proowner=(SELECT oid FROM pg_roles WHERE rolname='postgres') AND proconfig=ARRAY['search_path=public, pg_temp']))
 THEN RAISE EXCEPTION 'Unreviewed correction source writer';END IF;
END $admit$;
CREATE OR REPLACE FUNCTION public.fn_hato_registrar_correccion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $writer$
DECLARE expected public.hato_correcciones;written public.hato_correcciones;actual jsonb;actor uuid=auth.uid();key uuid=gen_random_uuid();
BEGIN
 IF actor IS NULL THEN RETURN COALESCE(NEW,OLD);END IF;
 IF TG_OP='UPDATE' AND to_jsonb(OLD)=to_jsonb(NEW) THEN RETURN NEW;END IF;
 PERFORM 1 FROM public.usuarios WHERE id=actor AND activo IS TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active correction actor required';END IF;
 expected=jsonb_populate_record(NULL::public.hato_correcciones,jsonb_build_object('id',key,'tabla',TG_TABLE_NAME,'fila_id',(to_jsonb(OLD)->>'id')::uuid,'operacion',lower(TG_OP),'datos_anteriores',to_jsonb(OLD),'datos_nuevos',CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END,'animal_id',CASE WHEN TG_TABLE_NAME='hato_animales' THEN (to_jsonb(OLD)->>'id')::uuid ELSE (to_jsonb(OLD)->>'animal_id')::uuid END,'corregido_por',actor,'corregido_en',now(),'motivo',CASE WHEN TG_OP='UPDATE' THEN to_jsonb(NEW)->'datos'->>'motivo_correccion' ELSE NULL END));
 INSERT INTO public.hato_correcciones SELECT (expected).* RETURNING * INTO written;
 IF written IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Correction audit insert suppressed or changed';END IF;
 SELECT to_jsonb(a) INTO actual FROM public.hato_correcciones a WHERE id=key;
 IF actual IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Correction audit durable readback mismatch';END IF;
 RETURN COALESCE(NEW,OLD);
END;
$writer$;
CREATE OR REPLACE FUNCTION public.fn_globalgap_registrar_correccion() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $writer$
DECLARE expected public.globalgap_correcciones;written public.globalgap_correcciones;actual jsonb;actor uuid=auth.uid();key uuid=gen_random_uuid();
BEGIN
 IF actor IS NULL THEN RETURN COALESCE(NEW,OLD);END IF;
 IF TG_OP='UPDATE' AND to_jsonb(OLD)=to_jsonb(NEW) THEN RETURN NEW;END IF;
 PERFORM 1 FROM public.usuarios WHERE id=actor AND activo IS TRUE FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active correction actor required';END IF;
 expected=jsonb_populate_record(NULL::public.globalgap_correcciones,jsonb_build_object('id',key,'tabla',TG_TABLE_NAME,'fila_id',(to_jsonb(OLD)->>'id')::uuid,'operacion',lower(TG_OP),'datos_anteriores',to_jsonb(OLD),'datos_nuevos',CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END,'aplicacion_id',CASE WHEN TG_TABLE_NAME='aplicaciones' THEN (to_jsonb(OLD)->>'id')::uuid ELSE (to_jsonb(OLD)->>'aplicacion_id')::uuid END,'corregido_por',actor,'corregido_en',now()));
 INSERT INTO public.globalgap_correcciones SELECT (expected).* RETURNING * INTO written;
 IF written IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Correction audit insert suppressed or changed';END IF;
 SELECT to_jsonb(a) INTO actual FROM public.globalgap_correcciones a WHERE id=key;
 IF actual IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Correction audit durable readback mismatch';END IF;
 RETURN COALESCE(NEW,OLD);
END;
$writer$;
DO $coordinate$
DECLARE p pg_proc;body text;
BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('application_plan_delete.assert_graph()');
 IF NOT FOUND OR md5(p.prosrc)<>'5d35374c742dfe86c930ed554b47bda8' OR p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, public'] OR p.proowner<>(SELECT oid FROM pg_roles WHERE rolname='postgres')
 THEN RAISE EXCEPTION 'Unreviewed plan audited-source guard';END IF;
 body=replace(p.prosrc,'92aa2902200ffe89ce0cbd6fb50d08ee6cbc5723a2ae7e77f0f66490fc24c365','bd47bed64af6dc65c4912d05a3cd35934b198ca4b8a8f6ff793960d3a59bcbc7');
 EXECUTE format('CREATE OR REPLACE FUNCTION application_plan_delete.assert_graph() RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS %L',body);
 PERFORM application_plan_delete.assert_graph();
END $coordinate$;
COMMIT;
