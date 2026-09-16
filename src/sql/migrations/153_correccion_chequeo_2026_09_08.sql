-- ============================================================================
-- 153_correccion_chequeo_2026_09_08.sql
--
-- Corrige la captura del chequeo veterinario del 2026-09-08/09 (hato lechero),
-- después de que la recaptura por foto se hizo dos veces a mano (Telegram y
-- Hoja de Vida) contra una planilla que nunca terminó de subirse por el
-- camino de foto (0 commits de las 4 fotos re-impresas, `chequeo_id`
-- `0f7c743d…` sigue con las 19 filas de la prueba del 09-08 17:24). Ver el
-- diagnóstico completo, escrito en vivo contra producción el 2026-09-15:
-- `docs/hato/diagnostico-chequeo-2026-09-08.md`, secciones 1–5. Esta
-- migración es la sección A (datos) + B (animales) de esa sección 5. La
-- sección C (recaptura por foto) y la D (tickets de código) NO van acá.
--
-- QUÉ PASÓ, en una frase por bloque (detalle completo en el diagnóstico):
--   A1 — PAZ/NORMA/GALLETA/ESPERANZA/BRILLANTINA/MARTHA/MARIPOSA quedaron
--        con la fecha de HOY del registro (09-08/09-09) en vez de la fecha
--        real del servicio que la planilla decía.
--   A2 — COMETA: al corregir la fecha de la inseminación del 08-12 se
--        pisó el servicio real de abril (import histórico), en vez de
--        agregarlo. Se restaura abril y se agrega agosto como evento nuevo.
--   A3 — MAGNIFICA: Telegram registró "Jersey monta" el mismo día en que
--        la planilla decía toro Jericó por inseminación. Gana la planilla.
--   A4 — JASPEADA: el servicio del 25/6 quedó sin toro. La planilla decía
--        Márquez por inseminación.
--   A5 — `hato_tratamientos` acumuló 2 duplicados (CAMILA, ELECTRA), 2
--        filas basura (PIRINOLA, BRILLANTINA) y una fila con la vaca
--        equivocada (el "6 meses" de CUÑA quedó en CUCA); el tratamiento
--        de MONA nunca se capturó.
--   A6 — FABIOLA: Fernando sí aplicó el Prostal (09-12), pero el paso
--        programado nunca se confirmó y la alerta escaló como ruido (#251).
--   A7 — CUCA y CUÑA: los pasos de julio quedaron vencidos sin ejecutar
--        porque el día exacto no se registró; se backfillea al día
--        programado, dejando constancia de que es una fecha aproximada.
--   A8 — La fila de julio de FABIOLA decía "Tonificar"; Martha la
--        identificó como el mismo "Prostal y servir" de la planilla.
--   B  — #177 y #178 (hoy MOCA/COMINA) fueron descartados el 08-11 por la
--        limpieza de inventario, pero están vivos y fueron servidos en
--        septiembre. Se reactivan con su chapeta real; #177 se renombra a
--        MOTONETA (MORA, su nombre en la planilla, ya es #212).
--
-- Decisiones de Santiago citadas en el diagnóstico (sección 6, 2026-09-15):
-- PAZ/NORMA/GALLETA → 1 sept; COMETA 12/08 → Laredo; MAGNIFICA 9/3 →
-- Jericó; fila de julio de FABIOLA → "Prostal y servir"; #177 → MOTONETA,
-- servida 3 sept; #178 → COMINA, servida 2 sept. No quedan preguntas
-- abiertas.
--
-- QUÉ NO SE TOCA, a propósito (no hay SQL para esto):
--   · Los pares Telegram+import de ESMERALDA/FUERZA — duplicados aceptados
--     por la lógica de la 139.
--   · Los ~10 tratamientos libres restantes en `hato_tratamientos` que no
--     aparecen en las tablas A5–A8 — son notas válidas, no errores.
--   · `hato_chequeos`/`hato_chequeo_vacas` de la prueba `0f7c743d…` — la
--     recaptura de la sección C los reemplaza completos por `fecha`
--     (find-or-create de la 065), no esta migración.
--
-- TRAZA. `hato_correcciones` (084) y `logs_auditoria` no dejan fila para
-- una migración corriendo como `postgres` (`auth.uid() IS NULL`). El
-- respaldo en `respaldos` (patrón 081, nunca en `public`) es el único
-- registro de los valores previos.
--
-- Filas de dominio afectadas:
--   hato_eventos:            10 UPDATE + 3 INSERT
--   hato_tratamientos:        4 DELETE + 5 UPDATE + 1 INSERT
--   hato_tratamiento_pasos:   3 UPDATE
--   hato_alertas:             1 UPDATE
--   hato_animales:            2 UPDATE
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. Pre-condiciones. Cualquier desviación aborta toda la transacción antes
--    de que se escriba una sola fila. Los ids son literales — ya cumplen
--    "copiar el id en el mensaje" por estar hardcodeados en el texto.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n   integer;
  v_bad text;
BEGIN
  -- 0.0 El catálogo de toros referenciado abajo es el esperado.
  SELECT count(*) INTO v_n FROM hato_toros
   WHERE (id = '27d8768d-5048-42ca-b08b-4b5976b5c4f7' AND nombre = 'Jersey')
      OR (id = '9a0959fd-2fa6-4601-ba30-0498ca090f9c' AND nombre = 'laredo')
      OR (id = '55944494-cf3e-4e8c-8594-a3e548af21db' AND nombre = 'Jericó')
      OR (id = '98dc7115-be38-4d54-91f9-77ca52c423de' AND nombre = 'Márquez');
  IF v_n <> 4 THEN
    RAISE EXCEPTION '153 ABORTADA (0.0): el catálogo de toros (Jersey 27d8768d, laredo 9a0959fd, Jericó 55944494, Márquez 98dc7115) no coincide con lo esperado (encontrados %).', v_n;
  END IF;

  -- 0.1 A1 — las 7 fechas y la forma común (servicio/monta/Jersey/telegram/
  --     sin chequeo/exacta) siguen como se midieron el 2026-09-15.
  SELECT string_agg(v.id::text, ', ') INTO v_bad
    FROM (VALUES
      ('62752808-3578-4063-a50f-2ee129af391c'::uuid, DATE '2026-01-09'),
      ('55acb180-10c9-4f65-88f7-7bbaade449ac'::uuid, DATE '2026-04-09'),
      ('f0f55d40-8b53-47d0-b4e6-ee719138677d'::uuid, DATE '2026-04-09'),
      ('945449bb-e942-4bb4-a9e4-630fd4e86eef'::uuid, DATE '2026-02-09'),
      ('7333a0d9-db02-4e8d-b25e-ca0f66eef50b'::uuid, DATE '2026-02-09'),
      ('2b8bc08f-dc86-4279-aabc-cc3d6de6d0da'::uuid, DATE '2026-02-09'),
      ('b509c8fb-79e5-46f6-9895-dfeab4d0eee0'::uuid, DATE '2026-06-09')
    ) AS v(id, fecha_actual)
    LEFT JOIN hato_eventos e ON e.id = v.id
   WHERE e.id IS NULL
      OR e.fecha IS DISTINCT FROM v.fecha_actual
      OR e.tipo IS DISTINCT FROM 'servicio'
      OR e.tipo_servicio IS DISTINCT FROM 'monta'
      OR e.toro_id IS DISTINCT FROM '27d8768d-5048-42ca-b08b-4b5976b5c4f7'::uuid
      OR e.fuente IS DISTINCT FROM 'telegram'
      OR e.chequeo_vaca_id IS NOT NULL
      OR e.fecha_confianza IS DISTINCT FROM 'exacta';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION '153 ABORTADA (0.1 A1): estos hato_eventos ya no tienen la forma/fecha esperada: %', v_bad;
  END IF;

  -- 0.2 A2 — COMETA: el evento importado sigue en 08-12 con chequeo_vaca_id
  --     poblado, y no existe todavía un servicio 08-12 sin chequeo (el que
  --     esta migración va a insertar).
  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE id = 'f5109dbf-f41d-4e07-b7d3-fcc383460b20'
     AND animal_id = '3be23f10-b4b5-4e41-997f-85ed2daa1316'
     AND fecha = DATE '2026-08-12' AND tipo = 'servicio'
     AND tipo_servicio = 'inseminacion'
     AND toro_id = '9a0959fd-2fa6-4601-ba30-0498ca090f9c'
     AND fuente = 'importacion'
     AND chequeo_vaca_id = '1f8f89ba-0050-4a85-ba96-c068310bb40b';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (0.2 A2): el evento importado de COMETA (f5109dbf-f41d-4e07-b7d3-fcc383460b20) ya no coincide con el estado esperado.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE animal_id = '3be23f10-b4b5-4e41-997f-85ed2daa1316'
     AND tipo = 'servicio' AND fecha = DATE '2026-08-12'
     AND toro_id = '9a0959fd-2fa6-4601-ba30-0498ca090f9c'
     AND tipo_servicio = 'inseminacion' AND chequeo_vaca_id IS NULL;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '153 ABORTADA (0.2b A2): ya existe un servicio 08-12 sin chequeo para COMETA (3be23f10-b4b5-4e41-997f-85ed2daa1316) -- insertar duplicaría.';
  END IF;

  -- 0.3 A3 — MAGNIFICA: toro Jersey/monta, fecha sin cambio (03-09).
  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE id = '2feb80b5-dc92-4af5-a0ae-b6c95c6789ad'
     AND animal_id = '52006088-f507-4d77-b77e-ae0e65895e00'
     AND toro_id = '27d8768d-5048-42ca-b08b-4b5976b5c4f7'
     AND tipo_servicio = 'monta' AND fecha = DATE '2026-03-09';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (0.3 A3): el evento de MAGNIFICA (2feb80b5-dc92-4af5-a0ae-b6c95c6789ad) ya no coincide con el estado esperado.';
  END IF;

  -- 0.4 A4 — JASPEADA: sin toro, sin tipo_servicio, fecha sin cambio (06-25).
  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE id = 'ac22a446-d819-4d73-b66f-e6f6e1082c9f'
     AND animal_id = '09667b2e-3135-458d-a3e9-0ccc1f9cc769'
     AND toro_id IS NULL AND tipo_servicio IS NULL
     AND fecha = DATE '2026-06-25';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (0.4 A4): el evento de JASPEADA (ac22a446-d819-4d73-b66f-e6f6e1082c9f) ya no coincide con el estado esperado.';
  END IF;

  -- 0.5 A5 — los 4 duplicados/basura de hato_tratamientos siguen
  --     completados y sin ningún paso programado colgando de ellos (un
  --     CASCADE silencioso sobre pasos no documentados sería peor que el
  --     defecto que se corrige).
  SELECT count(*) INTO v_n FROM hato_tratamientos
   WHERE id IN ('7414eb85-56a6-479d-8151-1bfde26c2ad4',
                '609681e6-6b9d-44be-9af2-f160baaa5f14',
                '1678e5e4-bffa-4e32-818c-2246b5e18e11',
                '4a934df1-d15f-4978-8aa7-331b81d3b13a')
     AND estado = 'completado';
  IF v_n <> 4 THEN
    RAISE EXCEPTION '153 ABORTADA (0.5 A5): los 4 tratamientos a borrar ya no están los 4 en estado completado (hay %).', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM hato_tratamiento_pasos
   WHERE tratamiento_id IN ('7414eb85-56a6-479d-8151-1bfde26c2ad4',
                             '609681e6-6b9d-44be-9af2-f160baaa5f14',
                             '1678e5e4-bffa-4e32-818c-2246b5e18e11',
                             '4a934df1-d15f-4978-8aa7-331b81d3b13a');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '153 ABORTADA (0.5b A5): aparecieron % pasos colgando de los tratamientos a borrar -- el DELETE los arrastraría por CASCADE sin respaldo.', v_n;
  END IF;

  -- 0.6 A5 — la fila del "6 meses" sigue en CUCA, no en CUÑA.
  SELECT count(*) INTO v_n FROM hato_tratamientos
   WHERE id = '937d799b-dce3-40ff-b499-33e147e36b02'
     AND animal_id = '6ead88d4-7675-43fd-914b-d9bedc299417'
     AND nombre = 'preñada de 6 meses';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (0.6 A5): el tratamiento 937d799b-dce3-40ff-b499-33e147e36b02 ya no está en CUCA (6ead88d4-7675-43fd-914b-d9bedc299417) con ese nombre.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_animales
   WHERE id = '52fa4f19-b9b3-4f9b-ba27-492b1783fd0a' AND nombre = 'CUÑA';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (0.6b A5): 52fa4f19-b9b3-4f9b-ba27-492b1783fd0a ya no es CUÑA.';
  END IF;

  -- 0.7 A5 — el tratamiento de MONA todavía no existe (nombre exacto en la
  --     fecha esperada), para no duplicarlo si esto se reintenta.
  SELECT count(*) INTO v_n FROM hato_animales
   WHERE id = '58f8421b-57b0-4c3f-a456-7ed43c74d316' AND numero = 175;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (0.7 A5): 58f8421b-57b0-4c3f-a456-7ed43c74d316 ya no es la vaca #175 (MONA).';
  END IF;
  SELECT count(*) INTO v_n FROM hato_tratamientos
   WHERE animal_id = '58f8421b-57b0-4c3f-a456-7ed43c74d316'
     AND nombre = 'Gestar 5 ml y servir' AND fecha_inicio = DATE '2026-09-09';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '153 ABORTADA (0.7b A5): ya existe el tratamiento de MONA -- insertar duplicaría.';
  END IF;

  -- 0.8 A6 — FABIOLA: paso, alerta y tratamiento en el estado que motivó
  --     la corrección.
  SELECT count(*) INTO v_n FROM hato_tratamiento_pasos
   WHERE id = '07b6c1e0-aa28-4e85-8ef6-1590969dc25b'
     AND tratamiento_id = '3d643a34-e5cb-4d8c-9cd6-b85006bfe004'
     AND paso_num = 1 AND fecha_programada = DATE '2026-09-11'
     AND fecha_ejecutada IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (0.8 A6): el paso de FABIOLA (07b6c1e0-aa28-4e85-8ef6-1590969dc25b) ya no coincide con el estado esperado.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_alertas
   WHERE id = 'da543f33-1553-452a-987e-ce39fad53ef0'
     AND tipo = 'tratamiento_paso'
     AND paso_id = '07b6c1e0-aa28-4e85-8ef6-1590969dc25b'
     AND estado = 'escalada' AND respondida_por IS NULL AND respuesta IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (0.8b A6): la alerta da543f33-1553-452a-987e-ce39fad53ef0 ya no coincide con el estado esperado.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_tratamientos
   WHERE id = '3d643a34-e5cb-4d8c-9cd6-b85006bfe004'
     AND nombre = 'Prostal y servir' AND estado = 'activo';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (0.8c A6): el tratamiento 3d643a34-e5cb-4d8c-9cd6-b85006bfe004 ya no coincide con el estado esperado.';
  END IF;

  -- 0.9 A7 — CUCA y CUÑA: pasos vencidos sin ejecutar, descripcion vacía.
  SELECT count(*) INTO v_n FROM hato_tratamiento_pasos
   WHERE id = 'a032c1a5-b98a-4621-a664-e39a9eff40e4'
     AND tratamiento_id = 'feb558b3-49ac-44bd-8047-987fb69695b8'
     AND fecha_programada = DATE '2026-07-16'
     AND fecha_ejecutada IS NULL AND descripcion IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (0.9 A7): el paso de CUCA (a032c1a5-b98a-4621-a664-e39a9eff40e4) ya no coincide con el estado esperado.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_tratamiento_pasos
   WHERE id = 'ae973433-d005-4beb-a8f6-d73ff25a281e'
     AND tratamiento_id = 'fc22d350-fb66-4a33-ae21-bf2a35762ca0'
     AND fecha_programada = DATE '2026-07-23'
     AND fecha_ejecutada IS NULL AND descripcion IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (0.9b A7): el paso de CUÑA (ae973433-d005-4beb-a8f6-d73ff25a281e) ya no coincide con el estado esperado.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_tratamientos
   WHERE id = 'feb558b3-49ac-44bd-8047-987fb69695b8'
     AND nombre = 'Gestar 10 cms' AND estado = 'activo';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (0.9c A7): el tratamiento de CUCA (feb558b3-49ac-44bd-8047-987fb69695b8) ya no coincide con el estado esperado.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_tratamientos
   WHERE id = 'fc22d350-fb66-4a33-ae21-bf2a35762ca0'
     AND nombre = 'Estrumate  para limpiarla  está sucia' AND estado = 'activo';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (0.9d A7): el tratamiento de CUÑA (fc22d350-fb66-4a33-ae21-bf2a35762ca0) ya no coincide con el estado esperado.';
  END IF;

  -- 0.10 A8 — la fila de julio de FABIOLA todavía dice "Tonificar".
  SELECT count(*) INTO v_n FROM hato_tratamientos
   WHERE id = 'fcc86ded-6a90-48c8-8e95-14f4af494371'
     AND nombre = 'Tonificar' AND estado = 'completado'
     AND fecha_inicio = DATE '2026-07-09';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (0.10 A8): el tratamiento de julio de FABIOLA (fcc86ded-6a90-48c8-8e95-14f4af494371) ya no coincide con el estado esperado.';
  END IF;

  -- 0.11 B1/B2 — #178 (COMINA) y #177 (MOCA) siguen descartados desde el
  --     08-11, sin un solo evento colgando (si tuvieran uno, el índice de
  --     la 139 podría abortar la inserción del servicio de septiembre).
  SELECT count(*) INTO v_n FROM hato_animales
   WHERE id = '475cf524-ae08-4baa-ad79-a459843cac7d'
     AND numero = 178 AND nombre = 'COMINA' AND estado = 'descartada'
     AND fecha_estado = DATE '2026-08-11'
     AND notas = 'Madre (crudo): COMETA';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (0.11 B1): #178 (475cf524-ae08-4baa-ad79-a459843cac7d) ya no coincide con el estado esperado.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE animal_id = '475cf524-ae08-4baa-ad79-a459843cac7d';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '153 ABORTADA (0.11b B1): #178 ya tiene % evento(s) -- el supuesto de "sin eventos" no se sostiene.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM hato_animales
   WHERE id = '2e66348e-584f-451e-bc74-4624fd46674f'
     AND numero = 177 AND nombre = 'MOCA' AND estado = 'descartada'
     AND fecha_estado = DATE '2026-08-11'
     AND notas = 'Madre (crudo): MONZA';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (0.12 B2): #177 (2e66348e-584f-451e-bc74-4624fd46674f) ya no coincide con el estado esperado.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE animal_id = '2e66348e-584f-451e-bc74-4624fd46674f';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '153 ABORTADA (0.12b B2): #177 ya tiene % evento(s) -- el supuesto de "sin eventos" no se sostiene.', v_n;
  END IF;

  -- 0.13 Nadie más renombró a MOTONETA todavía (ni #177 con ese nombre).
  SELECT count(*) INTO v_n FROM hato_animales WHERE nombre = 'MOTONETA';
  IF v_n <> 0 THEN
    RAISE EXCEPTION '153 ABORTADA (0.13): ya existe un animal llamado MOTONETA -- revisar antes de reintentar.';
  END IF;

  RAISE NOTICE '153 (pre): OK -- las % filas objetivo (10 hato_eventos, 9 hato_tratamientos, 3 pasos, 1 alerta, 2 animales) están en el estado medido el 2026-09-15.', 25;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Respaldo forense en `respaldos` (NUNCA en public -- patrón 081). Solo
--    las filas que esta migración UPDATE/DELETE -- las INSERT no tienen
--    nada previo que respaldar.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS respaldos;

CREATE TABLE respaldos.backup_153_hato_eventos AS
SELECT * FROM hato_eventos
 WHERE id IN (
   '62752808-3578-4063-a50f-2ee129af391c',
   '55acb180-10c9-4f65-88f7-7bbaade449ac',
   'f0f55d40-8b53-47d0-b4e6-ee719138677d',
   '945449bb-e942-4bb4-a9e4-630fd4e86eef',
   '7333a0d9-db02-4e8d-b25e-ca0f66eef50b',
   '2b8bc08f-dc86-4279-aabc-cc3d6de6d0da',
   'b509c8fb-79e5-46f6-9895-dfeab4d0eee0',
   'f5109dbf-f41d-4e07-b7d3-fcc383460b20',
   '2feb80b5-dc92-4af5-a0ae-b6c95c6789ad',
   'ac22a446-d819-4d73-b66f-e6f6e1082c9f'
 );

CREATE TABLE respaldos.backup_153_hato_tratamientos AS
SELECT * FROM hato_tratamientos
 WHERE id IN (
   '7414eb85-56a6-479d-8151-1bfde26c2ad4',
   '609681e6-6b9d-44be-9af2-f160baaa5f14',
   '1678e5e4-bffa-4e32-818c-2246b5e18e11',
   '4a934df1-d15f-4978-8aa7-331b81d3b13a',
   '937d799b-dce3-40ff-b499-33e147e36b02',
   '3d643a34-e5cb-4d8c-9cd6-b85006bfe004',
   'feb558b3-49ac-44bd-8047-987fb69695b8',
   'fc22d350-fb66-4a33-ae21-bf2a35762ca0',
   'fcc86ded-6a90-48c8-8e95-14f4af494371'
 );

CREATE TABLE respaldos.backup_153_hato_tratamiento_pasos AS
SELECT * FROM hato_tratamiento_pasos
 WHERE id IN (
   '07b6c1e0-aa28-4e85-8ef6-1590969dc25b',
   'a032c1a5-b98a-4621-a664-e39a9eff40e4',
   'ae973433-d005-4beb-a8f6-d73ff25a281e'
 );

CREATE TABLE respaldos.backup_153_hato_alertas AS
SELECT * FROM hato_alertas
 WHERE id = 'da543f33-1553-452a-987e-ce39fad53ef0';

CREATE TABLE respaldos.backup_153_hato_animales AS
SELECT * FROM hato_animales
 WHERE id IN (
   '475cf524-ae08-4baa-ad79-a459843cac7d',
   '2e66348e-584f-451e-bc74-4624fd46674f'
 );

ALTER TABLE respaldos.backup_153_hato_eventos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE respaldos.backup_153_hato_tratamientos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE respaldos.backup_153_hato_tratamiento_pasos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE respaldos.backup_153_hato_alertas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE respaldos.backup_153_hato_animales           ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON respaldos.backup_153_hato_eventos           FROM anon, authenticated, PUBLIC;
REVOKE ALL ON respaldos.backup_153_hato_tratamientos       FROM anon, authenticated, PUBLIC;
REVOKE ALL ON respaldos.backup_153_hato_tratamiento_pasos  FROM anon, authenticated, PUBLIC;
REVOKE ALL ON respaldos.backup_153_hato_alertas            FROM anon, authenticated, PUBLIC;
REVOKE ALL ON respaldos.backup_153_hato_animales           FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------------
-- 2. A1 -- siete fechas de servicio: la fecha real de la planilla, no la
--    fecha en que Martha lo tecleó.
-- ---------------------------------------------------------------------------
UPDATE hato_eventos SET fecha = DATE '2026-09-01' WHERE id = '62752808-3578-4063-a50f-2ee129af391c'; -- PAZ
UPDATE hato_eventos SET fecha = DATE '2026-09-01' WHERE id = '55acb180-10c9-4f65-88f7-7bbaade449ac'; -- NORMA
UPDATE hato_eventos SET fecha = DATE '2026-09-01' WHERE id = 'f0f55d40-8b53-47d0-b4e6-ee719138677d'; -- GALLETA
UPDATE hato_eventos SET fecha = DATE '2026-09-02' WHERE id = '945449bb-e942-4bb4-a9e4-630fd4e86eef'; -- ESPERANZA
UPDATE hato_eventos SET fecha = DATE '2026-09-02' WHERE id = '7333a0d9-db02-4e8d-b25e-ca0f66eef50b'; -- BRILLANTINA
UPDATE hato_eventos SET fecha = DATE '2026-09-02' WHERE id = '2b8bc08f-dc86-4279-aabc-cc3d6de6d0da'; -- MARTHA
UPDATE hato_eventos SET fecha = DATE '2026-06-29' WHERE id = 'b509c8fb-79e5-46f6-9895-dfeab4d0eee0'; -- MARIPOSA

-- ---------------------------------------------------------------------------
-- 3. A2 -- COMETA: restaurar el servicio de abril (importación histórica)
--    que la edición del 09-09 pisó, y agregar el de agosto como evento
--    nuevo. El UPDATE va primero -- libera la fecha de agosto antes de
--    insertar sobre ella.
-- ---------------------------------------------------------------------------
UPDATE hato_eventos
   SET fecha = DATE '2026-04-14'
 WHERE id = 'f5109dbf-f41d-4e07-b7d3-fcc383460b20';

INSERT INTO hato_eventos (
  animal_id, tipo, fecha, tipo_servicio, toro_id,
  fecha_confianza, fuente, chequeo_vaca_id, datos, created_by
) VALUES (
  '3be23f10-b4b5-4e41-997f-85ed2daa1316', 'servicio', DATE '2026-08-12',
  'inseminacion', '9a0959fd-2fa6-4601-ba30-0498ca090f9c',
  'exacta', 'web', NULL,
  '{"origen":"correccion 2026-09-15"}'::jsonb, NULL
);

-- ---------------------------------------------------------------------------
-- 4. A3 -- MAGNIFICA: la planilla dice toro Jericó por inseminación, no
--    Jersey por monta.
-- ---------------------------------------------------------------------------
UPDATE hato_eventos
   SET toro_id = '55944494-cf3e-4e8c-8594-a3e548af21db',
       tipo_servicio = 'inseminacion'
 WHERE id = '2feb80b5-dc92-4af5-a0ae-b6c95c6789ad';

-- ---------------------------------------------------------------------------
-- 5. A4 -- JASPEADA: la planilla dice toro Márquez por inseminación.
-- ---------------------------------------------------------------------------
UPDATE hato_eventos
   SET toro_id = '98dc7115-be38-4d54-91f9-77ca52c423de',
       tipo_servicio = 'inseminacion'
 WHERE id = 'ac22a446-d819-4d73-b66f-e6f6e1082c9f';

-- ---------------------------------------------------------------------------
-- 6. A5 -- limpieza de hato_tratamientos: 2 duplicados + 2 filas basura
--    borrados; la fila mal atribuida movida a la vaca correcta; el
--    tratamiento de MONA, que nunca se capturó, agregado.
-- ---------------------------------------------------------------------------
DELETE FROM hato_tratamientos WHERE id = '7414eb85-56a6-479d-8151-1bfde26c2ad4'; -- CAMILA, duplicado
DELETE FROM hato_tratamientos WHERE id = '609681e6-6b9d-44be-9af2-f160baaa5f14'; -- ELECTRA, duplicado
DELETE FROM hato_tratamientos WHERE id = '1678e5e4-bffa-4e32-818c-2246b5e18e11'; -- PIRINOLA, basura
DELETE FROM hato_tratamientos WHERE id = '4a934df1-d15f-4978-8aa7-331b81d3b13a'; -- BRILLANTINA, basura

UPDATE hato_tratamientos
   SET animal_id = '52fa4f19-b9b3-4f9b-ba27-492b1783fd0a' -- CUÑA
 WHERE id = '937d799b-dce3-40ff-b499-33e147e36b02';

INSERT INTO hato_tratamientos (
  animal_id, nombre, fecha_inicio, estado, fuente, created_by
) VALUES (
  '58f8421b-57b0-4c3f-a456-7ed43c74d316', 'Gestar 5 ml y servir',
  DATE '2026-09-09', 'completado', 'web', '5aee1e1b-f009-473d-ae02-9d30cc75a5fc'
);

-- ---------------------------------------------------------------------------
-- 7. A6 -- FABIOLA: Fernando sí aplicó el tratamiento (09-12); el paso, la
--    alerta escalada y el tratamiento se cierran para que reflejen eso.
-- ---------------------------------------------------------------------------
UPDATE hato_tratamiento_pasos
   SET fecha_ejecutada = DATE '2026-09-12'
 WHERE id = '07b6c1e0-aa28-4e85-8ef6-1590969dc25b';

UPDATE hato_alertas
   SET estado = 'confirmada',
       respondida_por = 'Fernando Jimenez'
 WHERE id = 'da543f33-1553-452a-987e-ce39fad53ef0';

UPDATE hato_tratamientos
   SET estado = 'completado'
 WHERE id = '3d643a34-e5cb-4d8c-9cd6-b85006bfe004';

-- ---------------------------------------------------------------------------
-- 8. A7 -- CUCA y CUÑA: backfill de los pasos vencidos de julio. El día
--    exacto no quedó registrado -- se usa el día programado y se dice así
--    en `descripcion`, nunca se inventa una fecha de ejecución más precisa
--    de la que hay evidencia.
-- ---------------------------------------------------------------------------
UPDATE hato_tratamiento_pasos
   SET fecha_ejecutada = fecha_programada,
       descripcion = 'Ejecutado en julio 2026; día exacto no quedó registrado — backfill 2026-09-15 (diagnóstico chequeo 2026-09-08).'
 WHERE id = 'a032c1a5-b98a-4621-a664-e39a9eff40e4'; -- CUCA

UPDATE hato_tratamiento_pasos
   SET fecha_ejecutada = fecha_programada,
       descripcion = 'Ejecutado en julio 2026; día exacto no quedó registrado — backfill 2026-09-15 (diagnóstico chequeo 2026-09-08).'
 WHERE id = 'ae973433-d005-4beb-a8f6-d73ff25a281e'; -- CUÑA

UPDATE hato_tratamientos SET estado = 'completado' WHERE id = 'feb558b3-49ac-44bd-8047-987fb69695b8'; -- CUCA
UPDATE hato_tratamientos SET estado = 'completado' WHERE id = 'fc22d350-fb66-4a33-ae21-bf2a35762ca0'; -- CUÑA

-- ---------------------------------------------------------------------------
-- 9. A8 -- la fila de julio de FABIOLA es el mismo "Prostal y servir" de
--    la planilla, no "Tonificar" (Martha, vía el diagnóstico).
-- ---------------------------------------------------------------------------
UPDATE hato_tratamientos
   SET nombre = 'Prostal y servir'
 WHERE id = 'fcc86ded-6a90-48c8-8e95-14f4af494371';

-- ---------------------------------------------------------------------------
-- 10. B1 -- #178 (COMINA): reactivar y registrar el servicio del 2 de
--     septiembre que la limpieza de inventario del 08-11 dejó sin poder
--     capturarse (animal descartado).
-- ---------------------------------------------------------------------------
UPDATE hato_animales
   SET estado = 'activa',
       fecha_estado = DATE '2026-09-15',
       notas = notas || E'\n\nReactivada 2026-09-15: servida 2026-09-02 (diagnóstico chequeo 2026-09-08).'
 WHERE id = '475cf524-ae08-4baa-ad79-a459843cac7d';

INSERT INTO hato_eventos (
  animal_id, tipo, fecha, tipo_servicio, toro_id,
  fecha_confianza, fuente, chequeo_vaca_id, datos, created_by
) VALUES (
  '475cf524-ae08-4baa-ad79-a459843cac7d', 'servicio', DATE '2026-09-02',
  'monta', '27d8768d-5048-42ca-b08b-4b5976b5c4f7',
  'exacta', 'web', NULL,
  '{"origen":"correccion 2026-09-15"}'::jsonb, '5aee1e1b-f009-473d-ae02-9d30cc75a5fc'
);

-- ---------------------------------------------------------------------------
-- 11. B2 -- #177 (MOCA → MOTONETA): reactivar, renombrar (MORA, el nombre
--     de la planilla, ya es la #212 ternera) y registrar el servicio del
--     3 de septiembre.
-- ---------------------------------------------------------------------------
UPDATE hato_animales
   SET estado = 'activa',
       fecha_estado = DATE '2026-09-15',
       nombre = 'MOTONETA',
       notas = notas || E'\n\nAntes MOCA/MORA; renombrada 2026-09 por homónima (diagnóstico chequeo 2026-09-08).'
 WHERE id = '2e66348e-584f-451e-bc74-4624fd46674f';

INSERT INTO hato_eventos (
  animal_id, tipo, fecha, tipo_servicio, toro_id,
  fecha_confianza, fuente, chequeo_vaca_id, datos, created_by
) VALUES (
  '2e66348e-584f-451e-bc74-4624fd46674f', 'servicio', DATE '2026-09-03',
  'monta', '27d8768d-5048-42ca-b08b-4b5976b5c4f7',
  'exacta', 'web', NULL,
  '{"origen":"correccion 2026-09-15"}'::jsonb, '5aee1e1b-f009-473d-ae02-9d30cc75a5fc'
);

-- ---------------------------------------------------------------------------
-- 12. Post-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
BEGIN
  -- 12.1 A1 -- las 7 fechas quedaron en el valor real de la planilla.
  IF (SELECT fecha FROM hato_eventos WHERE id = '62752808-3578-4063-a50f-2ee129af391c') <> DATE '2026-09-01' THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.1a): PAZ no quedó en 2026-09-01.';
  END IF;
  IF (SELECT fecha FROM hato_eventos WHERE id = '55acb180-10c9-4f65-88f7-7bbaade449ac') <> DATE '2026-09-01' THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.1b): NORMA no quedó en 2026-09-01.';
  END IF;
  IF (SELECT fecha FROM hato_eventos WHERE id = 'f0f55d40-8b53-47d0-b4e6-ee719138677d') <> DATE '2026-09-01' THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.1c): GALLETA no quedó en 2026-09-01.';
  END IF;
  IF (SELECT fecha FROM hato_eventos WHERE id = '945449bb-e942-4bb4-a9e4-630fd4e86eef') <> DATE '2026-09-02' THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.1d): ESPERANZA no quedó en 2026-09-02.';
  END IF;
  IF (SELECT fecha FROM hato_eventos WHERE id = '7333a0d9-db02-4e8d-b25e-ca0f66eef50b') <> DATE '2026-09-02' THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.1e): BRILLANTINA no quedó en 2026-09-02.';
  END IF;
  IF (SELECT fecha FROM hato_eventos WHERE id = '2b8bc08f-dc86-4279-aabc-cc3d6de6d0da') <> DATE '2026-09-02' THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.1f): MARTHA no quedó en 2026-09-02.';
  END IF;
  IF (SELECT fecha FROM hato_eventos WHERE id = 'b509c8fb-79e5-46f6-9895-dfeab4d0eee0') <> DATE '2026-06-29' THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.1g): MARIPOSA no quedó en 2026-06-29.';
  END IF;

  -- 12.2 A2 -- COMETA: abril restaurado, agosto insertado una sola vez.
  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE id = 'f5109dbf-f41d-4e07-b7d3-fcc383460b20' AND fecha = DATE '2026-04-14';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.2): COMETA no quedó restaurada a 2026-04-14.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE animal_id = '3be23f10-b4b5-4e41-997f-85ed2daa1316'
     AND tipo = 'servicio' AND fecha = DATE '2026-08-12'
     AND toro_id = '9a0959fd-2fa6-4601-ba30-0498ca090f9c'
     AND tipo_servicio = 'inseminacion' AND chequeo_vaca_id IS NULL
     AND fuente = 'web' AND datos ->> 'origen' = 'correccion 2026-09-15';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.2b): no quedó exactamente 1 servicio nuevo de COMETA en 2026-08-12 (hay %).', v_n;
  END IF;

  -- 12.3 A3/A4 -- MAGNIFICA y JASPEADA con toro e inseminación correctos.
  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE id = '2feb80b5-dc92-4af5-a0ae-b6c95c6789ad'
     AND toro_id = '55944494-cf3e-4e8c-8594-a3e548af21db' AND tipo_servicio = 'inseminacion';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.3): MAGNIFICA no quedó con toro Jericó/inseminación.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE id = 'ac22a446-d819-4d73-b66f-e6f6e1082c9f'
     AND toro_id = '98dc7115-be38-4d54-91f9-77ca52c423de' AND tipo_servicio = 'inseminacion';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.3b): JASPEADA no quedó con toro Márquez/inseminación.';
  END IF;

  -- 12.4 A5 -- los 4 borrados ya no existen; la fila movida está en CUÑA;
  --      el tratamiento de MONA quedó escrito una sola vez.
  SELECT count(*) INTO v_n FROM hato_tratamientos
   WHERE id IN ('7414eb85-56a6-479d-8151-1bfde26c2ad4',
                '609681e6-6b9d-44be-9af2-f160baaa5f14',
                '1678e5e4-bffa-4e32-818c-2246b5e18e11',
                '4a934df1-d15f-4978-8aa7-331b81d3b13a');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.4): sobrevivieron % de los 4 tratamientos que debían borrarse.', v_n;
  END IF;
  SELECT count(*) INTO v_n FROM hato_tratamientos
   WHERE id = '937d799b-dce3-40ff-b499-33e147e36b02'
     AND animal_id = '52fa4f19-b9b3-4f9b-ba27-492b1783fd0a';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.4b): el tratamiento del "6 meses" no quedó en CUÑA.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_tratamientos
   WHERE animal_id = '58f8421b-57b0-4c3f-a456-7ed43c74d316'
     AND nombre = 'Gestar 5 ml y servir' AND fecha_inicio = DATE '2026-09-09'
     AND estado = 'completado' AND fuente = 'web'
     AND created_by = '5aee1e1b-f009-473d-ae02-9d30cc75a5fc';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.4c): no quedó exactamente 1 tratamiento de MONA (hay %).', v_n;
  END IF;

  -- 12.5 A6 -- FABIOLA cerrada de punta a punta.
  SELECT count(*) INTO v_n FROM hato_tratamiento_pasos
   WHERE id = '07b6c1e0-aa28-4e85-8ef6-1590969dc25b' AND fecha_ejecutada = DATE '2026-09-12';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.5): el paso de FABIOLA no quedó ejecutado el 2026-09-12.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_alertas
   WHERE id = 'da543f33-1553-452a-987e-ce39fad53ef0'
     AND estado = 'confirmada' AND respondida_por = 'Fernando Jimenez' AND respuesta IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.5b): la alerta de FABIOLA no quedó confirmada por Fernando Jimenez.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_tratamientos
   WHERE id = '3d643a34-e5cb-4d8c-9cd6-b85006bfe004' AND estado = 'completado';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.5c): el tratamiento de FABIOLA no quedó completado.';
  END IF;

  -- 12.6 A7 -- CUCA y CUÑA cerrados con la nota de backfill.
  SELECT count(*) INTO v_n FROM hato_tratamiento_pasos
   WHERE id = 'a032c1a5-b98a-4621-a664-e39a9eff40e4'
     AND fecha_ejecutada = DATE '2026-07-16' AND descripcion LIKE 'Ejecutado en julio 2026%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.6): el paso de CUCA no quedó ejecutado el 2026-07-16 con la nota de backfill.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_tratamiento_pasos
   WHERE id = 'ae973433-d005-4beb-a8f6-d73ff25a281e'
     AND fecha_ejecutada = DATE '2026-07-23' AND descripcion LIKE 'Ejecutado en julio 2026%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.6b): el paso de CUÑA no quedó ejecutado el 2026-07-23 con la nota de backfill.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_tratamientos
   WHERE id IN ('feb558b3-49ac-44bd-8047-987fb69695b8', 'fc22d350-fb66-4a33-ae21-bf2a35762ca0')
     AND estado = 'completado';
  IF v_n <> 2 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.6c): los tratamientos de CUCA y CUÑA no quedaron ambos completados (hay %).', v_n;
  END IF;

  -- 12.7 A8 -- la fila de julio de FABIOLA quedó renombrada.
  SELECT count(*) INTO v_n FROM hato_tratamientos
   WHERE id = 'fcc86ded-6a90-48c8-8e95-14f4af494371' AND nombre = 'Prostal y servir';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.7): la fila de julio de FABIOLA no quedó renombrada a "Prostal y servir".';
  END IF;

  -- 12.8 B1 -- #178 reactivada, con notas ampliadas y un servicio nuevo.
  SELECT count(*) INTO v_n FROM hato_animales
   WHERE id = '475cf524-ae08-4baa-ad79-a459843cac7d'
     AND estado = 'activa' AND fecha_estado = DATE '2026-09-15'
     AND numero = 178 AND notas LIKE '%Reactivada 2026-09-15%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.8): #178 no quedó reactivada como se esperaba.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE animal_id = '475cf524-ae08-4baa-ad79-a459843cac7d'
     AND tipo = 'servicio' AND fecha = DATE '2026-09-02' AND tipo_servicio = 'monta'
     AND toro_id = '27d8768d-5048-42ca-b08b-4b5976b5c4f7'
     AND fuente = 'web' AND created_by = '5aee1e1b-f009-473d-ae02-9d30cc75a5fc';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.8b): #178 no quedó con exactamente 1 servicio 2026-09-02 (hay %).', v_n;
  END IF;

  -- 12.9 B2 -- #177 reactivada, renombrada MOTONETA, con un servicio nuevo.
  SELECT count(*) INTO v_n FROM hato_animales
   WHERE id = '2e66348e-584f-451e-bc74-4624fd46674f'
     AND estado = 'activa' AND fecha_estado = DATE '2026-09-15'
     AND numero = 177 AND nombre = 'MOTONETA'
     AND notas LIKE '%Antes MOCA/MORA%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.9): #177 no quedó reactivada/renombrada como se esperaba.';
  END IF;
  SELECT count(*) INTO v_n FROM hato_eventos
   WHERE animal_id = '2e66348e-584f-451e-bc74-4624fd46674f'
     AND tipo = 'servicio' AND fecha = DATE '2026-09-03' AND tipo_servicio = 'monta'
     AND toro_id = '27d8768d-5048-42ca-b08b-4b5976b5c4f7'
     AND fuente = 'web' AND created_by = '5aee1e1b-f009-473d-ae02-9d30cc75a5fc';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.9b): #177/MOTONETA no quedó con exactamente 1 servicio 2026-09-03 (hay %).', v_n;
  END IF;

  -- 12.10 Los respaldos conservan las 25 filas de antes, ni una más ni menos.
  SELECT (SELECT count(*) FROM respaldos.backup_153_hato_eventos)
       + (SELECT count(*) FROM respaldos.backup_153_hato_tratamientos)
       + (SELECT count(*) FROM respaldos.backup_153_hato_tratamiento_pasos)
       + (SELECT count(*) FROM respaldos.backup_153_hato_alertas)
       + (SELECT count(*) FROM respaldos.backup_153_hato_animales)
    INTO v_n;
  IF v_n <> 25 THEN
    RAISE EXCEPTION '153 ABORTADA (post 12.10): los respaldos suman % filas, se esperaban 25.', v_n;
  END IF;

  RAISE NOTICE '153 (post): OK -- A1-A8 y B1-B2 aplicados, 25 filas respaldadas en respaldos.backup_153_*.';
END $$;


-- ============================================================================
-- ROLLBACK (ejecutable, si hiciera falta -- no correr salvo instrucción
-- explícita del dueño; restaura desde los 5 respaldos de esta migración).
-- ============================================================================
-- BEGIN;
--   -- hato_eventos: restaurar las 10 filas UPDATE, borrar las 3 INSERT.
--   UPDATE hato_eventos e SET
--     fecha = b.fecha, tipo = b.tipo, tipo_servicio = b.tipo_servicio,
--     toro_id = b.toro_id, fecha_confianza = b.fecha_confianza,
--     fuente = b.fuente, chequeo_vaca_id = b.chequeo_vaca_id
--   FROM respaldos.backup_153_hato_eventos b WHERE e.id = b.id;
--   DELETE FROM hato_eventos
--    WHERE (animal_id, tipo, fecha, chequeo_vaca_id) IN (
--      ('3be23f10-b4b5-4e41-997f-85ed2daa1316', 'servicio', DATE '2026-08-12', NULL),
--      ('475cf524-ae08-4baa-ad79-a459843cac7d', 'servicio', DATE '2026-09-02', NULL),
--      ('2e66348e-584f-451e-bc74-4624fd46674f', 'servicio', DATE '2026-09-03', NULL)
--    )
--    AND (datos ->> 'origen') = 'correccion 2026-09-15';
--
--   -- hato_tratamientos: reinsertar los 4 borrados, restaurar animal_id y
--   -- nombre de las filas movidas/renombradas, borrar el de MONA.
--   INSERT INTO hato_tratamientos SELECT * FROM respaldos.backup_153_hato_tratamientos
--    WHERE id IN ('7414eb85-56a6-479d-8151-1bfde26c2ad4', '609681e6-6b9d-44be-9af2-f160baaa5f14',
--                 '1678e5e4-bffa-4e32-818c-2246b5e18e11', '4a934df1-d15f-4978-8aa7-331b81d3b13a');
--   UPDATE hato_tratamientos t SET
--     animal_id = b.animal_id, nombre = b.nombre, estado = b.estado
--   FROM respaldos.backup_153_hato_tratamientos b
--   WHERE t.id = b.id AND t.id IN (
--     '937d799b-dce3-40ff-b499-33e147e36b02', '3d643a34-e5cb-4d8c-9cd6-b85006bfe004',
--     'feb558b3-49ac-44bd-8047-987fb69695b8', 'fc22d350-fb66-4a33-ae21-bf2a35762ca0',
--     'fcc86ded-6a90-48c8-8e95-14f4af494371'
--   );
--   DELETE FROM hato_tratamientos
--    WHERE animal_id = '58f8421b-57b0-4c3f-a456-7ed43c74d316'
--      AND nombre = 'Gestar 5 ml y servir' AND fecha_inicio = DATE '2026-09-09';
--
--   -- hato_tratamiento_pasos: restaurar fecha_ejecutada/descripcion.
--   UPDATE hato_tratamiento_pasos p SET
--     fecha_ejecutada = b.fecha_ejecutada, descripcion = b.descripcion
--   FROM respaldos.backup_153_hato_tratamiento_pasos b WHERE p.id = b.id;
--
--   -- hato_alertas: restaurar estado/respondida_por.
--   UPDATE hato_alertas a SET
--     estado = b.estado, respondida_por = b.respondida_por
--   FROM respaldos.backup_153_hato_alertas b WHERE a.id = b.id;
--
--   -- hato_animales: restaurar estado/fecha_estado/nombre/notas.
--   UPDATE hato_animales n SET
--     estado = b.estado, fecha_estado = b.fecha_estado,
--     nombre = b.nombre, notas = b.notas
--   FROM respaldos.backup_153_hato_animales b WHERE n.id = b.id;
-- COMMIT;
-- ============================================================================
