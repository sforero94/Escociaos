-- =============================================================================
-- 074_atribucion_monitoreos_registros_trabajo.sql
--
-- Cierra el hueco de atribucion en las dos tablas de aguacate que declaran una
-- columna de autor y nunca la poblaron. Encontrado en la corrida de
-- mantenimiento 2026-07-31-dryrun-lunes. Aprobado por Santiago.
--
-- Contexto: las migraciones 040 / 050 / 063 instalaron este mismo patron de
-- trigger sobre `tareas`, `fin_gastos`, `fin_ingresos` y
-- `fin_transacciones_ganado` -- es decir, sobre finanzas y labores, NUNCA sobre
-- las tablas de aguacate. El resultado medido en produccion:
--
--     monitoreos.user_id                 poblado en     0 de 4.233 filas
--     registros_trabajo.registrado_por   poblado en     0 de 2.500 filas
--
-- Ambas columnas existen (uuid, nullable) desde el esquema original y ningun
-- camino de escritura las llena: la app siempre las inserta como NULL.
--
-- Esta migracion solo afecta filas NUEVAS. No hay backfill posible: el autor
-- historico es genuinamente irrecuperable (misma decision que la migracion 050
-- tomo para los gastos anteriores a 2026). `monitoreos.monitor` (texto, poblado
-- 4.233/4.233) sigue siendo la atribucion operativa de quien hizo el recorrido;
-- `user_id` responde una pregunta distinta: quien lo capturo en el sistema.
--
-- Hueco conocido, identico al de 050/063: el bot de Telegram inserta con el
-- service role, donde `auth.uid()` es NULL, asi que esas filas seguiran
-- quedando sin atribuir. Es el comportamiento correcto -- COALESCE preserva el
-- valor explicito si el llamador lo manda.
--
-- Reporte: escociaos-po/reports/2026-07-31-dryrun-lunes.md (hallazgo #6)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- monitoreos.user_id
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_monitoreo_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- COALESCE, no asignacion directa: si el llamador manda un user_id explicito
  -- (por ejemplo una importacion atribuida), se respeta.
  NEW.user_id := COALESCE(NEW.user_id, auth.uid());
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_monitoreo_user_id() IS
  'Atribuye cada monitoreo nuevo a quien lo captura en el sistema. Mismo patron que set_tarea_created_by() (migracion 040). No toca filas historicas.';

DROP TRIGGER IF EXISTS trg_set_monitoreo_user_id ON public.monitoreos;
CREATE TRIGGER trg_set_monitoreo_user_id
  BEFORE INSERT ON public.monitoreos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_monitoreo_user_id();


-- -----------------------------------------------------------------------------
-- registros_trabajo.registrado_por
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_registro_trabajo_registrado_por()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.registrado_por := COALESCE(NEW.registrado_por, auth.uid());
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_registro_trabajo_registrado_por() IS
  'Atribuye cada registro de trabajo nuevo a quien lo captura. Distinto de empleado_id, que es QUIEN HIZO el trabajo. No toca filas historicas.';

DROP TRIGGER IF EXISTS trg_set_registro_trabajo_registrado_por ON public.registros_trabajo;
CREATE TRIGGER trg_set_registro_trabajo_registrado_por
  BEFORE INSERT ON public.registros_trabajo
  FOR EACH ROW
  EXECUTE FUNCTION public.set_registro_trabajo_registrado_por();


-- =============================================================================
-- ROLLBACK
-- =============================================================================
--   DROP TRIGGER IF EXISTS trg_set_monitoreo_user_id ON public.monitoreos;
--   DROP TRIGGER IF EXISTS trg_set_registro_trabajo_registrado_por ON public.registros_trabajo;
--   DROP FUNCTION IF EXISTS public.set_monitoreo_user_id();
--   DROP FUNCTION IF EXISTS public.set_registro_trabajo_registrado_por();
-- Filas afectadas por el rollback: 0 (los triggers solo tocan INSERTs futuros).
-- =============================================================================
