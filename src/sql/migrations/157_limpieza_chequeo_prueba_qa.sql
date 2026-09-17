-- =============================================================================
-- 157_limpieza_chequeo_prueba_qa.sql
--
-- ARCHIVO DE REGISTRO -- NO APLICAR.
--
-- Esta migracion YA CORRIO en produccion el 2026-09-16 02:28:12 UTC SIN que
-- su archivo existiera en el repo (ESCO-112 / issue #268). Se registro en el
-- ledger de Supabase como version `20260916022812`, name
-- `limpieza_chequeo_prueba_qa_2020_01_15`. El cuerpo de abajo se recupero
-- literal de `supabase_migrations.schema_migrations.statements` el
-- 2026-09-17.
--
-- EL NUMERO 157 ES SOLO EL SIGUIENTE SLOT LIBRE. Cronologicamente esta
-- migracion va DESPUES de la 154 (`20260915204017`) y ANTES de la 147
-- aplicada a mano (`20260916154436`). El issue pedia el prefijo 155, pero
-- `155_novedades_autor_y_uso.sql` y `156_retirar_acciones_recomendadas.sql`
-- ya ocupan esos numeros en `main` (hatoSchemaContract.test.ts exige
-- prefijos unicos desde 053). Mismo criterio que 067 / 079 / 108 / 144.
--
-- QUE HIZO: borro el chequeo de PRUEBA QA (fecha decoy 2020-01-15,
-- chequeo_id da0220b2-24af-4f77-a175-e9c27bb966ee) y su rastro: 31
-- hato_eventos, 42 hato_chequeo_vacas, 1 hato_chequeos. Respaldo en
-- `respaldos.backup_qa_test_chequeo*` (patron 081). El chequeo REAL
-- 0f7c743d (34 filas) no se toco.
--
-- NO re-aplicar: las filas de dominio ya no existen; las guardas de
-- precondicion abortarian. El respaldo en `respaldos` es el unico registro
-- de lo borrado (hato_correcciones no traza service_role).
-- =============================================================================

-- ------------- CUERPO RECUPERADO (no ejecutar) -------------------------------
-- Limpieza del chequeo de PRUEBA (QA end-to-end del plan de novedades del
-- chequeo, 2026-09-16), fecha decoy 2020-01-15, chequeo_id da0220b2-24af-
-- 4f77-a175-e9c27bb966ee. Reutilizo las 2 fotos reales del 2026-09-08/09
-- para probar en vivo la promocion de filas y la reactivacion, contra
-- produccion, con una fecha de cabecera en el pasado para no chocar con el
-- chequeo real 0f7c743d. Efecto secundario esperado y verificado: como la
-- fecha de cabecera queda ANTES que las fechas de servicio reales de las
-- filas (2026-09-08), la ventana de deduplicacion de la 259 (evento.fecha
-- <= chequeo.fecha) no cubre esos eventos manuales -- un chequeo real
-- nunca puede fecharse antes de los servicios que registra, asi que esto
-- es una limitacion de la prueba, no del codigo. Verificado en vivo: la
-- 259 SI funciono correctamente en la recaptura real de Santiago el mismo
-- 2026-09-08 (fecha de cabecera = fecha real), que es la prueba que
-- realmente valida el fix.
--
-- Esta migracion borra TODO lo que el commit de prueba escribio: 31
-- hato_eventos, 42 hato_chequeo_vacas, 1 hato_chequeos. Incluye los 2
-- duplicados reales de MONZA/AMAPOLA (mismo patron que la 154) y las 29
-- filas restantes, que son datos de prueba, no una decision de producto.
-- Respaldo completo en `respaldos` antes de borrar (patron 081). Orden:
-- eventos primero (hato_eventos_chequeo_vaca_id_fkey es NO ACTION, no
-- CASCADE), despues chequeo_vacas, despues el chequeo.

DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM hato_chequeos WHERE id = 'da0220b2-24af-4f77-a175-e9c27bb966ee' AND fecha = DATE '2020-01-15';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'LIMPIEZA ABORTADA (0.1): el chequeo de prueba da0220b2 ya no coincide con el estado esperado.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_chequeo_vacas WHERE chequeo_id = 'da0220b2-24af-4f77-a175-e9c27bb966ee';
  IF v_n <> 42 THEN
    RAISE EXCEPTION 'LIMPIEZA ABORTADA (0.2): se esperaban 42 hato_chequeo_vacas, hay %.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM hato_eventos WHERE chequeo_vaca_id IN (SELECT id FROM hato_chequeo_vacas WHERE chequeo_id = 'da0220b2-24af-4f77-a175-e9c27bb966ee');
  IF v_n <> 31 THEN
    RAISE EXCEPTION 'LIMPIEZA ABORTADA (0.3): se esperaban 31 hato_eventos, hay %.', v_n;
  END IF;
  RAISE NOTICE 'LIMPIEZA (pre): OK -- 1 chequeo, 42 chequeo_vacas, 31 eventos.';
END $$;

CREATE SCHEMA IF NOT EXISTS respaldos;

CREATE TABLE respaldos.backup_qa_test_chequeo_eventos AS
SELECT * FROM hato_eventos WHERE chequeo_vaca_id IN (SELECT id FROM hato_chequeo_vacas WHERE chequeo_id = 'da0220b2-24af-4f77-a175-e9c27bb966ee');

CREATE TABLE respaldos.backup_qa_test_chequeo_vacas AS
SELECT * FROM hato_chequeo_vacas WHERE chequeo_id = 'da0220b2-24af-4f77-a175-e9c27bb966ee';

CREATE TABLE respaldos.backup_qa_test_chequeo AS
SELECT * FROM hato_chequeos WHERE id = 'da0220b2-24af-4f77-a175-e9c27bb966ee';

ALTER TABLE respaldos.backup_qa_test_chequeo_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE respaldos.backup_qa_test_chequeo_vacas ENABLE ROW LEVEL SECURITY;
ALTER TABLE respaldos.backup_qa_test_chequeo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_qa_test_chequeo_eventos FROM anon, authenticated, PUBLIC;
REVOKE ALL ON respaldos.backup_qa_test_chequeo_vacas FROM anon, authenticated, PUBLIC;
REVOKE ALL ON respaldos.backup_qa_test_chequeo FROM anon, authenticated, PUBLIC;

DELETE FROM hato_eventos WHERE chequeo_vaca_id IN (SELECT id FROM hato_chequeo_vacas WHERE chequeo_id = 'da0220b2-24af-4f77-a175-e9c27bb966ee');
DELETE FROM hato_chequeo_vacas WHERE chequeo_id = 'da0220b2-24af-4f77-a175-e9c27bb966ee';
DELETE FROM hato_chequeos WHERE id = 'da0220b2-24af-4f77-a175-e9c27bb966ee';

DO $$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM hato_chequeos WHERE id = 'da0220b2-24af-4f77-a175-e9c27bb966ee';
  IF v_n <> 0 THEN RAISE EXCEPTION 'LIMPIEZA ABORTADA (post 1): el chequeo de prueba sobrevivio.'; END IF;

  SELECT count(*) INTO v_n FROM hato_eventos e WHERE e.animal_id = (SELECT id FROM hato_animales WHERE numero=135) AND e.tipo='servicio' AND e.fecha = DATE '2026-09-08' AND e.tipo_servicio='inseminacion';
  IF v_n <> 1 THEN RAISE EXCEPTION 'LIMPIEZA ABORTADA (post 2): MONZA quedo con % servicios de inseminacion el 09-08, se esperaba 1.', v_n; END IF;

  SELECT count(*) INTO v_n FROM hato_eventos e WHERE e.animal_id = (SELECT id FROM hato_animales WHERE numero=140) AND e.tipo='servicio' AND e.fecha = DATE '2026-09-08' AND e.tipo_servicio='inseminacion';
  IF v_n <> 1 THEN RAISE EXCEPTION 'LIMPIEZA ABORTADA (post 3): AMAPOLA quedo con % servicios de inseminacion el 09-08, se esperaba 1.', v_n; END IF;

  SELECT count(*) INTO v_n FROM hato_chequeo_vacas WHERE chequeo_id = '0f7c743d-0d0c-428f-b3f6-aa2926477eff';
  IF v_n <> 34 THEN RAISE EXCEPTION 'LIMPIEZA ABORTADA (post 4): el chequeo REAL 0f7c743d ya no tiene 34 filas (tiene %) -- no debia haberse tocado.', v_n; END IF;

  RAISE NOTICE 'LIMPIEZA (post): OK -- chequeo de prueba borrado, MONZA/AMAPOLA con 1 evento cada una, chequeo real intacto con 34 filas.';
END $$;
-- ------------- FIN DEL CUERPO RECUPERADO -------------------------------------
