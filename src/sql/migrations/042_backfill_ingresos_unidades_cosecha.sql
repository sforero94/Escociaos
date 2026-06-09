-- =====================================================================
-- 042: Backfill unidades y cosecha en fin_ingresos (issue #45)
--
-- Contexto: cantidad/precio_unitario/cosecha estaban NULL en todas las
-- filas de fin_ingresos. La cantidad real vive en el campo `nombre`:
--   - Aguacate Hass: nombre = kilos vendidos ("1540" = 1540 kg)
--   - Hato Lechero:  nombre = litros con sufijo L ("12702 L")
--
-- Cosechas de aguacate (definidas por el usuario):
--   - Principal: nov-feb, etiquetada con el año de nov/dic
--     (nov 2024 - feb 2025 = "Principal 2024")
--   - Traviesa: may-ago
--   - Meses de cola de venta (mar-abr, sep-oct) se asignan a la
--     cosecha precedente (mar-abr -> Principal, sep-oct -> Traviesa)
-- =====================================================================

-- 1. Función para derivar la cosecha de aguacate desde la fecha
CREATE OR REPLACE FUNCTION fn_cosecha_aguacate(p_fecha date)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM p_fecha) IN (11, 12)
      THEN 'Principal ' || EXTRACT(YEAR FROM p_fecha)::int
    WHEN EXTRACT(MONTH FROM p_fecha) BETWEEN 1 AND 4
      THEN 'Principal ' || (EXTRACT(YEAR FROM p_fecha)::int - 1)
    ELSE 'Traviesa ' || EXTRACT(YEAR FROM p_fecha)::int
  END;
$$;

-- 2. Backfill Aguacate Hass: cantidad (kg) y precio_unitario ($/kg)
WITH parsed AS (
  SELECT i.id, TRIM(REPLACE(i.nombre, ',', '.'))::numeric AS kg
  FROM fin_ingresos i
  JOIN fin_negocios n ON n.id = i.negocio_id
  WHERE n.nombre = 'Aguacate Hass'
    AND i.cantidad IS NULL
    AND i.nombre ~ '^\s*[0-9]+([.,][0-9]+)?\s*$'
)
UPDATE fin_ingresos i
SET cantidad = p.kg,
    precio_unitario = CASE WHEN p.kg > 0 THEN ROUND(i.valor / p.kg, 2) END
FROM parsed p
WHERE i.id = p.id;

-- 3. Backfill Aguacate Hass: cosecha derivada de la fecha
UPDATE fin_ingresos i
SET cosecha = fn_cosecha_aguacate(i.fecha)
FROM fin_negocios n
WHERE n.id = i.negocio_id
  AND n.nombre = 'Aguacate Hass'
  AND i.cosecha IS NULL;

-- 4. Backfill Hato Lechero: cantidad (litros) y precio_unitario ($/L)
--    Solo filas con patrón "NNNN L" (las de leche); terneros/otros quedan NULL
WITH parsed AS (
  SELECT i.id,
         TRIM(REPLACE(REGEXP_REPLACE(i.nombre, '\s*[Ll]\s*$', ''), ',', '.'))::numeric AS litros
  FROM fin_ingresos i
  JOIN fin_negocios n ON n.id = i.negocio_id
  WHERE n.nombre = 'Hato Lechero'
    AND i.cantidad IS NULL
    AND i.nombre ~* '^\s*[0-9]+([.,][0-9]+)?\s*L\s*$'
)
UPDATE fin_ingresos i
SET cantidad = p.litros,
    precio_unitario = CASE WHEN p.litros > 0 THEN ROUND(i.valor / p.litros, 2) END
FROM parsed p
WHERE i.id = p.id;

-- 5. Trigger: ingresos de aguacate nuevos quedan ligados a su cosecha
--    automáticamente cuando no se especifica una.
--    SECURITY DEFINER para leer fin_negocios sin depender del RLS del rol.
CREATE OR REPLACE FUNCTION set_cosecha_aguacate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_aguacate_id uuid;
BEGIN
  IF NEW.cosecha IS NOT NULL OR NEW.fecha IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_aguacate_id
  FROM fin_negocios
  WHERE nombre = 'Aguacate Hass'
  LIMIT 1;
  IF v_aguacate_id IS NOT NULL AND NEW.negocio_id = v_aguacate_id THEN
    NEW.cosecha := fn_cosecha_aguacate(NEW.fecha);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_cosecha_aguacate ON fin_ingresos;
CREATE TRIGGER trg_set_cosecha_aguacate
  BEFORE INSERT ON fin_ingresos
  FOR EACH ROW
  EXECUTE FUNCTION set_cosecha_aguacate();
