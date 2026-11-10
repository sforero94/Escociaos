-- 193 — Totales de etapa por lote y cosecha. NO APLICADA.
--
-- Santiago aprueba esta migración antes de que corra en ninguna base.
-- No trae datos. La carga la hace Escocia Bot después de aplicarla.
-- No altera tablas existentes.
--
-- Qué guarda: un kilo de clasificación o de despacho por lote y campaña,
-- con su propia fecha de corte. No es producción adicional y no se suma
-- a la entrada de `produccion`.
--
-- Lectura: igual que `produccion` (authenticated, predicado true).
-- Escritura: solo Gerencia y Administrador, como quedaron INSERT/UPDATE
-- (133) y DELETE (120) de `produccion`.

BEGIN;

CREATE TABLE public.produccion_etapas_lote (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano integer NOT NULL CHECK (ano >= 2020 AND ano <= 2050),
  cosecha_tipo text NOT NULL CHECK (cosecha_tipo IN ('Principal', 'Traviesa')),
  lote_id uuid NOT NULL REFERENCES public.lotes(id) ON DELETE RESTRICT,
  etapa text NOT NULL CHECK (etapa IN ('clasificado', 'despachado')),
  kg numeric(12, 2) NOT NULL CHECK (kg >= 0),
  fecha_corte date NOT NULL,
  fuente text,
  observaciones text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT produccion_etapas_lote_unica UNIQUE (ano, cosecha_tipo, lote_id, etapa)
);

COMMENT ON TABLE public.produccion_etapas_lote IS
  'Total de una etapa (clasificado o despachado) por lote y cosecha, con su fecha de corte. No se suma a produccion.kg_totales.';
COMMENT ON COLUMN public.produccion_etapas_lote.fecha_corte IS
  'Corte propio de esta etapa. El despacho puede cerrar en un día distinto al de la clasificación.';
COMMENT ON COLUMN public.produccion_etapas_lote.kg IS
  'Kilos de la etapa. El clasificado de aguacate son canastas × 20 kg; una diferencia contra la entrada no es merma.';

CREATE INDEX produccion_etapas_lote_cosecha_idx
  ON public.produccion_etapas_lote (ano, cosecha_tipo);

ALTER TABLE public.produccion_etapas_lote ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.produccion_etapas_lote FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.produccion_etapas_lote TO authenticated;

CREATE POLICY "Allow authenticated read access on produccion_etapas_lote"
  ON public.produccion_etapas_lote
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated insert on produccion_etapas_lote"
  ON public.produccion_etapas_lote
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

CREATE POLICY "Allow authenticated update on produccion_etapas_lote"
  ON public.produccion_etapas_lote
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario))
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

CREATE POLICY "Allow authenticated delete on produccion_etapas_lote"
  ON public.produccion_etapas_lote
  FOR DELETE
  TO authenticated
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

COMMIT;
