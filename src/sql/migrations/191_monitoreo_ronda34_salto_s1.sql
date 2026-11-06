-- 191_monitoreo_ronda34_salto_s1.sql
-- ESCO-166 · clase datos · decisión de Santiago 2026-11-06 en sesión en vivo:
--   "David armo un desorden y metio mal el monitoreo de Salto sublote 1 y luego
--    lo metio como ronda 34 solo. Ayudame a limpiar eso por favor"
--
-- Qué pasó (verificado contra producción 2026-11-06):
--   * Ronda 33 (2c6211a5, 2026-10-28): el envío de 2026-10-30 16:51:47 de
--     Salto de Tequendama Sublote 1 quedó guardado como Piedra Paula Sublote 1
--     (filas cc5b95cf Ácaro 8/35 y cfb009e0 Huevos de ácaro 4/35).
--   * El 2026-11-04 14:27 se volvió a capturar bien, pero en una ronda propia:
--     Ronda 34 (e39cde58), con solo esas 2 filas (ff37661c, 7a480263), mismos
--     valores y misma fecha_monitoreo 2026-10-28.
--   * La ronda siguiente quedó como Ronda 35 (a1db4d37, Australia + La Vega).
--
-- Qué hace (una transacción):
--   1. Respalda en `respaldos` (patrón 081) las 2 filas mal ubicadas, la Ronda 34
--      y el nombre de la Ronda 35.
--   2. Borra las 2 filas mal ubicadas en Piedra Paula S1 (Ronda 33).
--   3. Mueve las 2 filas buenas de Salto S1 de la Ronda 34 a la Ronda 33.
--   4. Borra la Ronda 34, que queda vacía.
--   5. Renombra la Ronda 35 a «Ronda 34». OBLIGATORIO: el nombre de una ronda
--      nueva es `Ronda ${count + 1}` (calculosMonitoreoV2.ts:97-100 y
--      telegram/conversations/monitoreo.ts:855-857). Sin este paso la próxima
--      ronda nueva se llamaría otra vez «Ronda 35».
--
-- Filas afectadas: 2 DELETE + 2 UPDATE en monitoreos; 1 DELETE + 1 UPDATE en
-- rondas_monitoreo. monitoreos no está trazada por ninguna tabla *_correcciones:
-- el respaldo es el único registro de lo borrado.
-- No toca mon_conductividad ni mon_colmenas (0 filas en la Ronda 34, verificado).

BEGIN;

-- ── 0. Pre-condiciones ─────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  -- Las 2 filas mal ubicadas: Ronda 33, Piedra Paula S1, valores exactos.
  SELECT count(*) INTO n FROM public.monitoreos
   WHERE ronda_id = '2c6211a5-e547-43bb-ade8-d9c42fef8521'
     AND sublote_id = '846dd0b7-4aeb-40f3-88c5-329208e10ddf'
     AND fecha_monitoreo = '2026-10-28'
     AND arboles_monitoreados = 35
     AND ((id = 'cc5b95cf-1836-44b7-aada-4a7b15824826' AND arboles_afectados = 8)
       OR (id = 'cfb009e0-315b-4d66-90ee-22bc566abaa0' AND arboles_afectados = 4));
  IF n <> 2 THEN RAISE EXCEPTION '191 pre: filas mal ubicadas esperadas 2, hay %', n; END IF;

  -- Ronda 34: exactamente las 2 filas buenas de Salto S1, mismos valores.
  SELECT count(*) INTO n FROM public.monitoreos
   WHERE ronda_id = 'e39cde58-04e2-49df-901b-80282a14a4ac';
  IF n <> 2 THEN RAISE EXCEPTION '191 pre: Ronda 34 debe tener 2 filas, tiene %', n; END IF;

  SELECT count(*) INTO n FROM public.monitoreos
   WHERE ronda_id = 'e39cde58-04e2-49df-901b-80282a14a4ac'
     AND sublote_id = 'ffaba306-ce27-46ee-9107-d7596ecbe361'
     AND lote_id = 'c3e1cf4f-5168-434e-b1f8-b630479c766e'
     AND fecha_monitoreo = '2026-10-28'
     AND arboles_monitoreados = 35
     AND ((id = 'ff37661c-4f60-4b2e-a367-ab7996a213ac' AND arboles_afectados = 8)
       OR (id = '7a480263-a0ec-4bdb-a17d-50f05df88c68' AND arboles_afectados = 4));
  IF n <> 2 THEN RAISE EXCEPTION '191 pre: filas de Salto S1 en Ronda 34 esperadas 2, hay %', n; END IF;

  -- Salto S1 no tiene nada todavía en la Ronda 33.
  SELECT count(*) INTO n FROM public.monitoreos
   WHERE ronda_id = '2c6211a5-e547-43bb-ade8-d9c42fef8521'
     AND sublote_id = 'ffaba306-ce27-46ee-9107-d7596ecbe361';
  IF n <> 0 THEN RAISE EXCEPTION '191 pre: Salto S1 ya tiene % filas en Ronda 33', n; END IF;

  -- Ronda 34 sin hijos en las otras tablas que la referencian.
  SELECT (SELECT count(*) FROM public.mon_conductividad WHERE ronda_id = 'e39cde58-04e2-49df-901b-80282a14a4ac')
       + (SELECT count(*) FROM public.mon_colmenas      WHERE ronda_id = 'e39cde58-04e2-49df-901b-80282a14a4ac')
    INTO n;
  IF n <> 0 THEN RAISE EXCEPTION '191 pre: Ronda 34 tiene % filas en mon_conductividad/mon_colmenas', n; END IF;

  -- Nombres y total de rondas tal como se revisaron.
  IF NOT EXISTS (SELECT 1 FROM public.rondas_monitoreo WHERE id = 'e39cde58-04e2-49df-901b-80282a14a4ac' AND nombre = 'Ronda 34') THEN
    RAISE EXCEPTION '191 pre: la ronda e39cde58 ya no se llama Ronda 34';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rondas_monitoreo WHERE id = 'a1db4d37-dd99-482d-a87f-34009a66b006' AND nombre = 'Ronda 35') THEN
    RAISE EXCEPTION '191 pre: la ronda a1db4d37 ya no se llama Ronda 35';
  END IF;
  SELECT count(*) INTO n FROM public.rondas_monitoreo;
  IF n <> 35 THEN RAISE EXCEPTION '191 pre: se esperaban 35 rondas, hay % (¿se abrió una ronda nueva?)', n; END IF;
END $$;

-- ── 1. Respaldo (patrón 081: fuera de public, RLS sin políticas, sin grants) ──
CREATE TABLE respaldos.backup_191_monitoreos AS
  SELECT * FROM public.monitoreos
   WHERE id IN ('cc5b95cf-1836-44b7-aada-4a7b15824826','cfb009e0-315b-4d66-90ee-22bc566abaa0',
                'ff37661c-4f60-4b2e-a367-ab7996a213ac','7a480263-a0ec-4bdb-a17d-50f05df88c68');
CREATE TABLE respaldos.backup_191_rondas_monitoreo AS
  SELECT * FROM public.rondas_monitoreo
   WHERE id IN ('e39cde58-04e2-49df-901b-80282a14a4ac','a1db4d37-dd99-482d-a87f-34009a66b006');
ALTER TABLE respaldos.backup_191_monitoreos ENABLE ROW LEVEL SECURITY;
ALTER TABLE respaldos.backup_191_rondas_monitoreo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_191_monitoreos, respaldos.backup_191_rondas_monitoreo FROM PUBLIC, anon, authenticated;

-- ── 2. Borrar las 2 filas mal ubicadas en Piedra Paula S1 ──────────────────
DELETE FROM public.monitoreos
 WHERE id IN ('cc5b95cf-1836-44b7-aada-4a7b15824826','cfb009e0-315b-4d66-90ee-22bc566abaa0')
   AND ronda_id = '2c6211a5-e547-43bb-ade8-d9c42fef8521'
   AND sublote_id = '846dd0b7-4aeb-40f3-88c5-329208e10ddf';

-- ── 3. Mover las 2 filas de Salto S1 a la Ronda 33 ─────────────────────────
UPDATE public.monitoreos
   SET ronda_id = '2c6211a5-e547-43bb-ade8-d9c42fef8521'
 WHERE id IN ('ff37661c-4f60-4b2e-a367-ab7996a213ac','7a480263-a0ec-4bdb-a17d-50f05df88c68')
   AND ronda_id = 'e39cde58-04e2-49df-901b-80282a14a4ac';

-- ── 4. Borrar la Ronda 34 vacía ────────────────────────────────────────────
DELETE FROM public.rondas_monitoreo WHERE id = 'e39cde58-04e2-49df-901b-80282a14a4ac';

-- ── 5. Renombrar la Ronda 35 a Ronda 34 ────────────────────────────────────
UPDATE public.rondas_monitoreo SET nombre = 'Ronda 34'
 WHERE id = 'a1db4d37-dd99-482d-a87f-34009a66b006' AND nombre = 'Ronda 35';

-- ── 6. Post-condiciones ────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM respaldos.backup_191_monitoreos;
  IF n <> 4 THEN RAISE EXCEPTION '191 post: respaldo de monitoreos debe tener 4 filas, tiene %', n; END IF;
  SELECT count(*) INTO n FROM respaldos.backup_191_rondas_monitoreo;
  IF n <> 2 THEN RAISE EXCEPTION '191 post: respaldo de rondas debe tener 2 filas, tiene %', n; END IF;

  -- Piedra Paula S1 en Ronda 33: solo el envío original (4 plagas).
  SELECT count(*) INTO n FROM public.monitoreos
   WHERE ronda_id = '2c6211a5-e547-43bb-ade8-d9c42fef8521' AND sublote_id = '846dd0b7-4aeb-40f3-88c5-329208e10ddf';
  IF n <> 4 THEN RAISE EXCEPTION '191 post: Piedra Paula S1 debe quedar con 4 filas, tiene %', n; END IF;

  -- Salto S1 en Ronda 33: las 2 filas movidas.
  SELECT count(*) INTO n FROM public.monitoreos
   WHERE ronda_id = '2c6211a5-e547-43bb-ade8-d9c42fef8521' AND sublote_id = 'ffaba306-ce27-46ee-9107-d7596ecbe361';
  IF n <> 2 THEN RAISE EXCEPTION '191 post: Salto S1 debe tener 2 filas en Ronda 33, tiene %', n; END IF;

  -- Ronda 33: 16 filas, los 6 sublotes de Piedra Paula y Salto.
  SELECT count(*) INTO n FROM public.monitoreos WHERE ronda_id = '2c6211a5-e547-43bb-ade8-d9c42fef8521';
  IF n <> 16 THEN RAISE EXCEPTION '191 post: Ronda 33 debe tener 16 filas, tiene %', n; END IF;
  SELECT count(DISTINCT sublote_id) INTO n FROM public.monitoreos WHERE ronda_id = '2c6211a5-e547-43bb-ade8-d9c42fef8521';
  IF n <> 6 THEN RAISE EXCEPTION '191 post: Ronda 33 debe cubrir 6 sublotes, cubre %', n; END IF;

  -- Rondas: 34, sin huecos de nombre, ninguna «Ronda 35».
  SELECT count(*) INTO n FROM public.rondas_monitoreo;
  IF n <> 34 THEN RAISE EXCEPTION '191 post: se esperaban 34 rondas, hay %', n; END IF;
  IF EXISTS (SELECT 1 FROM public.rondas_monitoreo WHERE nombre = 'Ronda 35') THEN
    RAISE EXCEPTION '191 post: todavía existe una Ronda 35';
  END IF;
  IF (SELECT count(*) FROM public.rondas_monitoreo WHERE nombre = 'Ronda 34') <> 1 THEN
    RAISE EXCEPTION '191 post: debe haber exactamente una Ronda 34';
  END IF;
  IF EXISTS (SELECT 1 FROM public.monitoreos m LEFT JOIN public.rondas_monitoreo r ON r.id = m.ronda_id
              WHERE m.ronda_id IS NOT NULL AND r.id IS NULL) THEN
    RAISE EXCEPTION '191 post: quedaron monitoreos con ronda_id huérfano';
  END IF;
END $$;

COMMIT;

-- ── ROLLBACK (ejecutable; restaura desde respaldos) ────────────────────────
-- BEGIN;
-- UPDATE public.rondas_monitoreo SET nombre = 'Ronda 35' WHERE id = 'a1db4d37-dd99-482d-a87f-34009a66b006';
-- INSERT INTO public.rondas_monitoreo SELECT * FROM respaldos.backup_191_rondas_monitoreo
--  WHERE id = 'e39cde58-04e2-49df-901b-80282a14a4ac';
-- UPDATE public.monitoreos SET ronda_id = 'e39cde58-04e2-49df-901b-80282a14a4ac'
--  WHERE id IN ('ff37661c-4f60-4b2e-a367-ab7996a213ac','7a480263-a0ec-4bdb-a17d-50f05df88c68');
-- INSERT INTO public.monitoreos SELECT * FROM respaldos.backup_191_monitoreos
--  WHERE id IN ('cc5b95cf-1836-44b7-aada-4a7b15824826','cfb009e0-315b-4d66-90ee-22bc566abaa0');
-- COMMIT;
