-- ============================================================================
-- 152_telegram_campo_solo_fernando_secado_tratamiento.sql
--
-- Issue #251 — Telegram de campo (secado / tratamiento) solo Fernando.
--
-- La 142 apagó los tres tipos de gerencia en Telegram para TODOS, y dejó
-- a Fernando con secado + tratamiento. NO apagó recibe/escalamiento de
-- gerencia (Martha, Santiago) en `hato.secado_due` / `hato.tratamiento_paso`.
-- El 15-sep-2026 el tick reenvió esas alertas + escalamiento 48h a los
-- tres telegram_ids. Producto (#217): solo Fernando recibe esas dos claves
-- en Telegram; gerencia las gestiona en la web.
--
-- YA APLICADA EN PRODUCCIÓN. Snapshot en
-- `respaldos.backup_152_telegram_alertas_suscripciones_campo`. Este fichero
-- es de registro (idempotente). NO reaplicar si el respaldo ya existe —
-- el cuerpo igual es seguro: UPDATE de flags + UPSERT de Fernando.
--
-- Discriminante de Fernando: rol_bot='campo' AND nombre LIKE '%fernando%'
-- (mismo que la 142). Uriel también puede ser `campo` (ronda de inventario);
-- un UPDATE por rol le apagaría mal a Fernando o le prendería a Uriel.
--
-- Traza: telegram_alertas_suscripciones NO está en hato_correcciones.
-- El respaldo en `respaldos` (patrón 081, NUNCA en public) es el único
-- registro de lo que había antes.
--
-- Filas afectadas: UPDATE recibe/escalamiento=false en las 2 claves de
-- campo para quien NO es Fernando; UPSERT de esas 2 claves para Fernando
-- (recibe=true, escalamiento=false). Cero filas de hato_alertas.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. Pre-condiciones. Sin literales de padrón (lección 103/120/133).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tabla boolean;
  v_fernando integer;
BEGIN
  SELECT to_regclass('public.telegram_alertas_suscripciones') IS NOT NULL INTO v_tabla;
  IF NOT v_tabla THEN
    RAISE EXCEPTION '0.1: no existe telegram_alertas_suscripciones — la 096 tiene que estar aplicada';
  END IF;

  SELECT count(*) INTO v_fernando
  FROM telegram_usuarios
  WHERE rol_bot = 'campo'
    AND lower(btrim(nombre_display)) LIKE '%fernando%';
  IF v_fernando = 0 THEN
    RAISE NOTICE '0.2: no hay usuario Telegram campo llamado Fernando. Se apagan igual las claves de campo a no-Fernando.';
  ELSE
    RAISE NOTICE '0.2: % usuario(s) Telegram campo con nombre Fernando — se les deja secado + tratamiento, sin escalamiento.', v_fernando;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 1. Respaldo forense en `respaldos` (NUNCA en public — patrón 081).
--    Idempotente: si la 152 ya corrió, la tabla existe y no se pisa.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS respaldos;

DO $$
BEGIN
  IF to_regclass('respaldos.backup_152_telegram_alertas_suscripciones_campo') IS NULL THEN
    CREATE TABLE respaldos.backup_152_telegram_alertas_suscripciones_campo AS
    SELECT * FROM telegram_alertas_suscripciones;

    ALTER TABLE respaldos.backup_152_telegram_alertas_suscripciones_campo ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON respaldos.backup_152_telegram_alertas_suscripciones_campo FROM anon, authenticated, PUBLIC;
  ELSE
    RAISE NOTICE '1: respaldo backup_152_telegram_alertas_suscripciones_campo ya existe — no se pisa.';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 2. No-Fernando: Recibe y Escalamiento OFF en las dos claves de campo.
--    Incluye gerencia (Martha/Santiago) y cualquier otro campo (Uriel).
--    No borra filas: un DELETE perdería updated_by.
-- ---------------------------------------------------------------------------
UPDATE telegram_alertas_suscripciones s
SET recibe = false,
    escalamiento = false
FROM telegram_usuarios u
WHERE s.telegram_usuario_id = u.id
  AND s.alerta_clave IN ('hato.secado_due', 'hato.tratamiento_paso')
  AND NOT (
    u.rol_bot = 'campo'
    AND lower(btrim(u.nombre_display)) LIKE '%fernando%'
  );


-- ---------------------------------------------------------------------------
-- 3. Fernando: las 2 claves de campo, recibe=true, escalamiento=false.
--    Escalamiento siempre false (campo responde en el corral, no se escala
--    a sí mismo). ON CONFLICT pisa recibe/escalamiento, no el PK.
-- ---------------------------------------------------------------------------
INSERT INTO telegram_alertas_suscripciones (
  telegram_usuario_id,
  alerta_clave,
  recibe,
  escalamiento
)
SELECT
  u.id,
  c.clave,
  true,
  false
FROM telegram_usuarios u
CROSS JOIN alertas_catalogo c
WHERE u.rol_bot = 'campo'
  AND lower(btrim(u.nombre_display)) LIKE '%fernando%'
  AND c.clave IN ('hato.secado_due', 'hato.tratamiento_paso')
ON CONFLICT (telegram_usuario_id, alerta_clave) DO UPDATE
SET recibe = EXCLUDED.recibe,
    escalamiento = EXCLUDED.escalamiento;


-- ---------------------------------------------------------------------------
-- 4. Post-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_ajenos_on integer;
  v_fernando integer;
  v_campo_ok integer;
  v_backup integer;
  v_live integer;
BEGIN
  SELECT count(*) INTO v_ajenos_on
  FROM telegram_alertas_suscripciones s
  JOIN telegram_usuarios u ON u.id = s.telegram_usuario_id
  WHERE s.alerta_clave IN ('hato.secado_due', 'hato.tratamiento_paso')
    AND (s.recibe = true OR s.escalamiento = true)
    AND NOT (
      u.rol_bot = 'campo'
      AND lower(btrim(u.nombre_display)) LIKE '%fernando%'
    );
  IF v_ajenos_on <> 0 THEN
    RAISE EXCEPTION '4.1: quedan % suscripciones de campo encendidas fuera de Fernando; se esperaba 0', v_ajenos_on;
  END IF;

  SELECT count(*) INTO v_fernando
  FROM telegram_usuarios
  WHERE rol_bot = 'campo'
    AND lower(btrim(nombre_display)) LIKE '%fernando%';

  IF v_fernando > 0 THEN
    SELECT count(*) INTO v_campo_ok
    FROM telegram_alertas_suscripciones s
    JOIN telegram_usuarios u ON u.id = s.telegram_usuario_id
    WHERE u.rol_bot = 'campo'
      AND lower(btrim(u.nombre_display)) LIKE '%fernando%'
      AND s.alerta_clave IN ('hato.secado_due', 'hato.tratamiento_paso')
      AND s.recibe = true
      AND s.escalamiento = false;
    IF v_campo_ok <> (v_fernando * 2) THEN
      RAISE EXCEPTION '4.2: Fernando no quedó con las 2 claves de campo en recibe=true / escalamiento=false (hay %, se esperaban %)',
        v_campo_ok, v_fernando * 2;
    END IF;
  END IF;

  SELECT count(*) INTO v_backup FROM respaldos.backup_152_telegram_alertas_suscripciones_campo;
  SELECT count(*) INTO v_live FROM telegram_alertas_suscripciones;
  -- El UPSERT puede agregar filas (Fernando sin las 2 claves). Nunca baja.
  IF v_live < v_backup THEN
    RAISE EXCEPTION '4.3: el vivo (%) quedó por debajo del respaldo (%); un UPDATE de flags no borra filas',
      v_live, v_backup;
  END IF;

  RAISE NOTICE '152 OK: campo Telegram = solo Fernando (secado + tratamiento, sin escalamiento). Respaldo % filas, vivo %.',
    v_backup, v_live;
END $$;


-- ============================================================================
-- ROLLBACK (ejecutable, si hiciera falta)
-- ============================================================================
-- BEGIN;
--   DELETE FROM telegram_alertas_suscripciones;
--   INSERT INTO telegram_alertas_suscripciones
--     SELECT * FROM respaldos.backup_152_telegram_alertas_suscripciones_campo;
-- COMMIT;
