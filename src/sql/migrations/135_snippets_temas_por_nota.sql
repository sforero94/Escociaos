-- Migración 135: ADD COLUMN temas en snippets. APLICADA 2026-09-03
-- (ledger `20260903182312`). NO RE-EJECUTAR.
--
-- Este fichero documenta el cuerpo que apply_migration corrió de verdad,
-- no el diseño. El primer intento con el SQL completo falló (MCP -32000).
-- El reintento recortado agregó la columna y un CHECK **sin tildes**
-- (`fertilizacion`, `fumigacion`). El catálogo de la app es
-- `fertilización` / `fumigación`. La 136 corrige el CHECK, recrea el FTS
-- y quita temas/notas de la cabecera.
--
-- No se edita: una migración aplicada no se toca.

DO $$
BEGIN
  IF to_regclass('public.informes_visita') IS NULL
     OR to_regclass('public.informes_visita_snippets') IS NULL THEN
    RAISE EXCEPTION '135 ABORTADA: faltan las tablas de la 134.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'informes_visita'
      AND column_name = 'temas'
  ) THEN
    RAISE EXCEPTION '135 ABORTADA: informes_visita.temas no esta. Ya corrio esta 135?';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'informes_visita_snippets'
      AND column_name = 'temas'
  ) THEN
    RAISE EXCEPTION '135 ABORTADA: informes_visita_snippets.temas ya existe.';
  END IF;
END $$;

ALTER TABLE public.informes_visita_snippets
  ADD COLUMN temas TEXT[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT informes_visita_snippets_temas_catalogo CHECK (
    temas <@ ARRAY[
      'fertilizacion',
      'fumigacion',
      'inventario',
      'monitoreo',
      'planeacion labores',
      'observaciones',
      'alertas',
      'ideas'
    ]::text[]
  );
