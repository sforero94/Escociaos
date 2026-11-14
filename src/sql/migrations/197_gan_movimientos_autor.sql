-- =============================================================================
-- 197_gan_movimientos_autor.sql
--
-- ESCRITA, SIN APLICAR. ESCO-179 (clase datos, Ruta FDS). Decision de Santiago en
-- la respuesta al reporte del sabado 2026-11-14: «179 - 1, 3», con el dato
-- «los movimientos los he hecho yo Santiago».
--
-- Problema: `gan_movimientos.created_by` existe (uuid, nullable) y ningun camino de
-- escritura lo llena para traslados y ajustes. Medido 2026-11-14 contra produccion:
--
--     ajuste            30 de 30 sin autor (2026-07-02 -> 2026-10-27)
--     traslado_entrada  16 de 16 sin autor (2026-07-02 -> 2026-11-09)
--     traslado_salida   16 de 16 sin autor (2026-07-02 -> 2026-11-09)
--
-- 62 filas. Las compras/ventas confirmadas ya traen autor (lo pone la RPC 097 desde
-- la sesion), salvo una compra del 2026-08-17 y una venta descartada, que NO entran
-- aqui: Santiago hablo de los traslados y ajustes.
--
-- Dos partes, en este orden:
--   1. BACKFILL (datos). Las 62 filas pasan a created_by = Santiago Forero
--      (usuarios.id 52665e55-a0e2-4605-bee1-c9f294cb2b76, sforero94@gmail.com, Gerencia
--      -- NO santiago@thinksid.co, que es la cuenta "Santiago Admin"; misma trampa que 063).
--      Se fija por la HUELLA md5 de los 62 ids, no por "todo lo que este en NULL":
--      si entra una fila nueva sin autor antes de aplicar, la guarda aborta en vez de
--      atribuirsela a Santiago. Incluye las 3 filas de ajuste del 2026-08-17 que
--      registro la migracion 108 (reversa de la doble carga): Santiago dijo que todos
--      los movimientos son suyos.
--   2. TRIGGER (atribucion de filas nuevas), patron 040/050/063/074:
--      BEFORE INSERT, NEW.created_by := COALESCE(NEW.created_by, auth.uid()).
--      SECURITY INVOKER: auth.uid() se lee igual con los permisos del que escribe y no
--      hace falta saltar la RLS. EXECUTE revocado (precedente 082 parte 2: el trigger
--      se dispara igual).
--
-- Por que el UPDATE no mueve el inventario: los dos triggers AFTER INSERT OR UPDATE
-- de gan_movimientos solo actuan en otros casos y la guarda 0.3 fija sus cuerpos:
--   * fn_aplicar_movimiento_ganado aplica cabezas solo en INSERT confirmado o en
--     UPDATE pendiente -> confirmado. Las 62 filas ya estan 'confirmado' y el estado
--     no cambia.
--   * fn_gan_validar_cabezas_transaccion retorna de inmediato si
--     transaccion_ganado_id es NULL, y es NULL en las 62 (guarda 0.4).
-- La post-condicion 3.3 lo comprueba igual: cabezas, filas de inventario y pesos
-- historicos identicos antes y despues.
--
-- Hueco conocido, identico a 050/063/074: el bot de Telegram escribe con el service
-- role, donde auth.uid() es NULL; esas filas nuevas seguiran sin autor salvo que el
-- llamador mande created_by explicito.
--
-- Traza: gan_movimientos no esta en hato_correcciones (084) ni en
-- globalgap_correcciones (113). El respaldo en `respaldos` (patron 081) es el unico
-- registro del estado anterior.
--
-- Filas afectadas: 62 UPDATE. Objetos: 1 funcion, 1 trigger, 1 tabla de respaldo.
-- ROLLBACK al pie.
-- =============================================================================

DO $$
DECLARE
  v_n integer;
  v_huella text;
  v_santiago_ok boolean;
BEGIN
  -- 0.1 La funcion y el trigger no existen todavia.
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_gan_movimiento_created_by' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION '197: set_gan_movimiento_created_by ya existe';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.gan_movimientos'::regclass AND tgname = 'trg_set_gan_movimiento_created_by') THEN
    RAISE EXCEPTION '197: trg_set_gan_movimiento_created_by ya existe';
  END IF;

  -- 0.2 La cuenta de Santiago existe, esta activa y es Gerencia.
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = '52665e55-a0e2-4605-bee1-c9f294cb2b76'
      AND email = 'sforero94@gmail.com' AND rol = 'Gerencia' AND activo = true
  ) INTO v_santiago_ok;
  IF NOT v_santiago_ok THEN
    RAISE EXCEPTION '197: la cuenta de Santiago (sforero94@gmail.com, Gerencia, activa) no coincide';
  END IF;

  -- 0.3 Los dos triggers AFTER INSERT OR UPDATE son los revisados.
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'fn_aplicar_movimiento_ganado' AND pronamespace = 'public'::regnamespace) IS DISTINCT FROM 'ab2d33a938b5b4529f96ac9f724cb902' THEN
    RAISE EXCEPTION '197: fn_aplicar_movimiento_ganado cambio desde la revision (md5)';
  END IF;
  IF (SELECT md5(prosrc) FROM pg_proc WHERE proname = 'fn_gan_validar_cabezas_transaccion' AND pronamespace = 'public'::regnamespace) IS DISTINCT FROM 'c4db3e2e35f26886e349dc0073d0c03a' THEN
    RAISE EXCEPTION '197: fn_gan_validar_cabezas_transaccion cambio desde la revision (md5)';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.gan_movimientos'::regclass AND NOT tgisinternal) <> 2 THEN
    RAISE EXCEPTION '197: gan_movimientos ya no tiene exactamente los 2 triggers revisados';
  END IF;

  -- 0.4 El objetivo es exactamente el conjunto revisado: 62 filas, misma huella,
  --     todas confirmadas y sin transaccion de finanzas.
  SELECT count(*), md5(string_agg(id::text, ',' ORDER BY id))
    INTO v_n, v_huella
  FROM public.gan_movimientos
  WHERE created_by IS NULL AND tipo IN ('ajuste', 'traslado_entrada', 'traslado_salida');
  IF v_n <> 62 OR v_huella IS DISTINCT FROM '732e24aed95c23ed1572372fe94cf0ac' THEN
    RAISE EXCEPTION '197: el conjunto sin autor cambio (n=%, huella=%); esperado 62 / 732e24aed95c23ed1572372fe94cf0ac', v_n, v_huella;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.gan_movimientos
    WHERE created_by IS NULL AND tipo IN ('ajuste', 'traslado_entrada', 'traslado_salida')
      AND (estado <> 'confirmado' OR transaccion_ganado_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION '197: alguna fila objetivo no esta confirmada o tiene transaccion_ganado_id';
  END IF;

  -- 0.5 El respaldo no existe (no se pisa uno anterior).
  IF to_regclass('respaldos.backup_197_gan_movimientos_autor') IS NOT NULL THEN
    RAISE EXCEPTION '197: respaldos.backup_197_gan_movimientos_autor ya existe';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 1. Respaldo (patron 081: fuera de public, sin grants, RLS sin politicas)
-- -----------------------------------------------------------------------------
CREATE TEMP TABLE _197_base ON COMMIT DROP AS
SELECT
  (SELECT count(*) FROM public.gan_inventario) AS filas_inv,
  (SELECT coalesce(sum(novillos), 0) + coalesce(sum(toros), 0) FROM public.gan_inventario) AS cabezas,
  (SELECT count(*) FROM public.gan_pesos_historico) AS pesos,
  (SELECT count(*) FROM public.gan_movimientos) AS movs;

CREATE TABLE respaldos.backup_197_gan_movimientos_autor AS
SELECT id, tipo, estado, created_by, created_at, now() AS respaldado_en
FROM public.gan_movimientos
WHERE created_by IS NULL AND tipo IN ('ajuste', 'traslado_entrada', 'traslado_salida');

REVOKE ALL ON respaldos.backup_197_gan_movimientos_autor FROM PUBLIC, anon, authenticated;
ALTER TABLE respaldos.backup_197_gan_movimientos_autor ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. Backfill: las 62 filas respaldadas pasan a Santiago
-- -----------------------------------------------------------------------------
UPDATE public.gan_movimientos m
SET created_by = '52665e55-a0e2-4605-bee1-c9f294cb2b76'
FROM respaldos.backup_197_gan_movimientos_autor b
WHERE m.id = b.id AND m.created_by IS NULL;

-- -----------------------------------------------------------------------------
-- 3. Trigger de atribucion para filas nuevas
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.set_gan_movimiento_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- COALESCE, no asignacion directa: si el llamador manda created_by explicito
  -- (la RPC de compra/venta, o el bot con su usuario), se respeta.
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_gan_movimiento_created_by() IS
  'ESCO-179 (migracion 197). Atribuye cada movimiento de ganado nuevo a quien lo captura. Patron 040/050/063/074. El service role (bot) deja NULL.';

REVOKE EXECUTE ON FUNCTION public.set_gan_movimiento_created_by() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_set_gan_movimiento_created_by
  BEFORE INSERT ON public.gan_movimientos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_gan_movimiento_created_by();

-- -----------------------------------------------------------------------------
-- Post-condiciones
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  b record;
  v_n integer;
BEGIN
  SELECT * INTO b FROM _197_base;

  -- 3.1 El respaldo tiene las 62 filas y las 62 quedaron con Santiago.
  IF (SELECT count(*) FROM respaldos.backup_197_gan_movimientos_autor) <> 62 THEN
    RAISE EXCEPTION '197 post: el respaldo no tiene 62 filas';
  END IF;
  SELECT count(*) INTO v_n
  FROM public.gan_movimientos m JOIN respaldos.backup_197_gan_movimientos_autor r USING (id)
  WHERE m.created_by = '52665e55-a0e2-4605-bee1-c9f294cb2b76';
  IF v_n <> 62 THEN
    RAISE EXCEPTION '197 post: % de 62 filas quedaron con Santiago', v_n;
  END IF;

  -- 3.2 Nada fuera del respaldo cambio de autor a Santiago por este UPDATE:
  --     el resto de filas conserva su created_by (ninguna otra estaba en NULL de estos tipos).
  IF EXISTS (
    SELECT 1 FROM public.gan_movimientos
    WHERE created_by IS NULL AND tipo IN ('ajuste', 'traslado_entrada', 'traslado_salida')
      AND id IN (SELECT id FROM respaldos.backup_197_gan_movimientos_autor)
  ) THEN
    RAISE EXCEPTION '197 post: quedan filas respaldadas sin autor';
  END IF;

  -- 3.3 El inventario no se movio: el UPDATE no reaplico ningun delta.
  IF (SELECT count(*) FROM public.gan_inventario) <> b.filas_inv
     OR (SELECT coalesce(sum(novillos), 0) + coalesce(sum(toros), 0) FROM public.gan_inventario) <> b.cabezas
     OR (SELECT count(*) FROM public.gan_pesos_historico) <> b.pesos THEN
    RAISE EXCEPTION '197 post: el inventario o los pesos historicos cambiaron';
  END IF;
  -- Escrituras concurrentes del bot solo pueden SUMAR filas; menos filas = algo roto.
  IF (SELECT count(*) FROM public.gan_movimientos) < b.movs THEN
    RAISE EXCEPTION '197 post: gan_movimientos perdio filas';
  END IF;

  -- 3.4 El trigger quedo instalado, INVOKER, con search_path pineado y sin EXECUTE de navegador.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.gan_movimientos'::regclass AND tgname = 'trg_set_gan_movimiento_created_by') THEN
    RAISE EXCEPTION '197 post: falta el trigger';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE proname = 'set_gan_movimiento_created_by' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION '197 post: la funcion quedo SECURITY DEFINER';
  END IF;
  IF NOT (SELECT 'search_path=public, pg_temp' = ANY(proconfig) FROM pg_proc WHERE proname = 'set_gan_movimiento_created_by' AND pronamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION '197 post: search_path no quedo pineado';
  END IF;
  IF has_function_privilege('authenticated', 'public.set_gan_movimiento_created_by()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.set_gan_movimiento_created_by()', 'EXECUTE') THEN
    RAISE EXCEPTION '197 post: anon o authenticated conservan EXECUTE';
  END IF;

  -- 3.5 El respaldo no es legible desde el navegador.
  IF has_table_privilege('authenticated', 'respaldos.backup_197_gan_movimientos_autor', 'SELECT')
     OR has_table_privilege('anon', 'respaldos.backup_197_gan_movimientos_autor', 'SELECT') THEN
    RAISE EXCEPTION '197 post: el respaldo es legible por anon o authenticated';
  END IF;
END $$;

-- =============================================================================
-- ROLLBACK (con aprobacion de Santiago):
--
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_set_gan_movimiento_created_by ON public.gan_movimientos;
-- DROP FUNCTION IF EXISTS public.set_gan_movimiento_created_by();
-- UPDATE public.gan_movimientos m SET created_by = NULL
--   FROM respaldos.backup_197_gan_movimientos_autor b
--   WHERE m.id = b.id AND m.created_by = '52665e55-a0e2-4605-bee1-c9f294cb2b76';
-- COMMIT;
-- =============================================================================
