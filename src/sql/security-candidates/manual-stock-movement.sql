-- SI16 REVIEW CANDIDATE ONLY. No numbered migration or automatic deployment.
-- All other inventory writers/direct grants require coordinated cutover review.
BEGIN;
DO $$ DECLARE col text; BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='tipo_movimiento' AND (SELECT count(*) FROM pg_catalog.pg_enum e WHERE e.enumtypid=t.oid AND e.enumlabel IN ('Entrada','Salida Otros','Ajuste'))=3) THEN RAISE EXCEPTION 'Manual movement enum labels missing'; END IF;
  FOREACH col IN ARRAY ARRAY['cantidad_actual'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.productos'::regclass AND attname=col AND format_type(atttypid,atttypmod)='numeric(12,2)') THEN RAISE EXCEPTION 'Unexpected product quantity schema'; END IF;
  END LOOP;
  FOREACH col IN ARRAY ARRAY['cantidad','saldo_anterior','saldo_nuevo'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='public.movimientos_inventario'::regclass AND attname=col AND format_type(atttypid,atttypmod)='numeric(12,2)') THEN RAISE EXCEPTION 'Unexpected movement quantity schema'; END IF;
  END LOOP;
END $$;
CREATE SCHEMA manual_stock;
REVOKE ALL ON SCHEMA manual_stock FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE manual_stock.requests (
 actor uuid NOT NULL, request_key uuid NOT NULL, payload jsonb NOT NULL,
 before_product jsonb, after_product jsonb, movement jsonb, result jsonb, canceled boolean NOT NULL DEFAULT false,
 PRIMARY KEY(actor,request_key)
);
ALTER TABLE manual_stock.requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON manual_stock.requests FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.fn_manual_stock_movement(p_request_key uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); profile public.usuarios%ROWTYPE; prod public.productos%ROWTYPE;
 expected public.productos%ROWTYPE; durable public.productos%ROWTYPE;
 mov public.movimientos_inventario%ROWTYPE; durable_mov public.movimientos_inventario%ROWTYPE;
 req manual_stock.requests%ROWTYPE; durable_req manual_stock.requests%ROWTYPE;
 target uuid; kind text; quantity numeric; old_stock numeric; new_stock numeric; delta numeric;
 observed numeric; revision timestamptz; movement_date date; notes text; result jsonb; before_product jsonb;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Human authentication required' USING ERRCODE='42501'; END IF;
 SELECT * INTO profile FROM public.usuarios WHERE id=actor FOR SHARE;
 IF NOT FOUND OR profile.activo IS DISTINCT FROM true OR profile.rol::text NOT IN ('Administrador','Gerencia') THEN RAISE EXCEPTION 'Current active administrator required' USING ERRCODE='42501'; END IF;
 IF p_request_key IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_payload) k) IS DISTINCT FROM ARRAY['fecha','observaciones','observed_quantity','observed_revision','producto_id','quantity','tipo']::text[] THEN RAISE EXCEPTION 'Exact movement payload required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request_key::text,0));
 SELECT * INTO req FROM manual_stock.requests WHERE requests.actor=actor AND request_key=p_request_key FOR UPDATE;
 IF FOUND THEN
   IF req.canceled THEN RAISE EXCEPTION 'Request canceled after verified failed outcome'; END IF;
   IF req.payload IS DISTINCT FROM p_payload OR req.result IS NULL THEN RAISE EXCEPTION 'Request payload conflict'; END IF;
   RETURN req.result;
 END IF;
 IF jsonb_typeof(p_payload->'producto_id') IS DISTINCT FROM 'string' OR jsonb_typeof(p_payload->'tipo') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_payload->'quantity') IS DISTINCT FROM 'number' OR jsonb_typeof(p_payload->'observed_quantity') NOT IN ('number','null')
 OR jsonb_typeof(p_payload->'observed_revision') NOT IN ('string','null') OR jsonb_typeof(p_payload->'fecha') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_payload->'observaciones') NOT IN ('string','null') THEN RAISE EXCEPTION 'Invalid payload types'; END IF;
 target:=(p_payload->>'producto_id')::uuid; kind:=p_payload->>'tipo'; quantity:=(p_payload->>'quantity')::numeric;
 IF kind NOT IN ('Entrada','Salida Otros','Ajuste') OR quantity::text IN ('NaN','Infinity','-Infinity') OR quantity<0 OR (kind<>'Ajuste' AND quantity<=0) THEN RAISE EXCEPTION 'Invalid movement quantity or type'; END IF;
 quantity:=round(quantity,2);
 IF quantity>9999999999.99 OR (kind<>'Ajuste' AND quantity<=0) THEN RAISE EXCEPTION 'Quantity outside numeric(12,2)'; END IF;
 movement_date:=(p_payload->>'fecha')::date;
 IF movement_date::text IS DISTINCT FROM p_payload->>'fecha' THEN RAISE EXCEPTION 'Exact calendar date required'; END IF;
 notes:=p_payload->>'observaciones'; IF length(notes)>2000 THEN RAISE EXCEPTION 'Notes too long'; END IF;
 observed:=(p_payload->>'observed_quantity')::numeric; revision:=(p_payload->>'observed_revision')::timestamptz;
 SELECT * INTO prod FROM public.productos WHERE id=target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product missing'; END IF;
 old_stock:=prod.cantidad_actual;
 IF old_stock IS NULL OR old_stock::text IN ('NaN','Infinity','-Infinity') OR old_stock<0 OR old_stock>9999999999.99 OR round(old_stock,2)<>old_stock THEN RAISE EXCEPTION 'Current stock invalid'; END IF;
 IF kind='Ajuste' AND (revision IS NULL OR prod.updated_at IS NULL OR observed IS DISTINCT FROM old_stock OR revision IS DISTINCT FROM prod.updated_at) THEN RAISE EXCEPTION 'Stock changed; review the current product before correction'; END IF;
 before_product:=to_jsonb(prod); expected:=prod;
 new_stock:=CASE kind WHEN 'Entrada' THEN old_stock+quantity WHEN 'Salida Otros' THEN old_stock-quantity ELSE quantity END;
 IF new_stock<0 OR new_stock>9999999999.99 THEN RAISE EXCEPTION 'Resulting stock outside numeric(12,2)'; END IF;
 delta:=new_stock-old_stock;
 INSERT INTO manual_stock.requests(actor,request_key,payload) VALUES(actor,p_request_key,p_payload) RETURNING * INTO req;
 IF NOT FOUND OR req.actor IS DISTINCT FROM actor OR req.request_key IS DISTINCT FROM p_request_key OR req.payload IS DISTINCT FROM p_payload
 OR req.canceled IS DISTINCT FROM false OR req.result IS NOT NULL OR req.before_product IS NOT NULL OR req.after_product IS NOT NULL OR req.movement IS NOT NULL THEN RAISE EXCEPTION 'Request insertion not confirmed'; END IF;
 IF delta<>0 THEN
   INSERT INTO public.movimientos_inventario(fecha_movimiento,producto_id,tipo_movimiento,cantidad,unidad,saldo_anterior,saldo_nuevo,responsable,observaciones,provisional,created_at)
   VALUES(movement_date,target,kind::public.tipo_movimiento,delta,prod.unidad_medida,old_stock,new_stock,profile.email,notes,false,now()) RETURNING * INTO mov;
   IF NOT FOUND OR mov.id IS NULL OR mov.producto_id IS DISTINCT FROM target OR mov.fecha_movimiento IS DISTINCT FROM movement_date
   OR mov.tipo_movimiento::text IS DISTINCT FROM kind OR mov.cantidad IS DISTINCT FROM delta OR mov.unidad IS DISTINCT FROM prod.unidad_medida
   OR mov.saldo_anterior IS DISTINCT FROM old_stock OR mov.saldo_nuevo IS DISTINCT FROM new_stock OR mov.responsable IS DISTINCT FROM profile.email
   OR mov.observaciones IS DISTINCT FROM notes OR mov.provisional IS DISTINCT FROM false OR mov.created_at IS DISTINCT FROM now()
   OR to_jsonb(mov)->>'aplicacion_id' IS NOT NULL OR to_jsonb(mov)->>'lote_aplicacion' IS NOT NULL
   OR to_jsonb(mov)->>'factura' IS NOT NULL OR to_jsonb(mov)->>'valor_movimiento' IS NOT NULL OR to_jsonb(mov)->>'notas' IS NOT NULL THEN RAISE EXCEPTION 'Movement insertion not confirmed'; END IF;
   expected.cantidad_actual:=new_stock; expected.activo:=CASE WHEN new_stock>0 THEN true ELSE prod.activo END;
   expected.updated_at:=now(); expected.updated_by:=actor;
   UPDATE public.productos SET cantidad_actual=new_stock,activo=expected.activo,updated_at=expected.updated_at,updated_by=actor WHERE id=target RETURNING * INTO prod;
   IF NOT FOUND OR to_jsonb(prod) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Stock update not confirmed'; END IF;
 END IF;
 result:=jsonb_build_object('actor',actor,'request_key',p_request_key,'producto_id',target,'movement_id',mov.id,'quantity_before',old_stock,'quantity_after',new_stock,'delta',delta,'noop',delta=0);
 UPDATE manual_stock.requests SET before_product=before_product,after_product=to_jsonb(expected),movement=CASE WHEN delta=0 THEN NULL ELSE to_jsonb(mov) END,result=result
 WHERE requests.actor=actor AND request_key=p_request_key RETURNING * INTO req;
 IF NOT FOUND OR req.actor IS DISTINCT FROM actor OR req.request_key IS DISTINCT FROM p_request_key OR req.payload IS DISTINCT FROM p_payload
 OR req.canceled IS DISTINCT FROM false OR req.before_product IS DISTINCT FROM before_product OR req.after_product IS DISTINCT FROM to_jsonb(expected)
 OR req.movement IS DISTINCT FROM (CASE WHEN delta=0 THEN NULL ELSE to_jsonb(mov) END) OR req.result IS DISTINCT FROM result THEN RAISE EXCEPTION 'Receipt update not confirmed'; END IF;
 SELECT * INTO durable FROM public.productos WHERE id=target FOR UPDATE;
 IF NOT FOUND OR to_jsonb(durable) IS DISTINCT FROM to_jsonb(expected) THEN RAISE EXCEPTION 'Durable stock changed'; END IF;
 IF delta<>0 THEN
   SELECT * INTO durable_mov FROM public.movimientos_inventario WHERE id=mov.id FOR UPDATE;
   IF NOT FOUND OR to_jsonb(durable_mov) IS DISTINCT FROM to_jsonb(mov) THEN RAISE EXCEPTION 'Durable movement changed'; END IF;
 END IF;
 SELECT * INTO durable_req FROM manual_stock.requests WHERE requests.actor=actor AND request_key=p_request_key FOR UPDATE;
 IF NOT FOUND OR to_jsonb(durable_req) IS DISTINCT FROM to_jsonb(req) THEN RAISE EXCEPTION 'Durable receipt changed'; END IF;
 RETURN result;
END $$;
-- Resolves failed/unknown caller outcomes without rebasing the reviewed snapshot.
-- The same actor/key lock waits for any in-flight transaction before proving absence.
CREATE FUNCTION public.fn_manual_stock_request_status(p_request_key uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict use_variable
DECLARE actor uuid:=auth.uid(); profile public.usuarios%ROWTYPE; req manual_stock.requests%ROWTYPE; durable manual_stock.requests%ROWTYPE;
BEGIN
 IF actor IS NULL OR p_request_key IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Owner and exact request required'; END IF;
 SELECT * INTO profile FROM public.usuarios WHERE id=actor FOR SHARE;
 IF NOT FOUND OR profile.activo IS DISTINCT FROM true OR profile.rol::text NOT IN ('Administrador','Gerencia') THEN RAISE EXCEPTION 'Current active administrator required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(actor::text||':'||p_request_key::text,0));
 SELECT * INTO req FROM manual_stock.requests WHERE requests.actor=actor AND request_key=p_request_key FOR UPDATE;
 IF NOT FOUND THEN
   -- Fence this canceled key atomically. A late concurrent retry cannot post after
   -- the caller clears its local attempt and starts a freshly reviewed request.
   INSERT INTO manual_stock.requests(actor,request_key,payload,canceled) VALUES(actor,p_request_key,p_payload,true) RETURNING * INTO req;
   IF NOT FOUND OR req.actor IS DISTINCT FROM actor OR req.request_key IS DISTINCT FROM p_request_key OR req.payload IS DISTINCT FROM p_payload
     OR req.canceled IS DISTINCT FROM true OR req.result IS NOT NULL OR req.before_product IS NOT NULL OR req.after_product IS NOT NULL OR req.movement IS NOT NULL THEN RAISE EXCEPTION 'Cancellation insertion not confirmed'; END IF;
   SELECT * INTO durable FROM manual_stock.requests WHERE requests.actor=actor AND request_key=p_request_key FOR UPDATE;
   IF NOT FOUND OR to_jsonb(durable) IS DISTINCT FROM to_jsonb(req) THEN RAISE EXCEPTION 'Durable cancellation changed'; END IF;
 END IF;
 IF req.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'Request payload conflict'; END IF;
 IF req.canceled THEN RETURN jsonb_build_object('committed',false,'result',NULL); END IF;
 IF req.result IS NULL THEN RAISE EXCEPTION 'Incomplete request proof'; END IF;
 RETURN jsonb_build_object('committed',true,'result',req.result);
END $$;
REVOKE ALL ON FUNCTION public.fn_manual_stock_request_status(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_manual_stock_request_status(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_manual_stock_movement(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_manual_stock_movement(uuid,jsonb) TO authenticated;
COMMIT;
