-- 204: camila_carla_historia — BORRADOR, ESCRITA, SIN APLICAR (clase datos, ESCO-187).
-- NO APLICAR mientras quede un TODO(Santiago). Aplicar solo con «ESCO-187 aplicar»
-- en la sesión de respuesta del sábado, con Santiago presente.
--
-- Hecho: el 2026-11-21 (00:31–00:44Z) se editaron a mano tres valores de la
-- historia del hato (hato_correcciones):
--   - CAMILA #154, parto 91a84219: 2022-06-11 -> 2021-07-14.
--   - CAMILA #154, servicio b0a2071a: 2022-08-26 -> 2022-06-11.
--   - CARLA #156, fecha_nacimiento: NULL -> 2020-10-31 (confianza 'desconocida').
-- Contradicciones que dejan:
--   - CAMILA: servicio 2022-06-11 -> parto 2023-06-12 = 366 días de gestación
--     (antes 290). La capa cruda del chequeo 2022-09-08 dice ultima_cria_raw
--     '11/6/2022' y fecha_servicio_raw '26/8/2022' (los valores previos).
--   - CARLA: nacida 2020-10-31, pero su primer parto es 2019-03-19.
--
-- Qué hace (según lo que decida Santiago con Martha):
--   Paso A (CAMILA): devuelve los dos eventos a los valores de la capa cruda.
--   Paso B (CARLA): fija la fecha real que dé Martha, o la devuelve a NULL.
-- Qué NO hace: no toca las 10 fechas de nacimiento de la era de importación,
-- ni la capa cruda (hato_chequeo_vacas), ni ningún otro animal.
-- Traza: una migración corre con auth.uid() NULL y hato_correcciones (084) no
-- la registra, así que el respaldo en respaldos es el único registro.
--
-- Pre-estado (2026-11-27, solo lectura):
--   select id, fecha from public.hato_eventos
--    where id in ('91a84219-d0d0-4579-b92a-eeb5cd3f0c51','b0a2071a-930c-4e9b-8d87-fa60661fc623');
--   -> 91a84219 parto 2021-07-14 · b0a2071a servicio 2022-06-11 (los dos derivados de importación)
--   select fecha_nacimiento from public.hato_animales where id = '36825cb4-5d87-4b17-b63a-4796c9e8dcc3';
--   -> 2020-10-31
-- Post-estado esperado: 91a84219 = 2022-06-11, b0a2071a = 2022-08-26,
--   CARLA = <TODO> ; filas tocadas: 3.

-- TODO(Santiago): confirmar con Martha que la fuente correcta de CAMILA es el
--   chequeo 2022-09-08 (parto 11/6/2022, servicio 26/8/2022). Si es así, poner
--   v_aplicar_camila := true. Si Martha tenía razón, dejar false (el paso A no corre).
-- TODO(Santiago): fecha real de nacimiento de CARLA #156 (AAAA-MM-DD), o NULL
--   para volver al estado previo. Reemplazar el literal en v_carla_nacimiento.

SET LOCAL lock_timeout = '2s';

DO $$
DECLARE
  v_aplicar_camila   boolean := NULL;  -- TODO(Santiago): true | false
  v_carla_nacimiento date    := DATE '1900-01-01';  -- TODO(Santiago): fecha real o NULL
  n int;
BEGIN
  IF v_aplicar_camila IS NULL OR v_carla_nacimiento = DATE '1900-01-01' THEN
    RAISE EXCEPTION '204: quedan TODO(Santiago) sin resolver; no aplicar';
  END IF;
  IF v_carla_nacimiento IS NOT NULL AND v_carla_nacimiento >= DATE '2019-03-19' THEN
    RAISE EXCEPTION '204: la fecha de CARLA (%) es posterior a su primer parto 2019-03-19', v_carla_nacimiento;
  END IF;

  LOCK TABLE public.hato_animales IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.hato_eventos IN SHARE ROW EXCLUSIVE MODE;

  IF to_regclass('respaldos.backup_204_hato_eventos') IS NOT NULL
     OR to_regclass('respaldos.backup_204_hato_animales') IS NOT NULL THEN
    RAISE EXCEPTION '204: respaldo previo presente; no reejecutar';
  END IF;

  -- Pre-condiciones: el objetivo sigue como lo dejó la edición del 2026-11-21.
  SELECT count(*) INTO n FROM public.hato_eventos
   WHERE (id = '91a84219-d0d0-4579-b92a-eeb5cd3f0c51' AND tipo = 'parto'
          AND fecha = DATE '2021-07-14' AND animal_id = 'f11d6042-f5d1-49c1-ba5b-db990853858a')
      OR (id = 'b0a2071a-930c-4e9b-8d87-fa60661fc623' AND tipo = 'servicio'
          AND fecha = DATE '2022-06-11' AND animal_id = 'f11d6042-f5d1-49c1-ba5b-db990853858a');
  IF n <> 2 THEN RAISE EXCEPTION '204: los eventos de CAMILA cambiaron (% de 2); no adivinar', n; END IF;

  SELECT count(*) INTO n FROM public.hato_animales
   WHERE id = '36825cb4-5d87-4b17-b63a-4796c9e8dcc3' AND numero = 156 AND nombre = 'CARLA'
     AND fecha_nacimiento = DATE '2020-10-31';
  IF n <> 1 THEN RAISE EXCEPTION '204: la ficha de CARLA cambió; no adivinar'; END IF;

  -- Respaldo (patrón 081: respaldos, RLS sin políticas, sin grants de navegador).
  CREATE TABLE respaldos.backup_204_hato_eventos AS
    SELECT * FROM public.hato_eventos
     WHERE id IN ('91a84219-d0d0-4579-b92a-eeb5cd3f0c51','b0a2071a-930c-4e9b-8d87-fa60661fc623');
  CREATE TABLE respaldos.backup_204_hato_animales AS
    SELECT * FROM public.hato_animales WHERE id = '36825cb4-5d87-4b17-b63a-4796c9e8dcc3';
  ALTER TABLE respaldos.backup_204_hato_eventos ENABLE ROW LEVEL SECURITY;
  ALTER TABLE respaldos.backup_204_hato_animales ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON respaldos.backup_204_hato_eventos, respaldos.backup_204_hato_animales
    FROM PUBLIC, anon, authenticated;

  -- Paso A — CAMILA.
  IF v_aplicar_camila THEN
    UPDATE public.hato_eventos SET fecha = DATE '2022-06-11'
     WHERE id = '91a84219-d0d0-4579-b92a-eeb5cd3f0c51';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION '204: parto de CAMILA, % filas', n; END IF;
    UPDATE public.hato_eventos SET fecha = DATE '2022-08-26'
     WHERE id = 'b0a2071a-930c-4e9b-8d87-fa60661fc623';
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 1 THEN RAISE EXCEPTION '204: servicio de CAMILA, % filas', n; END IF;
  END IF;

  -- Paso B — CARLA.
  UPDATE public.hato_animales SET fecha_nacimiento = v_carla_nacimiento
   WHERE id = '36825cb4-5d87-4b17-b63a-4796c9e8dcc3';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '204: ficha de CARLA, % filas', n; END IF;

  -- Post-condiciones.
  IF v_aplicar_camila AND (
       (SELECT fecha FROM public.hato_eventos WHERE id = '91a84219-d0d0-4579-b92a-eeb5cd3f0c51') <> DATE '2022-06-11'
    OR (SELECT fecha FROM public.hato_eventos WHERE id = 'b0a2071a-930c-4e9b-8d87-fa60661fc623') <> DATE '2022-08-26') THEN
    RAISE EXCEPTION '204: post-condición de CAMILA falló';
  END IF;
  IF (SELECT fecha_nacimiento FROM public.hato_animales WHERE id = '36825cb4-5d87-4b17-b63a-4796c9e8dcc3')
     IS DISTINCT FROM v_carla_nacimiento THEN
    RAISE EXCEPTION '204: post-condición de CARLA falló';
  END IF;
  IF (SELECT count(*) FROM respaldos.backup_204_hato_eventos) <> 2
     OR (SELECT count(*) FROM respaldos.backup_204_hato_animales) <> 1 THEN
    RAISE EXCEPTION '204: respaldo incompleto';
  END IF;
END $$;

-- ROLLBACK (ejecutable, desde el respaldo):
-- UPDATE public.hato_eventos e SET fecha = b.fecha
--   FROM respaldos.backup_204_hato_eventos b WHERE e.id = b.id;
-- UPDATE public.hato_animales a SET fecha_nacimiento = b.fecha_nacimiento
--   FROM respaldos.backup_204_hato_animales b WHERE a.id = b.id;
