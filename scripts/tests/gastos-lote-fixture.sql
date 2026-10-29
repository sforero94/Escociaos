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

CREATE TABLE public.fin_catalogo(id uuid PRIMARY KEY);
INSERT INTO public.fin_catalogo VALUES ('10000000-0000-4000-8000-000000000001');
GRANT SELECT ON public.fin_catalogo TO authenticated;
CREATE TABLE public.fin_gastos(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), fecha date NOT NULL,
 nombre text NOT NULL, valor numeric(15,2) NOT NULL CHECK(valor>0),
 negocio_id uuid NOT NULL REFERENCES fin_catalogo, region_id uuid NOT NULL REFERENCES fin_catalogo,
 categoria_id uuid NOT NULL REFERENCES fin_catalogo, concepto_id uuid NOT NULL REFERENCES fin_catalogo,
 proveedor_id uuid REFERENCES fin_catalogo, medio_pago_id uuid NOT NULL REFERENCES fin_catalogo,
 observaciones text,url_factura text,estado text NOT NULL CHECK(estado IN ('Pendiente','Confirmado')),
 created_by uuid REFERENCES auth.users
);
ALTER TABLE public.fin_gastos ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.fin_gastos TO authenticated;
CREATE POLICY gastos_gerencia ON public.fin_gastos FOR ALL TO authenticated
 USING(get_user_role()='Gerencia') WITH CHECK(get_user_role()='Gerencia');
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

INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000006');
INSERT INTO usuarios VALUES ('00000000-0000-4000-8000-000000000006','Gerencia',true);
