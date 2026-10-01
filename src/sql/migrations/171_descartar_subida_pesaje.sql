-- =====================================================================
-- 171: Gerencia puede borrar UNA fila de hato_capturas_foto.
-- Fecha: 2026-10-01
-- Fuente: issue #297. "Subidas del mes" descarta una planilla: la foto,
-- los litros que esa subida creó, y la fila del intento.
--
-- ESCRITA, SIN APLICAR. Sin esta migración el botón falla y la
-- tarjeta se queda. Medido en producción (ywhtjwawnkeqlwxbvgup) el
-- 2026-10-01, con Santiago delante: el ledger llega a `170_po_sonda`,
-- `hato_capturas_foto` tiene UNA política
-- (`hato_capturas_foto_select_authenticated`, SELECT) y `authenticated`
-- no tiene DELETE. La 146 se lo revocó. PostgREST responde 42501
-- (o `data: []` si algún día hay GRANT y no hay política). Las dos
-- tarjetas de Martha (origen web, desenlace ocr_fallo, storage_rutas
-- vacío, sin litros) no tienen hija que limpiar: el DELETE es de esa
-- fila sola.
--
-- El preview de Vercel usa esta misma base. Merge del PR no aplica
-- este archivo. Hay que aplicarlo antes de que Descartar borre en
-- producción o en ese preview.
--
-- QUÉ NO HACE:
--   - No concede INSERT ni UPDATE. Reescribir `desenlace` a mano sigue
--     cerrado (precedente 073).
--   - No toca la RLS de `hato_pesajes_leche`. Gerencia ya puede borrar
--     esas filas (migración 054).
--   - No toca Storage. El DELETE del bucket `hato-pesajes-fotos` ya es
--     solo Gerencia (migración 086). El navegador borra los objetos
--     con esa política; este archivo no puede ALTER POLICY sobre
--     `storage.objects` (precedente 109).
--   - No crea una llave foránea. La liga subida → litros sigue en
--     `src/utils/hato/subidasPesajeMes.ts` (±36 h de `creado_en`,
--     `fuente` foto o telegram, una fila en una sola subida).
--
-- El número 171 se barró contra las ramas de origin el 2026-10-01.
-- Filas de dominio afectadas: cero. No hay llave foránea hacia esta
-- tabla (la guarda de abajo aborta si aparece una).
-- =====================================================================

DO $$
DECLARE
  v_politicas integer;
BEGIN
  IF has_table_privilege('authenticated', 'public.hato_capturas_foto', 'DELETE') THEN
    RAISE EXCEPTION '171: authenticated ya tiene DELETE. No reaplicar.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class referenciada ON referenciada.oid = con.confrelid
    JOIN pg_namespace n ON n.oid = referenciada.relnamespace
    WHERE n.nspname = 'public'
      AND referenciada.relname = 'hato_capturas_foto'
      AND con.contype = 'f'
  ) THEN
    RAISE EXCEPTION '171: hay una llave foránea hacia hato_capturas_foto. Este DELETE no limpia esa hija.';
  END IF;

  SELECT count(*) INTO v_politicas
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'hato_capturas_foto';

  IF v_politicas <> 1 THEN
    RAISE EXCEPTION '171: antes de aplicar se esperaba 1 política SELECT, hay %.', v_politicas;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'hato_capturas_foto'
      AND p.polname = 'hato_capturas_foto_select_authenticated'
      AND p.polcmd = 'r'
  ) THEN
    RAISE EXCEPTION '171: falta la política SELECT de la 146.';
  END IF;
END $$;

GRANT DELETE ON TABLE public.hato_capturas_foto TO authenticated;

DROP POLICY IF EXISTS "hato_capturas_foto_delete_gerencia" ON public.hato_capturas_foto;
CREATE POLICY "hato_capturas_foto_delete_gerencia"
  ON public.hato_capturas_foto
  FOR DELETE
  TO authenticated
  USING ((SELECT public.get_user_role()) = 'Gerencia');

DO $$
DECLARE
  v_politicas integer;
BEGIN
  IF NOT has_table_privilege('authenticated', 'hato_capturas_foto', 'DELETE') THEN
    RAISE EXCEPTION '171: authenticated necesita DELETE; la política de Gerencia no basta sin el grant.';
  END IF;

  IF has_table_privilege('authenticated', 'hato_capturas_foto', 'INSERT')
     OR has_table_privilege('authenticated', 'hato_capturas_foto', 'UPDATE') THEN
    RAISE EXCEPTION '171: authenticated no debe recuperar INSERT ni UPDATE sobre hato_capturas_foto.';
  END IF;

  IF has_table_privilege('anon', 'hato_capturas_foto', 'DELETE')
     OR has_table_privilege('anon', 'hato_capturas_foto', 'SELECT') THEN
    RAISE EXCEPTION '171: anon no debe leer ni borrar hato_capturas_foto.';
  END IF;

  SELECT count(*) INTO v_politicas
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'hato_capturas_foto';

  IF v_politicas <> 2 THEN
    RAISE EXCEPTION '171: se esperaban 2 políticas (SELECT + DELETE), hay %.', v_politicas;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'hato_capturas_foto'
      AND p.polname = 'hato_capturas_foto_delete_gerencia'
      AND pg_get_expr(p.polqual, p.polrelid) ILIKE '%get_user_role%'
  ) THEN
    RAISE EXCEPTION '171: la política de DELETE no llama a get_user_role().';
  END IF;

  RAISE NOTICE '171 OK: Gerencia puede borrar una captura de pesaje. INSERT y UPDATE siguen cerrados.';
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK:
--
--   DROP POLICY IF EXISTS "hato_capturas_foto_delete_gerencia" ON public.hato_capturas_foto;
--   REVOKE DELETE ON TABLE public.hato_capturas_foto FROM authenticated;
-- ---------------------------------------------------------------------------
