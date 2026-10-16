-- ============================================================================
-- 181_lotes_fecha_erradicacion -- ESCO-139 (PR 1 de 3, clase ddl_aditivo)
-- ============================================================================
-- ESCRITA, SIN APLICAR. La prepara la corrida del viernes 2026-10-16
-- (opcion A, 2026-09-27: ninguna Routine escribe en la base). La aplica
-- Santiago en una sesion en vivo, con SUPABASE_APPLY_A_MIGRATION.
--
-- DECISION (Santiago, 2026-10-12, en vivo):
--   «Ya activos solo quedan Piedra Paula, Salto, Australia y La Vega. Los demas
--    se erradicaron entre abril y junio. El analisis de costos deberia
--    prorratear esto.»
--
-- POR QUE: `asignarOverheadPorArboles` (src/utils/calculosCostoKg.ts) reparte
-- el gasto general del ano entero por el `total_arboles` ACTUAL. No hay ningun
-- dato que diga DESDE CUANDO un lote dejo de existir, asi que un lote
-- erradicado en junio absorbe gasto general de julio a diciembre, y uno
-- erradicado y puesto en 0 arboles deja de absorber incluso los meses en que
-- si producia. Esta columna es el dato que falta para prorratear por
-- arbol-dia (PR 3, codigo).
--
-- QUE HACE (aditiva pura, cero filas de dominio tocadas):
--   `ALTER TABLE public.lotes ADD COLUMN fecha_erradicacion date NULL`.
--   NULL = sin fecha conocida. Nunca un centinela, nunca un DEFAULT (mismo
--   criterio que 062/098): un DEFAULT inventaria una fecha para los 9 lotes.
--   Sin DEFAULT, el ADD COLUMN es solo de catalogo: no reescribe la tabla.
--
-- QUE NO HACE: no llena ninguna fecha ni toca `activo`, `total_arboles` ni
-- `arboles_*`. Eso es la 182 (clase datos), que depende de esta.
--
-- GUARDAS: la columna no existe antes; existe despues, tipo date, nullable,
-- sin default; todas las filas quedan con `fecha_erradicacion IS NULL`; el
-- COMMENT existe. Los dos bloques DO solo hacen RAISE (lista permitida del
-- viernes). No hay guarda de conteo de filas: un ADD COLUMN sin DEFAULT no
-- puede cambiarlo, y pasar una linea base entre bloques exigiria escribir un
-- ajuste de sesion (revision adversarial 2026-10-16).
--
-- RLS/consumidores: `lotes` no tiene triggers. Las 6 politicas no nombran
-- columnas. La unica vista dependiente (`vista_tareas_resumen`) expande sus
-- columnas al crearse, asi que una columna nueva no la cambia. Los lectores
-- de la app que hacen `select('*')` reciben un campo extra que ignoran.
--
-- ORDEN DE DESPLIEGUE:
--   1. Esta migracion (181).
--   2. La 182 (datos, con las fechas que confirme Santiago).
--   3. El PR 3 (prorrateo por arbol-dia, frontend). Si el PR 3 se fusiona
--      antes, el hook degrada a la regla de hoy y nunca falla.
--
-- ROLLBACK:
--   ALTER TABLE public.lotes DROP COLUMN fecha_erradicacion;
--   (Si la 182 ya se aplico, revertir la 182 primero: su rollback restaura
--   `activo` desde respaldos.backup_182_lotes_erradicacion.)
--
-- NO trae BEGIN;/COMMIT; -- apply_migration ya envuelve en una transaccion.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Pre-condiciones
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.lotes') IS NULL THEN
    RAISE EXCEPTION '181 ABORTADA: public.lotes no existe.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'lotes'
       AND column_name = 'fecha_erradicacion'
  ) THEN
    RAISE EXCEPTION '181 ABORTADA: lotes.fecha_erradicacion ya existe -- ¿ya se aplico?';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 1. La columna
-- ---------------------------------------------------------------------------
ALTER TABLE public.lotes ADD COLUMN fecha_erradicacion date NULL;

COMMENT ON COLUMN public.lotes.fecha_erradicacion IS
  'Fecha en que el lote se erradico (dejo de existir como cultivo). NULL = sin fecha conocida: '
  'nunca un centinela ni un DEFAULT. La usa el prorrateo del gasto general por arbol-dia '
  '(costo por kilo): un lote absorbe gasto general solo hasta esta fecha. No reemplaza a '
  '`activo`; un lote erradicado lleva activo = false Y su fecha. Migracion 181, ESCO-139.';

-- ---------------------------------------------------------------------------
-- 2. Post-condiciones
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_filas    bigint;
  v_tipo     text;
  v_nullable text;
  v_default  text;
  v_no_nulas bigint;
BEGIN
  SELECT data_type, is_nullable, column_default
    INTO v_tipo, v_nullable, v_default
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'lotes'
     AND column_name = 'fecha_erradicacion';
  IF NOT FOUND THEN
    RAISE EXCEPTION '181 ABORTADA: la columna no quedo creada.';
  END IF;
  IF v_tipo <> 'date' THEN
    RAISE EXCEPTION '181 ABORTADA: tipo % (se esperaba date).', v_tipo;
  END IF;
  IF v_nullable <> 'YES' THEN
    RAISE EXCEPTION '181 ABORTADA: la columna quedo NOT NULL.';
  END IF;
  IF v_default IS NOT NULL THEN
    RAISE EXCEPTION '181 ABORTADA: la columna quedo con DEFAULT %.', v_default;
  END IF;

  SELECT count(*), count(fecha_erradicacion) INTO v_filas, v_no_nulas
    FROM public.lotes;
  IF v_no_nulas <> 0 THEN
    RAISE EXCEPTION '181 ABORTADA: % filas con fecha_erradicacion no nula.', v_no_nulas;
  END IF;

  IF col_description('public.lotes'::regclass,
       (SELECT attnum FROM pg_attribute
         WHERE attrelid = 'public.lotes'::regclass
           AND attname = 'fecha_erradicacion')) IS NULL THEN
    RAISE EXCEPTION '181 ABORTADA: falta el COMMENT de la columna.';
  END IF;

  RAISE NOTICE '181 OK: lotes.fecha_erradicacion date NULL, % filas, todas NULL.', v_filas;
END
$$;
