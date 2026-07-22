-- =====================================================================
-- 062: capa normalizada del ESTADO del chequeo + umbral de espera voluntaria
-- Fecha: 2026-07-22
--
-- Cierra una brecha que S2 destapó al implementar la decisión D-2 del dueño
-- ("ESTADO='ok' = vacía APTA esperando celo", 2026-07-22).
--
-- QUÉ FALTABA: `hato_chequeo_vacas` (migración 053) guarda `estado_raw TEXT`
-- —la celda verbatim— pero NO tiene contraparte normalizada, a diferencia de
-- todas las demás columnas de esa tabla (`pl_raw`→`pl`, `sx_raw`→…,
-- `secar_raw`→`fecha_secar`, etc.). Y `v_hato_estado_actual` (056) tampoco
-- lo expone. Resultado: `parseEstado()` de `calculosHato.ts` produce una
-- clasificación que no tenía dónde aterrizar, y la máquina de estados no
-- podía distinguir vacía-normal de vacía-problema con la señal real del
-- chequeo — caía a un proxy temporal.
--
-- (a) `hato_chequeo_vacas.estado` — clasificación normalizada, nullable.
--     El vocabulario es exactamente el `TipoEstado` del motor:
--       vacia_apta      -- 'ok'/'0k'/'OK': vacía sana esperando celo (D-2)
--       vacia_problema  -- 'rech'/'rechq'/'rec'/'r': requiere rechequeo
--       fecha_heredada  -- la celda trae una FECHA, no un código: residuo de
--                          la columna `SEC REAL`/`parto real` de la Gen 1 de
--                          planillas (2019), que ocupaba esta misma posición.
--                          Su semántica exacta (¿secado real o parto real?)
--                          sigue SIN RESOLVER — el dueño debe definirla; por
--                          eso se marca aparte en vez de asumir una.
--       desconocido     -- 'momia', '3m', etc.: se preserva el crudo.
--     NULL = celda vacía. Ausencia de dato, nunca "vacía apta" por defecto:
--     misma regla de "sin dato ≠ 0" que gobierna todo el módulo.
--
-- (b) `v_hato_estado_actual` expone `ultimo_estado_chequeo` (la columna nueva
--     del chequeo más reciente de cada animal). Se agrega AL FINAL del SELECT:
--     CREATE OR REPLACE VIEW sólo admite columnas nuevas al final, nunca
--     reordenar ni insertar en medio.
--
-- (c) `hato_config.dias_espera_voluntaria_post_parto` — días tras el parto
--     durante los cuales una vaca vacía es NORMAL (período de espera
--     voluntario) y todavía no cuenta como problema.
--
--     ⚠️ EL VALOR 60 ES UN DEFAULT PROVISIONAL, NO UNA CIFRA CONFIRMADA POR
--     EL DUEÑO. Se siembra por la misma razón que los 9 defaults de la
--     migración 058: que el motor corra antes de que exista la UI de Ajustes
--     (S10). Sin esta clave, S2 estaba reutilizando
--     `dias_servicio_sin_confirmacion` (45) como proxy — dos conceptos
--     distintos compartiendo un umbral, de modo que cambiar uno movía
--     silenciosamente el otro. Separarlos es el punto de esta clave.
--     CONFIRMAR CON EL DUEÑO antes de que el motor de alertas (S6) empiece a
--     escribirle a Fernando con base en ella.
--
-- RLS: no se toca. `hato_chequeo_vacas` y `hato_config` ya tienen sus
-- políticas de 053/058, y una columna nueva las hereda.
--
-- Idempotente: seguro de re-ejecutar. ON CONFLICT DO NOTHING nunca pisa una
-- edición ya hecha por Gerencia.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (a) Capa normalizada del estado
-- ---------------------------------------------------------------------

ALTER TABLE hato_chequeo_vacas
  ADD COLUMN IF NOT EXISTS estado TEXT;

ALTER TABLE hato_chequeo_vacas
  DROP CONSTRAINT IF EXISTS hato_chequeo_vacas_estado_check;
ALTER TABLE hato_chequeo_vacas
  ADD CONSTRAINT hato_chequeo_vacas_estado_check
  CHECK (estado IS NULL OR estado IN ('vacia_apta', 'vacia_problema', 'fecha_heredada', 'desconocido'));

COMMENT ON COLUMN hato_chequeo_vacas.estado IS
  'Clasificación normalizada de estado_raw (TipoEstado de calculosHato.ts). '
  'NULL = celda vacía: ausencia de dato, nunca "vacia_apta" por defecto.';

-- ---------------------------------------------------------------------
-- (b) Exponerlo en la vista derivada (columna NUEVA al final)
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW v_hato_estado_actual AS
WITH ultimo_chequeo AS (
  SELECT DISTINCT ON (cv.animal_id)
    cv.animal_id,
    cv.id AS chequeo_vaca_id,
    c.fecha AS chequeo_fecha,
    cv.pl,
    cv.meses_prenez,
    cv.fecha_secar,
    cv.fecha_probable_parto,
    cv.estado
  FROM hato_chequeo_vacas cv
  JOIN hato_chequeos c ON c.id = cv.chequeo_id
  ORDER BY cv.animal_id, c.fecha DESC, cv.created_at DESC
),
ultimo_servicio AS (
  SELECT DISTINCT ON (animal_id)
    animal_id,
    fecha,
    toro_id,
    tipo_servicio
  FROM hato_eventos
  WHERE tipo = 'servicio'
  ORDER BY animal_id, fecha DESC
),
ultimo_parto AS (
  SELECT animal_id, MAX(fecha) AS fecha, COUNT(*) AS num_partos
  FROM hato_eventos
  WHERE tipo = 'parto'
  GROUP BY animal_id
),
ultimo_secado_real AS (
  SELECT animal_id, MAX(fecha) AS fecha
  FROM hato_eventos
  WHERE tipo = 'secado_real'
  GROUP BY animal_id
),
ultima_confirmacion AS (
  SELECT animal_id, MAX(fecha) AS fecha
  FROM hato_eventos
  WHERE tipo = 'confirmacion_prenez'
  GROUP BY animal_id
),
ultimo_evento AS (
  SELECT animal_id, MAX(fecha) AS fecha
  FROM hato_eventos
  GROUP BY animal_id
)
SELECT
  a.id AS animal_id,
  a.numero,
  a.nombre,
  a.etapa,
  a.raza,
  a.estado,
  uc.chequeo_vaca_id AS ultimo_chequeo_vaca_id,
  uc.chequeo_fecha AS ultimo_chequeo_fecha,
  uc.pl,
  uc.meses_prenez,
  uc.fecha_secar,
  uc.fecha_probable_parto,
  us.fecha AS ultimo_servicio_fecha,
  us.toro_id AS ultimo_servicio_toro_id,
  us.tipo_servicio AS ultimo_tipo_servicio,
  up.fecha AS ultimo_parto_fecha,
  COALESCE(up.num_partos, 0) AS num_partos,
  usr.fecha AS ultimo_secado_real_fecha,
  ucp.fecha AS ultima_confirmacion_prenez_fecha,
  ue.fecha AS ultimo_evento_fecha,
  -- Columna nueva de 062: SIEMPRE al final (CREATE OR REPLACE VIEW no permite
  -- insertar en medio ni reordenar).
  uc.estado AS ultimo_estado_chequeo
FROM hato_animales a
LEFT JOIN ultimo_chequeo uc ON uc.animal_id = a.id
LEFT JOIN ultimo_servicio us ON us.animal_id = a.id
LEFT JOIN ultimo_parto up ON up.animal_id = a.id
LEFT JOIN ultimo_secado_real usr ON usr.animal_id = a.id
LEFT JOIN ultima_confirmacion ucp ON ucp.animal_id = a.id
LEFT JOIN ultimo_evento ue ON ue.animal_id = a.id;

-- La vista sigue siendo security_invoker (ver nota en 056 — nunca DEFINER).
ALTER VIEW v_hato_estado_actual SET (security_invoker = true);

-- ---------------------------------------------------------------------
-- (c) Umbral propio para el período de espera voluntario post-parto
-- ---------------------------------------------------------------------

INSERT INTO hato_config (clave, valor, descripcion)
VALUES
  ('dias_espera_voluntaria_post_parto', '60'::jsonb,
    'Días tras el parto durante los cuales una vaca vacía se considera NORMAL '
    '(período de espera voluntario), no un problema (D-2, 2026-07-22). '
    'DEFAULT PROVISIONAL — pendiente de confirmar con el dueño antes de que S6 '
    'dispare alertas con base en él.')
ON CONFLICT (clave) DO NOTHING;
