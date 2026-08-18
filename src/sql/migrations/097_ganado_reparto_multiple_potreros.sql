-- =====================================================================
-- 097: Reparto de cabezas entre varios potreros
--
-- Motivación: al confirmar una compra/venta generada desde Finanzas, las
-- cabezas podían asignarse a UN solo potrero. En la práctica un lote
-- llega repartido (ej. 12 a Mochuelos Ceba y 12 a Quebradas). Lo mismo
-- al vender: las cabezas salen de varios potreros. El total sigue
-- teniendo que cerrar exactamente contra la transacción de finanzas.
--
-- Qué cambia:
--   1. Se elimina gan_movimientos_transaccion_confirmado_unique (044),
--      que permitía UN solo movimiento confirmado por transacción y por
--      lo tanto hacía imposible el reparto.
--   2. Se reemplaza por una invariante MÁS fuerte: la suma de cabezas de
--      los movimientos confirmados de una transacción nunca puede
--      superar las cabezas de esa transacción (trigger
--      fn_gan_validar_cabezas_transaccion). El índice viejo no miraba
--      totales; este sí — sigue bloqueando el doble conteo y además
--      bloquea el sobre-conteo por reparto.
--   3. RPC fn_ganado_confirmar_pendiente_multi: confirma el pendiente
--      repartido en N potreros en UNA transacción.
--   4. RPC fn_ganado_registrar_traslado_multi: traslado de N potreros
--      origen a M potreros destino, también atómico.
--
-- SECURITY INVOKER en ambos RPC (precedente migración 070): quien llama
-- es una sesión autenticada de Administrador/Gerencia que ya tiene RLS
-- de escritura sobre gan_movimientos; lo único que falta es atomicidad.
-- Un DEFINER saltaría RLS y obligaría a re-implementar el chequeo de rol.
--
-- El trigger de validación SÍ es SECURITY DEFINER: lee
-- fin_transacciones_ganado, que es Gerencia-only por RLS, y lo dispara
-- también un Administrador confirmando desde /ganado.
--
-- Idempotente: seguro de re-ejecutar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Fuera el índice que impedía el reparto
-- ---------------------------------------------------------------------

DROP INDEX IF EXISTS gan_movimientos_transaccion_confirmado_unique;

-- El índice de pendientes se queda: una transacción sigue generando
-- exactamente un movimiento pendiente a la vez.

-- ---------------------------------------------------------------------
-- 2. Invariante anti doble/sobre conteo
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_gan_validar_cabezas_transaccion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cabezas_tx INTEGER;
  v_cabezas_confirmadas INTEGER;
BEGIN
  IF NEW.transaccion_ganado_id IS NULL OR NEW.estado <> 'confirmado' THEN
    RETURN NEW;
  END IF;

  SELECT cantidad_cabezas INTO v_cabezas_tx
  FROM fin_transacciones_ganado
  WHERE id = NEW.transaccion_ganado_id;

  IF v_cabezas_tx IS NULL THEN
    RETURN NEW; -- transacción borrada: nada contra qué validar
  END IF;

  SELECT COALESCE(SUM(ABS(novillos_delta + toros_delta)), 0)
  INTO v_cabezas_confirmadas
  FROM gan_movimientos
  WHERE transaccion_ganado_id = NEW.transaccion_ganado_id
    AND estado = 'confirmado';

  IF v_cabezas_confirmadas > v_cabezas_tx THEN
    RAISE EXCEPTION
      'El reparto suma % cabezas y la transacción tiene % (gan_movimientos.transaccion_ganado_id = %)',
      v_cabezas_confirmadas, v_cabezas_tx, NEW.transaccion_ganado_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_gan_validar_cabezas_transaccion() FROM PUBLIC, anon, authenticated;

-- Un trigger dispara aunque el rol que escribe no tenga EXECUTE sobre su
-- función: Postgres verifica ese privilegio en CREATE TRIGGER, no en cada
-- disparo (precedente verificado en la migración 082, parte 2).
DROP TRIGGER IF EXISTS trg_gan_validar_cabezas_transaccion ON gan_movimientos;
CREATE TRIGGER trg_gan_validar_cabezas_transaccion
  AFTER INSERT OR UPDATE ON gan_movimientos
  FOR EACH ROW
  EXECUTE FUNCTION fn_gan_validar_cabezas_transaccion();

-- ---------------------------------------------------------------------
-- 3. RPC: confirmar un pendiente repartido en varios potreros
--
--    p_filas: [{"potrero_id": "uuid", "novillos": 12, "toros": 0}, ...]
--
--    La fila 1 se aplica sobre el movimiento pendiente (que pasa a
--    confirmado); las demás entran como movimientos hermanos ligados a
--    la misma transacción. Así el caso de un solo potrero se comporta
--    exactamente igual que antes de esta migración.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_ganado_confirmar_pendiente_multi(
  p_movimiento_id UUID,
  p_filas JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mov          gan_movimientos%ROWTYPE;
  v_cabezas      INTEGER;
  v_total        INTEGER;
  v_signo        INTEGER;
  v_es_venta     BOOLEAN;
  v_confirmadas  INTEGER;
  v_potreros     UUID[];
  v_fila         JSONB;
  v_primera      BOOLEAN := TRUE;
  v_n            INTEGER := 0;
  v_novillos     INTEGER;
  v_toros        INTEGER;
  v_potrero      UUID;
BEGIN
  SELECT * INTO v_mov FROM gan_movimientos WHERE id = p_movimiento_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El movimiento pendiente no existe';
  END IF;
  IF v_mov.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'El movimiento ya fue % — recargá la página', v_mov.estado;
  END IF;
  IF v_mov.tipo NOT IN ('compra', 'venta') THEN
    RAISE EXCEPTION 'Solo se confirman pendientes de compra o venta (tipo: %)', v_mov.tipo;
  END IF;

  v_es_venta := v_mov.tipo = 'venta';
  v_signo := CASE WHEN v_es_venta THEN -1 ELSE 1 END;
  -- El trigger de finanzas precarga el total con signo en novillos_delta
  v_cabezas := ABS(v_mov.novillos_delta + v_mov.toros_delta);

  IF v_mov.transaccion_ganado_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_confirmadas
    FROM gan_movimientos
    WHERE transaccion_ganado_id = v_mov.transaccion_ganado_id
      AND estado = 'confirmado';
    IF v_confirmadas > 0 THEN
      RAISE EXCEPTION 'Esta transacción ya tiene movimientos confirmados en inventario';
    END IF;
  END IF;

  IF p_filas IS NULL OR jsonb_typeof(p_filas) <> 'array' OR jsonb_array_length(p_filas) = 0 THEN
    RAISE EXCEPTION 'El reparto no tiene filas';
  END IF;

  -- Validación del reparto antes de escribir nada
  v_total := 0;
  v_potreros := ARRAY[]::UUID[];
  FOR v_fila IN SELECT * FROM jsonb_array_elements(p_filas) LOOP
    v_potrero  := (v_fila->>'potrero_id')::UUID;
    v_novillos := COALESCE((v_fila->>'novillos')::INTEGER, 0);
    v_toros    := COALESCE((v_fila->>'toros')::INTEGER, 0);

    IF v_potrero IS NULL THEN
      RAISE EXCEPTION 'Hay una fila del reparto sin potrero';
    END IF;
    IF v_novillos < 0 OR v_toros < 0 THEN
      RAISE EXCEPTION 'Novillos y toros no pueden ser negativos';
    END IF;
    IF v_novillos + v_toros = 0 THEN
      RAISE EXCEPTION 'Hay una fila del reparto en cero';
    END IF;
    IF v_potrero = ANY(v_potreros) THEN
      RAISE EXCEPTION 'El potrero % aparece dos veces en el reparto', v_potrero;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM gan_potreros WHERE id = v_potrero) THEN
      RAISE EXCEPTION 'El potrero % no existe', v_potrero;
    END IF;

    v_potreros := v_potreros || v_potrero;
    v_total := v_total + v_novillos + v_toros;
  END LOOP;

  IF v_total <> v_cabezas THEN
    RAISE EXCEPTION 'El reparto suma % cabezas y la transacción tiene %', v_total, v_cabezas;
  END IF;

  -- Escritura: primera fila sobre el pendiente, resto como hermanos
  FOR v_fila IN SELECT * FROM jsonb_array_elements(p_filas) LOOP
    v_potrero  := (v_fila->>'potrero_id')::UUID;
    v_novillos := COALESCE((v_fila->>'novillos')::INTEGER, 0);
    v_toros    := COALESCE((v_fila->>'toros')::INTEGER, 0);

    IF v_primera THEN
      UPDATE gan_movimientos SET
        estado = 'confirmado',
        -- venta sale de un potrero (origen), compra entra (destino)
        potrero_origen_id  = CASE WHEN v_es_venta THEN v_potrero ELSE NULL END,
        potrero_destino_id = CASE WHEN v_es_venta THEN NULL ELSE v_potrero END,
        novillos_delta = v_signo * v_novillos,
        toros_delta    = v_signo * v_toros
      WHERE id = p_movimiento_id AND estado = 'pendiente';
      v_primera := FALSE;
    ELSE
      INSERT INTO gan_movimientos (
        tipo, estado, fecha, potrero_origen_id, potrero_destino_id,
        novillos_delta, toros_delta, peso_promedio_kg,
        transaccion_ganado_id, notas
      ) VALUES (
        v_mov.tipo, 'confirmado', v_mov.fecha,
        CASE WHEN v_es_venta THEN v_potrero ELSE NULL END,
        CASE WHEN v_es_venta THEN NULL ELSE v_potrero END,
        v_signo * v_novillos, v_signo * v_toros, v_mov.peso_promedio_kg,
        v_mov.transaccion_ganado_id, v_mov.notas
      );
    END IF;

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_ganado_confirmar_pendiente_multi(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_ganado_confirmar_pendiente_multi(UUID, JSONB) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. RPC: traslado de N orígenes a M destinos, atómico
--
--    Los totales de novillos y de toros deben coincidir entre los dos
--    lados por separado (no se puede sacar novillos y meter toros).
--    Las salidas se insertan primero: si dejan un potrero en negativo,
--    el CHECK de gan_inventario aborta toda la transacción.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_ganado_registrar_traslado_multi(
  p_fecha DATE,
  p_origenes JSONB,
  p_destinos JSONB,
  p_peso_promedio_kg NUMERIC DEFAULT NULL,
  p_notas TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_novillos_origen  INTEGER := 0;
  v_toros_origen     INTEGER := 0;
  v_novillos_destino INTEGER := 0;
  v_toros_destino    INTEGER := 0;
  v_potreros_origen  UUID[] := ARRAY[]::UUID[];
  v_potreros_destino UUID[] := ARRAY[]::UUID[];
  v_fila             JSONB;
  v_potrero          UUID;
  v_novillos         INTEGER;
  v_toros            INTEGER;
  v_n                INTEGER := 0;
BEGIN
  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'La fecha es requerida';
  END IF;
  IF p_origenes IS NULL OR jsonb_typeof(p_origenes) <> 'array' OR jsonb_array_length(p_origenes) = 0 THEN
    RAISE EXCEPTION 'El traslado no tiene potreros de origen';
  END IF;
  IF p_destinos IS NULL OR jsonb_typeof(p_destinos) <> 'array' OR jsonb_array_length(p_destinos) = 0 THEN
    RAISE EXCEPTION 'El traslado no tiene potreros de destino';
  END IF;

  FOR v_fila IN SELECT * FROM jsonb_array_elements(p_origenes) LOOP
    v_potrero  := (v_fila->>'potrero_id')::UUID;
    v_novillos := COALESCE((v_fila->>'novillos')::INTEGER, 0);
    v_toros    := COALESCE((v_fila->>'toros')::INTEGER, 0);
    IF v_potrero IS NULL THEN RAISE EXCEPTION 'Hay un origen sin potrero'; END IF;
    IF v_novillos < 0 OR v_toros < 0 THEN RAISE EXCEPTION 'Las cantidades no pueden ser negativas'; END IF;
    IF v_novillos + v_toros = 0 THEN RAISE EXCEPTION 'Hay un origen en cero'; END IF;
    IF v_potrero = ANY(v_potreros_origen) THEN RAISE EXCEPTION 'Hay un potrero de origen repetido'; END IF;
    v_potreros_origen := v_potreros_origen || v_potrero;
    v_novillos_origen := v_novillos_origen + v_novillos;
    v_toros_origen := v_toros_origen + v_toros;
  END LOOP;

  FOR v_fila IN SELECT * FROM jsonb_array_elements(p_destinos) LOOP
    v_potrero  := (v_fila->>'potrero_id')::UUID;
    v_novillos := COALESCE((v_fila->>'novillos')::INTEGER, 0);
    v_toros    := COALESCE((v_fila->>'toros')::INTEGER, 0);
    IF v_potrero IS NULL THEN RAISE EXCEPTION 'Hay un destino sin potrero'; END IF;
    IF v_novillos < 0 OR v_toros < 0 THEN RAISE EXCEPTION 'Las cantidades no pueden ser negativas'; END IF;
    IF v_novillos + v_toros = 0 THEN RAISE EXCEPTION 'Hay un destino en cero'; END IF;
    IF v_potrero = ANY(v_potreros_destino) THEN RAISE EXCEPTION 'Hay un potrero de destino repetido'; END IF;
    IF v_potrero = ANY(v_potreros_origen) THEN
      RAISE EXCEPTION 'Un mismo potrero no puede ser origen y destino del traslado';
    END IF;
    v_potreros_destino := v_potreros_destino || v_potrero;
    v_novillos_destino := v_novillos_destino + v_novillos;
    v_toros_destino := v_toros_destino + v_toros;
  END LOOP;

  IF v_novillos_origen <> v_novillos_destino OR v_toros_origen <> v_toros_destino THEN
    RAISE EXCEPTION
      'El traslado no cierra: salen % novillos y % toros, entran % novillos y % toros',
      v_novillos_origen, v_toros_origen, v_novillos_destino, v_toros_destino;
  END IF;

  FOR v_fila IN SELECT * FROM jsonb_array_elements(p_origenes) LOOP
    INSERT INTO gan_movimientos (
      tipo, estado, fecha, potrero_origen_id, novillos_delta, toros_delta, notas
    ) VALUES (
      'traslado_salida', 'confirmado', p_fecha,
      (v_fila->>'potrero_id')::UUID,
      -COALESCE((v_fila->>'novillos')::INTEGER, 0),
      -COALESCE((v_fila->>'toros')::INTEGER, 0),
      p_notas
    );
    v_n := v_n + 1;
  END LOOP;

  FOR v_fila IN SELECT * FROM jsonb_array_elements(p_destinos) LOOP
    INSERT INTO gan_movimientos (
      tipo, estado, fecha, potrero_destino_id, novillos_delta, toros_delta,
      peso_promedio_kg, notas
    ) VALUES (
      'traslado_entrada', 'confirmado', p_fecha,
      (v_fila->>'potrero_id')::UUID,
      COALESCE((v_fila->>'novillos')::INTEGER, 0),
      COALESCE((v_fila->>'toros')::INTEGER, 0),
      p_peso_promedio_kg, p_notas
    );
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_ganado_registrar_traslado_multi(DATE, JSONB, JSONB, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_ganado_registrar_traslado_multi(DATE, JSONB, JSONB, NUMERIC, TEXT) TO authenticated;

COMMENT ON FUNCTION fn_ganado_confirmar_pendiente_multi(UUID, JSONB) IS
  'Confirma un movimiento pendiente de compra/venta repartiendo las cabezas entre varios potreros, en una sola transacción. El total debe cerrar contra las cabezas del pendiente.';
COMMENT ON FUNCTION fn_ganado_registrar_traslado_multi(DATE, JSONB, JSONB, NUMERIC, TEXT) IS
  'Registra un traslado de N potreros origen a M potreros destino en una sola transacción. Los totales de novillos y toros deben coincidir entre ambos lados.';
