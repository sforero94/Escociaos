-- =====================================================================
-- 092: Hato Lechero -- corrección de precedencia de D-13 (categorías
--      calculadas), decisión del dueño 2026-08-06 al revisar el
--      resultado de S6 (docs/plan_hato_ronda_agosto_2026.md §0 D-13).
-- Fecha: 2026-08-06
--
-- CONTEXTO: S6 (migración 089) implementó D-13 con la precedencia
-- invertida a lo que el dueño pidió. Hoy: el cálculo (num_partos /
-- fecha_nacimiento) manda SIEMPRE que se pueda calcular; el campo manual
-- `etapa` solo se usa cuando la edad no se puede calcular. Consecuencia
-- real: si `fecha_nacimiento` existe pero está MAL digitada, no hay forma
-- de corregir la categoría -- y `EditarAnimalDialog` sigue ofreciendo
-- editar `etapa` sin que el cambio tenga ningún efecto visible.
--
-- Decisión del dueño (2026-08-06): "calculado, pero editable por si algo
-- falla, de fácil override" -- el valor manual, cuando se fija
-- EXPLÍCITAMENTE, GANA sobre el cálculo. La falla más probable no es una
-- fecha ausente (eso ya cae al override hoy) -- es una fecha PRESENTE y
-- mal digitada, que el cálculo de hoy no puede distinguir de una buena.
--
-- QUÉ HACE, en orden:
--   1. `hato_animales`: columna `etapa_forzada boolean NOT NULL DEFAULT
--      false` -- el marcador explícito que falta hoy. `etapa` es NOT NULL
--      y siempre trae algo (default de fábrica o el último valor
--      guardado), así que su sola presencia NUNCA alcanza como señal de
--      "esto se fijó a mano a propósito" -- se necesita un booleano
--      aparte. Alternativas consideradas y descartadas:
--        * Un timestamp `etapa_fijada_en` -- resuelve lo mismo pero exige
--          comparar contra la fecha del último evento que pudo cambiar el
--          cálculo (parto/fecha_nacimiento) para saber si sigue vigente;
--          la app no tiene ese dato a mano sin una consulta extra, y la
--          semántica de "sigue forzada hasta que alguien la destranca" es
--          más simple de razonar y de mostrar en UI que "sigue forzada
--          mientras no haya pasado nada más reciente".
--        * Sobrecargar `etapa` con un valor sentinela (ej. una etapa que
--          no exista) -- rompe el CHECK/tipo existente de la columna y
--          confunde cualquier lugar que ya lee `etapa` como una de las 4
--          etapas reales (toro incluido).
--        * Un valor especial en `fecha_nacimiento` (ej. NULL a propósito
--          para forzar el fallback) -- destruye el dato real de fecha de
--          nacimiento con un side effect no relacionado, y no sirve para
--          el caso `num_partos >= 1` (D-13: una vaca con partos siempre
--          se calcula "vaca" hoy, sin mirar fecha_nacimiento -- vaciar la
--          fecha no cambia esa rama).
--      DEFAULT false para las 179 filas existentes: ninguna categoría
--      calculada hoy en producción cambia al aplicar esto -- el
--      comportamiento actual (calculado manda cuando se puede) se
--      preserva para todo animal hasta que alguien fije la marca a mano
--      desde `EditarAnimalDialog`.
--   2. `v_hato_estado_actual`: se agrega `etapa_forzada` (de
--      `hato_animales`) AL FINAL del SELECT -- después de
--      `fecha_nacimiento` (089), que a su vez fue después de
--      `ultimo_estado_chequeo` (062). `CREATE OR REPLACE VIEW` no admite
--      reordenar ni insertar en medio, mismo patrón que las dos
--      anteriores. El cuerpo se copia TAL CUAL de 089 (verificado con
--      grep sobre el repo -- no hay ninguna redefinición posterior) + la
--      columna nueva.
--
-- QUÉ NO HACE (a propósito):
--   * No cambia el TypeScript. La inversión de precedencia en
--     `calcularEtapaHato` (hatoCategorias.ts) y `categorizarAnimal`
--     (las 2 copias de hato-aggregation.ts) es un cambio de código,
--     aparte de esta migración -- ambos se despliegan juntos, pero esta
--     migración por sí sola no cambia ninguna categoría mostrada (el
--     código viejo simplemente ignora la columna nueva hasta que se
--     despliegue el fix).
--   * No toca ninguna fila existente de `hato_animales.etapa` -- el valor
--     manual actual de cada animal se conserva tal cual; nadie queda
--     "forzado" retroactivamente por esta migración.
--   * No agrega UI de Ajustes (no aplica -- `etapa_forzada` es un campo
--     por animal, no un umbral de `hato_config`).
--
-- RLS: no se toca. `hato_animales` ya tiene sus políticas (patrón 044:
-- SELECT authenticated, escritura Administrador+Gerencia); una columna
-- nueva las hereda sin cambios. La vista sigue `security_invoker = true`
-- (nunca DEFINER, 056).
--
-- Idempotente: `ADD COLUMN IF NOT EXISTS` no falla en una re-corrida;
-- `CREATE OR REPLACE VIEW` es idempotente por construcción.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. hato_animales.etapa_forzada
-- ---------------------------------------------------------------------

ALTER TABLE hato_animales
  ADD COLUMN IF NOT EXISTS etapa_forzada boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN hato_animales.etapa_forzada IS
  'Marca explícita (S6, corrección de precedencia D-13, '
  'docs/plan_hato_ronda_agosto_2026.md §0, 2026-08-06): cuando es TRUE, '
  'el valor de `etapa` (fijado desde EditarAnimalDialog) GANA sobre el '
  'cálculo por fecha_nacimiento/num_partos, incluso si el cálculo SÍ '
  'puede resolver la edad -- es el override manual de "algo falló en el '
  'cálculo" (típicamente una fecha_nacimiento mal digitada). DEFAULT '
  'false: por defecto el cálculo sigue mandando, igual que antes de esta '
  'migración. Nunca se pone en TRUE automáticamente -- solo '
  'EditarAnimalDialog la fija, cuando el usuario fuerza la etapa a mano.';

-- ---------------------------------------------------------------------
-- 2. v_hato_estado_actual -- columna nueva `etapa_forzada` AL FINAL
--    (cuerpo copiado de 089, la última redefinición vigente, + la
--    columna nueva)
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW v_hato_estado_actual AS
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
),
ultimo_servicio AS (
  SELECT DISTINCT ON (animal_id)
    animal_id,
    fecha,
    toro_id,
    tipo_servicio
  FROM hato_eventos
  WHERE tipo = 'servicio'
  ORDER BY animal_id, fecha DESC
),
ultimo_parto AS (
  SELECT animal_id, MAX(fecha) AS fecha, COUNT(*) AS num_partos
  FROM hato_eventos
  WHERE tipo = 'parto'
  GROUP BY animal_id
),
ultimo_secado_real AS (
  SELECT animal_id, MAX(fecha) AS fecha
  FROM hato_eventos
  WHERE tipo = 'secado_real'
  GROUP BY animal_id
),
ultima_confirmacion AS (
  SELECT animal_id, MAX(fecha) AS fecha
  FROM hato_eventos
  WHERE tipo = 'confirmacion_prenez'
  GROUP BY animal_id
),
ultimo_evento AS (
  SELECT animal_id, MAX(fecha) AS fecha
  FROM hato_eventos
  GROUP BY animal_id
)
SELECT
  a.id AS animal_id,
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
  COALESCE(up.num_partos, 0) AS num_partos,
  usr.fecha AS ultimo_secado_real_fecha,
  ucp.fecha AS ultima_confirmacion_prenez_fecha,
  ue.fecha AS ultimo_evento_fecha,
  uc.estado AS ultimo_estado_chequeo,
  -- Columna de 089 (D-13, S6): fecha_nacimiento.
  a.fecha_nacimiento,
  -- Columna nueva de 092 (S6, corrección de precedencia D-13): SIEMPRE al
  -- final (CREATE OR REPLACE VIEW no permite insertar en medio ni
  -- reordenar).
  a.etapa_forzada
FROM hato_animales a
LEFT JOIN ultimo_chequeo uc ON uc.animal_id = a.id
LEFT JOIN ultimo_servicio us ON us.animal_id = a.id
LEFT JOIN ultimo_parto up ON up.animal_id = a.id
LEFT JOIN ultimo_secado_real usr ON usr.animal_id = a.id
LEFT JOIN ultima_confirmacion ucp ON ucp.animal_id = a.id
LEFT JOIN ultimo_evento ue ON ue.animal_id = a.id;

-- La vista sigue siendo security_invoker (ver nota en 056 -- nunca DEFINER).
ALTER VIEW v_hato_estado_actual SET (security_invoker = true);

-- ---------------------------------------------------------------------
-- 3. Guardas de cierre -- estructurales, patrón 080/081/082/084/089:
--    `RAISE EXCEPTION` dentro de un DO deshace toda la transacción si
--    algo no cuadra.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_columna_existe         boolean;
  v_columna_not_null       boolean;
  v_columna_default_false  boolean;
  v_filas_distintas_false  integer;
  v_vista_columna_existe   boolean;
  v_filas_vista            integer;
  v_filas_animales         integer;
  v_desajustes_passthrough integer;
BEGIN
  -- 3.1 La columna existe, es NOT NULL, boolean, con default false.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'hato_animales'
       AND column_name = 'etapa_forzada'
       AND data_type = 'boolean'
  ) INTO v_columna_existe;
  IF NOT v_columna_existe THEN
    RAISE EXCEPTION '092 ABORTADA: hato_animales.etapa_forzada no existe (o no es boolean).';
  END IF;

  SELECT (is_nullable = 'NO') INTO v_columna_not_null
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'hato_animales' AND column_name = 'etapa_forzada';
  IF NOT v_columna_not_null THEN
    RAISE EXCEPTION '092 ABORTADA: hato_animales.etapa_forzada admite NULL -- debe ser NOT NULL (ausencia de marca explícita nunca puede confundirse con "no forzada").';
  END IF;

  SELECT (column_default ILIKE '%false%') INTO v_columna_default_false
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'hato_animales' AND column_name = 'etapa_forzada';
  IF NOT v_columna_default_false THEN
    RAISE EXCEPTION '092 ABORTADA: hato_animales.etapa_forzada no tiene DEFAULT false.';
  END IF;

  -- 3.2 Ninguna fila existente quedó forzada por esta migración -- el
  --     comportamiento de hoy (calculado manda cuando se puede) debe
  --     preservarse para las 179 filas existentes hasta que alguien la
  --     fije a mano desde EditarAnimalDialog.
  SELECT count(*) INTO v_filas_distintas_false FROM hato_animales WHERE etapa_forzada IS DISTINCT FROM false;
  IF v_filas_distintas_false <> 0 THEN
    RAISE EXCEPTION '092 ABORTADA: % fila(s) de hato_animales quedaron con etapa_forzada distinto de false tras agregar la columna -- no debería pasar, el DEFAULT debía cubrir todas las filas existentes.', v_filas_distintas_false;
  END IF;

  -- 3.3 La vista expone etapa_forzada.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'v_hato_estado_actual'
       AND column_name = 'etapa_forzada'
  ) INTO v_vista_columna_existe;
  IF NOT v_vista_columna_existe THEN
    RAISE EXCEPTION '092 ABORTADA: v_hato_estado_actual no expone etapa_forzada.';
  END IF;

  -- 3.4 Invariante estructural: sigue siendo 1:1 con hato_animales (el
  --     JOIN de la vista nunca filtra).
  SELECT count(*) INTO v_filas_vista FROM v_hato_estado_actual;
  SELECT count(*) INTO v_filas_animales FROM hato_animales;
  IF v_filas_vista <> v_filas_animales THEN
    RAISE EXCEPTION '092 ABORTADA: v_hato_estado_actual trae % filas pero hato_animales tiene % -- la vista dejó de ser 1:1 con la tabla base.', v_filas_vista, v_filas_animales;
  END IF;

  -- 3.5 La columna nueva es un passthrough exacto -- para TODAS las
  --     filas, nunca una muestra -- de hato_animales.etapa_forzada.
  SELECT count(*) INTO v_desajustes_passthrough
    FROM v_hato_estado_actual v
    JOIN hato_animales a ON a.id = v.animal_id
   WHERE v.etapa_forzada IS DISTINCT FROM a.etapa_forzada;
  IF v_desajustes_passthrough <> 0 THEN
    RAISE EXCEPTION '092 ABORTADA: % fila(s) de v_hato_estado_actual.etapa_forzada no coinciden con hato_animales.etapa_forzada -- el passthrough está mal.', v_desajustes_passthrough;
  END IF;

  RAISE NOTICE '092 OK: hato_animales.etapa_forzada existe (boolean NOT NULL DEFAULT false, 0 fila(s) distinta(s) de false); v_hato_estado_actual la expone como passthrough exacto sobre % fila(s), 1:1 con la tabla base.', v_filas_vista;
END $$;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Devuelve la vista a la forma de 089 (sin etapa_forzada) y borra la
-- columna nueva de hato_animales. Solo tiene sentido si NADA en
-- producción llegó a depender de la columna nueva (verificar que ningún
-- animal tenga etapa_forzada = true, y que ningún cliente de
-- PostgREST/Esco esté leyendo la columna, antes de correr esto).
--
--   CREATE OR REPLACE VIEW v_hato_estado_actual AS
--   -- (pegar el cuerpo EXACTO de 089, sin la columna etapa_forzada)
--   ;
--   ALTER VIEW v_hato_estado_actual SET (security_invoker = true);
--
--   ALTER TABLE hato_animales DROP COLUMN IF EXISTS etapa_forzada;
-- =============================================================================
