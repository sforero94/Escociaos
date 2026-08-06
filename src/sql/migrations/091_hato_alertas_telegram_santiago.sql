-- =====================================================================
-- 091: Hato Lechero -- S6 T8.1 de la ronda de agosto 2026 (D-14)
--      (docs/plan_hato_ronda_agosto_2026.md, §0 D-14, §4 S6, §5 P-1).
-- Fecha: 2026-08-06
--
-- Decisión del dueño (D-14): "Las alertas de Telegram van a Santiago
-- mientras prueba. Falta su chat id." Resuelto (§5 P-1 del plan):
-- `telegram_id = 8505349717`, verificado contra `telegram_usuarios`
-- (`rol_bot = 'gerencia'`). David García es 8605652486 -- NO es él, y esta
-- migración lo comprueba en un guard antes de escribir nada (parte 2).
--
-- ⚠️ Esta sesión NO tuvo acceso al conector de solo lectura de Supabase
-- (no estuvo disponible en el entorno de ejecución) y NO pudo re-verificar
-- en vivo que `telegram_id = 8505349717` sigue siendo Santiago en
-- `telegram_usuarios`. El guard de la parte 2 hace esa verificación en el
-- momento de aplicar -- si `telegram_usuarios` cambió desde que se escribió
-- este archivo (poco probable, pero esta sesión no puede afirmarlo), la
-- migración aborta en vez de escribir un destinatario equivocado.
--
-- QUÉ HACE: puebla `hato_alertas_config.destinatario_telegram_id` = '8505349717'
-- en las 5 filas (una por `tipo` de alerta: secado_due, tratamiento_paso,
-- rechequeo_due, servicio_sin_confirmacion, parto_proximo) -- hoy las 5 en
-- NULL desde que 056 las sembró (2026-07-22, "lazo abierto" documentado en
-- CLAUDE.md desde 2026-07-28). Es el arreglo de UNA columna que
-- CLAUDE.md señala como la causa raíz de que el motor de alertas nunca
-- haya enviado un solo mensaje: sin destinatario, la fase "despachar" del
-- tick dispatcha CERO alertas, sin importar cuántas genere.
--
-- CONSECUENCIA INMEDIATA de aplicar esto: el próximo tick (cron 060, diario
-- 05:45 Bogotá) empieza a enviarle a Santiago por Telegram TODA alerta
-- `pendiente` que exista en ese momento -- de ahí que el ORDEN DE
-- APLICACIÓN sea obligatorio:
--
--   089 (categorías) -> 090 (descarte histórico, T3b) -> fix de código D-24
--   (regla de expiración automática al tick + redeploy de la edge function
--   -- NO es una migración SQL) -> **091 (esta)**.
--
-- Aplicar esta ANTES que 090 mandaría de golpe las 39 `escalada` viejas
-- (algunas con `fecha_programada` de 2019) apenas el tick corriera --
-- exactamente lo que el plan dice explícitamente evitar (§1, punto 4).
-- 090 ya las pasó a `descartada` para cuando esta se aplique, así que el
-- guard previo de la parte 2 además verifica que NO queden alertas
-- `pendiente`/`enviada` con `fecha_programada` sospechosamente vieja (más
-- de `DIAS_EXPIRACION_ALERTA` = 14 días en el pasado) antes de encender el
-- envío -- si las hay, aborta: significa que 090 no se aplicó todavía, o
-- que el fix D-24 no llegó a producción y hay que revisar antes de abrir
-- el grifo.
--
-- QUÉ NO TOCA: no cambia `horas_escalamiento` (sigue en 48, seed de 056)
-- ni `activo` (sigue en TRUE) -- D-14 es puntualmente sobre el
-- destinatario. Tampoco toca `HATO_ALERTAS_ESCALAMIENTO_TELEGRAM_ID`
-- (secreto de edge function, fuera del alcance de una migración SQL) --
-- sin esa variable, un escalamiento se sigue marcando `escalada` sin
-- mandar el mensaje de escalamiento (el mensaje ORIGINAL sí llega, por
-- esta migración).
--
-- RLS: no se toca -- `hato_alertas_config` ya tiene su política de 056
-- (SELECT authenticated, escritura Admin+Gerencia).
--
-- Idempotente: el UPDATE es un `SET` incondicional al mismo valor final,
-- así que una re-ejecución no cambia nada. El guard de "ninguna fila queda
-- NULL" sigue pasando en cualquier corrida posterior a la primera.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Guard previo -- verificaciones que SÍ abortan (RAISE EXCEPTION) antes
--    de escribir nada: identidad del destinatario y que el backlog viejo
--    ya esté limpio (090 aplicada / D-24 desplegado).
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_telegram_usuarios_ok boolean;
  v_filas_config         integer;
  v_ya_pobladas          integer;
  v_backlog_sospechoso    integer;
BEGIN
  -- 1.1 El telegram_id 8505349717 corresponde a Santiago, rol gerencia,
  --     activo -- exactamente lo que P-1 del plan documenta. Si
  --     `telegram_usuarios` no tiene esa fila (o dejó de cumplir estas 3
  --     condiciones), esta migración NO adivina: aborta.
  SELECT EXISTS (
    SELECT 1 FROM telegram_usuarios
     WHERE telegram_id = 8505349717
       AND rol_bot = 'gerencia'
       AND activo = true
  ) INTO v_telegram_usuarios_ok;
  IF NOT v_telegram_usuarios_ok THEN
    RAISE EXCEPTION '091 ABORTADA: telegram_usuarios no tiene una fila activa con telegram_id=8505349717 y rol_bot=''gerencia'' (Santiago, verificado en el plan el 2026-08-06 -- esta sesión no pudo reverificarlo en vivo). Revisar manualmente antes de reintentar; NO se escribió nada.';
  END IF;

  -- 1.2 hato_alertas_config tiene las 5 filas esperadas (sembradas por 056).
  SELECT count(*) INTO v_filas_config FROM hato_alertas_config;
  IF v_filas_config <> 5 THEN
    RAISE EXCEPTION '091 ABORTADA: se esperaban 5 filas en hato_alertas_config (una por tipo, sembradas por 056), hay %.', v_filas_config;
  END IF;

  -- 1.3 Si el destinatario YA está poblado en las 5, esto ya se corrió --
  --     no es un error, solo se avisa y no hay nada más que hacer (el
  --     UPDATE de abajo es un no-op de todas formas).
  SELECT count(*) INTO v_ya_pobladas
    FROM hato_alertas_config
   WHERE destinatario_telegram_id = '8505349717';
  IF v_ya_pobladas = 5 THEN
    RAISE NOTICE '091: las 5 filas ya tienen destinatario_telegram_id=8505349717 -- esta migración ya se aplicó, nada que hacer.';
  END IF;

  -- 1.4 El backlog viejo debe estar limpio ANTES de encender el envío --
  --     si queda una alerta pendiente/enviada con fecha_programada de hace
  --     más de 14 días (DIAS_EXPIRACION_ALERTA, hatoAlertas.ts), es señal
  --     de que 090 (descarte histórico) no se aplicó, o que el fix D-24
  --     (expiración automática de escalada/respondida) no llegó a
  --     producción todavía -- abrir el grifo en ese estado mandaría alertas
  --     viejas de golpe, justo lo que el orden de aplicación busca evitar.
  SELECT count(*) INTO v_backlog_sospechoso
    FROM hato_alertas
   WHERE estado IN ('pendiente', 'enviada')
     AND fecha_programada < ((now() AT TIME ZONE 'America/Bogota')::date - 14);
  IF v_backlog_sospechoso <> 0 THEN
    RAISE EXCEPTION '091 ABORTADA: hay % alerta(s) pendiente/enviada con fecha_programada de hace más de 14 días -- revisar que la migración 090 (descarte histórico, T3b) ya esté aplicada antes de activar el envío a Santiago. NO se escribió nada.', v_backlog_sospechoso;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. El UPDATE.
-- ---------------------------------------------------------------------

UPDATE hato_alertas_config
   SET destinatario_telegram_id = '8505349717'
 WHERE destinatario_telegram_id IS DISTINCT FROM '8505349717';

-- ---------------------------------------------------------------------
-- 3. Guard de cierre -- las 5 filas quedan con el destinatario correcto,
--    nada más cambió.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_pobladas       integer;
  v_otros_valores  integer;
  v_activo_distinto integer;
  v_horas_distinto integer;
BEGIN
  SELECT count(*) INTO v_pobladas
    FROM hato_alertas_config
   WHERE destinatario_telegram_id = '8505349717';
  IF v_pobladas <> 5 THEN
    RAISE EXCEPTION '091 ABORTADA: tras el UPDATE, % de 5 filas tienen destinatario_telegram_id=8505349717 (se esperaban las 5).', v_pobladas;
  END IF;

  SELECT count(*) INTO v_otros_valores
    FROM hato_alertas_config
   WHERE destinatario_telegram_id IS DISTINCT FROM '8505349717';
  IF v_otros_valores <> 0 THEN
    RAISE EXCEPTION '091 ABORTADA: quedan % fila(s) con un destinatario distinto de 8505349717.', v_otros_valores;
  END IF;

  -- Nada más debía cambiar (D-14 es puntual sobre el destinatario).
  SELECT count(*) INTO v_activo_distinto FROM hato_alertas_config WHERE activo IS DISTINCT FROM true;
  SELECT count(*) INTO v_horas_distinto FROM hato_alertas_config WHERE horas_escalamiento IS DISTINCT FROM 48;
  IF v_activo_distinto <> 0 OR v_horas_distinto <> 0 THEN
    RAISE EXCEPTION '091 ABORTADA: activo/horas_escalamiento cambiaron de su valor original (activo distinto: %, horas_escalamiento distinto: %) -- esta migración no debía tocarlos.', v_activo_distinto, v_horas_distinto;
  END IF;

  RAISE NOTICE '091 OK: las 5 filas de hato_alertas_config apuntan a destinatario_telegram_id=8505349717 (Santiago). El próximo tick (cron 060) empezará a enviar por Telegram.';
END $$;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Vuelve al "modo sombra" (lazo abierto, sin destinatario) -- el tick sigue
-- generando/escalando/expirando alertas pero deja de mandar mensajes:
--
--   UPDATE hato_alertas_config SET destinatario_telegram_id = NULL;
-- =============================================================================
