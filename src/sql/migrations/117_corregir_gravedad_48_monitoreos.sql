-- Migración 117: corrige las 48 observaciones de monitoreo que quedaron
-- etiquetadas `Baja` cuando la regla del proyecto dice `Media`.
-- Cierra la PARTE B del hallazgo #12. GO DEL DUEÑO: 2026-08-24.
--
-- ---------------------------------------------------------------------------
-- QUÉ PASÓ
-- ---------------------------------------------------------------------------
-- `CargaMasiva` clasificaba la gravedad con un corte de 15% para `Media`,
-- mientras TODO el resto de la app usa 10% (`clasificarGravedad`, cortes
-- 10%/30%, en `src/utils/calculosMonitoreo.ts`). Como esa pantalla GUARDA el
-- valor en la fila en vez de recalcularlo, las observaciones cuya incidencia
-- cayó en la franja 10%–15% quedaron grabadas `Baja`.
--
-- La PARTE A ya está cerrada: el PR #151 alineó `CargaMasiva` con
-- `clasificarGravedad`, fusionado el 2026-08-24. Esta migración es el residuo.
--
-- POR QUÉ IMPORTA Y NO ES COSMÉTICO: `gravedad_texto` es un valor GUARDADO, y
-- lo leen el reporte semanal y Esco. La interfaz, en cambio, recalcula en vivo
-- con el corte de 10%. O sea que hoy esas 48 filas hacen que **el reporte y el
-- asistente contradigan a la pantalla** sobre la misma observación.
--
-- ---------------------------------------------------------------------------
-- ALCANCE, MEDIDO CONTRA PRODUCCIÓN EL 2026-08-24
-- ---------------------------------------------------------------------------
--   filas a corregir ....... 48
--   todas .................. gravedad_texto='Baja' y gravedad_numerica=1
--   incidencia ............. entre 10,00% y 14,29%
--   rango de fechas ........ 2025-11-26 .. 2026-04-22
--   discrepancias en CUALQUIER otra dirección ... 0
--
-- Ese último número es el que hace la corrección segura: no hay filas mal
-- etiquetadas hacia arriba, ni `Alta` que deban ser otra cosa. El defecto tiene
-- una sola forma.
--
-- SE CORRIGEN LAS DOS COLUMNAS, no sólo el texto. `gravedad_numerica` sigue el
-- mapeo Baja=1 / Media=2 / Alta=3 en las 4.200 filas de la tabla, sin una sola
-- excepción (comprobado). Cambiar sólo `gravedad_texto` dejaría 48 filas con
-- texto `Media` y número 1, creando una inconsistencia NUEVA donde hoy no hay
-- ninguna. Un arreglo a medias sería peor que el defecto.
--
-- NO se recalcula la columna entera. El `UPDATE` toca EXCLUSIVAMENTE las filas
-- donde el valor guardado discrepa del que dicta la regla vigente. Reescribir
-- `gravedad_texto` para las 4.200 tocaría filas que hoy están bien y borraría
-- la evidencia de cuáles estaban mal.
--
-- RESPALDO en el esquema `respaldos`, NUNCA en `public` (migración 081): un
-- `CREATE TABLE public.backup_*` hereda el `GRANT ALL ... TO anon` que Supabase
-- pone por defecto y publica el respaldo en la API.

-- ---------------------------------------------------------------------------
-- 1. Pre-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_objetivo integer;
  v_otras_direcciones integer;
  v_mapeo_roto integer;
  v_total integer;
BEGIN
  -- 1.1 Exactamente 48 filas, con la forma exacta descrita arriba.
  SELECT count(*) INTO v_objetivo
  FROM public.monitoreos
  WHERE incidencia IS NOT NULL
    AND incidencia >= 10 AND incidencia < 30
    AND gravedad_texto::text = 'Baja';

  IF v_objetivo <> 48 THEN
    RAISE EXCEPTION 'PRE 1.1: se esperaban 48 filas a corregir y hay %. El barrido es del 2026-08-24; si el numero cambio, alguien mas toco la tabla o la carga masiva volvio a escribir mal. Re-medir antes de aplicar.', v_objetivo;
  END IF;

  -- 1.2 Cero discrepancias en cualquier otra direccion. Si aparecieran, el
  --     defecto tendria otra forma y esta migracion no la describe.
  SELECT count(*) INTO v_otras_direcciones
  FROM public.monitoreos
  WHERE incidencia IS NOT NULL
    AND gravedad_texto::text IS DISTINCT FROM
        (CASE WHEN incidencia >= 30 THEN 'Alta' WHEN incidencia >= 10 THEN 'Media' ELSE 'Baja' END)
    AND NOT (incidencia >= 10 AND incidencia < 30 AND gravedad_texto::text = 'Baja');

  IF v_otras_direcciones <> 0 THEN
    RAISE EXCEPTION 'PRE 1.2: aparecieron % filas mal etiquetadas en otra direccion. El defecto ya no tiene una sola forma; revisar antes de seguir.', v_otras_direcciones;
  END IF;

  -- 1.3 El mapeo texto->numerica se cumple hoy en TODA la tabla. Es lo que
  --     justifica escribir gravedad_numerica=2 junto con 'Media'.
  SELECT count(*) INTO v_mapeo_roto
  FROM public.monitoreos
  WHERE gravedad_texto IS NOT NULL
    AND gravedad_numerica IS DISTINCT FROM
        (CASE gravedad_texto::text WHEN 'Baja' THEN 1 WHEN 'Media' THEN 2 WHEN 'Alta' THEN 3 END);

  IF v_mapeo_roto <> 0 THEN
    RAISE EXCEPTION 'PRE 1.3: % filas ya rompen el mapeo texto->numerica. El supuesto de esta migracion no se cumple.', v_mapeo_roto;
  END IF;

  -- 1.4 Linea base de filas totales, relativa. La tabla crece con cada ronda.
  SELECT count(*) INTO v_total FROM public.monitoreos;
  PERFORM set_config('escociaos.mig117_total', v_total::text, false);
END $$;

-- ---------------------------------------------------------------------------
-- 2. Respaldo forense, en `respaldos` (migración 081).
-- ---------------------------------------------------------------------------
CREATE TABLE respaldos.backup_117_gravedad_monitoreos AS
SELECT * FROM public.monitoreos
WHERE incidencia IS NOT NULL
  AND incidencia >= 10 AND incidencia < 30
  AND gravedad_texto::text = 'Baja';

ALTER TABLE respaldos.backup_117_gravedad_monitoreos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_117_gravedad_monitoreos FROM anon, authenticated;

COMMENT ON TABLE respaldos.backup_117_gravedad_monitoreos IS
  'Las 48 filas de monitoreos tal como estaban antes de la migracion 117, que las reetiqueto de Baja a Media. Unica copia de su estado previo: el ROLLBACK del pie de la 117 restaura desde aqui.';

-- ---------------------------------------------------------------------------
-- 3. La corrección. Sólo las filas que discrepan, las dos columnas.
-- ---------------------------------------------------------------------------
UPDATE public.monitoreos
SET gravedad_texto = 'Media',
    gravedad_numerica = 2
WHERE incidencia IS NOT NULL
  AND incidencia >= 10 AND incidencia < 30
  AND gravedad_texto::text = 'Baja';

-- ---------------------------------------------------------------------------
-- 4. Post-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_quedan integer;
  v_respaldo integer;
  v_total_post integer;
  v_total_pre text;
  v_mapeo_roto integer;
BEGIN
  -- 4.1 Cero discrepancias en NINGUNA direccion.
  SELECT count(*) INTO v_quedan
  FROM public.monitoreos
  WHERE incidencia IS NOT NULL
    AND gravedad_texto::text IS DISTINCT FROM
        (CASE WHEN incidencia >= 30 THEN 'Alta' WHEN incidencia >= 10 THEN 'Media' ELSE 'Baja' END);

  IF v_quedan <> 0 THEN
    RAISE EXCEPTION 'POST 4.1: quedaron % filas discrepantes.', v_quedan;
  END IF;

  -- 4.2 El respaldo guarda exactamente las 48.
  SELECT count(*) INTO v_respaldo FROM respaldos.backup_117_gravedad_monitoreos;
  IF v_respaldo <> 48 THEN
    RAISE EXCEPTION 'POST 4.2: el respaldo tiene % filas en vez de 48.', v_respaldo;
  END IF;

  -- 4.3 El mapeo texto->numerica sigue intacto en TODA la tabla.
  SELECT count(*) INTO v_mapeo_roto
  FROM public.monitoreos
  WHERE gravedad_texto IS NOT NULL
    AND gravedad_numerica IS DISTINCT FROM
        (CASE gravedad_texto::text WHEN 'Baja' THEN 1 WHEN 'Media' THEN 2 WHEN 'Alta' THEN 3 END);
  IF v_mapeo_roto <> 0 THEN
    RAISE EXCEPTION 'POST 4.3: la correccion rompio el mapeo texto->numerica en % filas.', v_mapeo_roto;
  END IF;

  -- 4.4 No se creo ni se borro ninguna fila: esto es un UPDATE, no una limpieza.
  v_total_pre := nullif(current_setting('escociaos.mig117_total', true), '');
  IF v_total_pre IS NULL THEN
    RAISE WARNING 'POST 4.4: no se pudo leer la linea base; la comprobacion de conteo NO se ejecuto.';
  ELSE
    SELECT count(*) INTO v_total_post FROM public.monitoreos;
    IF v_total_post <> v_total_pre::integer THEN
      RAISE EXCEPTION 'POST 4.4: monitoreos paso de % a % filas. Esta migracion solo actualiza.', v_total_pre, v_total_post;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable):
--
--   UPDATE public.monitoreos m
--      SET gravedad_texto = b.gravedad_texto,
--          gravedad_numerica = b.gravedad_numerica
--     FROM respaldos.backup_117_gravedad_monitoreos b
--    WHERE m.id = b.id;
--
-- El respaldo se deja en la base a proposito (precedente 075/076/080/081).
-- ---------------------------------------------------------------------------
