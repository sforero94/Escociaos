-- ============================================================================
-- 139_hato_duplicados_guardarrail.sql
--
-- *** ESCRITA, SIN APLICAR — ESPERA EL GO DEL DUEÑO (2026-09-08). ***
-- Borra una fila de `hato_eventos` (el duplicado de FLACA) y eso no se
-- ejecuta sin una decisión explícita. El resto —los dos índices— es inerte
-- mientras el fichero no corra. Mismo criterio que la 133 y la 137.
--
-- NOTA sobre la fecha, para quien lea esto después: durante esta sesión se
-- sospechó que las fechas de FLACA y de otras tres vacas estaban corridas
-- cuatro meses por una lectura DD/MM contra MM/DD. **Esa hipótesis se
-- refutó.** El valor crudo `9/5/2026` ya estaba en el chequeo del 9 de julio
-- de 2026, importado el 23 de julio — siete semanas ANTES de que Martha
-- registrara nada por Telegram — y en esa misma fila la veterinaria anotó
-- «2 mes» de preñez, que es exactamente la distancia del 9 de mayo al 9 de
-- julio. Un servicio del 5 de septiembre no puede aparecer en una planilla
-- de julio. Las fechas guardadas son las de la planilla y esta migración NO
-- las toca. Si la planilla misma estuviera mal, la corrección va en el
-- chequeo, no acá.
--
-- Cierra el defecto de raíz que dejó abierto la 138: nada impedía registrar
-- DOS VECES el mismo evento del hato. El 2026-09-08 pasó dos veces en una
-- misma tarde, las dos por el flujo de Telegram y las dos de Martha Vega:
--   19:51 / 21:00  ELECTRA #117, inseminación con pajilla de Jericó del
--                  2026-08-11. Además descontó el inventario dos veces
--                  (lo que la 138 tuvo que revertir).
--   21:19 / 21:35  FLACA #5182, monta con Jersey del 2026-05-09. Sin
--                  pajilla, así que no tocó inventario — pero la vaca
--                  figura montada dos veces el mismo día.
--
-- QUÉ ES UN DUPLICADO ACÁ. La misma vaca, el mismo `tipo`, la misma `fecha`,
-- el mismo `toro_id` y el mismo `tipo_servicio`. Eso nunca son dos hechos
-- distintos: una vaca no se monta dos veces el mismo día con el mismo toro,
-- ni pare dos veces, ni se seca dos veces. Es un reenvío del flujo.
--
-- POR QUÉ EL ÍNDICE VA ACOTADO A `chequeo_vaca_id IS NULL`. Es la población
-- de captura manual — Telegram, los diálogos de venta/muerte, el callback de
-- alertas — y es donde viven los dos incidentes (ambas filas de cada par lo
-- tienen en NULL). `fn_hato_commit_chequeo` (065) inserta SIEMPRE con
-- `chequeo_vaca_id` poblado, así que este índice **no puede abortar el commit
-- de un chequeo**, que sería un fallo mucho peor que un duplicado: Martha
-- sube la planilla entera y se le cae completa. Consecuencia aceptada: un
-- servicio derivado de un chequeo que repita uno registrado en campo pasa —
-- y está bien, porque eso no es un duplicado sino la planilla confirmándolo.
--
-- POR QUÉ COALESCE Y NO LAS COLUMNAS PELADAS. En un índice único NULL nunca
-- colisiona con NULL, así que dos `celo` de la misma vaca el mismo día (ambos
-- con `toro_id` NULL) se colarían — que es justo la mitad de los tipos de
-- evento. El centinela all-zeros no puede chocar con un uuid real.
--
-- LA REGLA GENERAL DEL MÓDULO ES «ADVERTIR, NUNCA BLOQUEAR» (contrato 4 de
-- eventoHato.ts) y esto no la rompe: lo que se bloquea no es un juicio de
-- Martha sobre un caso raro (un secado adelantado se sigue avisando y
-- guardando), es un byte-por-byte reenvío del mismo hecho. El juicio se
-- protege en la aplicación, que avisa ANTES de confirmar; el índice es la
-- red de abajo, para el camino que nadie previó.
--
-- Filas afectadas: 1 DELETE (el duplicado de FLACA) + 2 índices.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Pre-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
BEGIN
  -- 0.1 El duplicado de FLACA sigue siendo exactamente el par esperado.
  SELECT count(*) INTO v_n
  FROM hato_eventos
  WHERE id IN ('3e623fae-1240-4668-97fd-afa7b3bad4fc',
               'b4e4470d-b220-4b4c-9fec-14b9e01afc49')
    AND tipo = 'servicio' AND tipo_servicio = 'monta'
    AND fecha = DATE '2026-05-09' AND chequeo_vaca_id IS NULL
    AND fuente = 'telegram';
  IF v_n <> 2 THEN
    RAISE EXCEPTION '0.1: el par duplicado de FLACA ya no está como se midió (%)', v_n;
  END IF;

  -- 0.2 Los dos son de la MISMA vaca y el MISMO toro. Sin esto no es un
  --     duplicado y borrar uno destruiría un servicio real.
  SELECT count(DISTINCT (animal_id, toro_id)) INTO v_n
  FROM hato_eventos
  WHERE id IN ('3e623fae-1240-4668-97fd-afa7b3bad4fc',
               'b4e4470d-b220-4b4c-9fec-14b9e01afc49');
  IF v_n <> 1 THEN
    RAISE EXCEPTION '0.2: el par de FLACA no comparte vaca y toro; no es un duplicado';
  END IF;

  -- 0.3 Ese par es el ÚNICO duplicado manual que queda. Si apareciera otro,
  --     el índice del paso 2 fallaría a mitad de camino; mejor abortar acá
  --     con el conteo a la vista.
  SELECT count(*) INTO v_n FROM (
    SELECT 1 FROM hato_eventos
    WHERE chequeo_vaca_id IS NULL
      AND id <> 'b4e4470d-b220-4b4c-9fec-14b9e01afc49'
    GROUP BY animal_id, tipo, fecha,
             coalesce(toro_id, '00000000-0000-0000-0000-000000000000'::uuid),
             coalesce(tipo_servicio, '-')
    HAVING count(*) > 1
  ) d;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0.3: quedan % grupos duplicados manuales además del de FLACA', v_n;
  END IF;

  -- 0.4 `hato_pajillas_uso` ya está limpia (la 138 borró el uso de ELECTRA).
  SELECT count(*) INTO v_n FROM (
    SELECT 1 FROM hato_pajillas_uso WHERE animal_id IS NOT NULL
    GROUP BY pajilla_id, animal_id, fecha_uso HAVING count(*) > 1
  ) d;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '0.4: quedan % usos de pajilla duplicados', v_n;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Respaldo + borrado del duplicado de FLACA.
--    Sobrevive el MÁS ANTIGUO (21:19), no el más reciente: es el criterio de
--    la limpieza de servicios del 2026-07-24 («sobrevive el chequeo más
--    antiguo»). Difiere a propósito del de la 138, donde el más reciente era
--    el único par COMPLETO (traía `pajilla_uso_id` y autor); acá los dos son
--    idénticos en forma, así que no hay nada que desempate salvo el orden.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS respaldos;

CREATE TABLE respaldos.backup_139_eventos_flaca AS
SELECT * FROM hato_eventos WHERE id = 'b4e4470d-b220-4b4c-9fec-14b9e01afc49';

ALTER TABLE respaldos.backup_139_eventos_flaca ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_139_eventos_flaca FROM anon, authenticated, PUBLIC;

DELETE FROM hato_eventos WHERE id = 'b4e4470d-b220-4b4c-9fec-14b9e01afc49';

-- ---------------------------------------------------------------------------
-- 2. El guardarraíl: dos índices únicos parciales.
-- ---------------------------------------------------------------------------

-- 2.1 Eventos capturados a mano. Ver la cabecera para el alcance.
CREATE UNIQUE INDEX hato_eventos_manual_unico
  ON hato_eventos (
    animal_id,
    tipo,
    fecha,
    coalesce(toro_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(tipo_servicio, '-')
  )
  WHERE chequeo_vaca_id IS NULL;

COMMENT ON INDEX hato_eventos_manual_unico IS
  'Migración 139. Impide registrar dos veces el mismo evento manual (misma vaca, tipo, fecha, toro y tipo_servicio). Acotado a chequeo_vaca_id IS NULL para NO poder abortar fn_hato_commit_chequeo (065), que siempre lo puebla.';

-- 2.2 Descuento de pajillas. `animal_id` es opcional en esta tabla (mejor
--     registrar el uso sin la vaca que no registrarlo), y sin vaca no hay
--     forma de saber si dos usos son el mismo hecho — así que esas filas
--     quedan fuera del índice a propósito, no por olvido.
CREATE UNIQUE INDEX hato_pajillas_uso_unico
  ON hato_pajillas_uso (pajilla_id, animal_id, fecha_uso)
  WHERE animal_id IS NOT NULL;

COMMENT ON INDEX hato_pajillas_uso_unico IS
  'Migración 139. Impide descontar dos veces la misma pajilla sobre la misma vaca en la misma fecha (el doble descuento de Jericó/ELECTRA que revirtió la 138). Los usos sin animal_id quedan fuera: sin vaca no hay con qué decidir si son el mismo hecho.';

-- ---------------------------------------------------------------------------
-- 3. Post-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
BEGIN
  -- 3.1 Los dos índices existen y son únicos.
  SELECT count(*) INTO v_n
  FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
  WHERE c.relname IN ('hato_eventos_manual_unico', 'hato_pajillas_uso_unico')
    AND i.indisunique AND i.indpred IS NOT NULL;
  IF v_n <> 2 THEN
    RAISE EXCEPTION '3.1: se esperaban 2 índices únicos parciales, hay %', v_n;
  END IF;

  -- 3.2 FLACA conserva UN servicio ese día. Ni cero ni dos.
  SELECT count(*) INTO v_n
  FROM hato_eventos e JOIN hato_animales a ON a.id = e.animal_id
  WHERE a.numero = 5182 AND a.nombre = 'FLACA'
    AND e.tipo = 'servicio' AND e.fecha = DATE '2026-05-09';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '3.2: FLACA quedó con % servicios el 2026-05-09, se esperaba 1', v_n;
  END IF;
  SELECT count(*) INTO v_n
  FROM hato_eventos WHERE id = '3e623fae-1240-4668-97fd-afa7b3bad4fc';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '3.2b: sobrevivió el evento equivocado de FLACA';
  END IF;

  -- 3.3 El respaldo tiene la fila borrada.
  SELECT count(*) INTO v_n FROM respaldos.backup_139_eventos_flaca;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '3.3: el respaldo de FLACA tiene % filas, se esperaba 1', v_n;
  END IF;

  -- 3.4 El commit de chequeos sigue fuera del alcance del índice: ninguna
  --     fila con `chequeo_vaca_id` poblado entra en él. Es la garantía de que
  --     esta migración no puede tumbar la subida de una planilla.
  SELECT count(*) INTO v_n
  FROM hato_eventos WHERE chequeo_vaca_id IS NOT NULL;
  IF v_n = 0 THEN
    RAISE EXCEPTION '3.4: no hay eventos de chequeo; el supuesto del índice no se sostiene';
  END IF;
  RAISE NOTICE 'Guardarraíl activo. % eventos de chequeo quedan fuera del índice.', v_n;
END $$;

-- ============================================================================
-- ROLLBACK (ejecutable, si hiciera falta)
-- ============================================================================
-- BEGIN;
--   DROP INDEX IF EXISTS hato_eventos_manual_unico;
--   DROP INDEX IF EXISTS hato_pajillas_uso_unico;
--   INSERT INTO hato_eventos SELECT * FROM respaldos.backup_139_eventos_flaca;
-- COMMIT;
