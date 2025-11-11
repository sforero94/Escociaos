-- =====================================================
-- DATOS DE PRUEBA PARA ESCOCIA HASS
-- =====================================================
-- Este archivo contiene datos de ejemplo para probar
-- el sistema completo con métricas realistas
-- =====================================================

-- =====================================================
-- 1. LOTES (8 lotes, 52 hectáreas total)
-- =====================================================

INSERT INTO lotes (nombre, hectareas, numero_arboles, variedad, activo) VALUES
('Lote A-1', 6.5, 1500, 'Hass', true),
('Lote A-2', 7.2, 1650, 'Hass', true),
('Lote B-1', 5.8, 1400, 'Hass', true),
('Lote B-2', 6.0, 1450, 'Hass', true),
('Lote B-3', 7.5, 1700, 'Hass', true),
('Lote C-1', 6.8, 1600, 'Hass', true),
('Lote C-2', 6.2, 1500, 'Hass', true),
('Lote C-3', 6.0, 1200, 'Hass', true);

-- =====================================================
-- 2. CATEGORÍAS DE PRODUCTOS
-- =====================================================

INSERT INTO categorias_productos (nombre) VALUES
('Fertilizantes'),
('Fungicidas'),
('Insecticidas'),
('Herbicidas'),
('Coadyuvantes'),
('Equipos de Protección'),
('Herramientas'),
('Empaques');

-- =====================================================
-- 3. PRODUCTOS (Inventario)
-- =====================================================

INSERT INTO productos (nombre, categoria, unidad_medida, cantidad_actual, stock_minimo, precio_unitario, estado, activo) VALUES
-- Fertilizantes
('Urea 46%', 'Fertilizantes', 'kg', 2500, 1000, 2500, 'Disponible', true),
('Triple 15 (15-15-15)', 'Fertilizantes', 'kg', 1800, 1500, 3200, 'Disponible', true),
('Nitrato de Calcio', 'Fertilizantes', 'kg', 800, 1000, 4500, 'Disponible', true),
('Sulfato de Potasio', 'Fertilizantes', 'kg', 600, 800, 5200, 'Disponible', true),
('Boro Foliar', 'Fertilizantes', 'L', 120, 100, 28000, 'Disponible', true),

-- Fungicidas
('Mancozeb 80%', 'Fungicidas', 'kg', 150, 100, 35000, 'Disponible', true),
('Azoxystrobin', 'Fungicidas', 'L', 45, 50, 125000, 'Disponible', true),
('Clorotalonil', 'Fungicidas', 'L', 80, 60, 45000, 'Disponible', true),
('Fosetyl-Al', 'Fungicidas', 'kg', 30, 40, 95000, 'Disponible', true),

-- Insecticidas
('Lambda-Cyhalotrin', 'Insecticidas', 'L', 25, 30, 85000, 'Disponible', true),
('Imidacloprid', 'Insecticidas', 'L', 20, 25, 120000, 'Disponible', true),
('Aceite Agrícola', 'Insecticidas', 'L', 180, 150, 18000, 'Disponible', true),

-- Herbicidas
('Glifosato 48%', 'Herbicidas', 'L', 200, 150, 25000, 'Disponible', true),
('Paraquat', 'Herbicidas', 'L', 80, 100, 32000, 'Disponible', true),

-- Coadyuvantes
('Adherente Siliconado', 'Coadyuvantes', 'L', 50, 40, 35000, 'Disponible', true),
('pH Reductor', 'Coadyuvantes', 'L', 30, 25, 22000, 'Disponible', true),

-- Equipos
('Guantes Nitrilo (Caja 100)', 'Equipos de Protección', 'Caja', 15, 10, 45000, 'Disponible', true),
('Mascarilla Respirador', 'Equipos de Protección', 'Unidad', 35, 30, 85000, 'Disponible', true),
('Traje Tyvek', 'Equipos de Protección', 'Unidad', 25, 20, 35000, 'Disponible', true),

-- Herramientas
('Tijeras Podadoras', 'Herramientas', 'Unidad', 45, 40, 65000, 'Disponible', true),
('Serruchos Curvos', 'Herramientas', 'Unidad', 30, 25, 45000, 'Disponible', true),

-- Empaques
('Canastillas 10kg', 'Empaques', 'Unidad', 2500, 2000, 8500, 'Disponible', true),
('Bolsas Malla', 'Empaques', 'Unidad', 5000, 3000, 350, 'Disponible', true);

-- =====================================================
-- 4. COMPRAS (Historial)
-- =====================================================

-- Compras de los últimos 30 días
INSERT INTO compras (producto_id, cantidad, precio_unitario, proveedor, numero_factura, fecha, lote_producto, fecha_vencimiento) VALUES
((SELECT id FROM productos WHERE nombre = 'Urea 46%'), 1000, 2500, 'Agroquímicos del Norte', 'FV-2024-1234', CURRENT_DATE - 5, 'LOTE-U-2024-11', CURRENT_DATE + 365),
((SELECT id FROM productos WHERE nombre = 'Azoxystrobin'), 25, 125000, 'FMC Colombia', 'FV-2024-5678', CURRENT_DATE - 10, 'LOTE-AZ-2024-10', CURRENT_DATE + 730),
((SELECT id FROM productos WHERE nombre = 'Canastillas 10kg'), 500, 8500, 'Empaques Agrícolas', 'FV-2024-9012', CURRENT_DATE - 3, 'LOTE-C-2024-11', NULL),
((SELECT id FROM productos WHERE nombre = 'Guantes Nitrilo (Caja 100)'), 10, 45000, 'EPP Seguridad', 'FV-2024-3456', CURRENT_DATE - 8, 'LOTE-G-2024-11', CURRENT_DATE + 365),
((SELECT id FROM productos WHERE nombre = 'Triple 15 (15-15-15)'), 800, 3200, 'Agroquímicos del Norte', 'FV-2024-1235', CURRENT_DATE - 15, 'LOTE-T-2024-10', CURRENT_DATE + 365);

-- =====================================================
-- 5. CATÁLOGO DE PLAGAS Y ENFERMEDADES
-- =====================================================

INSERT INTO plagas_enfermedades_catalogo (nombre, tipo, descripcion) VALUES
('Phytophthora cinnamomi', 'Enfermedad', 'Pudrición de raíz - Enfermedad más importante del aguacate'),
('Antracnosis', 'Enfermedad', 'Colletotrichum gloeosporioides - Afecta frutos'),
('Trips', 'Plaga', 'Frankliniella spp. - Daña brotes y frutos'),
('Ácaros', 'Plaga', 'Oligonychus spp. - Daña follaje'),
('Barrenador de ramas', 'Plaga', 'Copturus aguacatae - Perfora ramas'),
('Monalonion', 'Plaga', 'Chinche de encaje - Daña brotes'),
('Arañita roja', 'Plaga', 'Tetranychus spp. - Daña hojas'),
('Cercospora', 'Enfermedad', 'Mancha foliar por Cercospora'),
('Roselinia', 'Enfermedad', 'Pudrición blanca de raíz');

-- =====================================================
-- 6. MONITOREOS (Últimos 30 días)
-- =====================================================

-- Monitoreos recientes con diferentes niveles de gravedad
INSERT INTO monitoreos (lote_id, plaga_enfermedad_id, nivel_incidencia, gravedad_numero, gravedad_texto, fecha_monitoreo, observaciones) VALUES
-- Críticos (Alta gravedad)
(
  (SELECT id FROM lotes WHERE nombre = 'Lote B-3'),
  (SELECT id FROM plagas_enfermedades_catalogo WHERE nombre = 'Phytophthora cinnamomi'),
  25, 3, 'Alta',
  CURRENT_DATE - 2,
  'Presencia de árboles con marchitez. Requiere aplicación urgente de fosetyl-al'
),
(
  (SELECT id FROM lotes WHERE nombre = 'Lote B-3'),
  (SELECT id FROM plagas_enfermedades_catalogo WHERE nombre = 'Monalonion'),
  18, 3, 'Alta',
  CURRENT_DATE - 3,
  'Alta presencia en brotes nuevos. Programar aplicación de insecticida'
),

-- Media gravedad
(
  (SELECT id FROM lotes WHERE nombre = 'Lote A-2'),
  (SELECT id FROM plagas_enfermedades_catalogo WHERE nombre = 'Trips'),
  12, 2, 'Media',
  CURRENT_DATE - 5,
  'Presencia moderada en flores. Monitorear evolución'
),
(
  (SELECT id FROM lotes WHERE nombre = 'Lote C-1'),
  (SELECT id FROM plagas_enfermedades_catalogo WHERE nombre = 'Ácaros'),
  8, 2, 'Media',
  CURRENT_DATE - 7,
  'Daño foliar leve. Evaluar necesidad de aplicación'
),

-- Baja gravedad
(
  (SELECT id FROM lotes WHERE nombre = 'Lote A-1'),
  (SELECT id FROM plagas_enfermedades_catalogo WHERE nombre = 'Antracnosis'),
  5, 1, 'Baja',
  CURRENT_DATE - 10,
  'Incidencia baja en frutos. Mantener monitoreo preventivo'
),
(
  (SELECT id FROM lotes WHERE nombre = 'Lote C-2'),
  (SELECT id FROM plagas_enfermedades_catalogo WHERE nombre = 'Cercospora'),
  3, 1, 'Baja',
  CURRENT_DATE - 12,
  'Manchas foliares mínimas. No requiere acción inmediata'
);

-- =====================================================
-- 7. APLICACIONES
-- =====================================================

-- Aplicaciones recientes y programadas
INSERT INTO aplicaciones (nombre_aplicacion, fecha_aplicacion, estado, responsable, observaciones) VALUES
('Fertilización Foliar Octubre', CURRENT_DATE - 15, 'Completada', 'Juan Pérez', 'Aplicación de boro y microelementos'),
('Control Phytophthora Lote B-3', CURRENT_DATE - 8, 'Completada', 'María González', 'Aplicación de fosetyl-al por incidencia crítica'),
('Fumigación Insecticida', CURRENT_DATE - 5, 'Completada', 'Carlos Ramírez', 'Control preventivo de trips y monalonion'),
('Fertilización Foliar Noviembre', CURRENT_DATE + 2, 'Programada', 'Juan Pérez', 'Aplicación mensual programada'),
('Control Preventivo Phytophthora', CURRENT_DATE + 7, 'Programada', 'María González', 'Aplicación preventiva trimestral'),
('Mantenimiento General', CURRENT_DATE - 3, 'En ejecución', 'Carlos Ramírez', 'Podas y manejo sanitario');

-- =====================================================
-- 8. COSECHAS (Última semana)
-- =====================================================

-- Cosechas recientes para métricas del dashboard
INSERT INTO cosechas (lote_id, fecha_cosecha, kilos_cosechados, calidad, responsable) VALUES
((SELECT id FROM lotes WHERE nombre = 'Lote A-1'), CURRENT_DATE - 6, 850, 'Primera', 'Equipo 1'),
((SELECT id FROM lotes WHERE nombre = 'Lote A-2'), CURRENT_DATE - 5, 920, 'Primera', 'Equipo 2'),
((SELECT id FROM lotes WHERE nombre = 'Lote C-1'), CURRENT_DATE - 4, 780, 'Primera', 'Equipo 1'),
((SELECT id FROM lotes WHERE nombre = 'Lote B-1'), CURRENT_DATE - 3, 650, 'Segunda', 'Equipo 3'),
((SELECT id FROM lotes WHERE nombre = 'Lote C-2'), CURRENT_DATE - 2, 890, 'Primera', 'Equipo 2'),
((SELECT id FROM lotes WHERE nombre = 'Lote B-2'), CURRENT_DATE - 1, 710, 'Primera', 'Equipo 1');

-- =====================================================
-- 9. CLIENTES
-- =====================================================

INSERT INTO clientes (nombre_empresa, nit, contacto, telefono, email, ciudad, activo) VALUES
('Frutería del Oriente', '900123456-7', 'Roberto Gómez', '3201234567', 'compras@fruteriaoriente.com', 'Bucaramanga', true),
('Supermercados La Canasta', '800234567-8', 'Ana Martínez', '3112345678', 'abastecimiento@lacanasta.com', 'Bogotá', true),
('Exportadora FreshFruit', '700345678-9', 'Luis Herrera', '3123456789', 'compras@freshfruit.com', 'Medellín', true),
('Distribuidora El Buen Sabor', '600456789-0', 'Carmen Ruiz', '3134567890', 'ventas@buensabor.com', 'Cali', true),
('Mercacentro Mayorista', '500567890-1', 'Pedro Castro', '3145678901', 'gerencia@mercacentro.com', 'Barranquilla', true),
('Agroexport International', '400678901-2', 'Sandra López', '3156789012', 'export@agroexport.com', 'Cartagena', true);

-- =====================================================
-- 10. DESPACHOS (Último mes)
-- =====================================================

-- Despachos del último mes para métricas
INSERT INTO despachos (cliente_id, fecha_despacho, kilos_despachados, precio_kilo, valor_total, estado) VALUES
(
  (SELECT id FROM clientes WHERE nombre_empresa = 'Frutería del Oriente'),
  CURRENT_DATE - 25,
  1200, 8500, 10200000, 'Entregado'
),
(
  (SELECT id FROM clientes WHERE nombre_empresa = 'Supermercados La Canasta'),
  CURRENT_DATE - 20,
  2500, 8800, 22000000, 'Entregado'
),
(
  (SELECT id FROM clientes WHERE nombre_empresa = 'Exportadora FreshFruit'),
  CURRENT_DATE - 18,
  3000, 9200, 27600000, 'Entregado'
),
(
  (SELECT id FROM clientes WHERE nombre_empresa = 'Distribuidora El Buen Sabor'),
  CURRENT_DATE - 15,
  1800, 8600, 15480000, 'Entregado'
),
(
  (SELECT id FROM clientes WHERE nombre_empresa = 'Mercacentro Mayorista'),
  CURRENT_DATE - 12,
  2200, 8700, 19140000, 'Entregado'
),
(
  (SELECT id FROM clientes WHERE nombre_empresa = 'Agroexport International'),
  CURRENT_DATE - 8,
  2800, 9500, 26600000, 'Entregado'
),
(
  (SELECT id FROM clientes WHERE nombre_empresa = 'Frutería del Oriente'),
  CURRENT_DATE - 5,
  1500, 8500, 12750000, 'Entregado'
),
(
  (SELECT id FROM clientes WHERE nombre_empresa = 'Supermercados La Canasta'),
  CURRENT_DATE - 3,
  2000, 8800, 17600000, 'En tránsito'
),
(
  (SELECT id FROM clientes WHERE nombre_empresa = 'Exportadora FreshFruit'),
  CURRENT_DATE - 1,
  2500, 9200, 23000000, 'Programado'
);

-- =====================================================
-- RESUMEN DE DATOS INSERTADOS
-- =====================================================
-- ✅ 8 Lotes (52 hectáreas, 12,000 árboles)
-- ✅ 8 Categorías de productos
-- ✅ 23 Productos en inventario
-- ✅ 5 Compras recientes
-- ✅ 9 Plagas/Enfermedades en catálogo
-- ✅ 6 Monitoreos (2 críticos, 2 medios, 2 bajos)
-- ✅ 6 Aplicaciones (3 completadas, 1 en ejecución, 2 programadas)
-- ✅ 6 Cosechas última semana (4,800 kg total)
-- ✅ 6 Clientes activos
-- ✅ 9 Despachos último mes (~$174.37M en ventas)
-- =====================================================

-- Verificar datos insertados
SELECT 'Lotes creados:' as tabla, COUNT(*) as cantidad FROM lotes
UNION ALL
SELECT 'Productos en inventario:', COUNT(*) FROM productos
UNION ALL
SELECT 'Compras registradas:', COUNT(*) FROM compras
UNION ALL
SELECT 'Monitoreos realizados:', COUNT(*) FROM monitoreos
UNION ALL
SELECT 'Aplicaciones:', COUNT(*) FROM aplicaciones
UNION ALL
SELECT 'Cosechas registradas:', COUNT(*) FROM cosechas
UNION ALL
SELECT 'Clientes activos:', COUNT(*) FROM clientes WHERE activo = true
UNION ALL
SELECT 'Despachos último mes:', COUNT(*) FROM despachos;

-- =====================================================
-- MÉTRICAS ESPERADAS EN EL DASHBOARD
-- =====================================================
-- Inventario: ~$330M (valor total estimado)
-- Alertas Stock: 2-3 productos bajo mínimo
-- Aplicaciones Activas: 1
-- Aplicaciones Programadas: 2
-- Monitoreos Críticos: 2
-- Producción Semanal: ~4,800 kg
-- Ventas Último Mes: ~$174M
-- Clientes Activos: 6
-- Lotes Totales: 8
-- =====================================================
