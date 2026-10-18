-- NONNUMBERED browser milk/capture integration after43candidates. OFFLINE REVIEW ONLY.
BEGIN;
SELECT hato_birth_undo.lock_domain();
DO $$ BEGIN IF current_user<>'postgres' OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.fn_hato_milk_weighing_web(text,uuid,jsonb,uuid)'::regprocedure AND md5(prosrc)='af90882b1d1185dbfd3237d067317dd7' AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='hato_milk_weighing.validate(jsonb)'::regprocedure AND md5(prosrc)='247891fda58652fcf3c291cdf3a06c4d' AND NOT prosecdef AND proconfig=ARRAY['search_path=pg_catalog'] AND pg_get_userbyid(proowner)='postgres') THEN RAISE EXCEPTION 'Unreviewed browser milk foundation';END IF;PERFORM hato_milk_weighing.assert_baseline();END $$;
ALTER FUNCTION hato_milk_weighing.validate(jsonb) RENAME TO validate_cells;
CREATE FUNCTION hato_milk_weighing.validate(p jsonb) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 PERFORM hato_milk_weighing.validate_cells(p-'captureId');
 IF p ? 'captureId' AND p->'captureId'<>'null'::jsonb AND(jsonb_typeof(p->'captureId') IS DISTINCT FROM 'string' OR (p->>'captureId')::uuid::text IS DISTINCT FROM p->>'captureId') THEN RAISE EXCEPTION 'Exact original milk capture required';END IF;
END $$;
REVOKE ALL ON FUNCTION hato_milk_weighing.validate(jsonb),hato_milk_weighing.validate_cells(jsonb) FROM PUBLIC,anon,authenticated,service_role;
DO $bind$ DECLARE definition text;patched text;BEGIN
 definition=pg_get_functiondef('public.fn_hato_milk_weighing_web(text,uuid,jsonb,uuid)'::regprocedure);
 patched=replace(definition,'iso integer;receipt_value jsonb;','iso integer;capture_before jsonb;capture_after jsonb;receipt_value jsonb;');
 patched=replace(patched,$find$r.effective_date=(now() AT TIME ZONE 'America/Bogota')::date;r.state='pending';$find$,$prepare$
  capture_before=NULL;
  IF p_intent->>'captureId' IS NOT NULL THEN
   SELECT to_jsonb(c) INTO capture_before FROM public.hato_capturas_foto c WHERE id=(p_intent->>'captureId')::uuid;
   IF capture_before IS NULL OR capture_before->>'created_by' IS DISTINCT FROM p_expected_owner::text OR capture_before->>'tipo'<>'pesaje' OR capture_before->>'origen'<>'web' OR capture_before->>'desenlace'<>'pendiente' OR (capture_before->>'anio')::int<>(p_intent->>'year')::int OR (capture_before->>'mes')::int<>(p_intent->>'month')::int THEN RAISE EXCEPTION 'Current owner-bound pending milk photo required';END IF;
  END IF;
  r.plan=r.plan||jsonb_build_object('capture',capture_before);
  r.effective_date=(now() AT TIME ZONE 'America/Bogota')::date;r.state='pending';$prepare$);
 patched=replace(patched,$find$  FOR cell IN SELECT value FROM jsonb_array_elements(r.plan->'accepted') LOOP$find$,$post$
  capture_before=r.plan->'capture';
  IF capture_before IS DISTINCT FROM 'null'::jsonb THEN
   SELECT to_jsonb(c) INTO capture_after FROM public.hato_capturas_foto c WHERE id=(capture_before->>'id')::uuid;
   IF capture_after IS DISTINCT FROM capture_before THEN RAISE EXCEPTION 'Original milk photo changed';END IF;
  END IF;
  FOR cell IN SELECT value FROM jsonb_array_elements(r.plan->'accepted') LOOP$post$);
 patched=replace(patched,$find$  receipt_value=jsonb_build_object($find$,$capture$
  capture_after=capture_before;
  IF capture_before IS DISTINCT FROM 'null'::jsonb THEN
   capture_after=capture_before||jsonb_build_object('desenlace','ok','actualizado_en',now(),'celdas_confirmadas',jsonb_array_length(r.intent->'cells'),'filas_escritas',jsonb_array_length(after_rows),'detalle',NULL);
   UPDATE public.hato_capturas_foto SET desenlace='ok',actualizado_en=now(),celdas_confirmadas=jsonb_array_length(r.intent->'cells'),filas_escritas=jsonb_array_length(after_rows),detalle=NULL WHERE id=(capture_before->>'id')::uuid RETURNING to_jsonb(hato_capturas_foto.*) INTO written;
   IF NOT FOUND OR written IS DISTINCT FROM capture_after THEN RAISE EXCEPTION 'Milk photo outcome suppressed/mutated';END IF;
   expected_domain=hato_chequeo_integrity.patch(expected_domain,'hato_capturas_foto',jsonb_build_array(capture_before),jsonb_build_array(capture_after));
  END IF;
  receipt_value=jsonb_build_object('capture',jsonb_build_object('before',capture_before,'after',capture_after),$capture$);
 IF patched=definition OR position('capture_before jsonb' in patched)=0 OR position('Current owner-bound pending milk photo required' in patched)=0 OR position('Original milk photo changed' in patched)=0 OR position('Milk photo outcome suppressed/mutated' in patched)=0 THEN RAISE EXCEPTION 'Browser milk binding missing';END IF;
 EXECUTE patched;
END $bind$;
CREATE FUNCTION public.fn_hato_milk_weighing_source_web(p_expected_owner uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_expected_owner IS NULL OR auth.uid() IS DISTINCT FROM p_expected_owner THEN RAISE EXCEPTION 'Current milk source owner required' USING ERRCODE='42501';END IF;
 PERFORM hato_treatment_creation.web_actor();PERFORM hato_birth_undo.lock_domain();PERFORM hato_milk_weighing.assert_baseline();
 RETURN jsonb_build_object('rows',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') FROM public.hato_pesajes_leche x),'animals',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') FROM public.hato_animales x),'config',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]') FROM public.hato_config x));
END $$;
REVOKE ALL ON FUNCTION public.fn_hato_milk_weighing_source_web(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_hato_milk_weighing_source_web(uuid) TO authenticated;
COMMIT;
