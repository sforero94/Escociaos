-- =====================================================================
-- 094: Hato Lechero — `v_hato_estado_actual` expone el MÉTODO de la
--      confirmación de preñez y la fecha del último aborto.
-- Fecha: 2026-08-13
-- Plan:  docs/plan_hato_telegram_estados_agosto_2026.md (N1)
--
-- POR QUÉ
-- -------
-- Decisión del dueño D-D (2026-08-13): el hato se lee con CINCO estados
--   vacía · servida · confirmada · por secar · seca
-- donde **"servida" incluye la preñez por PRESUNCIÓN y "confirmada"
-- significa PALPADA**. Hasta hoy el motor (`derivarEstadoReproductivo`,
-- `calculosHato.ts`) no podía distinguirlas: la migración 084/S3 guarda esa
-- diferencia en `hato_eventos.datos->>'metodo'` ('presuncion' | 'palpacion',
-- ver `hatoCicloManual.ts`), pero la vista solo exponía la FECHA de la
-- última confirmación, nunca el método. Sin esta columna el motor no tiene
-- de dónde leer y las dos marcas manuales del diálogo de ciclo colapsan en
-- un único estado visible.
--
-- Segunda columna, misma decisión: D-D saca el aborto del ESTADO y lo manda
-- a una columna de señales ("el estado ya no absorbe aborto/indeterminado").
-- Hoy un aborto solo se ve como `ultimo_evento_fecha` más reciente que los 4
-- eventos que el motor sabe clasificar, lo que tira al animal a
-- `indeterminado` sin decir por qué — el comentario de la salvaguarda en
-- `derivarEstadoReproductivo` lo dice con todas las letras: "casi siempre un
-- aborto, venta o muerte... aunque no se sepa de qué tipo es". Con
-- `ultimo_aborto_fecha` el motor SÍ puede tipificarlo: la vaca queda vacía
-- (que es la verdad biológica después de un aborto) y la señal explica el
-- porqué, en vez de un estado opaco.
--
-- CÓMO
-- ----
-- `CREATE OR REPLACE VIEW` **no admite reordenar ni insertar columnas en
-- medio**: las dos nuevas van AL FINAL, después de `etapa_forzada` (mismo
-- patrón que 062 con `ultimo_estado_chequeo`, 089 con `fecha_nacimiento` y
-- 092 con `etapa_forzada`). El resto de la definición se reproduce VERBATIM
-- desde `pg_get_viewdef` de producción — este archivo no aprovecha para
-- cambiar nada más.
--
-- El único cambio de forma en las CTEs existentes: `ultima_confirmacion`
-- pasa de `max(fecha) GROUP BY` a `DISTINCT ON (animal_id)`, porque ahora
-- hay que traer un segundo campo (`datos->>'metodo'`) DE LA MISMA FILA que
-- aporta esa fecha máxima — con `max()` + `GROUP BY` no hay forma de saber
-- de cuál fila salió. El desempate `created_at DESC` replica exactamente el
-- criterio que la CTE `ultimo_chequeo` ya usa en esta misma vista. Para una
-- fecha única por animal el resultado es idéntico al anterior.
--
-- `security_invoker=true` se REAFIRMA explícitamente: `CREATE OR REPLACE
-- VIEW` conserva las reloptions existentes, pero dejarlo escrito evita que
-- una futura recreación desde cero pierda la propiedad (nota de 056 — nunca
-- SECURITY DEFINER, mismo criterio que 033 aplicó a las vistas financieras).
--
-- Sin RLS propia: una vista `security_invoker` hereda las políticas de
-- `hato_animales`/`hato_eventos`/`hato_chequeo_vacas`, que ya son el patrón
-- 044. No se otorga ni revoca ningún grant aquí.
--
-- Idempotente: seguro de re-ejecutar.
-- =====================================================================

CREATE OR REPLACE VIEW v_hato_estado_actual
WITH (security_invoker = true) AS
WITH ultimo_chequeo AS (
  SELECT DISTINCT ON (cv.animal_id)
    cv.animal_id,
    cv.id AS chequeo_vaca_id,
    c.fecha AS chequeo_fecha,
    cv.pl,
    cv.meses_prenez,
    cv.fecha_secar,
    cv.fecha_probable_parto,
    cv.estado
  FROM hato_chequeo_vacas cv
    JOIN hato_chequeos c ON c.id = cv.chequeo_id
  ORDER BY cv.animal_id, c.fecha DESC, cv.created_at DESC
), ultimo_servicio AS (
  SELECT DISTINCT ON (e.animal_id)
    e.animal_id,
    e.fecha,
    e.toro_id,
    e.tipo_servicio
  FROM hato_eventos e
  WHERE e.tipo = 'servicio'::text
  ORDER BY e.animal_id, e.fecha DESC
), ultimo_parto AS (
  SELECT e.animal_id,
    max(e.fecha) AS fecha,
    count(*) AS num_partos
  FROM hato_eventos e
  WHERE e.tipo = 'parto'::text
  GROUP BY e.animal_id
), ultimo_secado_real AS (
  SELECT e.animal_id,
    max(e.fecha) AS fecha
  FROM hato_eventos e
  WHERE e.tipo = 'secado_real'::text
  GROUP BY e.animal_id
), ultima_confirmacion AS (
  -- DISTINCT ON, no max()+GROUP BY: `metodo` tiene que venir de LA MISMA
  -- fila que aporta la fecha más reciente (ver cabecera).
  SELECT DISTINCT ON (e.animal_id)
    e.animal_id,
    e.fecha,
    e.datos ->> 'metodo'::text AS metodo
  FROM hato_eventos e
  WHERE e.tipo = 'confirmacion_prenez'::text
  ORDER BY e.animal_id, e.fecha DESC, e.created_at DESC
), ultimo_aborto AS (
  SELECT e.animal_id,
    max(e.fecha) AS fecha
  FROM hato_eventos e
  WHERE e.tipo = 'aborto'::text
  GROUP BY e.animal_id
), ultimo_evento AS (
  SELECT e.animal_id,
    max(e.fecha) AS fecha
  FROM hato_eventos e
  GROUP BY e.animal_id
)
SELECT a.id AS animal_id,
  a.numero,
  a.nombre,
  a.etapa,
  a.raza,
  a.estado,
  uc.chequeo_vaca_id AS ultimo_chequeo_vaca_id,
  uc.chequeo_fecha AS ultimo_chequeo_fecha,
  uc.pl,
  uc.meses_prenez,
  uc.fecha_secar,
  uc.fecha_probable_parto,
  us.fecha AS ultimo_servicio_fecha,
  us.toro_id AS ultimo_servicio_toro_id,
  us.tipo_servicio AS ultimo_tipo_servicio,
  up.fecha AS ultimo_parto_fecha,
  COALESCE(up.num_partos, 0::bigint) AS num_partos,
  usr.fecha AS ultimo_secado_real_fecha,
  ucp.fecha AS ultima_confirmacion_prenez_fecha,
  ue.fecha AS ultimo_evento_fecha,
  uc.estado AS ultimo_estado_chequeo,
  a.fecha_nacimiento,
  a.etapa_forzada,
  -- ── columnas nuevas (094), siempre AL FINAL ──────────────────────
  -- 'presuncion' | 'palpacion' | NULL. NULL = confirmación registrada sin
  -- método (importación histórica o marca anterior a S3): el motor la trata
  -- como PRESUNCIÓN, nunca como palpación — afirmar que un veterinario
  -- palpó sin evidencia es la única lectura que no se puede deshacer.
  ucp.metodo AS ultima_confirmacion_prenez_metodo,
  uab.fecha AS ultimo_aborto_fecha
FROM hato_animales a
  LEFT JOIN ultimo_chequeo uc ON uc.animal_id = a.id
  LEFT JOIN ultimo_servicio us ON us.animal_id = a.id
  LEFT JOIN ultimo_parto up ON up.animal_id = a.id
  LEFT JOIN ultimo_secado_real usr ON usr.animal_id = a.id
  LEFT JOIN ultima_confirmacion ucp ON ucp.animal_id = a.id
  LEFT JOIN ultimo_aborto uab ON uab.animal_id = a.id
  LEFT JOIN ultimo_evento ue ON ue.animal_id = a.id;

COMMENT ON VIEW v_hato_estado_actual IS
  'Hechos por animal del hato (nunca cálculo): último chequeo, servicio, '
  'parto, secado real, confirmación de preñez (+ método), aborto y evento. '
  'Todo el cálculo de fechas/umbrales vive en calculosHato.ts, jamás aquí.';

-- ---------------------------------------------------------------------
-- Verificación (no muta nada; aborta si la vista quedó mal construida).
-- ---------------------------------------------------------------------

DO $$
DECLARE
  faltantes TEXT;
BEGIN
  SELECT string_agg(c, ', ') INTO faltantes
  FROM unnest(ARRAY['ultima_confirmacion_prenez_metodo', 'ultimo_aborto_fecha']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'v_hato_estado_actual'
      AND column_name = c
  );

  IF faltantes IS NOT NULL THEN
    RAISE EXCEPTION 'Migración 094: faltan columnas en v_hato_estado_actual: %', faltantes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE relname = 'v_hato_estado_actual'
      AND 'security_invoker=true' = ANY (reloptions)
  ) THEN
    RAISE EXCEPTION 'Migración 094: v_hato_estado_actual perdió security_invoker';
  END IF;
END $$;
