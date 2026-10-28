-- Solo para PostgreSQL local desechable. Esquema mínimo compatible con las
-- columnas y políticas que usa F1; no carga datos ni credenciales de la finca.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TYPE public.rol_usuario AS ENUM ('Gerencia','Administrador','Verificador');
CREATE TABLE public.usuarios(id uuid PRIMARY KEY REFERENCES auth.users, rol rol_usuario, activo boolean);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_object('email', current_setting('request.jwt.claim.email', true))
$$;
CREATE FUNCTION public.get_user_role() RETURNS rol_usuario LANGUAGE sql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT rol FROM usuarios WHERE id = auth.uid() AND activo = true
$$;
GRANT USAGE ON SCHEMA auth, public TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.jwt() TO authenticated, anon;
CREATE TYPE public.unidad_medida AS ENUM ('Kilos', 'Litros');
CREATE TYPE public.tipo_movimiento AS ENUM ('Entrada','Salida por Aplicación','Salida Otros','Ajuste');
CREATE TABLE public.productos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text UNIQUE, categoria text, grupo text,
  unidad_medida unidad_medida, cantidad_actual numeric(12,2), precio_unitario numeric(12,2), activo boolean, updated_by uuid
);
CREATE TABLE public.compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fecha_compra date, proveedor text,
  proveedor_id uuid, numero_factura text, producto_id uuid REFERENCES productos,
  cantidad numeric(12,2) CHECK (cantidad > 0), unidad unidad_medida,
  numero_lote_producto text, fecha_vencimiento date, costo_unitario numeric(12,2),
  costo_total numeric(12,2) CHECK (costo_total > 0), url_factura text, usuario_registro text,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE public.movimientos_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fecha_movimiento date,
  producto_id uuid REFERENCES productos, tipo_movimiento tipo_movimiento,
  cantidad numeric(12,2), unidad unidad_medida, factura text, saldo_anterior numeric(12,2),
  saldo_nuevo numeric(12,2), valor_movimiento numeric(12,2), responsable text, observaciones text, provisional boolean
);
CREATE TABLE public.fin_gastos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), compra_id uuid REFERENCES compras ON DELETE SET NULL);
CREATE FUNCTION public.fn_cleanup_compra_dependencies(p_compra_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF COALESCE(public.get_user_role()::text,'') NOT IN ('Gerencia','Administrador') THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501';
  END IF;
  DELETE FROM public.fin_gastos WHERE compra_id = p_compra_id;
END $$;
REVOKE ALL ON FUNCTION public.fn_cleanup_compra_dependencies(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_cleanup_compra_dependencies(uuid) TO authenticated;
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_gastos ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.productos,public.compras,public.movimientos_inventario TO authenticated;
CREATE POLICY productos_escritura ON public.productos FOR ALL TO authenticated
  USING (get_user_role() IN ('Gerencia','Administrador')) WITH CHECK (get_user_role() IN ('Gerencia','Administrador'));
CREATE POLICY compras_escritura ON public.compras FOR ALL TO authenticated
  USING (get_user_role() IN ('Gerencia','Administrador')) WITH CHECK (get_user_role() IN ('Gerencia','Administrador'));
CREATE POLICY movimientos_escritura ON public.movimientos_inventario FOR ALL TO authenticated
  USING (get_user_role() IN ('Gerencia','Administrador')) WITH CHECK (get_user_role() IN ('Gerencia','Administrador'));

INSERT INTO auth.users(id) VALUES
 ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002'),
 ('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000004'),
 ('00000000-0000-4000-8000-000000000005');
INSERT INTO public.usuarios VALUES
 ('00000000-0000-4000-8000-000000000001','Gerencia',true),
 ('00000000-0000-4000-8000-000000000002','Administrador',true),
 ('00000000-0000-4000-8000-000000000003','Verificador',true),
 ('00000000-0000-4000-8000-000000000004','Verificador',true),
 ('00000000-0000-4000-8000-000000000005','Gerencia',false);
