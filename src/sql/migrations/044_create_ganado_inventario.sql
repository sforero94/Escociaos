-- =====================================================================
-- 044: Inventario de ganado por ubicación → finca → potrero (issue #51)
--
-- Tablas nuevas:
--   gan_ubicaciones      — San Francisco / Supata / Subachoque
--   gan_fincas           — fincas con hectáreas, FK a ubicación
--   gan_potreros         — potreros por finca
--   gan_inventario       — snapshot actual por potrero (novillos/toros)
--   gan_movimientos      — fuente de verdad de eventos (compra/venta/
--                          muerte/traslado/ajuste) con flujo de
--                          confirmación pendiente
--   gan_pesos_historico  — registros de pesaje (UI diferida)
--
-- Integración con fin_transacciones_ganado:
--   - Trigger AFTER INSERT crea un gan_movimiento 'pendiente' vinculado
--     (transaccion_ganado_id). El usuario lo confirma desde /ganado
--     asignando potrero y split novillos/toros.
--   - Índice único parcial bloquea doble confirmación por transacción.
--
-- RLS: SELECT para todos los autenticados; escritura para
--      Administrador y Gerencia (finanzas es Gerencia-only, e
--      inventario operativo lo maneja Administrador).
--
-- Idempotente: seguro de re-ejecutar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS gan_ubicaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gan_fincas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  ubicacion_id UUID REFERENCES gan_ubicaciones(id),
  hectareas NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (hectareas >= 0),
  activa BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unicidad case-insensitive del nombre (el campo finca en
-- fin_transacciones_ganado era texto libre con casing inconsistente)
CREATE UNIQUE INDEX IF NOT EXISTS gan_fincas_nombre_unique
  ON gan_fincas (lower(nombre));

CREATE TABLE IF NOT EXISTS gan_potreros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  finca_id UUID NOT NULL REFERENCES gan_fincas(id),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (finca_id, nombre)
);

CREATE TABLE IF NOT EXISTS gan_inventario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  potrero_id UUID NOT NULL UNIQUE REFERENCES gan_potreros(id),
  novillos INTEGER NOT NULL DEFAULT 0 CHECK (novillos >= 0),
  toros INTEGER NOT NULL DEFAULT 0 CHECK (toros >= 0),
  peso_promedio_kg NUMERIC(7,1),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gan_movimientos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('compra', 'venta', 'muerte', 'traslado_entrada', 'traslado_salida', 'ajuste')),
  estado TEXT NOT NULL DEFAULT 'confirmado' CHECK (estado IN ('pendiente', 'confirmado', 'descartado')),
  fecha DATE NOT NULL,
  potrero_origen_id UUID REFERENCES gan_potreros(id),
  potrero_destino_id UUID REFERENCES gan_potreros(id),
  novillos_delta INTEGER NOT NULL DEFAULT 0,
  toros_delta INTEGER NOT NULL DEFAULT 0,
  peso_promedio_kg NUMERIC(7,1),
  transaccion_ganado_id UUID REFERENCES fin_transacciones_ganado(id) ON DELETE SET NULL,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_gan_movimientos_fecha ON gan_movimientos(fecha);
CREATE INDEX IF NOT EXISTS idx_gan_movimientos_estado ON gan_movimientos(estado);
CREATE INDEX IF NOT EXISTS idx_gan_movimientos_tipo ON gan_movimientos(tipo);

-- Anti doble conteo: una transacción de finanzas solo puede tener
-- un movimiento confirmado y un pendiente a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS gan_movimientos_transaccion_confirmado_unique
  ON gan_movimientos (transaccion_ganado_id)
  WHERE estado = 'confirmado' AND transaccion_ganado_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS gan_movimientos_transaccion_pendiente_unique
  ON gan_movimientos (transaccion_ganado_id)
  WHERE estado = 'pendiente' AND transaccion_ganado_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS gan_pesos_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  potrero_id UUID NOT NULL REFERENCES gan_potreros(id),
  fecha DATE NOT NULL,
  peso_promedio_kg NUMERIC(7,1) NOT NULL,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gan_pesos_historico_potrero ON gan_pesos_historico(potrero_id, fecha);

-- ---------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['gan_ubicaciones', 'gan_fincas', 'gan_potreros', 'gan_inventario', 'gan_movimientos', 'gan_pesos_historico']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_select_authenticated" ON %I', t, t);
    EXECUTE format($pol$
      CREATE POLICY "%s_select_authenticated" ON %I
        FOR SELECT TO authenticated
        USING (TRUE)
    $pol$, t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_write_admin_gerencia" ON %I', t, t);
    EXECUTE format($pol$
      CREATE POLICY "%s_write_admin_gerencia" ON %I
        FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM usuarios u
            WHERE u.id = auth.uid()
            AND u.rol IN ('Administrador'::rol_usuario, 'Gerencia'::rol_usuario)
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM usuarios u
            WHERE u.id = auth.uid()
            AND u.rol IN ('Administrador'::rol_usuario, 'Gerencia'::rol_usuario)
          )
        )
    $pol$, t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 3. Trigger: aplicar movimientos confirmados al inventario
--    SECURITY DEFINER: el trigger de finanzas (Gerencia) y el flujo de
--    confirmación (Administrador) cruzan tablas de ambos dominios.
-- ---------------------------------------------------------------------

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

    INSERT INTO gan_inventario (potrero_id, novillos, toros, peso_promedio_kg)
    VALUES (v_potrero, NEW.novillos_delta, NEW.toros_delta, NEW.peso_promedio_kg)
    ON CONFLICT (potrero_id) DO UPDATE SET
      novillos = gan_inventario.novillos + EXCLUDED.novillos,
      toros = gan_inventario.toros + EXCLUDED.toros,
      peso_promedio_kg = COALESCE(EXCLUDED.peso_promedio_kg, gan_inventario.peso_promedio_kg),
      updated_at = NOW();

    IF NEW.peso_promedio_kg IS NOT NULL THEN
      INSERT INTO gan_pesos_historico (potrero_id, fecha, peso_promedio_kg, notas)
      VALUES (v_potrero, NEW.fecha, NEW.peso_promedio_kg, NEW.notas);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aplicar_movimiento_ganado ON gan_movimientos;
CREATE TRIGGER trg_aplicar_movimiento_ganado
  AFTER INSERT OR UPDATE ON gan_movimientos
  FOR EACH ROW
  EXECUTE FUNCTION fn_aplicar_movimiento_ganado();

-- ---------------------------------------------------------------------
-- 4. Trigger: transacción de finanzas → movimiento pendiente
--    El delta se precarga como novillos (el split real se asigna al
--    confirmar). Venta resta, compra suma. El peso promedio se deriva
--    de kilos_pagados / cabezas cuando está disponible.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_crear_movimiento_pendiente_ganado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

DROP TRIGGER IF EXISTS trg_crear_movimiento_pendiente_ganado ON fin_transacciones_ganado;
CREATE TRIGGER trg_crear_movimiento_pendiente_ganado
  AFTER INSERT ON fin_transacciones_ganado
  FOR EACH ROW
  EXECUTE FUNCTION fn_crear_movimiento_pendiente_ganado();

-- ---------------------------------------------------------------------
-- 5. Seed: ubicaciones + fincas desde transacciones existentes
--    (hectáreas en 0 — se completan desde /configuracion).
--    Las transacciones históricas NO generan movimientos pendientes:
--    el trigger solo aplica a inserciones nuevas.
-- ---------------------------------------------------------------------

INSERT INTO gan_ubicaciones (nombre)
VALUES ('San Francisco'), ('Supata'), ('Subachoque')
ON CONFLICT (nombre) DO NOTHING;

INSERT INTO gan_fincas (nombre, ubicacion_id, hectareas)
SELECT DISTINCT ON (lower(trim(t.finca)))
  trim(t.finca),
  u.id,
  0
FROM fin_transacciones_ganado t
LEFT JOIN gan_ubicaciones u ON lower(u.nombre) = lower(trim(t.finca))
WHERE t.finca IS NOT NULL AND trim(t.finca) <> ''
ORDER BY lower(trim(t.finca)), t.created_at
ON CONFLICT ((lower(nombre))) DO NOTHING;
