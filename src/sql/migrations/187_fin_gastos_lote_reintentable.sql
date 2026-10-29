-- Lotes de gastos web: recibo y filas en una transacción. NO APLICADA.
-- Aplicar antes del frontend; conservar recibos y solicitudes al revertirlo.
BEGIN;
DO $pre$
BEGIN
  IF to_regclass('public.fin_gastos_lotes') IS NOT NULL OR
     to_regprocedure('public.fn_fin_gastos_guardar_lote(uuid,uuid,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION '187: objetos existentes; comprobar el ledger antes de reintentar.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.fin_gastos'::regclass AND relrowsecurity) OR
     NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='get_user_role' AND p.prosecdef
         AND p.prosrc ~ 'activo\s*=\s*true') THEN
    RAISE EXCEPTION '187: requiere RLS de gastos y get_user_role que excluya cuentas inactivas.';
  END IF;
END $pre$;
CREATE TABLE public.fin_gastos_lotes (
  solicitud_id uuid PRIMARY KEY,
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  datos jsonb NOT NULL CHECK (jsonb_typeof(datos)='array'),
  resultado jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fin_gastos_lotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fin_gastos_lotes FROM PUBLIC, anon, authenticated;
-- El recibo se inserta completo antes de las filas, dentro de la misma transacción.
-- No requiere UPDATE ni DELETE: un fallo de fila también revierte el recibo.
GRANT SELECT, INSERT ON public.fin_gastos_lotes TO authenticated;
CREATE POLICY fin_gastos_lotes_propios ON public.fin_gastos_lotes
  FOR SELECT TO authenticated USING
    (usuario_id=(SELECT auth.uid()) AND (SELECT public.get_user_role())='Gerencia');
CREATE POLICY fin_gastos_lotes_insertar ON public.fin_gastos_lotes
  FOR INSERT TO authenticated WITH CHECK
    (usuario_id=(SELECT auth.uid()) AND (SELECT public.get_user_role())='Gerencia');
CREATE FUNCTION public.fn_fin_gastos_guardar_lote(p_solicitud_id uuid, p_usuario_id uuid, p_datos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_recibo public.fin_gastos_lotes%ROWTYPE;
  v_ids jsonb;
  v_resultado jsonb;
  v_item jsonb;
  v_indice bigint;
  v_insertado integer;
BEGIN
  IF v_usuario IS NULL OR p_usuario_id IS DISTINCT FROM v_usuario OR COALESCE(public.get_user_role()::text,'') <> 'Gerencia' THEN
    RAISE EXCEPTION 'Solo Gerencia activa puede guardar gastos.' USING ERRCODE='42501';
  END IF;
  IF p_solicitud_id IS NULL OR p_datos IS NULL OR jsonb_typeof(p_datos)<>'array' THEN
    RAISE EXCEPTION 'Lote de gastos inválido.' USING ERRCODE='22023';
  END IF;
  IF jsonb_array_length(p_datos)=0 THEN
    RAISE EXCEPTION 'El lote requiere gastos.' USING ERRCODE='22023';
  END IF;
  SELECT jsonb_agg(gen_random_uuid() ORDER BY i) INTO v_ids
    FROM generate_series(1,jsonb_array_length(p_datos)) AS i;
  v_resultado := jsonb_build_object('ids',v_ids,'cantidad',jsonb_array_length(p_datos));
  -- El conflicto espera al primer COMMIT/ROLLBACK, también entre sesiones.
  INSERT INTO public.fin_gastos_lotes(solicitud_id,usuario_id,datos,resultado)
    VALUES(p_solicitud_id,v_usuario,p_datos,v_resultado)
    ON CONFLICT(solicitud_id) DO NOTHING;
  GET DIAGNOSTICS v_insertado = ROW_COUNT;
  SELECT * INTO v_recibo FROM public.fin_gastos_lotes WHERE solicitud_id=p_solicitud_id;
  IF NOT FOUND OR v_recibo.usuario_id<>v_usuario THEN
    RAISE EXCEPTION 'Solicitud de gastos no disponible.' USING ERRCODE='42501';
  END IF;
  IF v_recibo.datos IS DISTINCT FROM p_datos THEN
    RAISE EXCEPTION 'La solicitud ya pertenece a otros datos.' USING ERRCODE='PGB01';
  END IF;
  IF v_insertado=0 THEN RETURN v_recibo.resultado; END IF;
  FOR v_item,v_indice IN SELECT value,ordinality FROM jsonb_array_elements(p_datos) WITH ORDINALITY LOOP
    IF jsonb_typeof(v_item)<>'object' OR NULLIF(btrim(v_item->>'nombre'),'') IS NULL OR
       (v_item->>'valor')::numeric IS NULL OR (v_item->>'valor')::numeric<=0 OR
       v_item->>'estado' IS DISTINCT FROM 'Confirmado' THEN
      RAISE EXCEPTION 'Gasto inválido en fila %.',v_indice USING ERRCODE='22023';
    END IF;
    INSERT INTO public.fin_gastos(id,fecha,nombre,valor,negocio_id,region_id,categoria_id,
      concepto_id,proveedor_id,medio_pago_id,observaciones,url_factura,estado,created_by)
    VALUES((v_ids->>(v_indice::integer-1))::uuid,(v_item->>'fecha')::date,
      btrim(v_item->>'nombre'),(v_item->>'valor')::numeric,(v_item->>'negocio_id')::uuid,
      (v_item->>'region_id')::uuid,(v_item->>'categoria_id')::uuid,(v_item->>'concepto_id')::uuid,
      (v_item->>'proveedor_id')::uuid,(v_item->>'medio_pago_id')::uuid,
      NULLIF(btrim(v_item->>'observaciones'),''),v_item->>'url_factura','Confirmado',v_usuario);
  END LOOP;
  RETURN v_resultado;
END $$;
REVOKE ALL ON FUNCTION public.fn_fin_gastos_guardar_lote(uuid,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fn_fin_gastos_guardar_lote(uuid,uuid,jsonb) TO authenticated;
COMMIT;
