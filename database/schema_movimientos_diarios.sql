-- ============================================================================
-- ESQUEMA DE BASE DE DATOS: MOVIMIENTOS DIARIOS
-- ============================================================================
--
-- Descripción:
-- Tabla para registrar el uso diario de insumos durante el periodo de aplicación.
-- Estos movimientos son provisionales y no afectan el inventario hasta el cierre.
--
-- Fecha de creación: 2025-11-12
-- Versión: 1.0.0
-- ============================================================================

-- Crear tabla movimientos_diarios
CREATE TABLE IF NOT EXISTS movimientos_diarios (
  -- Identificación
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Relaciones
  aplicacion_id UUID NOT NULL REFERENCES aplicaciones(id) ON DELETE CASCADE,
  lote_id UUID NOT NULL REFERENCES lotes(id) ON DELETE RESTRICT,
  producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,

  -- Datos del movimiento
  fecha_movimiento DATE NOT NULL,
  lote_nombre VARCHAR(255) NOT NULL,
  producto_nombre VARCHAR(255) NOT NULL,
  producto_unidad VARCHAR(50) NOT NULL CHECK (producto_unidad IN ('litros', 'kilos', 'unidades')),
  cantidad_utilizada DECIMAL(10,2) NOT NULL CHECK (cantidad_utilizada > 0),

  -- Responsable y observaciones
  responsable VARCHAR(255) NOT NULL,
  notas TEXT,

  -- Metadata
  creado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  creado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actualizado_en TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Constraints
  CONSTRAINT ck_fecha_movimiento_valida CHECK (fecha_movimiento <= CURRENT_DATE)
);

-- ============================================================================
-- ÍNDICES PARA OPTIMIZACIÓN
-- ============================================================================

-- Índice para búsquedas por aplicación (más común)
CREATE INDEX IF NOT EXISTS idx_movimientos_diarios_aplicacion
  ON movimientos_diarios(aplicacion_id);

-- Índice para búsquedas por fecha
CREATE INDEX IF NOT EXISTS idx_movimientos_diarios_fecha
  ON movimientos_diarios(fecha_movimiento DESC);

-- Índice para búsquedas por producto
CREATE INDEX IF NOT EXISTS idx_movimientos_diarios_producto
  ON movimientos_diarios(producto_id);

-- Índice para búsquedas por lote
CREATE INDEX IF NOT EXISTS idx_movimientos_diarios_lote
  ON movimientos_diarios(lote_id);

-- Índice compuesto para búsquedas frecuentes
CREATE INDEX IF NOT EXISTS idx_movimientos_diarios_app_fecha
  ON movimientos_diarios(aplicacion_id, fecha_movimiento DESC);

-- Índice para búsquedas por creador
CREATE INDEX IF NOT EXISTS idx_movimientos_diarios_creado_por
  ON movimientos_diarios(creado_por);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION actualizar_movimiento_diario_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_actualizar_movimiento_diario_timestamp ON movimientos_diarios;

CREATE TRIGGER trigger_actualizar_movimiento_diario_timestamp
  BEFORE UPDATE ON movimientos_diarios
  FOR EACH ROW
  EXECUTE FUNCTION actualizar_movimiento_diario_timestamp();

-- ============================================================================
-- POLÍTICAS DE SEGURIDAD (RLS - Row Level Security)
-- ============================================================================

-- Habilitar RLS
ALTER TABLE movimientos_diarios ENABLE ROW LEVEL SECURITY;

-- Política: Los usuarios autenticados pueden ver movimientos de su finca
CREATE POLICY "Users can view their farm's daily movements"
  ON movimientos_diarios
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM aplicaciones a
      WHERE a.id = movimientos_diarios.aplicacion_id
      AND a.finca_id IN (
        SELECT finca_id FROM usuarios WHERE user_id = auth.uid()
      )
    )
  );

-- Política: Los usuarios pueden insertar movimientos en aplicaciones de su finca
CREATE POLICY "Users can insert daily movements for their farm"
  ON movimientos_diarios
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM aplicaciones a
      WHERE a.id = movimientos_diarios.aplicacion_id
      AND a.finca_id IN (
        SELECT finca_id FROM usuarios WHERE user_id = auth.uid()
      )
      AND a.estado = 'En ejecución'
    )
  );

-- Política: Los usuarios pueden eliminar sus propios movimientos
CREATE POLICY "Users can delete their own daily movements"
  ON movimientos_diarios
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND (
      creado_por = auth.uid()
      OR EXISTS (
        SELECT 1 FROM usuarios
        WHERE user_id = auth.uid()
        AND rol IN ('admin', 'gerente')
      )
    )
    AND EXISTS (
      SELECT 1 FROM aplicaciones a
      WHERE a.id = movimientos_diarios.aplicacion_id
      AND a.estado = 'En ejecución'
    )
  );

-- Política: Solo admins/gerentes pueden actualizar movimientos
CREATE POLICY "Only admins can update daily movements"
  ON movimientos_diarios
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM usuarios
      WHERE user_id = auth.uid()
      AND rol IN ('admin', 'gerente')
    )
  );

-- ============================================================================
-- VISTAS ÚTILES
-- ============================================================================

-- Vista: Resumen de movimientos por aplicación y producto
CREATE OR REPLACE VIEW v_resumen_movimientos_diarios AS
SELECT
  md.aplicacion_id,
  a.nombre_aplicacion,
  md.producto_id,
  md.producto_nombre,
  md.producto_unidad,
  COUNT(*) as total_movimientos,
  SUM(md.cantidad_utilizada) as cantidad_total_utilizada,
  MIN(md.fecha_movimiento) as primera_fecha,
  MAX(md.fecha_movimiento) as ultima_fecha,
  COUNT(DISTINCT md.lote_id) as lotes_trabajados,
  COUNT(DISTINCT md.responsable) as responsables_distintos
FROM movimientos_diarios md
JOIN aplicaciones a ON a.id = md.aplicacion_id
GROUP BY
  md.aplicacion_id,
  a.nombre_aplicacion,
  md.producto_id,
  md.producto_nombre,
  md.producto_unidad;

-- Vista: Movimientos diarios con información completa
CREATE OR REPLACE VIEW v_movimientos_diarios_completos AS
SELECT
  md.*,
  a.nombre_aplicacion,
  a.tipo_aplicacion,
  a.estado as estado_aplicacion,
  l.nombre as lote_nombre_completo,
  p.nombre as producto_nombre_completo,
  p.categoria as producto_categoria,
  u.nombre_completo as creado_por_nombre
FROM movimientos_diarios md
LEFT JOIN aplicaciones a ON a.id = md.aplicacion_id
LEFT JOIN lotes l ON l.id = md.lote_id
LEFT JOIN productos p ON p.id = md.producto_id
LEFT JOIN usuarios u ON u.user_id = md.creado_por;

-- Vista: Estadísticas por día
CREATE OR REPLACE VIEW v_movimientos_por_dia AS
SELECT
  md.aplicacion_id,
  md.fecha_movimiento,
  COUNT(*) as total_movimientos,
  COUNT(DISTINCT md.producto_id) as productos_usados,
  COUNT(DISTINCT md.lote_id) as lotes_trabajados,
  COUNT(DISTINCT md.responsable) as responsables
FROM movimientos_diarios md
GROUP BY md.aplicacion_id, md.fecha_movimiento
ORDER BY md.fecha_movimiento DESC;

-- ============================================================================
-- FUNCIONES ÚTILES
-- ============================================================================

-- Función: Obtener resumen de un producto en una aplicación
CREATE OR REPLACE FUNCTION obtener_resumen_producto_aplicacion(
  p_aplicacion_id UUID,
  p_producto_id UUID
)
RETURNS TABLE(
  producto_nombre VARCHAR,
  cantidad_planeada DECIMAL,
  cantidad_utilizada DECIMAL,
  diferencia DECIMAL,
  porcentaje_usado DECIMAL,
  excede_planeado BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH planeado AS (
    SELECT
      SUM(ap.cantidad_total_necesaria) as total_planeado
    FROM aplicaciones_productos ap
    JOIN aplicaciones_mezclas am ON am.id = ap.mezcla_id
    WHERE am.aplicacion_id = p_aplicacion_id
      AND ap.producto_id = p_producto_id
  ),
  utilizado AS (
    SELECT
      SUM(md.cantidad_utilizada) as total_utilizado
    FROM movimientos_diarios md
    WHERE md.aplicacion_id = p_aplicacion_id
      AND md.producto_id = p_producto_id
  )
  SELECT
    (SELECT nombre FROM productos WHERE id = p_producto_id)::VARCHAR,
    COALESCE(p.total_planeado, 0)::DECIMAL,
    COALESCE(u.total_utilizado, 0)::DECIMAL,
    (COALESCE(p.total_planeado, 0) - COALESCE(u.total_utilizado, 0))::DECIMAL,
    CASE
      WHEN COALESCE(p.total_planeado, 0) > 0
      THEN (COALESCE(u.total_utilizado, 0) / p.total_planeado * 100)::DECIMAL
      ELSE 0::DECIMAL
    END,
    COALESCE(u.total_utilizado, 0) > COALESCE(p.total_planeado, 0)
  FROM planeado p
  CROSS JOIN utilizado u;
END;
$$ LANGUAGE plpgsql;

-- Función: Validar si se puede agregar un movimiento
CREATE OR REPLACE FUNCTION validar_nuevo_movimiento_diario(
  p_aplicacion_id UUID,
  p_fecha_movimiento DATE
)
RETURNS TABLE(
  valido BOOLEAN,
  mensaje TEXT
) AS $$
DECLARE
  v_estado VARCHAR;
  v_fecha_inicio DATE;
  v_fecha_cierre DATE;
BEGIN
  -- Obtener datos de la aplicación
  SELECT estado, fecha_recomendacion, fecha_fin_ejecucion
  INTO v_estado, v_fecha_inicio, v_fecha_cierre
  FROM aplicaciones
  WHERE id = p_aplicacion_id;

  -- Validar estado
  IF v_estado != 'En ejecución' THEN
    RETURN QUERY SELECT FALSE, 'La aplicación no está en ejecución';
    RETURN;
  END IF;

  -- Validar fecha no sea futura
  IF p_fecha_movimiento > CURRENT_DATE THEN
    RETURN QUERY SELECT FALSE, 'La fecha no puede ser futura';
    RETURN;
  END IF;

  -- Validar fecha no sea anterior al inicio
  IF p_fecha_movimiento < v_fecha_inicio THEN
    RETURN QUERY SELECT FALSE, 'La fecha no puede ser anterior al inicio de la aplicación';
    RETURN;
  END IF;

  -- Todo válido
  RETURN QUERY SELECT TRUE, 'Válido'::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMENTARIOS EN TABLAS Y COLUMNAS
-- ============================================================================

COMMENT ON TABLE movimientos_diarios IS
  'Registra el uso diario de insumos durante una aplicación. Movimientos provisionales que no afectan inventario hasta el cierre.';

COMMENT ON COLUMN movimientos_diarios.id IS
  'Identificador único del movimiento';

COMMENT ON COLUMN movimientos_diarios.aplicacion_id IS
  'Referencia a la aplicación asociada';

COMMENT ON COLUMN movimientos_diarios.fecha_movimiento IS
  'Fecha en que se utilizó el producto (no puede ser futura)';

COMMENT ON COLUMN movimientos_diarios.cantidad_utilizada IS
  'Cantidad del producto utilizado en este movimiento';

COMMENT ON COLUMN movimientos_diarios.responsable IS
  'Nombre de la persona responsable del movimiento';

COMMENT ON COLUMN movimientos_diarios.notas IS
  'Observaciones adicionales sobre el movimiento';

-- ============================================================================
-- DATOS DE PRUEBA (OPCIONAL - SOLO PARA DESARROLLO)
-- ============================================================================

-- Descomentar para insertar datos de prueba
/*
INSERT INTO movimientos_diarios (
  aplicacion_id,
  fecha_movimiento,
  lote_id,
  lote_nombre,
  producto_id,
  producto_nombre,
  producto_unidad,
  cantidad_utilizada,
  responsable,
  notas
)
SELECT
  a.id,
  CURRENT_DATE - (random() * 5)::int,
  l.id,
  l.nombre,
  p.id,
  p.nombre,
  p.unidad_medida,
  (random() * 50 + 10)::DECIMAL(10,2),
  'Juan Operario',
  'Movimiento de prueba'
FROM aplicaciones a
CROSS JOIN lotes l
CROSS JOIN productos p
WHERE a.estado = 'En ejecución'
LIMIT 20;
*/

-- ============================================================================
-- GRANTS DE PERMISOS
-- ============================================================================

-- Otorgar permisos a usuarios autenticados
GRANT SELECT, INSERT, DELETE ON movimientos_diarios TO authenticated;
GRANT UPDATE ON movimientos_diarios TO authenticated; -- Solo con política restrictiva

-- Otorgar permisos en secuencias si existen
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ============================================================================
-- MANTENIMIENTO Y LIMPIEZA
-- ============================================================================

-- Función para limpiar movimientos huérfanos (sin aplicación)
CREATE OR REPLACE FUNCTION limpiar_movimientos_huerfanos()
RETURNS INTEGER AS $$
DECLARE
  cantidad_eliminada INTEGER;
BEGIN
  DELETE FROM movimientos_diarios
  WHERE aplicacion_id NOT IN (SELECT id FROM aplicaciones);

  GET DIAGNOSTICS cantidad_eliminada = ROW_COUNT;
  RETURN cantidad_eliminada;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FIN DEL ESQUEMA
-- ============================================================================

-- Verificar que todo se creó correctamente
DO $$
BEGIN
  RAISE NOTICE 'Tabla movimientos_diarios creada exitosamente';
  RAISE NOTICE 'Índices creados: %', (
    SELECT COUNT(*)
    FROM pg_indexes
    WHERE tablename = 'movimientos_diarios'
  );
  RAISE NOTICE 'Triggers creados: %', (
    SELECT COUNT(*)
    FROM pg_trigger
    WHERE tgrelid = 'movimientos_diarios'::regclass
  );
END $$;
