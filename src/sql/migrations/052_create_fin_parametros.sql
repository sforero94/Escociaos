-- Migration 052: parámetros financieros configurables
--
-- Tabla genérica clave/valor para los inputs contables que el sistema NO puede
-- derivar de sus propios datos y que el dueño debe poseer. Resuelve dos
-- necesidades de /finanzas/reportes con una sola migración:
--
--   1. cabezas_inventario_inicial + costo_cabeza_inventario_inicial
--      `fin_transacciones_ganado` registra 571 cabezas compradas y 801
--      vendidas (2023-01 a 2026-07): existía ganado ANTES del primer registro.
--      Sin un costo para esas cabezas, el costo de venta queda subestimado y
--      el margen inflado. Mientras no se cargue, el motor usa como estimado el
--      promedio ponderado de las compras registradas y lo ADVIERTE en pantalla.
--      No hay parámetro de fecha de corte: el inventario inicial es, por
--      definición, lo que existía ANTES de la primera transacción registrada.
--
--   2. saldo_inicial_caja
--      Mientras no exista, el flujo de caja rotula su última fila como
--      "Flujo acumulado del período" (no "Saldo de caja"), porque un saldo que
--      arranca en cero cada enero invita a conciliarlo contra el banco y
--      siempre estaría mal.
--
-- Idempotente: safe to re-run.

CREATE TABLE IF NOT EXISTS fin_parametros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clave TEXT NOT NULL,
  anio INTEGER,                                  -- NULL = aplica a todos los años
  negocio_id UUID REFERENCES fin_negocios(id),   -- NULL = consolidado
  valor NUMERIC(15,2) NOT NULL,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- COALESCE en el índice porque en Postgres NULL != NULL: sin esto, dos filas
-- con el mismo `clave` y `anio IS NULL` no chocarían y habría parámetros
-- duplicados silenciosos.
CREATE UNIQUE INDEX IF NOT EXISTS fin_parametros_clave_unique
  ON fin_parametros (
    clave,
    COALESCE(anio, -1),
    COALESCE(negocio_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_fin_parametros_clave ON fin_parametros(clave);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Mismo patrón que el resto de tablas fin_*: Gerencia-only vía la función
-- es_usuario_gerencia(), que ya usan fin_gastos, fin_ingresos y los catálogos.

ALTER TABLE fin_parametros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fin_parametros_select ON fin_parametros;
CREATE POLICY fin_parametros_select ON fin_parametros
  FOR SELECT TO authenticated USING (es_usuario_gerencia());

DROP POLICY IF EXISTS fin_parametros_insert ON fin_parametros;
CREATE POLICY fin_parametros_insert ON fin_parametros
  FOR INSERT TO authenticated WITH CHECK (es_usuario_gerencia());

DROP POLICY IF EXISTS fin_parametros_update ON fin_parametros;
CREATE POLICY fin_parametros_update ON fin_parametros
  FOR UPDATE TO authenticated USING (es_usuario_gerencia());

DROP POLICY IF EXISTS fin_parametros_delete ON fin_parametros;
CREATE POLICY fin_parametros_delete ON fin_parametros
  FOR DELETE TO authenticated USING (es_usuario_gerencia());

COMMENT ON TABLE fin_parametros IS
  'Inputs contables que el sistema no puede derivar de sus datos. Claves: cabezas_inventario_inicial, costo_cabeza_inventario_inicial, saldo_inicial_caja.';
