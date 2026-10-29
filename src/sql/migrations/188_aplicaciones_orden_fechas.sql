-- Draft only. No historical data rewrite or permission change.
-- Validate each pair on INSERT or when that pair changes. Unrelated updates
-- can still operate on legacy bad rows until an owner-approved cleanup.
BEGIN;
CREATE OR REPLACE FUNCTION public.validar_orden_fechas_aplicacion()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' OR
     NEW.fecha_inicio_planeada IS DISTINCT FROM OLD.fecha_inicio_planeada OR
     NEW.fecha_fin_planeada IS DISTINCT FROM OLD.fecha_fin_planeada THEN
    IF NEW.fecha_inicio_planeada > NEW.fecha_fin_planeada THEN
      RAISE EXCEPTION 'Fechas planeadas: el inicio no puede ser posterior al final' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR
     NEW.fecha_inicio_ejecucion IS DISTINCT FROM OLD.fecha_inicio_ejecucion OR
     NEW.fecha_fin_ejecucion IS DISTINCT FROM OLD.fecha_fin_ejecucion THEN
    IF NEW.fecha_inicio_ejecucion > NEW.fecha_fin_ejecucion THEN
      RAISE EXCEPTION 'Fechas reales: el inicio no puede ser posterior al final' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER validar_orden_fechas_aplicacion
BEFORE INSERT OR UPDATE OF fecha_inicio_planeada, fecha_fin_planeada, fecha_inicio_ejecucion, fecha_fin_ejecucion
ON public.aplicaciones FOR EACH ROW EXECUTE FUNCTION public.validar_orden_fechas_aplicacion();
COMMIT;
