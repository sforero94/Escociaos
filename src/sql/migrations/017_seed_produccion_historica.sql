-- Migration 017: Seed historical production data (2023-2026)
-- Data source: Business records for Escocia Hass avocado farm
-- Using exact lote IDs from database

-- =====================================================
-- LOTE UUID CONSTANTS (for reference)
-- =====================================================
-- PP (Piedra Paula):     fffc5477-fe42-4660-8fd8-301f8d1a312b
-- ST (Salto Tequendama): c3e1cf4f-5168-434e-b1f8-b630479c766e
-- AU (Australia):        5588e8c8-7519-472e-a78c-47b56216c24c
-- LV (La Vega):          ee810553-4108-4a6e-8494-63491954d59b
-- PG (Pedregal):         fa5864d0-85a7-4b6e-b222-c71417f5a6ee
-- UN (La Unión):         ccdd4075-6a24-4d19-b345-e21a47e6a81e
-- IR (Irlanda):          c1ce4ce0-76a7-4d8f-a320-36c7395613df
-- AC (Acueducto):        95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6

-- =====================================================
-- HELPER FUNCTION FOR SUBLOTES
-- =====================================================
CREATE OR REPLACE FUNCTION get_sublote_id(p_lote_id UUID, p_numero INTEGER) RETURNS UUID AS $$
DECLARE
  result UUID;
BEGIN
  SELECT id INTO result FROM sublotes
  WHERE lote_id = p_lote_id AND numero_sublote = p_numero LIMIT 1;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- LOTE-LEVEL DATA (All 7 harvests: P23, T23, P24, T24, P25, T25, P26)
-- =====================================================

-- Principal 2023
INSERT INTO produccion (lote_id, sublote_id, ano, cosecha_tipo, kg_totales, arboles_registrados) VALUES
('fffc5477-fe42-4660-8fd8-301f8d1a312b', NULL, 2023, 'Principal', 1635, 1755),   -- PP
('c3e1cf4f-5168-434e-b1f8-b630479c766e', NULL, 2023, 'Principal', 1756, 1496),   -- ST
('5588e8c8-7519-472e-a78c-47b56216c24c', NULL, 2023, 'Principal', 1080, 1873),   -- AU
('ee810553-4108-4a6e-8494-63491954d59b', NULL, 2023, 'Principal', 932, 2102),    -- LV
('ccdd4075-6a24-4d19-b345-e21a47e6a81e', NULL, 2023, 'Principal', 0, 886),       -- UN
('fa5864d0-85a7-4b6e-b222-c71417f5a6ee', NULL, 2023, 'Principal', 0, 759),       -- PG
('c1ce4ce0-76a7-4d8f-a320-36c7395613df', NULL, 2023, 'Principal', 0, 1578),      -- IR
('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', NULL, 2023, 'Principal', 0, 5252)       -- AC
ON CONFLICT (lote_id, sublote_id, ano, cosecha_tipo) DO NOTHING;

-- Traviesa 2023
INSERT INTO produccion (lote_id, sublote_id, ano, cosecha_tipo, kg_totales, arboles_registrados) VALUES
('fffc5477-fe42-4660-8fd8-301f8d1a312b', NULL, 2023, 'Traviesa', 1096, 1755),    -- PP
('c3e1cf4f-5168-434e-b1f8-b630479c766e', NULL, 2023, 'Traviesa', 1527, 1496),    -- ST
('5588e8c8-7519-472e-a78c-47b56216c24c', NULL, 2023, 'Traviesa', 252, 1873),     -- AU
('ee810553-4108-4a6e-8494-63491954d59b', NULL, 2023, 'Traviesa', 306, 2102),     -- LV
('ccdd4075-6a24-4d19-b345-e21a47e6a81e', NULL, 2023, 'Traviesa', 0, 886),        -- UN
('fa5864d0-85a7-4b6e-b222-c71417f5a6ee', NULL, 2023, 'Traviesa', 0, 759),        -- PG
('c1ce4ce0-76a7-4d8f-a320-36c7395613df', NULL, 2023, 'Traviesa', 0, 1578),       -- IR
('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', NULL, 2023, 'Traviesa', 0, 5252)        -- AC
ON CONFLICT (lote_id, sublote_id, ano, cosecha_tipo) DO NOTHING;

-- Principal 2024
INSERT INTO produccion (lote_id, sublote_id, ano, cosecha_tipo, kg_totales, arboles_registrados) VALUES
('fffc5477-fe42-4660-8fd8-301f8d1a312b', NULL, 2024, 'Principal', 17547, 1755),  -- PP
('c3e1cf4f-5168-434e-b1f8-b630479c766e', NULL, 2024, 'Principal', 13094, 1496),  -- ST
('5588e8c8-7519-472e-a78c-47b56216c24c', NULL, 2024, 'Principal', 4991, 1873),   -- AU
('ee810553-4108-4a6e-8494-63491954d59b', NULL, 2024, 'Principal', 4607, 2102),   -- LV
('ccdd4075-6a24-4d19-b345-e21a47e6a81e', NULL, 2024, 'Principal', 91, 886),      -- UN
('fa5864d0-85a7-4b6e-b222-c71417f5a6ee', NULL, 2024, 'Principal', 0, 759),       -- PG
('c1ce4ce0-76a7-4d8f-a320-36c7395613df', NULL, 2024, 'Principal', 0, 1525),      -- IR
('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', NULL, 2024, 'Principal', 0, 4197)       -- AC
ON CONFLICT (lote_id, sublote_id, ano, cosecha_tipo) DO NOTHING;

-- Traviesa 2024
INSERT INTO produccion (lote_id, sublote_id, ano, cosecha_tipo, kg_totales, arboles_registrados) VALUES
('fffc5477-fe42-4660-8fd8-301f8d1a312b', NULL, 2024, 'Traviesa', 17274, 1755),   -- PP
('c3e1cf4f-5168-434e-b1f8-b630479c766e', NULL, 2024, 'Traviesa', 14174, 1496),   -- ST
('5588e8c8-7519-472e-a78c-47b56216c24c', NULL, 2024, 'Traviesa', 5610, 1873),    -- AU
('ee810553-4108-4a6e-8494-63491954d59b', NULL, 2024, 'Traviesa', 8827, 2120),    -- LV
('ccdd4075-6a24-4d19-b345-e21a47e6a81e', NULL, 2024, 'Traviesa', 742, 886),      -- UN
('fa5864d0-85a7-4b6e-b222-c71417f5a6ee', NULL, 2024, 'Traviesa', 0, 759),        -- PG
('c1ce4ce0-76a7-4d8f-a320-36c7395613df', NULL, 2024, 'Traviesa', 128, 1006),     -- IR
('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', NULL, 2024, 'Traviesa', 338, 3742)      -- AC
ON CONFLICT (lote_id, sublote_id, ano, cosecha_tipo) DO NOTHING;

-- Principal 2025
INSERT INTO produccion (lote_id, sublote_id, ano, cosecha_tipo, kg_totales, arboles_registrados) VALUES
('fffc5477-fe42-4660-8fd8-301f8d1a312b', NULL, 2025, 'Principal', 10392, 1552),  -- PP
('c3e1cf4f-5168-434e-b1f8-b630479c766e', NULL, 2025, 'Principal', 8313, 1407),   -- ST
('5588e8c8-7519-472e-a78c-47b56216c24c', NULL, 2025, 'Principal', 7505, 1584),   -- AU
('ee810553-4108-4a6e-8494-63491954d59b', NULL, 2025, 'Principal', 7253, 1806),   -- LV
('ccdd4075-6a24-4d19-b345-e21a47e6a81e', NULL, 2025, 'Principal', 718, 599),     -- UN
('fa5864d0-85a7-4b6e-b222-c71417f5a6ee', NULL, 2025, 'Principal', 151, 599),     -- PG
('c1ce4ce0-76a7-4d8f-a320-36c7395613df', NULL, 2025, 'Principal', 637, 1206),    -- IR
('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', NULL, 2025, 'Principal', 829, 3184)     -- AC
ON CONFLICT (lote_id, sublote_id, ano, cosecha_tipo) DO NOTHING;

-- Traviesa 2025
INSERT INTO produccion (lote_id, sublote_id, ano, cosecha_tipo, kg_totales, arboles_registrados) VALUES
('fffc5477-fe42-4660-8fd8-301f8d1a312b', NULL, 2025, 'Traviesa', 18697, 1552),   -- PP
('c3e1cf4f-5168-434e-b1f8-b630479c766e', NULL, 2025, 'Traviesa', 16814, 1407),   -- ST
('5588e8c8-7519-472e-a78c-47b56216c24c', NULL, 2025, 'Traviesa', 15812, 1584),   -- AU
('ee810553-4108-4a6e-8494-63491954d59b', NULL, 2025, 'Traviesa', 18331, 1806),   -- LV
('ccdd4075-6a24-4d19-b345-e21a47e6a81e', NULL, 2025, 'Traviesa', 2357, 599),     -- UN
('fa5864d0-85a7-4b6e-b222-c71417f5a6ee', NULL, 2025, 'Traviesa', 386, 599),      -- PG
('c1ce4ce0-76a7-4d8f-a320-36c7395613df', NULL, 2025, 'Traviesa', 1129, 1206),    -- IR
('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', NULL, 2025, 'Traviesa', 1832, 3184)     -- AC
ON CONFLICT (lote_id, sublote_id, ano, cosecha_tipo) DO NOTHING;

-- Principal 2026
INSERT INTO produccion (lote_id, sublote_id, ano, cosecha_tipo, kg_totales, arboles_registrados) VALUES
('fffc5477-fe42-4660-8fd8-301f8d1a312b', NULL, 2026, 'Principal', 3702, 1552),   -- PP
('c3e1cf4f-5168-434e-b1f8-b630479c766e', NULL, 2026, 'Principal', 4221, 1407),   -- ST
('5588e8c8-7519-472e-a78c-47b56216c24c', NULL, 2026, 'Principal', 2926, 1584),   -- AU
('ee810553-4108-4a6e-8494-63491954d59b', NULL, 2026, 'Principal', 3088, 1806),   -- LV
('ccdd4075-6a24-4d19-b345-e21a47e6a81e', NULL, 2026, 'Principal', 275, 599),     -- UN
('fa5864d0-85a7-4b6e-b222-c71417f5a6ee', NULL, 2026, 'Principal', 285, 599),     -- PG
('c1ce4ce0-76a7-4d8f-a320-36c7395613df', NULL, 2026, 'Principal', 637, 1206),    -- IR
('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', NULL, 2026, 'Principal', 761, 3184)     -- AC
ON CONFLICT (lote_id, sublote_id, ano, cosecha_tipo) DO NOTHING;

-- =====================================================
-- SUBLOTE-LEVEL DATA (4 harvests: T24, P25, T25, P26)
-- Using helper function with exact lote UUIDs
-- =====================================================

-- Traviesa 2024 - Sublote data
INSERT INTO produccion (lote_id, sublote_id, ano, cosecha_tipo, kg_totales, arboles_registrados) VALUES
-- PP Sublotes
('fffc5477-fe42-4660-8fd8-301f8d1a312b', get_sublote_id('fffc5477-fe42-4660-8fd8-301f8d1a312b', 1), 2024, 'Traviesa', 3658, 585),
('fffc5477-fe42-4660-8fd8-301f8d1a312b', get_sublote_id('fffc5477-fe42-4660-8fd8-301f8d1a312b', 2), 2024, 'Traviesa', 6655, 585),
('fffc5477-fe42-4660-8fd8-301f8d1a312b', get_sublote_id('fffc5477-fe42-4660-8fd8-301f8d1a312b', 3), 2024, 'Traviesa', 7087, 585),
-- ST Sublotes
('c3e1cf4f-5168-434e-b1f8-b630479c766e', get_sublote_id('c3e1cf4f-5168-434e-b1f8-b630479c766e', 1), 2024, 'Traviesa', 4547, 499),
('c3e1cf4f-5168-434e-b1f8-b630479c766e', get_sublote_id('c3e1cf4f-5168-434e-b1f8-b630479c766e', 2), 2024, 'Traviesa', 5893, 499),
('c3e1cf4f-5168-434e-b1f8-b630479c766e', get_sublote_id('c3e1cf4f-5168-434e-b1f8-b630479c766e', 3), 2024, 'Traviesa', 3588, 498),
-- AU Sublotes
('5588e8c8-7519-472e-a78c-47b56216c24c', get_sublote_id('5588e8c8-7519-472e-a78c-47b56216c24c', 1), 2024, 'Traviesa', 3302, 624),
('5588e8c8-7519-472e-a78c-47b56216c24c', get_sublote_id('5588e8c8-7519-472e-a78c-47b56216c24c', 2), 2024, 'Traviesa', 449, 624),
('5588e8c8-7519-472e-a78c-47b56216c24c', get_sublote_id('5588e8c8-7519-472e-a78c-47b56216c24c', 3), 2024, 'Traviesa', 1894, 625),
-- LV Sublotes
('ee810553-4108-4a6e-8494-63491954d59b', get_sublote_id('ee810553-4108-4a6e-8494-63491954d59b', 1), 2024, 'Traviesa', 1035, 707),
('ee810553-4108-4a6e-8494-63491954d59b', get_sublote_id('ee810553-4108-4a6e-8494-63491954d59b', 2), 2024, 'Traviesa', 5272, 706),
('ee810553-4108-4a6e-8494-63491954d59b', get_sublote_id('ee810553-4108-4a6e-8494-63491954d59b', 3), 2024, 'Traviesa', 2460, 707),
-- UN Sublotes
('ccdd4075-6a24-4d19-b345-e21a47e6a81e', get_sublote_id('ccdd4075-6a24-4d19-b345-e21a47e6a81e', 1), 2024, 'Traviesa', 762, 295),
-- IR Sublotes
('c1ce4ce0-76a7-4d8f-a320-36c7395613df', get_sublote_id('c1ce4ce0-76a7-4d8f-a320-36c7395613df', 3), 2024, 'Traviesa', 342, 335),
-- AC Sublotes
('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', get_sublote_id('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', 1), 2024, 'Traviesa', 338, 1247)
ON CONFLICT (lote_id, sublote_id, ano, cosecha_tipo) DO NOTHING;

-- Principal 2025 - Sublote data
INSERT INTO produccion (lote_id, sublote_id, ano, cosecha_tipo, kg_totales, arboles_registrados) VALUES
-- PP Sublotes
('fffc5477-fe42-4660-8fd8-301f8d1a312b', get_sublote_id('fffc5477-fe42-4660-8fd8-301f8d1a312b', 1), 2025, 'Principal', 2977, 517),
('fffc5477-fe42-4660-8fd8-301f8d1a312b', get_sublote_id('fffc5477-fe42-4660-8fd8-301f8d1a312b', 2), 2025, 'Principal', 3847, 518),
('fffc5477-fe42-4660-8fd8-301f8d1a312b', get_sublote_id('fffc5477-fe42-4660-8fd8-301f8d1a312b', 3), 2025, 'Principal', 3505, 517),
-- ST Sublotes
('c3e1cf4f-5168-434e-b1f8-b630479c766e', get_sublote_id('c3e1cf4f-5168-434e-b1f8-b630479c766e', 1), 2025, 'Principal', 1805, 469),
('c3e1cf4f-5168-434e-b1f8-b630479c766e', get_sublote_id('c3e1cf4f-5168-434e-b1f8-b630479c766e', 2), 2025, 'Principal', 2720, 469),
('c3e1cf4f-5168-434e-b1f8-b630479c766e', get_sublote_id('c3e1cf4f-5168-434e-b1f8-b630479c766e', 3), 2025, 'Principal', 3838, 469),
-- AU Sublotes
('5588e8c8-7519-472e-a78c-47b56216c24c', get_sublote_id('5588e8c8-7519-472e-a78c-47b56216c24c', 1), 2025, 'Principal', 4692, 528),
('5588e8c8-7519-472e-a78c-47b56216c24c', get_sublote_id('5588e8c8-7519-472e-a78c-47b56216c24c', 2), 2025, 'Principal', 818, 528),
('5588e8c8-7519-472e-a78c-47b56216c24c', get_sublote_id('5588e8c8-7519-472e-a78c-47b56216c24c', 3), 2025, 'Principal', 1989, 528),
-- LV Sublotes
('ee810553-4108-4a6e-8494-63491954d59b', get_sublote_id('ee810553-4108-4a6e-8494-63491954d59b', 1), 2025, 'Principal', 1420, 602),
('ee810553-4108-4a6e-8494-63491954d59b', get_sublote_id('ee810553-4108-4a6e-8494-63491954d59b', 2), 2025, 'Principal', 2370, 602),
('ee810553-4108-4a6e-8494-63491954d59b', get_sublote_id('ee810553-4108-4a6e-8494-63491954d59b', 3), 2025, 'Principal', 3306, 602),
-- UN Sublotes
('ccdd4075-6a24-4d19-b345-e21a47e6a81e', get_sublote_id('ccdd4075-6a24-4d19-b345-e21a47e6a81e', 1), 2025, 'Principal', 717, 200),
-- IR Sublotes
('c1ce4ce0-76a7-4d8f-a320-36c7395613df', get_sublote_id('c1ce4ce0-76a7-4d8f-a320-36c7395613df', 1), 2025, 'Principal', 190, 402),
('c1ce4ce0-76a7-4d8f-a320-36c7395613df', get_sublote_id('c1ce4ce0-76a7-4d8f-a320-36c7395613df', 2), 2025, 'Principal', 95, 402),
('c1ce4ce0-76a7-4d8f-a320-36c7395613df', get_sublote_id('c1ce4ce0-76a7-4d8f-a320-36c7395613df', 3), 2025, 'Principal', 342, 402),
-- AC Sublotes
('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', get_sublote_id('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', 1), 2025, 'Principal', 247, 1061),
('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', get_sublote_id('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', 2), 2025, 'Principal', 171, 1061),
('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', get_sublote_id('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', 3), 2025, 'Principal', 361, 1062)
ON CONFLICT (lote_id, sublote_id, ano, cosecha_tipo) DO NOTHING;

-- Traviesa 2025 - Sublote data
INSERT INTO produccion (lote_id, sublote_id, ano, cosecha_tipo, kg_totales, arboles_registrados) VALUES
-- PP Sublotes
('fffc5477-fe42-4660-8fd8-301f8d1a312b', get_sublote_id('fffc5477-fe42-4660-8fd8-301f8d1a312b', 1), 2025, 'Traviesa', 6665, 517),
('fffc5477-fe42-4660-8fd8-301f8d1a312b', get_sublote_id('fffc5477-fe42-4660-8fd8-301f8d1a312b', 2), 2025, 'Traviesa', 7056, 518),
('fffc5477-fe42-4660-8fd8-301f8d1a312b', get_sublote_id('fffc5477-fe42-4660-8fd8-301f8d1a312b', 3), 2025, 'Traviesa', 5013, 517),
-- ST Sublotes
('c3e1cf4f-5168-434e-b1f8-b630479c766e', get_sublote_id('c3e1cf4f-5168-434e-b1f8-b630479c766e', 1), 2025, 'Traviesa', 6201, 469),
('c3e1cf4f-5168-434e-b1f8-b630479c766e', get_sublote_id('c3e1cf4f-5168-434e-b1f8-b630479c766e', 2), 2025, 'Traviesa', 7093, 469),
('c3e1cf4f-5168-434e-b1f8-b630479c766e', get_sublote_id('c3e1cf4f-5168-434e-b1f8-b630479c766e', 3), 2025, 'Traviesa', 3460, 469),
-- AU Sublotes
('5588e8c8-7519-472e-a78c-47b56216c24c', get_sublote_id('5588e8c8-7519-472e-a78c-47b56216c24c', 1), 2025, 'Traviesa', 9419, 528),
('5588e8c8-7519-472e-a78c-47b56216c24c', get_sublote_id('5588e8c8-7519-472e-a78c-47b56216c24c', 2), 2025, 'Traviesa', 1273, 528),
('5588e8c8-7519-472e-a78c-47b56216c24c', get_sublote_id('5588e8c8-7519-472e-a78c-47b56216c24c', 3), 2025, 'Traviesa', 4705, 528),
-- LV Sublotes
('ee810553-4108-4a6e-8494-63491954d59b', get_sublote_id('ee810553-4108-4a6e-8494-63491954d59b', 1), 2025, 'Traviesa', 2784, 602),
('ee810553-4108-4a6e-8494-63491954d59b', get_sublote_id('ee810553-4108-4a6e-8494-63491954d59b', 2), 2025, 'Traviesa', 8597, 602),
('ee810553-4108-4a6e-8494-63491954d59b', get_sublote_id('ee810553-4108-4a6e-8494-63491954d59b', 3), 2025, 'Traviesa', 6765, 602),
-- UN Sublotes
('ccdd4075-6a24-4d19-b345-e21a47e6a81e', get_sublote_id('ccdd4075-6a24-4d19-b345-e21a47e6a81e', 1), 2025, 'Traviesa', 1600, 200),
('ccdd4075-6a24-4d19-b345-e21a47e6a81e', get_sublote_id('ccdd4075-6a24-4d19-b345-e21a47e6a81e', 2), 2025, 'Traviesa', 478, 200),
('ccdd4075-6a24-4d19-b345-e21a47e6a81e', get_sublote_id('ccdd4075-6a24-4d19-b345-e21a47e6a81e', 3), 2025, 'Traviesa', 268, 199),
-- PG Sublotes
('fa5864d0-85a7-4b6e-b222-c71417f5a6ee', get_sublote_id('fa5864d0-85a7-4b6e-b222-c71417f5a6ee', 1), 2025, 'Traviesa', 380, 300),
-- IR Sublotes
('c1ce4ce0-76a7-4d8f-a320-36c7395613df', get_sublote_id('c1ce4ce0-76a7-4d8f-a320-36c7395613df', 1), 2025, 'Traviesa', 286, 402),
('c1ce4ce0-76a7-4d8f-a320-36c7395613df', get_sublote_id('c1ce4ce0-76a7-4d8f-a320-36c7395613df', 2), 2025, 'Traviesa', 323, 402),
('c1ce4ce0-76a7-4d8f-a320-36c7395613df', get_sublote_id('c1ce4ce0-76a7-4d8f-a320-36c7395613df', 3), 2025, 'Traviesa', 476, 402),
-- AC Sublotes
('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', get_sublote_id('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', 1), 2025, 'Traviesa', 613, 1061),
('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', get_sublote_id('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', 2), 2025, 'Traviesa', 230, 1061),
('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', get_sublote_id('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', 3), 2025, 'Traviesa', 1012, 1062)
ON CONFLICT (lote_id, sublote_id, ano, cosecha_tipo) DO NOTHING;

-- Principal 2026 - Sublote data
INSERT INTO produccion (lote_id, sublote_id, ano, cosecha_tipo, kg_totales, arboles_registrados) VALUES
-- PP Sublotes
('fffc5477-fe42-4660-8fd8-301f8d1a312b', get_sublote_id('fffc5477-fe42-4660-8fd8-301f8d1a312b', 1), 2026, 'Principal', 965, 517),
('fffc5477-fe42-4660-8fd8-301f8d1a312b', get_sublote_id('fffc5477-fe42-4660-8fd8-301f8d1a312b', 2), 2026, 'Principal', 1408, 518),
('fffc5477-fe42-4660-8fd8-301f8d1a312b', get_sublote_id('fffc5477-fe42-4660-8fd8-301f8d1a312b', 3), 2026, 'Principal', 1294, 517),
-- ST Sublotes
('c3e1cf4f-5168-434e-b1f8-b630479c766e', get_sublote_id('c3e1cf4f-5168-434e-b1f8-b630479c766e', 1), 2026, 'Principal', 1286, 469),
('c3e1cf4f-5168-434e-b1f8-b630479c766e', get_sublote_id('c3e1cf4f-5168-434e-b1f8-b630479c766e', 2), 2026, 'Principal', 687, 469),
('c3e1cf4f-5168-434e-b1f8-b630479c766e', get_sublote_id('c3e1cf4f-5168-434e-b1f8-b630479c766e', 3), 2026, 'Principal', 2210, 469),
-- AU Sublotes
('5588e8c8-7519-472e-a78c-47b56216c24c', get_sublote_id('5588e8c8-7519-472e-a78c-47b56216c24c', 1), 2026, 'Principal', 2126, 528),
('5588e8c8-7519-472e-a78c-47b56216c24c', get_sublote_id('5588e8c8-7519-472e-a78c-47b56216c24c', 2), 2026, 'Principal', 308, 528),
('5588e8c8-7519-472e-a78c-47b56216c24c', get_sublote_id('5588e8c8-7519-472e-a78c-47b56216c24c', 3), 2026, 'Principal', 482, 528),
-- LV Sublotes
('ee810553-4108-4a6e-8494-63491954d59b', get_sublote_id('ee810553-4108-4a6e-8494-63491954d59b', 1), 2026, 'Principal', 965, 602),
('ee810553-4108-4a6e-8494-63491954d59b', get_sublote_id('ee810553-4108-4a6e-8494-63491954d59b', 2), 2026, 'Principal', 367, 602),
('ee810553-4108-4a6e-8494-63491954d59b', get_sublote_id('ee810553-4108-4a6e-8494-63491954d59b', 3), 2026, 'Principal', 1737, 602),
-- UN Sublotes
('ccdd4075-6a24-4d19-b345-e21a47e6a81e', get_sublote_id('ccdd4075-6a24-4d19-b345-e21a47e6a81e', 1), 2026, 'Principal', 60, 200),
('ccdd4075-6a24-4d19-b345-e21a47e6a81e', get_sublote_id('ccdd4075-6a24-4d19-b345-e21a47e6a81e', 2), 2026, 'Principal', 220, 200),
-- PG Sublotes
('fa5864d0-85a7-4b6e-b222-c71417f5a6ee', get_sublote_id('fa5864d0-85a7-4b6e-b222-c71417f5a6ee', 1), 2026, 'Principal', 80, 300),
('fa5864d0-85a7-4b6e-b222-c71417f5a6ee', get_sublote_id('fa5864d0-85a7-4b6e-b222-c71417f5a6ee', 2), 2026, 'Principal', 200, 299),
-- IR Sublotes
('c1ce4ce0-76a7-4d8f-a320-36c7395613df', get_sublote_id('c1ce4ce0-76a7-4d8f-a320-36c7395613df', 1), 2026, 'Principal', 120, 402),
('c1ce4ce0-76a7-4d8f-a320-36c7395613df', get_sublote_id('c1ce4ce0-76a7-4d8f-a320-36c7395613df', 2), 2026, 'Principal', 100, 402),
('c1ce4ce0-76a7-4d8f-a320-36c7395613df', get_sublote_id('c1ce4ce0-76a7-4d8f-a320-36c7395613df', 3), 2026, 'Principal', 400, 402),
-- AC Sublotes
('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', get_sublote_id('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', 1), 2026, 'Principal', 220, 1061),
('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', get_sublote_id('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', 2), 2026, 'Principal', 120, 1061),
('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', get_sublote_id('95ce6644-2fbe-4ff8-b5b8-3a3ec57bc0b6', 3), 2026, 'Principal', 420, 1062)
ON CONFLICT (lote_id, sublote_id, ano, cosecha_tipo) DO NOTHING;

-- =====================================================
-- CLEANUP HELPER FUNCTION
-- =====================================================
DROP FUNCTION IF EXISTS get_sublote_id(UUID, INTEGER);
