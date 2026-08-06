-- =============================================================================
-- 083_hato_inventario_definitivo_agosto_2026.sql
--
-- S1 ("Inventario definitivo", ruta critica) de
-- `docs/plan_hato_ronda_agosto_2026.md`. Deja `hato_animales` reflejando
-- EXACTAMENTE los 68 animales del Excel `INVENTARIO_TIBAGOTA_DEF_2026_2.xlsx`
-- (hoja "TAREA MEV"), sin perder historia y sin tocar Finanzas.
--
-- Decisiones del dueno que esta migracion ejecuta (ver plan §0 para el texto
-- completo -- no se repiten aqui las razones, solo la referencia):
--   D-1  Identidad = NOMBRE normalizado, no chapeta.
--   D-2  El Excel "TAREA MEV" es la fuente de la verdad del hato vivo (68).
--   D-3  Prefijo `5` = "S" de Supata: FLACA->5182, ESMERALDA->5162,
--        PACHA->5202. MOROCHA se queda en 202 (sin prefijo).
--   D-4  Las activas fuera del Excel salieron vendidas. NO se toca
--        `fin_ingresos` ni `fin_transacciones_ganado` -- el historico de esas
--        ventas se da por perdido.
--   D-15 CORAZA #172, MARGARITA #987 y VANIDOSA #173 se dan de baja pese a
--        estar en el chequeo del 2026-07-09 -- el Excel es posterior y manda.
--   D-16 VIOLETA: sobrevive la #174 (5 chequeos), toma chapeta 186; la #186
--        vacia se da de baja.
--   D-17 FABIOLA: sobrevive la #984 (17 chequeos, hija de INDIA), toma
--        chapeta 176; la #993 se da de baja.
--   D-18 Balde E (CARIOCA, GALLETA, MACARENA, MAYA) son fichas nuevas, NO se
--        fusionan con su vecino ortografico.
--
-- Reconciliacion verificada contra produccion el 2026-08-06 (ver plan §2.b y
-- las lecturas de solo-lectura de esta sesion, reproducidas antes de escribir
-- este archivo): 171 fichas totales, 80 `activa`. De las 68 del Excel:
--   59 ya activas (51 sin cambio de numero + 8 con renumeracion)
--    1 reactivacion (FLACA, vendida -> activa)
--    8 fichas nuevas (sin historia: 0 eventos, 0 chequeos, 0 pesajes)
--   ------------------------------------------------------------------
--   68
--
-- Las 21 bajas = 17 huerfanas (activas que no aparecen en el Excel, incluye
-- las 3 de D-15 y 3 fichas basura de la carga historica: abundantia, gala,
-- rochi) + 4 excedentes de homonimos resueltos por decision del dueno
-- (CUTA #207, FABIOLA #993, MORA #212, VIOLETA #186) -- la ficha gemela que
-- SI coincide con el Excel sobrevive sin tocarse.
--
-- ORDEN OBLIGATORIO (plan §4, S1): bajas -> renumeraciones -> altas. Ocho de
-- las 21 bajas liberan la chapeta que reclama una ficha nueva o renumerada
-- (207, 210, 211, 212, 213, 192, 175, 176); la renumeracion de PACHA
-- (202->5202) libera 202 para la nueva MOROCHA. Cualquier otro orden viola
-- `hato_animales_numero_activa_unique` (indice unico parcial, migracion 066,
-- valido solo entre `estado='activa'`).
--
-- NO SE TOCA: `fin_ingresos`, `fin_transacciones_ganado` (D-4),
-- `hato_chequeo_vacas`, `hato_pesajes_leche`. `hato_eventos` SOLO recibe las
-- 21 altas `tipo='venta'` descritas abajo -- nada mas.
--
-- EVENTOS DE SALIDA: las 91 fichas `vendida` preexistentes no tienen ni un
-- solo evento `venta`/`muerte` en `hato_eventos` (verificado: 0 filas de
-- esos tipos en toda la tabla antes de esta migracion). Para no heredar ese
-- hueco, cada una de las 21 bajas de ESTA migracion genera su propio evento
-- `venta` con `fecha = 2026-08-06` (fecha de la baja ADMINISTRATIVA, no la
-- fecha real de venta, que se desconoce), `fecha_confianza = 'desconocida'`
-- (nunca se afirma una fecha que no se sabe), `fuente = 'web'`, una nota
-- explicita en `datos` y `created_by` seteado a mano (no existe trigger que
-- cubra `hato_eventos`, a diferencia de `hato_animales`/`fin_gastos`/etc.).
-- Por la misma razon -- no inventar un dato que no se tiene -- esta
-- migracion NO toca `hato_animales.fecha_estado` en las bajas: esa columna
-- no tiene una contraparte de confianza como `hato_eventos.fecha_confianza`,
-- y poner ahi 2026-08-06 se leeria despues como "fecha real de venta", que
-- es exactamente la afirmacion falsa que el plan pide evitar. Quien necesite
-- la fecha de la baja administrativa la encuentra en el evento `venta`.
--
-- `created_by` en las 8 fichas nuevas y en los 21 eventos de venta usa la
-- cuenta Gerencia de Santiago (`sforero94@gmail.com`, id
-- 52665e55-a0e2-4605-bee1-c9f294cb2b76 en `usuarios`, mismo id en
-- `auth.users` -- verificado) por el mismo criterio que la migracion 063:
-- el autor real de esta limpieza (una migracion SQL, no una sesion de
-- Martha en la app) es conocido y es Santiago.
--
-- `origen='nacimiento'`, `confianza='media'` en las 8 fichas nuevas: mismo
-- criterio ya usado el 2026-07-24 para las 3 fichas nuevas de esa limpieza
-- de inventario (BRILLANTINA/NORMA/MORA, ver
-- `docs/hato/inventario-mev-2026-07-24.md`) -- son crias del propio hato sin
-- chequeo que las haya capturado, no compras.
--
-- `raza` y `fecha_nacimiento` NO se pueblan en las fichas nuevas: el Excel
-- "TAREA MEV" solo trae Numero/Nombre/Estado/Etapa (verificado leyendo el
-- .xlsx). Poblar cualquiera de esas dos columnas seria inventar un dato.
--
-- BACKUP: `respaldos.backup_083_hato_animales_pre_mev` (esquema `respaldos`,
-- NUNCA `public` -- migracion 081, el incidente que existe exactamente para
-- que esto no se repita) guarda el estado ANTES de tocar nada de las 31
-- filas que esta migracion modifica (21 bajas + 8 renumeraciones + 1
-- reactivacion FLACA + 1 correccion de etapa VICTORIA). Las 8 fichas nuevas
-- no necesitan backup -- no existian antes; su rollback es un DELETE.
--
-- GUARDS: patron de 080/081. Cada fase verifica su precondicion contra el
-- estado EXACTO verificado en produccion el 2026-08-06 y aborta la
-- transaccion completa (`RAISE EXCEPTION`) si algo no coincide. El postcheck
-- final valida las tres postcondiciones que pidio el brief: exactamente 68
-- `activa`, cero chapetas duplicadas entre activas, cero filas del Excel sin
-- ficha.
--
-- Correr el archivo COMPLETO de una sola vez (SQL editor o el conector
-- autenticado), para que sea una transaccion -- misma convencion que
-- 075/076/077/080/081, que tampoco escriben BEGIN/COMMIT explicitos.
--
-- *** ESTA MIGRACION NO SE APLICA SOLA. Punto de parada obligatorio del
-- brief S1: se entrega para revision de Santiago antes de ejecutarse. ***
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Backup -- snapshot de las 31 filas que se van a modificar, ANTES de
--    tocar nada. En `respaldos`, nunca en `public` (migracion 081).
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS respaldos.backup_083_hato_animales_pre_mev AS
SELECT *
  FROM public.hato_animales
 WHERE id IN (
  -- 17 huerfanas
  '85a8a760-6fbd-4898-91f4-79e76287933a', -- abundantia #106 (ficha basura)
  '1c4f366c-0d3e-4e9b-ab6e-e25f30a810d3', -- AMANDA #210
  '7e1fefaf-fe5d-4002-93bb-b59fd87cfc25', -- CÁNDIDA #199
  '6859b4ae-138e-4449-85e8-56dcc05e6035', -- CORAZA #172 (D-15)
  '066c1edb-846e-4eb3-b50c-dcd3da8d56b5', -- gala #130 (ficha basura)
  'aa429cc3-1ca9-4fe9-8a27-9211b65b1351', -- GRANADA #192
  '32737e2b-c31d-4a0c-9c9d-a8389c2a7321', -- MARGARITA #987 (D-15)
  '01e2c331-c79e-4c06-826e-779bdbe87545', -- MARINA #213
  '6eff1589-1576-452d-bc70-908f8664a7b9', -- MARQUEZA #188
  'c9319a0a-2467-4ea0-9f1b-d310a25d2813', -- MOTA #211
  '601c62b1-b4f7-4054-aac4-ded67d55e221', -- RECOCHA #187
  'f63d4e25-42ff-491b-bd59-f0ac763f0010', -- RITA #149
  'b9a23223-1130-429f-b6dd-dedfd82aa520', -- RITA #203
  'fe4fd12a-1aef-4eb5-a5a8-9fe643a79790', -- rochi #143 (ficha basura)
  'e1e6e6fc-db7e-4668-8a7a-d34c81cf7baf', -- VANIDOSA #173 (D-15)
  '4dcb739c-b58f-4bfd-be9b-a5a643853471', -- VIRGO #163
  '10534d34-6b3f-46ca-a2f2-c1663bcc5d69', -- VIVIAN #170
  -- 4 excedentes de homonimos
  '0800b608-0316-4226-812e-843d971449cc', -- CUTA #207 (sobrevive #193)
  '177b68b3-4648-4d32-a037-d117023d9552', -- FABIOLA #993 (D-17, sobrevive #984)
  'dce07caa-fae5-4590-9acb-899ebf5f8182', -- MORA #212 (sobrevive #183)
  '90cbdd5d-e082-4ead-975b-66b241591374', -- VIOLETA #186 (D-16, sobrevive #174)
  -- 8 renumeraciones (fichas activas que se quedan, cambian de chapeta)
  '52fa4f19-b9b3-4f9b-ba27-492b1783fd0a', -- CUÑA 997->43
  'ec5f8a17-f6ae-4e01-b3eb-afeb36ef4397', -- ESMERALDA 999->5162
  '58f8421b-57b0-4c3f-a456-7ed43c74d316', -- MONA 986->175
  'c0e928a5-f883-4025-98ff-48ad151b4653', -- VENUS 990->151
  '1d4dcc6f-ef9d-4afb-9257-7151b7a41efa', -- VITROLA 998->162
  '61ead300-2ddb-4f9d-a30f-88a419fdaa11', -- FABIOLA #984 984->176 (D-17)
  '6e1c5fab-5461-47f1-8758-69823c54f802', -- VIOLETA #174 174->186 (D-16)
  '43a6b514-17a3-405c-ba59-65727fb11a36', -- PACHA 202->5202 (D-3)
  -- reactivacion
  '83913986-e0ec-4ed8-b224-c70b6d253dcf', -- FLACA 978->5182, vendida->activa
  -- correccion de etapa
  '681d025a-f9c7-4093-ba65-a35a5a66512f'  -- VICTORIA #180 novilla->vaca
 );

COMMENT ON TABLE respaldos.backup_083_hato_animales_pre_mev IS
  'Estado de hato_animales ANTES de la migracion 083 (S1, inventario '
  'definitivo agosto 2026) para las 31 filas que modifica: 21 bajas + '
  '8 renumeraciones + 1 reactivacion (FLACA) + 1 correccion de etapa '
  '(VICTORIA). Las 8 fichas nuevas no estan aqui -- no existian antes; '
  'su rollback es DELETE. Creada directo en `respaldos`, nunca en `public` '
  '(migracion 081).';

ALTER TABLE respaldos.backup_083_hato_animales_pre_mev ENABLE ROW LEVEL SECURITY;


-- -----------------------------------------------------------------------------
-- 1. Guards previos -- abortan la migracion COMPLETA si la realidad no
--    coincide EXACTAMENTE con lo verificado en produccion el 2026-08-06.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_total          integer;
  v_activas        integer;
  v_backup         integer;
  v_bajas_activas  integer;
  v_ventas_previas integer;
  v_flaca_ok       boolean;
  v_victoria_ok    boolean;
  v_renum_mal      integer;
BEGIN
  SELECT count(*) INTO v_total FROM hato_animales;
  IF v_total <> 171 THEN
    RAISE EXCEPTION 'Migracion 083: se esperaban 171 filas en hato_animales, hay %. La base diverge del estado verificado -- NO se toco nada.', v_total;
  END IF;

  SELECT count(*) INTO v_activas FROM hato_animales WHERE estado = 'activa';
  IF v_activas <> 80 THEN
    RAISE EXCEPTION 'Migracion 083: se esperaban 80 fichas activa, hay %. NO se toco nada.', v_activas;
  END IF;

  SELECT count(*) INTO v_backup FROM respaldos.backup_083_hato_animales_pre_mev;
  IF v_backup <> 31 THEN
    RAISE EXCEPTION 'Migracion 083: el backup deberia tener 31 filas (21 bajas + 8 renumeraciones + FLACA + VICTORIA), tiene %. Puede que la migracion ya se haya corrido antes -- revisa manualmente, NO reintentes a ciegas.', v_backup;
  END IF;

  -- Las 21 bajas deben estar activa ahora mismo.
  SELECT count(*) INTO v_bajas_activas
    FROM hato_animales
   WHERE estado = 'activa'
     AND id IN (
      '85a8a760-6fbd-4898-91f4-79e76287933a','1c4f366c-0d3e-4e9b-ab6e-e25f30a810d3',
      '7e1fefaf-fe5d-4002-93bb-b59fd87cfc25','6859b4ae-138e-4449-85e8-56dcc05e6035',
      '066c1edb-846e-4eb3-b50c-dcd3da8d56b5','aa429cc3-1ca9-4fe9-8a27-9211b65b1351',
      '32737e2b-c31d-4a0c-9c9d-a8389c2a7321','01e2c331-c79e-4c06-826e-779bdbe87545',
      '6eff1589-1576-452d-bc70-908f8664a7b9','c9319a0a-2467-4ea0-9f1b-d310a25d2813',
      '601c62b1-b4f7-4054-aac4-ded67d55e221','f63d4e25-42ff-491b-bd59-f0ac763f0010',
      'b9a23223-1130-429f-b6dd-dedfd82aa520','fe4fd12a-1aef-4eb5-a5a8-9fe643a79790',
      'e1e6e6fc-db7e-4668-8a7a-d34c81cf7baf','4dcb739c-b58f-4bfd-be9b-a5a643853471',
      '10534d34-6b3f-46ca-a2f2-c1663bcc5d69','0800b608-0316-4226-812e-843d971449cc',
      '177b68b3-4648-4d32-a037-d117023d9552','dce07caa-fae5-4590-9acb-899ebf5f8182',
      '90cbdd5d-e082-4ead-975b-66b241591374'
     );
  IF v_bajas_activas <> 21 THEN
    RAISE EXCEPTION 'Migracion 083: de las 21 fichas a dar de baja, solo % estan activa ahora mismo. NO se toco nada.', v_bajas_activas;
  END IF;

  -- Ninguna venta/muerte debe existir todavia en hato_eventos (verificado
  -- 2026-08-06: cero filas de esos tipos en toda la tabla).
  SELECT count(*) INTO v_ventas_previas FROM hato_eventos WHERE tipo IN ('venta', 'muerte');
  IF v_ventas_previas <> 0 THEN
    RAISE EXCEPTION 'Migracion 083: se esperaban 0 eventos venta/muerte preexistentes, hay %. Revisa manualmente antes de continuar -- puede que otra limpieza ya haya corrido.', v_ventas_previas;
  END IF;

  -- FLACA: vendida, numero 978, antes de reactivar.
  SELECT (estado = 'vendida' AND numero = 978) INTO v_flaca_ok
    FROM hato_animales WHERE id = '83913986-e0ec-4ed8-b224-c70b6d253dcf';
  IF NOT COALESCE(v_flaca_ok, false) THEN
    RAISE EXCEPTION 'Migracion 083: FLACA (83913986-...) no esta en el estado esperado (vendida, #978). NO se toco nada.';
  END IF;

  -- VICTORIA: activa, novilla, numero 180, antes de corregir etapa.
  SELECT (estado = 'activa' AND etapa = 'novilla' AND numero = 180) INTO v_victoria_ok
    FROM hato_animales WHERE id = '681d025a-f9c7-4093-ba65-a35a5a66512f';
  IF NOT COALESCE(v_victoria_ok, false) THEN
    RAISE EXCEPTION 'Migracion 083: VICTORIA (681d025a-...) no esta en el estado esperado (activa, novilla, #180). NO se toco nada.';
  END IF;

  -- Las 8 renumeraciones deben tener HOY el numero viejo esperado y estar activa.
  SELECT count(*) INTO v_renum_mal
    FROM (VALUES
      ('52fa4f19-b9b3-4f9b-ba27-492b1783fd0a'::uuid, 997), -- CUÑA
      ('ec5f8a17-f6ae-4e01-b3eb-afeb36ef4397'::uuid, 999), -- ESMERALDA
      ('58f8421b-57b0-4c3f-a456-7ed43c74d316'::uuid, 986), -- MONA
      ('c0e928a5-f883-4025-98ff-48ad151b4653'::uuid, 990), -- VENUS
      ('1d4dcc6f-ef9d-4afb-9257-7151b7a41efa'::uuid, 998), -- VITROLA
      ('61ead300-2ddb-4f9d-a30f-88a419fdaa11'::uuid, 984), -- FABIOLA #984
      ('6e1c5fab-5461-47f1-8758-69823c54f802'::uuid, 174), -- VIOLETA #174
      ('43a6b514-17a3-405c-ba59-65727fb11a36'::uuid, 202)  -- PACHA
    ) AS expected(id, numero_actual)
    JOIN hato_animales a ON a.id = expected.id
   WHERE a.numero IS DISTINCT FROM expected.numero_actual OR a.estado <> 'activa';
  IF v_renum_mal <> 0 THEN
    RAISE EXCEPTION 'Migracion 083: % de las 8 fichas a renumerar no tienen el numero/estado esperado ahora mismo. NO se toco nada.', v_renum_mal;
  END IF;

  -- Los 8 numeros que reclaman las fichas nuevas deben estar libres entre
  -- activas AL FINAL de esta migracion, no antes -- ese chequeo va en el
  -- postcheck. Aqui solo confirmamos que HOY los ocupan exactamente los
  -- animales que este archivo va a dar de baja o renumerar (nadie mas).
  IF EXISTS (
    SELECT 1 FROM hato_animales
     WHERE estado = 'activa'
       AND numero IN (210, 207, 179, 192, 213, 211, 212, 202)
       AND id NOT IN (
         '1c4f366c-0d3e-4e9b-ab6e-e25f30a810d3', -- AMANDA #210
         '0800b608-0316-4226-812e-843d971449cc', -- CUTA #207
         'aa429cc3-1ca9-4fe9-8a27-9211b65b1351', -- GRANADA #192
         '01e2c331-c79e-4c06-826e-779bdbe87545', -- MARINA #213
         'c9319a0a-2467-4ea0-9f1b-d310a25d2813', -- MOTA #211
         'dce07caa-fae5-4590-9acb-899ebf5f8182', -- MORA #212
         '43a6b514-17a3-405c-ba59-65727fb11a36'  -- PACHA #202
       )
  ) THEN
    RAISE EXCEPTION 'Migracion 083: alguna chapeta que reclama una ficha nueva (210/207/179/192/213/211/212/202) esta ocupada por un animal activo inesperado. NO se toco nada -- revisa manualmente.';
  END IF;

  RAISE NOTICE 'Migracion 083: guards previos OK -- 171 filas, 80 activas, 31 filas de backup, 21 bajas activas, 0 eventos venta/muerte previos, FLACA/VICTORIA/renumeraciones en el estado esperado. Procediendo.';
END $$;


-- -----------------------------------------------------------------------------
-- 2. Bajas (21) -- estado='vendida'. Se hace PRIMERO: libera las chapetas
--    207/210/211/212/213/192 para las altas y no toca `numero` ni
--    `fecha_estado` (ver nota de cabecera sobre por que no se asume una
--    fecha de venta real).
-- -----------------------------------------------------------------------------

UPDATE hato_animales
   SET estado = 'vendida'
 WHERE id IN (
  '85a8a760-6fbd-4898-91f4-79e76287933a', -- abundantia #106
  '1c4f366c-0d3e-4e9b-ab6e-e25f30a810d3', -- AMANDA #210
  '7e1fefaf-fe5d-4002-93bb-b59fd87cfc25', -- CÁNDIDA #199
  '6859b4ae-138e-4449-85e8-56dcc05e6035', -- CORAZA #172
  '066c1edb-846e-4eb3-b50c-dcd3da8d56b5', -- gala #130
  'aa429cc3-1ca9-4fe9-8a27-9211b65b1351', -- GRANADA #192
  '32737e2b-c31d-4a0c-9c9d-a8389c2a7321', -- MARGARITA #987
  '01e2c331-c79e-4c06-826e-779bdbe87545', -- MARINA #213
  '6eff1589-1576-452d-bc70-908f8664a7b9', -- MARQUEZA #188
  'c9319a0a-2467-4ea0-9f1b-d310a25d2813', -- MOTA #211
  '601c62b1-b4f7-4054-aac4-ded67d55e221', -- RECOCHA #187
  'f63d4e25-42ff-491b-bd59-f0ac763f0010', -- RITA #149
  'b9a23223-1130-429f-b6dd-dedfd82aa520', -- RITA #203
  'fe4fd12a-1aef-4eb5-a5a8-9fe643a79790', -- rochi #143
  'e1e6e6fc-db7e-4668-8a7a-d34c81cf7baf', -- VANIDOSA #173
  '4dcb739c-b58f-4bfd-be9b-a5a643853471', -- VIRGO #163
  '10534d34-6b3f-46ca-a2f2-c1663bcc5d69', -- VIVIAN #170
  '0800b608-0316-4226-812e-843d971449cc', -- CUTA #207
  '177b68b3-4648-4d32-a037-d117023d9552', -- FABIOLA #993
  'dce07caa-fae5-4590-9acb-899ebf5f8182', -- MORA #212
  '90cbdd5d-e082-4ead-975b-66b241591374'  -- VIOLETA #186
 )
 AND estado = 'activa';


-- -----------------------------------------------------------------------------
-- 3. Eventos de salida -- un `hato_eventos` tipo='venta' por cada una de las
--    21 bajas de arriba (ver nota de cabecera: cierra el hueco de que las
--    91 `vendida` preexistentes no tienen ningun evento de salida, sin
--    inventar una fecha real que no se conoce).
-- -----------------------------------------------------------------------------

INSERT INTO hato_eventos (animal_id, tipo, fecha, fecha_confianza, fuente, datos, created_by)
SELECT
  a.id,
  'venta',
  '2026-08-06'::date,
  'desconocida',
  'web',
  jsonb_build_object(
    'nota', 'Baja administrativa por inventario definitivo del 2026-08-06 (INVENTARIO_TIBAGOTA_DEF_2026_2.xlsx, hoja "TAREA MEV"). La fecha real de salida se desconoce -- 2026-08-06 es la fecha en que se registro la baja, no la fecha de venta.',
    'numero_al_momento_baja', a.numero,
    'nombre_al_momento_baja', a.nombre,
    'origen_migracion', '083_hato_inventario_definitivo_agosto_2026'
  ),
  '52665e55-a0e2-4605-bee1-c9f294cb2b76'::uuid -- Santiago Forero, Gerencia (sforero94@gmail.com)
FROM hato_animales a
WHERE a.id IN (
  '85a8a760-6fbd-4898-91f4-79e76287933a','1c4f366c-0d3e-4e9b-ab6e-e25f30a810d3',
  '7e1fefaf-fe5d-4002-93bb-b59fd87cfc25','6859b4ae-138e-4449-85e8-56dcc05e6035',
  '066c1edb-846e-4eb3-b50c-dcd3da8d56b5','aa429cc3-1ca9-4fe9-8a27-9211b65b1351',
  '32737e2b-c31d-4a0c-9c9d-a8389c2a7321','01e2c331-c79e-4c06-826e-779bdbe87545',
  '6eff1589-1576-452d-bc70-908f8664a7b9','c9319a0a-2467-4ea0-9f1b-d310a25d2813',
  '601c62b1-b4f7-4054-aac4-ded67d55e221','f63d4e25-42ff-491b-bd59-f0ac763f0010',
  'b9a23223-1130-429f-b6dd-dedfd82aa520','fe4fd12a-1aef-4eb5-a5a8-9fe643a79790',
  'e1e6e6fc-db7e-4668-8a7a-d34c81cf7baf','4dcb739c-b58f-4bfd-be9b-a5a643853471',
  '10534d34-6b3f-46ca-a2f2-c1663bcc5d69','0800b608-0316-4226-812e-843d971449cc',
  '177b68b3-4648-4d32-a037-d117023d9552','dce07caa-fae5-4590-9acb-899ebf5f8182',
  '90cbdd5d-e082-4ead-975b-66b241591374'
);


-- -----------------------------------------------------------------------------
-- Guard intermedio -- confirma que las bajas y sus eventos quedaron bien
-- antes de seguir con renumeraciones/altas.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_bajas_ok  integer;
  v_ventas    integer;
BEGIN
  SELECT count(*) INTO v_bajas_ok
    FROM hato_animales
   WHERE estado = 'vendida'
     AND id IN (
      '85a8a760-6fbd-4898-91f4-79e76287933a','1c4f366c-0d3e-4e9b-ab6e-e25f30a810d3',
      '7e1fefaf-fe5d-4002-93bb-b59fd87cfc25','6859b4ae-138e-4449-85e8-56dcc05e6035',
      '066c1edb-846e-4eb3-b50c-dcd3da8d56b5','aa429cc3-1ca9-4fe9-8a27-9211b65b1351',
      '32737e2b-c31d-4a0c-9c9d-a8389c2a7321','01e2c331-c79e-4c06-826e-779bdbe87545',
      '6eff1589-1576-452d-bc70-908f8664a7b9','c9319a0a-2467-4ea0-9f1b-d310a25d2813',
      '601c62b1-b4f7-4054-aac4-ded67d55e221','f63d4e25-42ff-491b-bd59-f0ac763f0010',
      'b9a23223-1130-429f-b6dd-dedfd82aa520','fe4fd12a-1aef-4eb5-a5a8-9fe643a79790',
      'e1e6e6fc-db7e-4668-8a7a-d34c81cf7baf','4dcb739c-b58f-4bfd-be9b-a5a643853471',
      '10534d34-6b3f-46ca-a2f2-c1663bcc5d69','0800b608-0316-4226-812e-843d971449cc',
      '177b68b3-4648-4d32-a037-d117023d9552','dce07caa-fae5-4590-9acb-899ebf5f8182',
      '90cbdd5d-e082-4ead-975b-66b241591374'
     );
  IF v_bajas_ok <> 21 THEN
    RAISE EXCEPTION 'Migracion 083: tras el UPDATE de bajas, solo % de 21 quedaron vendida. Revisa manualmente.', v_bajas_ok;
  END IF;

  SELECT count(*) INTO v_ventas FROM hato_eventos WHERE tipo = 'venta';
  IF v_ventas <> 21 THEN
    RAISE EXCEPTION 'Migracion 083: se esperaban 21 eventos tipo=venta tras el INSERT, hay %. Revisa manualmente.', v_ventas;
  END IF;

  RAISE NOTICE 'Migracion 083: 21 bajas OK, 21 eventos de venta creados. Continuando con renumeraciones.';
END $$;


-- -----------------------------------------------------------------------------
-- 4. Renumeraciones (8) -- fichas activas que se quedan, cambian de
--    chapeta. Un solo UPDATE ... FROM (VALUES ...) para que el indice unico
--    parcial `hato_animales_numero_activa_unique` se valide al final del
--    statement y no por fila (mismo mecanismo ya usado y documentado para
--    la re-numeracion masiva post-066, ver `src/components/hato/CLAUDE.md`
--    "Identity model & renumeracion").
-- -----------------------------------------------------------------------------

UPDATE hato_animales AS a
   SET numero = v.numero_nuevo
  FROM (VALUES
    ('52fa4f19-b9b3-4f9b-ba27-492b1783fd0a'::uuid, 43),   -- CUÑA
    ('ec5f8a17-f6ae-4e01-b3eb-afeb36ef4397'::uuid, 5162), -- ESMERALDA (D-3)
    ('58f8421b-57b0-4c3f-a456-7ed43c74d316'::uuid, 175),  -- MONA
    ('c0e928a5-f883-4025-98ff-48ad151b4653'::uuid, 151),  -- VENUS
    ('1d4dcc6f-ef9d-4afb-9257-7151b7a41efa'::uuid, 162),  -- VITROLA
    ('61ead300-2ddb-4f9d-a30f-88a419fdaa11'::uuid, 176),  -- FABIOLA #984 (D-17)
    ('6e1c5fab-5461-47f1-8758-69823c54f802'::uuid, 186),  -- VIOLETA #174 (D-16)
    ('43a6b514-17a3-405c-ba59-65727fb11a36'::uuid, 5202)  -- PACHA (D-3)
  ) AS v(id, numero_nuevo)
 WHERE a.id = v.id;


-- -----------------------------------------------------------------------------
-- 5. Reactivacion de FLACA -- unica reactivacion de la ronda. Combina
--    vendida->activa con la renumeracion 978->5182 (D-3) en el mismo
--    UPDATE porque no hay conflicto: 5182 no lo ocupa nadie.
-- -----------------------------------------------------------------------------

UPDATE hato_animales
   SET estado = 'activa',
       numero = 5182
 WHERE id = '83913986-e0ec-4ed8-b224-c70b6d253dcf'
   AND estado = 'vendida'
   AND numero = 978;


-- -----------------------------------------------------------------------------
-- Guard intermedio -- renumeraciones + reactivacion antes de las altas.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_renum_ok integer;
  v_flaca_ok boolean;
BEGIN
  SELECT count(*) INTO v_renum_ok
    FROM (VALUES
      ('52fa4f19-b9b3-4f9b-ba27-492b1783fd0a'::uuid, 43),
      ('ec5f8a17-f6ae-4e01-b3eb-afeb36ef4397'::uuid, 5162),
      ('58f8421b-57b0-4c3f-a456-7ed43c74d316'::uuid, 175),
      ('c0e928a5-f883-4025-98ff-48ad151b4653'::uuid, 151),
      ('1d4dcc6f-ef9d-4afb-9257-7151b7a41efa'::uuid, 162),
      ('61ead300-2ddb-4f9d-a30f-88a419fdaa11'::uuid, 176),
      ('6e1c5fab-5461-47f1-8758-69823c54f802'::uuid, 186),
      ('43a6b514-17a3-405c-ba59-65727fb11a36'::uuid, 5202)
    ) AS expected(id, numero_nuevo)
    JOIN hato_animales a ON a.id = expected.id
   WHERE a.numero = expected.numero_nuevo AND a.estado = 'activa';
  IF v_renum_ok <> 8 THEN
    RAISE EXCEPTION 'Migracion 083: tras renumerar, solo % de 8 fichas quedaron con el numero nuevo esperado. Revisa manualmente.', v_renum_ok;
  END IF;

  SELECT (estado = 'activa' AND numero = 5182) INTO v_flaca_ok
    FROM hato_animales WHERE id = '83913986-e0ec-4ed8-b224-c70b6d253dcf';
  IF NOT COALESCE(v_flaca_ok, false) THEN
    RAISE EXCEPTION 'Migracion 083: FLACA no quedo activa con #5182 tras la reactivacion. Revisa manualmente.';
  END IF;

  RAISE NOTICE 'Migracion 083: 8 renumeraciones OK, FLACA reactivada en #5182. Continuando con altas.';
END $$;


-- -----------------------------------------------------------------------------
-- 6. Fichas nuevas (8) -- Balde E + MOROCHA/CARIOCA/CAMELIA/MONARCA. Sin
--    historia previa (0 eventos, 0 chequeos, 0 pesajes -- verificado). Las
--    chapetas que reclaman ya estan libres tras los pasos 2 y 4.
--    `raza`/`fecha_nacimiento` se dejan NULL -- el Excel no los trae.
-- -----------------------------------------------------------------------------

INSERT INTO hato_animales (numero, nombre, sexo, etapa, estado, origen, confianza, created_by)
VALUES
  (210, 'CAMELIA',  'hembra', 'ternera', 'activa', 'nacimiento', 'media', '52665e55-a0e2-4605-bee1-c9f294cb2b76'),
  (207, 'CARIOCA',  'hembra', 'novilla', 'activa', 'nacimiento', 'media', '52665e55-a0e2-4605-bee1-c9f294cb2b76'),
  (179, 'ESPERANZA','hembra', 'novilla', 'activa', 'nacimiento', 'media', '52665e55-a0e2-4605-bee1-c9f294cb2b76'),
  (192, 'GALLETA',  'hembra', 'novilla', 'activa', 'nacimiento', 'media', '52665e55-a0e2-4605-bee1-c9f294cb2b76'),
  (213, 'MACARENA', 'hembra', 'ternera', 'activa', 'nacimiento', 'media', '52665e55-a0e2-4605-bee1-c9f294cb2b76'),
  (211, 'MAYA',     'hembra', 'ternera', 'activa', 'nacimiento', 'media', '52665e55-a0e2-4605-bee1-c9f294cb2b76'),
  (212, 'MONARCA',  'hembra', 'ternera', 'activa', 'nacimiento', 'media', '52665e55-a0e2-4605-bee1-c9f294cb2b76'),
  (202, 'MOROCHA',  'hembra', 'novilla', 'activa', 'nacimiento', 'media', '52665e55-a0e2-4605-bee1-c9f294cb2b76');


-- -----------------------------------------------------------------------------
-- 7. Correccion de etapa -- VICTORIA #180: novilla -> vaca (Excel manda).
--    No cambia numero ni estado.
-- -----------------------------------------------------------------------------

UPDATE hato_animales
   SET etapa = 'vaca'
 WHERE id = '681d025a-f9c7-4093-ba65-a35a5a66512f'
   AND etapa = 'novilla'
   AND numero = 180
   AND estado = 'activa';


-- -----------------------------------------------------------------------------
-- 8. Postcondiciones finales -- las tres que pide el brief S1, mas los
--    conteos generales. Recalculadas de forma independiente a los guards
--    intermedios de arriba (no una repeticion de la misma aritmetica).
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_activas       integer;
  v_total         integer;
  v_dupes         integer;
  v_faltantes     integer;
  v_ventas        integer;
  v_victoria_ok   boolean;
BEGIN
  -- Postcondicion 1: exactamente 68 activa.
  SELECT count(*) INTO v_activas FROM hato_animales WHERE estado = 'activa';
  IF v_activas <> 68 THEN
    RAISE EXCEPTION 'Migracion 083: tras la migracion hay % fichas activa, se esperaban exactamente 68. NO reintentes a ciegas -- revisa manualmente.', v_activas;
  END IF;

  -- El total de la tabla debe ser 171 + 8 altas = 179.
  SELECT count(*) INTO v_total FROM hato_animales;
  IF v_total <> 179 THEN
    RAISE EXCEPTION 'Migracion 083: hato_animales tiene % filas, se esperaban 179 (171 + 8 altas). Revisa manualmente.', v_total;
  END IF;

  -- Postcondicion 2: cero chapetas duplicadas entre activas.
  SELECT count(*) INTO v_dupes FROM (
    SELECT numero FROM hato_animales
     WHERE estado = 'activa' AND numero IS NOT NULL
     GROUP BY numero HAVING count(*) > 1
  ) d;
  IF v_dupes <> 0 THEN
    RAISE EXCEPTION 'Migracion 083: quedan % chapetas duplicadas entre fichas activa. Revisa manualmente.', v_dupes;
  END IF;

  -- Postcondicion 3: cero filas del Excel sin ficha -- los 68 numeros
  -- finales deben existir, cada uno en exactamente una ficha activa.
  SELECT count(*) INTO v_faltantes FROM (
    VALUES
      (43),(88),(98),(100),(101),(103),(104),(108),(109),(117),(119),(120),
      (121),(123),(124),(135),(139),(140),(141),(148),(151),(152),(154),
      (156),(157),(160),(162),(166),(167),(169),(175),(176),(177),(178),
      (179),(180),(181),(182),(183),(184),(185),(186),(189),(190),(191),
      (192),(193),(194),(195),(196),(197),(201),(202),(204),(205),(206),
      (207),(208),(209),(210),(211),(212),(213),(214),(215),(5162),(5182),(5202)
  ) AS excel(numero)
  WHERE NOT EXISTS (
    SELECT 1 FROM hato_animales a
     WHERE a.estado = 'activa' AND a.numero = excel.numero
  );
  IF v_faltantes <> 0 THEN
    RAISE EXCEPTION 'Migracion 083: % chapetas del Excel de 68 no tienen ficha activa tras la migracion. Revisa manualmente.', v_faltantes;
  END IF;

  -- Ventas: exactamente 21 (los 21 nuevos eventos de esta migracion, nada mas).
  SELECT count(*) INTO v_ventas FROM hato_eventos WHERE tipo = 'venta';
  IF v_ventas <> 21 THEN
    RAISE EXCEPTION 'Migracion 083: hay % eventos tipo=venta al final, se esperaban 21. Revisa manualmente.', v_ventas;
  END IF;

  -- VICTORIA quedo en 'vaca'.
  SELECT (etapa = 'vaca') INTO v_victoria_ok
    FROM hato_animales WHERE id = '681d025a-f9c7-4093-ba65-a35a5a66512f';
  IF NOT COALESCE(v_victoria_ok, false) THEN
    RAISE EXCEPTION 'Migracion 083: VICTORIA no quedo en etapa=vaca. Revisa manualmente.';
  END IF;

  RAISE NOTICE 'Migracion 083 OK: 68 activas (0 duplicadas, 0 chapetas del Excel faltantes), 179 filas totales, 21 eventos de venta, VICTORIA en vaca. S1 completa.';
END $$;


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Restaura las 31 filas modificadas desde el backup, borra las 8 fichas
-- nuevas y sus 21 eventos de venta. Se listan las columnas explicitamente
-- para que un cambio de esquema futuro en hato_animales no rompa el
-- rollback en silencio.
--
--   -- 1. Eventos de venta creados por esta migracion.
--   DELETE FROM hato_eventos
--    WHERE tipo = 'venta'
--      AND datos->>'origen_migracion' = '083_hato_inventario_definitivo_agosto_2026';
--
--   -- 2. Fichas nuevas creadas por esta migracion.
--   DELETE FROM hato_animales
--    WHERE numero IN (210, 207, 179, 192, 213, 211, 212, 202)
--      AND estado = 'activa'
--      AND nombre IN ('CAMELIA','CARIOCA','ESPERANZA','GALLETA','MACARENA','MAYA','MONARCA','MOROCHA');
--
--   -- 3. Restaura bajas, renumeraciones, reactivacion de FLACA y etapa de
--   --    VICTORIA a su estado previo.
--   UPDATE hato_animales AS a
--      SET numero = b.numero, nombre = b.nombre, sexo = b.sexo, etapa = b.etapa,
--          estado = b.estado, raza = b.raza, fecha_estado = b.fecha_estado,
--          fecha_nacimiento = b.fecha_nacimiento,
--          fecha_nacimiento_confianza = b.fecha_nacimiento_confianza,
--          madre_id = b.madre_id, padre_toro_id = b.padre_toro_id,
--          padre_id = b.padre_id, finca_id = b.finca_id, origen = b.origen,
--          confianza = b.confianza, import_meta = b.import_meta, notas = b.notas
--     FROM respaldos.backup_083_hato_animales_pre_mev b
--    WHERE a.id = b.id;
--
-- La tabla `respaldos.backup_083_hato_animales_pre_mev` se deja en la base
-- a proposito, mismo criterio que 075/076/080. Borrarla cuando Santiago
-- confirme que el hato de 68 se ve correcto en la app.
-- =============================================================================
