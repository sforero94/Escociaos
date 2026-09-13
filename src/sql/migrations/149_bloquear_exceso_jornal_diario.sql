-- Migración 149: bloquear que una persona sume más de 1.0 jornal por día
-- (hallazgo ESCO-70)
--
-- 42 casos reales verificados antes de decidir (~9 sesiones de captura
-- masiva, mismo grupo de personas/lotes, mismo created_at, hasta 2,25
-- jornales por persona en un día; el más reciente el 2026-09-10). No son
-- duplicados: (fecha_trabajo, empleado_id, contratista_id, lote_id,
-- tarea_id) no repite ninguna fila -- es la misma persona repartida entre
-- VARIOS lotes/tareas el mismo día, y nada sumaba el total.
--
-- DECISIÓN DE SANTIAGO (2026-09-13): es error de captura masiva, no horas
-- extra legítimas -- el ENUM fraccion_jornal solo tiene 4 etiquetas
-- (0.25/0.5/0.75/1.0) y la migración 106 ya estableció que registrar horas
-- extra necesita una etiqueta nueva, no una regla que las deje pasar por
-- aquí. La guarda BLOQUEA (no solo advierte, a diferencia de la regla
-- general del módulo hato "advertir, nunca bloquear" -- ésta es una
-- excepción deliberada de Santiago para este caso concreto).
--
-- DOS PUNTOS DE GUARDA, el mismo día, por decisión explícita:
--   1. RegistrarTrabajoDialog.tsx (frontend) -- ya bloquea antes de insertar,
--      mismo cambio de commit que esta migración.
--   2. Este trigger, auto_create_registro_trabajo_from_movimiento() -- la
--      otra puerta de escritura (movimientos_diarios_empleados/_trabajadores
--      -> aplicaciones), que el frontend no puede ver ni bloquear.
--
-- QUÉ CAMBIA (solo auto_create_registro_trabajo_from_movimiento,
-- CREATE OR REPLACE -- nunca se edita el trigger original): después del
-- DELETE-luego-INSERT que ya hace la función (upsert por tarea+lote+fecha+
-- persona), se suma fraccion_jornal::text::numeric de TODAS las filas de
-- registros_trabajo de esa persona en esa fecha_trabajo -- cualquier
-- tarea/lote, no solo la de este movimiento -- más la fracción que se está
-- por insertar. Si el total supera 1.0 (tolerancia 0.0001, igual que el
-- guard del frontend), se aborta con RAISE EXCEPTION antes del INSERT --
-- el DELETE ya corrió, así que abortar dentro de la MISMA transacción del
-- trigger revierte también ese DELETE (todo o nada). El mensaje incluye
-- literalmente "jornales registrados": RegistrarTrabajoDialog.tsx y
-- Labores.tsx ya tenían (desde antes de esta migración) un catch que
-- reconoce esa frase como error de validación -- código muerto hasta hoy,
-- escrito en anticipación de esta guarda.
--
-- Filas de dominio afectadas: CERO. Los 42 casos históricos NO se tocan acá
-- -- Santiago no autorizó un UPDATE masivo, solo la regla; su corrección es
-- una ficha `clase datos` aparte con revisión caso a caso.

DO $$
DECLARE
  v_src TEXT;
BEGIN
  IF to_regprocedure('public.auto_create_registro_trabajo_from_movimiento()') IS NULL THEN
    RAISE EXCEPTION '149 ABORTADA (pre): auto_create_registro_trabajo_from_movimiento() no existe.';
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'auto_create_registro_trabajo_from_movimiento';

  IF v_src ILIKE '%jornales registrados%' THEN
    RAISE EXCEPTION '149 ABORTADA (pre): la función YA tiene la guarda de exceso de jornal -- probablemente ya se aplicó. Revisar a mano antes de reintentar.';
  END IF;

  IF md5(v_src) <> 'd6b210ba4750126a885efb4341110ffe' THEN
    RAISE EXCEPTION '149 ABORTADA (pre): auto_create_registro_trabajo_from_movimiento difiere del cuerpo vivo revisado (md5 actual %). No sobrescribir un cambio vivo sin incorporarlo primero.', md5(v_src);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.auto_create_registro_trabajo_from_movimiento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  aplicacion_tarea_id UUID;
  movimiento_fecha DATE;
  fraccion_enum fraccion_jornal;
  v_persona_id UUID;
  v_total_jornales NUMERIC;
BEGIN
  -- Get linked tarea_id and fecha_movimiento from the aplicación
  SELECT a.tarea_id, md.fecha_movimiento
  INTO aplicacion_tarea_id, movimiento_fecha
  FROM aplicaciones a
  JOIN movimientos_diarios md ON md.aplicacion_id = a.id
  WHERE md.id = NEW.movimiento_diario_id;

  -- Skip if no linked tarea (legacy aplicaciones)
  IF aplicacion_tarea_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Convert NUMERIC to ENUM fraccion_jornal
  fraccion_enum := CASE
    WHEN NEW.fraccion_jornal = 0.25 THEN '0.25'::fraccion_jornal
    WHEN NEW.fraccion_jornal = 0.5 THEN '0.5'::fraccion_jornal
    WHEN NEW.fraccion_jornal = 0.75 THEN '0.75'::fraccion_jornal
    WHEN NEW.fraccion_jornal = 1.0 THEN '1.0'::fraccion_jornal
    ELSE '0.25'::fraccion_jornal -- Default fallback
  END;

  -- Delete existing record if any (handles duplicates)
  DELETE FROM registros_trabajo
  WHERE tarea_id = aplicacion_tarea_id
    AND lote_id = NEW.lote_id
    AND fecha_trabajo = movimiento_fecha
    AND (
      (empleado_id = NEW.empleado_id AND NEW.empleado_id IS NOT NULL)
      OR
      (contratista_id = NEW.contratista_id AND NEW.contratista_id IS NOT NULL)
    );

  -- ═══ GUARDA NUEVA (149, hallazgo ESCO-70) ═════════════════════════════
  -- Suma TODO lo que esta persona ya tiene registrado ese día -- en
  -- CUALQUIER tarea/lote, no solo el de este movimiento -- más la fracción
  -- que se está por insertar. El DELETE de arriba ya quitó el posible
  -- duplicado exacto de este mismo tarea+lote, así que lo que queda es
  -- exactamente "el resto del día" para esta persona.
  v_persona_id := COALESCE(NEW.empleado_id, NEW.contratista_id);
  IF v_persona_id IS NOT NULL THEN
    SELECT COALESCE(SUM(fraccion_jornal::text::numeric), 0) INTO v_total_jornales
    FROM registros_trabajo
    WHERE fecha_trabajo = movimiento_fecha
      AND (
        (empleado_id = NEW.empleado_id AND NEW.empleado_id IS NOT NULL)
        OR
        (contratista_id = NEW.contratista_id AND NEW.contratista_id IS NOT NULL)
      );
    v_total_jornales := v_total_jornales + (fraccion_enum::text::numeric);
    IF v_total_jornales > 1.0001 THEN
      RAISE EXCEPTION 'No se puede registrar: esta persona quedaría con % jornales registrados el %, más de 1 jornal por día.', v_total_jornales, movimiento_fecha;
    END IF;
  END IF;

  -- Insert new record
  INSERT INTO registros_trabajo (
    tarea_id,
    empleado_id,
    contratista_id,
    lote_id,
    fecha_trabajo,
    fraccion_jornal,
    observaciones,
    valor_jornal_empleado,
    costo_jornal
  )
  VALUES (
    aplicacion_tarea_id,
    NEW.empleado_id,
    NEW.contratista_id,
    NEW.lote_id,
    movimiento_fecha,
    fraccion_enum,
    NEW.observaciones,
    NEW.valor_jornal_trabajador,
    NEW.costo_jornal
  );

  RETURN NEW;
END;
$function$;

DO $$
DECLARE
  v_def TEXT;
  v_searchp TEXT[];
  v_secdef BOOLEAN;
BEGIN
  SELECT pg_get_functiondef(p.oid), p.proconfig, p.prosecdef
    INTO v_def, v_searchp, v_secdef
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'auto_create_registro_trabajo_from_movimiento';

  IF v_def NOT ILIKE '%jornales registrados%' THEN
    RAISE EXCEPTION '149 ABORTADA (post): la guarda de exceso de jornal no quedó en el cuerpo vivo.';
  END IF;
  IF v_def NOT ILIKE '%1.0001%' THEN
    RAISE EXCEPTION '149 ABORTADA (post): falta la tolerancia de punto flotante en la comparación.';
  END IF;
  -- Lo heredado que no se puede perder en un CREATE OR REPLACE.
  IF v_def NOT ILIKE '%DELETE FROM registros_trabajo%' THEN
    RAISE EXCEPTION '149 ABORTADA (post): el DELETE de "handles duplicates" se perdió en este reemplazo.';
  END IF;
  IF v_def NOT ILIKE '%INSERT INTO registros_trabajo%' THEN
    RAISE EXCEPTION '149 ABORTADA (post): el INSERT original se perdió en este reemplazo.';
  END IF;
  IF v_secdef IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION '149 ABORTADA (post): la función quedó SECURITY DEFINER -- debía seguir SECURITY INVOKER.';
  END IF;
  IF NOT ('search_path=public, pg_temp' = ANY(COALESCE(v_searchp, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION '149 ABORTADA (post): el search_path pineado no sobrevivió al CREATE OR REPLACE. proconfig actual: %', v_searchp;
  END IF;

  RAISE NOTICE '149 OK: auto_create_registro_trabajo_from_movimiento bloquea sumas de más de 1.0 jornal por persona por día. 0 filas de dominio tocadas.';
END $$;

-- ROLLBACK (no ejecutar salvo instrucción explícita del dueño): restaurar
-- el cuerpo previo (md5 `d6b210ba4750126a885efb4341110ffe`) con un segundo
-- CREATE OR REPLACE FUNCTION reproduciendo ese cuerpo literal (es este
-- mismo archivo sin la sección "GUARDA NUEVA" y sin las variables
-- v_persona_id/v_total_jornales). Revertir esto reabre la puerta del
-- trigger a que una persona vuelva a sumar más de un jornal por día sin
-- que nada lo impida.
