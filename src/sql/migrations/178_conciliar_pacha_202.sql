-- #258. Santiago confirma el 2026-10-07: #202 es PACHA, registrada como
-- #5202 por su procedencia de Supata; MOROCHA no es otro animal.
-- Conserva la ficha original de PACHA y su genealogia. Elimina solamente
-- la ficha espuria MOROCHA, sin referencias, despues de respaldar ambas.
-- No reconstruye el lote completo ni la causa del descarte del 2026-08-11.
-- Aplicar una sola vez mediante apply_migration (transaccion del servicio).
-- Rollback manual con guardas: docs/hato/rollback-conciliacion-pacha-202.sql.

SET LOCAL lock_timeout = '2s';

DO $$
DECLARE
  v_fk record;
  v_refs bigint;
BEGIN
  -- Excluye escritores concurrentes y cambios de esquema/referencias mientras
  -- se comprueban los hechos y se elimina una ficha sin historia operacional.
  LOCK TABLE public.hato_animales IN SHARE ROW EXCLUSIVE MODE;
  FOR v_fk IN
    SELECT DISTINCT conrelid::regclass AS tabla
    FROM pg_constraint
    WHERE confrelid = 'public.hato_animales'::regclass AND contype = 'f'
    ORDER BY tabla
  LOOP
    EXECUTE format('LOCK TABLE %s IN SHARE ROW EXCLUSIVE MODE', v_fk.tabla);
  END LOOP;
  LOCK TABLE public.hato_correcciones IN SHARE ROW EXCLUSIVE MODE;

  IF to_regclass('respaldos.backup_178_pacha_morocha') IS NOT NULL
     OR to_regclass('respaldos.backup_178_control') IS NOT NULL THEN
    RAISE EXCEPTION '178: respaldo previo presente; no reejecutar';
  END IF;
  IF (SELECT count(*) FROM public.hato_animales) <> 181
     OR (SELECT count(*) FROM public.hato_animales WHERE estado = 'activa') <> 68
     OR (SELECT count(*) FROM public.hato_animales WHERE estado = 'descartada') <> 1 THEN
    RAISE EXCEPTION '178: cambiaron los conteos 181/68/1; revisar antes de corregir';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hato_animales a
    WHERE id = '43a6b514-17a3-405c-ba59-65727fb11a36'
      AND numero = 5202 AND nombre = 'PACHA' AND estado = 'activa'
      AND md5(to_jsonb(a)::text) = '3876531edf89dd50df3dcc79abfaf84c'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.hato_animales a
    WHERE id = '79701784-be8f-4c33-8da0-c3aadbea9239'
      AND numero = 202 AND nombre = 'MOROCHA' AND estado = 'descartada'
      AND fecha_estado = DATE '2026-08-11'
      AND md5(to_jsonb(a)::text) = '0c02e8f63a5d6431a1013f30f78f4427'
  ) THEN
    RAISE EXCEPTION '178: UUID o valores completos cambiaron; no adivinar';
  END IF;
  IF EXISTS (SELECT 1 FROM public.hato_animales
             WHERE id NOT IN ('43a6b514-17a3-405c-ba59-65727fb11a36',
                              '79701784-be8f-4c33-8da0-c3aadbea9239')
               AND (numero IN (202, 5202) OR upper(nombre) IN ('PACHA', 'MOROCHA'))) THEN
    RAISE EXCEPTION '178: otra ficha comparte identidad o chapeta';
  END IF;

  -- Todas las FK entrantes, incluidas finanzas (ON DELETE SET NULL), crias
  -- y cualquier FK nueva. No dejar que un CASCADE/SET NULL borre la historia.
  FOR v_fk IN
    SELECT c.conrelid::regclass AS tabla, a.attname AS columna
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.confrelid = 'public.hato_animales'::regclass AND c.contype = 'f'
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', v_fk.tabla, v_fk.columna)
      INTO v_refs USING '79701784-be8f-4c33-8da0-c3aadbea9239'::uuid;
    IF v_refs <> 0 THEN
      RAISE EXCEPTION '178: MOROCHA tiene % referencias en %.%; conciliar aparte',
        v_refs, v_fk.tabla, v_fk.columna;
    END IF;
  END LOOP;
  -- Este historial deliberadamente no tiene FK para sobrevivir a un DELETE.
  IF EXISTS (SELECT 1 FROM public.hato_correcciones
             WHERE animal_id = '79701784-be8f-4c33-8da0-c3aadbea9239'
                OR fila_id = '79701784-be8f-4c33-8da0-c3aadbea9239') THEN
    RAISE EXCEPTION '178: MOROCHA tiene correcciones historicas; revisar';
  END IF;
END $$;

CREATE TABLE respaldos.backup_178_pacha_morocha AS
SELECT * FROM public.hato_animales
WHERE id IN ('43a6b514-17a3-405c-ba59-65727fb11a36',
             '79701784-be8f-4c33-8da0-c3aadbea9239');
ALTER TABLE respaldos.backup_178_pacha_morocha ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_178_pacha_morocha FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE respaldos.backup_178_pacha_morocha IS
  '178, #258: respaldo completo previo. Confirmacion de Santiago 2026-10-07: 202 es PACHA (antes 5202, Supata); MOROCHA es ficha espuria. No borrar este respaldo.';

CREATE TABLE respaldos.backup_178_control AS
SELECT md5(COALESCE(string_agg(to_jsonb(a)::text, '' ORDER BY id), '')) AS otras_fichas_md5,
       (SELECT count(*) FROM public.hato_correcciones) AS correcciones_count
FROM public.hato_animales a
WHERE id NOT IN ('43a6b514-17a3-405c-ba59-65727fb11a36',
                '79701784-be8f-4c33-8da0-c3aadbea9239');
ALTER TABLE respaldos.backup_178_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON respaldos.backup_178_control FROM PUBLIC, anon, authenticated;

DO $$
DECLARE v_n bigint;
BEGIN
  IF (SELECT count(*) FROM respaldos.backup_178_pacha_morocha) <> 2
     OR (SELECT count(*) FROM respaldos.backup_178_control) <> 1
     OR EXISTS (SELECT 1 FROM respaldos.backup_178_pacha_morocha b
                JOIN public.hato_animales a USING (id)
                WHERE to_jsonb(a) IS DISTINCT FROM to_jsonb(b)) THEN
    RAISE EXCEPTION '178: respaldo incompleto o distinto del original';
  END IF;
  UPDATE public.hato_animales SET numero = 202
   WHERE id = '43a6b514-17a3-405c-ba59-65727fb11a36'
     AND numero = 5202 AND nombre = 'PACHA' AND estado = 'activa';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '178: UPDATE afecto % filas, se esperaba 1', v_n; END IF;

  DELETE FROM public.hato_animales
   WHERE id = '79701784-be8f-4c33-8da0-c3aadbea9239'
     AND numero = 202 AND nombre = 'MOROCHA' AND estado = 'descartada'
     AND fecha_estado = DATE '2026-08-11';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN RAISE EXCEPTION '178: DELETE afecto % filas, se esperaba 1', v_n; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.hato_animales a
    JOIN respaldos.backup_178_pacha_morocha b USING (id)
    WHERE a.id = '43a6b514-17a3-405c-ba59-65727fb11a36'
      AND a.numero = 202 AND a.nombre = 'PACHA' AND a.estado = 'activa'
      AND to_jsonb(a) = jsonb_set(to_jsonb(b), '{numero}', '202'::jsonb)
  ) OR EXISTS (SELECT 1 FROM public.hato_animales
               WHERE id = '79701784-be8f-4c33-8da0-c3aadbea9239'
                  OR numero = 5202 OR upper(nombre) = 'MOROCHA') THEN
    RAISE EXCEPTION '178 post: identidad o campos preservados incorrectos';
  END IF;
  IF (SELECT count(*) FROM public.hato_animales) <> 180
     OR (SELECT count(*) FROM public.hato_animales WHERE estado = 'activa') <> 68
     OR (SELECT count(*) FROM public.hato_animales WHERE estado = 'descartada') <> 0
     OR (SELECT md5(COALESCE(string_agg(to_jsonb(a)::text, '' ORDER BY id), ''))
         FROM public.hato_animales a
         WHERE id <> '43a6b514-17a3-405c-ba59-65727fb11a36')
        IS DISTINCT FROM (SELECT otras_fichas_md5 FROM respaldos.backup_178_control)
     OR (SELECT count(*) FROM public.hato_correcciones)
        IS DISTINCT FROM (SELECT correcciones_count FROM respaldos.backup_178_control) THEN
    RAISE EXCEPTION '178 post: conteos o filas ajenas cambiaron';
  END IF;
END $$;
