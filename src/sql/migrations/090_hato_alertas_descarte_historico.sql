-- =====================================================================
-- 090: Hato Lechero -- S6 T3b de la ronda de agosto 2026
--      (docs/plan_hato_ronda_agosto_2026.md, §0, §4 S6, §5 D-24).
-- Fecha: 2026-08-06
--
-- Decisión textual del dueño (S6 brief, misma fecha): "descartar todo lo
-- que ya está en el pasado (estado descartada, no expirada -- pidió
-- 'descartar' explícitamente)". Estado verificado en producción (§2 del
-- plan, medido por una sesión anterior CON acceso de lectura en vivo el
-- mismo día): 62 alertas -- 39 `escalada`, 20 `descartada`, 2 `expirada`,
-- 1 `respondida`, varias con `fecha_programada` en 2019.
--
-- ⚠️ Esta sesión NO tuvo acceso al conector de solo lectura de Supabase
-- (el brief lo pedía; no estuvo disponible en el entorno de ejecución), así
-- que NO pudo re-verificar esos 62/39/20/2/1 en vivo antes de escribir esto
-- -- son el snapshot documentado en el plan, no una lectura propia. Por
-- eso el guard de la parte 2 es INFORMATIVO (RAISE NOTICE, compara contra
-- ese snapshot pero no aborta si difiere) y no un `RAISE EXCEPTION` de
-- igualdad estricta como en 080/081: `hato_alertas` es una cola VIVA (el
-- cron de la 060 corre a diario y genera/escala/expira alertas), a
-- diferencia del corpus histórico estático que 080/081 limpiaron -- exigir
-- que el conteo de HOY sea idéntico al de cuando se escribió este archivo
-- bloquearía una aplicación legítima por un desfase de un día de cron. La
-- garantía real de esta migración es el POST-guard de la parte 4
-- (RAISE EXCEPTION): verifica el INVARIANTE, no un número mágico -- que no
-- quede NINGUNA alerta escalada/expirada/respondida con fecha_programada
-- en el pasado tras el UPDATE. Ese sí aborta la transacción si falla.
--
-- QUÉ HACE:
--   1. Respalda en `respaldos.backup_090_hato_alertas_pre_descarte` (nunca
--      en `public` -- migración 081) TODAS las filas de `hato_alertas` en
--      estado `escalada`, `expirada` o `respondida` cuya `fecha_programada`
--      ya pasó (hora de Bogotá, no UTC -- CLAUDE.md, "Hoy siempre en hora
--      LOCAL").
--   2. Pasa esas mismas filas a `estado = 'descartada'`. NO toca
--      `respuesta`/`respondida_por`/`datos` -- lo que Fernando haya
--      contestado (la única fila `respondida`) sigue legible en la fila,
--      solo cambia el estado que la saca de la cola activa.
--
-- QUÉ NO TOCA (a propósito):
--   * `pendiente`/`enviada` -- esas SÍ son la cola activa/en curso del
--     motor (dispatch/reenvío, `hatoAlertas.ts`), no "atascadas del
--     pasado". Ninguna fila en esos 2 estados aparece hoy en el snapshot
--     del plan (39+20+2+1 = 62, sin resto), pero el filtro por `estado IN
--     (...)` las excluye explícitamente de todas formas, sean las que sean
--     al momento de aplicar esto.
--   * Alertas YA `descartada` -- el filtro las excluye (`estado <>
--     'descartada'` está implícito en la lista positiva de estados), así
--     que no se les toca `updated_at` sin necesidad.
--   * `confirmada` -- 0 filas en el snapshot, y de todas formas no forma
--     parte de "atascada en el pasado sin resolver": una alerta confirmada
--     ya tuvo su cierre correcto.
--
-- ORDEN DE APLICACIÓN (S6, ver el reporte de la sesión): 089 (categorías) ->
-- **090 (esta)** -> el fix de código D-24 (regla de expiración automática
-- al tick, `hatoAlertas.ts` + redeploy de la edge function -- NO es una
-- migración SQL) -> 091 (activar Telegram, T8.1). Aplicar 091 antes que
-- esta le mandaría a Santiago de golpe las alertas viejas apenas se
-- configure el destinatario -- ver la cabecera de 091.
--
-- RLS: no se toca `hato_alertas` (sigue el patrón 044/056: SELECT
-- authenticated, escritura Admin+Gerencia). El backup en `respaldos` sigue
-- la guía que 081 dejó para la "próxima migración de limpieza": RLS
-- habilitada sin políticas (deny-all), sin necesidad de REVOKE porque
-- `respaldos` no hereda los DEFAULT PRIVILEGES a `anon`/`authenticated` que
-- sí tiene `public`.
--
-- Idempotente: si se re-corre después de aplicarse, el filtro de la parte 1
-- ya no encuentra filas (todas están en `descartada`), así que la parte 2
-- no actualiza nada y el post-guard de la parte 4 sigue pasando (0 filas
-- en el estado prohibido). `CREATE TABLE IF NOT EXISTS` en el backup evita
-- fallar si ya existe de una corrida anterior -- aunque en ese caso quedaría
-- vacío en la segunda corrida, ver el guard de la parte 2.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Backup en `respaldos` (nunca en `public`) de las filas que se van a
--    tocar, ANTES de tocarlas.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS respaldos.backup_090_hato_alertas_pre_descarte AS
SELECT *
  FROM hato_alertas
 WHERE estado IN ('escalada', 'expirada', 'respondida')
   AND fecha_programada < (now() AT TIME ZONE 'America/Bogota')::date;

COMMENT ON TABLE respaldos.backup_090_hato_alertas_pre_descarte IS
  'Filas de hato_alertas (escalada/expirada/respondida, fecha_programada '
  'pasada) tal como estaban ANTES de que la migración 090 las pasara a '
  '"descartada" (T3b, decisión del dueño 2026-08-06: "descartar todo lo '
  'que ya está en el pasado"). Fuera de public a propósito (081). Borrar '
  'cuando Santiago confirme que la cola de Alertas se ve correcta.';

REVOKE ALL ON TABLE respaldos.backup_090_hato_alertas_pre_descarte
  FROM PUBLIC, anon, authenticated;

ALTER TABLE respaldos.backup_090_hato_alertas_pre_descarte
  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 2. Guard previo -- INFORMATIVO (no aborta, ver nota de cabecera sobre
--    por qué esta cola viva no usa un guard de igualdad estricta).
--    Compara contra el snapshot documentado del plan (39 escalada + 2
--    expirada + 1 respondida = 42) solo para avisar si la realidad
--    divergió desde que se escribió este archivo.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_a_descartar integer;
BEGIN
  SELECT count(*) INTO v_a_descartar FROM respaldos.backup_090_hato_alertas_pre_descarte;

  IF v_a_descartar = 0 THEN
    RAISE NOTICE '090: 0 alertas cumplen el criterio de descarte (escalada/expirada/respondida con fecha_programada pasada). Nada que hacer -- ¿ya se corrió esta migración, o el backlog ya se limpió por otra vía (AlertasView, el botón manual de S2)?';
  ELSIF v_a_descartar <> 42 THEN
    RAISE NOTICE '090: % alerta(s) cumplen el criterio -- distinto de las 42 (39 escalada + 2 expirada + 1 respondida) documentadas en el plan el 2026-08-06. No es un error por sí solo (la cola es viva, el cron corre a diario) -- solo revisar que el número tenga sentido antes de confirmar.', v_a_descartar;
  ELSE
    RAISE NOTICE '090: 42 alerta(s) cumplen el criterio, exactamente lo documentado en el plan (39 escalada + 2 expirada + 1 respondida).';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. El descarte.
-- ---------------------------------------------------------------------

UPDATE hato_alertas
   SET estado = 'descartada'
 WHERE id IN (SELECT id FROM respaldos.backup_090_hato_alertas_pre_descarte);

-- ---------------------------------------------------------------------
-- 4. Post-guard -- éste SÍ aborta (RAISE EXCEPTION) si el invariante real
--    no se cumple: cero alertas escalada/expirada/respondida con
--    fecha_programada en el pasado deben quedar tras el UPDATE.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_restantes    integer;
  v_actualizadas integer;
  v_rls          boolean;
  v_politicas    integer;
BEGIN
  SELECT count(*) INTO v_restantes
    FROM hato_alertas
   WHERE estado IN ('escalada', 'expirada', 'respondida')
     AND fecha_programada < (now() AT TIME ZONE 'America/Bogota')::date;
  IF v_restantes <> 0 THEN
    RAISE EXCEPTION '090 ABORTADA: quedan % alerta(s) en escalada/expirada/respondida con fecha_programada pasada tras el UPDATE -- la limpieza quedó incompleta.', v_restantes;
  END IF;

  SELECT count(*) INTO v_actualizadas
    FROM hato_alertas a
    JOIN respaldos.backup_090_hato_alertas_pre_descarte b ON b.id = a.id
   WHERE a.estado = 'descartada';

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'respaldos' AND c.relname = 'backup_090_hato_alertas_pre_descarte';
  IF NOT v_rls THEN
    RAISE EXCEPTION '090 ABORTADA: RLS no quedó habilitada en el backup.';
  END IF;

  SELECT count(*) INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'respaldos' AND tablename = 'backup_090_hato_alertas_pre_descarte';
  IF v_politicas <> 0 THEN
    RAISE EXCEPTION '090 ABORTADA: se esperaba deny-all (0 políticas) en el backup, hay %.', v_politicas;
  END IF;

  RAISE NOTICE '090 OK: % alerta(s) pasadas a descartada. 0 alertas escalada/expirada/respondida con fecha_programada pasada quedan en la cola. Backup en respaldos.backup_090_hato_alertas_pre_descarte (% fila(s), RLS deny-all).', v_actualizadas, v_actualizadas;
END $$;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Restaura estado/updated_at/escalada_at desde el backup para las filas que
-- esta migración tocó. Solo tiene sentido antes de que Santiago confirme
-- que la cola de Alertas se ve correcta.
--
--   UPDATE hato_alertas AS h
--      SET estado = b.estado, updated_at = b.updated_at, escalada_at = b.escalada_at
--     FROM respaldos.backup_090_hato_alertas_pre_descarte b
--    WHERE h.id = b.id;
--
-- La tabla de respaldo se deja en la base a propósito, mismo criterio que
-- 075/076/080/083. Borrarla solo cuando Santiago confirme que la cola de
-- Alertas se ve correcta en la app.
-- =============================================================================
