-- =====================================================================
-- 059: Vínculo fin_transacciones_ganado ↔ hato (es_hato / hato_animal_id)
-- Fecha: 2026-07-22
--
-- Parte del PR único de S1 (hato) — plan docs/plan_hato_lechero_module.md
-- §7.1–7.2, renumerado 050→053…057→060 (ver brief S1, Decisión 1).
--
-- No se modifica 023 ni 044 (regla dura del repo: nunca tocar una
-- migración ya aplicada). Este archivo hace todo por ALTER TABLE /
-- CREATE OR REPLACE FUNCTION.
--
-- Problema que resuelve: el trigger 044 fn_crear_movimiento_pendiente_ganado
-- dispara con CADA insert en fin_transacciones_ganado, generando un
-- pendiente de ceba (gan_movimientos) espurio cuando se vende/compra una
-- vaca lechera — el inventario del hato vive en hato_animales, no en
-- gan_inventario (§7.2).
--
-- (a) Columnas nuevas: es_hato (guarda del trigger) + hato_animal_id
--     (vínculo con la ficha individual). ON DELETE SET NULL: un animal
--     nunca se elimina (Épica A), pero SET NULL replica el precedente de
--     044 para transaccion_ganado_id y es el default seguro.
--
-- (b) fn_crear_movimiento_pendiente_ganado(): se reproduce el cuerpo
--     ACTUAL de 044 verbatim (confirmado: 045 solo reemplazó
--     fn_aplicar_movimiento_ganado, no esta función), agregando la
--     guarda `IF NEW.es_hato THEN RETURN NEW` como primera sentencia.
--     SECURITY DEFINER SET search_path = public se mantiene (cruza
--     dominios ganado/finanzas, precedente 038/039/044).
--
-- (c) RLS: se agregan 4 políticas Administrador en paralelo a las 4
--     políticas Gerencia de 023 (RLS es permisiva — el efecto es OR).
--     Las 4 de 023 quedan intactas. Habilita que Martha (Administrador)
--     use TransaccionGanadoForm para marcar vendida/muerta desde la
--     ficha del hato (S9) — extensión aprobada en §7.2/§10 del plan.
--
-- Idempotente: seguro de re-ejecutar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (a) Columnas
-- ---------------------------------------------------------------------

ALTER TABLE fin_transacciones_ganado
  ADD COLUMN IF NOT EXISTS es_hato BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE fin_transacciones_ganado
  ADD COLUMN IF NOT EXISTS hato_animal_id UUID REFERENCES hato_animales(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- (b) Guarda en el trigger de finanzas → pendiente de ceba
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_crear_movimiento_pendiente_ganado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Las transacciones del hato lechero no generan pendientes de ceba:
  -- su inventario vive en hato_animales, no en gan_inventario.
  IF NEW.es_hato THEN
    RETURN NEW;
  END IF;

  INSERT INTO gan_movimientos (
    tipo, estado, fecha, novillos_delta, toros_delta, peso_promedio_kg,
    transaccion_ganado_id, notas, created_by
  )
  VALUES (
    NEW.tipo,
    'pendiente',
    NEW.fecha,
    CASE WHEN NEW.tipo = 'venta' THEN -NEW.cantidad_cabezas ELSE NEW.cantidad_cabezas END,
    0,
    CASE WHEN NEW.kilos_pagados IS NOT NULL AND NEW.cantidad_cabezas > 0
         THEN ROUND(NEW.kilos_pagados / NEW.cantidad_cabezas, 1) END,
    NEW.id,
    CONCAT(
      'Generado desde transacción de finanzas: ', NEW.tipo, ' de ',
      NEW.cantidad_cabezas, ' cabezas',
      CASE WHEN NEW.finca IS NOT NULL THEN ' (finca ' || NEW.finca || ')' ELSE '' END
    ),
    NEW.created_by
  );
  RETURN NEW;
END;
$$;

-- CREATE OR REPLACE FUNCTION ya reemplaza el cuerpo sin tocar el binding
-- del trigger de 044; se re-emite el binding solo por seguridad/idempotencia.
DROP TRIGGER IF EXISTS trg_crear_movimiento_pendiente_ganado ON fin_transacciones_ganado;
CREATE TRIGGER trg_crear_movimiento_pendiente_ganado
  AFTER INSERT ON fin_transacciones_ganado
  FOR EACH ROW
  EXECUTE FUNCTION fn_crear_movimiento_pendiente_ganado();

-- ---------------------------------------------------------------------
-- (c) RLS: extensión a Administrador (023 queda Gerencia-only, intacto)
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "fin_transacciones_ganado_select_admin" ON fin_transacciones_ganado;
CREATE POLICY "fin_transacciones_ganado_select_admin" ON fin_transacciones_ganado
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid()
                 AND u.rol = 'Administrador'::rol_usuario));

DROP POLICY IF EXISTS "fin_transacciones_ganado_insert_admin" ON fin_transacciones_ganado;
CREATE POLICY "fin_transacciones_ganado_insert_admin" ON fin_transacciones_ganado
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid()
                       AND u.rol = 'Administrador'::rol_usuario));

DROP POLICY IF EXISTS "fin_transacciones_ganado_update_admin" ON fin_transacciones_ganado;
CREATE POLICY "fin_transacciones_ganado_update_admin" ON fin_transacciones_ganado
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid()
                 AND u.rol = 'Administrador'::rol_usuario));

DROP POLICY IF EXISTS "fin_transacciones_ganado_delete_admin" ON fin_transacciones_ganado;
CREATE POLICY "fin_transacciones_ganado_delete_admin" ON fin_transacciones_ganado
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM usuarios u WHERE u.id = auth.uid()
                 AND u.rol = 'Administrador'::rol_usuario));
