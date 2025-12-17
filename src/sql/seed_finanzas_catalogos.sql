-- Seed data for Financial Flows module catalogs
-- Execute this script to populate basic catalog data for testing

-- ===========================================
-- NEGOCIOS (7 unidades de negocio)
-- ===========================================
INSERT INTO fin_negocios (nombre, descripcion, activo, created_at, updated_at) VALUES
('Palma', 'Producción de palma africana', true, NOW(), NOW()),
('Plátano', 'Cultivo y comercialización de plátano', true, NOW(), NOW()),
('Café', 'Producción de café especial', true, NOW(), NOW()),
('Cacao', 'Cultivo de cacao fino', true, NOW(), NOW()),
('Ganadería', 'Producción ganadera sostenible', true, NOW(), NOW()),
('Forestal', 'Manejo forestal y reforestación', true, NOW(), NOW()),
('Agroturismo', 'Actividades turísticas y educativas', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- REGIONES (7 regiones geográficas)
-- ===========================================
INSERT INTO fin_regiones (nombre, descripcion, activo, created_at, updated_at) VALUES
('Región Norte', 'Zona norte del cultivo', true, NOW(), NOW()),
('Región Centro', 'Zona central del cultivo', true, NOW(), NOW()),
('Región Sur', 'Zona sur del cultivo', true, NOW(), NOW()),
('Región Este', 'Zona oriental del cultivo', true, NOW(), NOW()),
('Región Oeste', 'Zona occidental del cultivo', true, NOW(), NOW()),
('Región Andina', 'Zona de altura andina', true, NOW(), NOW()),
('Región Costera', 'Zona costera del cultivo', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- MEDIOS DE PAGO
-- ===========================================
INSERT INTO fin_medios_pago (nombre, descripcion, activo, created_at, updated_at) VALUES
('Efectivo', 'Pago en efectivo', true, NOW(), NOW()),
('Transferencia Bancaria', 'Transferencia electrónica', true, NOW(), NOW()),
('Cheque', 'Pago mediante cheque', true, NOW(), NOW()),
('Tarjeta de Crédito', 'Pago con tarjeta de crédito', true, NOW(), NOW()),
('Tarjeta de Débito', 'Pago con tarjeta de débito', true, NOW(), NOW()),
('Pago Móvil', 'Pago a través de billeteras móviles', true, NOW(), NOW()),
('Nota de Crédito', 'Compensación mediante nota de crédito', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- CATEGORÍAS DE GASTOS (15 categorías)
-- ===========================================
INSERT INTO fin_categorias_gastos (nombre, descripcion, activo, created_at, updated_at) VALUES
('Mano de Obra', 'Salarios, jornales y prestaciones', true, NOW(), NOW()),
('Insumos Agrícolas', 'Fertilizantes, plaguicidas, semillas', true, NOW(), NOW()),
('Combustibles', 'Gasolina, diésel y lubricantes', true, NOW(), NOW()),
('Mantenimiento', 'Reparaciones y mantenimiento de equipos', true, NOW(), NOW()),
('Transporte', 'Fletes, logística y transporte', true, NOW(), NOW()),
('Servicios Públicos', 'Agua, luz, teléfono, internet', true, NOW(), NOW()),
('Seguros', 'Pólizas de seguros diversos', true, NOW(), NOW()),
('Impuestos', 'Impuestos y contribuciones', true, NOW(), NOW()),
('Administrativos', 'Material de oficina y gastos administrativos', true, NOW(), NOW()),
('Capacitación', 'Cursos, talleres y capacitación', true, NOW(), NOW()),
('Tecnología', 'Software, hardware y sistemas', true, NOW(), NOW()),
('Marketing', 'Publicidad y promoción', true, NOW(), NOW()),
('Seguridad', 'Sistema de seguridad y vigilancia', true, NOW(), NOW()),
('Ambiental', 'Certificaciones y gestión ambiental', true, NOW(), NOW()),
('Otros', 'Gastos diversos no clasificados', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- CONCEPTOS DE GASTOS (por categoría)
-- ===========================================

-- 1. Mano de Obra
INSERT INTO fin_conceptos_gastos (categoria_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(1, 'Jornales Campo', 'Pago de jornales en campo', true, NOW(), NOW()),
(1, 'Salarios Administrativos', 'Salarios del personal administrativo', true, NOW(), NOW()),
(1, 'Bonos Productividad', 'Bonos por productividad', true, NOW(), NOW()),
(1, 'Prestaciones Sociales', 'Cesantías, intereses, prima', true, NOW(), NOW()),
(1, 'Contratistas Externos', 'Pago a contratistas externos', true, NOW(), NOW()),
(1, 'Capacitación Personal', 'Cursos y capacitación del personal', true, NOW(), NOW()),
(1, 'Uniformes y EPP', 'Equipo de protección personal', true, NOW(), NOW()),
(1, 'Viáticos', 'Viáticos y gastos de viaje', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 2. Insumos Agrícolas
INSERT INTO fin_conceptos_gastos (categoria_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(2, 'Fertilizantes', 'Fertilizantes químicos y orgánicos', true, NOW(), NOW()),
(2, 'Plaguicidas', 'Insecticidas, fungicidas, herbicidas', true, NOW(), NOW()),
(2, 'Semillas', 'Semillas certificadas', true, NOW(), NOW()),
(2, 'Sustratos', 'Sustratos y medios de cultivo', true, NOW(), NOW()),
(2, 'Bioinsumos', 'Productos biológicos y orgánicos', true, NOW(), NOW()),
(2, 'Análisis de Suelo', 'Análisis químicos del suelo', true, NOW(), NOW()),
(2, 'Análisis Foliar', 'Análisis de tejido vegetal', true, NOW(), NOW()),
(2, 'Micronutrientes', 'Suplementos minerales', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 3. Combustibles
INSERT INTO fin_conceptos_gastos (categoria_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(3, 'Gasolina', 'Gasolina para vehículos y equipos', true, NOW(), NOW()),
(3, 'Diésel', 'Diésel para maquinaria pesada', true, NOW(), NOW()),
(3, 'Aceite Motor', 'Aceites lubricantes', true, NOW(), NOW()),
(3, 'Filtros', 'Filtros de aceite y combustible', true, NOW(), NOW()),
(3, 'Aditivos', 'Aditivos para combustible', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 4. Mantenimiento
INSERT INTO fin_conceptos_gastos (categoria_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(4, 'Repuestos Maquinaria', 'Repuestos para equipos agrícolas', true, NOW(), NOW()),
(4, 'Reparaciones', 'Servicios de reparación', true, NOW(), NOW()),
(4, 'Lubricantes', 'Aceites y lubricantes especiales', true, NOW(), NOW()),
(4, 'Herramientas', 'Compra de herramientas', true, NOW(), NOW()),
(4, 'Mantenimiento Preventivo', 'Servicios de mantenimiento programado', true, NOW(), NOW()),
(4, 'Calibración Equipos', 'Calibración de equipos de medición', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 5. Transporte
INSERT INTO fin_conceptos_gastos (categoria_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(5, 'Fletes Internos', 'Transporte interno de productos', true, NOW(), NOW()),
(5, 'Fletes Externos', 'Transporte a mercados externos', true, NOW(), NOW()),
(5, 'Almacenamiento', 'Costos de almacenamiento', true, NOW(), NOW()),
(5, 'Embalaje', 'Materiales de embalaje', true, NOW(), NOW()),
(5, 'Logística', 'Servicios logísticos', true, NOW(), NOW()),
(5, 'Seguro de Carga', 'Seguros de transporte', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 6. Servicios Públicos
INSERT INTO fin_conceptos_gastos (categoria_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(6, 'Energía Eléctrica', 'Consumo de energía eléctrica', true, NOW(), NOW()),
(6, 'Agua', 'Servicio de acueducto', true, NOW(), NOW()),
(6, 'Gas', 'Servicio de gas natural', true, NOW(), NOW()),
(6, 'Teléfono', 'Servicio telefónico fijo', true, NOW(), NOW()),
(6, 'Internet', 'Servicio de internet', true, NOW(), NOW()),
(6, 'Celular', 'Servicio de telefonía móvil', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 7. Seguros
INSERT INTO fin_conceptos_gastos (categoria_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(7, 'Seguro Agrícola', 'Seguro de cosechas', true, NOW(), NOW()),
(7, 'Seguro Vehículos', 'Seguro de flota vehicular', true, NOW(), NOW()),
(7, 'Seguro Equipos', 'Seguro de maquinaria', true, NOW(), NOW()),
(7, 'Seguro Vida', 'Seguro de vida del personal', true, NOW(), NOW()),
(7, 'Seguro Responsabilidad', 'Seguro de responsabilidad civil', true, NOW(), NOW()),
(7, 'Seguro Incendio', 'Seguro contra incendio', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 8. Impuestos
INSERT INTO fin_conceptos_gastos (categoria_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(8, 'IVA', 'Impuesto al Valor Agregado', true, NOW(), NOW()),
(8, 'ICA', 'Impuesto de Industria y Comercio', true, NOW(), NOW()),
(8, 'Retención Fuente', 'Retenciones en la fuente', true, NOW(), NOW()),
(8, 'Impuesto Renta', 'Impuesto de renta', true, NOW(), NOW()),
(8, 'Predial', 'Impuesto predial', true, NOW(), NOW()),
(8, 'Vehículos', 'Impuesto vehicular', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 9. Administrativos
INSERT INTO fin_conceptos_gastos (categoria_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(9, 'Papelería', 'Material de oficina', true, NOW(), NOW()),
(9, 'Software', 'Licencias de software', true, NOW(), NOW()),
(9, 'Contabilidad', 'Servicios contables externos', true, NOW(), NOW()),
(9, 'Auditoría', 'Servicios de auditoría', true, NOW(), NOW()),
(9, 'Legal', 'Servicios jurídicos', true, NOW(), NOW()),
(9, 'Consultorías', 'Consultorías especializadas', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 10. Capacitación
INSERT INTO fin_conceptos_gastos (categoria_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(10, 'Cursos Técnicos', 'Cursos de capacitación técnica', true, NOW(), NOW()),
(10, 'Talleres', 'Talleres y seminarios', true, NOW(), NOW()),
(10, 'Certificaciones', 'Certificaciones profesionales', true, NOW(), NOW()),
(10, 'Material Didáctico', 'Material de capacitación', true, NOW(), NOW()),
(10, 'Conferencias', 'Asistencia a conferencias', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 11. Tecnología
INSERT INTO fin_conceptos_gastos (categoria_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(11, 'Hardware', 'Equipos de cómputo', true, NOW(), NOW()),
(11, 'Software', 'Licencias y suscripciones', true, NOW(), NOW()),
(11, 'Soporte Técnico', 'Servicios de soporte', true, NOW(), NOW()),
(11, 'Desarrollo', 'Desarrollo de software', true, NOW(), NOW()),
(11, 'Cloud Services', 'Servicios en la nube', true, NOW(), NOW()),
(11, 'Ciberseguridad', 'Seguridad informática', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 12. Marketing
INSERT INTO fin_conceptos_gastos (categoria_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(12, 'Publicidad Digital', 'Campañas en redes sociales', true, NOW(), NOW()),
(12, 'Material Publicitario', 'Folletos, vallas, etc.', true, NOW(), NOW()),
(12, 'Ferias y Eventos', 'Participación en ferias', true, NOW(), NOW()),
(12, 'Sitio Web', 'Desarrollo y mantenimiento web', true, NOW(), NOW()),
(12, 'Fotografía', 'Servicios fotográficos', true, NOW(), NOW()),
(12, 'Branding', 'Desarrollo de marca', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 13. Seguridad
INSERT INTO fin_conceptos_gastos (categoria_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(13, 'Vigilancia', 'Personal de vigilancia', true, NOW(), NOW()),
(13, 'Cámaras', 'Sistema de videovigilancia', true, NOW(), NOW()),
(13, 'Alarmas', 'Sistema de alarmas', true, NOW(), NOW()),
(13, 'Señalización', 'Señalización de seguridad', true, NOW(), NOW()),
(13, 'Capacitación Seguridad', 'Entrenamiento en seguridad', true, NOW(), NOW()),
(13, 'Auditorías Seguridad', 'Auditorías de seguridad', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 14. Ambiental
INSERT INTO fin_conceptos_gastos (categoria_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(14, 'Certificaciones', 'Certificaciones ambientales', true, NOW(), NOW()),
(14, 'Monitoreo Ambiental', 'Monitoreo de impacto ambiental', true, NOW(), NOW()),
(14, 'Tratamiento Residuos', 'Manejo de residuos', true, NOW(), NOW()),
(14, 'Reforestación', 'Proyectos de reforestación', true, NOW(), NOW()),
(14, 'Consultorías Ambientales', 'Consultorías ambientales', true, NOW(), NOW()),
(14, 'Equipo Monitoreo', 'Equipos de monitoreo ambiental', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- 15. Otros
INSERT INTO fin_conceptos_gastos (categoria_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(15, 'Donaciones', 'Donaciones y patrocinios', true, NOW(), NOW()),
(15, 'Eventos Corporativos', 'Eventos internos', true, NOW(), NOW()),
(15, 'Relaciones Públicas', 'Gestión de relaciones públicas', true, NOW(), NOW()),
(15, 'Investigación', 'Proyectos de investigación', true, NOW(), NOW()),
(15, 'Diversos', 'Gastos no clasificados', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- CATEGORÍAS DE INGRESOS (por negocio)
-- ===========================================

-- Palma
INSERT INTO fin_categorias_ingresos (negocio_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(1, 'Venta Palma Fresca', 'Venta de palma africana fresca', true, NOW(), NOW()),
(1, 'Venta Palma Procesada', 'Venta de aceite de palma', true, NOW(), NOW()),
(1, 'Subproductos', 'Venta de subproductos del procesamiento', true, NOW(), NOW()),
(1, 'Certificaciones', 'Ingresos por certificaciones', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Plátano
INSERT INTO fin_categorias_ingresos (negocio_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(2, 'Venta Plátano Nacional', 'Venta en mercado nacional', true, NOW(), NOW()),
(2, 'Exportación', 'Venta al exterior', true, NOW(), NOW()),
(2, 'Subproductos Plátano', 'Venta de subproductos', true, NOW(), NOW()),
(2, 'Turismo Agrícola', 'Ingresos por agroturismo', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Café
INSERT INTO fin_categorias_ingresos (negocio_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(3, 'Venta Café Verde', 'Venta de café pergamino', true, NOW(), NOW()),
(3, 'Venta Café Tostado', 'Venta de café procesado', true, NOW(), NOW()),
(3, 'Exportación Café', 'Exportaciones de café', true, NOW(), NOW()),
(3, 'Turismo Cafetero', 'Experiencias turísticas', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Cacao
INSERT INTO fin_categorias_ingresos (negocio_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(4, 'Venta Cacao', 'Venta de cacao en grano', true, NOW(), NOW()),
(4, 'Chocolate Artesanal', 'Productos procesados', true, NOW(), NOW()),
(4, 'Exportación Cacao', 'Exportaciones', true, NOW(), NOW()),
(4, 'Turismo Cacaotero', 'Experiencias turísticas', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Ganadería
INSERT INTO fin_categorias_ingresos (negocio_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(5, 'Venta Ganado', 'Venta de ganado en pie', true, NOW(), NOW()),
(5, 'Leche', 'Venta de leche', true, NOW(), NOW()),
(5, 'Carne', 'Venta de carne procesada', true, NOW(), NOW()),
(5, 'Subproductos Ganaderos', 'Cuero, lana, etc.', true, NOW(), NOW()),
(5, 'Turismo Ganadero', 'Experiencias turísticas', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Forestal
INSERT INTO fin_categorias_ingresos (negocio_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(6, 'Venta Madera', 'Venta de productos madereros', true, NOW(), NOW()),
(6, 'Carbono Neutral', 'Créditos de carbono', true, NOW(), NOW()),
(6, 'Servicios Ambientales', 'Servicios ecosistémicos', true, NOW(), NOW()),
(6, 'Turismo Forestal', 'Ecoturismo', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Agroturismo
INSERT INTO fin_categorias_ingresos (negocio_id, nombre, descripcion, activo, created_at, updated_at) VALUES
(7, 'Visitas Guiadas', 'Recorridos por el cultivo', true, NOW(), NOW()),
(7, 'Hospedaje', 'Alojamiento en finca', true, NOW(), NOW()),
(7, 'Restaurante', 'Servicio de restaurante', true, NOW(), NOW()),
(7, 'Eventos', 'Organización de eventos', true, NOW(), NOW()),
(7, 'Educación', 'Programas educativos', true, NOW(), NOW()),
(7, 'Venta Productos', 'Tienda de productos locales', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- PROVEEDORES DE EJEMPLO
-- ===========================================
INSERT INTO fin_proveedores (nombre, nit, telefono, activo, created_at, updated_at) VALUES
('Agroquímicos del Valle', '901234567-1', '3101234567', true, NOW(), NOW()),
('Maquinaria Agrícola SAS', '902345678-2', '3112345678', true, NOW(), NOW()),
('Semillas Premium Ltda', '903456789-3', '3123456789', true, NOW(), NOW()),
('Fertilizantes Orgánicos SA', '904567890-4', '3134567890', true, NOW(), NOW()),
('Servicios Técnicos Agrícolas', '905678901-5', '3145678901', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- COMPRADORES DE EJEMPLO
-- ===========================================
INSERT INTO fin_compradores (nombre, telefono, email, activo, created_at, updated_at) VALUES
('Distribuidora Nacional SA', '3156789012', 'compras@distribuidora.com', true, NOW(), NOW()),
('Exportadora Internacional Ltda', '3167890123', 'import@exportadora.com', true, NOW(), NOW()),
('Supermercados Unidos', '3178901234', 'proveedores@supermercados.com', true, NOW(), NOW()),
('Cadena de Tiendas Orgánicas', '3189012345', 'compras@organicos.com', true, NOW(), NOW()),
('Restaurantes Gourmet', '3190123456', 'proveedor@gourmet.com', true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verificación de datos insertados
SELECT 'Negocios' as tabla, COUNT(*) as registros FROM fin_negocios
UNION ALL
SELECT 'Regiones' as tabla, COUNT(*) as registros FROM fin_regiones
UNION ALL
SELECT 'Medios de Pago' as tabla, COUNT(*) as registros FROM fin_medios_pago
UNION ALL
SELECT 'Categorías Gastos' as tabla, COUNT(*) as registros FROM fin_categorias_gastos
UNION ALL
SELECT 'Conceptos Gastos' as tabla, COUNT(*) as registros FROM fin_conceptos_gastos
UNION ALL
SELECT 'Categorías Ingresos' as tabla, COUNT(*) as registros FROM fin_categorias_ingresos
UNION ALL
SELECT 'Proveedores' as tabla, COUNT(*) as registros FROM fin_proveedores
UNION ALL
SELECT 'Compradores' as tabla, COUNT(*) as registros FROM fin_compradores;