-- ============================================================================
-- 184_cosecha_aguacate_obligatoria -- ESCO-160
-- ============================================================================
-- ESCRITA, SIN APLICAR. La aplica Santiago con SUPABASE_APPLY_A_MIGRATION,
-- DESPUES de desplegar la edge function del mismo PR (ver ORDEN abajo).
--
-- DECISION (Santiago, 2026-10-23, en vivo):
--   «Usemos un tag de Traviesa/Principal mejor. Las ventanas nos cambiaron este
--    año. Retroactivo, usa el tag actual (basado en fecha) para crear el nuevo
--    tag. Moving forward, en el registro debe quedar en el tag si es principal
--    o traviesa.»  Y despues: «haz el fix completo ... que no nos quede coja».
--
-- POR QUE: `set_cosecha_aguacate()` (trigger BEFORE INSERT de la 042) rellena
-- `fin_ingresos.cosecha` con `fn_cosecha_aguacate(fecha)` cuando una venta de
-- Aguacate Hass llega sin etiqueta. Esa funcion aplica las ventanas VIEJAS
-- (mayo-octubre = Traviesa), y en 2026 la Principal 2027 empezo a venderse en
-- septiembre. O sea que el respaldo ya no acierta: adivina, y adivina mal, en
-- silencio. Con esta migracion el respaldo deja de adivinar y RECHAZA la venta
-- de aguacate sin etiqueta. Todos los escritores conocidos ya la mandan:
-- IngresoForm, IngresosBatchTable, CargaMasivaIngresos y Telegram /ingreso
-- (mismo PR). Un escritor que nadie conoce falla fuerte en vez de etiquetar mal.
--
-- QUE HACE (cero filas de dominio tocadas):
--   1. CREATE OR REPLACE FUNCTION public.set_cosecha_aguacate(): misma firma,
--      SECURITY DEFINER y search_path de antes; en vez de asignar la regla de
--      fechas, RAISE si la venta es de Aguacate Hass y `cosecha` es NULL.
--   2. CHECK `fin_ingresos_cosecha_formato`: `cosecha` es NULL o
--      «Principal AAAA» / «Traviesa AAAA». El P&G por cosecha compara la
--      etiqueta como texto exacto, asi que «principal 2027» seria una venta
--      invisible. Hoy 0 de 246 filas incumplen (verificado 2026-10-23).
--   3. COMMENT ON FUNCTION.
--
-- QUE NO HACE:
--   - No toca ninguna fila: las 95 ventas de aguacate ya tienen etiqueta
--     valida, que es justo «el tag actual» que pidio el dueño.
--   - No borra `fn_cosecha_aguacate()`: no tiene otro llamador vivo despues
--     de esto, pero borrarla es otra decision.
--   - No cambia el disparo del trigger (BEFORE INSERT). Un UPDATE que ponga
--     `cosecha = NULL` en una venta de aguacate sigue posible; ningun camino de
--     la app lo hace (IngresoForm siempre manda la etiqueta para aguacate).
--
-- GUARDAS: md5 del cuerpo vivo (no pisar un cambio hecho fuera del repo, patron
-- 143); 0 ventas de aguacate sin etiqueta valida; 0 etiquetas no canonicas; el
-- CHECK no existe. Despues: el cuerpo ya no llama a fn_cosecha_aguacate y lanza;
-- SECURITY DEFINER, search_path y ACL intactos; el CHECK existe y esta validado.
-- No hay guarda de conteo absoluto de filas (leccion 103).
--
-- ORDEN DE DESPLIEGUE (obligatorio, leccion 105):
--   1. Fusionar el PR y desplegar la edge function con
--      `npx supabase functions deploy make-server-1ccce916` (nunca el conector,
--      ESCO-148). Asi /ingreso ya pide la cosecha.
--   2. Aplicar esta migracion.
--   Al reves, durante la ventana un /ingreso de aguacate por Telegram falla con
--   el mensaje de abajo; no se pierde nada escrito, pero el usuario tiene que
--   repetir el registro.
--
-- ROLLBACK:
--   ALTER TABLE public.fin_ingresos DROP CONSTRAINT fin_ingresos_cosecha_formato;
--   y recrear el cuerpo anterior de set_cosecha_aguacate() (al pie, literal).
--
-- NO trae BEGIN;/COMMIT; -- apply_migration ya envuelve en una transaccion.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Pre-condiciones
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_md5 text;
  v_n   bigint;
BEGIN
  SELECT md5(prosrc) INTO v_md5
  FROM pg_proc
  WHERE proname = 'set_cosecha_aguacate' AND pronamespace = 'public'::regnamespace;
  IF v_md5 IS DISTINCT FROM '080cb45d27cd85113022e4690387d192' THEN
    RAISE EXCEPTION '184: el cuerpo vivo de set_cosecha_aguacate() no es el revisado (md5 %). No se sobrescribe.', v_md5;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.fin_ingresos i
  JOIN public.fin_negocios n ON n.id = i.negocio_id
  WHERE n.nombre = 'Aguacate Hass'
    AND (i.cosecha IS NULL OR i.cosecha !~ '^(Principal|Traviesa) [0-9]{4}$');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '184: % venta(s) de Aguacate Hass sin etiqueta de cosecha valida. Etiquetarlas primero.', v_n;
  END IF;

  SELECT count(*) INTO v_n
  FROM public.fin_ingresos
  WHERE cosecha IS NOT NULL AND cosecha !~ '^(Principal|Traviesa) [0-9]{4}$';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '184: % fila(s) con cosecha no canonica; el CHECK no se puede agregar.', v_n;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.fin_ingresos'::regclass
               AND conname = 'fin_ingresos_cosecha_formato') THEN
    RAISE EXCEPTION '184: el CHECK fin_ingresos_cosecha_formato ya existe.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                 WHERE tgrelid = 'public.fin_ingresos'::regclass
                   AND tgname = 'trg_set_cosecha_aguacate' AND NOT tgisinternal) THEN
    RAISE EXCEPTION '184: falta el trigger trg_set_cosecha_aguacate.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. El respaldo deja de adivinar
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_cosecha_aguacate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aguacate_id uuid;
BEGIN
  IF NEW.cosecha IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_aguacate_id
  FROM fin_negocios
  WHERE nombre = 'Aguacate Hass'
  LIMIT 1;
  IF v_aguacate_id IS NOT NULL AND NEW.negocio_id = v_aguacate_id THEN
    RAISE EXCEPTION 'Una venta de Aguacate Hass necesita su cosecha (Principal AAAA o Traviesa AAAA).'
      USING ERRCODE = '23502',
            HINT = 'ESCO-160: la cosecha se escoge al registrar la venta; ya no se deduce de la fecha.';
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Formato canonico
-- ---------------------------------------------------------------------------
ALTER TABLE public.fin_ingresos
  ADD CONSTRAINT fin_ingresos_cosecha_formato
  CHECK (cosecha IS NULL OR cosecha ~ '^(Principal|Traviesa) [0-9]{4}$');

-- ---------------------------------------------------------------------------
-- 3. Documentacion en el catalogo
-- ---------------------------------------------------------------------------
COMMENT ON FUNCTION public.set_cosecha_aguacate() IS
  'ESCO-160 (migracion 184): rechaza una venta de Aguacate Hass sin cosecha. La etiqueta se escoge al registrar; ya no se deduce de la fecha con fn_cosecha_aguacate().';

-- ---------------------------------------------------------------------------
-- 4. Post-condiciones
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  SELECT p.prosrc, p.prosecdef, p.proconfig, p.proacl::text AS acl INTO r
  FROM pg_proc p
  WHERE p.proname = 'set_cosecha_aguacate' AND p.pronamespace = 'public'::regnamespace;

  IF r.prosrc ILIKE '%fn_cosecha_aguacate%' THEN
    RAISE EXCEPTION '184: el cuerpo nuevo todavia llama a fn_cosecha_aguacate.';
  END IF;
  IF r.prosrc NOT ILIKE '%RAISE EXCEPTION%' THEN
    RAISE EXCEPTION '184: el cuerpo nuevo no rechaza la venta sin etiqueta.';
  END IF;
  IF NOT r.prosecdef THEN
    RAISE EXCEPTION '184: set_cosecha_aguacate() perdio SECURITY DEFINER.';
  END IF;
  IF r.proconfig IS DISTINCT FROM ARRAY['search_path=public, pg_temp'] THEN
    RAISE EXCEPTION '184: search_path cambio: %', r.proconfig;
  END IF;
  IF r.acl IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}' THEN
    RAISE EXCEPTION '184: el ACL de la funcion cambio: %', r.acl;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.fin_ingresos'::regclass
                   AND conname = 'fin_ingresos_cosecha_formato'
                   AND convalidated) THEN
    RAISE EXCEPTION '184: el CHECK fin_ingresos_cosecha_formato no quedo validado.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Cuerpo anterior, para el ROLLBACK (literal, md5 080cb45d27cd85113022e4690387d192):
--
-- CREATE OR REPLACE FUNCTION public.set_cosecha_aguacate()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- DECLARE
--   v_aguacate_id uuid;
-- BEGIN
--   IF NEW.cosecha IS NOT NULL OR NEW.fecha IS NULL THEN
--     RETURN NEW;
--   END IF;
--   SELECT id INTO v_aguacate_id
--   FROM fin_negocios
--   WHERE nombre = 'Aguacate Hass'
--   LIMIT 1;
--   IF v_aguacate_id IS NOT NULL AND NEW.negocio_id = v_aguacate_id THEN
--     NEW.cosecha := fn_cosecha_aguacate(NEW.fecha);
--   END IF;
--   RETURN NEW;
-- END;
-- $function$;
-- ============================================================================
