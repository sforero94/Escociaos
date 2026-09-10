-- ============================================================================
-- 142_alertas_defaults_campo_secado_tratamiento.sql
--
-- Issue #217 — gestor de alertas. Defaults de Telegram al embarcar:
-- Fernando (rol_bot='campo', nombre con "fernando") recibe SOLO
-- hato.secado_due y hato.tratamiento_paso. Los tres tipos de gerencia
-- (rechequeo_due, servicio_sin_confirmacion, parto_proximo) quedan
-- web-only para TODOS, hasta que Gerencia los encienda desde
-- /hato-lechero/alertas → Quién recibe.
--
-- POR QUÉ NO SE ENCIENDE CAMPO ENTERO. Uriel también puede ser `campo`
-- (ronda de inventario). Un UPDATE por rol_bot='campo' le prendería
-- secado/tratamiento a quien no es Fernando. El nombre es el discriminante
-- deliberado, no un fallback.
--
-- El tick YA filtra con destinatariosTelegramPermitidos (código). Esta
-- migración alinea el DATO para que la matriz no mienta. Las dos capas
-- tienen que coincidir: una suscripción mal marcada no debe re-inundar
-- el Telegram de campo.
--
-- Traza: telegram_alertas_suscripciones NO está en hato_correcciones.
-- El respaldo en `respaldos` (patrón 081, NUNCA en public) es el único
-- registro de lo que había antes.
--
-- Filas afectadas: UPDATE de recibe/escalamiento en claves de gerencia
-- (todas las filas de esas 3 claves) + UPSERT de las 5 claves hato para
-- Fernando. Cero filas de hato_alertas. NO APLICAR desde el agente —
-- espera el go del dueño, igual que 120/133/137/141.
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
    RAISE NOTICE '0.2: no hay usuario Telegram campo llamado Fernando. Se apagan igual las claves de gerencia; el UPSERT de campo no inserta nada.';
  ELSE
    RAISE NOTICE '0.2: % usuario(s) Telegram campo con nombre Fernando — se les deja secado + tratamiento.', v_fernando;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 1. Respaldo forense en `respaldos` (NUNCA en public — patrón 081).
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS respaldos;

CREATE TABLE respaldos.backup_142_telegram_alertas_suscripciones AS
SELECT * FROM telegram_alertas_suscripciones;

ALTER TABLE respaldos.backup_142_telegram_alertas_suscripciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_142_telegram_alertas_suscripciones FROM anon, authenticated, PUBLIC;


-- ---------------------------------------------------------------------------
-- 2. Tipos de gerencia: web-only para todos. Recibe y escalamiento OFF.
--    No borra filas: un DELETE perdería updated_by y el UPSERT de Fernando
--    no cubre a los demás usuarios.
-- ---------------------------------------------------------------------------
UPDATE telegram_alertas_suscripciones
SET recibe = false,
    escalamiento = false
WHERE alerta_clave IN (
  'hato.rechequeo_due',
  'hato.servicio_sin_confirmacion',
  'hato.parto_proximo'
);


-- ---------------------------------------------------------------------------
-- 3. Fernando: las 5 claves hato, recibe=true SOLO en las dos de campo.
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
  (c.clave IN ('hato.secado_due', 'hato.tratamiento_paso')),
  false
FROM telegram_usuarios u
CROSS JOIN alertas_catalogo c
WHERE u.rol_bot = 'campo'
  AND lower(btrim(u.nombre_display)) LIKE '%fernando%'
  AND c.clave IN (
    'hato.secado_due',
    'hato.tratamiento_paso',
    'hato.rechequeo_due',
    'hato.servicio_sin_confirmacion',
    'hato.parto_proximo'
  )
ON CONFLICT (telegram_usuario_id, alerta_clave) DO UPDATE
SET recibe = EXCLUDED.recibe,
    escalamiento = EXCLUDED.escalamiento;


-- ---------------------------------------------------------------------------
-- 4. Post-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_gerencia_on integer;
  v_fernando integer;
  v_campo_ok integer;
  v_backup integer;
  v_live integer;
BEGIN
  SELECT count(*) INTO v_gerencia_on
  FROM telegram_alertas_suscripciones
  WHERE alerta_clave IN (
    'hato.rechequeo_due',
    'hato.servicio_sin_confirmacion',
    'hato.parto_proximo'
  )
    AND (recibe = true OR escalamiento = true);
  IF v_gerencia_on <> 0 THEN
    RAISE EXCEPTION '4.1: quedan % suscripciones de gerencia encendidas; se esperaba 0', v_gerencia_on;
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
      RAISE EXCEPTION '4.2: Fernando no quedó con las 2 claves de campo en recibe=true (hay %, se esperaban %)',
        v_campo_ok, v_fernando * 2;
    END IF;
  END IF;

  SELECT count(*) INTO v_backup FROM respaldos.backup_142_telegram_alertas_suscripciones;
  SELECT count(*) INTO v_live FROM telegram_alertas_suscripciones;
  -- El UPSERT puede agregar filas (Fernando sin las 5 claves). Nunca baja.
  IF v_live < v_backup THEN
    RAISE EXCEPTION '4.3: el vivo (%) quedó por debajo del respaldo (%); un UPDATE de flags no borra filas',
      v_live, v_backup;
  END IF;

  RAISE NOTICE '142 OK: gerencia Telegram off; Fernando campo = secado + tratamiento (si existe). Respaldo % filas, vivo %.',
    v_backup, v_live;
END $$;


-- ============================================================================
-- ROLLBACK (ejecutable, si hiciera falta)
-- ============================================================================
-- BEGIN;
--   DELETE FROM telegram_alertas_suscripciones;
--   INSERT INTO telegram_alertas_suscripciones
--     SELECT * FROM respaldos.backup_142_telegram_alertas_suscripciones;
-- COMMIT;
