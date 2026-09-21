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
-- COSTO DE RETIRARLO: NINGUNA FILA VIVA ES ATRIBUIBLE A ESTE CAMINO.
--
-- OJO con el argumento que NO sirve, porque estuvo escrito acá y es falso:
-- «lo capturó Consuelito, que no es una fila de telegram_usuarios», por
-- `created_by`. No prueba nada — el insert borrado SÍ ponía autor
-- (`created_by: usuarioId` desde `resolverUsuarioTelegram`, issue #274),
-- así que una escritura por Telegram también habría llevado uno.
--
-- La evidencia que sí se sostiene, verificada en vivo el 2026-09-21:
--   * `fin_gastos`: 4.534 de 4.534 filas están en `Confirmado`. NO existe
--     una sola fila en ningún otro estado. El flujo borrado escribía
--     `estado: "Pendiente"` fijo, así que ninguna fila viva salió de él.
--   * `fin_transacciones_ganado`: el sub-flujo sólo escribía
--     `tipo = 'compra'` y nunca ponía `created_by`. La única fila sin autor
--     posterior al trigger de la 050 (2026-07-21) es la VENTA del
--     2026-07-14; las dos compras llevan autor.
--
-- Y el límite honesto de esa evidencia: un gasto `Pendiente` confirmado
-- después a mano sería indistinguible de uno capturado en la web. O sea
-- que lo demostrable es «ninguna fila viva es atribuible a este camino»,
-- NO «nunca produjo una fila». La segunda es una negación que no se puede
-- probar y no se afirma acá.
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
-- ORDEN DE APLICACIÓN: MIGRACIÓN PRIMERO, `functions deploy` DESPUÉS.
-- La primera versión de este encabezado recomendaba lo contrario. Es al
-- revés, y la razón no es cuál ventana es más segura — LAS DOS son
-- inofensivas: con la llave quitada y el comando todavía vivo, el
-- `if (!modulos_permitidos?.includes("gastos"))` de `bot.ts` contesta «No
-- tienes acceso a este módulo»; con el comando quitado y la llave viva,
-- `/gasto` cae al manejador de texto libre de Esco. Ninguna escribe.
-- Migración primero gana por dos razones distintas:
--   1. LA LLAVE *ES* LA AUTORIZACIÓN. Quitarla cierra /gasto contra
--      cualquier versión del código, incluido un despliegue viejo o
--      revertido. Desplegar primero deja la llave viva y el flujo
--      re-armable con un redespliegue de una versión anterior.
--   2. Desplegar primero abre una ventana en la que la llave se vuelve
--      IMPOSIBLE DE QUITAR desde la interfaz y ADEMÁS se reescribe sola.
--      `TelegramConfig.tsx:216` siembra el formulario desde la fila
--      (`setModulosPermitidos([...(usuario.modulos_permitidos ?? [])])`),
--      las casillas se dibujan desde `TELEGRAM_MODULES` (línea 683) y
--      `handleSubmit` reescribe el arreglo ENTERO (líneas 254/273). Sin
--      `gastos` en el catálogo no hay casilla que desmarcar, y guardar la
--      ficha de David vuelve a persistir la llave. Después de la
--      migración ese mismo camino ya no puede reponerla.
--
-- LA COLUMNA ES NULLABLE (`text[] NULL DEFAULT '{labores}'`), y da igual:
-- `'gastos' = ANY(NULL::text[])` da NULL y no true, así que una fila NULL
-- nunca entra al WHERE ni llega a `array_remove`; la guarda 3.5 también es
-- NULL-safe (`NULL IS DISTINCT FROM NULL` es falso). Hoy ninguna es NULL.
--
-- DOS DETALLES DEL RESPALDO Y DEL ROLLBACK:
--   * El trigger `update_telegram_usuarios_updated_at` mueve `updated_at`
--     en las 3 filas, y el ROLLBACK restituye sólo `modulos_permitidos`.
--     La marca de tiempo queda movida. Es cosmético, pero no estaba dicho.
--   * El respaldo es `SELECT *` a propósito (precedente 081/152), así que
--     copia también `telegram_id`, `telegram_username`, `usuario_id` y
--     `codigo_vinculacion`. Las guardas y el ROLLBACK sólo necesitan `id`
--     y `modulos_permitidos`; la fila entera se guarda porque a esta tabla
--     no la traza nadie más.
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

  -- NO aborta por conteo. Un `<> 3` se negaria a correr justo cuando hay
  -- MAS que limpiar: hasta que salga el despliegue, la casilla `gastos`
  -- sigue existiendo en Configuracion -> Telegram, asi que una cuarta
  -- concesion es alcanzable. Es el veredicto de la 120 al pie de la letra
  -- («se negaba a correr justo cuando el agujero se vuelve real») y el
  -- literal de padron que la 133 prohibio. La afirmacion dura ya vive en
  -- la post-condicion 3.1, que exige CERO al terminar.
  IF v_con_gastos = 0 THEN
    RAISE NOTICE '0.2: ninguna fila lleva la llave gastos -- la 162 no tiene nada que hacer.';
  ELSE
    RAISE NOTICE '0.2: % fila(s) llevan la llave gastos (eran 3 el 2026-09-21).', v_con_gastos;
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
  -- Sin literal de padron, y denunciando SOLO hacia abajo (patron 133).
  -- Gerencia da de alta usuarios de Telegram desde Configuracion -> Telegram
  -- y el padron se movio de 2 (2026-03-19) a 4 (08-12) a 5 (08-28): un alta
  -- legitima a mitad de la transaccion abortaria una migracion sana. Un
  -- UPDATE de array no puede BORRAR filas, asi que la unica direccion que
  -- denuncia algo roto es que falten.
  IF v_total < v_backup THEN
    RAISE EXCEPTION '3.3: hay % filas vivas contra % en el respaldo -- un UPDATE de array no borra filas', v_total, v_backup;
  END IF;

  -- `ingresos` NO se toca: mismo conteo antes y después.
  -- Acotado a los ids respaldados, igual que la 3.5 -- que es la unica
  -- post-condicion que ya estaba bien. Sin el JOIN, un usuario nuevo con
  -- `ingresos` concedido entre el respaldo y esta comprobacion aborta la
  -- corrida sin que nada este mal.
  SELECT count(*) INTO v_con_ingresos
  FROM telegram_usuarios t
  JOIN respaldos.backup_162_telegram_usuarios_gastos b ON b.id = t.id
  WHERE 'ingresos' = ANY(t.modulos_permitidos);
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
