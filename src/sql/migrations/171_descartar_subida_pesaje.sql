-- =====================================================================
-- 171: Gerencia puede borrar UNA fila de hato_capturas_foto.
-- Fecha: 2026-10-01
-- Fuente: issue #297. "Subidas del mes" descarta una planilla: la foto,
-- los litros que esa subida creó, y la fila del intento.
--
-- ESCRITA, SIN APLICAR. Sin esta migración el botón falla con
-- "No tienes permisos para descartar esta subida": la 146 revocó
-- DELETE a `authenticated` y no dejó política de borrado. La fila es
-- un registro de intentos; el descarte es la primera escritura de
-- navegador que esa tabla necesita, y es solo DELETE.
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
-- Filas de dominio afectadas: cero.
-- =====================================================================

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
  WHERE c.relname = 'hato_capturas_foto';

  IF v_politicas <> 2 THEN
    RAISE EXCEPTION '171: se esperaban 2 políticas (SELECT + DELETE), hay %.', v_politicas;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'hato_capturas_foto'
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
