-- ============================================================================
-- 162_telegram_retirar_llave_gastos.sql
--
-- Hallazgo ESCO-117 — retirar la llave `gastos` de Telegram.
--
-- Decisión de Santiago (2026-09-21), literal: «Aparte por ahora, quíta el
-- flujo de gastos». La pregunta de arquitectura —si la autorización de
-- Telegram debe ser independiente o derivada de `usuarios.rol`— queda
-- aplazada; el flujo se va.
--
-- POR QUÉ. `telegram_usuarios.modulos_permitidos` es un SEGUNDO sistema de
-- autorización sin ningún vínculo con `usuarios.rol` ni con
-- `usuarios.modulos_acceso`: no hay FK, ni CHECK, ni trigger. La llave
-- `gastos` era la única puerta del comando /gasto, y esa conversación
-- escribe con el `service_role`, que tiene `rolbypassrls`. O sea que
-- `es_usuario_gerencia()` —el único predicado de las 13 tablas `fin_*`—
-- nunca se evaluaba.
--
-- LA ASIMETRÍA QUE OBLIGÓ A ACTUAR. La mitad de gastos estaba contenida:
-- el flujo escribía `fin_gastos` con `estado = 'Pendiente'` y el motor de
-- reportes sólo cuenta `Confirmado`. El sub-flujo de GANADO del mismo
-- comando escribía `fin_transacciones_ganado`, que NO tiene estado
-- pendiente en la capa financiera: la fila entra de una al Flujo de Caja y
-- al COGS de ganado, que es un promedio móvil ponderado **dependiente del
-- camino** y se recalcula sobre TODA la historia. Una captura equivocada
-- desde un teléfono corre el costo de ventas de todos los años.
--
-- COSTO DE RETIRARLO: CERO. El camino /gasto de Telegram nunca produjo una
-- fila. Desde el 2026-08-01 las 108 filas de `fin_gastos` las capturó
-- Consuelito, que no es una fila de `telegram_usuarios`.
--
-- ALCANCE: SÓLO `gastos`. `ingresos` NO se toca — Santiago nombró gastos.
--
-- TRAZA. `telegram_usuarios` NO está trazada por `hato_correcciones` (084)
-- ni por `globalgap_correcciones` (113), y `logs_auditoria` nunca recibió
-- una fila. El respaldo en `respaldos` (patrón 081, NUNCA en `public`, que
-- hereda `GRANT ALL … TO anon`) es el ÚNICO registro del estado anterior.
--
-- Estado vivo verificado el 2026-09-21 (5 filas, 3 con `gastos`):
--   David García     campo     {labores,monitoreo,gastos}
--   Fernando Jimenez campo     {hato_produccion}
--   Martha Vega      gerencia  {gastos,ingresos,hato_produccion,consultas}
--   Santiago Forero  gerencia  {labores,monitoreo,gastos,ingresos,consultas,
--                               hato_produccion,inventario_aprobacion,
--                               inventario_ronda,inventario_explicacion}
--   Uriel Parada     campo     {inventario_ronda}
--
-- `array_remove` conserva el orden de los elementos que quedan y no toca
-- las 2 filas sin la llave.
--
-- Filas afectadas: 3.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. Pre-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_con_gastos integer;
BEGIN
  IF to_regclass('public.telegram_usuarios') IS NULL THEN
    RAISE EXCEPTION '0.1: no existe public.telegram_usuarios';
  END IF;

  SELECT count(*) INTO v_con_gastos
  FROM telegram_usuarios
  WHERE 'gastos' = ANY(modulos_permitidos);

  IF v_con_gastos <> 3 THEN
    RAISE EXCEPTION '0.2: % filas llevan la llave gastos; se esperaban exactamente 3 (David, Martha, Santiago)', v_con_gastos;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 1. Respaldo forense en `respaldos` (NUNCA en public — patrón 081).
--    Idempotente: si la 162 ya corrió, la tabla existe y no se pisa.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS respaldos;

DO $$
BEGIN
  IF to_regclass('respaldos.backup_162_telegram_usuarios_gastos') IS NULL THEN
    CREATE TABLE respaldos.backup_162_telegram_usuarios_gastos AS
    SELECT * FROM telegram_usuarios;

    ALTER TABLE respaldos.backup_162_telegram_usuarios_gastos ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON respaldos.backup_162_telegram_usuarios_gastos FROM anon, authenticated, PUBLIC;
  ELSE
    RAISE NOTICE '1: respaldo backup_162_telegram_usuarios_gastos ya existe — no se pisa.';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 2. Quitar SÓLO el elemento `gastos`. `ingresos` y el resto quedan igual,
--    en el mismo orden. Las 2 filas sin la llave no entran al UPDATE.
-- ---------------------------------------------------------------------------
UPDATE telegram_usuarios
SET modulos_permitidos = array_remove(modulos_permitidos, 'gastos')
WHERE 'gastos' = ANY(modulos_permitidos);


-- ---------------------------------------------------------------------------
-- 3. Post-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_con_gastos integer;
  v_total integer;
  v_backup integer;
  v_con_ingresos integer;
  v_ingresos_backup integer;
  v_diff integer;
BEGIN
  SELECT count(*) INTO v_con_gastos
  FROM telegram_usuarios
  WHERE 'gastos' = ANY(modulos_permitidos);
  IF v_con_gastos <> 0 THEN
    RAISE EXCEPTION '3.1: quedan % filas con la llave gastos; se esperaban 0', v_con_gastos;
  END IF;

  SELECT count(*) INTO v_total FROM telegram_usuarios;
  SELECT count(*) INTO v_backup FROM respaldos.backup_162_telegram_usuarios_gastos;
  IF v_total <> 5 THEN
    RAISE EXCEPTION '3.2: hay % filas en telegram_usuarios; se esperaban 5 — un UPDATE de array no crea ni borra filas', v_total;
  END IF;
  IF v_total <> v_backup THEN
    RAISE EXCEPTION '3.3: el vivo (%) no coincide con el respaldo (%)', v_total, v_backup;
  END IF;

  -- `ingresos` NO se toca: mismo conteo antes y después.
  SELECT count(*) INTO v_con_ingresos
  FROM telegram_usuarios
  WHERE 'ingresos' = ANY(modulos_permitidos);
  SELECT count(*) INTO v_ingresos_backup
  FROM respaldos.backup_162_telegram_usuarios_gastos
  WHERE 'ingresos' = ANY(modulos_permitidos);
  IF v_con_ingresos <> v_ingresos_backup THEN
    RAISE EXCEPTION '3.4: ingresos pasó de % a % filas; esta migración no lo toca',
      v_ingresos_backup, v_con_ingresos;
  END IF;

  -- Ninguna otra llave cambió: la diferencia contra el respaldo, fila por
  -- fila, tiene que ser exactamente el elemento `gastos`.
  SELECT count(*) INTO v_diff
  FROM telegram_usuarios t
  JOIN respaldos.backup_162_telegram_usuarios_gastos b ON b.id = t.id
  WHERE t.modulos_permitidos IS DISTINCT FROM array_remove(b.modulos_permitidos, 'gastos');
  IF v_diff <> 0 THEN
    RAISE EXCEPTION '3.5: % filas difieren del respaldo por algo más que la llave gastos', v_diff;
  END IF;

  RAISE NOTICE '162 OK: llave gastos retirada de 3 filas. % filas vivas, respaldo % filas, ingresos intacto en %.',
    v_total, v_backup, v_con_ingresos;
END $$;


-- ============================================================================
-- ROLLBACK (ejecutable, si hiciera falta)
--
-- Devuelve `modulos_permitidos` al estado del respaldo. No toca ninguna otra
-- columna. Restituir la llave NO restituye el flujo: el comando /gasto y su
-- conversación se borraron del código de la edge function en el mismo
-- cambio, así que la llave sola no hace nada hasta que se reponga el código.
-- ============================================================================
-- BEGIN;
--   UPDATE telegram_usuarios t
--   SET modulos_permitidos = b.modulos_permitidos
--   FROM respaldos.backup_162_telegram_usuarios_gastos b
--   WHERE b.id = t.id
--     AND t.modulos_permitidos IS DISTINCT FROM b.modulos_permitidos;
-- COMMIT;
