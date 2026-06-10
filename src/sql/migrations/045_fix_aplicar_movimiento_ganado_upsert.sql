-- =====================================================================
-- 045: Fix de fn_aplicar_movimiento_ganado() (issue #51)
--
-- Bug en 044: el upsert usaba INSERT ... ON CONFLICT DO UPDATE, pero
-- Postgres valida los CHECK constraints sobre la fila propuesta ANTES
-- de resolver el conflicto. Cualquier movimiento con delta negativo
-- (venta, muerte, traslado_salida, ajuste negativo) fallaba con
-- check_violation aunque el potrero tuviera inventario suficiente.
--
-- Fix: UPDATE primero; INSERT solo si el potrero no tiene fila de
-- inventario. El CHECK (novillos/toros >= 0) sigue protegiendo contra
-- inventario negativo en ambos caminos.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_aplicar_movimiento_ganado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_potrero UUID;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.estado = 'confirmado')
     OR (TG_OP = 'UPDATE' AND OLD.estado = 'pendiente' AND NEW.estado = 'confirmado') THEN

    v_potrero := COALESCE(NEW.potrero_destino_id, NEW.potrero_origen_id);
    IF v_potrero IS NULL THEN
      RAISE EXCEPTION 'Movimiento confirmado sin potrero asignado';
    END IF;

    UPDATE gan_inventario SET
      novillos = novillos + NEW.novillos_delta,
      toros = toros + NEW.toros_delta,
      peso_promedio_kg = COALESCE(NEW.peso_promedio_kg, peso_promedio_kg),
      updated_at = NOW()
    WHERE potrero_id = v_potrero;

    IF NOT FOUND THEN
      INSERT INTO gan_inventario (potrero_id, novillos, toros, peso_promedio_kg)
      VALUES (v_potrero, NEW.novillos_delta, NEW.toros_delta, NEW.peso_promedio_kg);
    END IF;

    IF NEW.peso_promedio_kg IS NOT NULL THEN
      INSERT INTO gan_pesos_historico (potrero_id, fecha, peso_promedio_kg, notas)
      VALUES (v_potrero, NEW.fecha, NEW.peso_promedio_kg, NEW.notas);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
