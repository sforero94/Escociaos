-- 173_cometa_chequeo_servicio_reciente.sql
--
-- ESCO-136. Decision de Santiago (2026-10-02): «mantener el servicio mas
-- reciente. Dejar el anterior, no se confirmo».
--
-- EL CASO. La fila de chequeo de COMETA #124 (chequeo 2026-09-08,
-- `hato_chequeo_vacas.id = 1e2560fc-…`) conserva el servicio IMPRESO de abril
-- (`fecha_servicio = 2026-04-14`, `meses_prenez = 4`, parto 2027-01-14, secar
-- 2026-11-14). En el papel Martha tacho esa fecha y escribio `12/08/26` a mano
-- (cabecera de la 163). `hato_eventos` ya tiene los dos servicios y esta bien:
-- el del 2026-04-14 (importacion) y el del 2026-08-12 (correccion web del
-- 2026-09-15). El motor de alertas y la Hoja de Vida derivan del ultimo
-- servicio de `hato_eventos` (calculosHato.ts, `calcularPartoProbable`), asi
-- que ya muestran lo correcto. Quien lee la fila de chequeo cruda (Esco
-- `get_hato_animal` y la tabla de historial de chequeos) ve 4 meses de prenez
-- y un parto en enero.
--
-- QUE HACE. Una sola fila, mismo patron que la 167 (COPITA):
--   fecha_servicio       2026-04-14 -> 2026-08-12  (el servicio vigente)
--   fecha_servicio_raw   '14/4/2026' -> '12/08/26' (lo que dice el papel)
--   meses_prenez         4 -> NULL  (la prenez NO se confirmo; NULL = sin dato)
--   fecha_probable_parto 2027-01-14 -> NULL (venia del servicio de abril)
--   fecha_secar          2026-11-14 -> NULL (idem)
-- El parto y el secado no se recalculan en la fila: el chequeo no los trae
-- para el servicio de agosto, y el motor ya los proyecta desde el evento.
-- Inventarlos en la fila seria poner en boca del veterinario un dato que no dio.
--
-- QUE NO TOCA, A PROPOSITO:
--   - `hato_eventos`: el servicio de abril se queda («dejar el anterior»).
--   - `pp_raw` ('14/1/2027') y `secar_raw` ('14/11/2026'): se dejan como
--     estan. CONSECUENCIA CONOCIDA: re-comitear el chequeo 0f7c743d
--     reconstruiria parto/secar desde esas dos celdas. Mismo tipo de mina que
--     la 163 documenta; si se recaptura ese chequeo, hay que revisar esta fila.
--
-- TRAZA: `hato_correcciones` (084) no deja fila (auth.uid() es NULL en una
-- migracion). El respaldo en `respaldos` es el unico registro del antes.
--
-- Filas de dominio afectadas: 1 UPDATE.
-- NO trae BEGIN;/COMMIT; -- apply_migration ya envuelve en una transaccion.

-- ---------------------------------------------------------------------------
-- 0. Respaldo (patron 081)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS respaldos.backup_173_cometa_chequeo AS
SELECT * FROM public.hato_chequeo_vacas
WHERE id = '1e2560fc-8808-4353-ba9e-c53eeb5d52e4';

ALTER TABLE respaldos.backup_173_cometa_chequeo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_173_cometa_chequeo FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Pre-condiciones
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  v_servicios int;
  v_backup int;
BEGIN
  SELECT cv.fecha_servicio, cv.fecha_servicio_raw, cv.meses_prenez,
         cv.fecha_probable_parto, cv.fecha_secar, cv.pp_raw, cv.secar_raw,
         a.id AS animal_id, a.numero, a.nombre, c.fecha AS chequeo_fecha
    INTO r
    FROM public.hato_chequeo_vacas cv
    JOIN public.hato_animales a ON a.id = cv.animal_id
    JOIN public.hato_chequeos c ON c.id = cv.chequeo_id
   WHERE cv.id = '1e2560fc-8808-4353-ba9e-c53eeb5d52e4';

  IF r IS NULL THEN
    RAISE EXCEPTION '173: la fila de chequeo objetivo no existe';
  END IF;
  IF r.numero IS DISTINCT FROM 124 OR r.nombre IS DISTINCT FROM 'COMETA' THEN
    RAISE EXCEPTION '173: la fila no es la de COMETA #124 (es % #%)', r.nombre, r.numero;
  END IF;
  IF r.chequeo_fecha IS DISTINCT FROM DATE '2026-09-08' THEN
    RAISE EXCEPTION '173: el chequeo no es el del 2026-09-08 (es %)', r.chequeo_fecha;
  END IF;

  IF r.fecha_servicio IS DISTINCT FROM DATE '2026-04-14'
     OR r.fecha_servicio_raw IS DISTINCT FROM '14/4/2026'
     OR r.meses_prenez IS DISTINCT FROM 4
     OR r.fecha_probable_parto IS DISTINCT FROM DATE '2027-01-14'
     OR r.fecha_secar IS DISTINCT FROM DATE '2026-11-14' THEN
    RAISE EXCEPTION '173: la fila ya no tiene los valores diagnosticados (servicio %, raw %, meses %, parto %, secar %) -- alguien la toco',
      r.fecha_servicio, r.fecha_servicio_raw, r.meses_prenez, r.fecha_probable_parto, r.fecha_secar;
  END IF;

  -- Los dos servicios siguen en hato_eventos; el de agosto es el ultimo
  SELECT count(*) INTO v_servicios
    FROM public.hato_eventos
   WHERE animal_id = r.animal_id AND tipo = 'servicio'
     AND fecha IN (DATE '2026-04-14', DATE '2026-08-12');
  IF v_servicios <> 2 THEN
    RAISE EXCEPTION '173: se esperaban los servicios 2026-04-14 y 2026-08-12 en hato_eventos, hay %', v_servicios;
  END IF;
  IF EXISTS (SELECT 1 FROM public.hato_eventos
              WHERE animal_id = r.animal_id AND tipo = 'servicio' AND fecha > DATE '2026-08-12') THEN
    RAISE EXCEPTION '173: COMETA tiene un servicio posterior al 2026-08-12 -- revisar antes de aplicar';
  END IF;

  SELECT count(*) INTO v_backup FROM respaldos.backup_173_cometa_chequeo;
  IF v_backup <> 1 THEN
    RAISE EXCEPTION '173: el respaldo tiene % filas, se esperaba 1', v_backup;
  END IF;

  RAISE NOTICE '173: pre-condiciones OK -- COMETA #124, chequeo 2026-09-08';
END $$;

-- ---------------------------------------------------------------------------
-- 2. La correccion
-- ---------------------------------------------------------------------------
UPDATE public.hato_chequeo_vacas
   SET fecha_servicio       = DATE '2026-08-12',
       fecha_servicio_raw   = '12/08/26',
       meses_prenez         = NULL,
       fecha_probable_parto = NULL,
       fecha_secar          = NULL
 WHERE id = '1e2560fc-8808-4353-ba9e-c53eeb5d52e4';

-- ---------------------------------------------------------------------------
-- 3. Post-condiciones
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
  ve RECORD;
  v_eventos int;
BEGIN
  SELECT fecha_servicio, fecha_servicio_raw, meses_prenez, fecha_probable_parto,
         fecha_secar, pp_raw, secar_raw
    INTO r
    FROM public.hato_chequeo_vacas
   WHERE id = '1e2560fc-8808-4353-ba9e-c53eeb5d52e4';

  IF r.fecha_servicio IS DISTINCT FROM DATE '2026-08-12'
     OR r.fecha_servicio_raw IS DISTINCT FROM '12/08/26'
     OR r.meses_prenez IS NOT NULL
     OR r.fecha_probable_parto IS NOT NULL
     OR r.fecha_secar IS NOT NULL THEN
    RAISE EXCEPTION '173 post: la fila no quedo como se esperaba';
  END IF;
  IF r.pp_raw IS DISTINCT FROM '14/1/2027' OR r.secar_raw IS DISTINCT FROM '14/11/2026' THEN
    RAISE EXCEPTION '173 post: pp_raw o secar_raw cambiaron -- no debian';
  END IF;

  -- hato_eventos intacto: los dos servicios siguen
  SELECT count(*) INTO v_eventos
    FROM public.hato_eventos e
    JOIN public.hato_animales a ON a.id = e.animal_id
   WHERE a.numero = 124 AND a.nombre = 'COMETA' AND e.tipo = 'servicio'
     AND e.fecha IN (DATE '2026-04-14', DATE '2026-08-12');
  IF v_eventos <> 2 THEN
    RAISE EXCEPTION '173 post: hato_eventos de COMETA cambio (% servicios)', v_eventos;
  END IF;

  -- Lo que lee el consumidor
  SELECT x.meses_prenez, x.fecha_probable_parto, x.ultimo_servicio_fecha
    INTO ve
    FROM public.v_hato_estado_actual x
    JOIN public.hato_animales a ON a.id = x.animal_id
   WHERE a.numero = 124 AND a.nombre = 'COMETA';
  IF ve.meses_prenez IS NOT NULL OR ve.fecha_probable_parto IS NOT NULL THEN
    RAISE EXCEPTION '173 post: la vista sigue sirviendo meses % / parto %', ve.meses_prenez, ve.fecha_probable_parto;
  END IF;
  IF ve.ultimo_servicio_fecha IS DISTINCT FROM DATE '2026-08-12' THEN
    RAISE EXCEPTION '173 post: ultimo_servicio_fecha de la vista es %', ve.ultimo_servicio_fecha;
  END IF;

  RAISE NOTICE '173 OK: COMETA -> servicio 2026-08-12, prenez sin dato';
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, no se corre automaticamente)
-- ---------------------------------------------------------------------------
-- UPDATE public.hato_chequeo_vacas cv
--    SET fecha_servicio       = b.fecha_servicio,
--        fecha_servicio_raw   = b.fecha_servicio_raw,
--        meses_prenez         = b.meses_prenez,
--        fecha_probable_parto = b.fecha_probable_parto,
--        fecha_secar          = b.fecha_secar
--   FROM respaldos.backup_173_cometa_chequeo b
--  WHERE cv.id = b.id;
