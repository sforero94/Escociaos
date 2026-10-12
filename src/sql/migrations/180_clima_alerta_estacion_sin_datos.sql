-- ============================================================================
-- 180_clima_alerta_estacion_sin_datos -- ESCO-152
-- ============================================================================
-- ESCRITA, SIN APLICAR. Decision de Santiago, 2026-10-12, en sesion en vivo:
-- «si, agrega alerta por telegram despues de 3 horas a Santiago».
--
-- POR QUE: la estacion Ecowitt se apago 5 veces en ~7,5 semanas (08-19/20,
-- 08-28, 09-16/17, 10-01/02, 10-08/10). Mientras esta apagada,
-- `clima-sync-wu` responde HTTP 200 `{"message":"No data available","synced":0}`
-- y `cron.job_run_details` dice `succeeded`: nadie se entera hasta que una
-- corrida de mantenimiento mira, 2 a 4 dias despues. Para entonces el dia ya
-- se perdio (la History API de Ecowitt tampoco lo tiene): 2026-10-01 y
-- 2026-10-09 no se pueden recuperar.
--
-- QUE CREA (aditiva, cero filas de dominio tocadas):
--   1. `public.clima_avisos` -- registro de idempotencia: una fila por aviso
--      enviado. La clave es `estacion_sin_datos:<ultima lectura ISO>`, asi que
--      se manda UN aviso por apagon, no uno cada 5 minutos. RLS activa y sin
--      politicas; ningun grant de navegador (patron 081/116). Solo la edge
--      function (service_role) escribe.
--   2. `alertas_catalogo` += `clima.estacion_sin_datos` (patron 096: una
--      alerta nueva de cualquier modulo es un INSERT; la pantalla de Telegram
--      la muestra sola, agrupada como «Clima»).
--   3. `telegram_alertas_suscripciones`: Santiago Forero (`telegram_usuarios`
--      con `rol_bot = 'gerencia'` y nombre que contiene 'santiago') recibe la
--      alerta. `escalamiento` queda en false. Nadie mas: Martha se puede
--      encender despues desde Configuracion -> Telegram.
--
-- QUE NO HACE: no crea cron. La regla corre dentro de `/clima/sync`, que el
-- cron `clima-sync-wu` (030/105) ya llama cada 5 minutos. Si la edge function
-- o el cron mismos se caen, no hay aviso: eso queda fuera de esta alerta.
--
-- ORDEN: migracion PRIMERO, `functions deploy` despues. Al reves, el codigo
-- nuevo encuentra que `clima_avisos` no existe: el INSERT falla, se loguea,
-- no se envia nada y `/clima/sync` responde igual que hoy (la regla nunca
-- cambia la respuesta del sync).
--
-- NO trae BEGIN;/COMMIT; -- apply_migration ya envuelve en una transaccion.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Pre-condiciones
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_santiago int;
BEGIN
  IF to_regclass('public.alertas_catalogo') IS NULL
     OR to_regclass('public.telegram_alertas_suscripciones') IS NULL THEN
    RAISE EXCEPTION '180 ABORTADA: falta la migracion 096 (alertas_catalogo / telegram_alertas_suscripciones).';
  END IF;
  IF to_regclass('public.clima_avisos') IS NOT NULL THEN
    RAISE EXCEPTION '180 ABORTADA: public.clima_avisos ya existe -- ¿ya se aplico?';
  END IF;
  IF EXISTS (SELECT 1 FROM public.alertas_catalogo WHERE modulo = 'clima') THEN
    RAISE EXCEPTION '180 ABORTADA: alertas_catalogo ya tiene filas con modulo=''clima'' -- revisar a mano.';
  END IF;
  SELECT count(*) INTO v_santiago
    FROM public.telegram_usuarios
   WHERE rol_bot = 'gerencia' AND activo = true
     AND nombre_display ILIKE '%santiago%' AND telegram_id IS NOT NULL;
  IF v_santiago <> 1 THEN
    RAISE EXCEPTION '180 ABORTADA: se esperaba exactamente 1 usuario de Telegram gerencia, activo y vinculado, llamado Santiago; hay %.', v_santiago;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Registro de idempotencia
-- ---------------------------------------------------------------------------
CREATE TABLE public.clima_avisos (
  clave       text PRIMARY KEY,
  detalle     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.clima_avisos IS
  'Migracion 180 (ESCO-152). Una fila por aviso de clima enviado por Telegram. '
  'Clave estacion_sin_datos:<ultima lectura ISO> = un aviso por apagon. '
  'Solo escribe la edge function (service_role); sin acceso de navegador.';

ALTER TABLE public.clima_avisos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clima_avisos FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- 2. Catalogo
-- ---------------------------------------------------------------------------
INSERT INTO public.alertas_catalogo (clave, modulo, nombre, descripcion, orden, activo)
VALUES
  ('clima.estacion_sin_datos', 'clima', 'Estación de clima sin datos',
   'Aviso cuando la estación Ecowitt lleva más de 3 horas sin mandar lecturas. Un aviso por apagón. Revisar luz, batería y wifi de la estación.',
   1, TRUE);

-- ---------------------------------------------------------------------------
-- 3. Suscripcion: solo Santiago
-- ---------------------------------------------------------------------------
INSERT INTO public.telegram_alertas_suscripciones
       (telegram_usuario_id, alerta_clave, recibe, escalamiento, updated_at)
SELECT tu.id, 'clima.estacion_sin_datos', true, false, now()
  FROM public.telegram_usuarios tu
 WHERE tu.rol_bot = 'gerencia' AND tu.activo = true
   AND tu.nombre_display ILIKE '%santiago%' AND tu.telegram_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Post-condiciones
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT count(*) FROM public.alertas_catalogo WHERE modulo = 'clima') <> 1 THEN
    RAISE EXCEPTION '180 ABORTADA: el catalogo no quedo con exactamente 1 clave de clima.';
  END IF;
  IF (SELECT count(*) FROM public.telegram_alertas_suscripciones
       WHERE alerta_clave = 'clima.estacion_sin_datos' AND recibe) <> 1 THEN
    RAISE EXCEPTION '180 ABORTADA: no quedo exactamente 1 suscriptor de clima.estacion_sin_datos.';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.clima_avisos'::regclass) THEN
    RAISE EXCEPTION '180 ABORTADA: clima_avisos sin RLS.';
  END IF;
  IF has_table_privilege('anon', 'public.clima_avisos', 'SELECT')
     OR has_table_privilege('authenticated', 'public.clima_avisos', 'SELECT')
     OR has_table_privilege('authenticated', 'public.clima_avisos', 'INSERT') THEN
    RAISE EXCEPTION '180 ABORTADA: clima_avisos quedo con privilegios de navegador.';
  END IF;
END $$;

-- ============================================================================
-- ROLLBACK (no ejecutar salvo decision explicita):
--   DELETE FROM public.telegram_alertas_suscripciones WHERE alerta_clave = 'clima.estacion_sin_datos';
--   DELETE FROM public.alertas_catalogo WHERE clave = 'clima.estacion_sin_datos';
--   DROP TABLE public.clima_avisos;
-- (El borrado del catalogo cascadea a las suscripciones; el DELETE explicito
--  de arriba es por claridad.)
-- ============================================================================
