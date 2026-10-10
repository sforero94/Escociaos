-- SI-12 REVIEW CANDIDATE ONLY. Not a numbered migration; never apply automatically.
-- Prospective proof only. Ordinary purchase/stock writers MUST be retired at cutover.
BEGIN;
DO $$
DECLARE specification text[];
BEGIN
  FOREACH specification SLICE 1 IN ARRAY ARRAY[
    ['productos','cantidad_actual'],['productos','precio_unitario'],
    ['compras','cantidad'],['compras','costo_unitario'],['compras','costo_total'],
    ['movimientos_inventario','cantidad'],['movimientos_inventario','saldo_anterior'],
    ['movimientos_inventario','saldo_nuevo'],['movimientos_inventario','valor_movimiento']]
  LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid=('public.'||specification[1])::regclass AND attname=specification[2]
        AND NOT attisdropped AND pg_catalog.format_type(atttypid,atttypmod)='numeric(12,2)') THEN
      RAISE EXCEPTION 'Unexpected numeric schema for %.%',specification[1],specification[2];
    END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='public.fin_gastos'::regclass AND confrelid='public.compras'::regclass
      AND contype='f' AND confdeltype='n' AND conkey=ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute
        WHERE attrelid='public.fin_gastos'::regclass AND attname='compra_id' AND NOT attisdropped)]) THEN
    RAISE EXCEPTION 'Expense purchase FK must be ON DELETE SET NULL';
  END IF;
END $$;
CREATE SCHEMA purchase_integrity;
REVOKE ALL ON SCHEMA purchase_integrity FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE purchase_integrity.requests (
  actor uuid NOT NULL, request_key uuid NOT NULL, operation text NOT NULL,
  payload jsonb NOT NULL, result jsonb,
  PRIMARY KEY (actor, request_key)
);
CREATE TABLE purchase_integrity.postings (
  purchase_id uuid PRIMARY KEY, actor uuid NOT NULL, request_key uuid NOT NULL,
  line_index integer NOT NULL, purchase_snapshot jsonb NOT NULL,
  movement_id uuid NOT NULL UNIQUE, movement_snapshot jsonb NOT NULL,
  reversed_by uuid, reversal_key uuid, reversal_movement_id uuid,
  UNIQUE (actor, request_key, line_index),
  FOREIGN KEY (actor, request_key) REFERENCES purchase_integrity.requests(actor, request_key)
);
-- No FK to the deleted purchase or potentially later-reviewed expense: durable evidence.
CREATE TABLE purchase_integrity.expense_links (
  purchase_id uuid NOT NULL, expense_id uuid NOT NULL, actor uuid NOT NULL,
  request_key uuid NOT NULL, before_snapshot jsonb NOT NULL, after_snapshot jsonb,
  PRIMARY KEY (purchase_id, expense_id)
);
ALTER TABLE purchase_integrity.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_integrity.postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_integrity.expense_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA purchase_integrity FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION purchase_integrity.positive_money(v jsonb) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE SET search_path = pg_catalog AS $$
DECLARE n numeric;
BEGIN
  IF jsonb_typeof(v) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Numeric value required'; END IF;
  n := (v #>> '{}')::numeric;
  IF n::text IN ('NaN','Infinity','-Infinity') OR n <= 0 THEN RAISE EXCEPTION 'Positive finite value required'; END IF;
  n := round(n, 2);
  IF n <= 0 OR n > 9999999999.99 THEN RAISE EXCEPTION 'Value outside numeric(12,2)'; END IF;
  RETURN n;
END $$;

CREATE FUNCTION purchase_integrity.authorize() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE actor uuid := auth.uid(); profile public.usuarios%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Human authentication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO profile FROM public.usuarios WHERE id=actor FOR SHARE;
  IF NOT FOUND OR profile.activo IS DISTINCT FROM true OR profile.rol::text NOT IN ('Administrador','Gerencia') THEN
    RAISE EXCEPTION 'Active Administrador or Gerencia required' USING ERRCODE='42501';
  END IF;
  RETURN actor;
END $$;

CREATE FUNCTION purchase_integrity.begin_request(actor uuid, key uuid, op text, body jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE r purchase_integrity.requests%ROWTYPE;
BEGIN
  IF key IS NULL OR body IS NULL THEN RAISE EXCEPTION 'Request key and exact payload required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text || ':' || key::text, 0));
  SELECT * INTO r FROM purchase_integrity.requests WHERE requests.actor=begin_request.actor AND request_key=key FOR UPDATE;
  IF FOUND THEN
    IF r.operation IS DISTINCT FROM op OR r.payload IS DISTINCT FROM body OR r.result IS NULL THEN
      RAISE EXCEPTION 'Request key payload conflict or incomplete request';
    END IF;
    RETURN r.result;
  END IF;
  INSERT INTO purchase_integrity.requests VALUES (actor,key,op,body,NULL) RETURNING * INTO r;
  IF NOT FOUND OR r.actor IS DISTINCT FROM actor OR r.request_key IS DISTINCT FROM key
    OR r.operation IS DISTINCT FROM op OR r.payload IS DISTINCT FROM body OR r.result IS NOT NULL THEN
    RAISE EXCEPTION 'Request insertion not confirmed';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM purchase_integrity.requests WHERE requests.actor=begin_request.actor
    AND request_key=key AND to_jsonb(requests)=to_jsonb(r)) THEN RAISE EXCEPTION 'Request changed by trigger'; END IF;
  RETURN NULL;
END $$;

CREATE FUNCTION purchase_integrity.finish_request(actor uuid, key uuid, op text, body jsonb, receipt jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE r purchase_integrity.requests%ROWTYPE;
BEGIN
  UPDATE purchase_integrity.requests SET result=receipt
    WHERE requests.actor=finish_request.actor AND request_key=key AND operation=op AND payload=body AND result IS NULL RETURNING * INTO r;
  IF NOT FOUND OR r.actor IS DISTINCT FROM actor OR r.request_key IS DISTINCT FROM key
    OR r.operation IS DISTINCT FROM op OR r.payload IS DISTINCT FROM body OR r.result IS DISTINCT FROM receipt THEN
    RAISE EXCEPTION 'Receipt update not confirmed';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM purchase_integrity.requests WHERE requests.actor=finish_request.actor
    AND request_key=key AND to_jsonb(requests)=to_jsonb(r)) THEN RAISE EXCEPTION 'Receipt changed by trigger'; END IF;
  RETURN receipt;
END $$;

CREATE FUNCTION public.fn_purchase_post(p_request_key uuid, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  actor uuid; replay jsonb; line jsonb; pos integer := 0; locked integer; wanted integer;
  prod public.productos%ROWTYPE; buy public.compras%ROWTYPE; mov public.movimientos_inventario%ROWTYPE;
  proof purchase_integrity.postings%ROWTYPE; expected jsonb; purchase_expected jsonb;
  target_product uuid; quantity numeric; unit_cost numeric; total_cost numeric; old_stock numeric; new_stock numeric;
  receipt jsonb := '[]'; actor_email text;
BEGIN
  actor := purchase_integrity.authorize(); -- Reauthorize even successful replays.
  replay := purchase_integrity.begin_request(actor,p_request_key,'post',p_payload);
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR (p_payload - 'lines') <> '{}'
    OR jsonb_typeof(p_payload->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'lines')=0 THEN
    RAISE EXCEPTION 'Nonempty lines array required';
  END IF;
  SELECT email INTO STRICT actor_email FROM public.usuarios WHERE id=actor;
  -- Validate every line before any business write; UUID/date/enum casts fail closed.
  FOR line IN SELECT value FROM jsonb_array_elements(p_payload->'lines') WITH ORDINALITY AS item(value,ordinal) ORDER BY ordinal LOOP
    IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR
      (line - ARRAY['producto_id','fecha_compra','proveedor','proveedor_id','numero_factura','cantidad','unidad',
        'numero_lote_producto','fecha_vencimiento','costo_unitario','costo_total','link_factura','url_factura']) <> '{}' THEN
      RAISE EXCEPTION 'Unknown purchase fields';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_each(line) field WHERE field.key NOT IN ('cantidad','costo_unitario','costo_total')
      AND jsonb_typeof(field.value) NOT IN ('string','null')) THEN RAISE EXCEPTION 'Text fields must be strings or null'; END IF;
    IF nullif(line->>'producto_id','') IS NULL OR nullif(line->>'fecha_compra','') IS NULL
      OR nullif(btrim(line->>'proveedor'),'') IS NULL OR nullif(line->>'unidad','') IS NULL THEN
      RAISE EXCEPTION 'Missing purchase fields';
    END IF;
    PERFORM (line->>'producto_id')::uuid, (line->>'fecha_compra')::date, (line->>'unidad')::public.unidad_medida;
    PERFORM purchase_integrity.positive_money(line->'cantidad'), purchase_integrity.positive_money(line->'costo_unitario'),
      purchase_integrity.positive_money(line->'costo_total');
  END LOOP;
  SELECT count(DISTINCT (value->>'producto_id')::uuid) INTO wanted FROM jsonb_array_elements(p_payload->'lines');
  PERFORM id FROM public.productos WHERE id IN
    (SELECT (value->>'producto_id')::uuid FROM jsonb_array_elements(p_payload->'lines')) ORDER BY id FOR UPDATE;
  GET DIAGNOSTICS locked = ROW_COUNT;
  IF locked <> wanted THEN RAISE EXCEPTION 'Missing product'; END IF;

  FOR line IN SELECT value FROM jsonb_array_elements(p_payload->'lines') WITH ORDINALITY AS item(value,ordinal) ORDER BY ordinal LOOP
    pos := pos+1;
    quantity := purchase_integrity.positive_money(line->'cantidad');
    unit_cost := purchase_integrity.positive_money(line->'costo_unitario');
    total_cost := purchase_integrity.positive_money(line->'costo_total');
    SELECT * INTO STRICT prod FROM public.productos WHERE id=(line->>'producto_id')::uuid;
    target_product := prod.id;
    old_stock := coalesce(prod.cantidad_actual,0);
    IF old_stock::text IN ('NaN','Infinity','-Infinity') OR old_stock < 0 THEN RAISE EXCEPTION 'Invalid current stock'; END IF;
    new_stock := old_stock+quantity;
    IF new_stock > 9999999999.99 THEN RAISE EXCEPTION 'Stock overflow'; END IF;
    purchase_expected := jsonb_build_object('producto_id',prod.id,'fecha_compra',(line->>'fecha_compra')::date,
      'proveedor',line->>'proveedor','proveedor_id',(line->>'proveedor_id')::uuid,'numero_factura',line->>'numero_factura',
      'cantidad',quantity,'unidad',line->>'unidad','numero_lote_producto',line->>'numero_lote_producto',
      'fecha_vencimiento',(line->>'fecha_vencimiento')::date,'costo_unitario',unit_cost,'costo_total',total_cost,
      'link_factura',line->>'link_factura','url_factura',line->>'url_factura','usuario_registro',actor_email);
    INSERT INTO public.compras(fecha_compra,proveedor,proveedor_id,numero_factura,producto_id,cantidad,unidad,
      numero_lote_producto,fecha_vencimiento,costo_unitario,costo_total,link_factura,url_factura,usuario_registro,created_at)
      VALUES ((line->>'fecha_compra')::date,line->>'proveedor',(line->>'proveedor_id')::uuid,line->>'numero_factura',
        prod.id,quantity,(line->>'unidad')::public.unidad_medida,line->>'numero_lote_producto',
        (line->>'fecha_vencimiento')::date,unit_cost,total_cost,line->>'link_factura',line->>'url_factura',actor_email,clock_timestamp())
      RETURNING * INTO buy;
    IF NOT FOUND OR NOT (to_jsonb(buy) @> purchase_expected) THEN RAISE EXCEPTION 'Purchase insertion not confirmed'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.compras WHERE id=buy.id AND to_jsonb(compras)=to_jsonb(buy)) THEN
      RAISE EXCEPTION 'Purchase changed by trigger';
    END IF;
    UPDATE public.productos SET cantidad_actual=new_stock,precio_unitario=unit_cost,activo=true,updated_at=now()
      WHERE id=prod.id RETURNING * INTO prod;
    IF NOT FOUND OR prod.id IS DISTINCT FROM target_product OR prod.cantidad_actual IS DISTINCT FROM new_stock OR prod.precio_unitario IS DISTINCT FROM unit_cost
      OR prod.activo IS DISTINCT FROM true THEN RAISE EXCEPTION 'Product update not confirmed'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.productos WHERE id=prod.id AND cantidad_actual=new_stock AND precio_unitario=unit_cost AND activo=true) THEN
      RAISE EXCEPTION 'Product changed by trigger';
    END IF;
    expected := jsonb_build_object('producto_id',prod.id,'fecha_movimiento',(line->>'fecha_compra')::date,
      'tipo_movimiento','Entrada','cantidad',quantity,'unidad',line->>'unidad','factura',line->>'numero_factura',
      'saldo_anterior',old_stock,'saldo_nuevo',new_stock,'valor_movimiento',total_cost,'responsable',actor_email,'provisional',false);
    INSERT INTO public.movimientos_inventario(fecha_movimiento,producto_id,tipo_movimiento,cantidad,unidad,factura,
      saldo_anterior,saldo_nuevo,valor_movimiento,responsable,observaciones,provisional)
      VALUES ((line->>'fecha_compra')::date,prod.id,'Entrada',quantity,(line->>'unidad')::public.unidad_medida,
        line->>'numero_factura',old_stock,new_stock,total_cost,actor_email,'Compra transaccional '||p_request_key,false)
      RETURNING * INTO mov;
    IF NOT FOUND OR NOT (to_jsonb(mov) @> expected) THEN RAISE EXCEPTION 'Movement insertion not confirmed'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.movimientos_inventario WHERE id=mov.id AND to_jsonb(movimientos_inventario)=to_jsonb(mov)) THEN
      RAISE EXCEPTION 'Movement changed by trigger';
    END IF;
    INSERT INTO purchase_integrity.postings(purchase_id,actor,request_key,line_index,purchase_snapshot,movement_id,movement_snapshot)
      VALUES (buy.id,actor,p_request_key,pos,to_jsonb(buy),mov.id,to_jsonb(mov)) RETURNING * INTO proof;
    IF NOT FOUND OR proof.purchase_id IS DISTINCT FROM buy.id OR proof.actor IS DISTINCT FROM actor
      OR proof.request_key IS DISTINCT FROM p_request_key OR proof.line_index IS DISTINCT FROM pos
      OR proof.purchase_snapshot IS DISTINCT FROM to_jsonb(buy) OR proof.movement_snapshot IS DISTINCT FROM to_jsonb(mov)
      OR proof.movement_id IS DISTINCT FROM mov.id OR proof.reversed_by IS NOT NULL
      OR proof.reversal_key IS NOT NULL OR proof.reversal_movement_id IS NOT NULL THEN
      RAISE EXCEPTION 'Posting proof not confirmed';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM purchase_integrity.postings WHERE purchase_id=buy.id AND to_jsonb(postings)=to_jsonb(proof)) THEN
      RAISE EXCEPTION 'Posting proof changed by trigger';
    END IF;
    receipt := receipt || jsonb_build_array(jsonb_build_object('purchase_id',buy.id,'expected',to_jsonb(buy),'movement_id',mov.id));
  END LOOP;
  RETURN purchase_integrity.finish_request(actor,p_request_key,'post',p_payload,jsonb_build_object('purchases',receipt));
END $$;

CREATE FUNCTION public.fn_purchase_reverse(p_request_key uuid, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
<<reverse_purchase>>
DECLARE
  actor uuid; replay jsonb; pid uuid; proof purchase_integrity.postings%ROWTYPE;
  buy public.compras%ROWTYPE; deleted public.compras%ROWTYPE; prod public.productos%ROWTYPE;
  mov public.movimientos_inventario%ROWTYPE; original_mov public.movimientos_inventario%ROWTYPE; expense public.fin_gastos%ROWTYPE;
  association purchase_integrity.expense_links%ROWTYPE; after_expense jsonb; expected jsonb; association_expected jsonb; proof_expected jsonb;
  target_product uuid; quantity numeric; old_stock numeric; new_stock numeric; price numeric; actor_email text; count_expenses integer:=0;
BEGIN
  actor := purchase_integrity.authorize();
  replay := purchase_integrity.begin_request(actor,p_request_key,'reverse',p_payload);
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR (p_payload - ARRAY['purchase_id','expected']) <> '{}'
    OR jsonb_typeof(p_payload->'expected') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Exact purchase snapshot required'; END IF;
  pid := (p_payload->>'purchase_id')::uuid;
  SELECT * INTO proof FROM purchase_integrity.postings WHERE purchase_id=pid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Legacy or unproven purchase requires management review'; END IF;
  -- Same product-first lock order as posting; proof is read again after the lock.
  SELECT * INTO prod FROM public.productos WHERE id=(proof.purchase_snapshot->>'producto_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing product'; END IF;
  SELECT * INTO STRICT proof FROM purchase_integrity.postings WHERE purchase_id=pid FOR UPDATE;
  IF proof.reversed_by IS NOT NULL OR proof.purchase_snapshot IS DISTINCT FROM p_payload->'expected' THEN
    RAISE EXCEPTION 'Already reversed or stale purchase snapshot';
  END IF;
  SELECT * INTO buy FROM public.compras WHERE id=pid FOR UPDATE;
  IF NOT FOUND OR to_jsonb(buy) IS DISTINCT FROM proof.purchase_snapshot THEN RAISE EXCEPTION 'Original purchase changed'; END IF;
  SELECT * INTO original_mov FROM public.movimientos_inventario WHERE id=proof.movement_id FOR UPDATE;
  IF NOT FOUND OR to_jsonb(original_mov) IS DISTINCT FROM proof.movement_snapshot THEN RAISE EXCEPTION 'Original posting movement changed'; END IF;
  target_product := prod.id;
  quantity := buy.cantidad;
  old_stock := coalesce(prod.cantidad_actual,0); new_stock := old_stock-quantity;
  IF old_stock::text IN ('NaN','Infinity','-Infinity') OR new_stock < 0 THEN RAISE EXCEPTION 'Insufficient current stock'; END IF;
  SELECT costo_unitario INTO price FROM public.compras WHERE producto_id=prod.id AND id<>pid
    ORDER BY fecha_compra DESC,created_at DESC NULLS LAST,id DESC LIMIT 1 FOR SHARE;
  IF price IS NOT NULL AND (price::text IN ('NaN','Infinity','-Infinity') OR price <= 0) THEN RAISE EXCEPTION 'Invalid surviving purchase price'; END IF;
  SELECT email INTO STRICT actor_email FROM public.usuarios WHERE id=actor;
  -- Lock and preserve EVERY linked expense, independent of estado. No Storage operation.
  FOR expense IN SELECT * FROM public.fin_gastos WHERE compra_id=pid ORDER BY id FOR UPDATE LOOP
    INSERT INTO purchase_integrity.expense_links(purchase_id,expense_id,actor,request_key,before_snapshot)
      VALUES (pid,expense.id,actor,p_request_key,to_jsonb(expense)) RETURNING * INTO association;
    IF NOT FOUND OR association.before_snapshot IS DISTINCT FROM to_jsonb(expense)
      OR association.purchase_id IS DISTINCT FROM pid OR association.expense_id IS DISTINCT FROM expense.id
      OR association.actor IS DISTINCT FROM actor OR association.request_key IS DISTINCT FROM p_request_key
      OR association.after_snapshot IS NOT NULL THEN RAISE EXCEPTION 'Expense association not confirmed'; END IF;
    IF NOT EXISTS(SELECT 1 FROM purchase_integrity.expense_links WHERE purchase_id=pid AND expense_id=expense.id
      AND to_jsonb(expense_links)=to_jsonb(association)) THEN RAISE EXCEPTION 'Expense association changed by trigger'; END IF;
    count_expenses := count_expenses+1;
  END LOOP;
  expected := jsonb_build_object('producto_id',prod.id,'fecha_movimiento',(now() AT TIME ZONE 'America/Bogota')::date,
    'tipo_movimiento','Salida Otros','cantidad',quantity,'unidad',buy.unidad,'factura',NULL,
    'saldo_anterior',old_stock,'saldo_nuevo',new_stock,'valor_movimiento',buy.costo_total,'responsable',actor_email,'provisional',false);
  INSERT INTO public.movimientos_inventario(fecha_movimiento,producto_id,tipo_movimiento,cantidad,unidad,factura,
    saldo_anterior,saldo_nuevo,valor_movimiento,responsable,observaciones,provisional)
    VALUES ((now() AT TIME ZONE 'America/Bogota')::date,prod.id,'Salida Otros',quantity,buy.unidad,NULL,
      old_stock,new_stock,buy.costo_total,actor_email,'Reversión transaccional de compra '||pid,false) RETURNING * INTO mov;
  IF NOT FOUND OR NOT (to_jsonb(mov) @> expected) THEN RAISE EXCEPTION 'Reversal movement not confirmed'; END IF;
  UPDATE public.productos SET cantidad_actual=new_stock,precio_unitario=price,updated_at=now()
    WHERE id=prod.id RETURNING * INTO prod;
  IF NOT FOUND OR prod.id IS DISTINCT FROM target_product OR prod.cantidad_actual IS DISTINCT FROM new_stock OR prod.precio_unitario IS DISTINCT FROM price THEN
    RAISE EXCEPTION 'Reversal stock update not confirmed';
  END IF;
  DELETE FROM public.compras WHERE id=pid RETURNING * INTO deleted;
  IF NOT FOUND OR to_jsonb(deleted) IS DISTINCT FROM to_jsonb(buy) THEN RAISE EXCEPTION 'Purchase deletion not confirmed'; END IF;
  IF EXISTS(SELECT 1 FROM public.compras WHERE id=pid) THEN RAISE EXCEPTION 'Purchase deletion suppressed'; END IF;
  FOR association IN SELECT * FROM purchase_integrity.expense_links WHERE purchase_id=pid ORDER BY expense_id LOOP
    SELECT to_jsonb(fin_gastos) INTO after_expense FROM public.fin_gastos WHERE id=association.expense_id;
    IF NOT FOUND OR (after_expense->'compra_id') IS DISTINCT FROM 'null'::jsonb
      OR (after_expense - ARRAY['compra_id','updated_at','updated_by']) IS DISTINCT FROM
         (association.before_snapshot - ARRAY['compra_id','updated_at','updated_by']) THEN
      RAISE EXCEPTION 'Expense preservation or FK detachment failed';
    END IF;
    association_expected := to_jsonb(association) || jsonb_build_object('after_snapshot',after_expense);
    UPDATE purchase_integrity.expense_links SET after_snapshot=after_expense
      WHERE purchase_id=pid AND expense_id=association.expense_id RETURNING * INTO association;
    IF NOT FOUND OR to_jsonb(association) IS DISTINCT FROM association_expected THEN RAISE EXCEPTION 'Expense audit not confirmed'; END IF;
    IF NOT EXISTS(SELECT 1 FROM purchase_integrity.expense_links WHERE purchase_id=pid AND expense_id=association.expense_id
      AND to_jsonb(expense_links)=to_jsonb(association)) THEN RAISE EXCEPTION 'Expense audit changed by trigger'; END IF;
  END LOOP;
  proof_expected := to_jsonb(proof) || jsonb_build_object('reversed_by',actor,'reversal_key',p_request_key,'reversal_movement_id',mov.id);
  UPDATE purchase_integrity.postings SET reversed_by=reverse_purchase.actor,reversal_key=p_request_key,reversal_movement_id=mov.id
    WHERE purchase_id=pid AND reversed_by IS NULL RETURNING * INTO proof;
  IF NOT FOUND OR to_jsonb(proof) IS DISTINCT FROM proof_expected THEN RAISE EXCEPTION 'Reversal proof not confirmed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM purchase_integrity.postings WHERE purchase_id=pid AND to_jsonb(postings)=to_jsonb(proof))
    OR NOT EXISTS(SELECT 1 FROM public.productos WHERE id=prod.id AND cantidad_actual=new_stock AND precio_unitario IS NOT DISTINCT FROM price)
    OR NOT EXISTS(SELECT 1 FROM public.movimientos_inventario WHERE id=mov.id AND to_jsonb(movimientos_inventario)=to_jsonb(mov)) THEN
    RAISE EXCEPTION 'Reversal changed by trigger';
  END IF;
  RETURN purchase_integrity.finish_request(actor,p_request_key,'reverse',p_payload,jsonb_build_object(
    'purchase_id',pid,'reversal_movement_id',mov.id,'preserved_expenses',count_expenses));
END $$;

-- Minimal canonical proof reader for an authorized history session. No expense data.
CREATE FUNCTION public.fn_purchase_proof(p_purchase_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE proof purchase_integrity.postings%ROWTYPE; buy public.compras%ROWTYPE;
  original_mov public.movimientos_inventario%ROWTYPE;
BEGIN
  PERFORM purchase_integrity.authorize();
  SELECT * INTO proof FROM purchase_integrity.postings WHERE purchase_id=p_purchase_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing or legacy purchase requires management review'; END IF;
  -- Same product-first order as posting/reversal; reread proof after the product lock.
  PERFORM id FROM public.productos WHERE id=(proof.purchase_snapshot->>'producto_id')::uuid FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing product'; END IF;
  SELECT * INTO STRICT proof FROM purchase_integrity.postings WHERE purchase_id=p_purchase_id FOR SHARE;
  IF proof.reversed_by IS NOT NULL THEN RAISE EXCEPTION 'Purchase already reversed'; END IF;
  SELECT * INTO buy FROM public.compras WHERE id=p_purchase_id FOR SHARE;
  IF NOT FOUND OR to_jsonb(buy) IS DISTINCT FROM proof.purchase_snapshot THEN RAISE EXCEPTION 'Original purchase changed'; END IF;
  SELECT * INTO original_mov FROM public.movimientos_inventario WHERE id=proof.movement_id FOR SHARE;
  IF NOT FOUND OR to_jsonb(original_mov) IS DISTINCT FROM proof.movement_snapshot THEN RAISE EXCEPTION 'Original posting movement changed'; END IF;
  RETURN jsonb_build_object('purchase_id',p_purchase_id,'expected',proof.purchase_snapshot);
END $$;

-- Defense for stale callers: the previous routine must NEVER delete expenses.
CREATE OR REPLACE FUNCTION public.fn_cleanup_compra_dependencies(p_compra_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Deprecated cleanup: preserve all expenses for management review' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION public.fn_cleanup_compra_dependencies(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA purchase_integrity FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.fn_purchase_post(uuid,jsonb),public.fn_purchase_reverse(uuid,jsonb),public.fn_purchase_proof(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.fn_purchase_post(uuid,jsonb),public.fn_purchase_reverse(uuid,jsonb),public.fn_purchase_proof(uuid) TO authenticated;
COMMIT;
