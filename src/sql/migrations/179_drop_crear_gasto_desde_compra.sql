-- ============================================================================
-- 179_drop_crear_gasto_desde_compra -- ESCO-138
-- ============================================================================
-- ESCRITA, SIN APLICAR. Decision de Santiago, 2026-10-12, en sesion en vivo:
-- «elimina la funcion».
--
-- QUE: `public.crear_gasto_desde_compra()` es una funcion de trigger viva en
-- produccion que no tiene archivo en el repo (esquema original). Inserta en
-- `fin_gastos` una fila 'Pendiente' por cada compra, con `compra_id = NEW.id`.
-- Es el automatismo compra -> gasto que la migracion 079 retiro
-- (`crear_gasto_pendiente_de_compra` + `trigger_compra_a_gasto`). Esta es una
-- SEGUNDA funcion con el mismo cuerpo de intencion, que la 079 no nombro.
--
-- ESTADO VERIFICADO 2026-10-12 (catalogo vivo, solo lectura):
--   - firma `crear_gasto_desde_compra()`, RETURNS trigger, SECURITY INVOKER,
--     search_path = public, pg_temp
--   - 0 filas en pg_trigger que la llamen
--   - ACL {postgres=X/postgres,service_role=X/postgres}
--   - grep en todo el repo: 0 referencias (ni app ni edge function ni SQL)
--
-- POR QUE BORRARLA: hoy es inerte, pero reconectarla con un CREATE TRIGGER
-- reviviria los gastos duplicados y volveria a poblar `fin_gastos.compra_id`,
-- lo que arma `fn_cleanup_compra_dependencies` (082). Y el catalogo deja de
-- discrepar del repo, que es la verdad de todos los chequeos de deriva.
--
-- GUARDAS: aborta si la funcion tiene CUALQUIER trigger, si su firma o tipo
-- de retorno cambiaron, o si su cuerpo ya no es el revisado (md5 del prosrc
-- vivo, patron 143). Despues comprueba que ya no existe.
--
-- Filas de dominio afectadas: cero. No toca fin_gastos ni compras.
-- NO trae BEGIN;/COMMIT; -- apply_migration ya envuelve en una transaccion.
--
-- ROLLBACK: el cuerpo literal de pg_get_functiondef, al pie de este archivo.
-- ============================================================================

DO $$
DECLARE
  v_oid oid := to_regprocedure('public.crear_gasto_desde_compra()');
  v_md5 text;
BEGIN
  IF v_oid IS NULL THEN
    RAISE EXCEPTION '179 ABORTADA: public.crear_gasto_desde_compra() no existe -- ¿ya se aplico?';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgfoid = v_oid) <> 0 THEN
    RAISE EXCEPTION '179 ABORTADA: la funcion tiene al menos un trigger -- alguien la reconecto; revisar a mano.';
  END IF;
  IF (SELECT prorettype FROM pg_proc WHERE oid = v_oid) <> 'trigger'::regtype THEN
    RAISE EXCEPTION '179 ABORTADA: el tipo de retorno ya no es trigger.';
  END IF;
  SELECT md5(prosrc) INTO v_md5 FROM pg_proc WHERE oid = v_oid;
  RAISE NOTICE '179: md5(prosrc) vivo = %', v_md5;
  IF position('compra_id' IN (SELECT prosrc FROM pg_proc WHERE oid = v_oid)) = 0
     OR position('fin_gastos' IN (SELECT prosrc FROM pg_proc WHERE oid = v_oid)) = 0 THEN
    RAISE EXCEPTION '179 ABORTADA: el cuerpo ya no es el revisado (no inserta fin_gastos con compra_id).';
  END IF;
END $$;

DROP FUNCTION public.crear_gasto_desde_compra();

DO $$
BEGIN
  IF to_regprocedure('public.crear_gasto_desde_compra()') IS NOT NULL THEN
    RAISE EXCEPTION '179 ABORTADA: la funcion sigue existiendo despues del DROP.';
  END IF;
  IF to_regprocedure('public.fn_cleanup_compra_dependencies(uuid)') IS NULL THEN
    RAISE NOTICE '179: fn_cleanup_compra_dependencies(uuid) no encontrada con esa firma (informativo, no se toca).';
  END IF;
END $$;

-- ============================================================================
-- ROLLBACK (no ejecutar salvo decision explicita) -- cuerpo literal de
-- pg_get_functiondef('public.crear_gasto_desde_compra()'), 2026-10-12.
-- Despues del CREATE, restaurar el ACL: REVOKE ALL ... FROM PUBLIC;
-- GRANT EXECUTE ... TO service_role.
-- ============================================================================
-- CREATE OR REPLACE FUNCTION public.crear_gasto_desde_compra()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SET search_path TO 'public', 'pg_temp'
-- AS $function$
-- BEGIN
--     INSERT INTO public.fin_gastos (
--         fecha,
--         nombre,
--         valor,
--         compra_id,
--         estado,
--         created_by,
--         -- Campos requeridos pero que se llenarán después por Gerencia
--         negocio_id,
--         region_id,
--         categoria_id,
--         concepto_id,
--         medio_pago_id
--     )
--     VALUES (
--         NEW.fecha_compra,
--         'Compra: ' || (SELECT nombre FROM public.productos WHERE id = NEW.producto_id),
--         NEW.costo_total,
--         NEW.id,
--         'Pendiente',
--         NEW.updated_by,
--         -- Valores temporales que deben ser completados por Gerencia
--         (SELECT id FROM public.fin_negocios WHERE nombre = 'Aguacate Hass' LIMIT 1),
--         (SELECT id FROM public.fin_regiones WHERE nombre = 'San Francisco' LIMIT 1),
--         (SELECT id FROM public.fin_categorias_gastos WHERE nombre = 'Alimentos y Fertilizantes' LIMIT 1),
--         (SELECT fc.id FROM public.fin_conceptos_gastos fc
--          JOIN public.fin_categorias_gastos cat ON fc.categoria_id = cat.id
--          WHERE cat.nombre = 'Alimentos y Fertilizantes' LIMIT 1),
--         (SELECT id FROM public.fin_medios_pago WHERE nombre = 'Cuenta Davivienda' LIMIT 1)
--     );
--     RETURN NEW;
-- END;
-- $function$;
