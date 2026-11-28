-- =============================================================================
-- 200: venus_ficha_fantasma
-- ESTADO: ESCRITA, SIN APLICAR (clase datos). Necesita el sí de Santiago.
-- ESCO-186. No aplicar sin aprobación explícita en la conversación.
-- =============================================================================
--
-- Qué pasó (hato_correcciones, 2026-11-20, un solo usuario web):
--   22:38:40  se registró en la web un parto de VENUS #151 (2026-09-19). El
--             flujo de ESCO-135 creó la ficha automática de la ternera
--             (a6068a6d…, #218 SIN NOMBRE).
--   22:38:58  se borró ese parto desde la Hoja de Vida. La ficha automática
--             quedó viva y huérfana: es el defecto de ESCO-186, que el PR
--             #490 corrige en el código.
--   después   la ficha se renombró, se marcó muerta (evento 8cd9073c, causa
--             "cria murio", re-fechado a 2026-09-20), se editó como un
--             duplicado de VENUS #151 y al final quedó `descartada`, con
--             número, nombre y fecha de nacimiento en NULL.
--
-- La VENUS real (c0e928a5…) está activa con la chapeta 151 y conserva su
-- parto de Telegram del 2026-09-15. No se toca.
--
-- Qué hace: borra el evento de muerte y la ficha fantasma. Nada más.
--   1 DELETE en hato_eventos (8cd9073c…), primero, porque cuelga de la ficha.
--   1 DELETE en hato_animales (a6068a6d…).
--
-- Una migración no deja traza en hato_correcciones (084 retorna con
-- auth.uid() NULL). El respaldo en `respaldos` es el único registro.
--
-- ROLLBACK al pie.
-- =============================================================================

SET LOCAL lock_timeout = '2s';

LOCK TABLE public.hato_eventos, public.hato_animales IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE
  v_cria  constant uuid := 'a6068a6d-557b-4869-9461-5a070dfadd57';
  v_ev    constant uuid := '8cd9073c-fd9e-4fe3-8528-679486eb8d95';
  v_venus constant uuid := 'c0e928a5-f883-4025-98ff-48ad151b4653';
  v_refs  bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'respaldos' AND table_name LIKE 'backup_200_%') THEN
    RAISE EXCEPTION '200: ya existe un respaldo backup_200_*; no se re-ejecuta';
  END IF;

  -- Las dos filas tienen que ser exactamente las revisadas el 2026-11-26.
  IF NOT EXISTS (SELECT 1 FROM public.hato_eventos e
                 WHERE e.id = v_ev AND e.animal_id = v_cria AND e.tipo = 'muerte'
                   AND md5(to_jsonb(e)::text) = '5d0a983172e72aae61bdc4edc595bff4') THEN
    RAISE EXCEPTION '200: el evento de muerte cambió o no existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hato_animales a
                 WHERE a.id = v_cria AND a.estado = 'descartada'
                   AND a.import_meta->>'origen' = 'parto_automatico'
                   AND a.import_meta->>'madre_id' = v_venus::text
                   AND md5(to_jsonb(a)::text) = '5e7f92106f59ccd21063a6e068affa88') THEN
    RAISE EXCEPTION '200: la ficha fantasma cambió o no existe';
  END IF;

  -- Ninguna otra referencia a la ficha (las 10 que cuenta el Deshacer de
  -- Telegram), salvo el evento de muerte que se borra.
  SELECT (SELECT count(*) FROM public.hato_eventos WHERE animal_id = v_cria AND id <> v_ev)
       + (SELECT count(*) FROM public.hato_eventos WHERE cria_id = v_cria)
       + (SELECT count(*) FROM public.hato_animales WHERE madre_id = v_cria OR padre_id = v_cria)
       + (SELECT count(*) FROM public.hato_chequeo_vacas WHERE animal_id = v_cria)
       + (SELECT count(*) FROM public.hato_pesajes_leche WHERE animal_id = v_cria)
       + (SELECT count(*) FROM public.hato_tratamientos WHERE animal_id = v_cria)
       + (SELECT count(*) FROM public.hato_pajillas_uso WHERE animal_id = v_cria)
       + (SELECT count(*) FROM public.hato_alertas WHERE animal_id = v_cria)
       + (SELECT count(*) FROM public.fin_transacciones_ganado WHERE hato_animal_id = v_cria)
    INTO v_refs;
  IF v_refs <> 0 THEN
    RAISE EXCEPTION '200: la ficha tiene % referencias además de su muerte', v_refs;
  END IF;

  -- La VENUS real sigue activa con la 151.
  IF NOT EXISTS (SELECT 1 FROM public.hato_animales
                 WHERE id = v_venus AND estado = 'activa' AND numero = 151) THEN
    RAISE EXCEPTION '200: la VENUS real no está activa con la chapeta 151';
  END IF;
END $$;

CREATE TABLE respaldos.backup_200_venus_evento_muerte AS
SELECT * FROM public.hato_eventos
WHERE id = '8cd9073c-fd9e-4fe3-8528-679486eb8d95';
ALTER TABLE respaldos.backup_200_venus_evento_muerte ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_200_venus_evento_muerte FROM PUBLIC, anon, authenticated;

CREATE TABLE respaldos.backup_200_venus_ficha_fantasma AS
SELECT * FROM public.hato_animales
WHERE id = 'a6068a6d-557b-4869-9461-5a070dfadd57';
ALTER TABLE respaldos.backup_200_venus_ficha_fantasma ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_200_venus_ficha_fantasma FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_n bigint;
  v_total   bigint := (SELECT count(*) FROM public.hato_animales);
  v_activas bigint := (SELECT count(*) FROM public.hato_animales WHERE estado = 'activa');
  v_eventos bigint := (SELECT count(*) FROM public.hato_eventos);
  v_venus_md5 text := (SELECT md5(to_jsonb(a)::text) FROM public.hato_animales a
                       WHERE id = 'c0e928a5-f883-4025-98ff-48ad151b4653');
BEGIN
  IF (SELECT count(*) FROM respaldos.backup_200_venus_evento_muerte) <> 1
     OR (SELECT count(*) FROM respaldos.backup_200_venus_ficha_fantasma) <> 1 THEN
    RAISE EXCEPTION '200: respaldo incompleto';
  END IF;

  DELETE FROM public.hato_eventos
   WHERE id = '8cd9073c-fd9e-4fe3-8528-679486eb8d95'
     AND animal_id = 'a6068a6d-557b-4869-9461-5a070dfadd57'
     AND tipo = 'muerte';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '200: DELETE evento afectó % filas', v_n; END IF;

  DELETE FROM public.hato_animales
   WHERE id = 'a6068a6d-557b-4869-9461-5a070dfadd57'
     AND estado = 'descartada';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '200: DELETE ficha afectó % filas', v_n; END IF;

  IF (SELECT count(*) FROM public.hato_animales) <> v_total - 1
     OR (SELECT count(*) FROM public.hato_animales WHERE estado = 'activa') <> v_activas
     OR (SELECT count(*) FROM public.hato_eventos) <> v_eventos - 1 THEN
    RAISE EXCEPTION '200 post: los conteos no cuadran';
  END IF;
  IF (SELECT md5(to_jsonb(a)::text) FROM public.hato_animales a
      WHERE id = 'c0e928a5-f883-4025-98ff-48ad151b4653') IS DISTINCT FROM v_venus_md5 THEN
    RAISE EXCEPTION '200 post: la VENUS real cambió';
  END IF;
END $$;

-- ROLLBACK (manual, solo si hace falta deshacer). Primero la ficha, después
-- el evento, porque el evento referencia la ficha.
-- BEGIN;
-- INSERT INTO public.hato_animales SELECT * FROM respaldos.backup_200_venus_ficha_fantasma;
-- INSERT INTO public.hato_eventos  SELECT * FROM respaldos.backup_200_venus_evento_muerte;
-- COMMIT;
