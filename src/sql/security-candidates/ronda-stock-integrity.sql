-- Local review candidate only. Unapplied; no numbered migration or caller changes.
-- Whole privileged boundary preserves existing JSON signatures, worker modules and
-- approved-delta/capture business meaning. Direct-DML retirement is coordinated.
BEGIN;
DO $gate$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.fn_ronda_aplicar_ajuste(jsonb)') AND NOT prosecdef AND md5(prosrc)='b9e8e9d24585f571e1f9a2dd89d075b0') THEN RAISE EXCEPTION 'Captured ronda entry drift: fn_ronda_aplicar_ajuste'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.fn_ronda_resolver_con_captura(jsonb)') AND NOT prosecdef AND md5(prosrc)='611a7d7b6ba8bc5e101e8782c0a40f49') THEN RAISE EXCEPTION 'Captured ronda entry drift: fn_ronda_resolver_con_captura'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.fn_ronda_validar_actor(uuid,uuid,text)') AND NOT prosecdef AND md5(prosrc)='9a28228bd43e05dd47c1a9c280c0e534') THEN RAISE EXCEPTION 'Captured ronda entry drift: fn_ronda_validar_actor'; END IF;
END $gate$;
CREATE SCHEMA ronda_stock_integrity;
REVOKE ALL ON SCHEMA ronda_stock_integrity FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE ronda_stock_integrity.proofs(
 exception_id uuid PRIMARY KEY, operation text NOT NULL CHECK(operation IN ('adjust','capture')),
 origin text NOT NULL CHECK(origin IN ('human','telegram')),actor_id uuid NOT NULL,payload jsonb NOT NULL,
 actor_snapshot jsonb NOT NULL,before_product jsonb NOT NULL,before_exception jsonb NOT NULL,
 sources jsonb NOT NULL,actual_product jsonb,actual_exception jsonb,actual_movement jsonb,result jsonb,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE ronda_stock_integrity.proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ronda_stock_integrity.proofs FROM PUBLIC,anon,authenticated,service_role;
-- A completed exception receipt is a permanent prospective fact. Only the
-- first pending -> complete transition is legal; originals never change.
CREATE FUNCTION ronda_stock_integrity.preserve_proof() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Ronda proof cannot be deleted'; END IF;
 IF OLD.result IS NOT NULL OR
 (to_jsonb(NEW)-ARRAY['actual_product','actual_exception','actual_movement','result']) IS DISTINCT FROM
 (to_jsonb(OLD)-ARRAY['actual_product','actual_exception','actual_movement','result']) OR
 OLD.actual_product IS NOT NULL OR OLD.actual_exception IS NOT NULL OR OLD.actual_movement IS NOT NULL OR
 NEW.actual_product IS NULL OR NEW.actual_exception IS NULL OR NEW.actual_movement IS NULL OR NEW.result IS NULL
 THEN RAISE EXCEPTION 'Ronda proof originals/completed receipt are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER preserve_ronda_proof BEFORE UPDATE OR DELETE ON ronda_stock_integrity.proofs
FOR EACH ROW EXECUTE FUNCTION ronda_stock_integrity.preserve_proof();
CREATE FUNCTION ronda_stock_integrity.authorize(p_usuario uuid,p_telegram uuid,p_modulo text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
DECLARE profile public.usuarios%ROWTYPE; registration public.telegram_usuarios%ROWTYPE; link uuid; fetched public.telegram_usuarios%ROWTYPE;
BEGIN
 IF (p_usuario IS NULL)=(p_telegram IS NULL) THEN RAISE EXCEPTION 'Exactly one ronda actor required'; END IF;
 IF auth.uid() IS NOT NULL THEN
  IF p_telegram IS NOT NULL OR p_usuario IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Ronda actor/session mismatch'; END IF;
  SELECT * INTO profile FROM public.usuarios WHERE id=auth.uid() FOR SHARE;
  IF NOT FOUND OR profile.activo IS DISTINCT FROM true OR profile.rol IS NULL OR profile.rol::text NOT IN ('Administrador','Gerencia') THEN RAISE EXCEPTION 'Current active Administrador/Gerencia required'; END IF;
  RETURN jsonb_build_object('origin','human','actor_id',profile.id,'profile',to_jsonb(profile),'registration',NULL);
 END IF;
 IF p_telegram IS NULL OR NOT (current_setting('role',true)='service_role' OR session_user='service_role') THEN RAISE EXCEPTION 'Trusted Telegram service lane required'; END IF;
 SELECT * INTO fetched FROM public.telegram_usuarios WHERE id=p_telegram;
 IF NOT FOUND THEN RAISE EXCEPTION 'Current Telegram registration required'; END IF;
 IF fetched.rol_bot='gerencia' THEN
  SELECT * INTO profile FROM public.usuarios WHERE id=fetched.usuario_id FOR SHARE;
  IF NOT FOUND OR profile.activo IS DISTINCT FROM true OR profile.rol IS DISTINCT FROM 'Gerencia'::public.rol_usuario THEN RAISE EXCEPTION 'Telegram gerencia requires linked active Gerencia'; END IF;
 END IF;
 SELECT * INTO registration FROM public.telegram_usuarios WHERE id=p_telegram FOR SHARE;
 IF NOT FOUND OR registration.activo IS DISTINCT FROM true OR registration.rol_bot IS NULL OR registration.rol_bot NOT IN ('campo','admin','gerencia')
 OR registration IS DISTINCT FROM fetched OR NOT coalesce(p_modulo=ANY(registration.modulos_permitidos),false) THEN RAISE EXCEPTION 'Current Telegram registration/module changed or unauthorized'; END IF;
 RETURN jsonb_build_object('origin','telegram','actor_id',registration.id,'profile',CASE WHEN registration.rol_bot='gerencia' THEN to_jsonb(profile) ELSE NULL END,'registration',to_jsonb(registration));
END $$;
-- Shared read/admission helper remains callable for existing ronda RPCs; it cannot mint proof.
CREATE OR REPLACE FUNCTION public.fn_ronda_validar_actor(p_usuario uuid,p_telegram uuid,p_modulo text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
BEGIN PERFORM ronda_stock_integrity.authorize(p_usuario,p_telegram,p_modulo); END $$;
CREATE FUNCTION ronda_stock_integrity.assert_boundary() RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $guard$
DECLARE policies jsonb; spec text[];
BEGIN
 SELECT coalesce(jsonb_agg(jsonb_build_object('tablename',p.tablename,'policyname',p.policyname,'cmd',p.cmd,'permissive',p.permissive,'qual',p.qual,'with_check',p.with_check,'roles',p.roles)
 ORDER BY p.tablename COLLATE "C",p.policyname COLLATE "C"),'[]') INTO policies FROM pg_policies p WHERE p.schemaname='public' AND p.tablename IN ('productos','movimientos_inventario');
 SELECT coalesce(jsonb_agg(value ORDER BY (value->>'tablename') COLLATE "C",(value->>'policyname') COLLATE "C"),'[]') INTO policies FROM jsonb_array_elements(policies)
 WHERE value IS DISTINCT FROM '{"tablename":"productos","policyname":"active_account_required","cmd":"ALL","permissive":"RESTRICTIVE","roles":["authenticated"],"qual":"(( SELECT get_user_role() AS get_user_role) IS NOT NULL)","with_check":"(( SELECT get_user_role() AS get_user_role) IS NOT NULL)"}'::jsonb;
 IF policies IS DISTINCT FROM '[{"tablename": "movimientos_inventario", "policyname": "Administrador puede todo en movimientos", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "movimientos_inventario", "policyname": "Gerencia acceso total", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Gerencia''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "movimientos_inventario", "policyname": "Verificador lee movimientos", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Verificador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "productos", "policyname": "Administrador actualiza productos", "cmd": "UPDATE", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "productos", "policyname": "Administrador escritura productos", "cmd": "INSERT", "permissive": "PERMISSIVE", "qual": null, "with_check": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "roles": ["public"]}, {"tablename": "productos", "policyname": "Administrador lectura productos", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Administrador''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "productos", "policyname": "Gerencia acceso total", "cmd": "ALL", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Gerencia''::rol_usuario)", "with_check": null, "roles": ["public"]}, {"tablename": "productos", "policyname": "Permitir lectura de precios a usuarios autenticados", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "productos", "policyname": "Usuarios autenticados leen productos", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "true", "with_check": null, "roles": ["authenticated"]}, {"tablename": "productos", "policyname": "Verificador lee productos", "cmd": "SELECT", "permissive": "PERMISSIVE", "qual": "(( SELECT get_user_role() AS get_user_role) = ''Verificador''::rol_usuario)", "with_check": null, "roles": ["public"]}]'::jsonb THEN RAISE EXCEPTION 'Ronda stock policy boundary drift'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.fn_ronda_actor_correo(uuid,uuid)') AND NOT prosecdef AND provolatile='s' AND md5(prosrc)=md5($correo$
  SELECT COALESCE(
    (SELECT NULLIF(btrim(u.email), '')
       FROM usuarios u
      WHERE u.id = COALESCE(
              p_usuario,
              (SELECT t.usuario_id FROM telegram_usuarios t WHERE t.id = p_telegram)
            )),
    (SELECT t.nombre_display FROM telegram_usuarios t WHERE t.id = p_telegram),
    'Ronda de inventario'
  );
$correo$)) THEN RAISE EXCEPTION 'Reviewed ronda attribution helper drift'; END IF;
 -- Historical 125 policy contract for uncaptured ronda tables, not hosted certification.
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='rondas_excepciones')<>3
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rondas_excepciones' AND policyname='rondas_excepciones_select_authenticated' AND cmd='SELECT' AND permissive='PERMISSIVE' AND to_jsonb(roles)='["authenticated"]'::jsonb AND qual='true' AND with_check IS NULL)
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rondas_excepciones' AND policyname='rondas_excepciones_insert_admin_gerencia' AND cmd='INSERT' AND permissive='PERMISSIVE' AND to_jsonb(roles)='["authenticated"]'::jsonb AND qual IS NULL AND with_check='(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Administrador''::rol_usuario, ''Gerencia''::rol_usuario]))')
 OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='rondas_excepciones' AND policyname='rondas_excepciones_update_admin_gerencia' AND cmd='UPDATE' AND permissive='PERMISSIVE' AND to_jsonb(roles)='["authenticated"]'::jsonb AND qual='(( SELECT get_user_role() AS get_user_role) = ANY (ARRAY[''Administrador''::rol_usuario, ''Gerencia''::rol_usuario]))' AND with_check=qual)
 THEN RAISE EXCEPTION 'Ronda exception policy prerequisite drift'; END IF;
 IF (SELECT array_agg(attname::text ORDER BY attname) FROM pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attnum>0 AND NOT attisdropped) IS DISTINCT FROM
 ARRAY['aplicacion_id','cantidad','created_at','factura','fecha_movimiento','id','lote_aplicacion','notas','observaciones','producto_id','provisional','responsable','saldo_anterior','saldo_nuevo','tipo_movimiento','unidad','valor_movimiento']::text[]
 THEN RAISE EXCEPTION 'Ronda ledger column prerequisite drift'; END IF;
 FOREACH spec SLICE 1 IN ARRAY ARRAY[['productos','cantidad_actual'],['productos','precio_unitario'],['movimientos_inventario','cantidad'],['movimientos_inventario','saldo_anterior'],['movimientos_inventario','saldo_nuevo'],['movimientos_inventario','valor_movimiento']] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=('public.'||spec[1])::regclass AND attname=spec[2] AND format_type(atttypid,atttypmod)='numeric(12,2)' AND NOT attisdropped) THEN RAISE EXCEPTION 'Ronda numeric precision prerequisite drift'; END IF;
 END LOOP;
 FOREACH spec SLICE 1 IN ARRAY ARRAY[['usuarios','id'],['telegram_usuarios','id'],['productos','id'],['rondas_excepciones','id'],['rondas_inventario','id'],['inventario_causas_raiz','clave']] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname=spec[2]
 WHERE c.conrelid=('public.'||spec[1])::regclass AND c.contype='p' AND c.conkey=ARRAY[a.attnum])
 THEN RAISE EXCEPTION 'Ronda source identity primary-key prerequisite drift'; END IF;
 END LOOP;
 FOREACH spec SLICE 1 IN ARRAY ARRAY[['rondas_excepciones','cantidad_fisica'],['rondas_excepciones','teorico_conteo']] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=('public.'||spec[1])::regclass AND attname=spec[2] AND format_type(atttypid,atttypmod)='numeric' AND NOT attisdropped)
 THEN RAISE EXCEPTION 'Ronda physical/theoretical precision prerequisite drift'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_class WHERE oid=ANY(ARRAY['public.productos'::regclass,'public.movimientos_inventario'::regclass,'public.rondas_excepciones'::regclass]) AND (NOT relrowsecurity OR relforcerowsecurity OR relkind<>'r'))
 OR EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='ronda_stock_integrity.proofs'::regclass AND contype='f') THEN RAISE EXCEPTION 'Unsupported ronda privilege/schema prerequisite'; END IF;
 -- Deferred user triggers could rewrite a verified receipt after this RPC
 -- returns. They require separate review and cannot run on this boundary.
 IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgdeferrable AND tgenabled<>'D' AND tgrelid=ANY(ARRAY[
 'public.productos'::regclass,'public.movimientos_inventario'::regclass,'public.rondas_excepciones'::regclass,
 'public.rondas_inventario'::regclass,'public.inventario_causas_raiz'::regclass,
 'public.usuarios'::regclass,'public.telegram_usuarios'::regclass,'ronda_stock_integrity.proofs'::regclass]))
 THEN RAISE EXCEPTION 'Deferred ronda source/result trigger requires review'; END IF;
 -- Privileged APIs deliberately do not require ordinary stock UPDATE/ledger INSERT:
 -- coordinated direct-DML retirement must leave these protected wrappers functional.
END $guard$;
SELECT ronda_stock_integrity.assert_boundary();
CREATE FUNCTION ronda_stock_integrity.number(value numeric,minimum numeric,maximum numeric) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN IF value IS NULL OR value::text IN ('NaN','Infinity','-Infinity') OR value<minimum OR value>maximum THEN RAISE EXCEPTION 'Finite bounded ronda number required'; END IF; RETURN value; END $$;
CREATE FUNCTION ronda_stock_integrity.post(operation text,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public SET lock_timeout='5s' AS $$
<<post>>
DECLARE user_id uuid:=nullif(payload->>'actor_usuario_id','')::uuid; tg_id uuid:=nullif(payload->>'actor_telegram_usuario_id','')::uuid;
 exception_id uuid:=nullif(payload->>'excepcion_id','')::uuid; fecha date:=nullif(payload->>'fecha_movimiento','')::date;
 actor jsonb; allowed boolean:=false; module text; proof ronda_stock_integrity.proofs%ROWTYPE;
 exception_before public.rondas_excepciones%ROWTYPE; product_before public.productos%ROWTYPE; product_id uuid;
 exception_after jsonb; product_after jsonb; movement jsonb; expected jsonb; expected_product jsonb; sources jsonb; round_source jsonb; cause_source jsonb;
 ledger_before jsonb; quantity numeric; physical numeric; delta numeric; before_stock numeric; after_stock numeric; price numeric; result jsonb; movement_id uuid; baseline bigint; count_after bigint;
 tipo text; observations text; proof_time timestamptz; confirmed boolean:=coalesce((payload->>'confirmar_cambio_teorico')::boolean,false);
BEGIN
 IF operation NOT IN ('adjust','capture') OR exception_id IS NULL OR fecha IS NULL OR jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Exact ronda operation required'; END IF;
 IF operation='capture' THEN actor:=ronda_stock_integrity.authorize(user_id,tg_id,'inventario_explicacion');
 ELSE
 FOREACH module IN ARRAY ARRAY['inventario_ronda','inventario_explicacion','inventario_aprobacion'] LOOP
 BEGIN actor:=ronda_stock_integrity.authorize(user_id,tg_id,module);allowed:=true;EXIT; EXCEPTION WHEN OTHERS THEN NULL; END;
 END LOOP;
 IF NOT allowed THEN RAISE EXCEPTION 'Current approved ronda module/actor required'; END IF;
 END IF;
 PERFORM ronda_stock_integrity.assert_boundary();
 PERFORM pg_advisory_xact_lock(hashtextextended('ronda-stock:'||exception_id::text,0));
 SELECT * INTO proof FROM ronda_stock_integrity.proofs p WHERE p.exception_id=post.exception_id FOR UPDATE;
 IF FOUND THEN
 IF proof.operation IS DISTINCT FROM operation OR proof.payload IS DISTINCT FROM payload OR proof.origin IS DISTINCT FROM actor->>'origin' OR proof.actor_id IS DISTINCT FROM (actor->>'actor_id')::uuid OR proof.result IS NULL OR proof.actual_movement IS NULL OR proof.actual_exception IS NULL OR proof.actual_product IS NULL THEN RAISE EXCEPTION 'Ronda proof original/actor conflict or incomplete'; END IF;
 -- The returned balances are the original event, never a new claim about current stock.
 IF NOT EXISTS(SELECT 1 FROM public.movimientos_inventario m WHERE to_jsonb(m)=proof.actual_movement)
 OR NOT EXISTS(SELECT 1 FROM public.rondas_excepciones e WHERE e.id=post.exception_id AND to_jsonb(e)=proof.actual_exception) THEN RAISE EXCEPTION 'Ronda proof no longer matches its exception/movement'; END IF;
 RETURN proof.result;
 END IF;
 SELECT e.producto_id INTO product_id FROM public.rondas_excepciones e WHERE e.id=post.exception_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ronda exception missing'; END IF;
 -- One SKU per operation. SKU before exception gives deterministic shared-SKU order.
 SELECT * INTO product_before FROM public.productos WHERE id=product_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ronda SKU missing'; END IF;
 SELECT * INTO exception_before FROM public.rondas_excepciones e WHERE e.id=post.exception_id FOR UPDATE;
 IF NOT FOUND OR exception_before.producto_id IS DISTINCT FROM product_id THEN RAISE EXCEPTION 'Ronda source SKU changed'; END IF;
 IF (operation='adjust' AND exception_before.estado::text IS DISTINCT FROM 'ajuste_aprobado') OR (operation='capture' AND (exception_before.estado::text IS DISTINCT FROM 'explicada' OR exception_before.explicacion_david_en IS NULL))
 OR exception_before.aplicacion_movimiento_id IS NOT NULL OR exception_before.captura_movimiento_id IS NOT NULL THEN RAISE EXCEPTION 'Ronda exception has no unposted eligible operation'; END IF;
 before_stock:=ronda_stock_integrity.number(coalesce(product_before.cantidad_actual,0),0,9999999999.99);
 price:=ronda_stock_integrity.number(coalesce(product_before.precio_unitario,0),0,9999999999.99);
 PERFORM ronda_stock_integrity.number(exception_before.cantidad_fisica,0,9999999999.99);
 PERFORM ronda_stock_integrity.number(exception_before.teorico_conteo,0,9999999999.99);
 SELECT to_jsonb(r) INTO round_source FROM public.rondas_inventario r WHERE id=exception_before.ronda_id FOR SHARE;
 IF round_source IS NULL THEN RAISE EXCEPTION 'Ronda source missing'; END IF;
 SELECT to_jsonb(c) INTO cause_source FROM public.inventario_causas_raiz c WHERE clave=exception_before.decision_causa FOR SHARE;
 sources:=jsonb_build_object('ronda',round_source,'causa',cause_source);
 IF operation='adjust' THEN
 delta:=round(exception_before.cantidad_fisica-exception_before.teorico_conteo,2); quantity:=delta; tipo:='Ajuste';
 IF before_stock IS DISTINCT FROM exception_before.teorico_conteo AND NOT confirmed THEN
 RETURN jsonb_build_object('aplicado',false,'motivo','teorico_cambio','excepcion_id',exception_id,'teorico_al_conteo',exception_before.teorico_conteo,'teorico_hoy',before_stock,'delta',delta); END IF;
 after_stock:=ronda_stock_integrity.number(before_stock+delta,0,9999999999.99);
 observations:='Ronda '||to_char((round_source->>'periodo')::date,'YYYY-MM')||coalesce(' · '||(cause_source->>'etiqueta'),'')||' · excepción '||exception_id::text;
 ELSE
 tipo:=payload->>'tipo_movimiento';IF tipo IS NULL OR tipo NOT IN ('Entrada','Salida por Aplicación','Salida Otros') THEN RAISE EXCEPTION 'Actual capture movement type required'; END IF;
 quantity:=round(ronda_stock_integrity.number((payload->>'cantidad')::numeric,0,9999999999.99),2);
 IF quantity<=0 THEN RAISE EXCEPTION 'Capture must remain positive after precision normalization'; END IF;
 physical:=ronda_stock_integrity.number((payload->>'cantidad_fisica_confirmada')::numeric,0,9999999999.99);
 delta:=CASE WHEN tipo='Entrada' THEN quantity ELSE -quantity END;
 after_stock:=ronda_stock_integrity.number(before_stock+delta,0,9999999999.99);
 observations:=coalesce(nullif(payload->>'observaciones',''),'Captura directa -- ronda de inventario, excepción '||exception_id::text);
 END IF;
 PERFORM ronda_stock_integrity.number(round(abs(quantity)*price,2),0,9999999999.99);
 LOCK TABLE public.movimientos_inventario IN SHARE ROW EXCLUSIVE MODE;
 SELECT count(*),coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]') INTO baseline,ledger_before FROM public.movimientos_inventario m WHERE producto_id=product_id;
 sources:=sources||jsonb_build_object('ledger_before',ledger_before);
 proof_time:=clock_timestamp();
 INSERT INTO ronda_stock_integrity.proofs(exception_id,operation,origin,actor_id,payload,actor_snapshot,before_product,before_exception,sources,created_at)
 VALUES(exception_id,operation,actor->>'origin',(actor->>'actor_id')::uuid,payload,actor,to_jsonb(product_before),to_jsonb(exception_before),sources,proof_time) RETURNING * INTO proof;
 IF proof.created_at IS DISTINCT FROM proof_time THEN RAISE EXCEPTION 'Ronda proof trusted timestamp rewritten'; END IF;
 IF NOT FOUND OR proof.exception_id IS DISTINCT FROM exception_id OR proof.operation IS DISTINCT FROM operation OR proof.origin IS DISTINCT FROM actor->>'origin' OR proof.actor_id IS DISTINCT FROM (actor->>'actor_id')::uuid OR proof.payload IS DISTINCT FROM payload OR proof.actor_snapshot IS DISTINCT FROM actor OR proof.before_product IS DISTINCT FROM to_jsonb(product_before) OR proof.before_exception IS DISTINCT FROM to_jsonb(exception_before) OR proof.sources IS DISTINCT FROM sources OR proof.result IS NOT NULL OR proof.actual_product IS NOT NULL OR proof.actual_exception IS NOT NULL OR proof.actual_movement IS NOT NULL THEN RAISE EXCEPTION 'Trusted ronda proof insertion suppressed/rewritten'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.productos p WHERE p.id=product_id AND to_jsonb(p)=to_jsonb(product_before)) OR NOT EXISTS(SELECT 1 FROM public.rondas_excepciones e WHERE e.id=post.exception_id AND to_jsonb(e)=to_jsonb(exception_before)) THEN RAISE EXCEPTION 'Ronda proof trigger changed original sources'; END IF;
 INSERT INTO public.movimientos_inventario(producto_id,tipo_movimiento,cantidad,unidad,fecha_movimiento,saldo_anterior,saldo_nuevo,responsable,observaciones,provisional,valor_movimiento,factura,lote_aplicacion,aplicacion_id,created_at,notas)
 VALUES(product_id,tipo::public.tipo_movimiento,quantity,product_before.unidad_medida,fecha,before_stock,after_stock,public.fn_ronda_actor_correo(user_id,tg_id),observations,false,round(abs(quantity)*price,2),CASE WHEN operation='capture' THEN nullif(payload->>'factura','') ELSE NULL END,CASE WHEN operation='capture' THEN nullif(payload->>'lote_aplicacion','') ELSE NULL END,CASE WHEN operation='capture' THEN nullif(payload->>'aplicacion_id','')::uuid ELSE NULL END,now(),NULL)
 RETURNING to_jsonb(movimientos_inventario) INTO movement;
 expected:=jsonb_build_object('producto_id',product_id,'tipo_movimiento',tipo,'cantidad',quantity,'unidad',product_before.unidad_medida,'fecha_movimiento',fecha,'saldo_anterior',before_stock,'saldo_nuevo',after_stock,'responsable',public.fn_ronda_actor_correo(user_id,tg_id),'observaciones',observations,'provisional',false,'valor_movimiento',round(abs(quantity)*price,2),'factura',CASE WHEN operation='capture' THEN nullif(payload->>'factura','') ELSE NULL END,'lote_aplicacion',CASE WHEN operation='capture' THEN nullif(payload->>'lote_aplicacion','') ELSE NULL END,'aplicacion_id',CASE WHEN operation='capture' THEN nullif(payload->>'aplicacion_id','')::uuid ELSE NULL END,'created_at',now(),'notas',NULL);
 IF NOT FOUND OR movement->>'id' IS NULL OR movement IS DISTINCT FROM (expected||jsonb_build_object('id',(movement->>'id')::uuid)) THEN RAISE EXCEPTION 'Ronda ledger insertion suppressed/rewritten'; END IF;movement_id:=(movement->>'id')::uuid;
 -- Preserve migration-112 attribution behavior: current human UID seals the
 -- edit; a no-UID worker keeps prior SKU metadata, with its identity in proof.
 expected_product:=to_jsonb(product_before)||jsonb_build_object('cantidad_actual',after_stock,'updated_at',now(),'updated_by',coalesce(auth.uid(),product_before.updated_by));
 UPDATE public.productos SET cantidad_actual=after_stock,updated_at=now(),updated_by=coalesce(auth.uid(),product_before.updated_by) WHERE id=product_id RETURNING to_jsonb(productos) INTO product_after;
 IF NOT FOUND OR product_after IS DISTINCT FROM expected_product THEN RAISE EXCEPTION 'Ronda SKU update suppressed/rewritten'; END IF;
 IF operation='adjust' THEN
 UPDATE public.rondas_excepciones SET estado='ajuste_aplicado',aplicacion_movimiento_id=movement_id,aplicacion_en=now(),aplicacion_por_usuario=user_id,aplicacion_por_telegram=tg_id,updated_at=now() WHERE id=post.exception_id RETURNING to_jsonb(rondas_excepciones) INTO exception_after;
 expected:=to_jsonb(exception_before)||jsonb_build_object('estado','ajuste_aplicado','aplicacion_movimiento_id',movement_id,'aplicacion_en',now(),'aplicacion_por_usuario',user_id,'aplicacion_por_telegram',tg_id,'updated_at',now());
 result:=jsonb_build_object('aplicado',true,'excepcion_id',exception_id,'movimiento_id',movement_id,'delta',delta,'saldo_anterior',before_stock,'saldo_nuevo',after_stock);
 ELSE
 UPDATE public.rondas_excepciones SET estado='resuelta_con_captura',cantidad_fisica=physical,captura_movimiento_id=movement_id,captura_en=now(),captura_por_usuario=user_id,captura_por_telegram=tg_id,updated_at=now() WHERE id=post.exception_id RETURNING to_jsonb(rondas_excepciones) INTO exception_after;
 expected:=to_jsonb(exception_before)||jsonb_build_object('estado','resuelta_con_captura','cantidad_fisica',physical,'captura_movimiento_id',movement_id,'captura_en',now(),'captura_por_usuario',user_id,'captura_por_telegram',tg_id,'updated_at',now());
 result:=jsonb_build_object('excepcion_id',exception_id,'movimiento_id',movement_id,'saldo_anterior',before_stock,'saldo_nuevo',after_stock,'cantidad_fisica_confirmada',physical);
 END IF;
 IF NOT FOUND OR exception_after IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Ronda exception transition suppressed/rewritten'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.productos p WHERE p.id=product_id AND to_jsonb(p)=product_after) OR NOT EXISTS(SELECT 1 FROM public.movimientos_inventario m WHERE m.id=movement_id AND to_jsonb(m)=movement) OR NOT EXISTS(SELECT 1 FROM public.rondas_excepciones e WHERE e.id=post.exception_id AND to_jsonb(e)=exception_after) THEN RAISE EXCEPTION 'Ronda final business proof changed'; END IF;
 SELECT count(*) INTO count_after FROM public.movimientos_inventario WHERE producto_id=product_id;IF count_after<>baseline+1 THEN RAISE EXCEPTION 'Unexpected ronda ledger posting'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(ledger_before) old WHERE NOT EXISTS(SELECT 1 FROM public.movimientos_inventario m WHERE to_jsonb(m)=old)) THEN RAISE EXCEPTION 'Prior SKU ledger row changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.rondas_inventario r WHERE r.id=exception_before.ronda_id AND to_jsonb(r)=round_source) OR (cause_source IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.inventario_causas_raiz c WHERE c.clave=exception_before.decision_causa AND to_jsonb(c)=cause_source)) THEN RAISE EXCEPTION 'Ronda descriptive sources changed'; END IF;
 UPDATE ronda_stock_integrity.proofs SET actual_product=product_after,actual_exception=exception_after,actual_movement=movement,result=post.result WHERE proofs.exception_id=post.exception_id RETURNING * INTO proof;
 IF proof.created_at IS DISTINCT FROM proof_time THEN RAISE EXCEPTION 'Ronda proof trusted timestamp rewritten'; END IF;
 IF NOT FOUND OR proof.exception_id IS DISTINCT FROM exception_id OR proof.operation IS DISTINCT FROM operation OR proof.origin IS DISTINCT FROM actor->>'origin' OR proof.actor_id IS DISTINCT FROM (actor->>'actor_id')::uuid OR proof.payload IS DISTINCT FROM payload OR proof.actor_snapshot IS DISTINCT FROM actor OR proof.before_product IS DISTINCT FROM to_jsonb(product_before) OR proof.before_exception IS DISTINCT FROM to_jsonb(exception_before) OR proof.sources IS DISTINCT FROM sources OR proof.actual_product IS DISTINCT FROM product_after OR proof.actual_exception IS DISTINCT FROM exception_after OR proof.actual_movement IS DISTINCT FROM movement OR proof.result IS DISTINCT FROM result THEN RAISE EXCEPTION 'Ronda trusted final proof suppressed/rewritten'; END IF;
 IF NOT EXISTS(SELECT 1 FROM ronda_stock_integrity.proofs p WHERE p.exception_id=post.exception_id AND to_jsonb(p)=to_jsonb(proof)) OR NOT EXISTS(SELECT 1 FROM public.productos p WHERE p.id=product_id AND to_jsonb(p)=product_after) OR NOT EXISTS(SELECT 1 FROM public.movimientos_inventario m WHERE m.id=movement_id AND to_jsonb(m)=movement) OR NOT EXISTS(SELECT 1 FROM public.rondas_excepciones e WHERE e.id=post.exception_id AND to_jsonb(e)=exception_after) THEN RAISE EXCEPTION 'Ronda after-proof business result changed'; END IF;
 SELECT count(*) INTO count_after FROM public.movimientos_inventario WHERE producto_id=product_id;
 IF count_after<>baseline+1 OR EXISTS(SELECT 1 FROM jsonb_array_elements(ledger_before) old WHERE NOT EXISTS(SELECT 1 FROM public.movimientos_inventario m WHERE to_jsonb(m)=old))
 OR NOT EXISTS(SELECT 1 FROM public.rondas_inventario r WHERE r.id=exception_before.ronda_id AND to_jsonb(r)=round_source)
 OR (cause_source IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.inventario_causas_raiz c WHERE c.clave=exception_before.decision_causa AND to_jsonb(c)=cause_source))
 OR ronda_stock_integrity.authorize(user_id,tg_id,CASE WHEN operation='capture' THEN 'inventario_explicacion' ELSE module END) IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Ronda final sources/actor/ledger changed'; END IF;
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.fn_ronda_aplicar_ajuste(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
BEGIN RETURN ronda_stock_integrity.post('adjust',payload); END $$;
CREATE OR REPLACE FUNCTION public.fn_ronda_resolver_con_captura(payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog SET lock_timeout='5s' AS $$
BEGIN RETURN ronda_stock_integrity.post('capture',payload); END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ronda_stock_integrity FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.fn_ronda_validar_actor(uuid,uuid,text),public.fn_ronda_aplicar_ajuste(jsonb),public.fn_ronda_resolver_con_captura(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_ronda_validar_actor(uuid,uuid,text),public.fn_ronda_aplicar_ajuste(jsonb),public.fn_ronda_resolver_con_captura(jsonb) TO authenticated,service_role;
COMMIT;
