-- Migración 136: corrige el catálogo de 135 y mueve chips a la nota.
-- GO DEL DUEÑO: 2026-09-03. Issue #189.
--
-- La 135 dejó `informes_visita_snippets.temas` con CHECK sin tildes.
-- Un INSERT con 'fertilización' fallaría. Esta 136:
--   1. Reemplaza el CHECK por el catálogo con tildes (el de la app).
--   2. Recrea FTS del snippet (texto + temas) vía función IMMUTABLE:
--      array_to_string es STABLE (42P17 si se usa crudo en GENERATED).
--   3. Quita temas/notas de la cabecera; FTS del Word = texto_extraido.
-- No toca Storage (postgres sin DELETE sobre storage.objects).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'informes_visita_snippets'
      AND column_name = 'temas'
  ) THEN
    RAISE EXCEPTION '136 ABORTADA: falta informes_visita_snippets.temas (135).';
  END IF;
END $$;

ALTER TABLE public.informes_visita_snippets
  DROP CONSTRAINT IF EXISTS informes_visita_snippets_temas_catalogo;

ALTER TABLE public.informes_visita_snippets
  ADD CONSTRAINT informes_visita_snippets_temas_catalogo CHECK (
    temas <@ ARRAY[
      'fertilización',
      'fumigación',
      'inventario',
      'monitoreo',
      'planeacion labores',
      'observaciones',
      'alertas',
      'ideas'
    ]::text[]
  );

CREATE INDEX IF NOT EXISTS informes_visita_snippets_temas_idx
  ON public.informes_visita_snippets USING GIN (temas);

CREATE OR REPLACE FUNCTION public.fn_informes_visita_snippet_fts(p_texto text, p_temas text[])
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT to_tsvector(
    'spanish'::regconfig,
    coalesce(p_texto, '') || ' ' || coalesce(array_to_string(p_temas, ' '), '')
  );
$$;

REVOKE ALL ON FUNCTION public.fn_informes_visita_snippet_fts(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_informes_visita_snippet_fts(text, text[]) TO authenticated, service_role;

ALTER TABLE public.informes_visita_snippets DROP COLUMN IF EXISTS texto_busqueda;
ALTER TABLE public.informes_visita_snippets
  ADD COLUMN texto_busqueda tsvector GENERATED ALWAYS AS (
    public.fn_informes_visita_snippet_fts(texto, temas)
  ) STORED;
CREATE INDEX informes_visita_snippets_texto_idx
  ON public.informes_visita_snippets USING GIN (texto_busqueda);

ALTER TABLE public.informes_visita DROP COLUMN IF EXISTS texto_busqueda;
ALTER TABLE public.informes_visita DROP COLUMN IF EXISTS temas;
ALTER TABLE public.informes_visita DROP COLUMN IF EXISTS notas;
ALTER TABLE public.informes_visita
  ADD COLUMN texto_busqueda tsvector GENERATED ALWAYS AS (
    to_tsvector('spanish'::regconfig, coalesce(texto_extraido, ''))
  ) STORED;
CREATE INDEX informes_visita_texto_busqueda_idx
  ON public.informes_visita USING GIN (texto_busqueda);

DO $$
DECLARE
  v_def TEXT;
  v_fts TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conname = 'informes_visita_snippets_temas_catalogo';
  IF v_def IS NULL OR position('fertilización' in v_def) = 0 THEN
    RAISE EXCEPTION '136 ABORTADA post: CHECK sin tildes (%).', v_def;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'informes_visita'
      AND column_name IN ('temas', 'notas')
  ) THEN
    RAISE EXCEPTION '136 ABORTADA post: temas/notas siguen en la cabecera.';
  END IF;

  SELECT pg_get_expr(ad.adbin, ad.adrelid) INTO v_fts
  FROM pg_attrdef ad
  JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
  WHERE ad.adrelid = 'public.informes_visita_snippets'::regclass
    AND a.attname = 'texto_busqueda';
  IF v_fts IS NULL OR v_fts NOT ILIKE '%fn_informes_visita_snippet_fts%' THEN
    RAISE EXCEPTION '136 ABORTADA post: FTS de snippet no usa la función IMMUTABLE.';
  END IF;

  SELECT pg_get_expr(ad.adbin, ad.adrelid) INTO v_fts
  FROM pg_attrdef ad
  JOIN pg_attribute a ON a.attrelid = ad.adrelid AND a.attnum = ad.adnum
  WHERE ad.adrelid = 'public.informes_visita'::regclass
    AND a.attname = 'texto_busqueda';
  IF v_fts IS NULL OR v_fts ILIKE '%notas%' THEN
    RAISE EXCEPTION '136 ABORTADA post: FTS de cabecera todavía lee notas.';
  END IF;
END $$;
