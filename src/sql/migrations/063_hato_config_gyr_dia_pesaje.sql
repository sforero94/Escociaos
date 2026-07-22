-- =====================================================================
-- 063: Hato Lechero — gyr en el catálogo de razas + día de pesaje semanal
-- Fecha: 2026-07-22
--
-- Dos decisiones del dueño (segunda ronda, 2026-07-22 — plan §8):
--
-- (a) "Sí, agregar Gyr". La raza gyr aparece ~101 veces en las planillas
--     históricas (columna Toro: `gir`/`GIR`) y el motor ya la reconoce
--     (`parseSX` mapea /gu?ir/ -> 'gyr' desde S2), pero el catálogo sembrado
--     por la migración 058 solo traía jersey/holstein/normanda. Se agrega
--     al array `razas`.
--
--     ⚠️ `meses_secado_por_raza` NO se toca: el dueño no definió un secado
--     específico para gyr, así que aplica `_default` (2 meses) — igual que
--     cualquier raza fuera de la tabla. Definirlo es una decisión de negocio
--     pendiente, no un hueco de esta migración.
--
-- (b) "Asume que el pesaje se hace los miércoles de cada semana". Las
--     planillas de leche del formato nuevo solo dicen "SEMANA 1..4" sin día,
--     así que sin esta regla no hay fecha calendario que insertar en
--     `hato_pesajes_leche.fecha` (pregunta abierta #4 de S2, cerrada por el
--     dueño). Se siembra como clave de configuración — ninguna constante de
--     negocio vive en código (plan §7.1) — para que el backfill de leche (S5)
--     y el formulario de pesaje la lean de aquí.
--
-- Idempotente: seguro de re-ejecutar. El UPDATE de razas solo agrega gyr si
-- no está ya; el INSERT usa ON CONFLICT DO NOTHING.
-- =====================================================================

-- (a) gyr al catálogo de razas — solo si aún no está en el array.
UPDATE hato_config
SET valor = valor || '["gyr"]'::jsonb
WHERE clave = 'razas'
  AND NOT (valor @> '["gyr"]'::jsonb);

-- (b) día de la semana del pesaje de leche (1=lunes … 7=domingo, ISO-8601;
--     se guarda también el nombre para que la UI no tenga que mapear).
INSERT INTO hato_config (clave, valor, descripcion)
VALUES
  ('dia_pesaje_semanal', '{"iso": 3, "nombre": "miercoles"}'::jsonb,
    'Día de la semana en que se pesa la leche por vaca (decisión del dueño '
    '2026-07-22: miércoles). Usado por el backfill de S5 para derivar la '
    'fecha calendario de cada lectura "SEMANA N", y por el formulario de '
    'pesaje como default.')
ON CONFLICT (clave) DO NOTHING;
