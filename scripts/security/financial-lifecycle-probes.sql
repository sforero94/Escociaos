-- Contained synthetic admission only. Every new fixture/protected receipt/probe rolls back.
BEGIN;
CREATE FUNCTION pg_temp.lifecycle_domain() RETURNS jsonb LANGUAGE sql AS $domain$ {{DOMAIN_QUERY}} $domain$;
CREATE TEMP TABLE lifecycle_admission_result(value jsonb);
DO $admission$
DECLARE owner_id uuid={{OWNER}};fixture_animal_id uuid={{ANIMAL}};sale_key uuid={{SALEKEY}};tx_id uuid={{TX}};new_income uuid={{INCOME}};
 business uuid;category uuid;region uuid;medium uuid;template public.hato_animales;animal public.hato_animales;income public.fin_ingresos;income_id uuid;shared_id uuid;shared_count int;affected int;movement uuid;before_data jsonb;original_sale jsonb;posted jsonb;intent jsonb;day date=(now() AT TIME ZONE 'America/Bogota')::date;facts jsonb='[]';observed boolean;outcome text;claims jsonb;
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
 IF posted->>'state'<>'committed' OR income_id IS NULL OR NOT EXISTS(SELECT 1 FROM hato_sale.audit WHERE request_key=sale_key AND receipt=original_sale) OR NOT EXISTS(SELECT 1 FROM public.hato_eventos WHERE animal_id=animal.id AND fin_ingreso_id=income_id AND tipo='venta') THEN RAISE EXCEPTION 'Genuine retained protected sale required';END IF;
 facts=facts||jsonb_build_array('genuine protected sale created through original prepare/post API with immutable audit, linked venta event and sold animal');before_data=pg_temp.lifecycle_domain();
 BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';UPDATE public.fin_ingresos SET valor=valor+1 WHERE id=income_id;EXECUTE 'RESET ROLE';
  observed=(SELECT valor FROM public.fin_ingresos WHERE id=income_id)=(original_sale->'income'->>'valor')::numeric+1 AND(SELECT receipt FROM hato_sale.audit WHERE request_key=sale_key)=original_sale;
  RAISE EXCEPTION USING ERRCODE='ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;END;
 IF observed IS DISTINCT FROM true OR pg_temp.lifecycle_domain()<>before_data THEN RAISE EXCEPTION 'Protected sale financial-edit admission/rollback';END IF;
 facts=facts||jsonb_build_array('ordinary direct sale income value edit diverges from retained original audit; entire counterexample rolled back');
 outcome=NULL;
 BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';DELETE FROM public.fin_ingresos WHERE id=income_id;EXECUTE 'RESET ROLE';
  outcome=CASE WHEN NOT EXISTS(SELECT 1 FROM public.fin_ingresos WHERE id=income_id) AND EXISTS(SELECT 1 FROM public.hato_eventos WHERE animal_id=animal.id AND tipo='venta' AND fin_ingreso_id IS NULL) AND EXISTS(SELECT 1 FROM public.hato_animales WHERE id=animal.id AND estado='vendida') THEN 'ordinary sale income delete detaches linked event while sold animal and immutable original remain' ELSE 'ordinary sale income delete succeeded; inspect exact retained-link semantics before implementation' END;
  RAISE EXCEPTION USING ERRCODE='ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;WHEN foreign_key_violation THEN outcome='ordinary sale income delete blocked by retained FK';WHEN insufficient_privilege THEN outcome='ordinary sale income delete blocked by current trusted boundary';END;
 IF outcome IS NULL OR pg_temp.lifecycle_domain()<>before_data THEN RAISE EXCEPTION 'Sale deletion admission/rollback';END IF;
 facts=facts||jsonb_build_array(outcome||'; entire counterexample rolled back');
 SELECT fin_ingreso_id INTO STRICT shared_id FROM public.hato_produccion_quincenal WHERE origen_dato='derivado_mensual' ORDER BY id LIMIT 1;
 INSERT INTO public.hato_produccion_quincenal(id,anio,mes,quincena,litros_total,origen_dato,created_by,fin_ingreso_id) VALUES(gen_random_uuid(),2091,8,1,4,'derivado_mensual',owner_id,shared_id);
 SELECT count(*) INTO shared_count FROM public.hato_produccion_quincenal WHERE fin_ingreso_id=shared_id;IF shared_count<2 THEN RAISE EXCEPTION 'Shared historical alias fixture required';END IF;before_data=pg_temp.lifecycle_domain();
 BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';UPDATE public.fin_ingresos SET valor=valor+1 WHERE id=shared_id;EXECUTE 'RESET ROLE';
  observed=FOUND AND(SELECT count(*) FROM public.hato_produccion_quincenal WHERE fin_ingreso_id=shared_id)=shared_count;
  RAISE EXCEPTION USING ERRCODE='ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;END;
 IF observed IS DISTINCT FROM true OR pg_temp.lifecycle_domain()<>before_data THEN RAISE EXCEPTION 'Shared derived income edit admission/rollback';END IF;
 facts=facts||jsonb_build_array('ordinary shared derived-monthly financial edit changes one income behind multiple unchanged aliases; entire counterexample rolled back');
 SELECT * INTO STRICT income FROM public.fin_ingresos WHERE id=income_id;income.id=new_income;income.nombre='Synthetic independent income';INSERT INTO public.fin_ingresos SELECT(income).*;before_data=pg_temp.lifecycle_domain();
 BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';UPDATE public.fin_ingresos SET nombre='Synthetic competing writer' WHERE id=new_income;UPDATE public.fin_ingresos SET nombre='Synthetic stale form overwrite' WHERE id=new_income;EXECUTE 'RESET ROLE';
  observed=(SELECT nombre FROM public.fin_ingresos WHERE id=new_income)='Synthetic stale form overwrite';RAISE EXCEPTION USING ERRCODE='ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;END;
 IF observed IS DISTINCT FROM true OR pg_temp.lifecycle_domain()<>before_data THEN RAISE EXCEPTION 'Unlinked stale edit admission/rollback';END IF;
 facts=facts||jsonb_build_array('unlinked id-only edits permit stale last-writer overwrite without source CAS; both rolled back');
 INSERT INTO public.fin_transacciones_ganado(id,fecha,tipo,cantidad_cabezas,kilos_pagados,valor_total,finca,created_by,es_hato) VALUES(tx_id,day,'venta',1,240,123456,'Synthetic coupled admission',owner_id,false);
 SELECT id INTO STRICT movement FROM public.gan_movimientos WHERE transaccion_ganado_id=tx_id;
 IF NOT EXISTS(SELECT 1 FROM public.gan_movimientos WHERE id=movement AND estado='pendiente' AND novillos_delta=-1) THEN RAISE EXCEPTION 'Exact automatic pending movement required';END IF;
 before_data=pg_temp.lifecycle_domain();
 BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';UPDATE public.fin_transacciones_ganado SET cantidad_cabezas=2,kilos_pagados=600 WHERE id=tx_id;EXECUTE 'RESET ROLE';
  observed=(SELECT cantidad_cabezas FROM public.fin_transacciones_ganado WHERE id=tx_id)=2 AND EXISTS(SELECT 1 FROM public.gan_movimientos WHERE id=movement AND novillos_delta=-1 AND peso_promedio_kg=240);
  RAISE EXCEPTION USING ERRCODE='ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;END;
 IF observed IS DISTINCT FROM true OR pg_temp.lifecycle_domain()<>before_data THEN RAISE EXCEPTION 'Ganado header/pending movement divergence admission/rollback';END IF;
 facts=facts||jsonb_build_array('ordinary ganado header edit leaves generated pending count/weight unchanged; entire counterexample rolled back');
 BEGIN
  EXECUTE 'SET LOCAL ROLE authenticated';UPDATE public.fin_transacciones_ganado SET finca=finca WHERE id=gen_random_uuid();GET DIAGNOSTICS affected=ROW_COUNT;EXECUTE 'RESET ROLE';observed=affected=0;RAISE EXCEPTION USING ERRCODE='ZX001';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;END;
 IF observed IS DISTINCT FROM true OR pg_temp.lifecycle_domain()<>before_data THEN RAISE EXCEPTION 'Missing-target admission/rollback';END IF;
 facts=facts||jsonb_build_array('id-only ordinary update of missing ganado target returns zero rows without an error; no success receipt proof');
 INSERT INTO lifecycle_admission_result VALUES(jsonb_build_object('checks',facts,'sale_delete_outcome',outcome,'shared_aliases',shared_count,'all_probe_mutations_rolled_back',true));
END $admission$;
SELECT value FROM lifecycle_admission_result;
ROLLBACK;
