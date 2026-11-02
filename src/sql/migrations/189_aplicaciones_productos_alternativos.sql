-- =============================================================================
-- 189 · aplicaciones_productos_alternativos (ESCO-169, parte F2 de ESCO-165)
-- =============================================================================
-- ESCRITA, SIN APLICAR. Se aplica en una sesion en vivo con Santiago presente,
-- sobre su linea "ESCO-169 aplicar". Ninguna Routine la aplica (rubrica V2a/R1:
-- lleva CREATE POLICY y GRANT).
--
-- Que hace
--   Crea una tabla nueva: los productos alternativos de una linea del plan de
--   una aplicacion. Cada alternativo tiene su propia dosis, con las MISMAS cinco
--   columnas de dosis que aplicaciones_productos (por caneca y por tamano de
--   arbol), porque la equivalencia no es uno a uno (decision 1b de Santiago,
--   2026-10-29). Los alternativos valen solo para esa aplicacion (decision 3b).
--
-- Que NO hace
--   - No toca ninguna fila existente. Las aplicaciones ya planeadas no se
--     migran (supuesto 9.c, aprobado 2026-11-02).
--   - No cambia fn_cerrar_aplicacion (106) ni ninguna tabla existente.
--   - No crea funciones ni triggers.
--
-- Permisos: patron 044, elegido por Santiago el 2026-11-02 ("044 y ahora"):
--   SELECT -> authenticated; INSERT/UPDATE/DELETE -> Gerencia + Administrador.
--   Predicado envuelto (SELECT get_user_role()) (093); get_user_role() ya filtra
--   usuarios.activo (137). anon sin ningun privilegio (081).
--
-- Consecuencia para quien escriba el codigo (ESCO-170)
--   ON DELETE CASCADE desde aplicaciones_productos: la calculadora guarda
--   borrando y reinsertando las lineas, asi que los alternativos se borran con
--   ellas y el guardado debe reinsertarlos con el id NUEVO de la linea.
--
-- Filas de dominio afectadas: cero.
-- Rollback (tabla nueva y vacia):
--   DROP TABLE public.aplicaciones_productos_alternativos;
-- =============================================================================

-- 1. Precondiciones -----------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.aplicaciones_productos_alternativos') IS NOT NULL THEN
    RAISE EXCEPTION '189: la tabla aplicaciones_productos_alternativos ya existe';
  END IF;
  IF to_regclass('public.aplicaciones_productos') IS NULL
     OR to_regclass('public.productos') IS NULL THEN
    RAISE EXCEPTION '189: faltan aplicaciones_productos o productos';
  END IF;
  IF to_regprocedure('public.get_user_role()') IS NULL THEN
    RAISE EXCEPTION '189: falta public.get_user_role()';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_user_role()', 'EXECUTE') THEN
    RAISE EXCEPTION '189: authenticated no tiene EXECUTE sobre get_user_role() (082)';
  END IF;
END
$$;

-- 2. Tabla --------------------------------------------------------------------
CREATE TABLE public.aplicaciones_productos_alternativos (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aplicacion_producto_id  uuid NOT NULL
                          REFERENCES public.aplicaciones_productos(id) ON DELETE CASCADE,
  producto_id             uuid NOT NULL REFERENCES public.productos(id),
  dosis_por_caneca        numeric CHECK (dosis_por_caneca  IS NULL OR dosis_por_caneca  > 0),
  unidad_dosis            text,
  dosis_grandes           numeric CHECK (dosis_grandes     IS NULL OR dosis_grandes     > 0),
  dosis_medianos          numeric CHECK (dosis_medianos    IS NULL OR dosis_medianos    > 0),
  dosis_pequenos          numeric CHECK (dosis_pequenos    IS NULL OR dosis_pequenos    > 0),
  dosis_clonales          numeric CHECK (dosis_clonales    IS NULL OR dosis_clonales    > 0),
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid DEFAULT auth.uid(),
  CONSTRAINT aplicaciones_productos_alternativos_linea_producto_unico
    UNIQUE (aplicacion_producto_id, producto_id),
  CONSTRAINT aplicaciones_productos_alternativos_con_dosis
    CHECK (COALESCE(dosis_por_caneca, dosis_grandes, dosis_medianos,
                    dosis_pequenos, dosis_clonales) IS NOT NULL)
);

COMMENT ON TABLE public.aplicaciones_productos_alternativos IS
  'Productos alternativos de una linea del plan (aplicaciones_productos), cada uno con su dosis. '
  'Solo para esa aplicacion. ESCO-165/169, migracion 189. Capa PLANEADA: el producto real usado '
  'sigue en movimientos_diarios_productos.';

CREATE INDEX aplicaciones_productos_alternativos_producto_idx
  ON public.aplicaciones_productos_alternativos (producto_id);

-- 3. RLS y privilegios (patron 044) ------------------------------------------
ALTER TABLE public.aplicaciones_productos_alternativos ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.aplicaciones_productos_alternativos FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.aplicaciones_productos_alternativos TO authenticated;

CREATE POLICY aplicaciones_productos_alternativos_select
  ON public.aplicaciones_productos_alternativos
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY aplicaciones_productos_alternativos_insert
  ON public.aplicaciones_productos_alternativos
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario]));

CREATE POLICY aplicaciones_productos_alternativos_update
  ON public.aplicaciones_productos_alternativos
  FOR UPDATE TO authenticated
  USING      ((SELECT public.get_user_role()) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario]))
  WITH CHECK ((SELECT public.get_user_role()) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario]));

CREATE POLICY aplicaciones_productos_alternativos_delete
  ON public.aplicaciones_productos_alternativos
  FOR DELETE TO authenticated
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario]));

-- 4. Postcondiciones ----------------------------------------------------------
DO $$
DECLARE
  n_pol int;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class
          WHERE oid = 'public.aplicaciones_productos_alternativos'::regclass) THEN
    RAISE EXCEPTION '189: RLS no quedo activa';
  END IF;
  SELECT count(*) INTO n_pol FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'aplicaciones_productos_alternativos';
  IF n_pol <> 4 THEN
    RAISE EXCEPTION '189: se esperaban 4 politicas, hay %', n_pol;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies
              WHERE schemaname = 'public' AND tablename = 'aplicaciones_productos_alternativos'
                AND ('anon' = ANY (roles) OR 'public' = ANY (roles))) THEN
    RAISE EXCEPTION '189: una politica apunta a anon o public';
  END IF;
  IF has_table_privilege('anon', 'public.aplicaciones_productos_alternativos', 'SELECT')
     OR has_table_privilege('anon', 'public.aplicaciones_productos_alternativos', 'INSERT')
     OR has_table_privilege('anon', 'public.aplicaciones_productos_alternativos', 'DELETE') THEN
    RAISE EXCEPTION '189: anon conserva privilegios';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.aplicaciones_productos_alternativos', 'SELECT') THEN
    RAISE EXCEPTION '189: authenticated sin SELECT';
  END IF;
  IF (SELECT count(*) FROM public.aplicaciones_productos_alternativos) <> 0 THEN
    RAISE EXCEPTION '189: la tabla nueva no esta vacia';
  END IF;
END
$$;
