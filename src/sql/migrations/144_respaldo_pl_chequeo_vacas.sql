-- =============================================================================
-- 144_respaldo_pl_chequeo_vacas.sql
--
-- RENUMERADA 138 -> 140 al integrar con `main`: dos sesiones paralelas ya
-- habían tomado 138 (`pajillas_jerico_stock_cero`) y 139
-- (`hato_duplicados_guardarrail`). El guard `hatoSchemaContract.test.ts` lo
-- atrapó. Es la misma colisión que la 101/102 y las 124-130 -- verificar el
-- catálogo VIVO antes de numerar, nunca un número heredado de un documento.
--
-- RENUMERADA OTRA VEZ, 140 -> 144 (2026-09-11). La renumeración anterior dejó
-- DOS ficheros con prefijo `140` -- éste y `140_hato_registrar_tratamiento.sql`
-- -- y `hatoSchemaContract.test.ts` llevaba desde el 2026-09-09 EN ROJO por eso,
-- o sea que la suite entera dejó de ser señal durante dos días. Se mueve éste y
-- no el otro por tener menos superficie de citas.
--
-- EL NÚMERO 144 ES SÓLO EL SIGUIENTE SLOT LIBRE, NO LA POSICIÓN CRONOLÓGICA.
-- Mismo criterio que las 067 / 079 / 108. Esta migración corrió el 2026-09-09
-- (ledger `20260909002311`), o sea ANTES que `140_hato_registrar_tratamiento`
-- (`20260909002904`) y antes que la 141 (`20260909130404`). El orden de los
-- nombres de fichero no reconstruye el orden de aplicación -- para eso está el
-- ledger, que es quien manda.
--
-- EL LEDGER NO SE DESALINEA CON ESTE RENOMBRE, y por eso se puede hacer: sus
-- filas se llaman `renombrar_respaldo_pl_a_140` y
-- `hato_registrar_tratamiento_renumerada_140`, no se indexan por el nombre del
-- fichero, y la clave es `version`. El `_a_140` de esa fila es un nombre
-- histórico: describe la renumeración de 2026-09-09, no dónde vive el fichero
-- hoy. NO se toca -- una fila del ledger de una migración ya aplicada no se
-- edita.
--
-- EL CONTENIDO NO SE TOCA. Está aplicada. El renombre es del fichero y nada más.
--
-- AL ELEGIR EL SIGUIENTE NÚMERO, MIRÁ TAMBIÉN LAS RAMAS ABIERTAS. Ni 142 ni 143
-- estaban libres, y NINGUNA de las dos aparece en las tres fuentes que sí manda
-- revisar el runbook (ficheros en `main`, `supabase_migrations.schema_migrations`,
-- esquema `respaldos`), que están limpias en ambos números:
--
--   142 -> `142_alertas_defaults_campo_secado_tratamiento.sql`, rama de la PR #218
--   143 -> `143_fn_ronda_actor_correo_para_movimientos.sql`, rama de la PR #222
--
-- Las dos ramas están abiertas y sin fusionar. Es exactamente la forma en que
-- nació la colisión que este fichero arregla -- y volvió a pasar HOY, dentro de
-- la misma hora: este fichero se escribió primero como 143 y hubo que moverlo a
-- 144 cuando la 222 tomó el 143 en paralelo. Dos ramas activas eligen el mismo
-- "siguiente libre" porque las dos miran un catálogo que no incluye a la otra.
--
-- El barrido que lo detecta, y que hay que correr JUSTO ANTES de fijar el número:
--
--   git fetch origin --prune
--   for r in $(git for-each-ref --format='%(refname)' refs/remotes/origin); do
--     git ls-tree -r --name-only "$r" -- src/sql/migrations/ 2>/dev/null \
--       | grep -E "/${N}_" && echo "OCUPADO en $r"
--   done
--
-- RESPALDO PREVIO al cambio de semántica de `hato_chequeo_vacas.pl`.
--
-- QUÉ CAMBIA EN LA APLICACIÓN (no en esta migración). Hasta hoy la columna
-- `PL` de la planilla de chequeo se imprimía desde
-- `v_hato_estado_actual.pl`, o sea el número que alguien escribió a mano en
-- el chequeo anterior y se venía arrastrando de planilla en planilla. Desde
-- este cambio se imprime el promedio MEDIDO de `hato_pesajes_leche` de las
-- últimas 8 semanas (decisión del dueño, 2026-09-09). Como `PL` es una
-- columna que se diligencia, ese valor vuelve en la subida y se escribe en
-- `hato_chequeo_vacas.pl`: **de este chequeo en adelante la columna deja de
-- significar "el PL que estimó el veterinario" y pasa a significar "el
-- promedio medido"**.
--
-- POR QUÉ HACE FALTA EL RESPALDO, si nada se modifica hoy. Justamente porque
-- el cambio es de SIGNIFICADO y no de datos: las filas viejas no se tocan,
-- pero a partir de la próxima subida conviven en la misma columna dos cosas
-- distintas sin nada que las distinga. Si el dueño decide revertir, el
-- criterio para separar "vet" de "medido" es la fecha de corte, y para eso
-- hay que tener congelado el estado ANTERIOR. Esta migración lo congela.
-- Pedido explícito del dueño: "keep backup in case we need to roll back".
--
-- POR QUÉ LA DIFERENCIA IMPORTA. Contrastado contra producción el 2026-09-09,
-- las dos cifras no se parecen: ELECTRA #117 figuraba con PL 28 y medía 9,6;
-- RICARENA #88 con 25 contra 12,4; MAGNIFICA #103 con 30 contra 17,9;
-- MARIPOSA #120 al revés, 20 contra 28,3 reales. Y todos los PL de chequeo
-- son números redondos (25, 22, 30) -- estimaciones, no mediciones.
--
-- ALCANCE: cero filas modificadas, cero filas borradas. Esta migración SOLO
-- crea una tabla de respaldo y copia. No toca `hato_chequeo_vacas` ni
-- ninguna otra tabla de dominio.
--
-- El respaldo va al esquema `respaldos`, JAMÁS a `public` (lección de la 081:
-- un `CREATE TABLE public.backup_*` hereda el `ALTER DEFAULT PRIVILEGES` de
-- Supabase y publica el respaldo a `anon` sin RLS). RLS habilitada y sin
-- políticas -- para una tabla que ningún rol de navegador debe tocar,
-- deny-all ES la política, igual que en 080/081/099/107.
--
-- IDEMPOTENTE: si el respaldo ya existe con el mismo conteo, emite un
-- RAISE NOTICE y sale sin error. Si existe con OTRO conteo aborta, en vez de
-- pisar un respaldo previo -- que es justo lo que no se puede perder.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Esquema de respaldos (creado por 081; se asegura, mismo patrón 095/099/107)
-- -----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS respaldos;
REVOKE ALL ON SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA respaldos TO service_role;


DO $$
DECLARE
  v_filas_origen   integer;
  v_filas_respaldo integer;
  v_existe         boolean;
BEGIN
  SELECT count(*) INTO v_filas_origen FROM public.hato_chequeo_vacas;

  SELECT EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'respaldos' AND tablename = 'backup_140_pl_chequeo_vacas'
  ) INTO v_existe;

  IF v_existe THEN
    EXECUTE 'SELECT count(*) FROM respaldos.backup_140_pl_chequeo_vacas' INTO v_filas_respaldo;
    IF v_filas_respaldo = v_filas_origen THEN
      RAISE NOTICE '140: el respaldo ya existe con % filas. Nada que hacer.', v_filas_respaldo;
      RETURN;
    END IF;
    RAISE EXCEPTION
      '140: respaldos.backup_140_pl_chequeo_vacas ya existe con % filas pero el origen tiene %. No se pisa un respaldo previo -- revisar a mano.',
      v_filas_respaldo, v_filas_origen;
  END IF;

  -- Se copia la columna en disputa (`pl`) JUNTO con su capa cruda (`pl_raw`,
  -- el texto verbatim de la planilla) y con la fecha del chequeo. Sin
  -- `pl_raw` el respaldo perdería la única evidencia de qué decía el papel;
  -- sin la fecha no se podría separar por corte, que es el criterio mismo
  -- del rollback.
  CREATE TABLE respaldos.backup_140_pl_chequeo_vacas AS
  SELECT
    cv.id,
    cv.chequeo_id,
    cv.animal_id,
    cv.pl,
    cv.pl_raw,
    c.fecha AS chequeo_fecha,
    now()   AS respaldado_en
  FROM public.hato_chequeo_vacas cv
  JOIN public.hato_chequeos c ON c.id = cv.chequeo_id;

  SELECT count(*) INTO v_filas_respaldo FROM respaldos.backup_140_pl_chequeo_vacas;

  IF v_filas_respaldo <> v_filas_origen THEN
    RAISE EXCEPTION
      '140: el respaldo quedó con % filas y el origen tiene %. Un chequeo_vaca sin cabecera rompería el JOIN -- abortando.',
      v_filas_respaldo, v_filas_origen;
  END IF;

  ALTER TABLE respaldos.backup_140_pl_chequeo_vacas ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON respaldos.backup_140_pl_chequeo_vacas FROM PUBLIC, anon, authenticated;

  RAISE NOTICE '140: respaldadas % filas de hato_chequeo_vacas (pl, pl_raw).', v_filas_respaldo;
END $$;


COMMENT ON TABLE respaldos.backup_140_pl_chequeo_vacas IS
  'Estado de hato_chequeo_vacas.pl / .pl_raw ANTES de que la planilla de chequeo pasara a imprimir el promedio medido de hato_pesajes_leche (2026-09-09). Cero filas modificadas por la migración 140; existe solo para poder revertir el cambio de semántica de esa columna.';


-- =============================================================================
-- VERIFICACIÓN (leer, no ejecutar como parte de la migración)
-- =============================================================================
-- SELECT count(*) FROM respaldos.backup_140_pl_chequeo_vacas;
-- SELECT has_table_privilege('anon', 'respaldos.backup_140_pl_chequeo_vacas', 'SELECT');  -- false
--
-- ROLLBACK del cambio de semántica (restaurar el PL anterior al corte):
--   UPDATE public.hato_chequeo_vacas cv
--      SET pl = b.pl, pl_raw = b.pl_raw
--     FROM respaldos.backup_140_pl_chequeo_vacas b
--    WHERE b.id = cv.id AND cv.pl IS DISTINCT FROM b.pl;
