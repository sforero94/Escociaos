-- =====================================================================
-- 146: hato_capturas_foto -- una fila por INTENTO de carga por foto del
-- Hato Lechero (planilla mensual de pesaje y planilla de chequeo).
-- Fecha: 2026-09-13
-- Fuente: hallazgo ESCO-76 del PO -- "las rutas de captura por foto del
-- hato no registran ningún desenlace: 6 de 9 cargas no produjeron una
-- sola fila, el pesaje semanal del 2026-09-02 se perdió sin que nadie lo
-- viera, y el chequeo estrena el mismo carril ciego esta semana".
-- Decisión del dueño (2026-09-13): "construir el rastreo de cada intento
-- de foto, mismo patron que la migracion 116 (motor de alertas del hato)".
--
-- LO QUE MIDE EL PROBLEMA, verificado contra producción antes de escribir
-- esta migración:
--   - `storage.objects` del bucket `hato-pesajes-fotos`: 9 objetos en 9
--     prefijos distintos (9 cargas), del 2026-08-11 al 2026-09-04.
--   - `hato_pesajes_leche` con `fuente='foto'`: 225 filas, la última
--     escrita el 2026-08-29 y ninguna con fecha posterior al 2026-08-26.
--     O sea: hubo cargas DESPUÉS del último dato guardado, y no queda
--     rastro de por qué no escribieron.
--   - `chequeos-fotos`: 6 objetos desde el 2026-09-08 -- la ruta de
--     chequeo por foto acaba de entrar al mismo carril.
--
-- LA PREGUNTA QUE ESTA TABLA CONTESTA Y HOY NO SE PUEDE CONTESTAR: una
-- foto guardada en Storage sin filas de dominio al lado puede ser
--   (a) el OCR no leyó nada,
--   (b) el usuario vio el diff y no aprobó,
--   (c) un error del servidor después de subir, o
--   (d) una carga que sí escribió y las filas están en otro mes.
-- Las cuatro se ven IDÉNTICAS desde afuera. `desenlace` las separa.
--
-- QUÉ NO HACE, a propósito (alcance del hallazgo): no reintenta el OCR,
-- no manda alerta de Telegram, no borra objetos huérfanos de Storage y no
-- toca `ocrPesaje.ts` (sigue siendo el único lector de celdas).
--
-- CUÁNDO SE ESCRIBE CADA FILA:
--   - INSERT con `desenlace='pendiente'` en `/hato/pesaje/foto` y
--     `/hato/chequeo/foto`, INMEDIATAMENTE DESPUÉS de guardar la capa
--     cruda en Storage y ANTES de llamar al modelo de visión. Ese orden
--     es el punto entero: si el modelo falla, la fila ya existe y el
--     fallo queda registrado. Registrar después del OCR habría dejado
--     invisible justo el caso que motivó el hallazgo.
--   - UPDATE del `desenlace` al cerrar: `ok` en los dos endpoints de
--     commit, `ocr_fallo` cuando ninguna foto se pudo leer o ninguna fila
--     ancló contra el roster, `error` ante cualquier otro fallo posterior
--     al INSERT.
--   - `abandonado` NO lo escribe nadie todavía: hoy una carga que el
--     usuario nunca aprueba se queda en `pendiente`, que ya es la señal
--     accionable. El valor existe en el CHECK para cuando haya una barrida
--     que lo distinga; inventar esa barrida acá sería agregar un
--     automatismo que nadie pidió.
--
-- RLS -- se hereda la forma de la 116 (`hato_alertas_tick_runs`), que es
-- la migración que el hallazgo manda replicar, y NO la letra del patrón
-- 044 (SELECT authenticated / escritura Administrador+Gerencia): esta
-- tabla la escribe SOLO la edge function con `service_role`, igual que
-- aquella. Una política de escritura para el navegador sería una
-- capacidad que ningún camino de la aplicación ejerce y que sí permitiría
-- reescribir a mano el desenlace de una carga -- precedente 073
-- ("nunca un grant para una escritura que no existe"). SELECT sí queda
-- abierto a `authenticated`: la tarjeta de Pesaje lo lee para mostrar
-- "Última captura". Sin política de DELETE, igual que 116: es un registro
-- de intentos, append-only por diseño.
--
-- Trampa 081: Supabase concede ALL a anon/authenticated por defecto en
-- tablas nuevas de `public` (ALTER DEFAULT PRIVILEGES). Los REVOKE de
-- abajo son carga útil, no decoración.
--
-- VERIFICACIÓN DEL NÚMERO contra las TRES fuentes que manda el runbook,
-- más la cuarta que costó tres renumeraciones en dos semanas:
--   - ficheros del repo: el mayor es 145.
--   - `supabase_migrations.schema_migrations`: el nombre más alto es
--     `145_excepcion_ronda_bultos_a_kilos` (2026-09-11).
--   - esquema `respaldos`: el respaldo más alto es `backup_145_*`.
--   - TODAS las ramas de `origin` (`git log --all` sobre
--     `src/sql/migrations/`): ningún `146_*` en ninguna.
--
-- Aditiva pura: crea una tabla nueva, no toca ninguna fila ni ningún
-- objeto existente. Filas afectadas: cero.
-- =====================================================================

CREATE TABLE IF NOT EXISTS hato_capturas_foto (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Qué planilla se fotografió. Las dos rutas comparten tabla porque
  -- comparten la pregunta ("¿esta carga produjo algo?") y el mismo modo
  -- de fallo silencioso; lo que cambia es el período (ver abajo).
  tipo               TEXT NOT NULL CHECK (tipo IN ('pesaje', 'chequeo')),

  -- Por dónde entró. El bot de Telegram usa el MISMO pipeline de pesaje
  -- (`hato-pesaje-pipeline.ts`), así que sin esta columna las dos vías
  -- quedarían indistinguibles en el registro.
  origen             TEXT NOT NULL DEFAULT 'web' CHECK (origen IN ('web', 'telegram')),

  desenlace          TEXT NOT NULL DEFAULT 'pendiente'
                       CHECK (desenlace IN ('pendiente', 'ok', 'ocr_fallo', 'abandonado', 'error')),

  -- Período. `pesaje` trae anio+mes (la planilla mensual: la solicitud los
  -- exige, nunca se leen del papel); `chequeo` trae `fecha` cuando el
  -- humano ya la fijó, y NULL cuando todavía no -- nunca una fecha
  -- inventada de la imagen, misma regla que `chequeoFecha` en el endpoint.
  anio               INTEGER CHECK (anio IS NULL OR (anio BETWEEN 2020 AND 2100)),
  mes                INTEGER CHECK (mes IS NULL OR (mes BETWEEN 1 AND 12)),
  fecha              DATE,
  CONSTRAINT hato_capturas_foto_periodo_pesaje
    CHECK (tipo <> 'pesaje' OR (anio IS NOT NULL AND mes IS NOT NULL)),

  -- Capa cruda: dónde quedaron las fotos. `storage_ok = false` significa
  -- que el upload falló y la evidencia NO existe -- hoy eso viaja en la
  -- respuesta HTTP y muere ahí.
  storage_bucket     TEXT NOT NULL,
  storage_prefijo    TEXT NOT NULL,
  storage_rutas      TEXT[] NOT NULL DEFAULT '{}',
  storage_ok         BOOLEAN NOT NULL DEFAULT TRUE,
  fotos_recibidas    INTEGER NOT NULL DEFAULT 0 CHECK (fotos_recibidas >= 0),

  modelo             TEXT,

  -- Los tres números del embudo. NULL = todavía no se sabe (la fila nace
  -- `pendiente`); 0 = se midió y fue cero. La diferencia es justamente lo
  -- que la tarjeta de Pesaje necesita para decir "sin dato" en vez de "0"
  -- -- misma regla que gobierna litros, lluvia e incidencia en este
  -- sistema.
  celdas_leidas_ocr  INTEGER CHECK (celdas_leidas_ocr IS NULL OR celdas_leidas_ocr >= 0),
  celdas_confirmadas INTEGER CHECK (celdas_confirmadas IS NULL OR celdas_confirmadas >= 0),
  filas_escritas     INTEGER CHECK (filas_escritas IS NULL OR filas_escritas >= 0),

  -- Texto del fallo cuando `desenlace` no es 'ok'/'pendiente'.
  detalle            TEXT,

  -- Autoría explícita: los dos caminos escriben con `service_role`, donde
  -- `auth.uid()` es NULL y ningún trigger de atribución dispara (misma
  -- brecha aceptada de 050/063/074). Sin esta columna poblada desde la
  -- sesión verificada, ninguna carga sería atribuible.
  created_by         UUID
);

CREATE INDEX IF NOT EXISTS idx_hato_capturas_foto_creado
  ON hato_capturas_foto (tipo, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_hato_capturas_foto_desenlace
  ON hato_capturas_foto (desenlace, creado_en DESC);

COMMENT ON TABLE hato_capturas_foto IS
  'Un intento de carga por foto (pesaje/chequeo) por fila. Se inserta como pendiente justo despues de guardar la foto en Storage y ANTES del OCR, y se cierra con el desenlace real. Hallazgo ESCO-76.';

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
ALTER TABLE hato_capturas_foto ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hato_capturas_foto_select_authenticated" ON hato_capturas_foto;
CREATE POLICY "hato_capturas_foto_select_authenticated" ON hato_capturas_foto
  FOR SELECT TO authenticated USING (TRUE);

REVOKE ALL ON TABLE hato_capturas_foto FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE hato_capturas_foto FROM authenticated;

-- ---------------------------------------------------------------------
-- Verificación (aborta si el estado final no es el esperado; la migración
-- es aditiva y no toca ninguna fila existente, así que no hay nada que
-- restaurar en caso de aborto).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_politicas integer;
BEGIN
  SELECT count(*) INTO v_politicas
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  WHERE c.relname = 'hato_capturas_foto';

  IF v_politicas <> 1 THEN
    RAISE EXCEPTION '146: se esperaba 1 politica sobre hato_capturas_foto, hay %.', v_politicas;
  END IF;

  IF has_table_privilege('anon', 'hato_capturas_foto', 'SELECT') THEN
    RAISE EXCEPTION '146: anon no deberia tener SELECT sobre hato_capturas_foto.';
  END IF;

  IF has_table_privilege('authenticated', 'hato_capturas_foto', 'INSERT')
     OR has_table_privilege('authenticated', 'hato_capturas_foto', 'UPDATE')
     OR has_table_privilege('authenticated', 'hato_capturas_foto', 'DELETE') THEN
    RAISE EXCEPTION '146: authenticated no deberia poder escribir hato_capturas_foto -- solo service_role (los endpoints de foto/commit).';
  END IF;

  IF NOT has_table_privilege('authenticated', 'hato_capturas_foto', 'SELECT') THEN
    RAISE EXCEPTION '146: authenticated necesita SELECT -- la tarjeta de Pesaje lee la ultima captura desde el navegador.';
  END IF;

  RAISE NOTICE '146 OK: hato_capturas_foto creada, RLS activo, 1 politica SELECT, sin grants de escritura para anon/authenticated.';
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, si hubiera que revertir):
--
--   DROP TABLE IF EXISTS hato_capturas_foto;
--
-- Nada que preservar fuera del propio registro de intentos: las fotos
-- siguen en Storage y los pesajes/chequeos escritos viven en sus tablas
-- de dominio. Mismo criterio que 116.
-- ---------------------------------------------------------------------------
