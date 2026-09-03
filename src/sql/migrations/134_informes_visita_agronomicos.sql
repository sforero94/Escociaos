-- Migración 134: informes de visita agronómica — snippets (issue #189).
--
-- Pivot respecto al primer borrador de esta misma 134 (nunca aplicada):
-- la unidad de trabajo NO es una fila estructurada (dosis, carencia, lote_id).
-- Es un SNIPPET: una idea confirmada (diagnóstico + recomendación juntos,
-- no MECE). El Word y su texto extraído son la capa de evidencia. No hay
-- embeddings ni pgvector: la búsqueda es FTS español sobre el Word y sobre
-- el texto del snippet.
--
-- Un .docx entra: archivo e imágenes en Storage, texto extraído, cabecera
-- de visita. Un modelo propone snippets; el humano confirma / edita /
-- ignora (swipe) ANTES de persistir. Puede añadir una nota de conversación
-- que no estaba en el informe (origen = conversacion).
--
-- Numerada 134: el máximo aplicado en el repo es 133. Esta 134 NO se
-- aplica desde este agente. Schema/UI/tests only. Cero escrituras a
-- producción. Si un entorno llegó a crear `observaciones_agronomicas`
-- del borrador anterior, la precondición aborta.
--
-- NO se fusiona con `rondas_monitoreo` / `monitoreos`. Tablas:
--   informes_visita, informes_visita_fotos, informes_visita_snippets.
--
-- RLS patrón 044: SELECT authenticated; INSERT/UPDATE/DELETE
-- Administrador + Gerencia; predicado (SELECT get_user_role()) (093);
-- REVOKE ALL FROM anon (081). created_by COALESCE(auth.uid()) (040).
--
-- Storage: bucket privado `informes-visita`. Políticas de storage.objects
-- en EXCEPTION insufficient_privilege (lección 109).

DO $$
DECLARE
  v_tabla TEXT;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY[
    'informes_visita', 'informes_visita_fotos', 'informes_visita_snippets',
    'observaciones_agronomicas'
  ] LOOP
    IF to_regclass('public.' || v_tabla) IS NOT NULL THEN
      RAISE EXCEPTION '134 ABORTADA: public.% ya existe. Si es el borrador de filas, hacer ROLLBACK de esa 134 a mano antes de esta.', v_tabla;
    END IF;
  END LOOP;

  IF to_regtype('public.tipo_observacion_agronomica') IS NOT NULL THEN
    RAISE EXCEPTION '134 ABORTADA: el tipo public.tipo_observacion_agronomica ya existe (borrador anterior).';
  END IF;

  IF to_regclass('public.usuarios') IS NULL THEN
    RAISE EXCEPTION '134 ABORTADA: public.usuarios no existe — lo necesita created_by y la RLS.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_user_role') THEN
    RAISE EXCEPTION '134 ABORTADA: get_user_role() no existe.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    RAISE EXCEPTION '134 ABORTADA: update_updated_at_column() no existe.';
  END IF;
END $$;

CREATE TABLE public.informes_visita (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha_visita         DATE NOT NULL,
  agronoma             TEXT,
  finca                TEXT,
  especie              TEXT,
  fenologia            TEXT,
  materia_seca         TEXT,
  proyeccion_cosecha   TEXT,
  archivo_path         TEXT NOT NULL,
  archivo_nombre       TEXT NOT NULL,
  texto_extraido       TEXT,
  sin_texto            BOOLEAN NOT NULL DEFAULT false,
  texto_busqueda       tsvector GENERATED ALWAYS AS (
                         to_tsvector('spanish', coalesce(texto_extraido, ''))
                       ) STORED,
  created_by           UUID REFERENCES public.usuarios(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT informes_visita_sin_texto_coherente CHECK (
    (sin_texto = true AND texto_extraido IS NULL)
    OR (sin_texto = false)
  )
);

COMMENT ON TABLE public.informes_visita IS
  'Cabecera + evidencia de un informe de visita agronómica (.docx). '
  'Distinto de rondas_monitoreo. texto_busqueda es FTS español sobre el Word. '
  'Las ideas confirmadas viven en informes_visita_snippets. Sin embeddings.';

CREATE INDEX informes_visita_fecha_idx ON public.informes_visita (fecha_visita DESC);
CREATE INDEX informes_visita_texto_busqueda_idx ON public.informes_visita USING GIN (texto_busqueda);

CREATE TABLE public.informes_visita_fotos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  informe_id       UUID NOT NULL REFERENCES public.informes_visita(id) ON DELETE CASCADE,
  storage_path     TEXT NOT NULL,
  pie_de_foto      TEXT,
  orden            INTEGER NOT NULL DEFAULT 0,
  nombre_original  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.informes_visita_fotos IS
  'Imágenes extraídas del .docx (evidencia, no OCR).';

CREATE INDEX informes_visita_fotos_informe_idx ON public.informes_visita_fotos (informe_id, orden);

CREATE TABLE public.informes_visita_snippets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  informe_id   UUID NOT NULL REFERENCES public.informes_visita(id) ON DELETE CASCADE,
  texto        TEXT NOT NULL,
  cita_word    TEXT,
  origen       TEXT NOT NULL CHECK (origen IN ('informe', 'conversacion')),
  tipo         TEXT,
  insumo       TEXT,
  plaga        TEXT,
  foto_id      UUID REFERENCES public.informes_visita_fotos(id) ON DELETE SET NULL,
  texto_busqueda tsvector GENERATED ALWAYS AS (
                   to_tsvector('spanish', coalesce(texto, ''))
                 ) STORED,
  created_by   UUID REFERENCES public.usuarios(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT informes_visita_snippets_texto_no_vacio CHECK (length(btrim(texto)) > 0)
);

COMMENT ON TABLE public.informes_visita_snippets IS
  'Ideas confirmadas de una visita. Una idea por fila, no MECE. origen '
  'informe = salió del Word (cita_word es el ancla). origen conversacion = '
  'la anotó un humano después. Chips tipo/insumo/plaga son pistas, no un '
  'esquema rígido. FTS español en texto_busqueda. Sin embeddings.';

CREATE INDEX informes_visita_snippets_informe_idx ON public.informes_visita_snippets (informe_id);
CREATE INDEX informes_visita_snippets_texto_idx ON public.informes_visita_snippets USING GIN (texto_busqueda);
CREATE INDEX informes_visita_snippets_insumo_idx ON public.informes_visita_snippets (insumo);
CREATE INDEX informes_visita_snippets_plaga_idx ON public.informes_visita_snippets (plaga);
CREATE INDEX informes_visita_snippets_tipo_idx ON public.informes_visita_snippets (tipo);

CREATE OR REPLACE FUNCTION public.set_informe_visita_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_informe_visita_created_by() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_informes_visita_created_by
  BEFORE INSERT ON public.informes_visita
  FOR EACH ROW
  EXECUTE FUNCTION public.set_informe_visita_created_by();

CREATE TRIGGER trg_informes_visita_snippets_created_by
  BEFORE INSERT ON public.informes_visita_snippets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_informe_visita_created_by();

CREATE TRIGGER trg_informes_visita_updated_at
  BEFORE UPDATE ON public.informes_visita
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_informes_visita_snippets_updated_at
  BEFORE UPDATE ON public.informes_visita_snippets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'informes_visita', 'informes_visita_fotos', 'informes_visita_snippets'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_select_authenticated" ON %I', t, t);
    EXECUTE format($pol$
      CREATE POLICY "%s_select_authenticated" ON %I
        FOR SELECT TO authenticated
        USING (TRUE)
    $pol$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_insert_admin_gerencia" ON %I', t, t);
    EXECUTE format($pol$
      CREATE POLICY "%s_insert_admin_gerencia" ON %I
        FOR INSERT TO authenticated
        WITH CHECK ((SELECT public.get_user_role()) IN ('Administrador'::public.rol_usuario, 'Gerencia'::public.rol_usuario))
    $pol$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_update_admin_gerencia" ON %I', t, t);
    EXECUTE format($pol$
      CREATE POLICY "%s_update_admin_gerencia" ON %I
        FOR UPDATE TO authenticated
        USING ((SELECT public.get_user_role()) IN ('Administrador'::public.rol_usuario, 'Gerencia'::public.rol_usuario))
        WITH CHECK ((SELECT public.get_user_role()) IN ('Administrador'::public.rol_usuario, 'Gerencia'::public.rol_usuario))
    $pol$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_delete_admin_gerencia" ON %I', t, t);
    EXECUTE format($pol$
      CREATE POLICY "%s_delete_admin_gerencia" ON %I
        FOR DELETE TO authenticated
        USING ((SELECT public.get_user_role()) IN ('Administrador'::public.rol_usuario, 'Gerencia'::public.rol_usuario))
    $pol$, t, t);

    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
  END LOOP;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('informes-visita', 'informes-visita', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Informes visita: subir" ON storage.objects;
  CREATE POLICY "Informes visita: subir"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'informes-visita' AND
    (SELECT public.get_user_role()) IN ('Administrador'::public.rol_usuario, 'Gerencia'::public.rol_usuario)
  );

  DROP POLICY IF EXISTS "Informes visita: leer" ON storage.objects;
  CREATE POLICY "Informes visita: leer"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'informes-visita');

  DROP POLICY IF EXISTS "Informes visita: actualizar" ON storage.objects;
  CREATE POLICY "Informes visita: actualizar"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'informes-visita' AND
    (SELECT public.get_user_role()) IN ('Administrador'::public.rol_usuario, 'Gerencia'::public.rol_usuario)
  );

  DROP POLICY IF EXISTS "Informes visita: eliminar" ON storage.objects;
  CREATE POLICY "Informes visita: eliminar"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'informes-visita' AND
    (SELECT public.get_user_role()) = 'Gerencia'::public.rol_usuario
  );
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE WARNING '134: no se pudieron crear políticas de storage.objects (postgres no es dueño, lección 109). Aplicar las cuatro políticas "Informes visita: *" desde el panel de Storage. Tablas y RLS de public sí quedaron.';
END $$;

DO $$
DECLARE
  v_anon_select BOOLEAN;
BEGIN
  IF to_regclass('public.informes_visita') IS NULL
     OR to_regclass('public.informes_visita_fotos') IS NULL
     OR to_regclass('public.informes_visita_snippets') IS NULL THEN
    RAISE EXCEPTION '134 ABORTADA post: faltan tablas.';
  END IF;

  IF to_regclass('public.observaciones_agronomicas') IS NOT NULL THEN
    RAISE EXCEPTION '134 ABORTADA post: observaciones_agronomicas no debía crearse.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'informes_visita_snippets_texto_idx'
  ) THEN
    RAISE EXCEPTION '134 ABORTADA post: falta el índice GIN de FTS de snippets.';
  END IF;

  SELECT has_table_privilege('anon', 'public.informes_visita', 'SELECT') INTO v_anon_select;
  IF v_anon_select THEN
    RAISE EXCEPTION '134 ABORTADA post: anon todavía tiene SELECT sobre informes_visita.';
  END IF;
END $$;

-- ROLLBACK (no ejecutar con la migración)
-- DROP POLICY IF EXISTS "Informes visita: subir" ON storage.objects;
-- DROP POLICY IF EXISTS "Informes visita: leer" ON storage.objects;
-- DROP POLICY IF EXISTS "Informes visita: actualizar" ON storage.objects;
-- DROP POLICY IF EXISTS "Informes visita: eliminar" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'informes-visita';
-- DROP TRIGGER IF EXISTS trg_informes_visita_snippets_updated_at ON public.informes_visita_snippets;
-- DROP TRIGGER IF EXISTS trg_informes_visita_updated_at ON public.informes_visita;
-- DROP TRIGGER IF EXISTS trg_informes_visita_snippets_created_by ON public.informes_visita_snippets;
-- DROP TRIGGER IF EXISTS trg_informes_visita_created_by ON public.informes_visita;
-- DROP FUNCTION IF EXISTS public.set_informe_visita_created_by();
-- DROP TABLE IF EXISTS public.informes_visita_snippets;
-- DROP TABLE IF EXISTS public.informes_visita_fotos;
-- DROP TABLE IF EXISTS public.informes_visita;
