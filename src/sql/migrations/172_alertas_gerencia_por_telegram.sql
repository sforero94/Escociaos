-- ============================================================================
-- 172_alertas_gerencia_por_telegram.sql
--
-- ESCO-134. Decision de Santiago (2026-10-02): las alertas de gerencia del
-- hato «deben llegar por telegram».
--
-- POR QUE. Las 142 y 152 dejaron `parto_proximo`, `servicio_sin_confirmacion`
-- y `rechequeo_due` como "solo web" para todos. Nadie revisa esa cola:
-- desde el 2026-09-17 ninguna alerta de esos tipos se atendio, y GALLEGA,
-- ENIGMA e INDIA tuvieron o tienen parto proximo sin aviso.
--
-- QUE CAMBIA (dos tablas, ninguna fila de hato_alertas):
--   (a) `telegram_alertas_suscripciones.recibe = true` para los usuarios de
--       Telegram con `rol_bot = 'gerencia'` (hoy Martha Vega y Santiago
--       Forero) en `hato.parto_proximo` y `hato.servicio_sin_confirmacion`.
--       `escalamiento` NO se toca (sigue en false: prenderlo es otra
--       decision, ver la 096).
--   (b) `hato_alertas_config.activo = true` para `servicio_sin_confirmacion`.
--       Estaba en false, y la fase (b) del tick NO despacha un tipo inactivo:
--       sin esto, (a) no tendria efecto para ese tipo.
--
-- QUE NO CAMBIA, A PROPOSITO:
--   - `rechequeo_due`: sigue `activo = false` y sin `recibe`. Es el tipo que
--     inundo Telegram con 36 mensajes la semana del 2026-09-07 (ESCO-93).
--     Prenderlo es una pregunta abierta para Santiago, no parte de esta
--     migracion.
--   - Los usuarios `campo` (Fernando, Uriel, David): el codigo los filtra de
--     los tipos de gerencia (`destinatariosTelegramPermitidos`).
--
-- DISCRIMINANTE: `rol_bot = 'gerencia'`, no nombres. El guardarrail de codigo
-- usa el mismo criterio para los tipos de gerencia.
--
-- ORDEN DE DESPLIEGUE: desplegar ANTES la edge function con el retiro de
-- alertas ya cumplidas (mismo PR). Si no, el primer tick despues de esta
-- migracion manda por Telegram alertas viejas cuyo hecho ya esta registrado
-- (p. ej. el parto_proximo de ENIGMA, que pario el 2026-09-20).
--
-- TRAZA: ninguna de las dos tablas esta en hato_correcciones (084). El
-- respaldo en `respaldos` (patron 081) es el unico registro del antes.
--
-- Filas afectadas: hasta 4 en telegram_alertas_suscripciones (2 usuarios x
-- 2 claves; UPSERT por si falta alguna fila) + 1 en hato_alertas_config.
-- NO trae BEGIN;/COMMIT; -- apply_migration ya envuelve en una transaccion.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Respaldo (patron 081: esquema `respaldos`, jamas `public`)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS respaldos.backup_172_suscripciones AS
SELECT s.* FROM public.telegram_alertas_suscripciones s
WHERE s.alerta_clave LIKE 'hato.%';

CREATE TABLE IF NOT EXISTS respaldos.backup_172_alertas_config AS
SELECT * FROM public.hato_alertas_config;

ALTER TABLE respaldos.backup_172_suscripciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE respaldos.backup_172_alertas_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_172_suscripciones FROM anon, authenticated, PUBLIC;
REVOKE ALL ON respaldos.backup_172_alertas_config FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Pre-condiciones
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_gerencia int;
  v_claves int;
  v_tipo_existe int;
BEGIN
  SELECT count(*) INTO v_gerencia
    FROM public.telegram_usuarios
   WHERE rol_bot = 'gerencia' AND activo = true;
  IF v_gerencia = 0 THEN
    RAISE EXCEPTION '172: no hay usuarios de Telegram activos con rol_bot=gerencia -- nadie recibiria nada';
  END IF;

  SELECT count(*) INTO v_claves
    FROM public.alertas_catalogo
   WHERE clave IN ('hato.parto_proximo', 'hato.servicio_sin_confirmacion');
  IF v_claves <> 2 THEN
    RAISE EXCEPTION '172: alertas_catalogo tiene % de las 2 claves esperadas', v_claves;
  END IF;

  SELECT count(*) INTO v_tipo_existe
    FROM public.hato_alertas_config
   WHERE tipo = 'servicio_sin_confirmacion';
  IF v_tipo_existe <> 1 THEN
    RAISE EXCEPTION '172: hato_alertas_config no tiene la fila servicio_sin_confirmacion';
  END IF;

  RAISE NOTICE '172: pre-condiciones OK -- % usuario(s) gerencia activos', v_gerencia;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Suscripciones: gerencia recibe parto_proximo y servicio_sin_confirmacion
-- ---------------------------------------------------------------------------
INSERT INTO public.telegram_alertas_suscripciones
       (telegram_usuario_id, alerta_clave, recibe, escalamiento, updated_at)
SELECT tu.id, k.clave, true, false, now()
  FROM public.telegram_usuarios tu
 CROSS JOIN (VALUES ('hato.parto_proximo'), ('hato.servicio_sin_confirmacion')) AS k(clave)
 WHERE tu.rol_bot = 'gerencia' AND tu.activo = true
ON CONFLICT (telegram_usuario_id, alerta_clave)
DO UPDATE SET recibe = true, updated_at = now();

-- ---------------------------------------------------------------------------
-- 3. Tipo activo: sin esto el tick no despacha servicio_sin_confirmacion
-- ---------------------------------------------------------------------------
UPDATE public.hato_alertas_config
   SET activo = true, updated_at = now()
 WHERE tipo = 'servicio_sin_confirmacion';

-- ---------------------------------------------------------------------------
-- 4. Post-condiciones
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_faltan int;
  v_campo int;
  v_escal int;
  v_rechequeo RECORD;
  v_tipos int;
BEGIN
  -- Cada gerencia activo recibe las 2 claves
  SELECT count(*) INTO v_faltan
    FROM public.telegram_usuarios tu
   CROSS JOIN (VALUES ('hato.parto_proximo'), ('hato.servicio_sin_confirmacion')) AS k(clave)
   WHERE tu.rol_bot = 'gerencia' AND tu.activo = true
     AND NOT EXISTS (
       SELECT 1 FROM public.telegram_alertas_suscripciones s
        WHERE s.telegram_usuario_id = tu.id AND s.alerta_clave = k.clave AND s.recibe = true);
  IF v_faltan <> 0 THEN
    RAISE EXCEPTION '172 post: % combinaciones gerencia x clave quedaron sin recibe', v_faltan;
  END IF;

  -- Ningun usuario campo quedo recibiendo tipos de gerencia
  SELECT count(*) INTO v_campo
    FROM public.telegram_alertas_suscripciones s
    JOIN public.telegram_usuarios tu ON tu.id = s.telegram_usuario_id
   WHERE tu.rol_bot = 'campo' AND s.recibe = true
     AND s.alerta_clave IN ('hato.parto_proximo', 'hato.servicio_sin_confirmacion', 'hato.rechequeo_due');
  IF v_campo <> 0 THEN
    RAISE EXCEPTION '172 post: % filas campo reciben tipos de gerencia', v_campo;
  END IF;

  -- escalamiento no cambio respecto del respaldo
  SELECT count(*) INTO v_escal
    FROM public.telegram_alertas_suscripciones s
    JOIN respaldos.backup_172_suscripciones b
      ON b.telegram_usuario_id = s.telegram_usuario_id AND b.alerta_clave = s.alerta_clave
   WHERE s.escalamiento IS DISTINCT FROM b.escalamiento;
  IF v_escal <> 0 THEN
    RAISE EXCEPTION '172 post: % filas cambiaron escalamiento -- no debian', v_escal;
  END IF;

  -- rechequeo_due intacto
  SELECT activo INTO v_rechequeo FROM public.hato_alertas_config WHERE tipo = 'rechequeo_due';
  IF v_rechequeo.activo IS DISTINCT FROM (SELECT activo FROM respaldos.backup_172_alertas_config WHERE tipo = 'rechequeo_due') THEN
    RAISE EXCEPTION '172 post: rechequeo_due cambio de activo -- no debia';
  END IF;

  -- servicio_sin_confirmacion activo; los demas tipos sin cambio
  IF NOT (SELECT activo FROM public.hato_alertas_config WHERE tipo = 'servicio_sin_confirmacion') THEN
    RAISE EXCEPTION '172 post: servicio_sin_confirmacion sigue inactivo';
  END IF;
  SELECT count(*) INTO v_tipos
    FROM public.hato_alertas_config c
    JOIN respaldos.backup_172_alertas_config b ON b.id = c.id
   WHERE c.tipo <> 'servicio_sin_confirmacion'
     AND (c.activo IS DISTINCT FROM b.activo OR c.horas_escalamiento IS DISTINCT FROM b.horas_escalamiento);
  IF v_tipos <> 0 THEN
    RAISE EXCEPTION '172 post: % tipos de alerta cambiaron sin deber', v_tipos;
  END IF;

  RAISE NOTICE '172 OK: gerencia recibe parto_proximo + servicio_sin_confirmacion por Telegram';
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, no se corre automaticamente)
-- ---------------------------------------------------------------------------
-- DELETE FROM public.telegram_alertas_suscripciones s
--  WHERE s.alerta_clave IN ('hato.parto_proximo','hato.servicio_sin_confirmacion')
--    AND NOT EXISTS (SELECT 1 FROM respaldos.backup_172_suscripciones b
--                     WHERE b.telegram_usuario_id = s.telegram_usuario_id
--                       AND b.alerta_clave = s.alerta_clave);
-- UPDATE public.telegram_alertas_suscripciones s
--    SET recibe = b.recibe, escalamiento = b.escalamiento
--   FROM respaldos.backup_172_suscripciones b
--  WHERE b.telegram_usuario_id = s.telegram_usuario_id AND b.alerta_clave = s.alerta_clave;
-- UPDATE public.hato_alertas_config c
--    SET activo = b.activo
--   FROM respaldos.backup_172_alertas_config b
--  WHERE b.id = c.id;
