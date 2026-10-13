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
CREATE FUNCTION get_user_role() RETURNS rol_usuario LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$ SELECT rol FROM usuarios WHERE id = auth.uid() AND activo = true $$;
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

DEPENDENCY_FIXTURE = r"""
CREATE TYPE estado_empleado AS ENUM ('Activo','Inactivo');
CREATE TYPE tipo_contrato AS ENUM ('Indefinido');
CREATE TYPE periodicidad_pago AS ENUM ('Mensual');
CREATE TYPE medio_pago AS ENUM ('Efectivo');
CREATE TYPE condiciones_meteorologicas AS ENUM ('Bueno');
DROP TABLE IF EXISTS public.aplicaciones_calculos CASCADE;
CREATE TABLE public.aplicaciones_calculos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),aplicacion_id uuid,lote_id uuid,lote_nombre text,area_hectareas numeric(10,2),total_arboles int4,litros_mezcla numeric(12,4),numero_canecas numeric(10,2),kilos_totales numeric(12,4),numero_bultos int4,kilos_grandes numeric(12,4),kilos_medianos numeric(12,4),kilos_pequenos numeric(12,4),kilos_clonales numeric(12,4),created_at timestamptz,mezcla_id uuid);
ALTER TABLE public.aplicaciones_calculos ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.aplicaciones_calculos TO authenticated;
CREATE POLICY "authenticated_delete_aplicaciones_calculos" ON public.aplicaciones_calculos FOR DELETE TO authenticated USING((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
CREATE POLICY "authenticated_insert_aplicaciones_calculos" ON public.aplicaciones_calculos FOR INSERT TO authenticated WITH CHECK((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
CREATE POLICY "authenticated_select_aplicaciones_calculos" ON public.aplicaciones_calculos FOR SELECT TO authenticated USING(true);
DROP TABLE IF EXISTS public.aplicaciones_lotes CASCADE;
CREATE TABLE public.aplicaciones_lotes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),aplicacion_id uuid,lote_id uuid,sublotes_ids uuid[],arboles_grandes int4,arboles_medianos int4,arboles_pequenos int4,arboles_clonales int4,total_arboles int4,calibracion_litros_arbol numeric(10,4),tamano_caneca int4,created_at timestamptz);
ALTER TABLE public.aplicaciones_lotes ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.aplicaciones_lotes TO authenticated;
CREATE POLICY "authenticated_delete_aplicaciones_lotes" ON public.aplicaciones_lotes FOR DELETE TO authenticated USING((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
CREATE POLICY "authenticated_insert_aplicaciones_lotes" ON public.aplicaciones_lotes FOR INSERT TO authenticated WITH CHECK((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
CREATE POLICY "authenticated_select_aplicaciones_lotes" ON public.aplicaciones_lotes FOR SELECT TO authenticated USING(true);
DROP TABLE IF EXISTS public.aplicaciones_mezclas CASCADE;
CREATE TABLE public.aplicaciones_mezclas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),aplicacion_id uuid,numero_mezcla int4,nombre_mezcla text);
ALTER TABLE public.aplicaciones_mezclas ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.aplicaciones_mezclas TO authenticated;
CREATE POLICY "Administrador puede todo en mezclas" ON public.aplicaciones_mezclas FOR ALL TO public USING((( SELECT get_user_role() AS get_user_role) = 'Administrador'::rol_usuario));
CREATE POLICY "Gerencia acceso total" ON public.aplicaciones_mezclas FOR ALL TO public USING((( SELECT get_user_role() AS get_user_role) = 'Gerencia'::rol_usuario));
DROP TABLE IF EXISTS public.aplicaciones_productos CASCADE;
CREATE TABLE public.aplicaciones_productos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),mezcla_id uuid,producto_id uuid,dosis_por_caneca numeric(10,4),unidad_dosis text,dosis_grandes numeric(10,4),dosis_medianos numeric(10,4),dosis_pequenos numeric(10,4),dosis_clonales numeric(10,4),cantidad_total_necesaria numeric(12,4),producto_nombre text,producto_categoria text,producto_unidad unidad_medida,created_at timestamptz);
ALTER TABLE public.aplicaciones_productos ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.aplicaciones_productos TO authenticated;
CREATE POLICY "authenticated_delete_aplicaciones_productos" ON public.aplicaciones_productos FOR DELETE TO authenticated USING((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
CREATE POLICY "authenticated_insert_aplicaciones_productos" ON public.aplicaciones_productos FOR INSERT TO authenticated WITH CHECK((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
CREATE POLICY "authenticated_select_aplicaciones_productos" ON public.aplicaciones_productos FOR SELECT TO authenticated USING(true);
DROP TABLE IF EXISTS public.contratistas CASCADE;
CREATE TABLE public.contratistas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nombre text,tipo_contrato text,tarifa_jornal numeric,cedula text,telefono text,estado text,fecha_inicio date,fecha_fin date,observaciones text,created_at timestamptz,updated_at timestamptz);
ALTER TABLE public.contratistas ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.contratistas TO authenticated;
CREATE POLICY "authenticated_delete_contratistas" ON public.contratistas FOR DELETE TO authenticated USING((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
CREATE POLICY "authenticated_insert_contratistas" ON public.contratistas FOR INSERT TO authenticated WITH CHECK((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
CREATE POLICY "authenticated_select_contratistas" ON public.contratistas FOR SELECT TO authenticated USING((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
CREATE POLICY "authenticated_update_contratistas" ON public.contratistas FOR UPDATE TO authenticated USING((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario]))) WITH CHECK((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
DROP TABLE IF EXISTS public.empleados CASCADE;
CREATE TABLE public.empleados(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nombre text,cedula text,telefono text,email text,estado estado_empleado,cargo text,tipo_contrato tipo_contrato,fecha_inicio_contrato date,fecha_fin_contrato date,horas_semanales numeric,periodicidad_pago periodicidad_pago,salario numeric,prestaciones_sociales numeric,auxilios_no_salariales numeric,medio_pago medio_pago,banco text,numero_cuenta text,created_at timestamptz,updated_at timestamptz,created_by uuid,updated_by uuid);
ALTER TABLE public.empleados ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.empleados TO authenticated;
CREATE POLICY "Administrador insert access on empleados" ON public.empleados FOR INSERT TO authenticated WITH CHECK((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])) AND (usuarios.activo = true)))));
CREATE POLICY "Administrador read access on empleados" ON public.empleados FOR SELECT TO authenticated USING((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY['Administrador'::rol_usuario, 'Gerencia'::rol_usuario])) AND (usuarios.activo = true)))));
CREATE POLICY "Gerencia full access on empleados" ON public.empleados FOR ALL TO authenticated USING((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = 'Gerencia'::rol_usuario) AND (usuarios.activo = true))))) WITH CHECK((EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = 'Gerencia'::rol_usuario) AND (usuarios.activo = true)))));
CREATE POLICY "Verificador read active empleados" ON public.empleados FOR SELECT TO authenticated USING(((estado = 'Activo'::estado_empleado) AND (EXISTS ( SELECT 1
   FROM usuarios
  WHERE ((usuarios.id = ( SELECT auth.uid() AS uid)) AND (usuarios.rol = ANY (ARRAY['Verificador'::rol_usuario, 'Administrador'::rol_usuario, 'Gerencia'::rol_usuario])) AND (usuarios.activo = true))))));
DROP TABLE IF EXISTS public.lotes CASCADE;
CREATE TABLE public.lotes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),nombre text,numero_orden int4,area_hectareas numeric(10,2),arboles_grandes int4,arboles_medianos int4,arboles_pequenos int4,arboles_clonales int4,total_arboles int4,activo bool,fecha_siembra date);
ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.lotes TO authenticated;
CREATE POLICY "Administrador lee lotes" ON public.lotes FOR SELECT TO public USING((( SELECT get_user_role() AS get_user_role) = 'Administrador'::rol_usuario));
CREATE POLICY "Gerencia acceso total" ON public.lotes FOR ALL TO public USING((( SELECT get_user_role() AS get_user_role) = 'Gerencia'::rol_usuario));
CREATE POLICY "Usuarios autenticados pueden actualizar lotes" ON public.lotes FOR UPDATE TO authenticated USING((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario]))) WITH CHECK((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
CREATE POLICY "Usuarios autenticados pueden eliminar lotes" ON public.lotes FOR DELETE TO authenticated USING((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
CREATE POLICY "Usuarios autenticados pueden insertar lotes" ON public.lotes FOR INSERT TO authenticated WITH CHECK((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
CREATE POLICY "Usuarios autenticados pueden leer lotes" ON public.lotes FOR SELECT TO authenticated USING(true);
DROP TABLE IF EXISTS public.movimientos_diarios CASCADE;
CREATE TABLE public.movimientos_diarios(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),aplicacion_id uuid,lote_id uuid,fecha_movimiento date,responsable text,notas text,lote_nombre text,created_at timestamptz,created_by uuid,numero_canecas numeric,condiciones_meteorologicas condiciones_meteorologicas,numero_bultos numeric,equipo_aplicacion text,personal text,hora_inicio time,hora_fin time);
ALTER TABLE public.movimientos_diarios ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.movimientos_diarios TO authenticated;
CREATE POLICY "Usuarios autenticados pueden crear movimientos diarios" ON public.movimientos_diarios FOR INSERT TO authenticated WITH CHECK((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
CREATE POLICY "Usuarios autenticados pueden leer movimientos diarios" ON public.movimientos_diarios FOR SELECT TO authenticated USING(true);
CREATE POLICY "Usuarios pueden actualizar sus propios movimientos" ON public.movimientos_diarios FOR UPDATE TO authenticated USING((created_by = ( SELECT auth.uid() AS uid)));
CREATE POLICY "Usuarios pueden eliminar sus propios movimientos" ON public.movimientos_diarios FOR DELETE TO authenticated USING((created_by = ( SELECT auth.uid() AS uid)));
DROP TABLE IF EXISTS public.movimientos_diarios_productos CASCADE;
CREATE TABLE public.movimientos_diarios_productos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),movimiento_diario_id uuid,producto_id uuid,producto_nombre text,producto_categoria text,cantidad_utilizada numeric,unidad unidad_medida,created_at timestamptz);
ALTER TABLE public.movimientos_diarios_productos ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.movimientos_diarios_productos TO authenticated;
CREATE POLICY "authenticated_delete_movimientos_diarios_productos" ON public.movimientos_diarios_productos FOR DELETE TO authenticated USING((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
CREATE POLICY "authenticated_insert_movimientos_diarios_productos" ON public.movimientos_diarios_productos FOR INSERT TO authenticated WITH CHECK((( SELECT get_user_role() AS get_user_role) = ANY (ARRAY['Gerencia'::rol_usuario, 'Administrador'::rol_usuario])));
CREATE POLICY "authenticated_select_movimientos_diarios_productos" ON public.movimientos_diarios_productos FOR SELECT TO authenticated USING(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON public.aplicaciones,public.aplicaciones_cierre,public.tareas,public.registros_trabajo,public.productos,public.movimientos_inventario TO authenticated;
"""

APP='30000000-0000-4000-8000-000000000001'
APP2='30000000-0000-4000-8000-000000000002'
TASK='40000000-0000-4000-8000-000000000001'
TASK2='40000000-0000-4000-8000-000000000002'
WORK='50000000-0000-4000-8000-000000000001'
WORK2='50000000-0000-4000-8000-000000000002'
EMP='60000000-0000-4000-8000-000000000001'
SOURCE_TABLES=['aplicaciones_calculos','aplicaciones_lotes','aplicaciones_mezclas','aplicaciones_productos','lotes','movimientos_diarios','movimientos_diarios_productos']
TABLES=SOURCE_TABLES+['aplicaciones','aplicaciones_cierre','tareas','registros_trabajo','productos','movimientos_inventario','globalgap_correcciones']

def state():
    return sql('SELECT jsonb_build_array('+','.join(f"(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM {t if '.' in t else 'public.'+t} t)" for t in TABLES)+');')

def reset():
    sql('TRUNCATE '+','.join(TABLES)+' CASCADE;')
    sql(f"INSERT INTO usuarios VALUES ('{ACTOR}','admin@synthetic.invalid','Administrador',true), ('{MANAGER}','manager@synthetic.invalid','Gerencia',true), ('{INACTIVE}','inactive@synthetic.invalid','Administrador',false), ('{VIEWER}','viewer@synthetic.invalid','Verificador',true) ON CONFLICT(id) DO UPDATE SET activo=EXCLUDED.activo,rol=EXCLUDED.rol; INSERT INTO empleados(id,salario,prestaciones_sociales,auxilios_no_salariales,horas_semanales) VALUES ('{EMP}',100,0,0,48) ON CONFLICT DO NOTHING; INSERT INTO contratistas(id,tarifa_jornal) VALUES ('{EMP}',10) ON CONFLICT DO NOTHING;")
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
    sql(FIXTURE);sql(DEPENDENCY_FIXTURE)
    candidate=(ROOT/'src/sql/security-candidates/application-closure.sql').read_text()
    legacy,extended=candidate.split('-- Explicit privileged protocol boundary.',1)
    sql(legacy+'COMMIT;')
    # Model preinstalled ownerless entry points with public/default EXECUTE grants.
    for signature in ['fn_application_closure_snapshot(uuid)','fn_application_close(uuid,jsonb,jsonb)','fn_application_closure_status(uuid,jsonb,jsonb)']:
        sql('CREATE FUNCTION public.'+signature+" RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;")

    if os.environ.get('APPLICATION_CLOSURE_PROTOCOL_ONLY')=='1':
        sql('BEGIN;--'+extended); protocol_tests(); return
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
    sql('BEGIN;--'+extended)
    protocol_tests()

def raw_call(payload):
    return docker(['exec','-i','-u','postgres',CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-d','postgres'],f"BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='{ACTOR}'; SELECT fn_cerrar_aplicacion({literal(json.dumps(payload))}::jsonb); COMMIT;",False)
def protocol_call(operation='close',payload=None,expected=None,key=None,actor=ACTOR,role='authenticated',ok=True,expected_owner='actor'):
    key=key or str(uuid.uuid4());payload=payload or protocol_body()
    expected=expected if expected is not None else snapshot(payload['aplicacion_id'],actor=actor)
    fn='fn_application_close' if operation=='close' else 'fn_application_closure_status'
    owner_sql=literal(actor if expected_owner=='actor' else expected_owner)+'::uuid' if (actor if expected_owner=='actor' else expected_owner) is not None else 'NULL::uuid'
    source=f"BEGIN; SET LOCAL ROLE {role}; SET LOCAL request.jwt.claim.sub={literal(actor or '')}; SELECT public.{fn}('{key}'::uuid,{literal(json.dumps(payload))}::jsonb,{literal(json.dumps(expected))}::jsonb,{owner_sql}); COMMIT;"
    out=sql(source,ok)
    return json.loads(out) if ok else out

def snapshot(application=APP,actor=ACTOR,ok=True,expected_owner='actor'):
    owner_sql=literal(actor if expected_owner=='actor' else expected_owner)+'::uuid' if (actor if expected_owner=='actor' else expected_owner) is not None else 'NULL::uuid'
    out=sql(f"BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub={literal(actor or '')}; SELECT fn_application_closure_snapshot('{application}'::uuid,{owner_sql}); COMMIT;",ok)
    return json.loads(out)['expected'] if ok else out

def protocol_reset():
    reset();sql('TRUNCATE application_closure.requests;')
    for application,task in [(APP,TASK),(APP2,TASK2)]:
        sql(f"INSERT INTO lotes(id,nombre,total_arboles,activo) VALUES ('{task}','Synthetic lot',100,true); INSERT INTO aplicaciones_lotes(aplicacion_id,lote_id) VALUES ('{application}','{task}'); INSERT INTO movimientos_diarios(id,aplicacion_id,lote_id,fecha_movimiento) VALUES ('{task}','{application}','{task}','2026-01-02'); INSERT INTO movimientos_diarios_productos(movimiento_diario_id,producto_id,producto_nombre,cantidad_utilizada,unidad) VALUES ('{task}','{P1}','Synthetic one',2.345,'Kilos');")
    sql("UPDATE empleados SET nombre='Synthetic employee',estado='Activo'; UPDATE contratistas SET nombre='Synthetic contractor',estado='Activo';")

def protocol_body(application=APP):
    p=body(application);p.update(costo_total_insumos=4.69,costo_total=14.69,costo_por_arbol=.1469)
    return p

def protocol_failure(label,payload=None,expected=None,key=None,operation='close',actor=ACTOR,role='authenticated'):
    p=payload or protocol_body();expected=expected if expected is not None else snapshot(p['aplicacion_id'])
    before=state();error=protocol_call(operation,p,expected,key,actor,role,False)
    if any(x in error for x in ['ambiguous','syntax error','is not assigned yet']):raise AssertionError(error)
    verify(state()==before,label)
    return error

def protocol_tests():
    TABLES.append('application_closure.requests')
    protocol_reset();p=protocol_body();e=snapshot()
    for owner in [None,MANAGER]:
        for operation in ['close','status','snapshot']:
            before=state()
            error=snapshot(ok=False,expected_owner=owner) if operation=='snapshot' else protocol_call(operation,p,e,ok=False,expected_owner=owner)
            verify('Operation owner mismatch' in error and state()==before,'null/mismatched owner refuses '+operation+' with zero effect '+str(owner))
    for signature in ['fn_application_closure_snapshot(uuid)','fn_application_close(uuid,jsonb,jsonb)','fn_application_closure_status(uuid,jsonb,jsonb)']:
        verify(sql('SELECT to_regprocedure('+literal('public.'+signature)+') IS NULL;')=='t','ownerless overload retired '+signature)
    for role in ['authenticated','anon','service_role']:
        before=state();error=call(p,role=role,ok=False)
        verify('permission denied for function fn_cerrar_aplicacion' in error and state()==before,'private legacy closure core refuses '+role)

    protocol_reset();p=protocol_body();e=snapshot();key=str(uuid.uuid4());result=protocol_call(payload=p,expected=e,key=key)
    verify(result['receipt']['productosActualizados']==1,'new CAS protocol positive Administrator closes with actual source quantities and totals')
    for owner in [None,MANAGER]:
        for operation in ['close','status']:
            before=state();error=protocol_call(operation,p,e,key,expected_owner=owner,ok=False)
            verify('Operation owner mismatch' in error and state()==before,'owner guard prevents committed closure replay/disclosure '+operation+' '+str(owner))

    before=state();verify(protocol_call(payload=p,expected=e,key=key)==result and state()==before,'lost-response identical retry returns exact committed receipt without mutation')
    resolved=protocol_call('status',p,e,key)
    verify(resolved['state']=='committed' and resolved['receipt']==result['receipt'],'status recovers exact actor-bound committed closure')
    changed=dict(p,costo_total=999);protocol_failure('changed payload cannot reuse committed key',changed,e,key)
    changed_expected=dict(e,forged=True);protocol_failure('changed expected cannot reuse committed key',p,changed_expected,key)
    protocol_failure('other actor cannot replay original closure receipt',p,e,key,actor=MANAGER)
    sql(f"UPDATE usuarios SET activo=false WHERE id='{ACTOR}';");protocol_failure('revoked actor cannot replay completed closure',p,e,key)
    protocol_reset();p=protocol_body();e=snapshot(actor=MANAGER)
    verify(protocol_call(payload=p,expected=e,actor=MANAGER)['receipt']['productosActualizados']==1,'new CAS protocol positive active Gerencia closes')
    for field in ['activo','rol']:
        protocol_reset();e=snapshot();sql(f"UPDATE usuarios SET {field}=NULL WHERE id='{ACTOR}';")
        protocol_failure('new CAS rejects nullable '+field,expected=e)
    protocol_reset();p=protocol_body();e=snapshot();key=str(uuid.uuid4());before=state();out=protocol_call('status',p,e,key)
    verify(out['state']=='cancelled' and sql('SELECT count(*)=0 FROM movimientos_inventario;')=='t','absent status creates durable cancellation without posting')
    before=state();protocol_failure('cancelled request key cannot arrive late and post',p,e,key)
    verify(protocol_call('status',p,e,key)==out and state()==before,'cancelled resolution retry is stable')
    for table,mutation in [('aplicaciones',f"UPDATE aplicaciones SET observaciones_cierre='changed' WHERE id='{APP}'"),('tareas',f"UPDATE tareas SET nombre='changed' WHERE id='{TASK}'"),('registros_trabajo',f"UPDATE registros_trabajo SET costo_jornal=99 WHERE id='{WORK}'"),('productos',f"UPDATE productos SET precio_unitario=9 WHERE id='{P1}'"),('movimientos_diarios',f"UPDATE movimientos_diarios SET notas='changed' WHERE aplicacion_id='{APP}'"),('movimientos_diarios_productos',f"UPDATE movimientos_diarios_productos SET cantidad_utilizada=9 WHERE movimiento_diario_id='{TASK}'"),('lotes',f"UPDATE lotes SET total_arboles=999 WHERE id='{TASK}'"),('empleados',f"UPDATE empleados SET salario=999 WHERE id='{EMP}'"),('contratistas',f"UPDATE contratistas SET tarifa_jornal=999 WHERE id='{EMP}'")]:
        protocol_reset();e=snapshot();sql(mutation+';');protocol_failure('stale original refuses changed '+table,expected=e)
    protocol_reset();e=snapshot();sql(f"INSERT INTO registros_trabajo(tarea_id,empleado_id,fecha_trabajo,fraccion_jornal,costo_jornal) VALUES ('{TASK}','{EMP}','2026-01-02','1',10);");protocol_failure('new work row changes exact original set',expected=e)
    protocol_reset();p=protocol_body();p['insumos_aplicados'][0]['cantidad']=1;protocol_failure('forged consumption refused against actual captured movements',p)
    protocol_reset();p=protocol_body();p['costo_total']=999;protocol_failure('forged total rolls back entire application and stock',p)
    protocol_reset();p=protocol_body();p['costo_total_mano_obra']=0;protocol_failure('omitted existing work total refuses rather than lose labor costs',p)
    protocol_reset();e=snapshot();protocol_failure('legacy unversioned caller retired',expected=e,role='service_role')
    failure(label='ordinary legacy RPC cannot bypass CAS')
    sql("CREATE POLICY active_account_required ON public.productos AS RESTRICTIVE FOR ALL TO authenticated USING ((SELECT public.get_user_role()) IS NOT NULL) WITH CHECK ((SELECT public.get_user_role()) IS NOT NULL);")
    protocol_reset();protocol_call();verify(True,'reviewed active-account AND policy supports explicit closure boundary');sql('DROP POLICY active_account_required ON productos;')
    sql("CREATE POLICY active_account_required ON public.productos AS PERMISSIVE FOR ALL TO authenticated USING ((SELECT public.get_user_role()) IS NOT NULL) WITH CHECK ((SELECT public.get_user_role()) IS NOT NULL);")
    protocol_reset();e=snapshot(ok=False)
    verify('drift' in e,'permissive lookalike active-account policy refuses');sql('DROP POLICY active_account_required ON productos;')
    for actor in [INACTIVE,VIEWER,None,'10000000-0000-4000-8000-000000000099']:
        protocol_reset();e=snapshot();protocol_failure('new closure rejects ordinary boundary '+str(actor),expected=e,actor=actor)
        verify('required' in snapshot(actor=actor,ok=False),'snapshot read refuses unauthorized identity '+str(actor))
    protocol_reset();e=snapshot();sql('CREATE POLICY synthetic_drift ON productos FOR SELECT TO authenticated USING(false);');protocol_failure('runtime boundary refuses policy drift',expected=e);sql('DROP POLICY synthetic_drift ON productos;')
    protocol_reset();e=snapshot();sql('REVOKE UPDATE ON productos FROM authenticated;');protocol_failure('runtime boundary refuses grant drift',expected=e);sql('GRANT UPDATE ON productos TO authenticated;')
    for event in ['INSERT','UPDATE']:
        protocol_reset();e=snapshot();suppress('application_closure.requests',event);protocol_failure('private closure proof '+event+' suppression atomic',expected=e);unsuppress('application_closure.requests')
    protocol_reset();e=snapshot();suppress('application_closure.requests','UPDATE',"NEW.receipt:='{}'; RETURN NEW;");protocol_failure('private closure receipt rewrite atomic',expected=e);unsuppress('application_closure.requests')
    protocol_reset();e=snapshot();suppress('application_closure.requests','INSERT',f"NEW.application_id:='{APP2}'; RETURN NEW;");protocol_failure('private closure application binding rewrite atomic',expected=e);unsuppress('application_closure.requests')
    protocol_reset();e=snapshot();suppress('application_closure.requests','INSERT');protocol_failure('cancelled proof insertion suppression refuses safe resolution',expected=e,operation='status');unsuppress('application_closure.requests')
    protocol_reset();e=snapshot();sql(f"CREATE FUNCTION synthetic_cross() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE empleados SET salario=999 WHERE id='{EMP}'; RETURN NEW; END $$; CREATE TRIGGER synthetic_cross AFTER INSERT ON application_closure.requests FOR EACH ROW EXECUTE FUNCTION synthetic_cross();")
    protocol_failure('request AFTER insertion cannot alter a captured source',expected=e);sql('DROP TRIGGER synthetic_cross ON application_closure.requests; DROP FUNCTION synthetic_cross();')
    protocol_reset();e=snapshot();sql(f"CREATE FUNCTION synthetic_cross() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE productos SET cantidad_actual=999 WHERE id='{P1}'; RETURN NEW; END $$; CREATE TRIGGER synthetic_cross AFTER UPDATE ON application_closure.requests FOR EACH ROW EXECUTE FUNCTION synthetic_cross();")
    protocol_failure('receipt AFTER update cannot silently alter business stock',expected=e);sql('DROP TRIGGER synthetic_cross ON application_closure.requests; DROP FUNCTION synthetic_cross();')
    protocol_reset();p=protocol_body();p.update(jornales_utilizados=1.5,costo_total_mano_obra=15,costo_total=19.69,costo_por_arbol=.1969);p['registros_trabajo']=[work(None,_isNew=True)];e=snapshot()
    sql(f"CREATE FUNCTION synthetic_cross() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE registros_trabajo SET observaciones='forged' WHERE id='{WORK}'; RETURN NEW; END $$; CREATE TRIGGER synthetic_cross BEFORE INSERT ON registros_trabajo FOR EACH ROW EXECUTE FUNCTION synthetic_cross();")
    protocol_failure('work trigger cannot rewrite untouched original work even with valid totals',p,e);sql('DROP TRIGGER synthetic_cross ON registros_trabajo; DROP FUNCTION synthetic_cross();')
    protocol_reset();p=protocol_body();e=snapshot();key=str(uuid.uuid4())
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        change=pool.submit(sql,f"BEGIN; UPDATE empleados SET salario=777 WHERE id='{EMP}'; SELECT pg_advisory_xact_lock(784043); SELECT pg_sleep(2); COMMIT;")
        deadline=time.monotonic()+5
        while sql("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=784043 AND granted);")!='t':
            if change.done() or time.monotonic()>deadline:raise AssertionError('Source writer barrier missing')
            time.sleep(.02)
        close=pool.submit(protocol_call,'close',p,e,key,ACTOR,'authenticated',False);change.result();error=close.result()
    verify('original changed' in error,'concurrent source edit commits before table-lock admission and CAS refuses')
    verify(sql('SELECT count(*)=0 FROM application_closure.requests;')=='t','source-edit race posts no request or receipt')
    protocol_reset();p=protocol_body();e=snapshot();key=str(uuid.uuid4())
    def raw(operation):
        fn='fn_application_close' if operation=='close' else 'fn_application_closure_status'
        return docker(['exec','-i','-u','postgres',CONTAINER,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-d','postgres'],f"BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='{ACTOR}'; SELECT {fn}('{key}',{literal(json.dumps(p))}::jsonb,{literal(json.dumps(e))}::jsonb,'{ACTOR}'::uuid); COMMIT;",False)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outcomes=list(pool.map(raw,['close','status']))
    verify(all(x.returncode==0 or 'cancelled' in x.stderr for x in outcomes),'close and absent-resolution race serializes on same actor/key')
    verify(sql("SELECT count(*)=1 AND bool_and(state IN ('committed','cancelled')) FROM application_closure.requests;")=='t','close/status race leaves one terminal outcome')
    protocol_reset();p=protocol_body();e=snapshot();key=str(uuid.uuid4())
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:outcomes=list(pool.map(raw,['close','close']))
    verify(all(x.returncode==0 for x in outcomes) and outcomes[0].stdout==outcomes[1].stdout,'concurrent identical closure attempts replay exact single receipt')
    verify(sql('SELECT count(*)=1 FROM movimientos_inventario;')=='t','concurrent identical closure attempts post once')
    protocol_reset();p=protocol_body();e=snapshot();key=str(uuid.uuid4());protocol_call(payload=p,expected=e,key=key)
    sql(f"DELETE FROM movimientos_inventario WHERE aplicacion_id='{APP}'; DELETE FROM aplicaciones_cierre WHERE aplicacion_id='{APP}'; DELETE FROM aplicaciones WHERE id='{APP}';")
    verify(protocol_call('status',p,e,key)['state']=='committed','prospective closure proof survives destructive current caller deletion without cascade')

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
