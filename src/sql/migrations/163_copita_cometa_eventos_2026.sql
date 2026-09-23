-- =============================================================================
-- 163_copita_cometa_eventos_2026.sql
--
-- Clase: datos. Decisiones de Santiago, 2026-09-23, tras cotejar las fotos de
-- la planilla del chequeo 2026-09-08 (cierre de ESCO-124):
--
--   * COPITA #166 — en 2026 su registro sólo debe tener el servicio del
--     2026-02-13 y el secado del 2026-09-13. La historia de 2025 se conserva.
--   * COMETA #124 — debe tener el servicio del 2026-08-12, toro Laredo, por
--     inseminación (ya existe, migración 153 paso A2). Su secado del
--     2026-08-12 no es real y se borra.
--
-- QUÉ BORRA (4 eventos de hato_eventos, por id literal):
--   1. 919a60bd…  COPITA  servicio 2026-08-12, sin toro, fuente 'chequeo'.
--      El OCR del commit por foto (2026-09-15 15:29) leyó en la fila de COPITA
--      la fecha manuscrita 12/08/26 que Martha escribió en la fila de COMETA,
--      justo encima, tachando la impresa.
--   2. f9adf9f9…  COPITA  secado_real 2026-08-12, Telegram (Martha, 09-08).
--   3. 0bb4b32d…  COPITA  servicio 2026-02-13, sin toro, importación. Duplicado
--      del mismo servicio: se conserva 8060addb… (Laredo, inseminación).
--   4. ed6987f3…  COMETA  secado_real 2026-08-12, web (Santiago, 08-11).
--
-- QUÉ CONSERVA (guardado por las postcondiciones):
--   * COPITA 8060addb… servicio 2026-02-13 Laredo inseminación.
--   * COPITA 7ce3ab0e… secado_real 2026-09-13 (Telegram, Fernando).
--   * COPITA 2025: parto 2025-03-03 y servicio 2025-06-07.
--   * COMETA bbf49dc3… servicio 2026-08-12 Laredo inseminación.
--
-- CAPA CRUDA, CONSECUENCIA CONOCIDA (precedente 080): hato_chequeo_vacas no se
-- toca. Los eventos 1 y 3 salieron de filas crudas (7cba844d… del chequeo
-- 2026-09-08 con fecha_servicio_raw '12/08/26', y e0563ec8… de un chequeo
-- importado). Re-comitear cualquiera de esos dos chequeos los regenera.
--
-- Traza: hato_eventos está en hato_correcciones (084), pero la migración corre
-- sin auth.uid() y no deja fila. El respaldo en `respaldos` (patrón 081) es el
-- único registro de lo borrado. Ninguna tabla tiene FK hacia hato_eventos
-- (verificado en pg_constraint 2026-09-23).
--
-- Filas afectadas: 4 DELETE. Sin BEGIN/COMMIT: apply_migration ya envuelve.
-- =============================================================================

-- 0. Precondiciones --------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
  v_raw text;
BEGIN
  -- 0.1 Los 4 eventos existen con la huella exacta revisada.
  --     `datos` puede ser el null de JSON ('null'::jsonb), no sólo NULL de SQL.
  SELECT count(*) INTO v_n
    FROM hato_eventos e
    JOIN hato_animales a ON a.id = e.animal_id
    JOIN (VALUES
      ('919a60bd-eed5-41cf-88a1-810e94f64093'::uuid, 166, 'servicio',    DATE '2026-08-12', 'chequeo'),
      ('f9adf9f9-c402-4971-96d9-e1460ba65d45'::uuid, 166, 'secado_real', DATE '2026-08-12', 'telegram'),
      ('0bb4b32d-9fd3-4346-a4bc-82949cd0ddd0'::uuid, 166, 'servicio',    DATE '2026-02-13', 'importacion'),
      ('ed6987f3-e3e7-4c6f-90a9-da4989b1c993'::uuid, 124, 'secado_real', DATE '2026-08-12', 'web')
    ) AS o(id, numero, tipo, fecha, fuente)
      ON o.id = e.id AND o.numero = a.numero AND o.tipo = e.tipo
     AND o.fecha = e.fecha AND o.fuente = e.fuente
   WHERE a.estado = 'activa'
     AND e.toro_id IS NULL;
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'Pre 0.1: se esperaban 4 eventos con la huella revisada, hay %', v_n;
  END IF;

  -- 0.2 La celda cruda que originó el evento 1 sigue diciendo lo mismo.
  SELECT fecha_servicio_raw INTO v_raw
    FROM hato_chequeo_vacas
   WHERE id = '7cba844d-412f-4644-bd91-9e9881f9c769'
     AND chequeo_id = '0f7c743d-0d0c-428f-b3f6-aa2926477eff';
  IF v_raw IS DISTINCT FROM '12/08/26' THEN
    RAISE EXCEPTION 'Pre 0.2: fecha_servicio_raw esperada 12/08/26, encontrada %', v_raw;
  END IF;

  -- 0.3 Los eventos que se conservan existen (nunca se borra la única copia).
  SELECT count(*) INTO v_n
    FROM hato_eventos e
    JOIN hato_toros t ON t.id = e.toro_id
   WHERE (e.id = '8060addb-39c9-4fef-b7ec-1d9c9819cf59' AND e.tipo = 'servicio'
          AND e.fecha = DATE '2026-02-13' AND e.tipo_servicio = 'inseminacion' AND lower(t.nombre) = 'laredo')
      OR (e.id = 'bbf49dc3-a6b0-4421-a858-ad4216c85d2b' AND e.tipo = 'servicio'
          AND e.fecha = DATE '2026-08-12' AND e.tipo_servicio = 'inseminacion' AND lower(t.nombre) = 'laredo');
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'Pre 0.3: faltan los servicios que se conservan (hay % de 2)', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE id = '7ce3ab0e-0cfd-49df-bb3d-f34b19401a1e'
     AND tipo = 'secado_real' AND fecha = DATE '2026-09-13';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Pre 0.4: falta el secado de COPITA del 2026-09-13';
  END IF;

  -- 0.5 El respaldo no existe todavía.
  IF to_regclass('respaldos.backup_163_copita_cometa_eventos') IS NOT NULL THEN
    RAISE EXCEPTION 'Pre 0.5: respaldos.backup_163_copita_cometa_eventos ya existe';
  END IF;
END $$;

-- 1. Respaldo (patrón 081) -----------------------------------------------------
CREATE TABLE respaldos.backup_163_copita_cometa_eventos AS
SELECT * FROM hato_eventos
 WHERE id IN ('919a60bd-eed5-41cf-88a1-810e94f64093',
              'f9adf9f9-c402-4971-96d9-e1460ba65d45',
              '0bb4b32d-9fd3-4346-a4bc-82949cd0ddd0',
              'ed6987f3-e3e7-4c6f-90a9-da4989b1c993');

REVOKE ALL ON respaldos.backup_163_copita_cometa_eventos FROM PUBLIC, anon, authenticated;
ALTER TABLE respaldos.backup_163_copita_cometa_eventos ENABLE ROW LEVEL SECURITY;

-- 2. Borrado -------------------------------------------------------------------
DELETE FROM hato_eventos
 WHERE id IN ('919a60bd-eed5-41cf-88a1-810e94f64093',
              'f9adf9f9-c402-4971-96d9-e1460ba65d45',
              '0bb4b32d-9fd3-4346-a4bc-82949cd0ddd0',
              'ed6987f3-e3e7-4c6f-90a9-da4989b1c993');

-- 3. Postcondiciones -------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
  v_copita uuid := '5e08a50f-0194-48c7-b183-46bc1d1f6fbd';
BEGIN
  SELECT count(*) INTO v_n FROM respaldos.backup_163_copita_cometa_eventos;
  IF v_n <> 4 THEN RAISE EXCEPTION 'Post 3.1: respaldo tiene % filas', v_n; END IF;

  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE id IN ('919a60bd-eed5-41cf-88a1-810e94f64093',
                'f9adf9f9-c402-4971-96d9-e1460ba65d45',
                '0bb4b32d-9fd3-4346-a4bc-82949cd0ddd0',
                'ed6987f3-e3e7-4c6f-90a9-da4989b1c993');
  IF v_n <> 0 THEN RAISE EXCEPTION 'Post 3.2: quedan % eventos sin borrar', v_n; END IF;

  -- 3.3 COPITA en 2026: exactamente el servicio 02-13 y el secado 09-13.
  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE animal_id = v_copita AND fecha >= DATE '2026-01-01';
  IF v_n <> 2 THEN RAISE EXCEPTION 'Post 3.3: COPITA tiene % eventos en 2026, se esperaban 2', v_n; END IF;

  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE animal_id = v_copita
     AND id IN ('8060addb-39c9-4fef-b7ec-1d9c9819cf59', '7ce3ab0e-0cfd-49df-bb3d-f34b19401a1e');
  IF v_n <> 2 THEN RAISE EXCEPTION 'Post 3.4: COPITA perdio un evento que debia conservar'; END IF;

  -- 3.5 COPITA conserva su historia de 2025.
  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE animal_id = v_copita
     AND id IN ('df590345-b565-4d7b-a474-3aee304aa4cb', '9f230f1b-1741-4e21-b8cd-dcceedc186ab');
  IF v_n <> 2 THEN RAISE EXCEPTION 'Post 3.5: COPITA perdio historia de 2025'; END IF;

  -- 3.6 COMETA conserva su servicio del 2026-08-12.
  SELECT count(*) INTO v_n FROM hato_eventos WHERE id = 'bbf49dc3-a6b0-4421-a858-ad4216c85d2b';
  IF v_n <> 1 THEN RAISE EXCEPTION 'Post 3.6: COMETA perdio su servicio del 2026-08-12'; END IF;

  IF has_table_privilege('anon', 'respaldos.backup_163_copita_cometa_eventos', 'SELECT')
     OR has_table_privilege('authenticated', 'respaldos.backup_163_copita_cometa_eventos', 'SELECT') THEN
    RAISE EXCEPTION 'Post 3.7: el respaldo quedo legible para un rol de navegador';
  END IF;
END $$;

-- ROLLBACK (manual, sólo si hace falta):
--   INSERT INTO hato_eventos SELECT * FROM respaldos.backup_163_copita_cometa_eventos;
