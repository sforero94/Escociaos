-- =====================================================
-- CONFIGURACIÓN COMPLETA PARA VERIFICACIÓN FÍSICA DE INVENTARIO
-- =====================================================
-- Este script crea todas las tablas, vistas, triggers y políticas
-- necesarias para el módulo de Verificación Física de Inventario
-- =====================================================

-- =====================================================
-- 1. ASEGURAR QUE LA TABLA PRODUCTOS TIENE EL CAMPO ACTIVO
-- =====================================================

-- Si la tabla productos ya existe pero no tiene el campo 'activo', agregarlo
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'productos' AND column_name = 'activo'
    ) THEN
        ALTER TABLE productos ADD COLUMN activo BOOLEAN DEFAULT true;
    END IF;
END $$;

-- =====================================================
-- 2. TABLA: verificaciones_inventario
-- =====================================================
-- Almacena el registro principal de cada verificación física

CREATE TABLE IF NOT EXISTS verificaciones_inventario (
  id SERIAL PRIMARY KEY,
  fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_fin DATE,
  estado TEXT NOT NULL DEFAULT 'En proceso',
    -- Valores posibles: 'En proceso', 'Completada', 'Pendiente Aprobación', 'Aprobada', 'Rechazada'
  usuario_verificador TEXT NOT NULL,
  revisada_por TEXT,
  fecha_revision DATE,
  observaciones_generales TEXT,
  motivo_rechazo TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Si la tabla ya existía, agregar columnas faltantes
DO $$
BEGIN
    -- Agregar campo 'updated_at' si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'verificaciones_inventario' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE verificaciones_inventario ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
    END IF;

    -- Agregar campo 'motivo_rechazo' si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'verificaciones_inventario' AND column_name = 'motivo_rechazo'
    ) THEN
        ALTER TABLE verificaciones_inventario ADD COLUMN motivo_rechazo TEXT;
    END IF;
END $$;

-- =====================================================
-- 3. TABLA: verificaciones_detalle
-- =====================================================
-- Almacena el detalle de cada producto en la verificación

CREATE TABLE IF NOT EXISTS verificaciones_detalle (
  id SERIAL PRIMARY KEY,
  verificacion_id INTEGER NOT NULL REFERENCES verificaciones_inventario(id) ON DELETE CASCADE,
  producto_id INTEGER NOT NULL REFERENCES productos(id),
  cantidad_teorica NUMERIC NOT NULL DEFAULT 0,
  cantidad_fisica NUMERIC,
  diferencia NUMERIC DEFAULT 0,
  porcentaje_diferencia NUMERIC DEFAULT 0,
  valor_diferencia NUMERIC DEFAULT 0,
  estado_diferencia TEXT DEFAULT 'Pendiente',
    -- Valores: 'Pendiente', 'OK', 'Sobrante', 'Faltante'
  observaciones TEXT,
  contado BOOLEAN DEFAULT false,
  aprobado BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Si la tabla ya existía, agregar columnas faltantes
DO $$
BEGIN
    -- Agregar campo 'aprobado' si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'verificaciones_detalle' AND column_name = 'aprobado'
    ) THEN
        ALTER TABLE verificaciones_detalle ADD COLUMN aprobado BOOLEAN DEFAULT false;
    END IF;

    -- Agregar campo 'updated_at' si no existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'verificaciones_detalle' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE verificaciones_detalle ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
    END IF;
END $$;

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_verificaciones_detalle_verificacion
  ON verificaciones_detalle(verificacion_id);
CREATE INDEX IF NOT EXISTS idx_verificaciones_detalle_producto
  ON verificaciones_detalle(producto_id);

-- =====================================================
-- 4. TRIGGER: Calcular diferencias automáticamente
-- =====================================================
-- Este trigger se ejecuta cuando se actualiza cantidad_fisica
-- y calcula automáticamente: diferencia, porcentaje, valor y estado

CREATE OR REPLACE FUNCTION calcular_diferencias_verificacion()
RETURNS TRIGGER AS $$
DECLARE
  precio_producto NUMERIC;
BEGIN
  -- Solo calcular si se ingresó cantidad_fisica
  IF NEW.cantidad_fisica IS NOT NULL THEN
    -- Obtener el precio del producto
    SELECT precio_unitario INTO precio_producto
    FROM productos
    WHERE id = NEW.producto_id;

    -- Calcular diferencia (cantidad física - teórica)
    NEW.diferencia := NEW.cantidad_fisica - NEW.cantidad_teorica;

    -- Calcular porcentaje de diferencia
    IF NEW.cantidad_teorica > 0 THEN
      NEW.porcentaje_diferencia := (NEW.diferencia / NEW.cantidad_teorica) * 100;
    ELSE
      NEW.porcentaje_diferencia := 0;
    END IF;

    -- Calcular valor de la diferencia
    NEW.valor_diferencia := NEW.diferencia * COALESCE(precio_producto, 0);

    -- Determinar estado de la diferencia
    IF ABS(NEW.diferencia) < 0.01 THEN
      NEW.estado_diferencia := 'OK';
    ELSIF NEW.diferencia > 0 THEN
      NEW.estado_diferencia := 'Sobrante';
    ELSE
      NEW.estado_diferencia := 'Faltante';
    END IF;

    -- Marcar como contado
    NEW.contado := true;

    -- Actualizar timestamp
    NEW.updated_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger en la tabla verificaciones_detalle
DROP TRIGGER IF EXISTS trigger_calcular_diferencias ON verificaciones_detalle;
CREATE TRIGGER trigger_calcular_diferencias
  BEFORE INSERT OR UPDATE OF cantidad_fisica
  ON verificaciones_detalle
  FOR EACH ROW
  EXECUTE FUNCTION calcular_diferencias_verificacion();

-- =====================================================
-- 5. VISTA: vista_resumen_verificaciones
-- =====================================================
-- Proporciona un resumen agregado de cada verificación

CREATE OR REPLACE VIEW vista_resumen_verificaciones AS
SELECT
  v.id,
  v.fecha_inicio,
  v.fecha_fin,
  v.estado,
  v.usuario_verificador,
  v.revisada_por,
  v.fecha_revision,
  v.observaciones_generales,
  v.motivo_rechazo,

  -- Contadores
  COUNT(vd.id) AS total_productos,
  COUNT(vd.id) FILTER (WHERE vd.contado = true) AS productos_contados,
  COUNT(vd.id) FILTER (WHERE vd.estado_diferencia = 'OK') AS productos_ok,
  COUNT(vd.id) FILTER (WHERE vd.estado_diferencia IN ('Sobrante', 'Faltante')) AS productos_diferencia,

  -- Valores agregados
  COALESCE(SUM(ABS(vd.valor_diferencia)), 0) AS valor_total_diferencias,

  -- Porcentaje de completado
  CASE
    WHEN COUNT(vd.id) > 0 THEN
      ROUND((COUNT(vd.id) FILTER (WHERE vd.contado = true)::NUMERIC / COUNT(vd.id)::NUMERIC) * 100, 2)
    ELSE 0
  END AS porcentaje_completado,

  -- Aprobaciones
  COUNT(vd.id) FILTER (WHERE vd.aprobado = true) AS productos_aprobados,

  v.created_at,
  v.updated_at
FROM
  verificaciones_inventario v
  LEFT JOIN verificaciones_detalle vd ON v.id = vd.verificacion_id
GROUP BY
  v.id, v.fecha_inicio, v.fecha_fin, v.estado, v.usuario_verificador,
  v.revisada_por, v.fecha_revision, v.observaciones_generales,
  v.motivo_rechazo, v.created_at, v.updated_at;

-- =====================================================
-- 6. FUNCIÓN: Aplicar ajustes aprobados al inventario
-- =====================================================
-- Esta función actualiza las cantidades en productos y registra movimientos

CREATE OR REPLACE FUNCTION aplicar_ajustes_verificacion(
  p_verificacion_id INTEGER,
  p_usuario TEXT
)
RETURNS TABLE (
  productos_actualizados INTEGER,
  movimientos_creados INTEGER
) AS $$
DECLARE
  v_productos_actualizados INTEGER := 0;
  v_movimientos_creados INTEGER := 0;
  v_detalle RECORD;
BEGIN
  -- Iterar sobre todos los detalles aprobados con diferencias
  FOR v_detalle IN
    SELECT
      vd.id,
      vd.producto_id,
      vd.cantidad_teorica,
      vd.cantidad_fisica,
      vd.diferencia,
      vd.observaciones,
      p.cantidad_actual,
      p.nombre AS producto_nombre
    FROM verificaciones_detalle vd
    JOIN productos p ON p.id = vd.producto_id
    WHERE vd.verificacion_id = p_verificacion_id
      AND vd.aprobado = true
      AND ABS(vd.diferencia) >= 0.01
  LOOP
    -- Actualizar cantidad en productos
    UPDATE productos
    SET cantidad_actual = v_detalle.cantidad_fisica
    WHERE id = v_detalle.producto_id;

    v_productos_actualizados := v_productos_actualizados + 1;

    -- Registrar movimiento en tabla de movimientos_inventario
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'movimientos_inventario') THEN
      INSERT INTO movimientos_inventario (
        producto_id,
        tipo_movimiento,
        cantidad,
        cantidad_anterior,
        cantidad_nueva,
        referencia_id,
        tipo_referencia,
        notas
      ) VALUES (
        v_detalle.producto_id,
        CASE WHEN v_detalle.diferencia > 0 THEN 'entrada' ELSE 'salida' END,
        ABS(v_detalle.diferencia),
        v_detalle.cantidad_teorica,
        v_detalle.cantidad_fisica,
        p_verificacion_id,
        'verificacion_fisica',
        CONCAT(
          'Ajuste por verificación física. ',
          CASE
            WHEN v_detalle.diferencia > 0 THEN 'Sobrante: +'
            ELSE 'Faltante: '
          END,
          v_detalle.diferencia,
          '. ',
          COALESCE(v_detalle.observaciones, '')
        )
      );

      v_movimientos_creados := v_movimientos_creados + 1;
    END IF;
  END LOOP;

  -- Actualizar estado de la verificación
  UPDATE verificaciones_inventario
  SET
    estado = 'Aprobada',
    fecha_fin = CURRENT_DATE,
    fecha_revision = CURRENT_DATE,
    revisada_por = p_usuario
  WHERE id = p_verificacion_id;

  RETURN QUERY SELECT v_productos_actualizados, v_movimientos_creados;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. POLÍTICAS RLS (Row Level Security)
-- =====================================================

-- Habilitar RLS en las nuevas tablas
ALTER TABLE verificaciones_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE verificaciones_detalle ENABLE ROW LEVEL SECURITY;

-- Políticas para verificaciones_inventario
-- Permitir todas las operaciones a usuarios autenticados
DROP POLICY IF EXISTS "Usuarios autenticados - verificaciones" ON verificaciones_inventario;
CREATE POLICY "Usuarios autenticados - verificaciones"
  ON verificaciones_inventario
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para verificaciones_detalle
-- Permitir todas las operaciones a usuarios autenticados
DROP POLICY IF EXISTS "Usuarios autenticados - verificaciones detalle" ON verificaciones_detalle;
CREATE POLICY "Usuarios autenticados - verificaciones detalle"
  ON verificaciones_detalle
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- 8. VERIFICACIÓN DE INSTALACIÓN
-- =====================================================

-- Mostrar resumen de objetos creados
SELECT 'Tablas creadas/verificadas' AS tipo, COUNT(*) AS cantidad
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('verificaciones_inventario', 'verificaciones_detalle')
UNION ALL
SELECT 'Vistas creadas', COUNT(*)
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name = 'vista_resumen_verificaciones'
UNION ALL
SELECT 'Triggers creados', COUNT(*)
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND trigger_name = 'trigger_calcular_diferencias'
UNION ALL
SELECT 'Funciones creadas', COUNT(*)
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('calcular_diferencias_verificacion', 'aplicar_ajustes_verificacion');

-- =====================================================
-- FIN DEL SCRIPT
-- =====================================================
-- ✅ Tablas: verificaciones_inventario, verificaciones_detalle
-- ✅ Vista: vista_resumen_verificaciones
-- ✅ Trigger: calcular_diferencias_verificacion (auto-calcula diferencias)
-- ✅ Función: aplicar_ajustes_verificacion (aplica ajustes al inventario)
-- ✅ Políticas RLS configuradas
-- ✅ Campo 'activo' agregado a tabla productos (si no existía)
-- =====================================================
