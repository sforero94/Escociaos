#!/usr/bin/env python3
"""Synthetic PG17.6 verification. No network, binds, ports, secrets or production data."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[2]
IMAGE = 'postgres@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929'
ACTOR = '10000000-0000-4000-8000-000000000001'
MANAGER = '10000000-0000-4000-8000-000000000002'
INACTIVE = '10000000-0000-4000-8000-000000000003'
VIEWER = '10000000-0000-4000-8000-000000000004'
P1 = '20000000-0000-4000-8000-000000000001'
P2 = '20000000-0000-4000-8000-000000000002'
ENV = os.environ.copy()
for key in ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'):
    ENV.pop(key, None)
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
CONTAINER = None
CHECKS = 0


def docker(args, data=None, check=True):
    return subprocess.run(DOCKER + args, input=data, text=True, capture_output=True,
                          env=ENV, check=check, timeout=60)


def sql(source, ok=True):
    result = docker(['exec', '-i', '-u', 'postgres', CONTAINER, 'psql', '-X', '-qAt',
                     '-v', 'ON_ERROR_STOP=1', '-d', 'postgres'], source, False)
    if ok and result.returncode:
        raise AssertionError(result.stderr)
    if not ok and result.returncode == 0:
        raise AssertionError('Expected SQL rejection, got success')
    return result.stdout.strip() if ok else result.stderr


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def verify(value, label):
    global CHECKS
    if not value:
        raise AssertionError(label)
    CHECKS += 1
    print('PASS', label, flush=True)


def suppress(table, event, action='RETURN NULL;'):
    sql(f"CREATE FUNCTION public.synthetic_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN {action} END $$; "
        f"CREATE TRIGGER synthetic_fault BEFORE {event} ON {table} FOR EACH ROW EXECUTE FUNCTION public.synthetic_fault();")


def unsuppress(table):
    sql(f'DROP TRIGGER synthetic_fault ON {table}; DROP FUNCTION public.synthetic_fault();')


FIXTURE = r"""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
CREATE TYPE rol_usuario AS ENUM ('Administrador','Gerencia','Verificador','Monitor');
CREATE TYPE estado_aplicacion AS ENUM ('Calculada','En ejecución','Cerrada');
CREATE TYPE estado_tarea AS ENUM ('Banco','Programada','En Proceso','Completada','Cancelada');
CREATE TYPE tipo_aplicacion AS ENUM ('Fumigación','Fertilización');
CREATE TYPE prioridad_tarea AS ENUM ('Media');
CREATE TYPE fraccion_jornal AS ENUM ('0.25','0.5','0.75','1');
CREATE TYPE unidad_medida AS ENUM ('Kilos','Litros','Unidades');
CREATE TYPE tipo_movimiento AS ENUM ('Entrada','Salida por Aplicación');
CREATE TABLE usuarios(id uuid PRIMARY KEY,email text NOT NULL,rol rol_usuario,activo boolean);
CREATE FUNCTION get_user_role() RETURNS rol_usuario LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$ SELECT rol FROM usuarios WHERE id=auth.uid() AND activo=true $$;
CREATE TABLE aplicaciones(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),codigo_aplicacion text,nombre_aplicacion text,tipo_aplicacion tipo_aplicacion,proposito text,blanco_biologico text,fecha_inicio_planeada date,agronomo_responsable text,estado estado_aplicacion,fecha_inicio_ejecucion date,fecha_fin_ejecucion date,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),fecha_fin_planeada date,fecha_recomendacion date,costo_por_arbol numeric,arboles_jornal numeric,fecha_cierre timestamptz,jornales_utilizados numeric,valor_jornal numeric,costo_total_insumos numeric,costo_total_mano_obra numeric,costo_total numeric,observaciones_cierre text,tarea_id uuid);
CREATE TABLE tareas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),codigo_tarea text,nombre text,tipo_tarea_id uuid,descripcion text,lote_id uuid,sublote_id uuid,estado estado_tarea,prioridad prioridad_tarea,fecha_estimada_inicio date,fecha_estimada_fin date,fecha_inicio_real date,fecha_fin_real date,jornales_estimados numeric,responsable_id uuid,observaciones text,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),created_by uuid,updated_by uuid,lote_ids uuid[]);
CREATE TABLE registros_trabajo(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tarea_id uuid,empleado_id uuid,fecha_trabajo date,fraccion_jornal fraccion_jornal,valor_jornal_empleado numeric,costo_jornal numeric,observaciones text,registrado_por uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),lote_id uuid,contratista_id uuid);
CREATE TABLE aplicaciones_cierre(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),aplicacion_id uuid,fecha_cierre date,dias_aplicacion int4,valor_jornal numeric(12,2),observaciones_generales text,cerrado_por text,created_at timestamptz DEFAULT now());
ALTER TABLE aplicaciones ALTER COLUMN tipo_aplicacion SET NOT NULL;
ALTER TABLE tareas ALTER COLUMN nombre SET NOT NULL;
ALTER TABLE registros_trabajo ALTER COLUMN tarea_id SET NOT NULL;
ALTER TABLE registros_trabajo ALTER COLUMN fecha_trabajo SET NOT NULL;
ALTER TABLE registros_trabajo ALTER COLUMN fraccion_jornal SET NOT NULL;
ALTER TABLE aplicaciones_cierre ALTER COLUMN aplicacion_id SET NOT NULL;
ALTER TABLE aplicaciones_cierre ALTER COLUMN fecha_cierre SET NOT NULL;
ALTER TABLE registros_trabajo ADD CONSTRAINT work_task_fk FOREIGN KEY(tarea_id) REFERENCES tareas(id);
ALTER TABLE aplicaciones_cierre ADD CONSTRAINT closure_app_fk FOREIGN KEY(aplicacion_id) REFERENCES aplicaciones(id);
CREATE TABLE productos(id uuid PRIMARY KEY,nombre text,unidad_medida unidad_medida,cantidad_actual numeric(12,2),precio_unitario numeric(12,2),activo boolean,updated_at timestamptz DEFAULT now(),updated_by uuid);
CREATE TABLE movimientos_inventario(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),fecha_movimiento date NOT NULL,producto_id uuid REFERENCES productos(id),tipo_movimiento tipo_movimiento,cantidad numeric(12,2),unidad unidad_medida,lote_aplicacion text,aplicacion_id uuid REFERENCES aplicaciones(id),saldo_anterior numeric(12,2),saldo_nuevo numeric(12,2),valor_movimiento numeric(12,2),responsable text,observaciones text,provisional boolean);
CREATE TABLE empleados(id uuid PRIMARY KEY,salario numeric,prestaciones_sociales numeric,auxilios_no_salariales numeric,horas_semanales numeric);
CREATE TABLE contratistas(id uuid PRIMARY KEY,tarifa_jornal numeric);
CREATE TABLE globalgap_correcciones(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tabla text,fila_id uuid,operacion text,datos_anteriores jsonb,datos_nuevos jsonb,aplicacion_id uuid,corregido_por uuid);
CREATE TABLE aplicaciones_lotes(aplicacion_id uuid,lote_id uuid);
CREATE TABLE tipos_tareas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nombre text,categoria text,descripcion text,activo boolean);
GRANT SELECT ON empleados,contratistas TO authenticated;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY self_read ON usuarios FOR SELECT TO authenticated USING(id=auth.uid());
GRANT SELECT ON usuarios TO authenticated;
ALTER TABLE aplicaciones ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON aplicaciones TO authenticated;
CREATE POLICY "Administrador puede todo en aplicaciones" ON aplicaciones FOR ALL TO public USING((( SELECT get_user_role() AS get_user_role) = 'Administrador'::rol_usuario));
CREATE POLICY "Gerencia acceso total" ON aplicaciones FOR ALL TO public USING((( SELECT get_user_role() AS get_user_role) = 'Gerencia'::rol_usuario));
ALTER TABLE aplicaciones_cierre ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON aplicaciones_cierre TO authenticated;
CREATE POLICY "Administrador puede todo en cierre" ON aplicaciones_cierre FOR ALL TO public USING((( SELECT get_user_role() AS get_user_role) = 'Administrador'::rol_usuario));
CREATE POLICY "Gerencia acceso total" ON aplicaciones_cierre FOR ALL TO public USING((( SELECT get_user_role() AS get_user_role) = 'Gerencia'::rol_usuario));
ALTER TABLE tareas ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON tareas TO authenticated;
CREATE POLICY "Administrador delete own tareas" ON tareas FOR DELETE TO authenticated USING(((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = 'Administrador'::rol_usuario) AND (usuarios.activo = true)))) AND ((created_by = ( SELECT auth.uid() AS uid)) OR (created_by IS NULL))));
CREATE POLICY "Administrador insert tareas" ON tareas FOR INSERT TO authenticated WITH CHECK((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])) AND (usuarios.activo = true)))));
CREATE POLICY "Administrador read tareas" ON tareas FOR SELECT TO authenticated USING((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])) AND (usuarios.activo = true)))));
CREATE POLICY "Administrador update tareas" ON tareas FOR UPDATE TO authenticated USING((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])) AND (usuarios.activo = true)))));
CREATE POLICY "Gerencia full access on tareas" ON tareas FOR ALL TO authenticated USING((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = 'Gerencia'::rol_usuario) AND (usuarios.activo = true)))));
CREATE POLICY "Verificador read tareas" ON tareas FOR SELECT TO authenticated USING((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = 'Verificador'::rol_usuario) AND (usuarios.activo = true)))));
ALTER TABLE registros_trabajo ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON registros_trabajo TO authenticated;
CREATE POLICY "Administrador access registros_trabajo" ON registros_trabajo FOR ALL TO authenticated USING((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])) AND (usuarios.activo = true)))));
CREATE POLICY "Gerencia full access on registros_trabajo" ON registros_trabajo FOR ALL TO authenticated USING((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = 'Gerencia'::rol_usuario) AND (usuarios.activo = true)))));
CREATE POLICY "Verificador read registros_trabajo" ON registros_trabajo FOR SELECT TO authenticated USING((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = 'Verificador'::rol_usuario) AND (usuarios.activo = true)))));
CREATE POLICY "authenticated_insert_registros_trabajo" ON registros_trabajo FOR INSERT TO authenticated WITH CHECK((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
CREATE POLICY "authenticated_select_registros_trabajo" ON registros_trabajo FOR SELECT TO authenticated USING(true);
CREATE POLICY "authenticated_update_registros_trabajo" ON registros_trabajo FOR UPDATE TO authenticated USING((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario]))) WITH CHECK((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON productos TO authenticated;
CREATE POLICY "Administrador actualiza productos" ON productos FOR UPDATE TO public USING((( SELECT get_user_role() AS get_user_role) = 'Administrador'::rol_usuario));
CREATE POLICY "Administrador escritura productos" ON productos FOR INSERT TO public WITH CHECK((( SELECT get_user_role() AS get_user_role) = 'Administrador'::rol_usuario));
CREATE POLICY "Administrador lectura productos" ON productos FOR SELECT TO public USING((( SELECT get_user_role() AS get_user_role) = 'Administrador'::rol_usuario));
CREATE POLICY "Gerencia acceso total" ON productos FOR ALL TO public USING((( SELECT get_user_role() AS get_user_role) = 'Gerencia'::rol_usuario));
CREATE POLICY "Permitir lectura de precios a usuarios autenticados" ON productos FOR SELECT TO authenticated USING(true);
CREATE POLICY "Usuarios autenticados leen productos" ON productos FOR SELECT TO authenticated USING(true);
CREATE POLICY "Verificador lee productos" ON productos FOR SELECT TO public USING((( SELECT get_user_role() AS get_user_role) = 'Verificador'::rol_usuario));
ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON movimientos_inventario TO authenticated;
CREATE POLICY "Administrador puede todo en movimientos" ON movimientos_inventario FOR ALL TO public USING((( SELECT get_user_role() AS get_user_role) = 'Administrador'::rol_usuario));
CREATE POLICY "Gerencia acceso total" ON movimientos_inventario FOR ALL TO public USING((( SELECT get_user_role() AS get_user_role) = 'Gerencia'::rol_usuario));
CREATE POLICY "Verificador lee movimientos" ON movimientos_inventario FOR SELECT TO public USING((( SELECT get_user_role() AS get_user_role) = 'Verificador'::rol_usuario));
CREATE OR REPLACE FUNCTION public.fn_globalgap_registrar_correccion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aplicacion_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'aplicaciones' THEN
    v_aplicacion_id := (to_jsonb(OLD) ->> 'id')::uuid;
  ELSE
    v_aplicacion_id := (to_jsonb(OLD) ->> 'aplicacion_id')::uuid;
  END IF;
  INSERT INTO public.globalgap_correcciones (tabla, fila_id, operacion, datos_anteriores, datos_nuevos, aplicacion_id, corregido_por)
  VALUES (TG_TABLE_NAME, (to_jsonb(OLD) ->> 'id')::uuid, lower(TG_OP), to_jsonb(OLD),
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END, v_aplicacion_id, auth.uid());
  RETURN COALESCE(NEW, OLD);
END;
$function$
;
CREATE TRIGGER trg_globalgap_correccion AFTER DELETE OR UPDATE ON public.aplicaciones FOR EACH ROW EXECUTE FUNCTION fn_globalgap_registrar_correccion();
CREATE OR REPLACE FUNCTION public.auto_create_tarea_for_aplicacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  new_tarea_id UUID;
  tipo_tarea_id UUID;
BEGIN
  -- Only create if estado='Calculada' AND no existing tarea
  IF NEW.estado = 'Calculada' AND NEW.tarea_id IS NULL THEN

    -- Get or create "Aplicación Fitosanitaria" tipo_tarea
    SELECT id INTO tipo_tarea_id
    FROM tipos_tareas
    WHERE nombre = 'Aplicación Fitosanitaria'
    LIMIT 1;

    IF tipo_tarea_id IS NULL THEN
      INSERT INTO tipos_tareas (nombre, categoria, descripcion, activo)
      VALUES (
        'Aplicación Fitosanitaria',
        'Aplicaciones',
        'Auto-generada para aplicaciones',
        true
      )
      RETURNING id INTO tipo_tarea_id;
    END IF;

    -- Create tarea with data from aplicación
    INSERT INTO tareas (
      codigo_tarea,
      nombre,
      tipo_tarea_id,
      descripcion,
      lote_ids,
      estado,
      prioridad,
      fecha_estimada_inicio,
      fecha_estimada_fin,
      observaciones
    )
    VALUES (
      'TAR-' || UPPER(SUBSTRING(NEW.codigo_aplicacion FROM 5)),
      NEW.nombre_aplicacion,
      tipo_tarea_id,
      'Auto-generada: ' || NEW.tipo_aplicacion || ' - ' || COALESCE(NEW.proposito, ''),
      (SELECT ARRAY_AGG(lote_id) FROM aplicaciones_lotes WHERE aplicacion_id = NEW.id),
      'Programada',
      'Media',
      NEW.fecha_inicio_planeada,
      NEW.fecha_fin_planeada,
      'Auto-generada desde aplicación ' || NEW.codigo_aplicacion
    )
    RETURNING id INTO new_tarea_id;

    -- Link back to aplicación
    NEW.tarea_id = new_tarea_id;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trigger_auto_create_tarea_aplicacion BEFORE INSERT ON public.aplicaciones FOR EACH ROW EXECUTE FUNCTION auto_create_tarea_for_aplicacion();
CREATE OR REPLACE FUNCTION public.sync_tarea_on_aplicacion_edit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  has_trabajo BOOLEAN;
BEGIN
  -- Skip if no linked tarea
  IF NEW.tarea_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if tarea has registered work
  SELECT EXISTS (
    SELECT 1
    FROM registros_trabajo
    WHERE tarea_id = NEW.tarea_id
  ) INTO has_trabajo;

  IF has_trabajo THEN
    -- Safety: Only update dates (lotes frozen to preserve work records)
    UPDATE tareas
    SET
      fecha_estimada_inicio = NEW.fecha_inicio_planeada,
      fecha_estimada_fin = NEW.fecha_fin_planeada,
      updated_at = NOW()
    WHERE id = NEW.tarea_id;
  ELSE
    -- Full sync: dates + lotes + nombre
    UPDATE tareas
    SET
      nombre = NEW.nombre_aplicacion,
      fecha_estimada_inicio = NEW.fecha_inicio_planeada,
      fecha_estimada_fin = NEW.fecha_fin_planeada,
      lote_ids = (
        SELECT ARRAY_AGG(lote_id)
        FROM aplicaciones_lotes
        WHERE aplicacion_id = NEW.id
      ),
      updated_at = NOW()
    WHERE id = NEW.tarea_id;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trigger_sync_tarea_aplicacion AFTER UPDATE ON public.aplicaciones FOR EACH ROW WHEN (((old.fecha_inicio_planeada IS DISTINCT FROM new.fecha_inicio_planeada) OR (old.fecha_fin_planeada IS DISTINCT FROM new.fecha_fin_planeada) OR (old.nombre_aplicacion IS DISTINCT FROM new.nombre_aplicacion))) EXECUTE FUNCTION sync_tarea_on_aplicacion_edit();
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;
CREATE TRIGGER update_aplicaciones_updated_at BEFORE UPDATE ON public.aplicaciones FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER set_updated_at_productos BEFORE UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE FUNCTION public.set_producto_updated_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- OJO CON EL ORDEN DE LOS ARGUMENTOS: primero auth.uid(), despues el valor
  -- viejo. El orden inverso congela la columna en el primer editor.
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$function$
;
CREATE TRIGGER set_updated_by_productos BEFORE UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION set_producto_updated_by();
CREATE TRIGGER update_productos_updated_at BEFORE UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;
CREATE TRIGGER registros_trabajo_updated_at_trigger BEFORE UPDATE ON public.registros_trabajo FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE OR REPLACE FUNCTION public.set_registro_trabajo_registrado_por()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.registrado_por := COALESCE(NEW.registrado_por, auth.uid());
  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_set_registro_trabajo_registrado_por BEFORE INSERT ON public.registros_trabajo FOR EACH ROW EXECUTE FUNCTION set_registro_trabajo_registrado_por();
CREATE OR REPLACE FUNCTION public.actualizar_estado_tarea_labor()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Only update if the task is not already "En Proceso", "Completada", or "Cancelada"
    UPDATE tareas
    SET estado = 'En Proceso',
        fecha_inicio_real = COALESCE(fecha_inicio_real, NEW.fecha_trabajo),
        updated_at = now()
    WHERE id = NEW.tarea_id
    AND estado NOT IN ('En Proceso', 'Completada', 'Cancelada');

    RETURN NEW;
END;
$function$
;
CREATE TRIGGER trigger_actualizar_estado_tarea_labor AFTER INSERT ON public.registros_trabajo FOR EACH ROW EXECUTE FUNCTION actualizar_estado_tarea_labor();
CREATE OR REPLACE FUNCTION public.actualizar_fecha_inicio_real()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Si es el primer registro de trabajo de esta tarea y no tiene fecha_inicio_real
  IF NOT EXISTS (
    SELECT 1 FROM public.registros_trabajo
    WHERE tarea_id = NEW.tarea_id
    AND id != NEW.id
  ) THEN
    UPDATE public.tareas
    SET
      fecha_inicio_real = NEW.fecha_trabajo,
      estado = CASE
        WHEN estado = 'Programada' OR estado = 'Banco' THEN 'En Proceso'::estado_tarea
        ELSE estado
      END
    WHERE id = NEW.tarea_id
    AND fecha_inicio_real IS NULL;
  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trigger_actualizar_fecha_inicio_real AFTER INSERT ON public.registros_trabajo FOR EACH ROW EXECUTE FUNCTION actualizar_fecha_inicio_real();
CREATE OR REPLACE FUNCTION public.calcular_costo_jornal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  salario_empleado NUMERIC;
  prestaciones NUMERIC;
  auxilios NUMERIC;
  horas_semanales NUMERIC;
  tarifa_contratista NUMERIC;
  costo_calculado NUMERIC;
BEGIN
  -- Only calculate if costo_jornal is not already provided
  IF NEW.costo_jornal IS NULL THEN

    -- Handle EMPLOYEE records
    IF NEW.empleado_id IS NOT NULL THEN
      -- Get employee salary info
      SELECT
        COALESCE(salario, 0),
        COALESCE(prestaciones_sociales, 0),
        COALESCE(auxilios_no_salariales, 0),
        COALESCE(horas_semanales, 48)
      INTO salario_empleado, prestaciones, auxilios, horas_semanales
      FROM empleados
      WHERE id = NEW.empleado_id;

      -- Calculate employee cost
      -- Formula: (salary + benefits + allowances) / (weeklyHours * 4.33) * 8 * fractionWorked
      costo_calculado := (salario_empleado + prestaciones + auxilios)
                        / (horas_semanales * 4.33)
                        * 8
                        * NEW.fraccion_jornal::text::numeric;

      NEW.costo_jornal := ROUND(costo_calculado, 2);
      NEW.valor_jornal_empleado := salario_empleado;

    -- Handle CONTRACTOR records
    ELSIF NEW.contratista_id IS NOT NULL THEN
      -- Get contractor tarifa
      SELECT COALESCE(tarifa_jornal, 0)
      INTO tarifa_contratista
      FROM contratistas
      WHERE id = NEW.contratista_id;

      -- Calculate contractor cost
      -- Formula: tarifa_jornal * fraction_worked
      NEW.costo_jornal := ROUND(tarifa_contratista * NEW.fraccion_jornal::text::numeric, 2);
      NEW.valor_jornal_empleado := NULL; -- Contractors don't have valor_jornal_empleado
    END IF;

  END IF;

  RETURN NEW;
END;
$function$
;
CREATE TRIGGER trigger_calcular_costo_jornal BEFORE INSERT OR UPDATE ON public.registros_trabajo FOR EACH ROW EXECUTE FUNCTION calcular_costo_jornal();
"""

APP='30000000-0000-4000-8000-000000000001'
APP2='30000000-0000-4000-8000-000000000002'
TASK='40000000-0000-4000-8000-000000000001'
TASK2='40000000-0000-4000-8000-000000000002'
WORK='50000000-0000-4000-8000-000000000001'
WORK2='50000000-0000-4000-8000-000000000002'
EMP='60000000-0000-4000-8000-000000000001'
TABLES=['aplicaciones','aplicaciones_cierre','tareas','registros_trabajo','productos','movimientos_inventario','globalgap_correcciones']

def state():
    return sql('SELECT jsonb_build_array('+','.join(f"(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') FROM public.{t} t)" for t in TABLES)+');')

def reset():
    sql('TRUNCATE '+','.join(TABLES)+' CASCADE;')
    sql(f"INSERT INTO usuarios VALUES ('{ACTOR}','admin@synthetic.invalid','Administrador',true), ('{MANAGER}','manager@synthetic.invalid','Gerencia',true), ('{INACTIVE}','inactive@synthetic.invalid','Administrador',false), ('{VIEWER}','viewer@synthetic.invalid','Verificador',true) ON CONFLICT(id) DO UPDATE SET activo=EXCLUDED.activo,rol=EXCLUDED.rol; INSERT INTO empleados VALUES ('{EMP}',100,0,0,48) ON CONFLICT DO NOTHING; INSERT INTO contratistas VALUES ('{EMP}',10) ON CONFLICT DO NOTHING;")
    sql(f"INSERT INTO tareas(id,nombre,estado) VALUES ('{TASK}','Synthetic task','Programada'),('{TASK2}','Other task','Programada'); INSERT INTO aplicaciones(id,nombre_aplicacion,estado,tarea_id,tipo_aplicacion) VALUES ('{APP}','Synthetic app','En ejecución','{TASK}','Fumigación'),('{APP2}','Other app','En ejecución','{TASK2}','Fumigación'); INSERT INTO productos VALUES ('{P1}','Synthetic one','Kilos',10,2,true,now(),NULL),('{P2}','Synthetic two','Kilos',10,2,true,now(),NULL); INSERT INTO registros_trabajo(id,tarea_id,empleado_id,fecha_trabajo,fraccion_jornal,costo_jornal) VALUES ('{WORK}','{TASK}','{EMP}','2026-01-02','1',10),('{WORK2}','{TASK2}','{EMP}','2026-01-02','1',10);")

def body(app=APP,quantity=2.345):
    return dict(aplicacion_id=app,fecha_cierre='2026-01-03',fecha_inicio_ejecucion='2026-01-02',fecha_fin_ejecucion='2026-01-02',dias_aplicacion=1,jornales_utilizados=1,valor_jornal=10,observaciones_cierre='Synthetic',observaciones_generales='Synthetic',costo_total_insumos=4.7,costo_total_mano_obra=10,costo_total=14.7,costo_por_arbol=0.147,lote_aplicacion='Synthetic',registros_trabajo=[],insumos_aplicados=[dict(producto_id=P1,cantidad=quantity,producto_nombre='Synthetic one')])

def work(id=WORK,task=TASK,**flags):
    return dict(id=id,tarea_id=task,empleado_id=EMP,contratista_id=None,lote_id=None,fecha_trabajo='2026-01-02',fraccion_jornal='0.5',costo_jornal=5,valor_jornal_empleado=100,observaciones='Synthetic',**flags)

def call(payload=None,actor=ACTOR,role='authenticated',ok=True):
    source=f"BEGIN; SET LOCAL ROLE {role}; SET LOCAL request.jwt.claim.sub={literal(actor or '')}; SELECT fn_cerrar_aplicacion({literal(json.dumps(payload or body()))}::jsonb); COMMIT;"
    out=sql(source,ok)
    return json.loads(out) if ok else out

def failure(payload=None,label='atomic rejection',**kwargs):
    before=state();error=call(payload,ok=False,**kwargs)
    if any(x in error for x in ['ambiguous','syntax error','is not assigned yet']):raise AssertionError(error)
    verify(before==state(),label)
    return error

def tests():
    sql(FIXTURE);sql((ROOT/'src/sql/security-candidates/application-closure.sql').read_text())
    reset(); result=call()
    verify(result['productosActualizados']==1,'positive ordinary Administrator closure returns one product')
    verify(sql(f"SELECT cantidad_actual=7.65 FROM productos WHERE id='{P1}';")=='t','quantity rounded once to numeric(12,2) for stock')
    verify(sql("SELECT cantidad=2.35 AND saldo_anterior=10 AND saldo_nuevo=7.65 AND responsable='admin@synthetic.invalid' FROM movimientos_inventario;")=='t','ledger uses actual rounded stock and persisted actor email')
    verify(sql(f"SELECT a.estado='Cerrada' AND t.estado='Completada' FROM aplicaciones a JOIN tareas t ON t.id=a.tarea_id WHERE a.id='{APP}';")=='t','parent and linked task close together')
    failure(label='closed retry refuses without duplicate posting')
    reset();p=body();p['registros_trabajo']=[work(_modified=True),work(WORK2,TASK2,_deleted=True)]
    failure(p,label='cross-task delete rolls back preceding valid edit')
    for flags in [dict(_deleted=True),dict(_modified=True),dict()]:
        reset();p=body();p['registros_trabajo']=[work(WORK2,TASK,**flags)];failure(p,label='existing record actual task validated '+str(flags))
    reset();p=body();p['registros_trabajo']=[work(None,TASK2,_isNew=True)];failure(p,label='new work wrong task rejected')
    reset();p=body();p['registros_trabajo']=[work(_modified=True),work("{"+WORK+"}",_deleted=True)];failure(p,label='canonical duplicate work rejected')
    reset();p=body();p['insumos_aplicados']+=[dict(producto_id="{"+P1+"}",cantidad=9)];failure(p,label='canonical duplicate SKU aggregate overdraft rejected')
    for quantity in [0,-1,None,'NaN','Infinity','-Infinity',0.001,11,10000000000]:
        reset();p=body();p['insumos_aplicados'][0]['cantidad']=quantity;failure(p,label='invalid quantity '+str(quantity))
    for field in ['jornales_utilizados','valor_jornal','costo_total_insumos','costo_total_mano_obra','costo_total','costo_por_arbol']:
        reset();p=body();p[field]='NaN';failure(p,label='nonfinite closure '+field)
    for actor,role in [(MANAGER,'authenticated'),(ACTOR,'authenticated')]:
        reset();p=body(quantity=10);call(p,actor=actor,role=role);verify(sql(f"SELECT cantidad_actual=0 FROM productos WHERE id='{P1}';")=='t','authorized role exact zero stock '+actor)
    for actor,role in [(INACTIVE,'authenticated'),(VIEWER,'authenticated'),(None,'authenticated'),('10000000-0000-4000-8000-000000000099','authenticated'),(ACTOR,'anon'),(ACTOR,'service_role')]:
        reset();failure(actor=actor,role=role,label='ordinary boundary rejects '+str(actor)+' '+role)
    reset();sql(f"UPDATE usuarios SET activo=NULL WHERE id='{ACTOR}';");failure(label='nullable active refused')
    reset();sql(f"UPDATE usuarios SET rol=NULL WHERE id='{ACTOR}';");failure(label='nullable role refused')
    reset();sql(f"UPDATE usuarios SET rol='Monitor' WHERE id='{ACTOR}';");failure(label='Monitor role refused')
    reset();sql(f"INSERT INTO aplicaciones_cierre(aplicacion_id,fecha_cierre) VALUES ('{APP}','2026-01-03');");failure(label='preexisting child coherence rejects without repair')
    verify(sql("SELECT NOT prosecdef FROM pg_proc WHERE oid='public.fn_cerrar_aplicacion(jsonb)'::regprocedure;")=='t','closure remains security invoker')
    reset();p=body();p['registros_trabajo']=[work(_modified=True),work(None,_isNew=True)];r=call(p)
    verify(r['registrosActualizados']==1 and r['registrosInsertados']==1,'positive work edit and insertion with real derived triggers')
    reset();p=body();p['registros_trabajo']=[work(_deleted=True)];verify(call(p)['registrosEliminados']==1,'positive scoped work deletion')
    reset();p=body();p['registros_trabajo']=[work(None,_isNew=True,_modified=True)];verify(call(p)['registrosInsertados']==1,'new work subsequently edited remains valid caller behavior')
    reset();p=body();row=work(None,_isNew=True);row.update(costo_jornal=None,empleado_id=None,contratista_id=EMP,valor_jornal_empleado=None);p['registros_trabajo']=[row];verify(call(p)['registrosInsertados']==1,'nullable contractor cost retains actual calculation trigger behavior')
    reset();sql(f"UPDATE registros_trabajo SET empleado_id=NULL,contratista_id='{EMP}' WHERE id='{WORK}';");p=body();row=work(_modified=True);row['costo_jornal']=None;p['registros_trabajo']=[row];verify(call(p)['registrosActualizados']==1,'nullable modified work cost retains actual calculation trigger behavior')
    for value in ['NaN','-1']:
        reset();sql(f"UPDATE productos SET cantidad_actual='{value}' WHERE id='{P1}';");failure(label='invalid persisted stock '+value)
    reset();before=state();sql(f"UPDATE productos SET cantidad_actual='Infinity' WHERE id='{P1}';",ok=False);verify(before==state(),'numeric(12,2) storage itself rejects infinite stock')
    for value in ['NaN','-1']:
        reset();sql(f"UPDATE productos SET precio_unitario='{value}' WHERE id='{P1}';");failure(label='invalid persisted price '+value)
    reset();p=body(quantity=0.005);call(p);verify(sql('SELECT cantidad=0.01 FROM movimientos_inventario;')=='t','half-cent quantity boundary rounds consistently')
    reset();p=body();p['insumos_aplicados']=[];call(p);verify(sql('SELECT count(*)=0 FROM movimientos_inventario;')=='t','valid empty-insumo closure retains business behavior')
    reset();sql(f"UPDATE aplicaciones SET tarea_id=NULL WHERE id='{APP}';");call();verify(sql(f"SELECT estado='Cerrada' FROM aplicaciones WHERE id='{APP}';")=='t','valid application without linked task remains supported')
    for table in ['productos','aplicaciones','tareas','registros_trabajo']:
        reset();sql(f'CREATE POLICY synthetic_restrict ON {table} AS RESTRICTIVE FOR UPDATE TO authenticated USING(false);');p=body()
        if table=='registros_trabajo':p['registros_trabajo']=[work(_modified=True)]
        failure(p,label='RLS suppressed '+table+' update rejects atomically');sql(f'DROP POLICY synthetic_restrict ON {table};')
    for table,event,payload in [('registros_trabajo','DELETE',dict(_deleted=True)),('registros_trabajo','UPDATE',dict(_modified=True)),('registros_trabajo','INSERT',dict(_isNew=True)),('aplicaciones_cierre','INSERT',None),('aplicaciones','UPDATE',None),('tareas','UPDATE',None),('productos','UPDATE',None),('movimientos_inventario','INSERT',None)]:
        reset();p=body()
        if payload:p['registros_trabajo']=[work(None if event=='INSERT' else WORK,**payload)]
        suppress(table,event);failure(p,label='suppressed '+table+' '+event+' rollback');unsuppress(table)
    for table,event,action in [('aplicaciones','UPDATE',"NEW.costo_total:=999; RETURN NEW;"),('aplicaciones','UPDATE',"NEW.nombre_aplicacion:='forged'; RETURN NEW;"),('productos','UPDATE',"NEW.nombre:='forged'; RETURN NEW;"),('productos','UPDATE',"NEW.cantidad_actual:=999; RETURN NEW;"),('movimientos_inventario','INSERT',"NEW.cantidad:=999; RETURN NEW;"),('aplicaciones_cierre','INSERT',"NEW.cerrado_por:='forged'; RETURN NEW;")]:
        reset();suppress(table,event,action);failure(label='rewritten '+table+' rollback');unsuppress(table)
    reset();sql("CREATE FUNCTION synthetic_after() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE productos SET cantidad_actual=999 WHERE id=NEW.producto_id; RETURN NEW; END $$; CREATE TRIGGER synthetic_after AFTER INSERT ON movimientos_inventario FOR EACH ROW EXECUTE FUNCTION synthetic_after();")
    failure(label='later cross-table AFTER trigger detected at final persisted check');sql('DROP TRIGGER synthetic_after ON movimientos_inventario; DROP FUNCTION synthetic_after();')
    reset();sql("CREATE FUNCTION synthetic_after() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF pg_trigger_depth()=1 THEN INSERT INTO movimientos_inventario SELECT gen_random_uuid(),fecha_movimiento,producto_id,tipo_movimiento,cantidad,unidad,lote_aplicacion,aplicacion_id,saldo_anterior,saldo_nuevo,valor_movimiento,responsable,observaciones,provisional FROM movimientos_inventario WHERE id=NEW.id; END IF; RETURN NEW; END $$; CREATE TRIGGER synthetic_after AFTER INSERT ON movimientos_inventario FOR EACH ROW EXECUTE FUNCTION synthetic_after();")
    failure(label='extra movement created by trigger rejects exact posting count');sql('DROP TRIGGER synthetic_after ON movimientos_inventario; DROP FUNCTION synthetic_after();')
    reset();sql("CREATE FUNCTION synthetic_after() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic mid transaction fault'; END $$; CREATE TRIGGER synthetic_after AFTER INSERT ON movimientos_inventario FOR EACH ROW EXECUTE FUNCTION synthetic_after();")
    failure(label='mid transaction ledger fault rolls back closure task stock');sql('DROP TRIGGER synthetic_after ON movimientos_inventario; DROP FUNCTION synthetic_after();')
    reset()
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        outcomes=list(pool.map(lambda _: raw_call(body()),[1,2]))
    verify(sum(x.returncode==0 for x in outcomes)==1,'concurrent same-application close exactly one succeeds')
    verify(all(x.returncode==0 or 'ya está Cerrada' in x.stderr for x in outcomes),'same-application loser rejects closed state')
    verify(sql('SELECT count(*)=1 FROM movimientos_inventario;')=='t','same-application race posts only one movement')
    reset();p=body(quantity=8);p2=body(APP2,8)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outcomes=list(pool.map(raw_call,[p,p2]))
    verify(sum(x.returncode==0 for x in outcomes)==1,'concurrent competing applications cannot overspend shared SKU')
    verify(sql(f"SELECT cantidad_actual=2 FROM productos WHERE id='{P1}';")=='t','shared stock race leaves actual nonnegative stock')
    reset();p=body();p['insumos_aplicados']+=[dict(producto_id=P2,cantidad=2)];p2=body(APP2);p2['insumos_aplicados']=list(reversed(p['insumos_aplicados']))
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outcomes=list(pool.map(raw_call,[p,p2]))
    verify(all(x.returncode==0 for x in outcomes),'opposite input SKU orders both succeed with deterministic locks')
    reset()
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        revoke=pool.submit(sql,f"BEGIN; UPDATE usuarios SET activo=false WHERE id='{ACTOR}'; SELECT pg_advisory_xact_lock(784042); SELECT pg_sleep(2); COMMIT;")
        deadline=time.monotonic()+5
        while sql("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=784042 AND granted);")!='t':
            if revoke.done() or time.monotonic()>deadline:raise AssertionError('Revocation lock barrier missing')
            time.sleep(.02)
        close=pool.submit(call,ok=False);revoke.result();error=close.result()
    verify('Current active' in error,'concurrent revocation wins before profile admission')
    verify(sql('SELECT count(*)=0 FROM movimientos_inventario;')=='t','revocation race posts nothing')

def raw_call(payload):
    return docker(['exec','-i','-u','postgres',CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-d','postgres'],f"BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='{ACTOR}'; SELECT fn_cerrar_aplicacion({literal(json.dumps(payload))}::jsonb); COMMIT;",False)
def main():
    global CONTAINER
    docker(['info','--format','{{.ServerVersion}}'])
    CONTAINER='escociaos-application-closure-'+uuid.uuid4().hex
    try:
        docker(['run','-d','--name',CONTAINER,'--pull=never','--network=none','--read-only',
            '--tmpfs','/var/lib/postgresql/data:rw,size=256m','--tmpfs','/var/run/postgresql:rw,size=16m',
            '--tmpfs','/tmp:rw,size=16m','--memory=512m','--cpus=2','--security-opt=no-new-privileges',
            '-e','POSTGRES_HOST_AUTH_METHOD=trust',IMAGE])
        config=json.loads(docker(['inspect','--format','{{json .HostConfig}}',CONTAINER]).stdout)
        verify(config['NetworkMode']=='none' and not config['Binds'] and not config['PortBindings'],'network none, no bind mounts or ports')
        for _ in range(120):
            process=docker(['exec',CONTAINER,'cat','/proc/1/comm'],check=False)
            if process.stdout.strip()=='postgres' and docker(['exec','-u','postgres',CONTAINER,'pg_isready'],check=False).returncode==0:
                break
            time.sleep(0.25)
        else:
            raise AssertionError('Synthetic PostgreSQL startup failed')
        tests()
        print(f'{CHECKS} synthetic assertions passed; no production calls or deployment.',flush=True)
    finally:
        docker(['rm','-f','-v',CONTAINER],check=False)
        verify(docker(['inspect',CONTAINER],check=False).returncode!=0,'container/tmpfs cleanup verified')


if __name__=='__main__':
    main()
