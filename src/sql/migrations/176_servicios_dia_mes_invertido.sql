-- 176_servicios_dia_mes_invertido.sql
--
-- ESCO-140. Decision de Santiago (2026-10-05): «si estas seguro que las
-- fechas son correctas con evidencia contra los chequeos antiguos, adelante».
--
-- EL CASO. Cuatro eventos `servicio` capturados por Telegram quedaron con el
-- dia y el mes invertidos. Los escribio UNA sola transaccion sin traza (xmin
-- 519336), entre el 2026-09-15 20:43Z y el 2026-09-19 16:01Z:
--
--   evento    animal              guardado     real
--   2feb80b5  MAGNIFICA #103      2026-09-03   2026-03-09
--   716fead3  FUERZA #167         2026-09-04   2026-04-09
--   3e623fae  FLACA #5182         2026-09-05   2026-05-09
--   4242c49c  ESMERALDA #5162     2026-09-04   2026-04-09  (muerta 2026-09-19)
--
-- LA EVIDENCIA, externa a las filas que se corrigen:
--   - Chequeo 2026-07-09 (importado 2026-07-23, antes de la escritura mala):
--     `fecha_servicio_raw` = '9/3/2026', '9/4/2026', '9/5/2026', '9/4/2026'.
--     El formato del papel es D/M en toda la historia de estos animales
--     ('16/12/2024', '30/1/2025', '24/11/2024').
--   - `meses_prenez` del mismo chequeo cuadra solo con la fecha real:
--     MAGNIFICA 4, FUERZA 3, ESMERALDA 3, FLACA 2 meses al 2026-07-09. Con la
--     fecha guardada serian servicios FUTUROS respecto del chequeo.
--   - Chequeo 2026-09-08: mismas celdas, prenez 5/4/4/3, un mes mas.
--   - `pp_raw` del chequeo: MAGNIFICA '9/12/2026', FUERZA '9/1/2027',
--     FLACA '9/2/2027' -- nueve meses despues de la fecha real.
--   - Respaldos previos: `respaldos.backup_153_hato_eventos` guarda 2feb80b5
--     con 2026-03-09, y `respaldos.backup_139_*` guarda FLACA con 2026-05-09.
--
-- POR QUE IMPORTA. El motor proyecta el secado desde
-- `v_hato_estado_actual.ultimo_servicio_fecha`. Con 2026-09-03, MAGNIFICA no
-- recibe la alerta de secado del 2026-10-09 y figura como recien servida.
--
-- QUE HACE. 4 UPDATE por id literal: fecha = make_date(anio, dia, mes).
-- QUE NO TOCA: `hato_chequeo_vacas` (ya esta bien), toro, tipo_servicio,
-- `datos`, ni ningun otro evento.
--
-- INDICE UNICO `hato_eventos_manual_unico` (139): verificado antes de
-- escribir, 0 colisiones con la fecha corregida.
--
-- TRAZA: `hato_correcciones` (084) no deja fila (auth.uid() es NULL en una
-- migracion). El respaldo en `respaldos` es el unico registro del antes.
--
-- Filas de dominio afectadas: 4 UPDATE.
-- NO trae BEGIN;/COMMIT; -- apply_migration ya envuelve en una transaccion.

-- ---------------------------------------------------------------------------
-- 0. Respaldo (patron 081)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS respaldos.backup_176_servicios_dm_swap AS
SELECT * FROM public.hato_eventos
WHERE id IN ('2feb80b5-dc92-4af5-a0ae-b6c95c6789ad',
             '716fead3-9d00-4235-9099-01e7ed496c42',
             '3e623fae-1240-4668-97fd-afa7b3bad4fc',
             '4242c49c-0dda-484a-af9c-f4e17a9b2342');

ALTER TABLE respaldos.backup_176_servicios_dm_swap ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_176_servicios_dm_swap FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- 1. Pre-condiciones
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_ok int;
  v_backup int;
  v_colision int;
BEGIN
  SELECT count(*) INTO v_ok
    FROM public.hato_eventos e
    JOIN public.hato_animales a ON a.id = e.animal_id
   WHERE e.tipo = 'servicio' AND e.chequeo_vaca_id IS NULL AND e.fuente = 'telegram'
     AND (   (e.id = '2feb80b5-dc92-4af5-a0ae-b6c95c6789ad' AND a.numero = 103  AND a.nombre = 'MAGNIFICA' AND e.fecha = DATE '2026-09-03')
          OR (e.id = '716fead3-9d00-4235-9099-01e7ed496c42' AND a.numero = 167  AND a.nombre = 'FUERZA'    AND e.fecha = DATE '2026-09-04')
          OR (e.id = '3e623fae-1240-4668-97fd-afa7b3bad4fc' AND a.numero = 5182 AND a.nombre = 'FLACA'     AND e.fecha = DATE '2026-09-05')
          OR (e.id = '4242c49c-0dda-484a-af9c-f4e17a9b2342' AND a.numero = 5162 AND a.nombre = 'ESMERALDA' AND e.fecha = DATE '2026-09-04'));
  IF v_ok <> 4 THEN
    RAISE EXCEPTION '176: se esperaban 4 eventos con las fechas invertidas diagnosticadas, hay % -- alguien los toco', v_ok;
  END IF;

  -- La evidencia sigue en el chequeo del 2026-07-09
  SELECT count(*) INTO v_ok
    FROM public.hato_chequeo_vacas cv
    JOIN public.hato_chequeos c ON c.id = cv.chequeo_id
    JOIN public.hato_eventos e ON e.animal_id = cv.animal_id
   WHERE c.fecha = DATE '2026-07-09'
     AND e.id IN ('2feb80b5-dc92-4af5-a0ae-b6c95c6789ad',
                  '716fead3-9d00-4235-9099-01e7ed496c42',
                  '3e623fae-1240-4668-97fd-afa7b3bad4fc',
                  '4242c49c-0dda-484a-af9c-f4e17a9b2342')
     AND cv.fecha_servicio = make_date(extract(year FROM e.fecha)::int,
                                       extract(day FROM e.fecha)::int,
                                       extract(month FROM e.fecha)::int);
  IF v_ok <> 4 THEN
    RAISE EXCEPTION '176: el chequeo 2026-07-09 ya no respalda las 4 fechas (coinciden %)', v_ok;
  END IF;

  -- Sin colision con el indice unico de la 139
  SELECT count(*) INTO v_colision
    FROM public.hato_eventos e
    JOIN public.hato_eventos x
      ON x.animal_id = e.animal_id AND x.tipo = e.tipo AND x.id <> e.id
     AND x.chequeo_vaca_id IS NULL
     AND x.fecha = make_date(extract(year FROM e.fecha)::int,
                             extract(day FROM e.fecha)::int,
                             extract(month FROM e.fecha)::int)
     AND COALESCE(x.toro_id, '00000000-0000-0000-0000-000000000000'::uuid)
       = COALESCE(e.toro_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND COALESCE(x.tipo_servicio, '') = COALESCE(e.tipo_servicio, '')
   WHERE e.id IN ('2feb80b5-dc92-4af5-a0ae-b6c95c6789ad',
                  '716fead3-9d00-4235-9099-01e7ed496c42',
                  '3e623fae-1240-4668-97fd-afa7b3bad4fc',
                  '4242c49c-0dda-484a-af9c-f4e17a9b2342');
  IF v_colision <> 0 THEN
    RAISE EXCEPTION '176: % eventos ya existen con la fecha corregida', v_colision;
  END IF;

  SELECT count(*) INTO v_backup FROM respaldos.backup_176_servicios_dm_swap;
  IF v_backup <> 4 THEN
    RAISE EXCEPTION '176: el respaldo tiene % filas, se esperaban 4', v_backup;
  END IF;

  RAISE NOTICE '176: pre-condiciones OK -- 4 servicios con dia/mes invertido';
END $$;

-- ---------------------------------------------------------------------------
-- 2. La correccion
-- ---------------------------------------------------------------------------
UPDATE public.hato_eventos
   SET fecha = make_date(extract(year FROM fecha)::int,
                         extract(day FROM fecha)::int,
                         extract(month FROM fecha)::int)
 WHERE id IN ('2feb80b5-dc92-4af5-a0ae-b6c95c6789ad',
              '716fead3-9d00-4235-9099-01e7ed496c42',
              '3e623fae-1240-4668-97fd-afa7b3bad4fc',
              '4242c49c-0dda-484a-af9c-f4e17a9b2342');

-- ---------------------------------------------------------------------------
-- 3. Post-condiciones
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_ok int;
  v_otros int;
BEGIN
  SELECT count(*) INTO v_ok
    FROM public.hato_eventos
   WHERE (id = '2feb80b5-dc92-4af5-a0ae-b6c95c6789ad' AND fecha = DATE '2026-03-09')
      OR (id = '716fead3-9d00-4235-9099-01e7ed496c42' AND fecha = DATE '2026-04-09')
      OR (id = '3e623fae-1240-4668-97fd-afa7b3bad4fc' AND fecha = DATE '2026-05-09')
      OR (id = '4242c49c-0dda-484a-af9c-f4e17a9b2342' AND fecha = DATE '2026-04-09');
  IF v_ok <> 4 THEN
    RAISE EXCEPTION '176 post: solo % de 4 eventos quedaron con la fecha real', v_ok;
  END IF;

  -- Nada mas cambio en esas filas
  SELECT count(*) INTO v_otros
    FROM public.hato_eventos e
    JOIN respaldos.backup_176_servicios_dm_swap b ON b.id = e.id
   WHERE e.animal_id IS DISTINCT FROM b.animal_id
      OR e.tipo IS DISTINCT FROM b.tipo
      OR e.toro_id IS DISTINCT FROM b.toro_id
      OR e.tipo_servicio IS DISTINCT FROM b.tipo_servicio
      OR e.datos IS DISTINCT FROM b.datos
      OR e.fuente IS DISTINCT FROM b.fuente;
  IF v_otros <> 0 THEN
    RAISE EXCEPTION '176 post: % filas cambiaron algo mas que la fecha', v_otros;
  END IF;

  -- Lo que lee el motor de alertas (las tres vivas)
  SELECT count(*) INTO v_ok
    FROM public.v_hato_estado_actual v
    JOIN public.hato_animales a ON a.id = v.animal_id
   WHERE (a.numero = 103  AND a.nombre = 'MAGNIFICA' AND v.ultimo_servicio_fecha = DATE '2026-03-09')
      OR (a.numero = 167  AND a.nombre = 'FUERZA'    AND v.ultimo_servicio_fecha = DATE '2026-04-09')
      OR (a.numero = 5182 AND a.nombre = 'FLACA'     AND v.ultimo_servicio_fecha = DATE '2026-05-09');
  IF v_ok <> 3 THEN
    RAISE EXCEPTION '176 post: la vista sirve el ultimo servicio correcto en % de 3 animales', v_ok;
  END IF;

  RAISE NOTICE '176 OK: MAGNIFICA 03-09, FUERZA 04-09, FLACA 05-09, ESMERALDA 04-09';
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, no se corre automaticamente)
-- ---------------------------------------------------------------------------
-- UPDATE public.hato_eventos e
--    SET fecha = b.fecha
--   FROM respaldos.backup_176_servicios_dm_swap b
--  WHERE e.id = b.id;
