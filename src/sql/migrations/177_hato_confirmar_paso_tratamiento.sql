-- #257. NUEVA, NO APLICADA. Aplicar antes de redesplegar ambos árboles edge.
-- RPC hermana de la 140; no modifica fn_hato_registrar_tratamiento.
-- No reescribe datos al instalarla. Solo service_role (webhook autenticado).
BEGIN;

CREATE OR REPLACE FUNCTION public.fn_hato_confirmar_paso_tratamiento(
  p_animal_id uuid,
  p_paso_id uuid,
  p_fecha_ejecutada date,
  p_respondida_por text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tratamiento public.hato_tratamientos%ROWTYPE;
  v_paso public.hato_tratamiento_pasos%ROWTYPE;
  v_alertas uuid[];
  v_ya_confirmado boolean;
BEGIN
  IF p_fecha_ejecutada IS NULL OR p_fecha_ejecutada > (now() AT TIME ZONE 'America/Bogota')::date THEN
    RAISE EXCEPTION 'La aplicación necesita una fecha real, no futura.';
  END IF;
  IF nullif(btrim(p_respondida_por), '') IS NULL THEN
    RAISE EXCEPTION 'Falta identificar quién confirma.';
  END IF;

  -- Orden común cabecera → paso: serializa dos pasos del mismo tratamiento
  -- y permite decidir correctamente si ya no quedan pasos pendientes.
  SELECT t.* INTO v_tratamiento
    FROM public.hato_tratamientos t
    JOIN public.hato_tratamiento_pasos p ON p.tratamiento_id = t.id
   WHERE p.id = p_paso_id AND t.animal_id = p_animal_id
   FOR UPDATE OF t;
  IF NOT FOUND OR v_tratamiento.estado = 'cancelado' THEN
    RAISE EXCEPTION 'El paso no pertenece a este animal o el tratamiento fue cancelado.';
  END IF;
  SELECT * INTO v_paso FROM public.hato_tratamiento_pasos
   WHERE id = p_paso_id AND tratamiento_id = v_tratamiento.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El paso ya no existe.'; END IF;
  IF p_fecha_ejecutada < v_tratamiento.fecha_inicio THEN
    RAISE EXCEPTION 'La aplicación no puede ser anterior al inicio del tratamiento.';
  END IF;
  v_ya_confirmado := v_paso.fecha_ejecutada IS NOT NULL;
  IF v_ya_confirmado AND v_paso.fecha_ejecutada <> p_fecha_ejecutada THEN
    RAISE EXCEPTION 'El paso ya se confirmó con otra fecha; no se sobrescribirá.';
  END IF;
  UPDATE public.hato_tratamiento_pasos SET fecha_ejecutada = p_fecha_ejecutada
   WHERE id = p_paso_id AND fecha_ejecutada IS NULL;

  WITH cerradas AS (
    UPDATE public.hato_alertas
       SET estado = 'confirmada', respuesta = 'si', respondida_por = p_respondida_por,
           updated_at = now()
     WHERE paso_id = p_paso_id AND animal_id = p_animal_id
       AND tipo = 'tratamiento_paso'
       AND estado IN ('pendiente', 'enviada', 'escalada', 'respondida')
     RETURNING id
  ) SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_alertas FROM cerradas;

  UPDATE public.hato_tratamientos SET estado = 'completado'
   WHERE id = v_tratamiento.id AND estado = 'activo'
     AND NOT EXISTS (SELECT 1 FROM public.hato_tratamiento_pasos
                     WHERE tratamiento_id = v_tratamiento.id AND fecha_ejecutada IS NULL);
  RETURN jsonb_build_object('alerta_ids', v_alertas, 'ya_confirmado', v_ya_confirmado);
END $$;

REVOKE ALL ON FUNCTION public.fn_hato_confirmar_paso_tratamiento(uuid, uuid, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hato_confirmar_paso_tratamiento(uuid, uuid, date, text) TO service_role;
COMMIT;

-- Rollback del despliegue (no deshace aplicaciones reales confirmadas):
-- DROP FUNCTION public.fn_hato_confirmar_paso_tratamiento(uuid, uuid, date, text);
