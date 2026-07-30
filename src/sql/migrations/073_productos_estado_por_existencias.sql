-- ============================================================================
-- Migración 073: el estado del producto se deriva de sus existencias
-- ============================================================================
--
-- PROBLEMA
-- `productos.estado` es un enum (`estado_producto`) que hasta hoy nadie
-- mantenía: se elegía a mano una sola vez en el formulario de producto y
-- después quedaba congelado. En producción, antes de esta migración:
--
--     estado = 'OK'              -> 334 filas, de las cuales 131 con
--                                   cantidad_actual = 0
--     estado = 'Sin existencias' ->   5 filas (puestas a mano, todas inactivas)
--
-- Es decir, el estado no decía nada: 131 insumos agotados figuraban como "OK"
-- y entraban a la verificación física de inventario como si hubiera algo que
-- contar.
--
-- POR QUÉ UN TRIGGER Y NO CÓDIGO EN EL FRONT
-- `cantidad_actual` se escribe desde SEIS rutas distintas
-- (NuevoMovimientoModal, NewPurchase, PurchaseHistory al borrar una compra,
-- CierreAplicacion, ProductForm y el importador CSV, que además vive en la
-- edge function y está duplicado en dos árboles). Sincronizar el estado en
-- cada una sería seis lugares que hay que recordar para siempre. El trigger
-- es el único punto por el que pasan todas.
--
-- REGLA
--   cantidad_actual <= 0 (o NULL)  -> 'Sin existencias'   (siempre)
--   cantidad_actual  > 0           -> 'OK'                sólo si el estado
--                                     venía NULL o 'Sin existencias'
--
-- El segundo caso es deliberadamente conservador: 'Vencido', 'Perdido' y
-- 'Próximo a vencer (3 meses)' describen la CALIDAD del producto, no su
-- disponibilidad, así que un producto vencido con stock sigue vencido. Lo
-- que sí se pierde es el matiz al llegar a cero — un vencido que se agota
-- pasa a 'Sin existencias', porque la calidad de un saldo inexistente no es
-- información accionable y el conteo físico necesita saber que no hay nada.
-- (En la práctica esos tres estados nunca se han usado: 0 filas.)
--
-- CONSECUENCIA AGUAS ABAJO
-- Cualquier consulta que filtre `estado = 'OK'` deja de ver los productos
-- agotados. Eso es lo que se busca en la verificación de inventario, pero
-- NO en la planeación de aplicaciones (PasoMezcla), donde sí se planea con
-- insumos que aún no se tienen y luego se genera la lista de compras. Ese
-- filtro se corrige en el mismo commit.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_productos_sync_estado_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(NEW.cantidad_actual, 0) <= 0 THEN
    -- Sin saldo no hay nada que verificar, sin importar qué diga el estado
    -- anterior.
    NEW.estado := 'Sin existencias';
  ELSIF NEW.estado IS NULL OR NEW.estado = 'Sin existencias' THEN
    -- Volvió a haber saldo: se rehabilita. Un 'Vencido'/'Perdido' con saldo
    -- se respeta tal cual.
    NEW.estado := 'OK';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_productos_sync_estado_stock() IS
  'Deriva productos.estado a partir de cantidad_actual: <=0 => Sin existencias; '
  '>0 => OK sólo si venía NULL o Sin existencias (conserva Vencido/Perdido).';

DROP TRIGGER IF EXISTS trg_productos_sync_estado_stock ON public.productos;

CREATE TRIGGER trg_productos_sync_estado_stock
  BEFORE INSERT OR UPDATE ON public.productos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_productos_sync_estado_stock();

-- ---------------------------------------------------------------------------
-- Backfill (idempotente). El trigger sólo actúa sobre filas que se escriben,
-- así que el histórico se corrige explícitamente una vez.
-- ---------------------------------------------------------------------------

UPDATE public.productos
   SET estado = 'Sin existencias'
 WHERE COALESCE(cantidad_actual, 0) <= 0
   AND estado IS DISTINCT FROM 'Sin existencias';

UPDATE public.productos
   SET estado = 'OK'
 WHERE COALESCE(cantidad_actual, 0) > 0
   AND (estado IS NULL OR estado = 'Sin existencias');

COMMIT;

-- ---------------------------------------------------------------------------
-- Verificación posterior (no debe devolver ninguna fila):
--
--   SELECT id, nombre, cantidad_actual, estado
--     FROM public.productos
--    WHERE (COALESCE(cantidad_actual, 0) <= 0 AND estado <> 'Sin existencias')
--       OR (COALESCE(cantidad_actual, 0)  > 0 AND estado  = 'Sin existencias');
-- ---------------------------------------------------------------------------
