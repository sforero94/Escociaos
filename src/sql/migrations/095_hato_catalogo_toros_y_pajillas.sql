-- =====================================================================
-- 095: Hato Lechero — catálogo de toros vigente + inventario de pajillas.
-- Fecha: 2026-08-13
-- Plan:  docs/plan_hato_telegram_estados_agosto_2026.md (N14 + N15)
--
-- DECISIÓN DEL DUEÑO (D-A, 2026-08-13)
-- -----------------------------------
-- "Borra todo el inventario de toros y pajillas y déjalo en: toros — Jersey
-- y ternero Holstein, los dos de monta, luego agrega [las pajillas] como
-- único inventario", resuelto en chips como **borrar los no usados,
-- desactivar los usados**: el catálogo tiene 63 toros y 52 están
-- referenciados por 232 eventos de servicio históricos. Borrarlos de verdad
-- destruiría con qué toro se sirvió cada vaca en siete años de historia.
--
-- Estado final: 8 toros ACTIVOS (2 de monta + 6 de inseminación, uno por
-- cada lote de pajillas) y todo lo demás inactivo o eliminado.
--
-- LO QUE ESTA MIGRACIÓN DESCUBRIÓ Y POR QUÉ IMPORTA
-- ------------------------------------------------
-- Verificado contra producción antes de escribir una sola línea:
--
-- 1. **`Ternero Holstein` YA EXISTE y está entre los "sin referencias"**
--    (0 eventos), además de estar `activo = false`. Un `DELETE FROM
--    hato_toros WHERE <sin referencias>` habría borrado exactamente el toro
--    que el dueño pidió conservar. De ahí que la lista de sobrevivientes se
--    excluya del borrado ANTES de cualquier otra condición.
--
-- 2. **`matt` y `marquez` YA EXISTEN, en minúscula y CON eventos** (1 y 6
--    servicios): son los mismos toros del inventario de pajillas, cargados
--    en su día desde la planilla sin raza ni tipo. Se REUSAN y se
--    normalizan (nombre, raza, tipo), nunca se insertan de nuevo —
--    `hato_toros` tiene `UNIQUE (lower(nombre))` y un INSERT habría
--    fallado con 23505. Son también la excepción a "desactivar los usados":
--    están referenciados Y siguen vigentes.
--
-- 3. **`Jersey` ya está exactamente como se necesita** (raza Jersey, tipo
--    monta, activo) y arrastra 44 servicios. No se toca.
--
-- 4. La fila histórica **`Holstein` a secas (48 eventos) NO se fusiona con
--    `Ternero Holstein`**. Viene de la importación, donde la planilla
--    escribía solo la raza cuando el toro no tenía nombre; no hay forma de
--    saber cuáles de esos 48 servicios fueron de este ternero, y fusionar
--    sería inventar historia. Se desactiva como cualquier otro referenciado.
--    Mismo criterio que la regla del módulo "dos nombres en la misma hoja
--    son dos animales, nunca un rename".
--
-- RESPALDO
-- --------
-- El respaldo va al esquema `respaldos`, NUNCA a `public` (migración 081:
-- Supabase concede `ALL` a `anon` por defecto sobre las tablas nuevas de
-- `public`, que fue justo la alerta crítica del linter del 2026-08-03).
--
-- GUARDAS
-- -------
-- `RAISE EXCEPTION` aborta toda la transacción si los conteos previos o
-- posteriores no cuadran exactamente (patrón 075/076/080/081). El incidente
-- de corrupción del 2026-07-23 es la razón por la que esto no se hace con
-- SQL ad hoc.
--
-- NO idempotente en su guarda de entrada: correrla dos veces aborta en la
-- primera verificación (el catálogo ya no tendrá 63 toros). Eso es
-- deliberado — un segundo pase silencioso es peor que un error ruidoso.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Esquema de respaldos (creado por 081; se asegura por si acaso).
-- ---------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS respaldos;
REVOKE ALL ON SCHEMA respaldos FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 1. Los 8 toros que sobreviven activos. Única fuente de verdad del
--    resto de la migración: se usa para el UPSERT, para excluir del
--    borrado y para excluir de la desactivación.
-- ---------------------------------------------------------------------

CREATE TEMP TABLE toros_vigentes (
  clave   TEXT PRIMARY KEY,  -- lower(btrim(nombre)) con el que se busca
  nombre  TEXT NOT NULL,     -- nombre de presentación final
  raza    TEXT NOT NULL,
  tipo    TEXT NOT NULL CHECK (tipo IN ('monta', 'inseminacion')),
  pajillas INTEGER           -- NULL = toro de monta, no lleva lote
) ON COMMIT DROP;

INSERT INTO toros_vigentes (clave, nombre, raza, tipo, pajillas) VALUES
  -- Los dos de monta. Todavía no tienen nombre propio (el dueño está
  -- definiéndolo); estos son los nombres con los que ya viven en la base.
  ('jersey',           'Jersey',           'Jersey',   'monta',        NULL),
  ('ternero holstein', 'Ternero Holstein', 'Holstein', 'monta',        NULL),
  -- Inventario de pajillas dictado por el dueño el 2026-08-13. 27 unidades.
  ('matt',             'Matt',             'Jersey',   'inseminacion', 7),
  ('daily double',     'Daily Double',     'Jersey',   'inseminacion', 5),
  ('ulozon',           'Ulozon',           'Normando', 'inseminacion', 3),
  ('hecker',           'Hecker',           'Holstein', 'inseminacion', 1),
  ('marquez',          'Márquez',          'Holstein', 'inseminacion', 1),
  ('valentino',        'Valentino',        'Simental', 'inseminacion', 10);

-- ---------------------------------------------------------------------
-- 2. Guarda de entrada: el catálogo tiene que estar como se verificó.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_total INTEGER;
  v_pajillas INTEGER;
  v_usos INTEGER;
BEGIN
  SELECT count(*) INTO v_total FROM hato_toros;
  SELECT count(*) INTO v_pajillas FROM hato_pajillas;
  SELECT count(*) INTO v_usos FROM hato_pajillas_uso;

  IF v_total <> 63 THEN
    RAISE EXCEPTION 'Migración 095: se esperaban 63 toros en el catálogo, hay %. Verificar el estado antes de continuar.', v_total;
  END IF;
  -- El inventario de pajillas está en CERO (verificado 2026-08-13): no hay
  -- nada que borrar, solo que sembrar. Si alguien cargó pajillas entre la
  -- verificación y la ejecución, esta migración no debe pisarlas.
  IF v_pajillas <> 0 OR v_usos <> 0 THEN
    RAISE EXCEPTION 'Migración 095: hato_pajillas/hato_pajillas_uso ya tienen datos (% lotes, % usos). Esta migración solo siembra sobre inventario vacío.', v_pajillas, v_usos;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. Respaldo forense del catálogo completo, antes de tocar nada.
-- ---------------------------------------------------------------------

DROP TABLE IF EXISTS respaldos.backup_095_hato_toros;
CREATE TABLE respaldos.backup_095_hato_toros AS
SELECT t.*,
  (SELECT count(*) FROM hato_eventos e WHERE e.toro_id = t.id) AS eventos_al_respaldar,
  (SELECT count(*) FROM hato_animales a WHERE a.padre_toro_id = t.id) AS hijos_al_respaldar
FROM hato_toros t;

ALTER TABLE respaldos.backup_095_hato_toros ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_095_hato_toros FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Alta o normalización de los 8 vigentes.
--    SELECT-or-UPDATE por id, NUNCA upsert de PostgREST ni ON CONFLICT
--    sobre el índice de expresión `lower(nombre)`.
-- ---------------------------------------------------------------------

UPDATE hato_toros t
SET nombre = v.nombre,
    raza   = v.raza,
    tipo   = v.tipo,
    activo = TRUE
FROM toros_vigentes v
WHERE lower(btrim(t.nombre)) = v.clave;

INSERT INTO hato_toros (nombre, raza, tipo, activo)
SELECT v.nombre, v.raza, v.tipo, TRUE
FROM toros_vigentes v
WHERE NOT EXISTS (
  SELECT 1 FROM hato_toros t WHERE lower(btrim(t.nombre)) = lower(btrim(v.nombre))
);

-- ---------------------------------------------------------------------
-- 5. Borrado de los toros sin uso alguno, EXCLUYENDO a los vigentes.
--    El orden importa: los vigentes salen primero de la selección, y solo
--    después se evalúa "no tiene referencias".
-- ---------------------------------------------------------------------

DELETE FROM hato_toros t
WHERE NOT EXISTS (SELECT 1 FROM toros_vigentes v WHERE v.clave = lower(btrim(t.nombre)))
  AND NOT EXISTS (SELECT 1 FROM hato_eventos   e WHERE e.toro_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM hato_animales  a WHERE a.padre_toro_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM hato_pajillas  p WHERE p.toro_id = t.id);

-- ---------------------------------------------------------------------
-- 6. Desactivación de todo lo demás (los referenciados que ya no se usan).
--    Se conserva la fila entera: es lo que le da nombre a 232 servicios.
-- ---------------------------------------------------------------------

UPDATE hato_toros t
SET activo = FALSE
WHERE t.activo
  AND NOT EXISTS (SELECT 1 FROM toros_vigentes v WHERE v.clave = lower(btrim(t.nombre)));

-- ---------------------------------------------------------------------
-- 7. Inventario de pajillas: un lote por toro de inseminación.
-- ---------------------------------------------------------------------

INSERT INTO hato_pajillas (toro_id, cantidad_inicial, activa)
SELECT t.id, v.pajillas, TRUE
FROM toros_vigentes v
  JOIN hato_toros t ON lower(btrim(t.nombre)) = lower(btrim(v.nombre))
WHERE v.pajillas IS NOT NULL;

-- ---------------------------------------------------------------------
-- 8. Guarda de salida. Cualquier desviación aborta TODO.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_activos INTEGER;
  v_monta INTEGER;
  v_lotes INTEGER;
  v_unidades INTEGER;
  v_eventos_huerfanos INTEGER;
  v_jersey_eventos INTEGER;
BEGIN
  SELECT count(*) INTO v_activos FROM hato_toros WHERE activo;
  IF v_activos <> 8 THEN
    RAISE EXCEPTION 'Migración 095: deberían quedar 8 toros activos, quedaron %.', v_activos;
  END IF;

  SELECT count(*) INTO v_monta FROM hato_toros WHERE activo AND tipo = 'monta';
  IF v_monta <> 2 THEN
    RAISE EXCEPTION 'Migración 095: deberían quedar 2 toros de monta activos, quedaron %.', v_monta;
  END IF;

  SELECT count(*), COALESCE(sum(cantidad_inicial), 0) INTO v_lotes, v_unidades FROM hato_pajillas;
  IF v_lotes <> 6 OR v_unidades <> 27 THEN
    RAISE EXCEPTION 'Migración 095: se esperaban 6 lotes de pajillas por 27 unidades, hay % lotes por % unidades.', v_lotes, v_unidades;
  END IF;

  -- Ningún evento puede haber perdido su toro: el borrado solo alcanzó
  -- filas sin referencias, así que esto debe dar 0 siempre. Si da otra
  -- cosa, el DELETE se llevó historia por delante.
  SELECT count(*) INTO v_eventos_huerfanos
  FROM hato_eventos e
  WHERE e.toro_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM hato_toros t WHERE t.id = e.toro_id);
  IF v_eventos_huerfanos <> 0 THEN
    RAISE EXCEPTION 'Migración 095: % eventos quedaron sin toro. Abortando.', v_eventos_huerfanos;
  END IF;

  -- Los 44 servicios de Jersey siguen colgando de la misma fila.
  SELECT count(*) INTO v_jersey_eventos
  FROM hato_eventos e JOIN hato_toros t ON t.id = e.toro_id
  WHERE lower(btrim(t.nombre)) = 'jersey';
  IF v_jersey_eventos <> 44 THEN
    RAISE EXCEPTION 'Migración 095: Jersey debería conservar 44 servicios, tiene %.', v_jersey_eventos;
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- ROLLBACK (manual, desde el respaldo):
--
--   BEGIN;
--   DELETE FROM hato_pajillas;                         -- el seed de esta migración
--   UPDATE hato_toros t SET nombre = b.nombre, raza = b.raza,
--          tipo = b.tipo, activo = b.activo
--     FROM respaldos.backup_095_hato_toros b WHERE b.id = t.id;
--   INSERT INTO hato_toros (id, nombre, tipo, raza, activo, created_at, created_by)
--     SELECT b.id, b.nombre, b.tipo, b.raza, b.activo, b.created_at, b.created_by
--     FROM respaldos.backup_095_hato_toros b
--     WHERE NOT EXISTS (SELECT 1 FROM hato_toros t WHERE t.id = b.id);
--   COMMIT;
--
-- El respaldo se deja en la base a propósito (misma decisión que 075/080).
-- =====================================================================
