-- =============================================================================
-- 083b_hato_pesajes_junio_2026_faltantes.sql
--
-- Complemento de datos de la migracion 083 (S1, "Inventario definitivo",
-- `docs/plan_hato_ronda_agosto_2026.md`). Carga los 12 pesajes de junio 2026
-- que estaban en la planilla de papel y nunca entraron a la base.
--
-- SE APLICA DESPUES DE 083, NUNCA ANTES: FLACA esta `vendida` hasta que 083
-- la reactive, y el guard de abajo lo exige explicitamente.
--
-- Numeracion `083b` (no `084`) por la misma razon que existen dos archivos
-- `019_`: 084 ya esta asignada a la sesion S3, que corre en paralelo.
--
-- ORIGEN DEL DATO: foto de la planilla mensual "PRODUCCION DE LECHE MES:
-- Junio 2026". La planilla trae ~31 vacas con datos; la base tenia 27-28 por
-- fecha. Las unicas 3 con datos en papel y CERO filas en la base son FABIOLA,
-- FLACA y VICTORIA. (INDIA tiene 3 de 4 semanas y las 3 ya estaban cargadas;
-- su semana 4 esta en blanco tambien en el papel, asi que no falta nada suyo.)
--
-- TRANSCRIPCION VERIFICADA DOS VECES, de forma independiente, antes de
-- escribir este archivo:
--   1. El agente de la sesion S1 la leyo y la calibro contra 6 vacas ya
--      cargadas (ALINA, AMAPOLA, BRIGIDA, ESMERALDA, FUERZA, JASPEADA),
--      que coinciden semana por semana con lo que ya esta en la base.
--   2. Una segunda lectura de las mismas 3 filas del papel produjo los 24
--      numeros identicos.
-- La unica ambiguedad del papel -- un trazo curvo junto al ultimo digito de
-- FLACA y FUERZA en la semana 4 -- se resolvio contra el dato ya cargado de
-- FUERZA (2026-06-24 = 6 am / 8 pm): el trazo NO es un digito. Por eso la
-- semana 4 de FLACA entra como 5 / 7 y no como 5x / 7x.
--
-- COLUMNAS: la planilla trae DOS numeros por semana = ordeno de la manana y
-- de la tarde. `litros_total` es una columna real desde la migracion 061 (ya
-- no es GENERATED), asi que se escribe explicitamente como am + pm -- el
-- mismo criterio con el que estan cargadas las 364 filas existentes.
--
-- `fuente = 'importacion_leche_2026'`: el mismo valor que llevan las 364
-- filas ya cargadas. Estas 12 pertenecen a la misma planilla y a la misma
-- carga historica; inventarles una fuente distinta las separaria de sus
-- hermanas sin ninguna razon.
--
-- FECHAS: los 4 miercoles de junio 2026 (03, 10, 17, 24), que son las 4
-- columnas "Semana N" del papel y las 4 fechas que ya existen en la base
-- para ese mes.
--
-- NO SE TOCA nada mas: ni `hato_animales`, ni `hato_eventos`, ni Finanzas.
-- Sin backup: esta migracion solo INSERTA filas nuevas; su rollback es el
-- DELETE del pie de archivo.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Guards previos
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_activas      integer;
  v_ya_cargados  integer;
BEGIN
  -- Las 3 vacas deben existir y estar `activa`. FLACA solo lo esta despues
  -- de la migracion 083 -- este guard es el que impide correr 083b antes.
  SELECT count(*) INTO v_activas
    FROM hato_animales
   WHERE estado = 'activa'
     AND id IN (
      '61ead300-2ddb-4f9d-a30f-88a419fdaa11', -- FABIOLA
      '83913986-e0ec-4ed8-b224-c70b6d253dcf', -- FLACA (requiere 083 aplicada)
      '681d025a-f9c7-4093-ba65-a35a5a66512f'  -- VICTORIA
     );
  IF v_activas <> 3 THEN
    RAISE EXCEPTION 'Migracion 083b: se esperaban 3 fichas activa (FABIOLA/FLACA/VICTORIA), hay %. Si falta FLACA, es que 083 no se ha aplicado todavia -- aplicala primero. NO se toco nada.', v_activas;
  END IF;

  -- Ninguna de las 12 combinaciones (animal, fecha) puede existir ya:
  -- `UNIQUE (animal_id, fecha)` haria fallar el INSERT, pero es mejor
  -- abortar con un mensaje que diga por que.
  SELECT count(*) INTO v_ya_cargados
    FROM hato_pesajes_leche
   WHERE animal_id IN (
      '61ead300-2ddb-4f9d-a30f-88a419fdaa11',
      '83913986-e0ec-4ed8-b224-c70b6d253dcf',
      '681d025a-f9c7-4093-ba65-a35a5a66512f'
     )
     AND fecha IN ('2026-06-03', '2026-06-10', '2026-06-17', '2026-06-24');
  IF v_ya_cargados <> 0 THEN
    RAISE EXCEPTION 'Migracion 083b: ya existen % pesajes de junio 2026 para FABIOLA/FLACA/VICTORIA. Puede que esta migracion ya se haya corrido -- revisa manualmente, NO reintentes a ciegas.', v_ya_cargados;
  END IF;

  RAISE NOTICE 'Migracion 083b: guards previos OK -- 3 vacas activa, 0 pesajes preexistentes. Procediendo.';
END $$;


-- -----------------------------------------------------------------------------
-- 2. Los 12 pesajes. `litros_total` explicito = am + pm.
-- -----------------------------------------------------------------------------

INSERT INTO hato_pesajes_leche
  (animal_id, fecha, litros_am, litros_pm, litros_total, fuente, created_by)
VALUES
  -- FABIOLA (#984 -> 176 tras la 083)
  ('61ead300-2ddb-4f9d-a30f-88a419fdaa11','2026-06-03',11.5,13,  24.5,'importacion_leche_2026','52665e55-a0e2-4605-bee1-c9f294cb2b76'),
  ('61ead300-2ddb-4f9d-a30f-88a419fdaa11','2026-06-10', 8,  12,  20,  'importacion_leche_2026','52665e55-a0e2-4605-bee1-c9f294cb2b76'),
  ('61ead300-2ddb-4f9d-a30f-88a419fdaa11','2026-06-17',11,  12,  23,  'importacion_leche_2026','52665e55-a0e2-4605-bee1-c9f294cb2b76'),
  ('61ead300-2ddb-4f9d-a30f-88a419fdaa11','2026-06-24', 9.5,11,  20.5,'importacion_leche_2026','52665e55-a0e2-4605-bee1-c9f294cb2b76'),
  -- FLACA (#978 -> 5182 tras la 083, reactivada)
  ('83913986-e0ec-4ed8-b224-c70b6d253dcf','2026-06-03', 8,   9,  17,  'importacion_leche_2026','52665e55-a0e2-4605-bee1-c9f294cb2b76'),
  ('83913986-e0ec-4ed8-b224-c70b6d253dcf','2026-06-10', 6.5, 8.5,15,  'importacion_leche_2026','52665e55-a0e2-4605-bee1-c9f294cb2b76'),
  ('83913986-e0ec-4ed8-b224-c70b6d253dcf','2026-06-17', 8,   7.5,15.5,'importacion_leche_2026','52665e55-a0e2-4605-bee1-c9f294cb2b76'),
  ('83913986-e0ec-4ed8-b224-c70b6d253dcf','2026-06-24', 5,   7,  12,  'importacion_leche_2026','52665e55-a0e2-4605-bee1-c9f294cb2b76'),
  -- VICTORIA (#180)
  ('681d025a-f9c7-4093-ba65-a35a5a66512f','2026-06-03', 7,   8.5,15.5,'importacion_leche_2026','52665e55-a0e2-4605-bee1-c9f294cb2b76'),
  ('681d025a-f9c7-4093-ba65-a35a5a66512f','2026-06-10', 6,   7,  13,  'importacion_leche_2026','52665e55-a0e2-4605-bee1-c9f294cb2b76'),
  ('681d025a-f9c7-4093-ba65-a35a5a66512f','2026-06-17', 8,   6,  14,  'importacion_leche_2026','52665e55-a0e2-4605-bee1-c9f294cb2b76'),
  ('681d025a-f9c7-4093-ba65-a35a5a66512f','2026-06-24', 6,   6,  12,  'importacion_leche_2026','52665e55-a0e2-4605-bee1-c9f294cb2b76');


-- -----------------------------------------------------------------------------
-- 3. Postcondiciones
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_nuevos      integer;
  v_suma_mal    integer;
  v_por_fecha   text;
BEGIN
  SELECT count(*) INTO v_nuevos
    FROM hato_pesajes_leche
   WHERE animal_id IN (
      '61ead300-2ddb-4f9d-a30f-88a419fdaa11',
      '83913986-e0ec-4ed8-b224-c70b6d253dcf',
      '681d025a-f9c7-4093-ba65-a35a5a66512f'
     )
     AND fecha IN ('2026-06-03', '2026-06-10', '2026-06-17', '2026-06-24');
  IF v_nuevos <> 12 THEN
    RAISE EXCEPTION 'Migracion 083b: se esperaban 12 pesajes tras el INSERT, hay %. Revisa manualmente.', v_nuevos;
  END IF;

  -- `litros_total` debe ser exactamente am + pm en las 12 filas nuevas.
  SELECT count(*) INTO v_suma_mal
    FROM hato_pesajes_leche
   WHERE animal_id IN (
      '61ead300-2ddb-4f9d-a30f-88a419fdaa11',
      '83913986-e0ec-4ed8-b224-c70b6d253dcf',
      '681d025a-f9c7-4093-ba65-a35a5a66512f'
     )
     AND fecha IN ('2026-06-03', '2026-06-10', '2026-06-17', '2026-06-24')
     AND litros_total IS DISTINCT FROM (COALESCE(litros_am,0) + COALESCE(litros_pm,0));
  IF v_suma_mal <> 0 THEN
    RAISE EXCEPTION 'Migracion 083b: % filas nuevas tienen litros_total distinto de am+pm. Revisa manualmente.', v_suma_mal;
  END IF;

  -- Junio 2026 debe quedar con 31 vacas medidas en las 3 fechas completas
  -- (2026-06-03/17/24 tenian 27-28; 2026-06-10 tenia 28) -- se reporta, no
  -- se exige un numero, porque la cobertura por fecha la manda el papel.
  SELECT string_agg(fecha::text || '=' || n::text, ', ' ORDER BY fecha) INTO v_por_fecha
    FROM (
      SELECT fecha, count(*) n FROM hato_pesajes_leche
       WHERE fecha BETWEEN '2026-06-01' AND '2026-06-30' GROUP BY fecha
    ) x;
  RAISE NOTICE 'Migracion 083b OK: 12 pesajes cargados, litros_total consistente. Cobertura junio 2026: %', v_por_fecha;
END $$;


-- =============================================================================
-- ROLLBACK
-- =============================================================================
--   DELETE FROM hato_pesajes_leche
--    WHERE animal_id IN (
--      '61ead300-2ddb-4f9d-a30f-88a419fdaa11',  -- FABIOLA
--      '83913986-e0ec-4ed8-b224-c70b6d253dcf',  -- FLACA
--      '681d025a-f9c7-4093-ba65-a35a5a66512f'   -- VICTORIA
--     )
--      AND fecha IN ('2026-06-03','2026-06-10','2026-06-17','2026-06-24');
-- =============================================================================
