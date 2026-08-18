-- =============================================================================
-- RENUMERADA 097 -> 101 el 2026-08-17.
-- APLICADA A PRODUCCION ese mismo dia, cuando el archivo se llamaba 097. El
-- numero cambio despues, al integrar con `main`: una sesion paralela habia
-- ocupado 097-100 con la reorganizacion del modulo de ganado (fincas, lotes,
-- grupos), y `hatoSchemaContract.test.ts` guarda contra prefijos duplicados.
-- Se renumero ESTE archivo y no aquellos porque aquellos son un bloque
-- contiguo ya en main y estos son dos sueltos.
-- No la vuelvas a aplicar: las cuatro tablas ya existen (verificado contra
-- information_schema el 2026-08-17). Mismo criterio que 067 y 079.
-- =============================================================================
-- =====================================================================
-- 097: Motor de acciones recomendadas (bloque 4 del Centro de Control).
-- Fecha: 2026-08-17
-- Fuente: docs/brief_tecnico_motor_acciones.md §5 (revisión 3) +
--         docs/set_referencia_acciones.md ("Cadencias declaradas").
--
-- QUÉ CREA
--   1. acciones_corridas       -- una fila por ejecución del tick diario.
--                                 Guarda el PAQUETE CERRADO que se le dio
--                                 al modelo y su SALIDA CRUDA. Es la
--                                 auditoría: sin esto no se puede contestar
--                                 "¿de dónde salió esta recomendación?" ni
--                                 evaluar el motor entre versiones.
--   2. acciones_recomendadas   -- una fila por acción publicada, con su
--                                 plantilla, sus ranuras (REFERENCIAS a
--                                 hechos, nunca valores) y su descarte.
--   3. acciones_silencios      -- el descarte ("No es útil"), colgado de
--                                 la CLAVE ESTABLE (regla + negocio), NO de
--                                 la fila de la corrida. `acciones_recomendadas`
--                                 se regenera entera cada madrugada; si el
--                                 descarte colgara de esa fila, "No es útil"
--                                 se perdería cada corrida. Es la corrección
--                                 de la revisión 2 del brief (§5.2).
--   4. revisiones_periodicas   -- el catálogo de cadencias de O-8 (§3.3 ter
--                                 del brief): revisiones que vencen por
--                                 reloj, no por umbral cruzado. Sembrada con
--                                 las 4 filas que el dueño declaró el
--                                 2026-08-17 (docs/set_referencia_acciones.md).
--
-- POR QUÉ EL DESCARTE NO CUELGA DE `alertas_catalogo` (096): esa tabla es
-- un catálogo de TIPOS de alerta (`clave = modulo.tipo`) para resolver
-- suscripciones de Telegram; las INSTANCIAS viven en `hato_alertas`, que
-- es por módulo. Una acción recomendada es una instancia y cruza tres
-- negocios, así que no hay nada de qué colgarla. De 096 se hereda el
-- PATRÓN (RLS, revokes, predicados envueltos), no la tabla. Arbitraje
-- completo en el brief, §5.4.
--
-- RLS -- patrón 044 (SELECT authenticated / escritura Administrador+
-- Gerencia) con dos ajustes deliberados:
--   - `acciones_recomendadas`: SELECT abierto a `authenticated`. La
--     visibilidad por módulo (`modulos_acceso`) NO es una frontera de
--     datos en este proyecto (migración 049) y se aplica en la app, como
--     en el resto del tablero. El paquete v1 NO CONTIENE NINGUNA CIFRA
--     `fin_*` -- por eso no hace falta partir la política por rol. Si
--     algún día entran finanzas, hace falta una columna `visibilidad` y
--     una política Gerencia-only; está anotado en el brief.
--   - UPDATE (el descarte y el marcado de caducidad) para Administrador+
--     Gerencia, columnas gobernadas por el propio predicado -- ver 073:
--     un GRANT de tabla completa sobre una tabla que también guarda la
--     plantilla permitiría reescribir el texto publicado. Por eso el
--     GRANT es POR COLUMNA.
--   - INSERT/DELETE: NINGUNA política para `authenticated`. Sólo escribe
--     el `service_role` desde el tick.
--
-- Trampa 081: Supabase concede ALL a anon/authenticated por defecto en
-- tablas nuevas de `public` (ALTER DEFAULT PRIVILEGES). Los REVOKE de
-- abajo son carga útil, no decoración.
-- Trampa 082: ninguna función nueva SECURITY DEFINER aquí. La única
-- función es el trigger de `updated_at`, que ya existe (verificada
-- contra `src/sql/migrations/add_contractor_support.sql` y su uso en
-- 034/084/096 -- no se vuelve a crear).
-- Predicados envueltos `(SELECT auth.uid())` -- 077/093.
--
-- VERIFICACIÓN CONTRA EL ESQUEMA VIVO antes de escribir esta migración:
--   - 097 es el siguiente número libre: `ls src/sql/migrations/` llega a
--     096 y `git log --all --diff-filter=A` no devuelve nada >=097 en
--     ninguna rama.
--   - `usuarios.rol` es del enum `rol_usuario` ('Administrador' |
--     'Verificador' | 'Gerencia') -- confirmado en src/types/database.ts
--     y en el `CREATE TYPE` de las migraciones que lo usan (053/082/096).
--   - `update_updated_at_column()` existe desde `add_contractor_support.sql`
--     y la reusan 034/084/096 -- no hace falta CREATE OR REPLACE aquí.
--   - `hato_chequeos` (053) y `fin_presupuestos` (034) existen -- se citan
--     sólo en comentarios (el `evento_selector`/`destino_id` de abajo son
--     TEXT libres, resueltos por código TypeScript, nunca FKs) pero se
--     verificó que no son ficticias antes de documentarlas.
--   - `compras_productos` y `aplicaciones_lotes_compras`, que CLAUDE.md
--     documenta pero que NO aparecen en `src/types/database.ts`: esta
--     migración NO las referencia (ninguna FK, ninguna columna). Esa
--     guarda (A-7(i) del hecho `agu.insumo_faltante`) es lógica de la
--     Fase 1 del edge function, no de este esquema. Dato para esa fase,
--     no corrección de este archivo: `src/types/database.ts` está
--     desactualizado de forma amplia -- ni un solo `hato_*` (15 tablas
--     documentadas en CLAUDE.md desde 2026-07-22) ni `fin_presupuestos`
--     (034) aparecen en él tampoco, así que su ausencia no prueba que la
--     tabla no exista, sólo que el generador de tipos no ha corrido desde
--     antes de esas migraciones. Confirmar contra `information_schema`
--     en vivo (no contra este archivo generado) sigue siendo el paso
--     obligatorio antes de construir esa guarda.
--   - No existe ninguna tabla `acciones*` previa (`grep` limpio en
--     migraciones y en `database.ts`): sin colisión de nombres.
--
-- NO SE APLICA por la sesión que la escribe: la aplica el orquestador con
-- el conector autenticado (mismo criterio que 086/091/095/096).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. acciones_corridas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acciones_corridas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generado_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Fecha Bogotá de referencia del paquete (obtenerFechaHoy() del lado
  -- del handler, convertida a America/Bogota -- NO la fecha UTC).
  fecha_referencia  DATE NOT NULL,
  disparo           TEXT NOT NULL CHECK (disparo IN ('cron', 'manual')),
  estado            TEXT NOT NULL CHECK (estado IN ('ok', 'parcial', 'fallo')),
  modelo            TEXT,
  tokens_prompt     INTEGER,
  tokens_completion INTEGER,
  -- Costo REAL reportado por OpenRouter, no estimado. Se guarda para que
  -- la cifra del brief se pueda medir en vez de creer.
  costo_usd         NUMERIC(10,6),
  duracion_ms       INTEGER,
  -- El paquete cerrado completo, tal cual se le dio al modelo.
  paquete           JSONB NOT NULL,
  -- La salida cruda del modelo, antes de validar.
  salida_cruda      JSONB,
  -- Rechazos del validador: [{codigo, accion_indice, detalle}].
  rechazos          JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Estado de la ingesta de Notion: 'ok'|'sin_reuniones_recientes'|'no_disponible'.
  contexto_comite   TEXT,
  error             TEXT
);

CREATE INDEX IF NOT EXISTS idx_acciones_corridas_generado
  ON acciones_corridas (generado_at DESC);

-- ---------------------------------------------------------------------
-- 2. acciones_recomendadas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acciones_recomendadas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  corrida_id    UUID NOT NULL REFERENCES acciones_corridas(id) ON DELETE CASCADE,
  negocio       TEXT NOT NULL CHECK (negocio IN ('hato_lechero', 'aguacate', 'ganado')),

  -- IDENTIDAD ESTABLE (§2.4 del plan del CPO). '<negocio>.<regla>'. NO es
  -- única en esta tabla -- se repite una vez por corrida; lo que es único
  -- por corrida es (corrida_id, clave). Es la columna por la que se
  -- silencia: ver `acciones_silencios`. Los objetos afectados son la CARGA
  -- de la acción, no su identidad, así que la clave NO incorpora ni el N ni
  -- los nombres -- si mañana son 9 vacas en vez de 11 sigue siendo la misma
  -- acción y el silencio debe seguir aplicando.
  clave         TEXT NOT NULL,
  -- 'O1_senal' | 'O2_hueco' | 'O8_revision'. Sin CHECK a propósito: la
  -- taxonomía crece (O-4/O-5 son v1.1) y un CHECK obligaría a una migración
  -- por cada origen nuevo. El tipo vive en TypeScript, que es donde se usa.
  origen        TEXT NOT NULL,
  -- Heredada del destino. La fila NUNCA contiene un importe (§3.4); esto
  -- sólo gobierna a quién se le pinta.
  visibilidad   TEXT NOT NULL DEFAULT 'todos' CHECK (visibilidad IN ('todos', 'gerencia')),
  -- Calculado por `ordenarAcciones` (§4.6), NO elegido por el modelo.
  orden         SMALLINT NOT NULL CHECK (orden BETWEEN 1 AND 3),

  -- Texto con ranuras `{clave}`. NUNCA lleva cifras: el validador lo
  -- garantizó antes del INSERT (códigos CIFRA_LIBRE / NUMERAL_EN_LETRA).
  plantilla     TEXT NOT NULL,
  -- {"n": {"hecho_id": "...", "campo": "cantidad"}} -- REFERENCIAS.
  ranuras       JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Los hechos citados, en orden. La evidencia visible se renderiza desde
  -- `hechos_snapshot`, jamás desde el texto del modelo.
  hecho_ids     TEXT[] NOT NULL CHECK (cardinality(hecho_ids) BETWEEN 1 AND 3),
  -- Copia congelada de los `Hecho` citados (texto, valores, fuente,
  -- fecha, confianza, cotejo). Se guarda AQUÍ y no sólo en el paquete de
  -- la corrida para que pintar una acción sea UNA lectura, no dos, y para
  -- que la evidencia publicada sea inmutable aunque el paquete se pode.
  hechos_snapshot JSONB NOT NULL,
  destino_id    TEXT NOT NULL,
  destino_ruta  TEXT NOT NULL,
  destino_etiqueta TEXT NOT NULL,

  -- Se marca cuando el cotejo al pintar la invalida (§6.4) o cuando el hecho
  -- dejó de existir. Es SEÑAL, no estado -- el descarte vive en
  -- `acciones_silencios`, porque tiene que sobrevivir a la regeneración.
  caducada_at    TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT acciones_recomendadas_orden_unico UNIQUE (corrida_id, negocio, orden),
  -- Una regla produce a lo sumo UNA acción por corrida. Sin esto, el modelo
  -- puede gastar las tres ranuras del negocio en tres redacciones del mismo
  -- hecho.
  CONSTRAINT acciones_recomendadas_clave_unica UNIQUE (corrida_id, clave)
);

CREATE INDEX IF NOT EXISTS idx_acciones_recomendadas_corrida
  ON acciones_recomendadas (corrida_id);
CREATE INDEX IF NOT EXISTS idx_acciones_recomendadas_clave
  ON acciones_recomendadas (clave);

DROP TRIGGER IF EXISTS update_acciones_recomendadas_updated_at ON acciones_recomendadas;
CREATE TRIGGER update_acciones_recomendadas_updated_at
  BEFORE UPDATE ON acciones_recomendadas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------
-- 3. acciones_silencios -- el descarte, colgado de la CLAVE ESTABLE.
--    Es la tabla que hace que "No es útil" sobreviva a la regeneración de
--    las 05:50. Sin ella el descarte se pierde cada madrugada y la única
--    métrica de calidad del bloque queda inservible.
--    Una fila por clave: el descarte es COMPARTIDO por decisión de producto
--    (§4.2 del plan del tablero) -- desaparece para todos y queda atribuido.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS acciones_silencios (
  clave          TEXT PRIMARY KEY,
  negocio        TEXT NOT NULL CHECK (negocio IN ('hato_lechero', 'aguacate', 'ganado')),
  descartada_por UUID,           -- uuid pelado, SIN FK a auth.users (criterio 096)
  descartada_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- El silencio EXPIRA. Un descarte puntual ("esta semana no") no debe
  -- convertirse en la supresión permanente de una regla que puede volver a
  -- importar. El valor lo pone la app desde DIAS_SILENCIO_POR_DEFECTO, no
  -- un DEFAULT de SQL: es una decisión y se ve en el código.
  vigente_hasta  TIMESTAMPTZ NOT NULL,
  -- Copia del texto que se descartó. Sin esto, dentro de seis semanas
  -- "descartó aguacate.insumo_faltante" no dice nada sobre QUÉ se descartó.
  frase_al_descartar TEXT,
  motivo         TEXT
);

CREATE INDEX IF NOT EXISTS idx_acciones_silencios_vigencia
  ON acciones_silencios (vigente_hasta);

-- ---------------------------------------------------------------------
-- 4. revisiones_periodicas -- catálogo de O-8 (§3.3 ter). Transversal a
--    los negocios, por eso NO va en `hato_config` (que es del hato y cuyo
--    lector explota ante una clave desconocida) ni en `fin_parametros`
--    (que es contable, Gerencia-only y tiene la trampa del índice único
--    sobre columnas COALESCEadas -- migración 052).
--    G-1: NINGÚN parámetro de cadencia tiene DEFAULT, y el CHECK de abajo
--    exige que cada forma de disparo traiga EXACTAMENTE el suyo. La cadencia
--    la declara el dueño o la revisión no existe. Nunca se infiere del
--    histórico -- ése es el error que el chequeo veterinario ya tiene
--    documentado (38 días sobre una cadencia real de 65-71).
--
--    TRES FORMAS DE DISPARO, porque las dos revisiones que el dueño declaró
--    el 2026-08-17 NO SON INTERVALOS:
--      - 'al_cerrar_periodo'  ejecución presupuestal: "mensual, al cerrar el
--                             mes, por negocio". Un intervalo rodante deriva
--                             y, sobre todo, no puede NOMBRAR el período --
--                             y la acción que el dueño escribió dice "la
--                             ejecución presupuestal DE JULIO".
--      - 'al_ocurrir_evento'  productividad del hato: "con cada chequeo
--                             veterinario". Modelarlo como 60 días NO es una
--                             aproximación: la cadencia real es 65-71, así
--                             que el temporizador dispararía ANTES de que
--                             llegue el chequeo y produciría "revisar la
--                             productividad" sin nada nuevo que revisar --
--                             que es exactamente lo que G-2 prohíbe.
--      - 'cada_n_dias'        el genérico. Hoy no lo usa ninguna revisión.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS revisiones_periodicas (
  clave            TEXT PRIMARY KEY,     -- 'aguacate.ejecucion_presupuestal'
  negocio          TEXT NOT NULL CHECK (negocio IN ('hato_lechero', 'aguacate', 'ganado')),
  nombre           TEXT NOT NULL,        -- lo que lee un humano al configurarla
  descripcion      TEXT,
  destino_id       TEXT NOT NULL,        -- debe existir en el catálogo de destinos
  activa           BOOLEAN NOT NULL DEFAULT TRUE,

  disparo          TEXT NOT NULL
                     CHECK (disparo IN ('cada_n_dias', 'al_cerrar_periodo', 'al_ocurrir_evento')),
  -- Sólo para 'cada_n_dias'.
  cadencia_dias    INTEGER CHECK (cadencia_dias > 0),
  -- Sólo para 'al_cerrar_periodo'.
  periodo          TEXT CHECK (periodo IN ('quincenal', 'mensual', 'trimestral')),
  -- Días tras el cierre del período antes de exigir la revisión. DEFAULT 0
  -- a propósito (no inventar), pero para el presupuesto el valor razonable
  -- es 5: el 1 de agosto los gastos de julio se siguen capturando a mano y
  -- una revisión sobre un período a medio cerrar concluye mal.
  dias_gracia      INTEGER NOT NULL DEFAULT 0 CHECK (dias_gracia >= 0),
  -- Sólo para 'al_ocurrir_evento'. Es un SelectorId (§6.2) que devuelve la
  -- FECHA del último evento observable -- p. ej. 'hato.ultimo_chequeo_fecha'
  -- -> MAX(hato_chequeos.fecha). Nunca SQL embebido en una columna de texto:
  -- la lógica vive en el módulo espejado y probado.
  evento_selector  TEXT,

  -- G-3: el reloj. Lo mueve el clic del botón primario...
  ultima_revision_at  TIMESTAMPTZ,
  ultima_revision_por UUID,
  -- ...salvo que exista un evento observable que sirva de reinicio, en cuyo
  -- caso ÉSE manda: el tick toma GREATEST(ultima_revision_at, evento).
  -- OJO -- NO confundir con `evento_selector`: aquél dice cuándo la revisión
  -- se VUELVE EXIGIBLE; éste dice qué la da por HECHA sin que nadie pulse el
  -- botón. Son dos preguntas distintas y en las dos revisiones declaradas
  -- hoy este campo va NULL (las cierra el clic).
  evento_reinicio  TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- G-1 vive aquí desde que `cadencia_dias` dejó de ser NOT NULL: cada forma
  -- de disparo trae EXACTAMENTE su parámetro y ninguno de los otros. Sin
  -- este CHECK, relajar el NOT NULL sí habría debilitado la guarda.
  CONSTRAINT revisiones_periodicas_disparo_coherente CHECK (
    (disparo = 'cada_n_dias'
       AND cadencia_dias IS NOT NULL AND periodo IS NULL AND evento_selector IS NULL)
    OR (disparo = 'al_cerrar_periodo'
       AND periodo IS NOT NULL AND cadencia_dias IS NULL AND evento_selector IS NULL)
    OR (disparo = 'al_ocurrir_evento'
       AND evento_selector IS NOT NULL AND cadencia_dias IS NULL AND periodo IS NULL)
  )
);

DROP TRIGGER IF EXISTS update_revisiones_periodicas_updated_at ON revisiones_periodicas;
CREATE TRIGGER update_revisiones_periodicas_updated_at
  BEFORE UPDATE ON revisiones_periodicas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------
-- Guarda de entrada -- si la tabla ya trae claves fuera de las 4 que el
-- dueño declaró (docs/set_referencia_acciones.md, 2026-08-17), es que algo
-- la pobló antes con un criterio distinto (una corrida parcial de otra
-- versión de esta misma migración, un INSERT manual, etc.). Mejor abortar
-- que sembrar encima de estado desconocido -- mismo espíritu que la guarda
-- de entrada de 096 sobre `hato_alertas_config`.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_claves_inesperadas TEXT[];
BEGIN
  SELECT array_agg(clave ORDER BY clave) INTO v_claves_inesperadas
    FROM revisiones_periodicas
   WHERE clave NOT IN (
     'aguacate.ejecucion_presupuestal',
     'hato_lechero.ejecucion_presupuestal',
     'ganado.ejecucion_presupuestal',
     'hato_lechero.productividad'
   );
  IF v_claves_inesperadas IS NOT NULL THEN
    RAISE EXCEPTION '097 ABORTADA: revisiones_periodicas ya tiene clave(s) no declaradas por el dueño (%). No se siembra sobre estado desconocido -- revisar antes de reintentar.', v_claves_inesperadas;
  END IF;
END $$;

-- SIEMBRA: las CUATRO filas que el dueño declaró el 2026-08-17
-- (docs/set_referencia_acciones.md, sección "Cadencias declaradas"), y ni
-- una más. Se siembran porque están DECLARADAS -- G-1 prohíbe inventar una
-- cadencia, no registrar la que el dueño dio.
--
-- `dias_gracia = 5` en el presupuesto es la única cifra que NO salió de su
-- boca: es la ventana en que los gastos del mes cerrado se siguen
-- capturando a mano. Se siembra explícita y comentada para que se vea y se
-- pueda cambiar desde la pantalla de configuración, en vez de esconderse en
-- un DEFAULT. Si el dueño la quiere en 0, es un UPDATE.
INSERT INTO revisiones_periodicas
  (clave, negocio, nombre, disparo, periodo, dias_gracia, destino_id)
VALUES
  ('aguacate.ejecucion_presupuestal', 'aguacate',
   'Ejecución presupuestal — Aguacate Hass', 'al_cerrar_periodo', 'mensual', 5, 'fin.presupuesto'),
  ('hato_lechero.ejecucion_presupuestal', 'hato_lechero',
   'Ejecución presupuestal — Hato Lechero', 'al_cerrar_periodo', 'mensual', 5, 'fin.presupuesto'),
  ('ganado.ejecucion_presupuestal', 'ganado',
   'Ejecución presupuestal — Ganado', 'al_cerrar_periodo', 'mensual', 5, 'fin.presupuesto')
ON CONFLICT (clave) DO NOTHING;

INSERT INTO revisiones_periodicas
  (clave, negocio, nombre, disparo, evento_selector, destino_id)
VALUES
  ('hato_lechero.productividad', 'hato_lechero',
   'Productividad del hato tras cada chequeo', 'al_ocurrir_evento',
   'hato.ultimo_chequeo_fecha', 'hato.ranking_vacas')
ON CONFLICT (clave) DO NOTHING;

-- `ultima_revision_at` queda NULL en las cuatro. Consecuencia deliberada: la
-- PRIMERA corrida las considera todas vencidas. No se siembra una fecha
-- falsa de "última revisión" para suavizar el estreno -- eso sería inventar
-- que alguien revisó algo. G-4 (una por negocio y día) impide que el
-- arranque llene las tarjetas: aguacate y ganado publican su presupuesto, y
-- el hato publica la más vencida de sus dos.

-- ---------------------------------------------------------------------
-- Guarda de salida -- la siembra tiene que quedar EXACTAMENTE como el
-- dueño la declaró: 4 filas, ni una de más ni de menos, con la forma de
-- disparo, el destino y la cadencia correctos, y las CUATRO con
-- `ultima_revision_at IS NULL` (nadie ha revisado nada todavía).
-- Estilo 075/076/080/081/096: aborta con RAISE EXCEPTION en vez de dejar
-- una siembra a medias o con datos inventados.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_total          INTEGER;
  v_presupuesto    INTEGER;
  v_productividad  INTEGER;
  v_con_revision   INTEGER;
BEGIN
  SELECT count(*) INTO v_total FROM revisiones_periodicas;
  IF v_total <> 4 THEN
    RAISE EXCEPTION '097 ABORTADA: se esperaban exactamente 4 filas en revisiones_periodicas (las declaradas por el dueño el 2026-08-17), hay %.', v_total;
  END IF;

  SELECT count(*) INTO v_presupuesto
    FROM revisiones_periodicas
   WHERE clave IN ('aguacate.ejecucion_presupuestal',
                    'hato_lechero.ejecucion_presupuestal',
                    'ganado.ejecucion_presupuestal')
     AND disparo = 'al_cerrar_periodo'
     AND periodo = 'mensual'
     AND dias_gracia = 5
     AND destino_id = 'fin.presupuesto'
     AND negocio IN ('aguacate', 'hato_lechero', 'ganado');
  IF v_presupuesto <> 3 THEN
    RAISE EXCEPTION '097 ABORTADA: se esperaban 3 revisiones de ejecución presupuestal -- una por negocio, mensual, dias_gracia=5, destino fin.presupuesto --, hay % que cumplen exactamente esa forma.', v_presupuesto;
  END IF;

  SELECT count(*) INTO v_productividad
    FROM revisiones_periodicas
   WHERE clave = 'hato_lechero.productividad'
     AND disparo = 'al_ocurrir_evento'
     AND evento_selector = 'hato.ultimo_chequeo_fecha'
     AND destino_id = 'hato.ranking_vacas'
     AND negocio = 'hato_lechero';
  IF v_productividad <> 1 THEN
    RAISE EXCEPTION '097 ABORTADA: se esperaba 1 revisión de productividad del hato disparada por evento (hato.ultimo_chequeo_fecha -> hato.ranking_vacas), hay %.', v_productividad;
  END IF;

  SELECT count(*) INTO v_con_revision
    FROM revisiones_periodicas WHERE ultima_revision_at IS NOT NULL;
  IF v_con_revision <> 0 THEN
    RAISE EXCEPTION '097 ABORTADA: % fila(s) de revisiones_periodicas quedaron con ultima_revision_at poblado -- las cuatro declaradas por el dueño deben nacer NULL (nadie las ha revisado todavía; sembrar una fecha sería inventar que alguien ya lo hizo).', v_con_revision;
  END IF;

  RAISE NOTICE '097 OK: revisiones_periodicas con las 4 filas declaradas por el dueño (3 de ejecución presupuestal por negocio + 1 de productividad del hato por evento), todas con ultima_revision_at NULL.';
END $$;

-- ---------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------
ALTER TABLE acciones_corridas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE acciones_recomendadas   ENABLE ROW LEVEL SECURITY;
ALTER TABLE acciones_silencios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE revisiones_periodicas   ENABLE ROW LEVEL SECURITY;

-- 5.1 acciones_corridas -- la lee la app SÓLO para el chip de procedencia
--     (generado_at) y el estado del motor. `paquete` y `salida_cruda`
--     son forense y no tienen por qué viajar al navegador, pero PostgREST
--     no filtra columnas por política: se resuelve en la app pidiendo
--     `select=id,generado_at,estado`. La alternativa (una vista) se
--     descarta a propósito -- una vista más que mantener por dos columnas.
DROP POLICY IF EXISTS "acciones_corridas_select_authenticated" ON acciones_corridas;
CREATE POLICY "acciones_corridas_select_authenticated" ON acciones_corridas
  FOR SELECT TO authenticated USING (TRUE);

REVOKE ALL ON TABLE acciones_corridas FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE acciones_corridas FROM authenticated;

-- 5.2 acciones_recomendadas
DROP POLICY IF EXISTS "acciones_recomendadas_select_authenticated" ON acciones_recomendadas;
CREATE POLICY "acciones_recomendadas_select_authenticated" ON acciones_recomendadas
  FOR SELECT TO authenticated USING (TRUE);

-- Sólo el marcado de caducidad (§6.4), que lo dispara el propio render.
-- El DESCARTE ya no vive aquí: vive en `acciones_silencios`.
DROP POLICY IF EXISTS "acciones_recomendadas_update_operativo" ON acciones_recomendadas;
CREATE POLICY "acciones_recomendadas_update_operativo" ON acciones_recomendadas
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM usuarios u
            WHERE u.id = (SELECT auth.uid())
              AND u.rol IN ('Administrador'::rol_usuario, 'Gerencia'::rol_usuario))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios u
            WHERE u.id = (SELECT auth.uid())
              AND u.rol IN ('Administrador'::rol_usuario, 'Gerencia'::rol_usuario))
  );

REVOKE ALL ON TABLE acciones_recomendadas FROM anon;
REVOKE INSERT, DELETE, TRUNCATE ON TABLE acciones_recomendadas FROM authenticated;
-- UPDATE POR COLUMNA, no de tabla. Lección de 073: una policy acota QUÉ
-- FILA, nunca QUÉ COLUMNA -- con GRANT UPDATE de tabla, un Administrador
-- podría reescribir `plantilla`/`hechos_snapshot`/`destino_ruta` de una
-- acción publicada, que es exactamente el texto que el validador acaba de
-- certificar. Se concede sólo lo que el render necesita.
REVOKE UPDATE ON TABLE acciones_recomendadas FROM authenticated;
GRANT  UPDATE (caducada_at) ON TABLE acciones_recomendadas TO authenticated;

-- 5.3 acciones_silencios -- el botón "No es útil". INSERT y UPDATE, porque
--     descartar la misma clave dos veces (tras expirar el silencio) tiene
--     que renovar la fila, no fallar contra la PK. DELETE NO se concede:
--     "deshacer un descarte" no es una operación del producto, y si algún
--     día lo es, se hace poniendo `vigente_hasta` en el pasado -- que deja
--     traza, a diferencia de un DELETE.
DROP POLICY IF EXISTS "acciones_silencios_select_authenticated" ON acciones_silencios;
CREATE POLICY "acciones_silencios_select_authenticated" ON acciones_silencios
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "acciones_silencios_write_operativo" ON acciones_silencios;
CREATE POLICY "acciones_silencios_write_operativo" ON acciones_silencios
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM usuarios u
            WHERE u.id = (SELECT auth.uid())
              AND u.rol IN ('Administrador'::rol_usuario, 'Gerencia'::rol_usuario))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios u
            WHERE u.id = (SELECT auth.uid())
              AND u.rol IN ('Administrador'::rol_usuario, 'Gerencia'::rol_usuario))
  );

REVOKE ALL ON TABLE acciones_silencios FROM anon;
REVOKE DELETE, TRUNCATE ON TABLE acciones_silencios FROM authenticated;

-- 5.4 revisiones_periodicas -- SELECT abierto (el motor y la pantalla de
--     configuración lo leen), escritura Gerencia-only (declarar una cadencia
--     es una decisión del dueño, G-1). Mismo perfil que `alertas_catalogo`.
--     EXCEPCIÓN acotada: el reloj (`ultima_revision_at/por`) lo mueve el clic
--     del botón primario, que un Administrador sí puede pulsar -- por eso ese
--     par de columnas se concede aparte, POR COLUMNA. Declarar la cadencia y
--     marcar que se revisó son dos permisos distintos y aquí se ven distintos.
DROP POLICY IF EXISTS "revisiones_periodicas_select_authenticated" ON revisiones_periodicas;
CREATE POLICY "revisiones_periodicas_select_authenticated" ON revisiones_periodicas
  FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "revisiones_periodicas_write_gerencia" ON revisiones_periodicas;
CREATE POLICY "revisiones_periodicas_write_gerencia" ON revisiones_periodicas
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM usuarios u
            WHERE u.id = (SELECT auth.uid()) AND u.rol = 'Gerencia'::rol_usuario)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios u
            WHERE u.id = (SELECT auth.uid()) AND u.rol = 'Gerencia'::rol_usuario)
  );

-- El reloj: Administrador + Gerencia, sólo esas dos columnas.
DROP POLICY IF EXISTS "revisiones_periodicas_reloj_operativo" ON revisiones_periodicas;
CREATE POLICY "revisiones_periodicas_reloj_operativo" ON revisiones_periodicas
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM usuarios u
            WHERE u.id = (SELECT auth.uid())
              AND u.rol IN ('Administrador'::rol_usuario, 'Gerencia'::rol_usuario))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM usuarios u
            WHERE u.id = (SELECT auth.uid())
              AND u.rol IN ('Administrador'::rol_usuario, 'Gerencia'::rol_usuario))
  );

REVOKE ALL ON TABLE revisiones_periodicas FROM anon;
REVOKE INSERT, DELETE, TRUNCATE, UPDATE ON TABLE revisiones_periodicas FROM authenticated;
GRANT  UPDATE (ultima_revision_at, ultima_revision_por)
  ON TABLE revisiones_periodicas TO authenticated;
-- Ojo: el GRANT por columna de arriba es lo que ejerce un Administrador. Un
-- Gerencia escribe la fila entera a través de su policy ALL... pero SÓLO si
-- también tiene el GRANT. Postgres exige AMBOS (grant y policy), así que la
-- pantalla de configuración de Gerencia usa el service_role vía edge
-- function (patrón `usuarios/crear|editar`), NO PostgREST directo. Es
-- deliberado: mantiene el GRANT de tabla revocado para todo el mundo y deja
-- una sola puerta de escritura completa, autenticada y auditable.

-- ---------------------------------------------------------------------
-- 6. Retención. La poda la hace el tick (borrado por antigüedad dentro
--    del mismo handler, sin un segundo cron) -- se documenta aquí para
--    que quien lea el esquema sepa que estas tablas no crecen sin techo:
--    corridas > 90 días se borran, y el ON DELETE CASCADE se lleva sus
--    acciones. 90 días ~ 90 filas de corrida: es forense, no un data lake.
--    `acciones_silencios` NO se poda: son decenas de filas como mucho, y
--    son el registro de calidad del motor -- borrarlas es borrar la métrica.
-- ---------------------------------------------------------------------

-- =============================================================================
-- ROLLBACK (manual)
-- =============================================================================
--   DROP TABLE IF EXISTS acciones_recomendadas;
--   DROP TABLE IF EXISTS acciones_corridas;
--   DROP TABLE IF EXISTS acciones_silencios;
--   DROP TABLE IF EXISTS revisiones_periodicas;
-- Ninguna de las cuatro tiene historia que preservar todavía (son nuevas en
-- esta migración) -- a diferencia de 075/080/095, un DROP directo no pierde
-- nada que no se pueda regenerar: `acciones_corridas`/`acciones_recomendadas`
-- se repueblan solas en la siguiente corrida del tick, y las 4 filas de
-- `revisiones_periodicas` se restauran corriendo esta migración de nuevo
-- (siempre que nadie haya movido `ultima_revision_at` a mano mientras tanto
-- -- ese progreso SÍ se perdería con el DROP).
-- =============================================================================
