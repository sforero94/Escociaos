-- Migración 125: esquema de la "ronda de inventario" -- Fase 1 (Fundaciones)
-- de docs/brief_tecnico_verificacion_inventario.md §4, sobre la definición
-- de producto cerrada en docs/plan_verificacion_inventario.md (decisión 9.9:
-- el nombre del concepto es "ronda de inventario", nunca "verificación").
--
-- Transcribe LITERAL el diseño de §4 del brief técnico: 8 tablas nuevas
-- (`rondas_inventario`, `rondas_inventario_alcance`, `inventario_causas_raiz`
-- con sus 7 filas sembradas, `rondas_transcritos`, `rondas_excepciones` con
-- sus 5 CONSTRAINT de control -- `excepcion_avanza_solo_con_david` es el
-- mecanismo central de CA-38 --, `rondas_reportes`, `rondas_avisos`,
-- `inventario_parametros`), los 2 ENUM (`estado_ronda_inventario`,
-- `estado_excepcion_inventario`), los 2 índices únicos parciales
-- (`rondas_inventario_una_en_curso`, `rondas_inventario_periodo_unico`) y el
-- bloque de RLS de §4.6 (patrón 044 con dos ajustes: DELETE sin política a
-- propósito en las cuatro tablas operativas, `REVOKE ALL FROM anon` en las
-- OCHO tablas -- literal del brief).
--
-- NO CREA NINGÚN RPC. `fn_ronda_validar_actor` y los diez RPC de §6 del
-- brief técnico son la migración 126, de una fase posterior (Fase 2 -- RPC),
-- fuera del alcance de la Fase 1. Esta migración es sólo esquema: tablas,
-- tipos, índices, semillas de referencia y RLS.
--
-- Por qué D-T1 (§0 del brief): tablas NUEVAS, nunca se reusa
-- `verificaciones_inventario`/`verificaciones_detalle`. Esas dos ya se
-- congelaron y rotularon por la migración 124 (aplicada) y siguen existiendo,
-- sólo lectura, sin relación con lo que crea este archivo.
--
-- ---------------------------------------------------------------------------
-- VERIFICACIÓN CONTRA EL CATÁLOGO VIVO -- LO QUE ESTA SESIÓN PUDO Y NO PUDO
-- COMPROBAR
-- ---------------------------------------------------------------------------
-- Esta sesión de implementación (Fase 1) NO tuvo un conector de Supabase de
-- sólo lectura disponible -- a diferencia de lo que asume el CLAUDE.md raíz
-- para el flujo normal de "verificar contra el catálogo vivo antes de
-- escribir el fichero". Lo que SÍ se pudo comprobar, y contra qué:
--
--   * `src/types/database.ts` (generado desde el catálogo real, aunque el
--     propio CLAUDE.md advierte que esa fuente está desactualizada para
--     TABLAS enteras que faltan -- nunca se documentó que mienta sobre la
--     FORMA de una tabla que sí lista): `productos.id` es `uuid`,
--     `productos.cantidad_actual` es `numeric` nullable,
--     `productos.unidad_medida` es el enum `unidad_medida` con EXACTAMENTE
--     tres etiquetas `"Kilos" | "Litros" | "Unidades"`;
--     `movimientos_inventario.id` es `uuid`; `telegram_usuarios.id` es
--     `uuid` y la tabla tiene `usuario_id`/`modulos_permitidos`/`activo`
--     tal como el brief técnico los usa; `usuarios.id` es `uuid` y
--     `usuarios.rol` es el enum `rol_usuario` con EXACTAMENTE tres
--     etiquetas `"Administrador" | "Verificador" | "Gerencia"`.
--   * El máximo número de migración en `src/sql/migrations/` es 124
--     (`124_rotular_verificacion_prueba.sql`, ya aplicada según el CLAUDE.md
--     raíz) -- 125 es el siguiente libre, coordinado con el brief técnico
--     (rev. 3) y con la tarea de esta sesión. No coincide con la 129 que
--     otra sesión en paralelo está usando para un saneamiento de precios
--     totalmente independiente (§11 del brief técnico) -- ver la guarda 0.7.
--   * `get_user_role()` y `es_usuario_gerencia()` (migraciones 073/093) y
--     `update_updated_at_column()` (migración histórica
--     `add_contractor_support.sql`) están citadas y usadas en migraciones ya
--     aplicadas (052, 096, 110, 111) contra las mismas tablas que este
--     archivo también gobierna por RLS -- se asume que siguen existiendo
--     con la misma firma; la guarda 0.6 lo confirma en tiempo de aplicación,
--     no en tiempo de escritura.
--
-- Lo que NO se pudo comprobar en vivo (y por qué las guardas de abajo son
-- estrictas en vez de "confiar en la documentación", precedente 124): que
-- ninguna de las 8 tablas/2 tipos nuevos ya exista con otro contenido, que
-- los conteos de `pg_enum`/`pg_proc` de arriba sigan siendo así el día que
-- esto se aplique, y que el número 125 siga libre en ese momento (el propio
-- CLAUDE.md documenta DOS renumeraciones de este mismo trabajo en cuatro
-- días por exactamente esta razón). **Antes de aplicar, repetir el `ls` y la
-- consulta al ledger que el CLAUDE.md exige "inmediatamente antes de nombrar
-- el archivo" -- no confiar en el número escrito acá si pasó tiempo.**
--
-- NO APLICAR DESDE ESTE AGENTE. Este archivo queda escrito y verificado
-- estructuralmente (contra `src/types/database.ts` y las migraciones ya
-- aplicadas del repo) para que el dueño lo aplique tras su revisión, mismo
-- protocolo que la 124.
--
-- Estilo de guardas: precondiciones (0.x) que abortan con RAISE EXCEPTION si
-- el catálogo no está como se documenta arriba, y postcondiciones (4.x) que
-- comprueban que la migración dejó exactamente lo que dice dejar --
-- ninguna es idempotente a propósito (precedente 124/099): si algo de esto
-- ya existe, hay que mirar a mano, no re-aplicar en silencio.
--
-- ROLLBACK ejecutable comentado al pie (mismo patrón que 080/081/099/107).
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. PRECONDICIONES
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tabla TEXT;
  v_tipo TEXT;
  v_etiquetas_unidad TEXT[];
  v_etiquetas_rol TEXT[];
BEGIN
  -- 0.1 Ninguna de las 8 tablas nuevas puede existir ya.
  FOREACH v_tabla IN ARRAY ARRAY[
    'rondas_inventario', 'rondas_inventario_alcance', 'inventario_causas_raiz',
    'rondas_transcritos', 'rondas_excepciones', 'rondas_reportes',
    'rondas_avisos', 'inventario_parametros'
  ] LOOP
    IF to_regclass('public.' || v_tabla) IS NOT NULL THEN
      RAISE EXCEPTION '125 ABORTADA: la tabla public.% ya existe. Esta migración crea tablas NUEVAS, no las reemplaza -- revisar a mano antes de continuar (¿ya se aplicó 125 con otro número, o alguien creó la tabla por otra vía?).', v_tabla;
    END IF;
  END LOOP;

  -- 0.2 Ninguno de los 2 ENUM nuevos puede existir ya.
  FOREACH v_tipo IN ARRAY ARRAY['estado_ronda_inventario', 'estado_excepcion_inventario'] LOOP
    IF to_regtype('public.' || v_tipo) IS NOT NULL THEN
      RAISE EXCEPTION '125 ABORTADA: el tipo public.% ya existe. Revisar a mano antes de continuar.', v_tipo;
    END IF;
  END LOOP;

  -- 0.3 Las tablas que este esquema referencia por FK deben existir.
  IF to_regclass('public.productos') IS NULL THEN
    RAISE EXCEPTION '125 ABORTADA: public.productos no existe -- no se puede crear rondas_inventario_alcance/rondas_excepciones sin su FK.';
  END IF;
  IF to_regclass('public.movimientos_inventario') IS NULL THEN
    RAISE EXCEPTION '125 ABORTADA: public.movimientos_inventario no existe -- no se puede crear rondas_excepciones sin su FK.';
  END IF;
  IF to_regclass('public.telegram_usuarios') IS NULL THEN
    RAISE EXCEPTION '125 ABORTADA: public.telegram_usuarios no existe -- no se puede crear las columnas *_telegram sin su FK.';
  END IF;
  IF to_regclass('public.usuarios') IS NULL THEN
    RAISE EXCEPTION '125 ABORTADA: public.usuarios no existe -- lo necesita la RLS de §4.6 (get_user_role()/es_usuario_gerencia() lo consultan).';
  END IF;

  -- 0.4 productos.unidad_medida y productos.cantidad_actual deben tener la
  --     forma exacta que rondas_inventario_alcance asume (mismo tipo de
  --     columna, para que la foto de R-5 congele lo mismo que el vivo).
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'productos'
       AND column_name = 'unidad_medida' AND udt_name = 'unidad_medida'
  ) THEN
    RAISE EXCEPTION '125 ABORTADA: productos.unidad_medida no es del tipo enum unidad_medida como se documenta. Revisar contra el catálogo vivo antes de continuar.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'productos'
       AND column_name = 'cantidad_actual' AND data_type = 'numeric'
  ) THEN
    RAISE EXCEPTION '125 ABORTADA: productos.cantidad_actual no es numeric como se documenta.';
  END IF;

  -- 0.5 El enum unidad_medida debe tener EXACTAMENTE las 3 etiquetas
  --     documentadas en el CLAUDE.md raíz -- si alguien le agregó una cuarta,
  --     rondas_inventario_alcance.unidad la acepta igual (reusa el tipo), así
  --     que esto es informativo, no bloqueante para el esquema en sí, pero SÍ
  --     bloqueante si cambió de nombre o desapareció una etiqueta esperada.
  SELECT array_agg(enumlabel ORDER BY enumlabel) INTO v_etiquetas_unidad
    FROM pg_enum WHERE enumtypid = 'public.unidad_medida'::regtype;
  IF v_etiquetas_unidad IS DISTINCT FROM ARRAY['Kilos', 'Litros', 'Unidades'] THEN
    RAISE EXCEPTION '125 ABORTADA: unidad_medida tiene etiquetas %, se esperaban exactamente [Kilos, Litros, Unidades] (src/types/database.ts). Revisar antes de continuar -- puede que el catálogo vivo haya divergido del tipo generado.', v_etiquetas_unidad;
  END IF;

  -- 0.6 rol_usuario debe tener EXACTAMENTE las 3 etiquetas que la RLS de
  --     §4.6 compara literalmente ('Administrador', 'Gerencia').
  SELECT array_agg(enumlabel ORDER BY enumlabel) INTO v_etiquetas_rol
    FROM pg_enum WHERE enumtypid = 'public.rol_usuario'::regtype;
  IF v_etiquetas_rol IS DISTINCT FROM ARRAY['Administrador', 'Gerencia', 'Verificador'] THEN
    RAISE EXCEPTION '125 ABORTADA: rol_usuario tiene etiquetas %, se esperaban exactamente [Administrador, Gerencia, Verificador]. La RLS de esta migración compara contra esos literales -- si el enum cambió, las políticas de abajo podrían compilar pero gatear mal.', v_etiquetas_rol;
  END IF;

  -- 0.7 Las tres funciones que la RLS/los triggers de esta migración
  --     invocan deben existir ya (no las crea este archivo).
  IF to_regprocedure('public.get_user_role()') IS NULL THEN
    RAISE EXCEPTION '125 ABORTADA: public.get_user_role() no existe. La RLS de rondas_inventario/_alcance/_transcritos/_excepciones la necesita (precedente 093/110/111).';
  END IF;
  IF to_regprocedure('public.es_usuario_gerencia()') IS NULL THEN
    RAISE EXCEPTION '125 ABORTADA: public.es_usuario_gerencia() no existe. La RLS de rondas_reportes/rondas_avisos/inventario_parametros la necesita (precedente 052/096).';
  END IF;
  IF to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    RAISE EXCEPTION '125 ABORTADA: public.update_updated_at_column() no existe. Los triggers de updated_at de rondas_inventario/rondas_excepciones/inventario_parametros la necesitan.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. TIPOS
-- ---------------------------------------------------------------------------

CREATE TYPE estado_ronda_inventario AS ENUM ('programada', 'en_curso', 'cerrada', 'omitida');

-- CA-38 como estado, no como texto -- ver la cabecera de rondas_excepciones
-- más abajo para el razonamiento completo (§4.4 del brief técnico).
CREATE TYPE estado_excepcion_inventario AS ENUM (
  'reportada',                -- confirmada por Uriel. No pasó por David
  'explicacion_precargada',   -- hay una CITA del audio. NO es la palabra de David
  'explicada',                -- David tocó. Recién acá se puede tomar una vía
  'cerrada_sin_ajuste',       -- terminal 1
  'resuelta_con_captura',     -- terminal 2 (vía a)
  'ajuste_propuesto',
  'ajuste_aprobado',
  'ajuste_desestimado',       -- terminal 3-a
  'ajuste_aplicado'           -- terminal 3-b
);

-- ---------------------------------------------------------------------------
-- 2. LA RONDA Y SU FOTO CONGELADA (§4.1 del brief técnico)
-- ---------------------------------------------------------------------------

CREATE TABLE rondas_inventario (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo               DATE        NOT NULL,   -- primer día del mes que cubre. Una ronda = un mes
  estado                estado_ronda_inventario NOT NULL DEFAULT 'programada',
  es_linea_base         BOOLEAN     NOT NULL DEFAULT FALSE,  -- R-17/CA-22: lo CALCULA fn_ronda_abrir (Fase 2)
  abierta_en            TIMESTAMPTZ,
  abierta_por_usuario   UUID,                    -- uuid pelado, SIN FK a auth.users (precedente 096)
  abierta_por_telegram  UUID REFERENCES telegram_usuarios(id),
  cerrada_en            TIMESTAMPTZ,
  cerrada_por_usuario   UUID,
  cerrada_por_telegram  UUID REFERENCES telegram_usuarios(id),
  alcance_declarado     TEXT CHECK (alcance_declarado IN ('completo', 'parcial')),  -- A-5/R-2
  alcance_nota          TEXT,                    -- qué NO se recorrió, en palabras de Uriel
  observaciones_libres  JSONB NOT NULL DEFAULT '[]'::jsonb,  -- A-7/R-16/CA-14
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rondas_cierre_declara_alcance
    CHECK (estado <> 'cerrada' OR alcance_declarado IS NOT NULL)
);

COMMENT ON TABLE rondas_inventario IS
  'Ronda mensual de conteo físico de inventario (decisión de producto 9.9 -- '
  '"ronda de inventario", nunca "verificación"). Cabecera; el detalle del '
  'alcance vive en rondas_inventario_alcance y las excepciones reportadas en '
  'rondas_excepciones. Reemplaza en concepto a verificaciones_inventario '
  '(retirada por la migración 124), que nunca pudo cerrar el ciclo.';

-- UNA sola ronda en curso, garantizado por estructura y no por un
-- read-then-write. Un índice único sobre la columna, restringido a las filas
-- 'en_curso', admite como máximo una fila con ese valor.
CREATE UNIQUE INDEX rondas_inventario_una_en_curso
  ON rondas_inventario (estado) WHERE estado = 'en_curso';

CREATE UNIQUE INDEX rondas_inventario_periodo_unico
  ON rondas_inventario (periodo) WHERE estado <> 'omitida';

CREATE INDEX idx_rondas_inventario_estado ON rondas_inventario (estado);

DROP TRIGGER IF EXISTS update_rondas_inventario_updated_at ON rondas_inventario;
CREATE TRIGGER update_rondas_inventario_updated_at
  BEFORE UPDATE ON rondas_inventario
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- La foto fechada de R-5, que además es lo que hace computable el delta de
-- R-4 y el aviso de CA-2. Sólo la escribe fn_ronda_abrir (Fase 2) -- nada la
-- amplía después (P-3, resuelta en §15.3 del brief técnico: un producto que
-- entra a existencia > 0 durante una ronda abierta NO se agrega acá).
CREATE TABLE rondas_inventario_alcance (
  ronda_id           UUID NOT NULL REFERENCES rondas_inventario(id) ON DELETE CASCADE,
  producto_id        UUID NOT NULL REFERENCES productos(id),
  cantidad_teorica   NUMERIC NOT NULL,   -- productos.cantidad_actual AL ABRIR. Es la foto, no un dato vivo
  unidad             unidad_medida NOT NULL,
  precio_unitario    NUMERIC,            -- congelado también: irrecuperable después (lección de la 119)
  nombre_producto    TEXT NOT NULL,      -- denormalizado a propósito: un rename posterior no debe
                                         -- reescribir lo que Uriel vio en campo
  PRIMARY KEY (ronda_id, producto_id)
);

COMMENT ON TABLE rondas_inventario_alcance IS
  'Foto fechada del teórico (R-5) al momento de abrir una ronda -- '
  'cantidad_teorica/precio_unitario/nombre_producto son un SNAPSHOT, no un '
  'dato vivo (precedente: aplicaciones_compras, que nadie sabe que lo es). '
  'Sólo fn_ronda_abrir (Fase 2) escribe acá; nada la amplía tras abrir.';

-- ---------------------------------------------------------------------------
-- 3. EL CATÁLOGO DE CAUSA RAÍZ -- TABLA, NO ENUM (§4.2 del brief técnico,
--    decisión D-T2)
-- ---------------------------------------------------------------------------

CREATE TABLE inventario_causas_raiz (
  clave            TEXT PRIMARY KEY,
  etiqueta         TEXT    NOT NULL,          -- lo que ve el humano
  via              TEXT    NOT NULL CHECK (via IN ('captura_david', 'aprobacion_gerencia', 'ninguna')),
  mueve_inventario BOOLEAN NOT NULL,
  exige_nota       BOOLEAN NOT NULL DEFAULT FALSE,
  orden            INTEGER NOT NULL,
  activo           BOOLEAN NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE inventario_causas_raiz IS
  'Catálogo de causa raíz (R-7) + mapeo causa->vía (§5.3 del brief de '
  'producto) en la MISMA fila, para que RPC/cliente/prompt del intérprete no '
  'puedan discrepar (D-T2). Sembrada con exactamente 7 filas, "la lista no '
  'se cambia a la ligera" (R-7) -- sin política de escritura desde la app, '
  'cambiarla es una migración. Paridad con src/utils/rondaInventario/causasRaiz.ts '
  'verificada por src/__tests__/rondaInventarioCausasParidad.test.ts.';

-- Semilla EXACTA de R-7 + tabla de §5.3 del brief de producto. Siete filas,
-- ni una más. El orden de las columnas y de los valores es literal del
-- brief técnico §4.2.
INSERT INTO inventario_causas_raiz (clave, etiqueta, via, mueve_inventario, exige_nota, orden) VALUES
 ('movimiento_no_capturado', 'Movimiento no capturado',  'captura_david',       TRUE,  FALSE, 1),
 ('consumo_no_registrado',   'Consumo no registrado',    'captura_david',       TRUE,  FALSE, 2),
 ('error_captura_previa',    'Error de captura previa',  'captura_david',       TRUE,  FALSE, 3),
 ('perdida_o_dano',          'Pérdida o daño',           'aprobacion_gerencia', TRUE,  FALSE, 4),
 ('sustraccion',             'Sustracción',              'aprobacion_gerencia', TRUE,  FALSE, 5),
 ('error_de_conteo',         'Error de conteo',          'ninguna',             FALSE, FALSE, 6),
 ('otro',                    'Otro (con nota)',          'aprobacion_gerencia', TRUE,  TRUE,  7);

-- ---------------------------------------------------------------------------
-- 4. LOS TRANSCRITOS -- LA CAPA CRUDA DEL FLUJO DE VOZ (§4.3, CA-36/CA-37)
-- ---------------------------------------------------------------------------

CREATE TABLE rondas_transcritos (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ronda_id           UUID NOT NULL REFERENCES rondas_inventario(id) ON DELETE CASCADE,
  -- CAPA CRUDA. Literal, tal como lo devolvió el STT. Nunca se reescribe ni
  -- se "corrige": las correcciones de Uriel se acumulan aparte, en `correcciones`.
  transcrito         TEXT NOT NULL,
  correcciones       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{texto, en}] en orden
  interpretacion     JSONB,        -- la última salida cruda del modelo intérprete
  preview            JSONB,        -- el preview exacto que se le mostró a Uriel
  intentos_preview   INTEGER NOT NULL DEFAULT 1,
  estado             TEXT NOT NULL DEFAULT 'preview_pendiente'
                     CHECK (estado IN ('preview_pendiente', 'confirmado', 'sin_confirmar', 'descartado')),
  confirmado_en      TIMESTAMPTZ,
  actor_usuario_id   UUID,
  actor_telegram_id  UUID REFERENCES telegram_usuarios(id),
  duracion_audio_seg INTEGER,      -- métrica, no evidencia
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rondas_transcritos_actor
    CHECK (actor_usuario_id IS NOT NULL OR actor_telegram_id IS NOT NULL)
);

COMMENT ON TABLE rondas_transcritos IS
  'Capa cruda del pipeline de voz (CA-36): el texto que devolvió el STT, '
  'literal, nunca reescrito. El audio original NO se guarda (decisión del '
  'dueño, §11 del brief de producto) -- no hay bucket ni política de '
  'Storage para esto, a diferencia de hato-chequeo-foto.ts. '
  'estado=''sin_confirmar'' es A-10/CA-37: agotados los 3-4 intentos de '
  'preview, el transcrito sobrevive como borrador sin generar ninguna '
  'excepción. fn_ronda_cerrar (Fase 2) normaliza a ''sin_confirmar'' todo lo '
  'que quede en ''preview_pendiente'' al cerrar la ronda.';

CREATE INDEX idx_rondas_transcritos_ronda ON rondas_transcritos (ronda_id);
CREATE INDEX idx_rondas_transcritos_estado ON rondas_transcritos (estado);

-- ---------------------------------------------------------------------------
-- 5. LAS EXCEPCIONES -- Y CA-38 COMO ESTADO, NO COMO TEXTO (§4.4)
-- ---------------------------------------------------------------------------
-- Punto más delicado del brief de producto. La solución tiene TRES capas y
-- ninguna es un comentario: (1) el ENUM estado_excepcion_inventario de
-- arriba con 'explicacion_precargada' como paso intermedio obligatorio;
-- (2) dos columnas separadas para "lo que Uriel citó" vs. "lo que David
-- dijo" (explicacion_citada / explicacion_david), nunca una sola columna con
-- una bandera -- así la cita y la palabra pueden coexistir y compararse, y
-- ninguna sobrescribe a la otra; (3) el CONSTRAINT
-- excepcion_avanza_solo_con_david, que hace que un estado más avanzado sea
-- IMPOSIBLE de escribir sin el sello de David -- es la única mitigación de
-- las tres que sobrevive a un PR descuidado.

CREATE TABLE rondas_excepciones (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ronda_id            UUID NOT NULL REFERENCES rondas_inventario(id) ON DELETE RESTRICT,
  transcrito_id       UUID REFERENCES rondas_transcritos(id),   -- de qué narración nació
  producto_id         UUID NOT NULL REFERENCES productos(id),   -- NOT NULL: CA-32 lo exige
  estado              estado_excepcion_inventario NOT NULL DEFAULT 'reportada',

  -- ── LO QUE URIEL REPORTÓ ────────────────────────────────────────────────
  cantidad_fisica     NUMERIC NOT NULL,
  fisico_origen       TEXT NOT NULL CHECK (fisico_origen IN ('dictado', 'derivado')),  -- R-19/CA-31
  teorico_conteo      NUMERIC NOT NULL,   -- copia de rondas_inventario_alcance. NUNCA de lo que dijo Uriel
  observacion_uriel   TEXT,
  reportada_en        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reportada_por_usuario  UUID,
  reportada_por_telegram UUID REFERENCES telegram_usuarios(id),

  -- ── CA-38: DOS COLUMNAS, NO UNA ─────────────────────────────────────────
  -- Lo que Uriel citó del audio. Es una CITA. Vive acá y no se mueve nunca.
  explicacion_citada        TEXT,
  -- Lo que David dijo. Vive en OTRA columna. Que la cita se convierta en la
  -- palabra de David no es una sobrescritura: es un INSERT en una columna
  -- distinta, hecho por un actor distinto, con su propio sello de tiempo.
  explicacion_david         TEXT,
  explicacion_david_accion  TEXT CHECK (explicacion_david_accion IN
                              ('confirmo_cita', 'corrigio_cita', 'explico_directo')),
  explicacion_david_en      TIMESTAMPTZ,
  explicacion_david_usuario UUID,
  explicacion_david_telegram UUID REFERENCES telegram_usuarios(id),

  -- ── VÍA (a): captura con respaldo -- CA-8 ────────────────────────────────
  captura_movimiento_id UUID REFERENCES movimientos_inventario(id),
  captura_en            TIMESTAMPTZ,
  captura_por_usuario   UUID,
  captura_por_telegram  UUID REFERENCES telegram_usuarios(id),

  -- ── VÍA (b): propuesta / aprobación / aplicación -- CA-9, CA-11, CA-12 ───
  propuesta_delta       NUMERIC,
  propuesta_causa       TEXT REFERENCES inventario_causas_raiz(clave),
  propuesta_nota        TEXT,
  propuesta_en          TIMESTAMPTZ,
  propuesta_por_usuario UUID,
  propuesta_por_telegram UUID REFERENCES telegram_usuarios(id),
  decision_causa        TEXT REFERENCES inventario_causas_raiz(clave),  -- CA-11: la de Santiago manda
  decision_nota         TEXT,
  decision_en           TIMESTAMPTZ,
  decision_por_usuario  UUID,
  decision_por_telegram UUID REFERENCES telegram_usuarios(id),
  aplicacion_movimiento_id UUID REFERENCES movimientos_inventario(id),
  aplicacion_en         TIMESTAMPTZ,
  aplicacion_por_usuario UUID,
  aplicacion_por_telegram UUID REFERENCES telegram_usuarios(id),

  -- ── vía derivada del catálogo, NUNCA del modelo (CA-34) ─────────────────
  via_propuesta         TEXT NOT NULL CHECK (via_propuesta IN
                          ('captura_david', 'aprobacion_gerencia', 'ninguna')),
  causa_sugerida        TEXT REFERENCES inventario_causas_raiz(clave),  -- del intérprete, sin valor de firma
  interprete_confianza  TEXT NOT NULL CHECK (interprete_confianza IN ('alta', 'baja', 'ninguna')),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ═══ LAS CINCO GUARDAS QUE SOSTIENEN EL CONTROL ═══════════════════════════

  -- (1) CA-38. Ningún estado más allá de `explicacion_precargada` es
  --     alcanzable sin que David haya tocado. La cita NO habilita ninguna vía.
  CONSTRAINT excepcion_avanza_solo_con_david CHECK (
    estado IN ('reportada', 'explicacion_precargada')
    OR explicacion_david_en IS NOT NULL
  ),

  -- (2) CA-9. Nada se aplica sin decisión, y ninguna decisión sin causa (CA-11).
  CONSTRAINT excepcion_aplicada_exige_decision CHECK (
    estado <> 'ajuste_aplicado'
    OR (decision_en IS NOT NULL AND decision_causa IS NOT NULL
        AND aplicacion_movimiento_id IS NOT NULL)
  ),
  CONSTRAINT excepcion_aprobada_exige_causa CHECK (
    estado NOT IN ('ajuste_aprobado', 'ajuste_aplicado') OR decision_causa IS NOT NULL
  ),

  -- (3) CA-8. La captura directa NO es un ajuste, y no es opaca.
  CONSTRAINT excepcion_captura_completa CHECK (
    estado <> 'resuelta_con_captura'
    OR (captura_movimiento_id IS NOT NULL AND captura_en IS NOT NULL
        AND (captura_por_usuario IS NOT NULL OR captura_por_telegram IS NOT NULL))
  ),

  -- CA-12: nunca sin actor, en ninguno de los dos caminos.
  CONSTRAINT excepcion_reportante CHECK (
    reportada_por_usuario IS NOT NULL OR reportada_por_telegram IS NOT NULL
  )
);

COMMENT ON TABLE rondas_excepciones IS
  'Una fila por hallazgo reportado en una ronda (R-2/CA-15: NUNCA una fila '
  'por producto conforme). Tres desenlaces terminales distintos y '
  'distinguibles (CA-10): cerrada_sin_ajuste, resuelta_con_captura (vía a, '
  'CA-8), ajuste_aplicado/ajuste_desestimado (vía b, CA-9/CA-11). CA-38 '
  '(R-6) se sostiene con el CONSTRAINT excepcion_avanza_solo_con_david: una '
  'cita de Uriel (explicacion_citada) nunca puede convertirse en la palabra '
  'de David (explicacion_david) por sobrescritura, porque viven en columnas '
  'distintas, y ningún estado posterior a explicacion_precargada es '
  'alcanzable sin explicacion_david_en IS NOT NULL.';

CREATE INDEX idx_rondas_excepciones_ronda ON rondas_excepciones (ronda_id);
CREATE INDEX idx_rondas_excepciones_producto ON rondas_excepciones (producto_id);
CREATE INDEX idx_rondas_excepciones_estado ON rondas_excepciones (estado);
CREATE INDEX idx_rondas_excepciones_transcrito ON rondas_excepciones (transcrito_id);

DROP TRIGGER IF EXISTS update_rondas_excepciones_updated_at ON rondas_excepciones;
CREATE TRIGGER update_rondas_excepciones_updated_at
  BEFORE UPDATE ON rondas_excepciones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 6. REPORTE CONGELADO Y AVISOS IDEMPOTENTES (§4.5)
-- ---------------------------------------------------------------------------

CREATE TABLE rondas_reportes (              -- R-10 / CA-18
  ronda_id       UUID PRIMARY KEY REFERENCES rondas_inventario(id) ON DELETE CASCADE,
  emitido_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  contenido      JSONB NOT NULL,   -- las cifras, ya resueltas. NO se recalcula jamás
  texto_telegram TEXT  NOT NULL,   -- lo que se envió, literal
  incluye_valoracion BOOLEAN NOT NULL   -- CA-20: si el saneamiento de §11 no está firmado, FALSE
);

COMMENT ON TABLE rondas_reportes IS
  'Reporte de cierre de una ronda (C-1/CA-19), congelado al emitirse (R-10): '
  'se serializa entero y de ahí se lee siempre, nunca se recalcula (misma '
  'lección que la migración 122). Sólo lo escribe fn_ronda_emitir_reporte '
  '(Fase 2) vía service_role -- ninguna sesión de navegador escribe acá.';

CREATE TABLE rondas_avisos (                -- CA-24: una sola vez por mes omitido
  clave      TEXT PRIMARY KEY,     -- 'mes_omitido:2026-09' | 'recordatorio:2026-09'
  ronda_id   UUID REFERENCES rondas_inventario(id),
  enviado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detalle    JSONB
);

COMMENT ON TABLE rondas_avisos IS
  'Idempotencia del tick diario (§8.1 del brief técnico), mismo mecanismo '
  'que hato_alertas.regla_clave (056): INSERT ... ON CONFLICT DO NOTHING '
  'sobre `clave` hace que el tick sea seguro de correr dos veces. Sólo lo '
  'escribe el endpoint del tick (Fase 5) vía service_role.';

CREATE TABLE inventario_parametros (        -- precedente 052/058
  clave TEXT PRIMARY KEY,
  valor JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO inventario_parametros (clave, valor)
VALUES ('valoracion_publicable', 'false'::jsonb);

COMMENT ON TABLE inventario_parametros IS
  'Parámetros clave/valor del módulo (precedente fin_parametros/hato_config). '
  'valoracion_publicable en false por defecto: CA-20 se cumple por '
  'construcción -- el reporte de cierre no publica valor total de inventario '
  'ni variación mensual hasta que Gerencia lo active tras el saneamiento de '
  'productos.precio_unitario (§11 del brief técnico, migración 129 -- '
  'trabajo de otra sesión, sin relación con ésta).';

DROP TRIGGER IF EXISTS update_inventario_parametros_updated_at ON inventario_parametros;
CREATE TRIGGER update_inventario_parametros_updated_at
  BEFORE UPDATE ON inventario_parametros
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 7. RLS (§4.6) -- patrón 044 con dos ajustes explicados en el brief técnico
-- ---------------------------------------------------------------------------
-- Grupo A -- rondas_inventario, rondas_inventario_alcance, rondas_excepciones,
--   rondas_transcritos: SELECT authenticated; INSERT/UPDATE Administrador +
--   Gerencia (dos políticas separadas, NUNCA `FOR ALL` -- eso incluiría
--   DELETE); DELETE SIN política, a propósito (ver el comentario largo más
--   abajo). Predicado envuelto `(SELECT get_user_role())` (precedente 093).
--
-- Grupo B -- rondas_reportes, rondas_avisos: SELECT Gerencia-only (llevan
--   valoración); ninguna política de escritura -- sólo `service_role` (que
--   bypassa RLS) escribe, desde el tick/los RPC de una fase posterior.
--
-- Grupo C -- inventario_causas_raiz: SELECT authenticated; NINGUNA política
--   de escritura (D-T2: "la lista no se cambia a la ligera" es una migración,
--   no un permiso de app).
--
-- Grupo D -- inventario_parametros: SELECT authenticated; INSERT/UPDATE
--   Gerencia-only (precedente 052 fin_parametros); DELETE sin política.
--
-- DELETE sin política, a propósito, en las 4 tablas del Grupo A: ninguna de
-- estas 8 tablas tiene historial de cambios -- la 113 (globalgap_correcciones)
-- cubre aplicaciones*/movimientos_diarios*, la 084 el hato, y logs_auditoria
-- nunca recibió una fila. Un borrado acá no dejaría rastro. Lo que la ronda
-- registra es evidencia de un control interno; una excepción YA EXPLICADA
-- que resultó equivocada se cierra como error_de_conteo, no se borra.
-- Precedente directo: la 120 razona lo mismo para monitoreos. La ÚNICA
-- excepción prevista es el Deshacer de P-1 (fn_ronda_deshacer_confirmacion,
-- Fase 2/§6.5 del brief técnico), que borra filas de rondas_excepciones
-- dentro de una ventana muy acotada -- pero ese RPC es SECURITY INVOKER y
-- sólo funciona por el camino de Telegram, donde service_role bypassa la
-- RLS; no lleva política DELETE porque no la necesita. Si algún día se
-- quiere un Deshacer desde la web, hace falta agregar una política DELETE
-- aparte -- decisión explícita, no un descuido de esta migración.
--
-- REVOKE ALL ... FROM anon en las OCHO tablas (literal del brief técnico):
-- no como segunda capa decorativa -- la 081 midió que Supabase concede
-- ALL...TO anon por defecto en `public`, y la 120 encontró anon con DELETE
-- directo sobre ocho tablas de monitoreo por esa vía. El REVOKE es la mitad
-- que más pesa, no una decoración.

-- ── Grupo A ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['rondas_inventario', 'rondas_inventario_alcance', 'rondas_excepciones', 'rondas_transcritos']
  LOOP
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

    -- Ninguna política DELETE para estas 4 tablas -- ver el comentario largo
    -- de arriba. REVOKE explícito de DELETE/TRUNCATE desde `authenticated`
    -- además de la ausencia de política: refuerza la intención de forma
    -- auditable por el linter de Supabase (misma lógica que el REVOKE de la
    -- 124 sobre verificaciones_inventario/verificaciones_detalle).
    EXECUTE format('REVOKE DELETE, TRUNCATE ON %I FROM authenticated', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
  END LOOP;
END $$;

-- ── Grupo B ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['rondas_reportes', 'rondas_avisos'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_select_gerencia" ON %I', t, t);
    EXECUTE format($pol$
      CREATE POLICY "%s_select_gerencia" ON %I
        FOR SELECT TO authenticated
        USING ((SELECT public.es_usuario_gerencia()))
    $pol$, t, t);

    -- Ninguna política de escritura: sólo service_role (RPC/tick de una
    -- fase posterior) escribe acá. REVOKE explícito de INSERT/UPDATE/DELETE/
    -- TRUNCATE desde `authenticated` (SELECT se conserva, gateado por la
    -- política de arriba) y de todo desde `anon`.
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %I FROM authenticated', t);
    EXECUTE format('REVOKE ALL ON %I FROM anon', t);
  END LOOP;
END $$;

-- ── Grupo C -- inventario_causas_raiz ───────────────────────────────────
ALTER TABLE inventario_causas_raiz ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventario_causas_raiz_select_authenticated" ON inventario_causas_raiz;
CREATE POLICY "inventario_causas_raiz_select_authenticated" ON inventario_causas_raiz
  FOR SELECT TO authenticated
  USING (TRUE);

-- Ninguna política de escritura -- D-T2: "cambiarla es una migración".
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON inventario_causas_raiz FROM authenticated;
REVOKE ALL ON inventario_causas_raiz FROM anon;

-- ── Grupo D -- inventario_parametros ────────────────────────────────────
ALTER TABLE inventario_parametros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventario_parametros_select_authenticated" ON inventario_parametros;
CREATE POLICY "inventario_parametros_select_authenticated" ON inventario_parametros
  FOR SELECT TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "inventario_parametros_insert_gerencia" ON inventario_parametros;
CREATE POLICY "inventario_parametros_insert_gerencia" ON inventario_parametros
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.es_usuario_gerencia()));

DROP POLICY IF EXISTS "inventario_parametros_update_gerencia" ON inventario_parametros;
CREATE POLICY "inventario_parametros_update_gerencia" ON inventario_parametros
  FOR UPDATE TO authenticated
  USING ((SELECT public.es_usuario_gerencia()))
  WITH CHECK ((SELECT public.es_usuario_gerencia()));

-- Sin política DELETE (brief técnico §4.6: "DELETE: nadie" para esta tabla).
REVOKE DELETE, TRUNCATE ON inventario_parametros FROM authenticated;
REVOKE ALL ON inventario_parametros FROM anon;

-- ---------------------------------------------------------------------------
-- 8. POSTCONDICIONES
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tabla TEXT;
  v_causas INTEGER;
  v_via_captura INTEGER;
  v_via_gerencia INTEGER;
  v_via_ninguna INTEGER;
  v_parametros INTEGER;
  v_valor_publicable JSONB;
  v_idx_en_curso TEXT;
  v_idx_periodo TEXT;
  v_check_count INTEGER;
  v_rls BOOLEAN;
  v_policies_delete INTEGER;
BEGIN
  -- 8.1 Las 8 tablas existen ahora.
  FOREACH v_tabla IN ARRAY ARRAY[
    'rondas_inventario', 'rondas_inventario_alcance', 'inventario_causas_raiz',
    'rondas_transcritos', 'rondas_excepciones', 'rondas_reportes',
    'rondas_avisos', 'inventario_parametros'
  ] LOOP
    IF to_regclass('public.' || v_tabla) IS NULL THEN
      RAISE EXCEPTION '125 ABORTADA (post): public.% no quedó creada.', v_tabla;
    END IF;

    -- RLS habilitada en las 8.
    SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = to_regclass('public.' || v_tabla);
    IF NOT v_rls THEN
      RAISE EXCEPTION '125 ABORTADA (post): public.% no tiene RLS habilitada.', v_tabla;
    END IF;

    -- anon no conserva NINGÚN privilegio en ninguna de las 8 (literal del brief).
    IF has_table_privilege('anon', 'public.' || v_tabla, 'SELECT')
       OR has_table_privilege('anon', 'public.' || v_tabla, 'INSERT')
       OR has_table_privilege('anon', 'public.' || v_tabla, 'UPDATE')
       OR has_table_privilege('anon', 'public.' || v_tabla, 'DELETE')
       OR has_table_privilege('anon', 'public.' || v_tabla, 'TRUNCATE') THEN
      RAISE EXCEPTION '125 ABORTADA (post): `anon` conserva algún privilegio sobre public.%. El REVOKE ALL ... FROM anon no se completó.', v_tabla;
    END IF;
  END LOOP;

  -- 8.2 Los 2 ENUM existen.
  IF to_regtype('public.estado_ronda_inventario') IS NULL THEN
    RAISE EXCEPTION '125 ABORTADA (post): estado_ronda_inventario no quedó creado.';
  END IF;
  IF to_regtype('public.estado_excepcion_inventario') IS NULL THEN
    RAISE EXCEPTION '125 ABORTADA (post): estado_excepcion_inventario no quedó creado.';
  END IF;

  -- 8.3 inventario_causas_raiz: exactamente 7 filas, y el mapeo causa->vía
  --     coincide EXACTO con la tabla de §5.3 del brief de producto (3 vía
  --     captura_david que mueven inventario, 3 vía aprobacion_gerencia que
  --     mueven inventario -- incluye 'otro' por R-18 -- , 1 vía ninguna que
  --     NO mueve inventario).
  SELECT count(*) INTO v_causas FROM inventario_causas_raiz;
  IF v_causas <> 7 THEN
    RAISE EXCEPTION '125 ABORTADA (post): inventario_causas_raiz tiene % filas, se esperaban exactamente 7.', v_causas;
  END IF;

  SELECT count(*) INTO v_via_captura FROM inventario_causas_raiz WHERE via = 'captura_david' AND mueve_inventario;
  IF v_via_captura <> 3 THEN
    RAISE EXCEPTION '125 ABORTADA (post): se esperaban 3 causas vía captura_david (mueve_inventario=true), hay %.', v_via_captura;
  END IF;

  SELECT count(*) INTO v_via_gerencia FROM inventario_causas_raiz WHERE via = 'aprobacion_gerencia' AND mueve_inventario;
  IF v_via_gerencia <> 3 THEN
    RAISE EXCEPTION '125 ABORTADA (post): se esperaban 3 causas vía aprobacion_gerencia (mueve_inventario=true, incluye "otro" por R-18), hay %.', v_via_gerencia;
  END IF;

  SELECT count(*) INTO v_via_ninguna FROM inventario_causas_raiz WHERE via = 'ninguna' AND NOT mueve_inventario;
  IF v_via_ninguna <> 1 THEN
    RAISE EXCEPTION '125 ABORTADA (post): se esperaba exactamente 1 causa vía ninguna que NO mueva inventario (error_de_conteo), hay %.', v_via_ninguna;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM inventario_causas_raiz WHERE clave = 'otro' AND via = 'aprobacion_gerencia' AND exige_nota) THEN
    RAISE EXCEPTION '125 ABORTADA (post): la causa "otro" no quedó con via=aprobacion_gerencia y exige_nota=true (R-18).';
  END IF;

  -- 8.4 inventario_parametros: exactamente 1 fila, valoracion_publicable=false.
  SELECT count(*) INTO v_parametros FROM inventario_parametros;
  IF v_parametros <> 1 THEN
    RAISE EXCEPTION '125 ABORTADA (post): inventario_parametros tiene % filas, se esperaba exactamente 1 (valoracion_publicable).', v_parametros;
  END IF;
  SELECT valor INTO v_valor_publicable FROM inventario_parametros WHERE clave = 'valoracion_publicable';
  IF v_valor_publicable IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION '125 ABORTADA (post): valoracion_publicable quedó en %, se esperaba false. CA-20 exige que el reporte NO publique valoración hasta que Gerencia lo firme explícitamente.', v_valor_publicable;
  END IF;

  -- 8.5 Los 2 índices únicos parciales existen con la forma esperada.
  SELECT indexdef INTO v_idx_en_curso FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'rondas_inventario_una_en_curso';
  IF v_idx_en_curso IS NULL OR v_idx_en_curso NOT LIKE '%UNIQUE INDEX%' OR v_idx_en_curso NOT LIKE '%en_curso%' THEN
    RAISE EXCEPTION '125 ABORTADA (post): rondas_inventario_una_en_curso no quedó como índice único parcial sobre estado=''en_curso''. Definición: %', COALESCE(v_idx_en_curso, '<no existe>');
  END IF;

  SELECT indexdef INTO v_idx_periodo FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'rondas_inventario_periodo_unico';
  IF v_idx_periodo IS NULL OR v_idx_periodo NOT LIKE '%UNIQUE INDEX%' OR v_idx_periodo NOT LIKE '%periodo%' THEN
    RAISE EXCEPTION '125 ABORTADA (post): rondas_inventario_periodo_unico no quedó como índice único parcial sobre periodo. Definición: %', COALESCE(v_idx_periodo, '<no existe>');
  END IF;

  -- 8.6 Las 5 guardas de rondas_excepciones existen por nombre (CA-38 y
  --     compañía -- ver el comentario largo de la sección 5).
  SELECT count(*) INTO v_check_count FROM pg_constraint
   WHERE conrelid = 'public.rondas_excepciones'::regclass
     AND conname IN (
       'excepcion_avanza_solo_con_david', 'excepcion_aplicada_exige_decision',
       'excepcion_aprobada_exige_causa', 'excepcion_captura_completa', 'excepcion_reportante'
     );
  IF v_check_count <> 5 THEN
    RAISE EXCEPTION '125 ABORTADA (post): rondas_excepciones tiene % de las 5 guardas nombradas esperadas (CA-38 y compañía). Revisar -- ésta es la parte más delicada del esquema.', v_check_count;
  END IF;

  -- 8.7 Ninguna política DELETE en el Grupo A (rondas_inventario/_alcance/
  --     _excepciones/_transcritos) -- "DELETE sin política, a propósito".
  FOREACH v_tabla IN ARRAY ARRAY['rondas_inventario', 'rondas_inventario_alcance', 'rondas_excepciones', 'rondas_transcritos']
  LOOP
    SELECT count(*) INTO v_policies_delete FROM pg_policies
     WHERE schemaname = 'public' AND tablename = v_tabla AND cmd = 'DELETE';
    IF v_policies_delete <> 0 THEN
      RAISE EXCEPTION '125 ABORTADA (post): public.% tiene % política(s) DELETE; se esperaban 0 -- ninguna de las 8 tablas de este módulo tiene historial de cambios, un borrado no debe ser posible desde la app.', v_tabla, v_policies_delete;
    END IF;
  END LOOP;

  -- 8.8 Tampoco hay política DELETE en inventario_parametros (Grupo D).
  SELECT count(*) INTO v_policies_delete FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'inventario_parametros' AND cmd = 'DELETE';
  IF v_policies_delete <> 0 THEN
    RAISE EXCEPTION '125 ABORTADA (post): inventario_parametros tiene % política(s) DELETE; se esperaban 0.', v_policies_delete;
  END IF;

  -- 8.9 Ni rondas_reportes ni rondas_avisos ni inventario_causas_raiz tienen
  --     NINGUNA política de escritura para `authenticated`.
  FOREACH v_tabla IN ARRAY ARRAY['rondas_reportes', 'rondas_avisos', 'inventario_causas_raiz'] LOOP
    IF has_table_privilege('authenticated', 'public.' || v_tabla, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || v_tabla, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || v_tabla, 'DELETE')
       OR has_table_privilege('authenticated', 'public.' || v_tabla, 'TRUNCATE') THEN
      RAISE EXCEPTION '125 ABORTADA (post): `authenticated` conserva algún privilegio de escritura sobre public.%; se esperaba ninguno (sólo service_role escribe acá).', v_tabla;
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.' || v_tabla, 'SELECT') THEN
      RAISE EXCEPTION '125 ABORTADA (post): `authenticated` perdió SELECT sobre public.% -- no debía tocarse (la RLS, no el GRANT, es lo que restringe la lectura de rondas_reportes/rondas_avisos a Gerencia).', v_tabla;
    END IF;
  END LOOP;

  RAISE NOTICE '125 OK: 8 tablas creadas, 2 tipos, 7 causas raíz sembradas (3 captura_david / 3 aprobacion_gerencia / 1 ninguna), inventario_parametros con valoracion_publicable=false, 2 índices únicos parciales, RLS habilitada en las 8 con anon sin ningún privilegio, 0 políticas DELETE en las 5 tablas que no deben tenerlas, 5 guardas CHECK en rondas_excepciones.';
END $$;

-- ===========================================================================
-- ROLLBACK (ejecutable). Sin historia que preservar: las 8 tablas son NUEVAS
-- en esta migración (precedente 096) -- un DROP directo no pierde nada que
-- una re-aplicación de este archivo no pueda reconstruir, siempre que
-- ninguna migración/RPC de una fase posterior (126+) ya haya escrito filas.
-- Verificar eso ANTES de correr esto -- si ya hay rondas reales, este
-- rollback las destruye sin respaldo, y este archivo no es el que decide si
-- eso es aceptable.
-- ===========================================================================
--   DROP TABLE IF EXISTS rondas_excepciones;
--   DROP TABLE IF EXISTS rondas_transcritos;
--   DROP TABLE IF EXISTS rondas_reportes;
--   DROP TABLE IF EXISTS rondas_avisos;
--   DROP TABLE IF EXISTS rondas_inventario_alcance;
--   DROP TABLE IF EXISTS inventario_causas_raiz;
--   DROP TABLE IF EXISTS inventario_parametros;
--   DROP TABLE IF EXISTS rondas_inventario;
--   DROP TYPE IF EXISTS estado_excepcion_inventario;
--   DROP TYPE IF EXISTS estado_ronda_inventario;
-- ===========================================================================
