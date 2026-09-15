-- ============================================================================
-- 154_borrar_duplicados_chequeo_2026_09_08.sql
--
-- Borra 2 eventos `hato_eventos` duplicados que dejó el commit de la
-- recaptura del chequeo del 2026-09-08 (chequeo_id `0f7c743d…`, corrida
-- 2026-09-15 después de la 153). El commit (`fn_hato_commit_chequeo`, 065)
-- deriva un evento `servicio` de cada fila de la planilla que trae fecha de
-- servicio, pero NO comprueba si esa vaca ya tiene un evento equivalente de
-- OTRA fuente antes de insertar -- su idempotencia es solo intra-chequeo
-- (limpia y reinserta las filas colgadas de SU PROPIO `chequeo_vaca_id`
-- anterior), nunca inter-fuente. Dos vacas de la planilla ya tenían el
-- MISMO servicio capturado por Telegram esa misma noche del 09-08, así que
-- el commit escribió un segundo evento idéntico:
--
--   MONZA  (#135): inseminación Hypnotic 2026-09-08 -- ya existía por
--     Telegram (evento `0997a6d5…`, `registrado_por: Fernando Jimenez`,
--     enlaza el uso de pajilla `8ccbe831…`). El commit agregó `08903e46…`,
--     mismos fecha/toro/tipo, `datos` vacío, sin enlace a la pajilla.
--   AMAPOLA (#140): inseminación Hypnotic 2026-09-08 -- ya existía por
--     Telegram (evento `bac75bf5…`, `registrado_por: Martha Vega`, enlaza
--     el uso de pajilla `4ff3caa4…`). El commit agregó `54a718f5…`, mismos
--     fecha/toro/tipo, `datos` vacío, sin enlace a la pajilla.
--
-- Mismo criterio que la 138: sobrevive el evento con el enlace real (la
-- fuente Telegram, que trae `pajilla_uso_id` y `registrado_por` en `datos`);
-- se borra el huérfano que dejó el commit (`datos` NULL, sin enlace). No se
-- toca `hato_pajillas_uso` -- las dos filas de uso ya existían antes de este
-- chequeo y siguen enlazadas al evento que sobrevive; no hay usos huérfanos
-- que limpiar acá, a diferencia de la 138.
--
-- Un TERCER evento nuevo del mismo commit -- COPITA (#166), servicio
-- 2026-08-12, sin toro ni tipo de servicio -- NO es duplicado (verificado:
-- ningún evento previo de COPITA cae en esa fecha) y se deja intacto; es
-- una captura genuinamente nueva que la planilla trajo y que ni el
-- diagnóstico ni la 153 conocían.
--
-- Verificado antes de escribir esto: 0 `pg_constraint` apunta a
-- `hato_eventos` (ninguna FK depende de estos ids), y ninguna `hato_alertas`
-- referencia ninguno de los dos. `hato_chequeo_vacas` de ambas filas queda
-- intacto -- es la capa cruda de la planilla, no depende de que el evento
-- derivado exista.
--
-- No es el mismo defecto que la 138 (ahí eran dos escrituras de Telegram
-- compitiendo); acá es el commit del chequeo sin comprobar contra eventos
-- de otras fuentes. Queda abierto como hallazgo de producto/código aparte
-- (no se archiva en esta migración).
--
-- Filas afectadas: 2 DELETE en `hato_eventos`.
-- ============================================================================

DO $$
DECLARE
  v_n integer;
BEGIN
  -- 0.1 Los dos duplicados siguen existiendo, con la forma exacta medida.
  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE id = '08903e46-685d-43cd-8db5-bd6447a5699b'
     AND animal_id = (SELECT id FROM hato_animales WHERE numero = 135 AND nombre = 'MONZA')
     AND tipo = 'servicio' AND fecha = DATE '2026-09-08'
     AND tipo_servicio = 'inseminacion' AND fuente = 'chequeo' AND datos IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '154 ABORTADA (0.1): el duplicado de MONZA (08903e46…) ya no coincide con el estado esperado.';
  END IF;

  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE id = '54a718f5-d6c2-4398-a862-59ff27c1aa1a'
     AND animal_id = (SELECT id FROM hato_animales WHERE numero = 140 AND nombre = 'AMAPOLA')
     AND tipo = 'servicio' AND fecha = DATE '2026-09-08'
     AND tipo_servicio = 'inseminacion' AND fuente = 'chequeo' AND datos IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '154 ABORTADA (0.2): el duplicado de AMAPOLA (54a718f5…) ya no coincide con el estado esperado.';
  END IF;

  -- 0.2 Los eventos de Telegram que sobreviven siguen ahí, con su enlace de
  --     pajilla intacto.
  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE id = '0997a6d5-f13b-416f-8c3b-4cb28e055fb7'
     AND fuente = 'telegram' AND datos ->> 'pajilla_uso_id' = '8ccbe831-20c4-4f8a-850d-c3a9c711be9d';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '154 ABORTADA (0.3): el evento de Telegram de MONZA (0997a6d5…) ya no tiene el enlace esperado.';
  END IF;

  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE id = 'bac75bf5-762d-4930-a9cc-684d75a2e173'
     AND fuente = 'telegram' AND datos ->> 'pajilla_uso_id' = '4ff3caa4-3473-4eea-8edd-af00bfe8ed2d';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '154 ABORTADA (0.4): el evento de Telegram de AMAPOLA (bac75bf5…) ya no tiene el enlace esperado.';
  END IF;

  -- 0.3 Ninguna FK depende de hato_eventos, y ninguna alerta referencia
  --     estos dos ids -- borrar es seguro y no arrastra nada por CASCADE.
  SELECT count(*) INTO v_n FROM pg_constraint
   WHERE confrelid = 'hato_eventos'::regclass AND contype = 'f';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '154 ABORTADA (0.5): aparecieron % FK hacia hato_eventos -- revisar antes de borrar.', v_n;
  END IF;

  RAISE NOTICE '154 (pre): OK -- los 2 duplicados y los 2 eventos de Telegram que sobreviven están en el estado esperado.';
END $$;

-- ---------------------------------------------------------------------------
-- 1. Respaldo forense en `respaldos` (patrón 081).
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS respaldos;

CREATE TABLE respaldos.backup_154_hato_eventos_duplicados AS
SELECT * FROM hato_eventos
 WHERE id IN (
   '08903e46-685d-43cd-8db5-bd6447a5699b',
   '54a718f5-d6c2-4398-a862-59ff27c1aa1a'
 );

ALTER TABLE respaldos.backup_154_hato_eventos_duplicados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_154_hato_eventos_duplicados FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- 2. Borrar los 2 duplicados que dejó el commit del chequeo.
-- ---------------------------------------------------------------------------
DELETE FROM hato_eventos WHERE id = '08903e46-685d-43cd-8db5-bd6447a5699b'; -- MONZA, duplicado del commit
DELETE FROM hato_eventos WHERE id = '54a718f5-d6c2-4398-a862-59ff27c1aa1a'; -- AMAPOLA, duplicado del commit

-- ---------------------------------------------------------------------------
-- 3. Post-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE id IN ('08903e46-685d-43cd-8db5-bd6447a5699b', '54a718f5-d6c2-4398-a862-59ff27c1aa1a');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '154 ABORTADA (post 1): sobrevivieron % de los 2 duplicados.', v_n;
  END IF;

  -- MONZA conserva exactamente 1 servicio de inseminación Hypnotic el 09-08.
  SELECT count(*) INTO v_n FROM hato_eventos e
   WHERE e.animal_id = (SELECT id FROM hato_animales WHERE numero = 135)
     AND e.tipo = 'servicio' AND e.fecha = DATE '2026-09-08' AND e.tipo_servicio = 'inseminacion';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '154 ABORTADA (post 2): MONZA quedó con % servicios de inseminación el 09-08, se esperaba 1.', v_n;
  END IF;

  -- AMAPOLA conserva exactamente 1.
  SELECT count(*) INTO v_n FROM hato_eventos e
   WHERE e.animal_id = (SELECT id FROM hato_animales WHERE numero = 140)
     AND e.tipo = 'servicio' AND e.fecha = DATE '2026-09-08' AND e.tipo_servicio = 'inseminacion';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '154 ABORTADA (post 3): AMAPOLA quedó con % servicios de inseminación el 09-08, se esperaba 1.', v_n;
  END IF;

  -- El respaldo tiene las 2 filas.
  SELECT count(*) INTO v_n FROM respaldos.backup_154_hato_eventos_duplicados;
  IF v_n <> 2 THEN
    RAISE EXCEPTION '154 ABORTADA (post 4): el respaldo tiene % filas, se esperaban 2.', v_n;
  END IF;

  -- COPITA no se tocó -- sigue con su evento nuevo del 08-12.
  SELECT count(*) INTO v_n FROM hato_eventos e
   WHERE e.animal_id = (SELECT id FROM hato_animales WHERE numero = 166)
     AND e.tipo = 'servicio' AND e.fecha = DATE '2026-08-12' AND e.fuente = 'chequeo';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '154 ABORTADA (post 5): el evento nuevo de COPITA no está como se esperaba (hay %).', v_n;
  END IF;

  RAISE NOTICE '154 (post): OK -- MONZA y AMAPOLA con 1 solo evento cada una, COPITA intacta.';
END $$;

-- ============================================================================
-- ROLLBACK (ejecutable, si hiciera falta)
-- ============================================================================
-- BEGIN;
--   INSERT INTO hato_eventos SELECT * FROM respaldos.backup_154_hato_eventos_duplicados;
-- COMMIT;
-- ============================================================================
