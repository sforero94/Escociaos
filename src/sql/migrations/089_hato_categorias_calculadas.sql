-- =====================================================================
-- 089: Hato Lechero -- S6 T6 de la ronda de agosto 2026
--      (docs/plan_hato_ronda_agosto_2026.md, §0 D-13, §4 S6).
-- Fecha: 2026-08-06
--
-- Numerada 089, no 086: el prefijo 086 (`086_storage_pesajes_fotos.sql`) lo
-- tomó otra sesión (S5) corriendo en paralelo sobre el mismo worktree --
-- mismo tipo de colisión que ya resolvió 084 (tomó 084 porque 083 lo usó S1
-- en paralelo). 087 y 088 quedaron libres para esta sesión y se usan en las
-- 2 migraciones siguientes (T3b, T8.1) -- pero como el guard estático de
-- `hatoSchemaContract.test.ts` ("ningún prefijo >=053 duplicado") solo
-- valida colisiones EXACTAS, no reserva rangos, se renumeraron las 3 juntas
-- a 089/090/091 para no dejar un hueco 087-088 sin explicación. 083/083b,
-- 084 y 085 ya están aplicadas y verificadas en producción -- ver el estado
-- descrito en la cabecera de S6 del plan. NO APLICADA a producción por
-- esta sesión -- punto de parada explícito del brief; la aplica el main
-- loop, y DESPUÉS de esta van 090 (descarte de alertas, T3b) y 091 (activar
-- Telegram, T8.1), en ese orden -- ver el reporte de la sesión para el
-- porqué.
--
-- ⚠️ Esta sesión corrió con un conector de Supabase de SOLO LECTURA que no
-- estuvo disponible en el entorno de ejecución (el brief lo pedía para
-- introspección en vivo; no se pudo invocar). El esquema de abajo se tomó
-- del ARCHIVO de la migración 062 (la última que tocó `v_hato_estado_actual`
-- y `hato_config`), no de una consulta en vivo. Los guards de cierre (parte
-- 3) SÍ son estructurales -- comparan lo que esta migración deja contra
-- invariantes que no dependen de haber leído producción de antemano --
-- pero no hay un guard de "el conteo de hato_animales/activas sigue siendo
-- 68", precisamente porque esta sesión no pudo verificarlo en vivo. Quien
-- aplique esto debería confirmar contra `pg_views`/`information_schema`
-- antes de correr, con el mismo conector autenticado que las migraciones
-- 080-085 usaron.
--
-- QUÉ HACE, en orden:
--   1. `hato_config`: 2 claves numéricas nuevas que gobiernan el corte de
--      edad de las categorías calculadas (D-13) -- NUNCA una constante en
--      código, misma regla dura del módulo desde 058:
--        meses_ternera_leche_max = 3  -- ternera "de leche" hasta acá
--        meses_ternera_max       = 12 -- ternera hasta acá, novilla después
--      Viven FUERA de `HatoConfig` (`calculosHato.ts`) A PROPÓSITO: ese
--      tipo está protegido por paridad byte-a-byte en 3 archivos
--      (`calculosHatoParidad.test.ts`) y agregar una clave ahí exigiría
--      tocar los 3 cada vez que cambie un límite de UI/reporte que no es
--      parte del motor de fechas reproductivo. `hatoCategorias.ts`
--      (frontend) y `hato-aggregation.ts` (las 2 copias de Esco) leen
--      estas 2 claves con su propio lector chico
--      (`construirUmbralesCategoriaHatoDesdeFilas`), independiente en cada
--      archivo -- mismo patrón que `resolverLitrosQuincenal`.
--   2. `v_hato_estado_actual`: se agrega `fecha_nacimiento` (de
--      `hato_animales`) AL FINAL del SELECT -- `CREATE OR REPLACE VIEW` no
--      admite reordenar ni insertar en medio, mismo patrón que
--      `ultimo_estado_chequeo` (062). Sin esta columna, el cálculo de edad
--      (D-13) no tiene de dónde leer la fecha de nacimiento sin una
--      consulta aparte a `hato_animales` -- y la vista ya es "la fuente de
--      hechos" del módulo (CLAUDE.md, "Hato Lechero Module"), agregarle un
--      hecho que ya existe en la tabla base sigue esa misma regla.
--      El cuerpo de la vista se copia TAL CUAL de 062 (la migración que la
--      dejó en su forma actual, verificado con grep sobre el repo -- no
--      hay ninguna redefinición posterior) + la columna nueva.
--
-- QUÉ NO HACE (a propósito, fuera de alcance de T6):
--   * No toca `hato_animales.etapa` ni ninguna fila existente -- las
--     categorías se calculan en TypeScript (`hatoCategorias.ts` +
--     `hato-aggregation.ts`), nunca en SQL. El campo `etapa` sigue siendo
--     el override manual (D-13) para cuando el cálculo no puede resolver
--     la edad -- editable desde `EditarAnimalDialog`, sin UI nueva.
--   * No construye la herramienta de Esco para proyectar consumo de
--     concentrado -- D-13/plan §0 la deja explícitamente fuera de alcance
--     de esta ronda. Esta migración solo deja los 2 umbrales y el hecho
--     (`fecha_nacimiento`) que esa herramienta necesitaría el día que se
--     construya.
--   * No agrega UI de Ajustes para las 2 claves nuevas (`AjustesHato.tsx`
--     sigue en 12 claves, 058+062+064+085) -- son editables solo por SQL
--     hasta que una sesión de frontend las incorpore a
--     `ajustesHatoValidacion.ts`. Seguir el precedente de 058/062: sembrar
--     el default primero, la UI de Ajustes llega después (S10 lo hizo así
--     para las 9+1 claves originales).
--
-- RLS: no se toca. `hato_config` ya tiene sus políticas de 058
-- (SELECT authenticated, escritura Gerencia-only); una fila nueva las
-- hereda. La vista sigue `security_invoker = true` (nunca DEFINER, 056).
--
-- Idempotente: `ON CONFLICT (clave) DO NOTHING` en el seed (una
-- re-ejecución nunca pisa una edición ya hecha desde SQL a mano);
-- `CREATE OR REPLACE VIEW` es idempotente por construcción.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. hato_config -- 2 claves nuevas (D-13)
-- ---------------------------------------------------------------------

INSERT INTO hato_config (clave, valor, descripcion)
VALUES
  ('meses_ternera_leche_max', '3'::jsonb,
    'Techo (EXCLUSIVO) de edad en meses para que una ternera cuente como '
    '"leche" en vez de "concentrado" (D-13, categorías calculadas, '
    'docs/plan_hato_ronda_agosto_2026.md §0, 2026-08-06). Nunca una '
    'constante en código -- lo leen hatoCategorias.ts (frontend) y '
    'hato-aggregation.ts (Esco, las 2 copias) con su propio lector, '
    'independiente de HatoConfig a propósito (ese tipo está protegido por '
    'paridad byte-a-byte en 3 archivos).'),
  ('meses_ternera_max', '12'::jsonb,
    'Techo (EXCLUSIVO) de edad en meses para que un animal SIN partos siga '
    'siendo "ternera" en vez de pasar a "novilla" (D-13). Un animal con 1 o '
    'más partos es SIEMPRE "vaca", sin importar la edad -- este umbral solo '
    'aplica cuando num_partos = 0. Mismo lector que meses_ternera_leche_max.')
ON CONFLICT (clave) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. v_hato_estado_actual -- columna nueva `fecha_nacimiento` AL FINAL
--    (cuerpo copiado de 062, la última redefinición vigente)
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
  -- Columna nueva de 089 (D-13, S6): SIEMPRE al final (CREATE OR REPLACE
  -- VIEW no permite insertar en medio ni reordenar).
  a.fecha_nacimiento
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
-- 3. Guardas de cierre -- estructurales (no dependen de un conteo de
--    producción verificado en vivo por esta sesión, ver nota de arriba).
--    Patrón 080/081/082/084: `RAISE EXCEPTION` dentro de un DO deshace
--    toda la transacción si algo no cuadra.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_config_filas       integer;
  v_columna_existe      boolean;
  v_filas_vista         integer;
  v_filas_animales      integer;
  v_desajustes_passthrough integer;
BEGIN
  -- 3.1 Las 2 claves nuevas de hato_config existen con el valor esperado.
  SELECT count(*) INTO v_config_filas
    FROM hato_config
   WHERE clave IN ('meses_ternera_leche_max', 'meses_ternera_max')
     AND ((clave = 'meses_ternera_leche_max' AND valor = '3'::jsonb)
          OR (clave = 'meses_ternera_max' AND valor = '12'::jsonb));
  IF v_config_filas <> 2 THEN
    RAISE EXCEPTION '089 ABORTADA: se esperaban 2 filas de hato_config (meses_ternera_leche_max=3, meses_ternera_max=12), se encontraron %. Si una de las 2 claves ya existía con un valor DISTINTO (editada a mano desde Ajustes o SQL), el ON CONFLICT DO NOTHING la dejó intacta a propósito -- revisar manualmente antes de reintentar.', v_config_filas;
  END IF;

  -- 3.2 La vista expone fecha_nacimiento.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'v_hato_estado_actual'
       AND column_name = 'fecha_nacimiento'
  ) INTO v_columna_existe;
  IF NOT v_columna_existe THEN
    RAISE EXCEPTION '089 ABORTADA: v_hato_estado_actual no expone fecha_nacimiento.';
  END IF;

  -- 3.3 Invariante estructural: la vista es un LEFT JOIN desde
  --     hato_animales sin ningún WHERE que filtre filas -- debe traer
  --     EXACTAMENTE una fila por animal, siempre, sin importar cuántos
  --     haya en el momento en que se aplique esto.
  SELECT count(*) INTO v_filas_vista FROM v_hato_estado_actual;
  SELECT count(*) INTO v_filas_animales FROM hato_animales;
  IF v_filas_vista <> v_filas_animales THEN
    RAISE EXCEPTION '089 ABORTADA: v_hato_estado_actual trae % filas pero hato_animales tiene % -- la vista dejó de ser 1:1 con la tabla base (no debería pasar, este JOIN nunca filtra).', v_filas_vista, v_filas_animales;
  END IF;

  -- 3.4 La columna nueva es un passthrough exacto -- para TODAS las filas,
  --     nunca una muestra -- de hato_animales.fecha_nacimiento (incluye
  --     NULL = NULL vía IS NOT DISTINCT FROM).
  SELECT count(*) INTO v_desajustes_passthrough
    FROM v_hato_estado_actual v
    JOIN hato_animales a ON a.id = v.animal_id
   WHERE v.fecha_nacimiento IS DISTINCT FROM a.fecha_nacimiento;
  IF v_desajustes_passthrough <> 0 THEN
    RAISE EXCEPTION '089 ABORTADA: % fila(s) de v_hato_estado_actual.fecha_nacimiento no coinciden con hato_animales.fecha_nacimiento -- el passthrough está mal.', v_desajustes_passthrough;
  END IF;

  RAISE NOTICE '089 OK: hato_config tiene meses_ternera_leche_max=3 y meses_ternera_max=12; v_hato_estado_actual expone fecha_nacimiento como passthrough exacto de hato_animales sobre % fila(s), 1:1 con la tabla base.', v_filas_vista;
END $$;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Devuelve la vista a la forma de 062 (sin fecha_nacimiento) y borra las 2
-- claves de hato_config. Solo tiene sentido si NADA en producción llegó a
-- depender de la columna nueva (verificar que ningún cliente de
-- PostgREST/Esco la esté leyendo antes de correr esto).
--
--   CREATE OR REPLACE VIEW v_hato_estado_actual AS
--   -- (pegar el cuerpo EXACTO de 062, sin la columna fecha_nacimiento)
--   ;
--   ALTER VIEW v_hato_estado_actual SET (security_invoker = true);
--
--   DELETE FROM hato_config
--    WHERE clave IN ('meses_ternera_leche_max', 'meses_ternera_max');
-- =============================================================================
