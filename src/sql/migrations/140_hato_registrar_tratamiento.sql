-- =====================================================================
-- 140: Hato Lechero — registrar un tratamiento desde la app y desde Telegram
-- Fecha: 2026-09-09
--
-- APLICADA a producción el 2026-09-09 (ledger `20260909001828`,
-- `hato_registrar_tratamiento`).
--
-- **Se numeró 138 al escribirla y hubo que renumerarla a 140.** Una sesión
-- paralela fusionó 138 y 139 a `main` mientras esta corría, y su rastro
-- estaba a la vista en `respaldos.backup_138_*` / `backup_139_*` — o sea que
-- el catálogo vivo tenía la respuesta y el número salió del último fichero
-- del repo, que es justo lo que el CLAUDE.md dice que no se haga. Costó una
-- renumeración; la próxima vez, mirar `respaldos` y `origin/main` ANTES de
-- elegir el número. La fila del ledger no lleva número en el nombre, así que
-- el cambio de nombre del fichero no la desalinea.
--
-- POR QUÉ
-- -------
-- La 055 creó `hato_tratamientos` / `hato_tratamiento_pasos` /
-- `hato_protocolos` hace más de un año y **ninguna pantalla escribe en
-- ellas**: 0 filas en las tres (verificado contra producción 2026-09-09).
-- La card "Tratamientos" de la Hoja de Vida es de solo lectura y el flujo
-- `/evento` de Telegram escribe `hato_eventos`, que es otra tabla.
-- Consecuencia medible: la regla `tratamiento_paso` del motor de alertas
-- (056/S6) está escrita, probada y desplegada, y **nunca disparó** — no
-- porque falle, sino porque no existe ningún paso que recordar.
--
-- Esta migración aporta la única pieza de base de datos que faltaba: una
-- función que escriba el tratamiento y su paso de seguimiento JUNTOS.
--
-- DECISIONES DEL DUEÑO (Santiago, 2026-09-09)
-- -------------------------------------------
-- D-1. Un tratamiento es **una aplicación + una próxima fecha opcional**.
--      No es un protocolo de N pasos. La próxima fecha es lo que enciende
--      la alerta `tratamiento_paso` que ya existe.
-- D-2. **Sin columnas nuevas de datos clínicos** (dosis, retiro de leche,
--      quién aplicó). El nombre va en `nombre` y todo lo demás en `nota`,
--      texto libre, "mientras aprendemos cómo estructurar el dato". Cuando
--      esas notas muestren un patrón repetido, ESA es la migración que
--      crea las columnas — no ésta.
-- D-3. El nombre es **texto libre**, no un protocolo del catálogo.
--      `hato_protocolos` sigue vacío y sigue siendo opcional.
-- D-4. El tratamiento **no entra a la línea de tiempo** de la ficha. No se
--      toca el CHECK de `hato_eventos.tipo`.
-- D-5. Una sola función de base de datos para los dos caminos de
--      escritura, en vez de dos inserts sueltos por cliente.
--
-- POR QUÉ UNA FUNCIÓN Y NO DOS INSERT
-- -----------------------------------
-- Son dos filas en dos tablas. Con inserts sueltos, si el segundo falla el
-- usuario se queda con un tratamiento SIN su paso: la pantalla lo muestra
-- como guardado y el recordatorio no existe. Eso es exactamente la pérdida
-- silenciosa que el módulo no tolera. Precedente directo: 070 y 106.
--
-- `SECURITY INVOKER`, como 070 y 106 y por el mismo motivo: el llamante de
-- la web es una sesión Administrador/Gerencia que YA tiene RLS de escritura
-- sobre las dos tablas (políticas `ALL` de la 055); lo único que le falta
-- es atomicidad. Un `DEFINER` saltaría la RLS y obligaría a repetir la
-- comprobación de rol dentro de la función. El bot de Telegram llama con
-- `service_role`, que tiene `rolbypassrls` — la RLS ni se evalúa ahí, y la
-- puerta de ese camino es el secreto del webhook.
--
-- `created_by` viaja EXPLÍCITO en el payload y no se deriva de `auth.uid()`
-- a secas: el bot escribe con `service_role`, donde `auth.uid()` es NULL y
-- ningún trigger de atribución (040/050/063/074) se dispara. Mismo contrato
-- D-T4 que los RPC de la ronda de inventario (126).
--
-- COLUMNA NUEVA: `hato_tratamientos.fuente`
-- -----------------------------------------
-- No es especulativa: es lo que hace seguro el botón "Deshacer" de
-- Telegram. Ese botón borra la fila recién creada, y sin `fuente` no hay
-- forma de distinguir un tratamiento que acaba de escribir Fernando de uno
-- que escribió Martha desde la web. Es la misma guarda que ya protege el
-- Deshacer de `/evento` (`hato_eventos.fuente = 'telegram'`), y el mismo
-- CHECK de valores. `hato_eventos` y `hato_chequeos` ya llevan esta columna
-- desde la 053.
--
-- Filas afectadas: cero (las tres tablas están vacías).
-- Idempotente: seguro de re-ejecutar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Pre-condiciones
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_faltan text;
BEGIN
  SELECT string_agg(t, ', ')
    INTO v_faltan
    FROM unnest(ARRAY['hato_tratamientos', 'hato_tratamiento_pasos', 'hato_animales']) AS t
   WHERE to_regclass('public.' || t) IS NULL;

  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan tablas de la migración 055/053: %', v_faltan;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. `fuente` — de dónde vino el tratamiento
-- ---------------------------------------------------------------------
-- Mismos valores que `hato_eventos.fuente` (053), a propósito: los dos
-- responden la misma pregunta y un vocabulario distinto obligaría a
-- traducir entre tablas hermanas.

ALTER TABLE hato_tratamientos
  ADD COLUMN IF NOT EXISTS fuente TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.hato_tratamientos'::regclass
       AND conname = 'hato_tratamientos_fuente_check'
  ) THEN
    ALTER TABLE hato_tratamientos
      ADD CONSTRAINT hato_tratamientos_fuente_check
      CHECK (fuente IN ('web', 'telegram', 'importacion', 'chequeo'));
  END IF;
END $$;

COMMENT ON COLUMN hato_tratamientos.fuente IS
  'De dónde vino la fila: web | telegram | importacion | chequeo. NULL = '
  'histórico anterior a la 140. Gobierna el Deshacer de Telegram, que solo '
  'puede borrar sus propias filas.';

-- ---------------------------------------------------------------------
-- 2. fn_hato_registrar_tratamiento
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_hato_registrar_tratamiento(
  p_animal_id          uuid,
  p_nombre             text,
  p_fecha_inicio       date,
  p_nota               text DEFAULT NULL,
  p_fecha_proximo_paso date DEFAULT NULL,
  p_descripcion_paso   text DEFAULT NULL,
  p_fuente             text DEFAULT 'web',
  p_created_by         uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_nombre        text := btrim(coalesce(p_nombre, ''));
  v_nota          text := nullif(btrim(coalesce(p_nota, '')), '');
  v_desc_paso     text := nullif(btrim(coalesce(p_descripcion_paso, '')), '');
  v_tratamiento_id uuid;
BEGIN
  -- El nombre es lo único que la card muestra como título. Vacío deja una
  -- fila que no dice qué se aplicó, y eso no se puede reconstruir después.
  IF v_nombre = '' THEN
    RAISE EXCEPTION 'El tratamiento necesita un nombre.';
  END IF;

  IF p_animal_id IS NULL THEN
    RAISE EXCEPTION 'El tratamiento necesita un animal.';
  END IF;

  IF p_fecha_inicio IS NULL THEN
    RAISE EXCEPTION 'El tratamiento necesita una fecha.';
  END IF;

  IF p_fuente IS NULL OR p_fuente NOT IN ('web', 'telegram', 'importacion', 'chequeo') THEN
    RAISE EXCEPTION 'Fuente inválida: %', coalesce(p_fuente, '(null)');
  END IF;

  -- Un paso programado ANTES de que empiece el tratamiento no es una
  -- advertencia biológica, es un dato imposible: la alerta saldría vencida
  -- el mismo día que se registra. Acá sí se bloquea.
  IF p_fecha_proximo_paso IS NOT NULL AND p_fecha_proximo_paso < p_fecha_inicio THEN
    RAISE EXCEPTION
      'La próxima fecha (%) es anterior al inicio del tratamiento (%).',
      p_fecha_proximo_paso, p_fecha_inicio;
  END IF;

  -- `estado` describe si queda algo pendiente, no si el animal sanó:
  -- sin próxima fecha no hay nada que esperar, así que nace completado.
  -- Con próxima fecha queda activo hasta que alguien ejecute el paso.
  INSERT INTO hato_tratamientos (
    animal_id, nombre, fecha_inicio, estado, nota, fuente, created_by
  )
  VALUES (
    p_animal_id,
    v_nombre,
    p_fecha_inicio,
    CASE WHEN p_fecha_proximo_paso IS NULL THEN 'completado' ELSE 'activo' END,
    v_nota,
    p_fuente,
    coalesce(p_created_by, auth.uid())
  )
  RETURNING id INTO v_tratamiento_id;

  IF p_fecha_proximo_paso IS NOT NULL THEN
    INSERT INTO hato_tratamiento_pasos (
      tratamiento_id, paso_num, descripcion, offset_dias,
      fecha_programada, fecha_ejecutada, requiere_confirmacion
    )
    VALUES (
      v_tratamiento_id,
      1,
      v_desc_paso,
      (p_fecha_proximo_paso - p_fecha_inicio)::integer,
      p_fecha_proximo_paso,
      NULL,               -- pendiente: es lo que lee el motor de alertas
      TRUE
    );
  END IF;

  RETURN v_tratamiento_id;
END $$;

COMMENT ON FUNCTION fn_hato_registrar_tratamiento(uuid, text, date, text, date, text, text, uuid) IS
  'Registra un tratamiento y su paso de seguimiento opcional en UNA '
  'transacción (migración 140). SECURITY INVOKER: la RLS de la 055 es la '
  'puerta del camino web; el bot llama con service_role. `created_by` '
  'viaja explícito porque auth.uid() es NULL bajo service_role.';

-- El `anon` del bundle del navegador nunca ejecuta esto (precedente 081/082).
REVOKE ALL ON FUNCTION fn_hato_registrar_tratamiento(uuid, text, date, text, date, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_hato_registrar_tratamiento(uuid, text, date, text, date, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION fn_hato_registrar_tratamiento(uuid, text, date, text, date, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_hato_registrar_tratamiento(uuid, text, date, text, date, text, text, uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 3. Post-condiciones
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_prosecdef boolean;
  v_proconfig text[];
  v_anon      boolean;
  v_auth      boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'hato_tratamientos'
       AND column_name = 'fuente'
  ) THEN
    RAISE EXCEPTION 'Post: hato_tratamientos.fuente no quedó creada.';
  END IF;

  -- `pg_get_functiondef` OMITE `SECURITY INVOKER` del DDL por ser el
  -- default, así que la comprobación real es `pg_proc`, nunca un ILIKE
  -- contra el texto (lección de la 130).
  SELECT p.prosecdef, p.proconfig
    INTO v_prosecdef, v_proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_hato_registrar_tratamiento';

  IF v_prosecdef IS NULL THEN
    RAISE EXCEPTION 'Post: fn_hato_registrar_tratamiento no existe.';
  END IF;
  IF v_prosecdef THEN
    RAISE EXCEPTION 'Post: fn_hato_registrar_tratamiento quedó SECURITY DEFINER.';
  END IF;
  IF v_proconfig IS NULL OR NOT ('search_path=public, pg_temp' = ANY(v_proconfig)) THEN
    RAISE EXCEPTION 'Post: search_path no quedó pineado (%).', v_proconfig;
  END IF;

  SELECT has_function_privilege('anon', p.oid, 'EXECUTE'),
         has_function_privilege('authenticated', p.oid, 'EXECUTE')
    INTO v_anon, v_auth
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_hato_registrar_tratamiento';

  IF v_anon THEN
    RAISE EXCEPTION 'Post: anon conserva EXECUTE sobre fn_hato_registrar_tratamiento.';
  END IF;
  IF NOT v_auth THEN
    RAISE EXCEPTION 'Post: authenticated perdió EXECUTE — la web no podría guardar.';
  END IF;

  RAISE NOTICE '140 OK: fuente creada, RPC INVOKER con search_path pineado, anon sin EXECUTE.';
END $$;

COMMIT;

-- =====================================================================
-- ROLLBACK (ejecutable)
-- =====================================================================
-- BEGIN;
--   DROP FUNCTION IF EXISTS fn_hato_registrar_tratamiento(uuid, text, date, text, date, text, text, uuid);
--   ALTER TABLE hato_tratamientos DROP CONSTRAINT IF EXISTS hato_tratamientos_fuente_check;
--   ALTER TABLE hato_tratamientos DROP COLUMN IF EXISTS fuente;
-- COMMIT;
