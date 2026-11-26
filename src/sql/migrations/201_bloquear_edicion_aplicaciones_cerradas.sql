-- 201: bloquear_edicion_aplicaciones_cerradas — ESCRITA, SIN APLICAR.
-- Aplicar solo con el sí explícito de Santiago. Ensayar antes con po_sonda.
--
-- ESCO-188, decisión de Santiago (2026-11-26): "No quiero que se puedan editar
-- aplicaciones cerradas porque abre una puerta complicada. Editar aplicaciones
-- cerradas solo lo puedo hacer yo con ediciones al back end."
--
-- Hecho: la calculadora guardaba una aplicación 'Cerrada' sin ninguna guarda.
-- En modo edición hace UPDATE de aplicaciones y luego borra y reinserta
-- mezclas, productos, cálculos, lotes y compras. 12 re-guardados de
-- aplicaciones cerradas en noviembre. La app ya corta antes del primer UPDATE
-- (PR de ESCO-188). Esta migración es la segunda capa: la base rechaza el
-- mismo cambio aunque llegue por otro camino (consola, otra pantalla, un
-- despliegue viejo).
--
-- Qué hace:
--   1. Función de trigger fn_bloquear_edicion_aplicacion_cerrada(),
--      SECURITY INVOKER, search_path pineado, EXECUTE revocado (el trigger
--      dispara igual, precedente 082 b).
--   2. BEFORE UPDATE en aplicaciones: rechaza si OLD.estado = 'Cerrada'.
--      fn_cerrar_aplicacion (106) sigue funcionando: cuando cierra, OLD.estado
--      es 'En ejecución', no 'Cerrada'.
--   3. BEFORE INSERT OR UPDATE en las 6 tablas del plan: aplicaciones_mezclas,
--      aplicaciones_productos (vía mezcla), aplicaciones_productos_alternativos
--      (vía línea → mezcla), aplicaciones_calculos, aplicaciones_lotes y
--      aplicaciones_compras. Rechaza si la aplicación dueña está 'Cerrada'.
--      En un UPDATE mira la aplicación vieja y la nueva.
--   4. Solo bloquea a las sesiones del navegador (current_user 'authenticated'
--      o 'anon'). postgres (migraciones) y service_role (edge function) pasan:
--      es la vía "ediciones al back end" que Santiago se reserva.
--
-- Qué NO hace, a propósito:
--   - No bloquea DELETE. Borrar una aplicación (AplicacionesList.handleEliminar)
--     borra primero mezclas, productos, cálculos, lotes y compras uno por uno;
--     bloquear DELETE rompería ese botón, y si se puede borrar una aplicación
--     cerrada es una decisión aparte de Santiago.
--   - No toca la capa real (movimientos_diarios*), aplicaciones_cierre ni
--     movimientos_inventario.
--   - No bloquea 'Calculada' ni 'En ejecución': siguen editables.
--   - No cambia RLS, grants de tabla ni ninguna fila. Filas de dominio: cero.
--
-- Límite conocido: la búsqueda de la aplicación dueña corre con la RLS del
-- llamante (INVOKER). Si un rol no puede leer aplicaciones, la búsqueda da
-- vacío y el trigger deja pasar; ese rol ya no puede escribir estas tablas
-- por la RLS de la 110/133.

SET LOCAL lock_timeout = '2s';

-- ---------------------------------------------------------------------------
-- 0. Precondiciones
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tabla text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'public.estado_aplicacion'::regtype AND enumlabel = 'Cerrada'
  ) THEN
    RAISE EXCEPTION '201: el ENUM estado_aplicacion no tiene la etiqueta Cerrada';
  END IF;

  IF to_regprocedure('public.fn_bloquear_edicion_aplicacion_cerrada()') IS NOT NULL THEN
    RAISE EXCEPTION '201: la función ya existe; no reejecutar';
  END IF;

  FOREACH v_tabla IN ARRAY ARRAY[
    'aplicaciones', 'aplicaciones_mezclas', 'aplicaciones_productos',
    'aplicaciones_productos_alternativos', 'aplicaciones_calculos',
    'aplicaciones_lotes', 'aplicaciones_compras'
  ] LOOP
    IF to_regclass('public.' || v_tabla) IS NULL THEN
      RAISE EXCEPTION '201: falta la tabla %', v_tabla;
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgrelid = ('public.' || v_tabla)::regclass
        AND tgname = 'trg_bloquear_edicion_aplicacion_cerrada'
    ) THEN
      RAISE EXCEPTION '201: el trigger ya existe en %', v_tabla;
    END IF;
  END LOOP;

  -- Columnas que la función lee.
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public'
        AND ((table_name IN ('aplicaciones_mezclas', 'aplicaciones_calculos',
                             'aplicaciones_lotes', 'aplicaciones_compras')
              AND column_name = 'aplicacion_id')
          OR (table_name = 'aplicaciones_productos' AND column_name = 'mezcla_id')
          OR (table_name = 'aplicaciones_productos_alternativos'
              AND column_name = 'aplicacion_producto_id')
          OR (table_name = 'aplicaciones' AND column_name = 'estado'))) <> 7 THEN
    RAISE EXCEPTION '201: faltan columnas que la función necesita';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Función
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.fn_bloquear_edicion_aplicacion_cerrada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  -- Solo las sesiones del navegador. postgres y service_role pasan.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'aplicaciones' THEN
    IF OLD.estado = 'Cerrada' THEN
      RAISE EXCEPTION 'Esta aplicación está cerrada y no se puede editar. Si hay un error, pídele a Santiago que lo corrija.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME IN ('aplicaciones_mezclas', 'aplicaciones_calculos',
                       'aplicaciones_lotes', 'aplicaciones_compras') THEN
    v_ids := ARRAY[NEW.aplicacion_id];
    IF TG_OP = 'UPDATE' THEN
      v_ids := v_ids || OLD.aplicacion_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'aplicaciones_productos' THEN
    SELECT array_agg(m.aplicacion_id) INTO v_ids
    FROM public.aplicaciones_mezclas m
    WHERE m.id = NEW.mezcla_id
       OR (TG_OP = 'UPDATE' AND m.id = OLD.mezcla_id);
  ELSIF TG_TABLE_NAME = 'aplicaciones_productos_alternativos' THEN
    SELECT array_agg(m.aplicacion_id) INTO v_ids
    FROM public.aplicaciones_productos p
    JOIN public.aplicaciones_mezclas m ON m.id = p.mezcla_id
    WHERE p.id = NEW.aplicacion_producto_id
       OR (TG_OP = 'UPDATE' AND p.id = OLD.aplicacion_producto_id);
  ELSE
    RAISE EXCEPTION '201: tabla no prevista %', TG_TABLE_NAME;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.aplicaciones a
    WHERE a.id = ANY (coalesce(v_ids, ARRAY[]::uuid[]))
      AND a.estado = 'Cerrada'
  ) THEN
    RAISE EXCEPTION 'Esta aplicación está cerrada y no se puede editar. Si hay un error, pídele a Santiago que lo corrija.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_bloquear_edicion_aplicacion_cerrada() IS
  'ESCO-188 (migración 201): rechaza que una sesión del navegador edite una aplicación Cerrada o su plan. postgres y service_role pasan. No bloquea DELETE.';

REVOKE EXECUTE ON FUNCTION public.fn_bloquear_edicion_aplicacion_cerrada() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Triggers
-- ---------------------------------------------------------------------------
CREATE TRIGGER trg_bloquear_edicion_aplicacion_cerrada
  BEFORE UPDATE ON public.aplicaciones
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_edicion_aplicacion_cerrada();

CREATE TRIGGER trg_bloquear_edicion_aplicacion_cerrada
  BEFORE INSERT OR UPDATE ON public.aplicaciones_mezclas
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_edicion_aplicacion_cerrada();

CREATE TRIGGER trg_bloquear_edicion_aplicacion_cerrada
  BEFORE INSERT OR UPDATE ON public.aplicaciones_productos
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_edicion_aplicacion_cerrada();

CREATE TRIGGER trg_bloquear_edicion_aplicacion_cerrada
  BEFORE INSERT OR UPDATE ON public.aplicaciones_productos_alternativos
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_edicion_aplicacion_cerrada();

CREATE TRIGGER trg_bloquear_edicion_aplicacion_cerrada
  BEFORE INSERT OR UPDATE ON public.aplicaciones_calculos
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_edicion_aplicacion_cerrada();

CREATE TRIGGER trg_bloquear_edicion_aplicacion_cerrada
  BEFORE INSERT OR UPDATE ON public.aplicaciones_lotes
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_edicion_aplicacion_cerrada();

CREATE TRIGGER trg_bloquear_edicion_aplicacion_cerrada
  BEFORE INSERT OR UPDATE ON public.aplicaciones_compras
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquear_edicion_aplicacion_cerrada();

-- ---------------------------------------------------------------------------
-- 3. Postcondiciones
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_trigger
      WHERE tgname = 'trg_bloquear_edicion_aplicacion_cerrada'
        AND tgenabled = 'O') <> 7 THEN
    RAISE EXCEPTION '201: no quedaron los 7 triggers activos';
  END IF;

  IF (SELECT prosecdef FROM pg_proc
      WHERE oid = 'public.fn_bloquear_edicion_aplicacion_cerrada()'::regprocedure) THEN
    RAISE EXCEPTION '201: la función quedó SECURITY DEFINER';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'public.fn_bloquear_edicion_aplicacion_cerrada()'::regprocedure
      AND 'search_path=public, pg_temp' = ANY (proconfig)
  ) THEN
    RAISE EXCEPTION '201: search_path no quedó pineado';
  END IF;

  IF has_function_privilege('anon', 'public.fn_bloquear_edicion_aplicacion_cerrada()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_bloquear_edicion_aplicacion_cerrada()', 'EXECUTE') THEN
    RAISE EXCEPTION '201: EXECUTE no quedó revocado';
  END IF;

  -- fn_cerrar_aplicacion (106) tiene que seguir existiendo y ser INVOKER.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'fn_cerrar_aplicacion' AND NOT prosecdef
  ) THEN
    RAISE EXCEPTION '201: fn_cerrar_aplicacion no está como se esperaba';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Ensayo sugerido con po_sonda (todo se deshace):
--   preparación: aplicar este archivo; luego
--     SET LOCAL ROLE authenticated;
--     SELECT set_config('request.jwt.claims', '{"sub":"<uuid Gerencia>","role":"authenticated"}', true);
--   consulta: UPDATE aplicaciones SET observaciones = observaciones
--             WHERE id = '<una aplicación Cerrada>';   -- debe dar 42501
--   y el mismo UPDATE sobre una 'Calculada' debe pasar.
--
-- ROLLBACK (ejecutable):
--   DROP TRIGGER IF EXISTS trg_bloquear_edicion_aplicacion_cerrada ON public.aplicaciones;
--   DROP TRIGGER IF EXISTS trg_bloquear_edicion_aplicacion_cerrada ON public.aplicaciones_mezclas;
--   DROP TRIGGER IF EXISTS trg_bloquear_edicion_aplicacion_cerrada ON public.aplicaciones_productos;
--   DROP TRIGGER IF EXISTS trg_bloquear_edicion_aplicacion_cerrada ON public.aplicaciones_productos_alternativos;
--   DROP TRIGGER IF EXISTS trg_bloquear_edicion_aplicacion_cerrada ON public.aplicaciones_calculos;
--   DROP TRIGGER IF EXISTS trg_bloquear_edicion_aplicacion_cerrada ON public.aplicaciones_lotes;
--   DROP TRIGGER IF EXISTS trg_bloquear_edicion_aplicacion_cerrada ON public.aplicaciones_compras;
--   DROP FUNCTION IF EXISTS public.fn_bloquear_edicion_aplicacion_cerrada();
