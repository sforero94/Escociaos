-- 199: gallega_reactivar_venta_ternero — ESCRITA, SIN APLICAR (clase datos).
-- Aplicar solo con el sí explícito de Santiago.
--
-- Hecho (Santiago, 2026-11-24): el animal vendido el 2026-10-16 fue la cría
-- macho de GALLEGA #148, no la vaca. Martha registró la venta desde la Hoja
-- de Vida de GALLEGA y el diálogo preseleccionó a la madre, así que el RPC
-- fn_hato_registrar_venta_animales (070) marcó a GALLEGA 'vendida' y le
-- colgó un evento 'venta'. Efecto visible: el bot de Fernando (/evento) solo
-- lista vacas activas, y GALLEGA desapareció.
--
-- Evidencia: hato_correcciones guarda el UPDATE del 2026-10-16 21:28:52
-- (estado activa -> vendida, fecha_estado NULL -> 2026-10-16). El parto de
-- GALLEGA del 2026-10-05 (b843495f) ya dice cria_destino = 'macho_vendido',
-- así que la venta de la cría ya está reconstruida en el parto.
--
-- Qué hace:
--   1. GALLEGA vuelve a estado 'activa' con fecha_estado NULL (su estado
--      previo exacto).
--   2. Borra el evento 'venta' d3f374c9 colgado a GALLEGA.
-- Qué NO hace:
--   - No toca fin_ingresos f964a8ac ("Venta ternero", $120.000): la venta
--     de la cría fue real. P&G y Flujo de Caja no cambian.
--   - No toca el parto del 2026-10-05 ni crea ficha para el macho: el hato
--     no lleva fichas de machos (hato_eventos.animal_id es NOT NULL, así que
--     el evento no se puede mover a la cría).
-- Traza: una migración corre con auth.uid() NULL y hato_correcciones (084)
-- no la registra, así que el respaldo en respaldos es el único registro.

SET LOCAL lock_timeout = '2s';

DO $$
BEGIN
  LOCK TABLE public.hato_animales IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.hato_eventos IN SHARE ROW EXCLUSIVE MODE;

  IF to_regclass('respaldos.backup_199_gallega') IS NOT NULL
     OR to_regclass('respaldos.backup_199_evento_venta') IS NOT NULL THEN
    RAISE EXCEPTION '199: respaldo previo presente; no reejecutar';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hato_animales a
    WHERE id = '0e8bec24-5181-406f-9013-b6c7116150a6'
      AND numero = 148 AND nombre = 'GALLEGA' AND estado = 'vendida'
      AND fecha_estado = DATE '2026-10-16'
      AND md5(to_jsonb(a)::text) = 'f7573f0f6f7bdd24472c6aeca0b12b88'
  ) THEN
    RAISE EXCEPTION '199: la ficha de GALLEGA cambió; no adivinar';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hato_eventos e
    WHERE id = 'd3f374c9-5c81-4a7c-9d64-fc3ce949593f'
      AND animal_id = '0e8bec24-5181-406f-9013-b6c7116150a6'
      AND tipo = 'venta' AND fecha = DATE '2026-10-16'
      AND fin_ingreso_id = 'f964a8ac-f538-452d-9c2b-58b4eec16c2a'
      AND md5(to_jsonb(e)::text) = 'd88df0764c62334d2a9c2d8cb80da531'
  ) THEN
    RAISE EXCEPTION '199: el evento de venta cambió; no adivinar';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hato_animales
             WHERE numero = 148 AND estado = 'activa') THEN
    RAISE EXCEPTION '199: otra vaca activa ya lleva la chapeta 148';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hato_correcciones
    WHERE tabla = 'hato_animales' AND operacion = 'update'
      AND fila_id = '0e8bec24-5181-406f-9013-b6c7116150a6'
      AND datos_anteriores->>'estado' = 'activa'
      AND datos_anteriores->>'fecha_estado' IS NULL
      AND datos_nuevos->>'estado' = 'vendida'
  ) THEN
    RAISE EXCEPTION '199: no está la traza del estado previo activa';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hato_eventos
    WHERE id = 'b843495f-fa57-4c15-b934-efe38b66ce5f'
      AND animal_id = '0e8bec24-5181-406f-9013-b6c7116150a6'
      AND tipo = 'parto' AND cria_destino = 'macho_vendido'
  ) THEN
    RAISE EXCEPTION '199: el parto del 2026-10-05 no dice macho_vendido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_ingresos
                 WHERE id = 'f964a8ac-f538-452d-9c2b-58b4eec16c2a'
                   AND valor = 120000) THEN
    RAISE EXCEPTION '199: el ingreso de la venta del ternero cambió';
  END IF;
END $$;

CREATE TABLE respaldos.backup_199_gallega AS
SELECT * FROM public.hato_animales
WHERE id = '0e8bec24-5181-406f-9013-b6c7116150a6';
ALTER TABLE respaldos.backup_199_gallega ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_199_gallega FROM PUBLIC, anon, authenticated;

CREATE TABLE respaldos.backup_199_evento_venta AS
SELECT * FROM public.hato_eventos
WHERE id = 'd3f374c9-5c81-4a7c-9d64-fc3ce949593f';
ALTER TABLE respaldos.backup_199_evento_venta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_199_evento_venta FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_n bigint;
  v_total bigint := (SELECT count(*) FROM public.hato_animales);
  v_activas bigint := (SELECT count(*) FROM public.hato_animales WHERE estado = 'activa');
  v_eventos bigint := (SELECT count(*) FROM public.hato_eventos);
  v_ingresos bigint := (SELECT count(*) FROM public.fin_ingresos);
BEGIN
  IF (SELECT count(*) FROM respaldos.backup_199_gallega) <> 1
     OR (SELECT count(*) FROM respaldos.backup_199_evento_venta) <> 1 THEN
    RAISE EXCEPTION '199: respaldo incompleto';
  END IF;

  UPDATE public.hato_animales SET estado = 'activa', fecha_estado = NULL
   WHERE id = '0e8bec24-5181-406f-9013-b6c7116150a6'
     AND estado = 'vendida' AND fecha_estado = DATE '2026-10-16';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '199: UPDATE afectó % filas', v_n; END IF;

  DELETE FROM public.hato_eventos
   WHERE id = 'd3f374c9-5c81-4a7c-9d64-fc3ce949593f'
     AND animal_id = '0e8bec24-5181-406f-9013-b6c7116150a6'
     AND tipo = 'venta';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '199: DELETE afectó % filas', v_n; END IF;

  -- Post: solo cambian estado y fecha_estado de GALLEGA.
  IF NOT EXISTS (
    SELECT 1 FROM public.hato_animales a
    JOIN respaldos.backup_199_gallega b USING (id)
    WHERE to_jsonb(a) = jsonb_set(jsonb_set(to_jsonb(b),
            '{estado}', '"activa"'::jsonb), '{fecha_estado}', 'null'::jsonb)
  ) THEN
    RAISE EXCEPTION '199 post: GALLEGA cambió más de lo previsto';
  END IF;
  IF (SELECT count(*) FROM public.hato_animales) <> v_total
     OR (SELECT count(*) FROM public.hato_animales WHERE estado = 'activa') <> v_activas + 1
     OR (SELECT count(*) FROM public.hato_eventos) <> v_eventos - 1
     OR (SELECT count(*) FROM public.fin_ingresos) <> v_ingresos
     OR NOT EXISTS (SELECT 1 FROM public.fin_ingresos
                    WHERE id = 'f964a8ac-f538-452d-9c2b-58b4eec16c2a')
     OR NOT EXISTS (SELECT 1 FROM public.hato_eventos
                    WHERE id = 'b843495f-fa57-4c15-b934-efe38b66ce5f') THEN
    RAISE EXCEPTION '199 post: conteos o filas ajenas cambiaron';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.v_hato_estado_actual
                 WHERE animal_id = '0e8bec24-5181-406f-9013-b6c7116150a6'
                   AND estado = 'activa') THEN
    RAISE EXCEPTION '199 post: la vista no muestra a GALLEGA activa';
  END IF;
END $$;

-- ROLLBACK (manual, solo si hace falta deshacer):
-- BEGIN;
-- UPDATE public.hato_animales a SET estado = b.estado, fecha_estado = b.fecha_estado
--   FROM respaldos.backup_199_gallega b WHERE a.id = b.id;
-- INSERT INTO public.hato_eventos SELECT * FROM respaldos.backup_199_evento_venta;
-- COMMIT;
