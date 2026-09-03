-- Migración 134: informes de visita agronómica + observaciones (issue #189).
--
-- Un .docx mensual de la agrónoma entra a Escocia OS: archivo e imágenes en
-- Storage, texto extraído (FTS español), cabecera de visita y filas de
-- observación. Las filas las propone el cliente y el humano confirma ANTES
-- de persistir — esta migración no inventa filas ni carga el Word de Salazar.
--
-- Numerada 134: el máximo en `src/sql/migrations/` es 133
-- (`133_insert_update_por_rol.sql`). NO APLICAR DESDE ESTE AGENTE. Schema/UI
-- /tests only — cero escrituras a datos de producción.
--
-- NO se fusiona con `rondas_monitoreo` / `monitoreos`. Tablas nuevas:
--   informes_visita, informes_visita_fotos, observaciones_agronomicas.
-- ENUM tipo_observacion_agronomica: monitoreo | rec_edafica | rec_foliar |
--   rec_drench | observacion | labor.
--
-- lote es texto libre (sector). lote_id es FK a lotes SOLO si el cliente
-- encontró un match claro — la base no inventa el vínculo.
--
-- RLS patrón 044: SELECT authenticated; INSERT/UPDATE/DELETE Administrador
-- + Gerencia; predicado envuelto (SELECT get_user_role()) (093); REVOKE ALL
-- FROM anon (081). created_by COALESCE(auth.uid()) (040/050/063/074).
--
-- Storage: bucket privado `informes-visita`. CREATE POLICY sobre
-- storage.objects puede fallar si postgres ya no es dueño (lección 109).
-- El bloque de políticas se atrapa con insufficient_privilege y avisa:
-- aplicar esas cuatro políticas desde el panel de Storage, igual que 109.
-- El resto de la migración (tablas, FTS, RLS de public) no depende de eso.
--
-- ROLLBACK ejecutable comentado al pie.

-- ---------------------------------------------------------------------------
-- 0. PRECONDICIONES
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tabla TEXT;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY[
    'informes_visita', 'informes_visita_fotos', 'observaciones_agronomicas'
  ] LOOP
    IF to_regclass('public.' || v_tabla) IS NOT NULL THEN
      RAISE EXCEPTION '134 ABORTADA: public.% ya existe. Revisar a mano.', v_tabla;
    END IF;
  END LOOP;

  IF to_regtype('public.tipo_observacion_agronomica') IS NOT NULL THEN
    RAISE EXCEPTION '134 ABORTADA: el tipo public.tipo_observacion_agronomica ya existe.';
  END IF;

  IF to_regclass('public.lotes') IS NULL THEN
    RAISE EXCEPTION '134 ABORTADA: public.lotes no existe — hace falta para observaciones_agronomicas.lote_id.';
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


-- ---------------------------------------------------------------------------
-- 1. ENUM
-- ---------------------------------------------------------------------------
CREATE TYPE public.tipo_observacion_agronomica AS ENUM (
  'monitoreo',
  'rec_edafica',
  'rec_foliar',
  'rec_drench',
  'observacion',
  'labor'
);

GRANT USAGE ON TYPE public.tipo_observacion_agronomica TO authenticated;
REVOKE ALL ON TYPE public.tipo_observacion_agronomica FROM anon;


-- ---------------------------------------------------------------------------
-- 2. TABLAS
-- ---------------------------------------------------------------------------
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
  'Cabecera de un informe de visita agronómica (.docx). Una visita → un '
  'informe. Distinto de rondas_monitoreo: aquella es la ronda de plagas de '
  'la app; esto es el Word mensual de la agrónoma. texto_busqueda es FTS '
  'español sobre el Word. Las filas de observación viven en '
  'observaciones_agronomicas y solo se insertan tras confirmación humana.';

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
  'Imágenes extraídas del .docx (evidencia, no OCR). pie_de_foto sale de '
  'wp:docPr o del párrafo siguiente. Sin la foto, un "este sector" no tiene lote.';

CREATE INDEX informes_visita_fotos_informe_idx ON public.informes_visita_fotos (informe_id, orden);

CREATE TABLE public.observaciones_agronomicas (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  informe_id              UUID NOT NULL REFERENCES public.informes_visita(id) ON DELETE CASCADE,
  fecha                   DATE NOT NULL,
  fecha_contexto          DATE,
  tipo                    public.tipo_observacion_agronomica NOT NULL,
  lote                    TEXT,
  lote_id                 UUID REFERENCES public.lotes(id) ON DELETE SET NULL,
  plaga_enfermedad        TEXT,
  accion                  TEXT,
  insumo                  TEXT,
  dosis                   NUMERIC,
  unidad                  TEXT,
  periodo_carencia_dias   INTEGER,
  via                     TEXT,
  incidencia              TEXT,
  severidad               TEXT,
  notas                   TEXT,
  foto_id                 UUID REFERENCES public.informes_visita_fotos(id) ON DELETE SET NULL,
  created_by              UUID REFERENCES public.usuarios(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.observaciones_agronomicas IS
  'Filas confirmadas de un informe de visita. Nunca se escribe una propuesta '
  'sin confirmación humana. lote es texto/sector; lote_id solo si hubo match '
  'claro con lotes.nombre. No es monitoreos: no hay ronda_id ni sublote_id.';

CREATE INDEX observaciones_agronomicas_informe_idx ON public.observaciones_agronomicas (informe_id);
CREATE INDEX observaciones_agronomicas_fecha_idx ON public.observaciones_agronomicas (fecha DESC);
CREATE INDEX observaciones_agronomicas_tipo_idx ON public.observaciones_agronomicas (tipo);
CREATE INDEX observaciones_agronomicas_plaga_idx ON public.observaciones_agronomicas (plaga_enfermedad);
CREATE INDEX observaciones_agronomicas_insumo_idx ON public.observaciones_agronomicas (insumo);


-- ---------------------------------------------------------------------------
-- 3. TRIGGERS
-- ---------------------------------------------------------------------------
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

CREATE TRIGGER trg_observaciones_agronomicas_created_by
  BEFORE INSERT ON public.observaciones_agronomicas
  FOR EACH ROW
  EXECUTE FUNCTION public.set_informe_visita_created_by();

CREATE TRIGGER trg_informes_visita_updated_at
  BEFORE UPDATE ON public.informes_visita
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_observaciones_agronomicas_updated_at
  BEFORE UPDATE ON public.observaciones_agronomicas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'informes_visita', 'informes_visita_fotos', 'observaciones_agronomicas'
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


-- ---------------------------------------------------------------------------
-- 5. STORAGE — bucket + políticas (estas últimas pueden no correr aquí)
-- ---------------------------------------------------------------------------
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


-- ---------------------------------------------------------------------------
-- 6. POSTCONDICIONES
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_anon_select BOOLEAN;
BEGIN
  IF to_regclass('public.informes_visita') IS NULL
     OR to_regclass('public.informes_visita_fotos') IS NULL
     OR to_regclass('public.observaciones_agronomicas') IS NULL THEN
    RAISE EXCEPTION '134 ABORTADA post: faltan tablas.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'tipo_observacion_agronomica'
    GROUP BY t.oid
    HAVING COUNT(*) = 6
  ) THEN
    RAISE EXCEPTION '134 ABORTADA post: el ENUM no tiene 6 etiquetas.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'informes_visita_texto_busqueda_idx'
  ) THEN
    RAISE EXCEPTION '134 ABORTADA post: falta el índice GIN de FTS.';
  END IF;

  SELECT has_table_privilege('anon', 'public.informes_visita', 'SELECT') INTO v_anon_select;
  IF v_anon_select THEN
    RAISE EXCEPTION '134 ABORTADA post: anon todavía tiene SELECT sobre informes_visita.';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- ROLLBACK (no ejecutar con la migración)
-- ---------------------------------------------------------------------------
-- DROP POLICY IF EXISTS "Informes visita: subir" ON storage.objects;
-- DROP POLICY IF EXISTS "Informes visita: leer" ON storage.objects;
-- DROP POLICY IF EXISTS "Informes visita: actualizar" ON storage.objects;
-- DROP POLICY IF EXISTS "Informes visita: eliminar" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'informes-visita';
-- DROP TRIGGER IF EXISTS trg_observaciones_agronomicas_updated_at ON public.observaciones_agronomicas;
-- DROP TRIGGER IF EXISTS trg_informes_visita_updated_at ON public.informes_visita;
-- DROP TRIGGER IF EXISTS trg_observaciones_agronomicas_created_by ON public.observaciones_agronomicas;
-- DROP TRIGGER IF EXISTS trg_informes_visita_created_by ON public.informes_visita;
-- DROP FUNCTION IF EXISTS public.set_informe_visita_created_by();
-- DROP TABLE IF EXISTS public.observaciones_agronomicas;
-- DROP TABLE IF EXISTS public.informes_visita_fotos;
-- DROP TABLE IF EXISTS public.informes_visita;
-- DROP TYPE IF EXISTS public.tipo_observacion_agronomica;
