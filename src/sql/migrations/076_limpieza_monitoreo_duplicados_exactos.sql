-- =============================================================================
-- 076_limpieza_monitoreo_duplicados_exactos.sql
--
-- Continuacion de la 075. Colapsa los duplicados de `monitoreos` que la 075 no
-- pudo tocar porque sus copias comparten el mismo `created_at`.
--
-- Solo se tocan los grupos donde las copias son IDENTICAS en el dato:
--     misma incidencia, mismos arboles_afectados, mismos arboles_monitoreados.
-- Ahi el desempate (por `id`, arbitrario) no elige ningun valor -- ambas filas
-- dicen exactamente lo mismo, asi que borrar una no cambia ningun numero de
-- ninguna vista. Es una deduplicacion sin decision de negocio.
--
-- Filas afectadas: DELETE 14 (14 grupos x 1 copia sobrante).
--
-- LO QUE ESTA MIGRACION DELIBERADAMENTE NO HACE
-- ---------------------------------------------
-- Quedan 58 grupos con `created_at` identico y VALORES DIVERGENTES entre sus
-- copias (por ejemplo 2,86% contra 34,29% de incidencia para el mismo sublote,
-- plaga, fecha y monitor). Para esos no existe ninguna regla automatica
-- defendible: no hay "la mas reciente" porque el instante es el mismo, y elegir
-- por `id` seria escoger un numero al azar entre dos que se contradicen.
--
-- Se dejan intactos a proposito. Requieren cotejo contra las planillas de papel
-- de las 17 rondas afectadas (2025-01-21 a 2026-04-24). Ver el issue de
-- seguimiento enlazado en el PR de esta migracion.
--
-- Reporte: escociaos-po/reports/2026-07-31-dryrun-lunes.md (hallazgo #9)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.backup_076_monitoreos_dups_exactos AS
WITH g AS (
  SELECT ronda_id,
         COALESCE(sublote_id::text, lote_id::text) AS ubic,
         plaga_enfermedad_id, fecha_monitoreo, monitor
    FROM public.monitoreos
   WHERE ronda_id IS NOT NULL
   GROUP BY 1,2,3,4,5
  HAVING COUNT(*) > 1
     AND COUNT(DISTINCT incidencia) = 1
     AND COUNT(DISTINCT arboles_afectados) = 1
     AND COUNT(DISTINCT arboles_monitoreados) = 1
),
ranked AS (
  SELECT m.*,
         ROW_NUMBER() OVER (
           PARTITION BY m.ronda_id,
                        COALESCE(m.sublote_id::text, m.lote_id::text),
                        m.plaga_enfermedad_id, m.fecha_monitoreo, m.monitor
           ORDER BY m.id
         ) AS rn
    FROM public.monitoreos m
    JOIN g
      ON  m.ronda_id            = g.ronda_id
      AND COALESCE(m.sublote_id::text, m.lote_id::text) = g.ubic
      AND m.plaga_enfermedad_id = g.plaga_enfermedad_id
      AND m.fecha_monitoreo     = g.fecha_monitoreo
      AND m.monitor             = g.monitor
)
SELECT * FROM ranked WHERE rn > 1;

ALTER TABLE public.backup_076_monitoreos_dups_exactos DROP COLUMN IF EXISTS rn;

DELETE FROM public.monitoreos
 WHERE id IN (SELECT id FROM public.backup_076_monitoreos_dups_exactos);


-- =============================================================================
-- ROLLBACK
-- =============================================================================
--   INSERT INTO public.monitoreos
--   SELECT * FROM public.backup_076_monitoreos_dups_exactos;
--
-- Estado verificado tras aplicar 075 + 076 en produccion (2026-07-31):
--   monitoreos: 4.233 -> 4.155 (78 filas borradas: 64 en la 075, 14 en la 076)
--   grupos duplicados restantes: 58 (todos con valores divergentes, intactos)
--   observaciones huerfanas de catalogo: 0
--   'Beneficos' unificado: 1 fila de catalogo, 453 observaciones
-- =============================================================================
