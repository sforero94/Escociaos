-- =====================================================================
-- 053: Hato Lechero — núcleo (toros, animales, chequeos, eventos)
-- Fecha: 2026-07-22
--
-- Parte del PR único de S1 (hato) — plan docs/plan_hato_lechero_module.md
-- §7.1–7.2, renumerado 050→053…057→060 (ver brief S1, Decisión 1).
--
-- Propósito: primer bloque del esquema del módulo Hato Lechero. Diseño
-- en tres capas (brief Decisión 4 / plan §7.1):
--   1. Capa cruda    — hato_chequeo_vacas conserva la planilla en *_raw.
--   2. Capa eventos  — hato_eventos, log append-only del ciclo de vida.
--   3. Capa derivada — vista v_hato_estado_actual (migración 056) +
--                       calculosHato.ts (S2).
--
-- Tablas (en este archivo, orden por dependencia de FK):
--   hato_toros          — catálogo de toros/sementales (V12). Se crea
--                          PRIMERO: es referenciado por hato_animales
--                          (padre_toro_id) y hato_eventos (toro_id).
--                          Ver brief Decisión 2 — no vive en 057 con
--                          pajillas para evitar una FK hacia adelante.
--   hato_animales        — un registro por animal, para siempre (D1:
--                          numero es chapeta permanente, nunca se recicla).
--   hato_chequeos         — cabecera de ronda (chequeo veterinario bimestral).
--   hato_chequeo_vacas    — una fila por vaca por chequeo (capa cruda +
--                          normalizada).
--   hato_eventos          — log reproductivo/ciclo de vida (capa de eventos).
--                          `alerta_id` se declara SIN FK aquí (hato_alertas
--                          no existe todavía) — el FK se back-patchea en
--                          la migración 056 (brief Decisión 2).
--
-- RLS: patrón 044 — SELECT para authenticated, escritura Administrador +
-- Gerencia.
--
-- Idempotente: seguro de re-ejecutar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. hato_toros — catálogo editable de toros/sementales (V12, Épica G4)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hato_toros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  tipo TEXT CHECK (tipo IN ('monta', 'inseminacion')),
  raza TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Unicidad case-insensitive del nombre (precedente gan_fincas, 044):
-- habilita la siembra idempotente desde el histórico (S3) vía
-- ON CONFLICT ((lower(nombre))) DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS hato_toros_nombre_unique
  ON hato_toros (lower(nombre));

-- ---------------------------------------------------------------------
-- 2. hato_animales — ficha por animal (hembras: ternera/novilla/vaca;
--    toro solo aparece como etapa histórica de import, el catálogo vivo
--    de toros es hato_toros)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hato_animales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero INTEGER UNIQUE,
  nombre TEXT,
  sexo TEXT CHECK (sexo IN ('hembra', 'macho')) DEFAULT 'hembra',
  etapa TEXT NOT NULL CHECK (etapa IN ('ternera', 'novilla', 'vaca', 'toro')),
  raza TEXT,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'vendida', 'muerta', 'descartada')),
  fecha_estado DATE,
  fecha_nacimiento DATE,
  fecha_nacimiento_confianza TEXT NOT NULL DEFAULT 'desconocida' CHECK (fecha_nacimiento_confianza IN ('exacta', 'aproximada', 'desconocida')),
  madre_id UUID REFERENCES hato_animales(id),
  padre_toro_id UUID REFERENCES hato_toros(id),
  padre_id UUID REFERENCES hato_animales(id),
  finca_id UUID REFERENCES gan_fincas(id),
  origen TEXT CHECK (origen IN ('nacimiento', 'compra', 'importacion_historica')),
  confianza TEXT NOT NULL DEFAULT 'alta' CHECK (confianza IN ('alta', 'media', 'baja')),
  import_meta JSONB,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_hato_animales_estado_etapa ON hato_animales(estado, etapa);
CREATE INDEX IF NOT EXISTS idx_hato_animales_madre_id ON hato_animales(madre_id);

-- ---------------------------------------------------------------------
-- 3. hato_chequeos — cabecera de ronda (chequeo veterinario)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hato_chequeos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  veterinario TEXT,
  estado TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'cerrado')),
  fuente TEXT NOT NULL DEFAULT 'web' CHECK (fuente IN ('web', 'importacion')),
  sheet_ref TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_hato_chequeos_fecha ON hato_chequeos(fecha);

-- ---------------------------------------------------------------------
-- 4. hato_chequeo_vacas — una fila por vaca por chequeo. Capa cruda
--    (*_raw, preserva la planilla verbatim) + capa normalizada (nullable).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hato_chequeo_vacas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chequeo_id UUID NOT NULL REFERENCES hato_chequeos(id) ON DELETE CASCADE,
  animal_id UUID NOT NULL REFERENCES hato_animales(id),
  -- Capa cruda: texto verbatim de la planilla, nunca se descarta un valor
  -- no interpretable (#VALUE!, fechas multi-valor, etc.)
  pl_raw TEXT,
  np_raw TEXT,
  ultima_cria_raw TEXT,
  sx_raw TEXT,
  fecha_servicio_raw TEXT,
  toro_raw TEXT,
  tp_raw TEXT,
  estado_raw TEXT,
  secar_raw TEXT,
  pp_raw TEXT,
  ttto_raw TEXT,
  -- Capa normalizada
  pl NUMERIC,
  num_partos INTEGER,
  fecha_servicio DATE,
  toro TEXT,
  tipo_servicio TEXT CHECK (tipo_servicio IN ('monta', 'inseminacion')),
  meses_prenez NUMERIC,
  fecha_secar DATE,
  fecha_probable_parto DATE,
  normalizacion_issues JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (chequeo_id, animal_id)
);

CREATE INDEX IF NOT EXISTS idx_hato_chequeo_vacas_animal_id ON hato_chequeo_vacas(animal_id);

-- ---------------------------------------------------------------------
-- 5. hato_eventos — log append-only del ciclo reproductivo/de vida.
--    (V7) Un ciclo puede tener varios `servicio` encadenados (uno que no
--    cuaja, seguido de `celo` y un re-servicio) — todos quedan en el log.
--
--    `alerta_id` se declara sin FK: hato_alertas se crea en 056. El FK
--    se agrega ahí con ALTER TABLE (brief S1 Decisión 2).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hato_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id UUID NOT NULL REFERENCES hato_animales(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('servicio', 'celo', 'confirmacion_prenez', 'parto', 'aborto', 'secado_real', 'venta', 'muerte', 'compra', 'cambio_etapa', 'rechequeo')),
  fecha DATE NOT NULL,
  fecha_confianza TEXT NOT NULL DEFAULT 'exacta' CHECK (fecha_confianza IN ('exacta', 'aproximada', 'desconocida')),
  toro_id UUID REFERENCES hato_toros(id),
  tipo_servicio TEXT CHECK (tipo_servicio IN ('monta', 'inseminacion')),
  cria_id UUID REFERENCES hato_animales(id),
  cria_destino TEXT CHECK (cria_destino IN ('retenida', 'macho_vendido', 'hembra_vendida', 'muerta', 'aborto')),
  sx_raw TEXT,
  chequeo_vaca_id UUID REFERENCES hato_chequeo_vacas(id),
  alerta_id UUID,
  transaccion_ganado_id UUID REFERENCES fin_transacciones_ganado(id) ON DELETE SET NULL,
  fuente TEXT CHECK (fuente IN ('web', 'telegram', 'importacion', 'alerta', 'chequeo')),
  datos JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_hato_eventos_animal_fecha ON hato_eventos(animal_id, fecha);
CREATE INDEX IF NOT EXISTS idx_hato_eventos_tipo_fecha ON hato_eventos(tipo, fecha);
-- Parcial: alimenta la timeline (A3/V7) y la regla servicio_sin_confirmacion (§7.3)
CREATE INDEX IF NOT EXISTS idx_hato_eventos_servicio_animal_fecha
  ON hato_eventos(animal_id, fecha) WHERE tipo = 'servicio';

-- ---------------------------------------------------------------------
-- 6. RLS — patrón 044: SELECT para authenticated, escritura Administrador
--    + Gerencia.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['hato_toros', 'hato_animales', 'hato_chequeos', 'hato_chequeo_vacas', 'hato_eventos']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_select_authenticated" ON %I', t, t);
    EXECUTE format($pol$
      CREATE POLICY "%s_select_authenticated" ON %I
        FOR SELECT TO authenticated
        USING (TRUE)
    $pol$, t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_write_admin_gerencia" ON %I', t, t);
    EXECUTE format($pol$
      CREATE POLICY "%s_write_admin_gerencia" ON %I
        FOR ALL TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM usuarios u
            WHERE u.id = auth.uid()
            AND u.rol IN ('Administrador'::rol_usuario, 'Gerencia'::rol_usuario)
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM usuarios u
            WHERE u.id = auth.uid()
            AND u.rol IN ('Administrador'::rol_usuario, 'Gerencia'::rol_usuario)
          )
        )
    $pol$, t, t);
  END LOOP;
END $$;
