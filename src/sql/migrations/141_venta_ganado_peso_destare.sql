-- =====================================================================
-- 141: Peso de báscula y destare en fin_transacciones_ganado (issue #215)
--
-- SIN APLICAR. Additive. Filas afectadas: cero. No hay backfill.
--
-- POR QUÉ
-- -------
-- Una venta de ceba mezcla dos pesos que hasta hoy cabían en un solo
-- campo (`kilos_pagados`): el de báscula (inventario / kg producidos) y
-- el neto pagado (báscula menos destare, 10 o 15 kg/cabeza típicos).
-- El destare no se capturaba y el potrero de origen tampoco: el trigger
-- 044/059 crea un `gan_movimientos` pendiente SIN potrero, y la
-- confirmación queda para después. Esta migración solo agrega las
-- columnas de peso; el potrero se exige en el formulario y se aplica
-- con el RPC ya existente `fn_ganado_confirmar_pendiente_multi` (097).
--
-- COLUMNAS
-- --------
--   peso_total_kg      — báscula. NULL en filas viejas hasta que se editen.
--   destare_kg_cabeza  — kg/cabeza. NULL = no se capturó (no se inventa 10).
--   kilos_pagados      — SIN CAMBIO DE SIGNIFICADO: es el neto pagado
--                        (peso_total − destare_kg_cabeza × N). Las filas
--                        históricas ya guardaban el neto (o el único
--                        peso que había) en esta columna.
--
-- TRIGGER
-- -------
-- `fn_crear_movimiento_pendiente_ganado` (044, reemplazado por 059 con
-- la guarda `es_hato`) deriva `peso_promedio_kg` del pendiente. Antes
-- usaba kilos_pagados / cabezas (neto). Ahora prefiere peso_total_kg
-- (producción) y cae a kilos_pagados si peso_total es NULL — las
-- compras y las ventas viejas no cambian. La guarda `es_hato` se
-- conserva verbatim: una vaca lechera no genera pendiente de ceba.
--
-- Nunca se edita 044 ni 059. CREATE OR REPLACE + search_path pineado
-- `public, pg_temp` (082) + EXECUTE revocado a anon/authenticated
-- (función de trigger; el disparo no consulta EXECUTE, precedente 082).
--
-- QUÉ NO HACE
-- -----------
-- No toca compras, Telegram, el hato lechero, ni rellena historia.
-- No crea un segundo pipeline de inventario: el pendiente sigue
-- naciendo del INSERT y se confirma con el RPC de 097.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columnas
-- ---------------------------------------------------------------------

ALTER TABLE fin_transacciones_ganado
  ADD COLUMN IF NOT EXISTS peso_total_kg NUMERIC;

ALTER TABLE fin_transacciones_ganado
  ADD COLUMN IF NOT EXISTS destare_kg_cabeza NUMERIC;

ALTER TABLE fin_transacciones_ganado
  DROP CONSTRAINT IF EXISTS fin_transacciones_ganado_peso_total_kg_check;
ALTER TABLE fin_transacciones_ganado
  ADD CONSTRAINT fin_transacciones_ganado_peso_total_kg_check
  CHECK (peso_total_kg IS NULL OR peso_total_kg >= 0);

ALTER TABLE fin_transacciones_ganado
  DROP CONSTRAINT IF EXISTS fin_transacciones_ganado_destare_kg_cabeza_check;
ALTER TABLE fin_transacciones_ganado
  ADD CONSTRAINT fin_transacciones_ganado_destare_kg_cabeza_check
  CHECK (destare_kg_cabeza IS NULL OR destare_kg_cabeza >= 0);

ALTER TABLE fin_transacciones_ganado
  DROP CONSTRAINT IF EXISTS fin_transacciones_ganado_destare_vs_peso_check;
ALTER TABLE fin_transacciones_ganado
  ADD CONSTRAINT fin_transacciones_ganado_destare_vs_peso_check
  CHECK (
    peso_total_kg IS NULL
    OR destare_kg_cabeza IS NULL
    OR destare_kg_cabeza * cantidad_cabezas <= peso_total_kg
  );

COMMENT ON COLUMN fin_transacciones_ganado.peso_total_kg IS
  'Peso de báscula (kg producidos / inventario). NULL en filas anteriores a la 141.';
COMMENT ON COLUMN fin_transacciones_ganado.destare_kg_cabeza IS
  'Destare kg por cabeza. NULL = no capturado; no hay default 10 ni 15.';
COMMENT ON COLUMN fin_transacciones_ganado.kilos_pagados IS
  'Peso neto pagado: peso_total_kg − destare_kg_cabeza × cantidad_cabezas. Las filas anteriores a la 141 ya guardaban este valor (o el único peso que había).';

-- ---------------------------------------------------------------------
-- 2. Trigger: pendiente de ceba — peso promedio desde báscula
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_crear_movimiento_pendiente_ganado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
    CASE
      WHEN NEW.peso_total_kg IS NOT NULL AND NEW.cantidad_cabezas > 0
        THEN ROUND(NEW.peso_total_kg / NEW.cantidad_cabezas, 1)
      WHEN NEW.kilos_pagados IS NOT NULL AND NEW.cantidad_cabezas > 0
        THEN ROUND(NEW.kilos_pagados / NEW.cantidad_cabezas, 1)
      ELSE NULL
    END,
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

REVOKE EXECUTE ON FUNCTION fn_crear_movimiento_pendiente_ganado() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_crear_movimiento_pendiente_ganado ON fin_transacciones_ganado;
CREATE TRIGGER trg_crear_movimiento_pendiente_ganado
  AFTER INSERT ON fin_transacciones_ganado
  FOR EACH ROW
  EXECUTE FUNCTION fn_crear_movimiento_pendiente_ganado();

-- ---------------------------------------------------------------------
-- 3. Guardas
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_peso boolean;
  v_destare boolean;
  v_cuerpo text;
  v_prosecdef boolean;
  v_config text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fin_transacciones_ganado'
      AND column_name = 'peso_total_kg'
  ) INTO v_peso;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'fin_transacciones_ganado'
      AND column_name = 'destare_kg_cabeza'
  ) INTO v_destare;
  IF NOT v_peso OR NOT v_destare THEN
    RAISE EXCEPTION '141 ABORTADA: faltan peso_total_kg o destare_kg_cabeza.';
  END IF;

  SELECT pg_get_functiondef(p.oid), p.prosecdef, array_to_string(p.proconfig, ',')
  INTO v_cuerpo, v_prosecdef, v_config
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_crear_movimiento_pendiente_ganado';

  IF v_cuerpo IS NULL THEN
    RAISE EXCEPTION '141 ABORTADA: fn_crear_movimiento_pendiente_ganado desapareció.';
  END IF;
  IF v_cuerpo !~ 'es_hato' THEN
    RAISE EXCEPTION '141 ABORTADA: la guarda es_hato no está en el cuerpo del trigger.';
  END IF;
  IF v_cuerpo !~ 'peso_total_kg' THEN
    RAISE EXCEPTION '141 ABORTADA: el trigger no lee peso_total_kg para el peso promedio.';
  END IF;
  IF NOT v_prosecdef THEN
    RAISE EXCEPTION '141 ABORTADA: fn_crear_movimiento_pendiente_ganado dejó de ser SECURITY DEFINER.';
  END IF;
  IF v_config IS NULL OR v_config NOT LIKE '%pg_temp%' THEN
    RAISE EXCEPTION '141 ABORTADA: search_path no incluye pg_temp (precedente 082).';
  END IF;

  RAISE NOTICE '141 OK: columnas additive, trigger con es_hato y peso_total_kg, 0 filas tocadas.';
END $$;
