-- Contained synthetic admission only. Every new fixture/protected receipt/probe rolls back.
BEGIN;
CREATE FUNCTION pg_temp.lifecycle_domain() RETURNS jsonb LANGUAGE sql AS $domain$ {{DOMAIN_QUERY}} $domain$;
CREATE TEMP TABLE lifecycle_admission_result(value jsonb);
DO $admission$
DECLARE owner_id uuid={{OWNER}};fixture_animal_id uuid={{ANIMAL}};sale_key uuid={{SALEKEY}};tx_id uuid={{TX}};new_income uuid={{INCOME}};
 business uuid;category uuid;region uuid;medium uuid;template public.hato_animales;animal public.hato_animales;income public.fin_ingresos;income_id uuid;shared_id uuid;shared_count int;affected int;movement uuid;before_data jsonb;original_sale jsonb;posted jsonb;intent jsonb;day date=(now() AT TIME ZONE 'America/Bogota')::date;facts jsonb='[]';observed boolean;outcome text;claims jsonb;draft jsonb;review jsonb;original_request jsonb;result jsonb;correction_key uuid=gen_random_uuid();other_owner uuid=gen_random_uuid();saved_income jsonb;message text;changed jsonb;replacement_business uuid=gen_random_uuid();replacement_category uuid=gen_random_uuid();replacement_region uuid=gen_random_uuid();replacement_medium uuid=gen_random_uuid();replacement_buyer uuid=gen_random_uuid();expected_financial jsonb;financial_fields text[]=ARRAY['fecha','negocio_id','categoria_id','nombre','region_id','medio_pago_id','comprador_id','valor'];
BEGIN
 INSERT INTO auth.users VALUES(owner_id);
 INSERT INTO public.usuarios(id,email,rol,activo) VALUES(owner_id,owner_id::text||'@synthetic.invalid','Gerencia',true);
 SELECT id INTO STRICT business FROM public.fin_negocios WHERE nombre='Hato Lechero' AND activo IS TRUE;
 SELECT id INTO category FROM public.fin_categorias_ingresos WHERE negocio_id=business AND activo IS TRUE AND nombre ILIKE '%ternero%' ORDER BY id LIMIT 1;
 IF category IS NULL THEN category=gen_random_uuid();INSERT INTO public.fin_categorias_ingresos(id,negocio_id,nombre) VALUES(category,business,'Synthetic Venta de Terneros');END IF;
 SELECT id INTO STRICT region FROM public.fin_regiones WHERE nombre='Synthetic protected region';
 SELECT id INTO STRICT medium FROM public.fin_medios_pago WHERE nombre='Synthetic protected medium';
 SELECT * INTO STRICT template FROM public.hato_animales ORDER BY id LIMIT 1;animal=template;animal.id=fixture_animal_id;SELECT coalesce(max(numero),0)+100 INTO animal.numero FROM public.hato_animales;animal.nombre='Synthetic retained-sale admission';animal.estado='activa';animal.fecha_estado=NULL;
 INSERT INTO public.hato_animales SELECT(animal).*;
 intent=jsonb_build_object('version',1,'tipo','terneros','cabezas',1,'valor','123456','fecha',day::text,'regionId',region,'medioPagoId',medium,'compradorId',NULL,'nombre','Synthetic retained sale','animals',jsonb_build_array(jsonb_build_object('id',animal.id,'numero',animal.numero,'nombre',animal.nombre)),'refs',jsonb_build_object('region',jsonb_build_object('id',region,'nombre','Synthetic protected region'),'medio',jsonb_build_object('id',medium,'nombre','Synthetic protected medium'),'comprador',NULL));
 EXECUTE 'SET LOCAL ROLE authenticated';PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 PERFORM public.fn_hato_sale_web('prepare',sale_key,intent,owner_id);posted=public.fn_hato_sale_web('post',sale_key,NULL,owner_id);
 EXECUTE 'RESET ROLE';income_id=(posted->'receipt'->'income'->>'id')::uuid;original_sale=posted->'receipt';
 IF posted->>'state' IS DISTINCT FROM 'committed' OR income_id IS NULL OR NOT EXISTS(SELECT 1 FROM hato_sale.audit WHERE request_key=sale_key AND receipt=original_sale) OR NOT EXISTS(SELECT 1 FROM public.hato_eventos WHERE animal_id=animal.id AND fin_ingreso_id=income_id AND tipo='venta') THEN RAISE EXCEPTION 'Genuine retained protected sale required';END IF;

 saved_income=(SELECT to_jsonb(i) FROM public.fin_ingresos i WHERE id=income_id);
 -- Every reviewed field must change independently; all replacement references roll back.
 INSERT INTO public.fin_negocios(id,nombre,activo) VALUES(replacement_business,'Synthetic financial business '||replacement_business::text,true);
 INSERT INTO public.fin_categorias_ingresos(id,negocio_id,nombre,activo) VALUES(replacement_category,replacement_business,'Synthetic financial category '||replacement_category::text,true);
 INSERT INTO public.fin_regiones(id,nombre,activo) VALUES(replacement_region,'Synthetic financial region '||replacement_region::text,true);
 INSERT INTO public.fin_medios_pago(id,nombre,activo) VALUES(replacement_medium,'Synthetic financial medium '||replacement_medium::text,true);
 INSERT INTO public.fin_compradores(id,nombre,activo) VALUES(replacement_buyer,'Synthetic financial buyer '||replacement_buyer::text,true);
 expected_financial=jsonb_build_object('fecha',((saved_income->>'fecha')::date+1)::text,'negocio_id',replacement_business,'categoria_id',replacement_category,'nombre','Synthetic reviewed financial correction','region_id',replacement_region,'medio_pago_id',replacement_medium,'comprador_id',replacement_buyer,'valor',123500.25);
 IF (SELECT count(*) FROM jsonb_each(expected_financial) f WHERE saved_income->f.key IS DISTINCT FROM f.value)<>8 THEN RAISE EXCEPTION 'All eight reviewed financial fields must differ from the original';END IF;
 draft=jsonb_build_object('version',1,'kind','saleFinancial','targetId',income_id,'fields',jsonb_build_object('date',expected_financial->'fecha','businessId',expected_financial->'negocio_id','categoryId',expected_financial->'categoria_id','name',expected_financial->'nombre','regionId',expected_financial->'region_id','mediumId',expected_financial->'medio_pago_id','buyerId',expected_financial->'comprador_id','value','123500.25'));
 EXECUTE 'SET LOCAL ROLE authenticated';
 review=public.fn_financial_sale_correction_source_web(draft,owner_id);
 draft=draft||jsonb_build_object('observed',review->'source');
 result=public.fn_financial_sale_correction_web('prepare',correction_key,draft,owner_id);original_request=result;
 EXECUTE 'RESET ROLE';
 IF result->>'state' IS DISTINCT FROM 'pending' OR result->'original'->'sale'->'audit'->'receipt' IS DISTINCT FROM original_sale OR (SELECT to_jsonb(i) FROM public.fin_ingresos i WHERE id=income_id) IS DISTINCT FROM saved_income OR EXISTS(SELECT 1 FROM financial_sale_correction.audit WHERE request_key=correction_key) THEN RAISE EXCEPTION 'Exact captured sale review without posting required';END IF;
 IF (SELECT jsonb_object_agg(f.key,f.value) FROM jsonb_each(result->'plan'->'afterIncome') f WHERE f.key=ANY(financial_fields)) IS DISTINCT FROM expected_financial THEN RAISE EXCEPTION 'Prepared plan must contain all eight reviewed financial values';END IF;
 facts=facts||jsonb_build_array('prepare captures exact retained sale/event/current-animal and active financial refs without posting');
 before_data=pg_temp.lifecycle_domain();
 -- Every refusal has a savepoint and independent complete row equality.
 BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.fn_financial_sale_correction_web('prepare',correction_key,jsonb_set(draft,'{fields,value}','"999"'),owner_id);RAISE EXCEPTION USING ERRCODE='ZX002';
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;IF message NOT LIKE '%Original quincena intent changed%' THEN RAISE;END IF;END;
 IF pg_temp.lifecycle_domain()<>before_data THEN RAISE EXCEPTION 'Changed original rollback';END IF;
 facts=facts||jsonb_build_array('same original key rejects altered prepared financial intent with whole-state rollback');
 INSERT INTO auth.users VALUES(other_owner);INSERT INTO public.usuarios(id,email,rol,activo) VALUES(other_owner,other_owner::text||'@synthetic.invalid','Gerencia',true);before_data=pg_temp.lifecycle_domain();
 BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';PERFORM set_config('request.jwt.claim.sub',other_owner::text,true);PERFORM public.fn_financial_sale_correction_web('status',correction_key,NULL,other_owner);RAISE EXCEPTION USING ERRCODE='ZX002';
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;IF message NOT LIKE '%belongs to another owner%' THEN RAISE;END IF;END;
 IF pg_temp.lifecycle_domain()<>before_data THEN RAISE EXCEPTION 'Foreign owner rollback';END IF;
 facts=facts||jsonb_build_array('another current active owner cannot read or post original correction');
 FOR claims IN SELECT x FROM jsonb_array_elements(jsonb_build_array(
  jsonb_build_object('label','income','statement',format('UPDATE public.fin_ingresos SET valor=valor+1 WHERE id=%L',income_id)),
  jsonb_build_object('label','animal','statement',format('UPDATE public.hato_animales SET nombre=%L WHERE id=%L','Synthetic competing identity',animal.id)),
  jsonb_build_object('label','event','statement',format('UPDATE public.hato_eventos SET datos=datos||%L::jsonb WHERE fin_ingreso_id=%L','{"synthetic_changed":true}',income_id)),
  jsonb_build_object('label','reference','statement',format('UPDATE public.fin_regiones SET nombre=nombre||%L WHERE id=%L',' changed',region))))x LOOP
  BEGIN
   EXECUTE(claims->>'statement');EXECUTE 'SET LOCAL ROLE authenticated';PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);PERFORM public.fn_financial_sale_correction_web('post',correction_key,NULL,owner_id);RAISE EXCEPTION USING ERRCODE='ZX002';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;IF message NOT LIKE '%source/day changed%' AND message NOT LIKE '%event missing/changed%' THEN RAISE;END IF;END;
  IF pg_temp.lifecycle_domain()<>before_data THEN RAISE EXCEPTION 'Stale source rollback %',claims->>'label';END IF;
  facts=facts||jsonb_build_array('competing '||(claims->>'label')||' change refuses original post with complete rollback');
 END LOOP;
 BEGIN
  UPDATE public.usuarios SET activo=false WHERE id=owner_id;EXECUTE 'SET LOCAL ROLE authenticated';PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);PERFORM public.fn_financial_sale_correction_web('post',correction_key,NULL,owner_id);RAISE EXCEPTION USING ERRCODE='ZX002';
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;IF message NOT LIKE '%Fresh active Gerencia%' THEN RAISE;END IF;END;
 IF pg_temp.lifecycle_domain()<>before_data THEN RAISE EXCEPTION 'Revoked actor rollback';END IF;
 facts=facts||jsonb_build_array('revoked current actor refuses even with original owner key');
 FOR changed IN SELECT x FROM jsonb_array_elements(jsonb_build_array(
  jsonb_set(draft-'observed','{fields,value}','"NaN"'),
  jsonb_set(draft-'observed','{fields,value}','"0"'),
  jsonb_set(draft-'observed','{fields,value}','"1.001"'),
  jsonb_set(draft-'observed','{fields,buyerId}','true'),
  jsonb_set(draft-'observed','{fields,extra}','"forbidden"'),
  jsonb_set(draft-'observed','{fields,date}','"2026-02-30"')))x LOOP
  BEGIN
   EXECUTE 'SET LOCAL ROLE authenticated';PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);PERFORM public.fn_financial_sale_correction_source_web(changed,owner_id);RAISE EXCEPTION USING ERRCODE='ZX002';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;IF SQLSTATE='ZX002' THEN RAISE;END IF;IF message NOT LIKE '%required%' AND message NOT LIKE '%allowed%' AND message NOT LIKE '%out of range%' THEN RAISE;END IF;END;
  IF pg_temp.lifecycle_domain()<>before_data THEN RAISE EXCEPTION 'Invalid intent rollback';END IF;
  facts=facts||jsonb_build_array('strict shape/reference/date/exact-money admission rejects malformed field');
 END LOOP;
 FOR claims IN SELECT x FROM jsonb_array_elements(jsonb_build_array(
  jsonb_build_object('label','retained sale audit grant','statement','GRANT INSERT ON hato_sale.audit TO authenticated'),
  jsonb_build_object('label','retained sale trigger','statement','ALTER TABLE hato_sale.audit DISABLE TRIGGER immutable_sale_audit'),
  jsonb_build_object('label','retained creation function','statement','ALTER FUNCTION public.fn_hato_sale_web(text,uuid,jsonb,uuid) SET search_path=public'),
  jsonb_build_object('label','private column','statement','ALTER TABLE financial_sale_correction.requests ADD COLUMN unreviewed text'),
  jsonb_build_object('label','private grant','statement','GRANT UPDATE ON financial_sale_correction.audit TO authenticated'),
  jsonb_build_object('label','source config','statement','ALTER FUNCTION financial_sale_correction.source(jsonb) SET search_path=public'),
  jsonb_build_object('label','source STRICT','statement','ALTER FUNCTION financial_sale_correction.source(jsonb) STRICT'),
  jsonb_build_object('label','immutable trigger','statement','ALTER TABLE financial_sale_correction.audit DISABLE TRIGGER immutable_correction_audit'),
  jsonb_build_object('label','guard no-op','statement','CREATE OR REPLACE FUNCTION financial_sale_correction.assert_controls() RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $noop$ BEGIN RETURN;END $noop$')))x LOOP
  BEGIN
   EXECUTE(claims->>'statement');EXECUTE 'SET LOCAL ROLE authenticated';PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);PERFORM public.fn_financial_sale_correction_web('post',correction_key,NULL,owner_id);RAISE EXCEPTION USING ERRCODE='ZX002';
  EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;IF message NOT LIKE '%drift%' THEN RAISE;END IF;END;
  IF pg_temp.lifecycle_domain()<>before_data THEN RAISE EXCEPTION 'Binding drift rollback %',claims->>'label';END IF;
  facts=facts||jsonb_build_array((claims->>'label')||' drift refuses with complete rollback');
 END LOOP;
 -- Exact private metadata refuses an unreviewed audit trigger before dispatch.

 BEGIN
  EXECUTE 'CREATE FUNCTION pg_temp.synthetic_sale_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $fault$ BEGIN RETURN NULL;END $fault$';
  EXECUTE 'CREATE TRIGGER synthetic_sale_audit_fault BEFORE INSERT ON financial_sale_correction.audit FOR EACH ROW EXECUTE FUNCTION pg_temp.synthetic_sale_audit_fault()';
  EXECUTE 'SET LOCAL ROLE authenticated';PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);PERFORM public.fn_financial_sale_correction_web('post',correction_key,NULL,owner_id);RAISE EXCEPTION USING ERRCODE='ZX002';
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS message=MESSAGE_TEXT;IF message NOT LIKE '%private metadata drift%' THEN RAISE;END IF;END;
 IF pg_temp.lifecycle_domain()<>before_data THEN RAISE EXCEPTION 'Late audit failure whole rollback';END IF;
 facts=facts||jsonb_build_array('unreviewed audit suppression trigger refuses before posting with exact financial/control/domain rollback; original remains pending');
 EXECUTE 'SET LOCAL ROLE authenticated';PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);result=public.fn_financial_sale_correction_recover_web(owner_id);
 IF result IS DISTINCT FROM original_request THEN RAISE EXCEPTION 'Independent owner recovery preserves captured original';END IF;
 result=public.fn_financial_sale_correction_web('post',correction_key,NULL,owner_id);EXECUTE 'RESET ROLE';
 IF result->>'state' IS DISTINCT FROM 'committed' OR NOT EXISTS(SELECT 1 FROM financial_sale_correction.audit WHERE request_key=correction_key AND receipt=result->'receipt') OR(result->'receipt'->'after'->'income'->>'valor')::numeric IS DISTINCT FROM 123500.25 OR result->'receipt'->'actor'->>'profileId' IS DISTINCT FROM owner_id::text OR (SELECT to_jsonb(i) FROM public.fin_ingresos i WHERE id=income_id) IS DISTINCT FROM result->'receipt'->'after'->'income' OR (SELECT receipt FROM hato_sale.audit WHERE request_key=sale_key) IS DISTINCT FROM original_sale THEN RAISE EXCEPTION 'Exact financial correction and retained original required';END IF;
 IF (SELECT jsonb_object_agg(f.key,f.value) FROM public.fin_ingresos i CROSS JOIN LATERAL jsonb_each(to_jsonb(i)) f WHERE i.id=income_id AND f.key=ANY(financial_fields)) IS DISTINCT FROM expected_financial THEN RAISE EXCEPTION 'Independent income row must contain all eight reviewed financial values';END IF;
 facts=facts||jsonb_build_array('all eight changed financial fields match the prepared plan and independent committed income row exactly');
 facts=facts||jsonb_build_array('same original commits exactly after known rollback with current actor and independent exact financial/audit readback');
 IF ((result->'receipt'->'after'->'income')-'fecha'-'negocio_id'-'categoria_id'-'nombre'-'region_id'-'medio_pago_id'-'comprador_id'-'valor'-'updated_by'-'updated_at') IS DISTINCT FROM(saved_income-'fecha'-'negocio_id'-'categoria_id'-'nombre'-'region_id'-'medio_pago_id'-'comprador_id'-'valor'-'updated_by'-'updated_at') THEN RAISE EXCEPTION 'Financial-only correction changed another field';END IF;
 facts=facts||jsonb_build_array('only authorized financial fields change; invoice/observations/quantity/creator remain exact');
 before_data=pg_temp.lifecycle_domain();EXECUTE 'SET LOCAL ROLE authenticated';PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
 IF public.fn_financial_sale_correction_web('post',correction_key,NULL,owner_id) IS DISTINCT FROM result OR public.fn_financial_sale_correction_recover_web(owner_id) IS DISTINCT FROM result THEN RAISE EXCEPTION 'Original committed recovery mismatch';END IF;
 EXECUTE 'RESET ROLE';IF pg_temp.lifecycle_domain()<>before_data THEN RAISE EXCEPTION 'Retry mutated original';END IF;
 facts=facts||jsonb_build_array('lost-reply original key/independent owner recovery return first committed receipt without repeating mutation');
 EXECUTE 'SET LOCAL ROLE authenticated';PERFORM public.fn_financial_sale_correction_web('acknowledge',correction_key,NULL,owner_id);result=public.fn_financial_sale_correction_recover_web(owner_id);EXECUTE 'RESET ROLE';IF result IS NOT NULL THEN RAISE EXCEPTION 'Explicit terminal acknowledgement required before replacement';END IF;
 facts=facts||jsonb_build_array('explicit terminal acknowledgement releases only owner recovery slot and retains original receipt/audit');
 INSERT INTO lifecycle_admission_result VALUES(jsonb_build_object('checks',facts,'all_new_fixtures_rolled_back',true));
END $admission$;
SELECT value FROM lifecycle_admission_result;
ROLLBACK;
