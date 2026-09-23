-- =============================================================================
-- 163_copita_servicio_mal_atribuido.sql
--
-- Clase: datos. Decisión de Santiago, 2026-09-23 (cotejo de ESCO-124 contra las
-- fotos de la planilla del chequeo 2026-09-08).
--
-- QUÉ BORRA: UN evento `servicio` de COPITA (#166), fecha 2026-08-12, sin toro,
-- fuente 'chequeo', creado por el commit por foto del 2026-09-15 15:29 Bogotá
-- (id 919a60bd-eed5-41cf-88a1-810e94f64093).
--
-- POR QUÉ ES FALSO: en la planilla impresa COPITA trae "Fecha Servicio 13/2/2026"
-- (servicio que ya existe, importado). La fecha manuscrita "12/08/26" está
-- escrita en la fila de COMETA (#124), justo encima, tachando su fecha impresa.
-- El OCR la leyó en la fila de COPITA. COMETA ya tiene su servicio 2026-08-12
-- con Laredo (migración 153, paso A2), así que el hecho real está registrado
-- donde corresponde.
--
-- QUÉ NO TOCA, A PROPÓSITO:
--   * Los dos secado_real de COPITA (2026-08-12 por Martha y 2026-09-13 por
--     Fernando, ambos por Telegram). Son capturas de campo, no lecturas de foto.
--     Si uno sobra es otra decisión.
--   * La capa cruda: hato_chequeo_vacas 7cba844d… conserva fecha_servicio_raw =
--     '12/08/26' (contrato de la capa cruda, precedente 080). CONSECUENCIA
--     CONOCIDA: re-comitear el chequeo 0f7c743d regenera este evento. Cualquier
--     recaptura de ese chequeo tiene que corregir antes esa celda.
--
-- Traza: hato_eventos está en hato_correcciones (084), pero la migración corre
-- sin auth.uid(), así que no deja fila. El respaldo en `respaldos` (patrón 081)
-- es el único registro de lo borrado.
--
-- Ninguna tabla tiene FK hacia hato_eventos (verificado en pg_constraint).
-- Filas afectadas: 1 DELETE.
--
-- Sin BEGIN/COMMIT propios: apply_migration ya envuelve en una transacción.
-- =============================================================================

-- 0. Precondiciones --------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
  v_raw text;
BEGIN
  -- 0.1 El evento existe con la huella exacta revisada.
  SELECT count(*) INTO v_n
    FROM hato_eventos e
    JOIN hato_animales a ON a.id = e.animal_id
   WHERE e.id = '919a60bd-eed5-41cf-88a1-810e94f64093'
     AND a.id = '5e08a50f-0194-48c7-b183-46bc1d1f6fbd'
     AND a.numero = 166
     AND e.tipo = 'servicio'
     AND e.fecha = DATE '2026-08-12'
     AND e.fuente = 'chequeo'
     AND e.chequeo_vaca_id = '7cba844d-412f-4644-bd91-9e9881f9c769'
     AND e.toro_id IS NULL
     -- `datos` guarda el null de JSON ('null'::jsonb), no un NULL de SQL.
     AND (e.datos IS NULL OR jsonb_typeof(e.datos) = 'null');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Pre 0.1: se esperaba 1 evento con la huella revisada, hay %', v_n;
  END IF;

  -- 0.2 La celda cruda que lo originó sigue diciendo lo mismo.
  SELECT fecha_servicio_raw INTO v_raw
    FROM hato_chequeo_vacas
   WHERE id = '7cba844d-412f-4644-bd91-9e9881f9c769'
     AND chequeo_id = '0f7c743d-0d0c-428f-b3f6-aa2926477eff';
  IF v_raw IS DISTINCT FROM '12/08/26' THEN
    RAISE EXCEPTION 'Pre 0.2: fecha_servicio_raw esperada 12/08/26, encontrada %', v_raw;
  END IF;

  -- 0.3 El hecho real está en COMETA: servicio 2026-08-12 con toro.
  SELECT count(*) INTO v_n
    FROM hato_eventos e
    JOIN hato_animales a ON a.id = e.animal_id
   WHERE a.numero = 124 AND a.estado = 'activa'
     AND e.tipo = 'servicio'
     AND e.fecha = DATE '2026-08-12'
     AND e.toro_id IS NOT NULL;
  IF v_n < 1 THEN
    RAISE EXCEPTION 'Pre 0.3: COMETA no tiene su servicio 2026-08-12; no se borra la unica copia del hecho';
  END IF;

  -- 0.4 El respaldo no existe todavía.
  IF to_regclass('respaldos.backup_163_copita_servicio') IS NOT NULL THEN
    RAISE EXCEPTION 'Pre 0.4: respaldos.backup_163_copita_servicio ya existe';
  END IF;
END $$;

-- 1. Respaldo (patrón 081) -----------------------------------------------------
CREATE TABLE respaldos.backup_163_copita_servicio AS
SELECT * FROM hato_eventos WHERE id = '919a60bd-eed5-41cf-88a1-810e94f64093';

REVOKE ALL ON respaldos.backup_163_copita_servicio FROM PUBLIC, anon, authenticated;
ALTER TABLE respaldos.backup_163_copita_servicio ENABLE ROW LEVEL SECURITY;

-- 2. Borrado -------------------------------------------------------------------
DELETE FROM hato_eventos WHERE id = '919a60bd-eed5-41cf-88a1-810e94f64093';

-- 3. Postcondiciones -------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM respaldos.backup_163_copita_servicio;
  IF v_n <> 1 THEN RAISE EXCEPTION 'Post 3.1: respaldo tiene % filas', v_n; END IF;

  SELECT count(*) INTO v_n FROM hato_eventos WHERE id = '919a60bd-eed5-41cf-88a1-810e94f64093';
  IF v_n <> 0 THEN RAISE EXCEPTION 'Post 3.2: el evento sigue en hato_eventos'; END IF;

  -- Los otros eventos de COPITA quedan intactos (2 secado_real, 3 servicio, 1 parto).
  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE animal_id = '5e08a50f-0194-48c7-b183-46bc1d1f6fbd'
     AND id IN ('7ce3ab0e-0cfd-49df-bb3d-f34b19401a1e', 'f9adf9f9-c402-4971-96d9-e1460ba65d45',
                '8060addb-39c9-4fef-b7ec-1d9c9819cf59', '0bb4b32d-9fd3-4346-a4bc-82949cd0ddd0',
                '9f230f1b-1741-4e21-b8cd-dcceedc186ab', 'df590345-b565-4d7b-a474-3aee304aa4cb');
  IF v_n <> 6 THEN RAISE EXCEPTION 'Post 3.3: COPITA conserva % de sus 6 eventos restantes', v_n; END IF;

  IF has_table_privilege('anon', 'respaldos.backup_163_copita_servicio', 'SELECT')
     OR has_table_privilege('authenticated', 'respaldos.backup_163_copita_servicio', 'SELECT') THEN
    RAISE EXCEPTION 'Post 3.4: el respaldo quedo legible para un rol de navegador';
  END IF;
END $$;

-- ROLLBACK (manual, sólo si hace falta):
--   INSERT INTO hato_eventos SELECT * FROM respaldos.backup_163_copita_servicio;
