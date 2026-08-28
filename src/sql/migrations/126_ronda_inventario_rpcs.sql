-- Migración 126: RPC de la "ronda de inventario" -- Fase 2 (RPC)
-- de docs/brief_tecnico_verificacion_inventario.md §6, sobre el esquema creado
-- por la migración 125 (Fase 1, aplicada).
--
-- Crea `fn_ronda_validar_actor` (§6.1, literal del brief técnico) y los DIEZ
-- RPC de §6.2/§6.3/§6.4/§6.5: fn_ronda_abrir, fn_ronda_confirmar_hallazgos,
-- fn_ronda_deshacer_confirmacion (P-1), fn_ronda_explicacion_david,
-- fn_ronda_resolver_con_captura, fn_ronda_proponer_ajuste,
-- fn_ronda_decidir_ajuste, fn_ronda_aplicar_ajuste, fn_ronda_cerrar,
-- fn_ronda_emitir_reporte. Más un helper interno, `fn_ronda_actor_nombre`,
-- no contado entre "los diez" (no es un RPC del flujo de negocio: solo evita
-- duplicar la resolución de "nombre legible del actor" en los dos RPC que
-- escriben `movimientos_inventario.responsable`).
--
-- NO crea Telegram, el pipeline de voz como endpoint HTTP, ni el historial
-- web -- eso es Fase 3-6. NO toca `verificaciones_inventario`/
-- `verificaciones_detalle` (124) ni `productos.precio_unitario` (129, sesión
-- en paralelo). NO se aplica a producción desde este agente: queda escrita y
-- verificada para que el dueño la aplique tras su revisión, mismo protocolo
-- que 124/125.
--
-- ---------------------------------------------------------------------------
-- D-T4/D-T5 (§6.1 del brief técnico) -- LA PREMISA QUE GOBIERNA TODO ESTE
-- ARCHIVO, dicho una sola vez acá para no repetirlo en cada función:
-- ---------------------------------------------------------------------------
-- Un RPC SECURITY INVOKER llamado con la llave `service_role` (que es como el
-- bot de Telegram va a llamar estos RPC, en una fase posterior) NO falla por
-- falta de `auth.uid()` -- `service_role` tiene `rolbypassrls` y la RLS ni se
-- evalúa. Lo que SÍ falla en silencio es cualquier expresión que derive el
-- actor de `auth.uid()`/`auth.jwt()`: devuelve NULL. Por eso:
--
--   1. El actor SIEMPRE viaja explícito en el payload JSON de cada RPC, bajo
--      las claves `actor_usuario_id` / `actor_telegram_usuario_id` -- nunca
--      se deriva de la sesión.
--   2. `fn_ronda_validar_actor` es el ÚNICO punto que decide si ese actor
--      declarado es válido: con `auth.uid()` (sesión de navegador), el actor
--      declarado debe SER esa sesión (nunca puede reclamar ser un usuario de
--      Telegram); sin `auth.uid()` (llamada por `service_role`), el actor
--      declarado debe ser un `telegram_usuarios.id` activo con el módulo
--      correspondiente en `modulos_permitidos`.
--   3. Para `fn_ronda_decidir_ajuste`, la guarda de Gerencia NO puede usar
--      `es_usuario_gerencia()` (SECURITY DEFINER sobre `auth.uid()`, con
--      `service_role` da falso siempre) -- va por el vínculo
--      `telegram_usuarios.usuario_id -> usuarios.rol = 'Gerencia'`, literal
--      de §6.1.
--
-- Todos los RPC: SECURITY INVOKER, `SET search_path = public, pg_temp` (con
-- `pg_temp` AL FINAL -- precedente 082 parte 3), reciben `jsonb`, devuelven
-- `jsonb`, `EXECUTE` revocado a `anon`, y llaman a `fn_ronda_validar_actor`
-- como primera línea. SECURITY INVOKER y no DEFINER por el mismo motivo que
-- 070/106: quien llama desde el navegador es una sesión Administrador/
-- Gerencia que ya tiene RLS de escritura sobre estas tablas (125 §4.6); un
-- DEFINER la saltaría también para ese caso y obligaría a reimplementar
-- adentro una política que ya existe.
--
-- GRANTS, el patrón elegido y por qué. El brief dice "EXECUTE revocado a
-- anon" para las diez, pero D-T4 exige que "el mismo RPC lo llame un
-- navegador Y el bot" -- así que además de revocar a `anon` hay que dejar
-- `authenticated` (browser, vía PostgREST `.rpc()`) Y `service_role` (bot)
-- con EXECUTE explícito. Un `CREATE FUNCTION` nuevo concede EXECUTE a
-- `PUBLIC` por defecto -- que de hecho ya cubre a las tres -- pero dejarlo
-- así sería confiar en un default en vez de declarar la intención, y no se
-- podría revocar selectivamente de `anon` sin también tocar `PUBLIC`
-- (precedente exacto: la migración 112 hace `REVOKE ... FROM PUBLIC` primero
-- y recién después revoca de `anon`/`authenticated` explícitamente, porque
-- revocar de un rol que solo tiene el privilegio vía PUBLIC no hace nada).
-- Por eso cada función de este archivo: `REVOKE EXECUTE ... FROM PUBLIC`,
-- después `GRANT EXECUTE ... TO authenticated, service_role` explícito. La
-- única excepción es `fn_ronda_emitir_reporte` -- ver su comentario propio,
-- es una desviación documentada del literal del brief.
--
-- ---------------------------------------------------------------------------
-- CUATRO DECISIONES DE IMPLEMENTACIÓN QUE EL BRIEF TÉCNICO NO DEJA LITERALES
-- -- documentadas acá, no inventadas en silencio (regla de "minor issue:
-- proceder y documentar el supuesto" del backend engineer):
-- ---------------------------------------------------------------------------
--
-- (1) SIGNO de `movimientos_inventario.cantidad` en `fn_ronda_resolver_con_captura`.
--     La tabla YA tiene dos convenciones de signo distintas conviviendo:
--     `NuevoMovimientoModal.tsx` guarda 'Salida Otros' en NEGATIVO
--     (`cantidadMovimiento = -cantidadNum`, `saldo_nuevo = saldo_anterior +
--     cantidad`), mientras que la migración 106 (`fn_cerrar_aplicacion`)
--     guarda 'Salida por Aplicación' en POSITIVO -- la magnitud consumida --
--     con `saldo_nuevo = saldo_anterior - cantidad`. Ningún consumidor de la
--     tabla depende del signo: `MovementsDashboard.tsx` clasifica dirección
--     por `tipo_movimiento` (nunca por el signo de `cantidad`) y siempre
--     muestra `Math.abs(cantidad)`. Este RPC sigue la convención de 106 (el
--     precedente transaccional más cercano, no un formulario suelto):
--     `cantidad` = magnitud POSITIVA para los tres tipos válidos de la vía
--     (a) ('Entrada' | 'Salida por Aplicación' | 'Salida Otros'), y
--     `saldo_anterior`/`saldo_nuevo` cargan la dirección real. No es una
--     unificación de la tabla entera -- 'Ajuste' del camino (b) de
--     `NuevoMovimientoModal.tsx` sigue sin tocarse (CA-26) -- es solo la
--     elección para las filas NUEVAS que este RPC escribe.
--
-- (2) `fn_ronda_aplicar_ajuste` "acepta los tres módulos" (David, Uriel o
--     Santiago). `fn_ronda_validar_actor` toma UN `p_modulo`, literal del
--     brief -- no se le cambia la firma (el brief dice "cópialo, no lo
--     reinventes"). Para el caso "cualquiera de los tres", este RPC prueba
--     los tres módulos en secuencia (`inventario_ronda`,
--     `inventario_explicacion`, `inventario_aprobacion`) y basta que UNO
--     autorice. Es seguro porque, para una sesión de NAVEGADOR, la rama de
--     `fn_ronda_validar_actor` ni siquiera mira `p_modulo` -- solo compara
--     identidad -- así que el primer intento (con cualquiera de los tres)
--     ya autoriza a David/Santiago sin falsos negativos. Para Telegram
--     (`service_role`), sí importa cuál de los tres módulos tiene el actor,
--     y por eso se prueban los tres antes de rendirse. Lo que protege CA-9
--     ("ninguna ruta que permita a David o Uriel aplicarla por su cuenta")
--     sigue siendo la guarda de estado `= 'ajuste_aprobado'`, no esta unión
--     de módulos -- exactamente como dice la tabla de §6.2.
--
-- (3) `fn_ronda_emitir_reporte` NO llama a `fn_ronda_validar_actor`. El
--     brief la marca "módulo exigido: — (lo llama el tick)" -- a diferencia
--     de las otras nueve, no hay un actor humano que declarar: el payload
--     llega con el contenido YA resuelto por un proceso automático
--     (`service_role`), sin un David/Uriel/Santiago detrás de esa llamada
--     puntual. `fn_ronda_validar_actor` exige "exactamente uno" de
--     `p_usuario`/`p_telegram` no nulo -- con los dos en NULL, aborta. La
--     autorización de este RPC es exclusivamente de GRANT: `EXECUTE` se
--     revoca de `anon` Y de `authenticated` (nadie desde el navegador debe
--     poder congelar un reporte a mano) y se concede solo a `service_role`
--     -- mismo patrón de exclusividad que `fn_hato_commit_chequeo` (065),
--     aunque ahí sea por otro motivo (DEFINER vs. INVOKER). Es una
--     desviación del texto literal del diagrama de arquitectura del §2 del
--     brief técnico ("todas pasan por fn_ronda_validar_actor()"), que sí
--     lista `emitir_reporte` en esa frase -- se documenta acá como tal, no
--     se oculta. La idempotencia por PK que el brief pide para este RPC
--     ("único por ronda") es justamente lo que permite que un tick que
--     reintenta no duplique nada aunque no haya actor que validar.
--
-- (4b) CORRECCIÓN post-implementación (revisión del orquestador, 2026-08-28,
--     antes de aplicar): la versión original de `fn_ronda_proponer_ajuste`
--     transcribía el §6.2 del brief técnico, que asigna esa RPC solo al
--     módulo `inventario_explicacion` (David). Pero B-5 del brief de
--     producto dice literal *"Como David o como Uriel, quiero proponer el
--     ajuste"* -- cita directa de Santiago en la entrevista (§3.2 punto 8):
--     *"El ajuste lo puede proponer David o Uriel"*. Es una divergencia
--     entre los dos documentos, no una pregunta nueva para el dueño (ya la
--     respondió) -- se corrige para que `fn_ronda_proponer_ajuste` acepte
--     ambos módulos, mismo patrón "probar candidatos en secuencia" que ya
--     usa `fn_ronda_aplicar_ajuste`. Ver el comentario de la función.
--
-- (4) `exige_nota` de `inventario_causas_raiz` (solo `otro` la trae en TRUE,
--     125 §4.2) no tenía ningún lector en el diseño de los RPC del §6 --
--     existe la columna y nada la usa, que es precisamente el patrón que el
--     CLAUDE.md señala como "declarado pero nunca usado". Se agrega la
--     validación evidente en los DOS RPC que escriben una nota junto a una
--     causa (`fn_ronda_proponer_ajuste` con `propuesta_nota`,
--     `fn_ronda_decidir_ajuste` con `decision_nota`): si la causa elegida
--     tiene `exige_nota = true`, la nota no puede venir vacía. No es un
--     criterio de aceptación nuevo -- es la columna cumpliendo el propósito
--     por el que R-7 la sembró ("Otro (con nota)").
--
-- ---------------------------------------------------------------------------
-- VERIFICACIÓN -- QUÉ SE COMPROBÓ Y CONTRA QUÉ
-- ---------------------------------------------------------------------------
-- Esta sesión NO tuvo acceso a un conector MCP de Supabase (ni de solo
-- lectura ni de escritura) -- a diferencia de lo que el CLAUDE.md asume como
-- flujo normal. Lo que sí se hizo, y es más fuerte que una lectura del
-- catálogo:
--
--   * `ls src/sql/migrations/` confirma que el máximo archivo existente es
--     125 (mas un 129 de una sesión en paralelo, saneamiento de precios --
--     sin relación, no colisiona). 126, 127 y 128 están libres. Coincide con
--     el número que pide la tarea.
--   * Se levantó un Postgres 17 real en Docker (`docker run postgres:17`),
--     con un STUB MÍNIMO de lo que 125 declara como precondición
--     (`auth.uid()`/`auth.jwt()` como lecturas de GUC de sesión -- el mismo
--     comportamiento sin validar que documenta la migración 112 --, los
--     roles `anon`/`authenticated`/`service_role`, `usuarios`,
--     `telegram_usuarios`, `productos`, `movimientos_inventario`,
--     `get_user_role()`, `es_usuario_gerencia()`, `update_updated_at_column()`,
--     y el `ALTER DEFAULT PRIVILEGES ... GRANT ALL ... TO anon, authenticated`
--     que Supabase aplica de fábrica -- documentado por la 081 -- y que un
--     Postgres nuevo no trae). El archivo LITERAL de la migración 125 corre
--     limpio contra ese stub y sus propias postcondiciones pasan
--     ("125 OK: 8 tablas creadas..."). Sobre esa base se aplicó y probó ESTE
--     archivo (126) tal cual queda acá, incluyendo el conjunto adversarial
--     de autorización de §12 del brief técnico -- resultado en el reporte de
--     la sesión, no en este comentario, porque un comentario de migración no
--     es el lugar para un log de pruebas.
--   * Tipos y enums verificados contra `src/types/database.ts` (generado):
--     `movimientos_inventario` (id, producto_id, tipo_movimiento, cantidad,
--     unidad, fecha_movimiento, saldo_anterior, saldo_nuevo, responsable,
--     observaciones, notas, factura, lote_aplicacion, aplicacion_id,
--     provisional, valor_movimiento), `tipo_movimiento` con las 4 etiquetas
--     EXACTAS `'Entrada' | 'Salida por Aplicación' | 'Salida Otros' |
--     'Ajuste'`, `productos` (nombre, cantidad_actual, unidad_medida,
--     precio_unitario, activo, updated_by), `telegram_usuarios` (usuario_id
--     nullable, modulos_permitidos, activo, nombre_display), `usuarios`
--     (rol, nombre_completo, email).
--
-- Lo que NO se pudo comprobar en esta sesión (mismo aviso que dejó 125): que
-- el número 126 siga libre en el momento en que esto se aplique, y que las
-- 8 tablas/2 tipos/3 funciones de 125 existan en el catálogo vivo tal como
-- se documentan acá. **Repetir el `ls` y una consulta al catálogo
-- inmediatamente antes de aplicar** -- no confiar en lo escrito acá si pasó
-- tiempo (misma lección que 125 ya dejó, y que el propio brief técnico
-- documenta con DOS renumeraciones en cuatro días).
--
-- NO APLICAR DESDE ESTE AGENTE.
--
-- Estilo de guardas: precondiciones (0.x) con RAISE EXCEPTION, postcondiciones
-- (8.x) que comprueban forma/seguridad/grants de las 11 funciones -- nada
-- idempotente a propósito (precedente 124/125/099).
--
-- ROLLBACK ejecutable comentado al pie (mismo patrón que 080/081/099/107/125).
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. PRECONDICIONES
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_tabla TEXT;
  v_funcion TEXT;
BEGIN
  -- 0.1 Las 8 tablas de 125 deben existir.
  FOREACH v_tabla IN ARRAY ARRAY[
    'rondas_inventario', 'rondas_inventario_alcance', 'inventario_causas_raiz',
    'rondas_transcritos', 'rondas_excepciones', 'rondas_reportes',
    'rondas_avisos', 'inventario_parametros'
  ] LOOP
    IF to_regclass('public.' || v_tabla) IS NULL THEN
      RAISE EXCEPTION '126 ABORTADA: public.% no existe -- la migración 125 (esquema) debe estar aplicada antes que ésta.', v_tabla;
    END IF;
  END LOOP;

  -- 0.2 Los 2 ENUM de 125 deben existir.
  IF to_regtype('public.estado_ronda_inventario') IS NULL THEN
    RAISE EXCEPTION '126 ABORTADA: public.estado_ronda_inventario no existe -- falta 125.';
  END IF;
  IF to_regtype('public.estado_excepcion_inventario') IS NULL THEN
    RAISE EXCEPTION '126 ABORTADA: public.estado_excepcion_inventario no existe -- falta 125.';
  END IF;

  -- 0.3 Las tablas de dominio que los RPC leen/escriben deben existir con la
  --     forma que este archivo asume (verificado contra src/types/database.ts,
  --     ver cabecera).
  IF to_regclass('public.productos') IS NULL THEN
    RAISE EXCEPTION '126 ABORTADA: public.productos no existe.';
  END IF;
  IF to_regclass('public.movimientos_inventario') IS NULL THEN
    RAISE EXCEPTION '126 ABORTADA: public.movimientos_inventario no existe.';
  END IF;
  IF to_regclass('public.telegram_usuarios') IS NULL THEN
    RAISE EXCEPTION '126 ABORTADA: public.telegram_usuarios no existe.';
  END IF;
  IF to_regclass('public.usuarios') IS NULL THEN
    RAISE EXCEPTION '126 ABORTADA: public.usuarios no existe.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'movimientos_inventario'
       AND column_name = 'tipo_movimiento' AND udt_name = 'tipo_movimiento'
  ) THEN
    RAISE EXCEPTION '126 ABORTADA: movimientos_inventario.tipo_movimiento no es del enum tipo_movimiento como se documenta.';
  END IF;

  -- 0.4 tipo_movimiento debe tener EXACTAMENTE las 4 etiquetas que
  --     fn_ronda_resolver_con_captura/fn_ronda_aplicar_ajuste comparan
  --     literalmente.
  IF (SELECT array_agg(enumlabel::TEXT ORDER BY enumlabel) FROM pg_enum WHERE enumtypid = 'public.tipo_movimiento'::regtype)
     IS DISTINCT FROM ARRAY['Ajuste', 'Entrada', 'Salida Otros', 'Salida por Aplicación'] THEN
    RAISE EXCEPTION '126 ABORTADA: tipo_movimiento no tiene exactamente las 4 etiquetas esperadas (Ajuste, Entrada, Salida Otros, Salida por Aplicación). Revisar contra src/types/database.ts antes de continuar.';
  END IF;

  -- 0.5 Los 3 helpers que 125 exigió como precondición deben seguir existiendo
  --     (get_user_role/es_usuario_gerencia, para la guarda de Gerencia de
  --     fn_ronda_decidir_ajuste vía el vínculo usuarios.rol, y para que el
  --     lector de este archivo confíe en que RLS de 125 sigue viva).
  IF to_regprocedure('public.get_user_role()') IS NULL THEN
    RAISE EXCEPTION '126 ABORTADA: public.get_user_role() no existe.';
  END IF;
  IF to_regprocedure('public.es_usuario_gerencia()') IS NULL THEN
    RAISE EXCEPTION '126 ABORTADA: public.es_usuario_gerencia() no existe.';
  END IF;

  -- 0.6 Ninguna de las 11 funciones nuevas puede existir ya con ninguna
  --     firma -- si alguna existe, es evidencia de que esto ya se aplicó (o
  --     de que alguien creó una función con el mismo nombre por otra vía) y
  --     hay que revisar a mano, no pisarla en silencio.
  FOREACH v_funcion IN ARRAY ARRAY[
    'fn_ronda_validar_actor', 'fn_ronda_actor_nombre', 'fn_ronda_abrir',
    'fn_ronda_confirmar_hallazgos', 'fn_ronda_deshacer_confirmacion',
    'fn_ronda_explicacion_david', 'fn_ronda_resolver_con_captura',
    'fn_ronda_proponer_ajuste', 'fn_ronda_decidir_ajuste',
    'fn_ronda_aplicar_ajuste', 'fn_ronda_cerrar', 'fn_ronda_emitir_reporte'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = v_funcion) THEN
      RAISE EXCEPTION '126 ABORTADA: public.%() ya existe. LA CAUSA MÁS PROBABLE ES QUE ESTA MIGRACIÓN YA SE APLICÓ -- este repo tiene historial de migraciones aplicadas sin fila en el ledger (CLAUDE.md), así que la ausencia de fila NO prueba lo contrario. Revisar a mano.', v_funcion;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 1. fn_ronda_validar_actor -- §6.1 del brief técnico, TRANSCRITA LITERAL
-- ---------------------------------------------------------------------------
CREATE FUNCTION fn_ronda_validar_actor(
  p_usuario  UUID,          -- actor_usuario_id del payload
  p_telegram UUID,          -- actor_telegram_usuario_id del payload
  p_modulo   TEXT           -- 'inventario_ronda' | 'inventario_explicacion' | 'inventario_aprobacion'
) RETURNS VOID
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE v_ok BOOLEAN;
BEGIN
  IF (p_usuario IS NULL) = (p_telegram IS NULL) THEN
    RAISE EXCEPTION 'Actor inválido: debe venir exactamente uno de usuario/telegram.';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    -- ── Rama NAVEGADOR ────────────────────────────────────────────────────
    -- Una sesión de navegador SÓLO puede ser ella misma, y NUNCA puede
    -- reclamar una identidad de Telegram. Esto cierra la suplantación por
    -- construcción, no por buena voluntad del llamante.
    IF p_telegram IS NOT NULL THEN
      RAISE EXCEPTION 'Una sesión autenticada no puede actuar como un usuario de Telegram.';
    END IF;
    IF p_usuario <> (SELECT auth.uid()) THEN
      RAISE EXCEPTION 'El actor declarado no coincide con la sesión.';
    END IF;
    RETURN;
  END IF;

  -- ── Rama SERVICE ROLE (bot / tick). auth.uid() es NULL ──────────────────
  IF p_telegram IS NULL THEN
    RAISE EXCEPTION 'Sin sesión autenticada, el actor debe ser un usuario de Telegram.';
  END IF;
  SELECT TRUE INTO v_ok FROM telegram_usuarios t
   WHERE t.id = p_telegram AND t.activo AND p_modulo = ANY(t.modulos_permitidos);
  IF NOT COALESCE(v_ok, FALSE) THEN
    RAISE EXCEPTION 'El usuario de Telegram no está activo o no tiene el módulo %.', p_modulo;
  END IF;
END $$;

COMMENT ON FUNCTION fn_ronda_validar_actor(UUID, UUID, TEXT) IS
  'D-T4/D-T5 (§6.1 brief técnico), transcrita literal. Único punto que decide '
  'si el actor declarado en el payload de un RPC de ronda de inventario es '
  'válido. Rama navegador: el actor debe SER auth.uid(), nunca puede '
  'reclamar una identidad de Telegram. Rama service_role (auth.uid() NULL, '
  'el camino del bot): el actor debe ser un telegram_usuarios.id activo con '
  'p_modulo en modulos_permitidos. NUNCA deriva el actor de la sesión -- '
  'siempre lo recibe explícito y lo valida.';

REVOKE EXECUTE ON FUNCTION fn_ronda_validar_actor(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_ronda_validar_actor(UUID, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION fn_ronda_validar_actor(UUID, UUID, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. fn_ronda_actor_nombre -- helper interno, NO es uno de "los diez".
--    Resuelve un nombre legible para movimientos_inventario.responsable
--    (texto libre, sin FK) sin duplicar la misma subconsulta en los dos RPC
--    que escriben esa columna (resolver_con_captura, aplicar_ajuste).
-- ---------------------------------------------------------------------------
CREATE FUNCTION fn_ronda_actor_nombre(p_usuario UUID, p_telegram UUID)
RETURNS TEXT
LANGUAGE sql SECURITY INVOKER STABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT t.nombre_display FROM telegram_usuarios t WHERE t.id = p_telegram),
    (SELECT COALESCE(u.nombre_completo, u.email) FROM usuarios u WHERE u.id = p_usuario),
    'Ronda de inventario'
  );
$$;

COMMENT ON FUNCTION fn_ronda_actor_nombre(UUID, UUID) IS
  'Helper interno de la migración 126 -- NO es uno de los diez RPC del §6. '
  'Nombre legible del actor para movimientos_inventario.responsable (texto '
  'libre sin FK). "Ronda de inventario" es el último recurso si ninguna de '
  'las dos fuentes resuelve, para que la columna nunca quede vacía en un '
  'movimiento nacido de la ronda.';

REVOKE EXECUTE ON FUNCTION fn_ronda_actor_nombre(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_ronda_actor_nombre(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION fn_ronda_actor_nombre(UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. fn_ronda_abrir -- §6.2. Crea rondas_inventario + rondas_inventario_alcance.
--    es_linea_base se CALCULA (R-17/CA-22), nunca lo manda el cliente.
-- ---------------------------------------------------------------------------
CREATE FUNCTION fn_ronda_abrir(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor_usuario  UUID := NULLIF(payload ->> 'actor_usuario_id', '')::UUID;
  v_actor_telegram UUID := NULLIF(payload ->> 'actor_telegram_usuario_id', '')::UUID;
  v_periodo        DATE := NULLIF(payload ->> 'periodo', '')::DATE;
  v_ronda_id       UUID;
  v_es_linea_base  BOOLEAN;
  v_alcance_count  INTEGER;
BEGIN
  PERFORM fn_ronda_validar_actor(v_actor_usuario, v_actor_telegram, 'inventario_ronda');

  IF v_periodo IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_abrir: periodo es requerido (AAAA-MM-01).';
  END IF;
  IF EXTRACT(DAY FROM v_periodo) <> 1 THEN
    RAISE EXCEPTION 'fn_ronda_abrir: periodo debe ser el primer día del mes que cubre (recibido %). Una ronda = un mes.', v_periodo;
  END IF;

  -- R-17/CA-22: línea base = NO existe ninguna ronda 'cerrada' previa.
  v_es_linea_base := NOT EXISTS (SELECT 1 FROM rondas_inventario WHERE estado = 'cerrada');

  -- Los índices únicos parciales de 125 (una en_curso, un periodo activo por
  -- vez) son la garantía estructural contra dos rondas concurrentes -- no
  -- hace falta un SELECT ... FOR UPDATE previo, un INSERT concurrente que
  -- viole cualquiera de los dos revienta acá con 23505 (unique_violation).
  INSERT INTO rondas_inventario (
    periodo, estado, es_linea_base, abierta_en, abierta_por_usuario, abierta_por_telegram
  ) VALUES (
    v_periodo, 'en_curso', v_es_linea_base, now(), v_actor_usuario, v_actor_telegram
  ) RETURNING id INTO v_ronda_id;

  -- La foto de R-5: TODOS los productos con cantidad_actual > 0 al momento
  -- de abrir (§5.1 brief de producto). NULL evalúa a falso en `> 0`, así que
  -- un producto sin cantidad conocida queda fuera -- correcto, "sin dato"
  -- no es "en existencia". Nada filtra por `activo`: el brief no lo pide, y
  -- un producto con existencia > 0 pero marcado inactivo igual es inventario
  -- físico real que Uriel puede encontrar en bodega.
  INSERT INTO rondas_inventario_alcance (ronda_id, producto_id, cantidad_teorica, unidad, precio_unitario, nombre_producto)
  SELECT v_ronda_id, p.id, p.cantidad_actual, p.unidad_medida, p.precio_unitario, p.nombre
    FROM productos p
   WHERE p.cantidad_actual > 0;
  GET DIAGNOSTICS v_alcance_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ronda_id', v_ronda_id,
    'periodo', v_periodo,
    'estado', 'en_curso',
    'es_linea_base', v_es_linea_base,
    'productos_en_alcance', v_alcance_count
  );
END $$;

COMMENT ON FUNCTION fn_ronda_abrir(JSONB) IS
  'Fase 2, RPC 1/10 (§6.2). Crea la ronda y congela la foto de R-5 (§4.1 '
  'brief técnico) -- productos con cantidad_actual > 0 al momento de abrir. '
  'es_linea_base se calcula acá, nunca lo manda el cliente (R-17/CA-22). Los '
  'índices únicos parciales rondas_inventario_una_en_curso/periodo_unico '
  '(125) son la garantía estructural contra dos rondas concurrentes.';

REVOKE EXECUTE ON FUNCTION fn_ronda_abrir(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_ronda_abrir(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION fn_ronda_abrir(JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. fn_ronda_confirmar_hallazgos -- §6.2. rondas_transcritos -> confirmado
--    + N rondas_excepciones. Re-deriva via_propuesta en SQL (paridad con
--    derivarVia de interpretarNota.ts), ignorando lo que mande el cliente.
-- ---------------------------------------------------------------------------
CREATE FUNCTION fn_ronda_confirmar_hallazgos(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor_usuario  UUID := NULLIF(payload ->> 'actor_usuario_id', '')::UUID;
  v_actor_telegram UUID := NULLIF(payload ->> 'actor_telegram_usuario_id', '')::UUID;
  v_transcrito_id  UUID := NULLIF(payload ->> 'transcrito_id', '')::UUID;
  v_transcrito     RECORD;
  v_hallazgos      JSONB := COALESCE(payload -> 'hallazgos', '[]'::jsonb);
  v_h              JSONB;
  v_indice         INTEGER := 0;
  v_producto_id    UUID;
  v_cantidad_fisica NUMERIC;
  v_fisico_origen  TEXT;
  v_teorico        NUMERIC;
  v_observacion    TEXT;
  v_explicacion_citada TEXT;
  v_causa_clave    TEXT;
  v_causa_confianza TEXT;
  v_causa_sugerida TEXT;
  v_via            TEXT;
  v_estado_inicial estado_excepcion_inventario;
  v_creadas        INTEGER := 0;
  v_ids            UUID[] := ARRAY[]::UUID[];
  v_excepcion_id   UUID;
BEGIN
  PERFORM fn_ronda_validar_actor(v_actor_usuario, v_actor_telegram, 'inventario_ronda');

  IF v_transcrito_id IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_confirmar_hallazgos: transcrito_id es requerido.';
  END IF;

  -- FOR UPDATE sobre el transcrito Y su estado: un doble toque de "Confirmar"
  -- (dos requests concurrentes con el mismo transcrito_id) se serializa acá
  -- -- la segunda ve estado='confirmado' (ya escrito por la primera) y
  -- aborta antes de duplicar ninguna excepción.
  SELECT * INTO v_transcrito FROM rondas_transcritos WHERE id = v_transcrito_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_confirmar_hallazgos: no existe rondas_transcritos %.', v_transcrito_id;
  END IF;
  IF v_transcrito.estado <> 'preview_pendiente' THEN
    RAISE EXCEPTION 'fn_ronda_confirmar_hallazgos: el transcrito % no está pendiente de confirmación (estado actual: %). Un doble toque de Confirmar no duplica excepciones.', v_transcrito_id, v_transcrito.estado;
  END IF;

  IF jsonb_typeof(v_hallazgos) <> 'array' THEN
    RAISE EXCEPTION 'fn_ronda_confirmar_hallazgos: "hallazgos" debe ser un arreglo JSON.';
  END IF;

  FOR v_h IN SELECT * FROM jsonb_array_elements(v_hallazgos) LOOP
    v_indice := v_indice + 1;

    v_producto_id := NULLIF(v_h ->> 'producto_id', '')::UUID;
    -- CA-32: rechaza CUALQUIER hallazgo sin producto_id resuelto. Aborta la
    -- transacción entera (ningún hallazgo de este transcrito queda a medio
    -- confirmar) -- la unidad de confirmar es el transcrito completo (CA-35).
    IF v_producto_id IS NULL THEN
      RAISE EXCEPTION 'fn_ronda_confirmar_hallazgos: hallazgo % sin producto_id resuelto (CA-32) -- no se puede confirmar un hallazgo "no identificado".', v_indice;
    END IF;

    v_cantidad_fisica := (v_h ->> 'cantidad_fisica')::NUMERIC;
    IF v_cantidad_fisica IS NULL THEN
      RAISE EXCEPTION 'fn_ronda_confirmar_hallazgos: hallazgo % sin cantidad_fisica.', v_indice;
    END IF;

    v_fisico_origen := v_h ->> 'fisico_origen';
    IF v_fisico_origen NOT IN ('dictado', 'derivado') THEN
      RAISE EXCEPTION 'fn_ronda_confirmar_hallazgos: hallazgo % con fisico_origen inválido (%). Debe ser "dictado" o "derivado" (R-19/CA-31).', v_indice, v_fisico_origen;
    END IF;

    -- El teórico SIEMPRE sale de la foto congelada de esta ronda (R-5/R-19),
    -- nunca de lo que mande el payload.
    SELECT cantidad_teorica INTO v_teorico
      FROM rondas_inventario_alcance
     WHERE ronda_id = v_transcrito.ronda_id AND producto_id = v_producto_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'fn_ronda_confirmar_hallazgos: hallazgo % -- el producto % no está en el alcance congelado de la ronda % (P-3: un producto que entra a existencia > 0 durante una ronda abierta no se agrega al alcance).', v_indice, v_producto_id, v_transcrito.ronda_id;
    END IF;

    v_observacion := NULLIF(v_h ->> 'observacion_uriel', '');
    v_explicacion_citada := NULLIF(v_h ->> 'explicacion_citada', '');
    v_causa_clave := NULLIF(v_h ->> 'causa_clave', '');
    v_causa_confianza := COALESCE(v_h ->> 'causa_confianza', 'ninguna');
    IF v_causa_confianza NOT IN ('alta', 'baja', 'ninguna') THEN
      v_causa_confianza := 'ninguna';
    END IF;

    -- ═══ RE-DERIVACIÓN DE via_propuesta EN SQL -- §5.5 brief técnico,
    --     paridad con derivarVia() de src/utils/rondaInventario/interpretarNota.ts.
    --     Ignora cualquier "via"/"via_propuesta" que el cliente pudiera
    --     mandar en el payload -- ni siquiera se lee esa clave (CA-34).
    --     R-18: cualquier duda cae a 'aprobacion_gerencia'.
    v_via := NULL;
    v_causa_sugerida := NULL;
    IF v_causa_clave IS NOT NULL THEN
      SELECT clave INTO v_causa_sugerida FROM inventario_causas_raiz WHERE clave = v_causa_clave;
    END IF;
    IF v_causa_confianza = 'alta' AND v_causa_clave IS NOT NULL THEN
      SELECT via INTO v_via FROM inventario_causas_raiz WHERE clave = v_causa_clave AND activo;
    END IF;
    IF v_via IS NULL THEN
      v_via := 'aprobacion_gerencia';
    END IF;

    v_estado_inicial := CASE
      WHEN v_explicacion_citada IS NOT NULL THEN 'explicacion_precargada'::estado_excepcion_inventario
      ELSE 'reportada'::estado_excepcion_inventario
    END;

    INSERT INTO rondas_excepciones (
      ronda_id, transcrito_id, producto_id, estado,
      cantidad_fisica, fisico_origen, teorico_conteo, observacion_uriel,
      reportada_por_usuario, reportada_por_telegram,
      explicacion_citada,
      via_propuesta, causa_sugerida, interprete_confianza
    ) VALUES (
      v_transcrito.ronda_id, v_transcrito_id, v_producto_id, v_estado_inicial,
      v_cantidad_fisica, v_fisico_origen, v_teorico, v_observacion,
      v_actor_usuario, v_actor_telegram,
      v_explicacion_citada,
      v_via, v_causa_sugerida, v_causa_confianza::TEXT
    ) RETURNING id INTO v_excepcion_id;

    v_ids := array_append(v_ids, v_excepcion_id);
    v_creadas := v_creadas + 1;
  END LOOP;

  UPDATE rondas_transcritos SET estado = 'confirmado', confirmado_en = now() WHERE id = v_transcrito_id;

  RETURN jsonb_build_object(
    'transcrito_id', v_transcrito_id,
    'excepciones_creadas', v_creadas,
    'excepcion_ids', to_jsonb(v_ids)
  );
END $$;

COMMENT ON FUNCTION fn_ronda_confirmar_hallazgos(JSONB) IS
  'Fase 2, RPC 2/10 (§6.2). rondas_transcritos -> confirmado + N '
  'rondas_excepciones. FOR UPDATE sobre el transcrito y su estado evita que '
  'un doble toque de Confirmar duplique excepciones. Rechaza cualquier '
  'hallazgo sin producto_id resuelto (CA-32). Re-deriva via_propuesta contra '
  'inventario_causas_raiz acá mismo, IGNORANDO cualquier vía que mande el '
  'cliente -- paridad TS/SQL verificada por '
  'src/__tests__/rondaInventarioRpcParidad.test.ts.';

REVOKE EXECUTE ON FUNCTION fn_ronda_confirmar_hallazgos(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_ronda_confirmar_hallazgos(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION fn_ronda_confirmar_hallazgos(JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. fn_ronda_deshacer_confirmacion -- P-1, §6.5. TRES condiciones de
--    ventana, la tercera ("ronda en_curso") es la que P-1 destapó y no
--    estaba escrita en el brief de producto original.
-- ---------------------------------------------------------------------------
CREATE FUNCTION fn_ronda_deshacer_confirmacion(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor_usuario  UUID := NULLIF(payload ->> 'actor_usuario_id', '')::UUID;
  v_actor_telegram UUID := NULLIF(payload ->> 'actor_telegram_usuario_id', '')::UUID;
  v_transcrito_id  UUID := NULLIF(payload ->> 'transcrito_id', '')::UUID;
  v_transcrito     RECORD;
  v_ronda          RECORD;
  v_borradas       INTEGER;
BEGIN
  PERFORM fn_ronda_validar_actor(v_actor_usuario, v_actor_telegram, 'inventario_ronda');

  IF v_transcrito_id IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_deshacer_confirmacion: transcrito_id es requerido.';
  END IF;

  -- 1. El transcrito debe estar 'confirmado' -- si no, no hay nada que deshacer.
  SELECT * INTO v_transcrito FROM rondas_transcritos WHERE id = v_transcrito_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_deshacer_confirmacion: no existe rondas_transcritos %.', v_transcrito_id;
  END IF;
  IF v_transcrito.estado <> 'confirmado' THEN
    RAISE EXCEPTION 'fn_ronda_deshacer_confirmacion: el transcrito % no está confirmado (estado actual: %) -- no hay nada que deshacer.', v_transcrito_id, v_transcrito.estado;
  END IF;

  -- 2. La ronda debe seguir 'en_curso' -- LA CONDICIÓN QUE P-1 DESTAPÓ. Si el
  --    reporte de cierre ya se emitió (lo cual solo puede pasar sobre una
  --    ronda 'cerrada' -- fn_ronda_emitir_reporte lo exige), borrar una
  --    excepción acá dejaría ese reporte CONGELADO nombrando N excepciones
  --    contra una tabla con N-1, y R-10 prohíbe recalcularlo. Comprobar
  --    'en_curso' es equivalente a comprobar "el reporte todavía no existe",
  --    sin necesidad de consultar rondas_reportes aparte.
  SELECT * INTO v_ronda FROM rondas_inventario WHERE id = v_transcrito.ronda_id FOR UPDATE;
  IF v_ronda.estado <> 'en_curso' THEN
    RAISE EXCEPTION 'fn_ronda_deshacer_confirmacion: la ronda % ya no está en curso (estado: %) -- no se puede deshacer sobre una ronda cerrada, cuyo reporte de cierre pudo haberse emitido ya (R-10 prohíbe recalcularlo).', v_transcrito.ronda_id, v_ronda.estado;
  END IF;

  -- 3. NINGUNA excepción de este transcrito puede tener explicacion_david_en
  --    IS NOT NULL -- si David ya tocó UNA sola, no se deshace NINGUNA. La
  --    unidad de deshacer es el transcrito entero, igual que la unidad de
  --    confirmar (CA-35).
  IF EXISTS (
    SELECT 1 FROM rondas_excepciones
     WHERE transcrito_id = v_transcrito_id AND explicacion_david_en IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'fn_ronda_deshacer_confirmacion: al menos una excepción del transcrito % ya fue tocada por David -- no se deshace ninguna (la unidad de deshacer es el transcrito completo).', v_transcrito_id;
  END IF;

  DELETE FROM rondas_excepciones WHERE transcrito_id = v_transcrito_id;
  GET DIAGNOSTICS v_borradas = ROW_COUNT;

  -- intentos_preview NO se toca (§4.3 brief técnico): si se reiniciara,
  -- Deshacer sería un rodeo infinito alrededor del tope de CA-35.
  UPDATE rondas_transcritos SET estado = 'preview_pendiente', confirmado_en = NULL WHERE id = v_transcrito_id;

  RETURN jsonb_build_object(
    'deshecho', TRUE,
    'transcrito_id', v_transcrito_id,
    'excepciones_borradas', v_borradas
  );
END $$;

COMMENT ON FUNCTION fn_ronda_deshacer_confirmacion(JSONB) IS
  'Fase 2, RPC nuevo de P-1 (§6.5, decisión del dueño 2026-08-28). Borra las '
  'excepciones nacidas de un transcrito recién confirmado y lo devuelve a '
  'preview_pendiente, dentro de una ventana de TRES condiciones: (1) el '
  'transcrito debe estar confirmado, (2) la ronda debe seguir en_curso -- si '
  'el reporte de cierre ya se emitió (siempre sobre una ronda cerrada), '
  'deshacer dejaría el reporte congelado (R-10) mintiendo un número que la '
  'tabla ya no tiene --, (3) ninguna excepción del mismo transcrito puede '
  'tener explicacion_david_en (David no la tocó todavía). Es el ÚNICO RPC de '
  'todo este conjunto que solo funciona por Telegram: borra filas sin '
  'política DELETE en rondas_excepciones (125 §4.6), apoyado en el bypass de '
  'RLS de service_role. Si algún día se quiere un Deshacer desde la web, '
  'hace falta agregar una política DELETE aparte -- decisión explícita, no '
  'un descuido de este RPC.';

REVOKE EXECUTE ON FUNCTION fn_ronda_deshacer_confirmacion(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_ronda_deshacer_confirmacion(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION fn_ronda_deshacer_confirmacion(JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. fn_ronda_explicacion_david -- §6.2. Las 5 columnas explicacion_david_*,
--    estado -> 'explicada'. Sólo válido si la excepción está en
--    'reportada'/'explicacion_precargada'.
-- ---------------------------------------------------------------------------
CREATE FUNCTION fn_ronda_explicacion_david(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor_usuario  UUID := NULLIF(payload ->> 'actor_usuario_id', '')::UUID;
  v_actor_telegram UUID := NULLIF(payload ->> 'actor_telegram_usuario_id', '')::UUID;
  v_excepcion_id   UUID := NULLIF(payload ->> 'excepcion_id', '')::UUID;
  v_explicacion    TEXT := NULLIF(payload ->> 'explicacion_david', '');
  v_accion         TEXT := payload ->> 'explicacion_david_accion';
  v_excepcion      RECORD;
BEGIN
  PERFORM fn_ronda_validar_actor(v_actor_usuario, v_actor_telegram, 'inventario_explicacion');

  IF v_excepcion_id IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_explicacion_david: excepcion_id es requerido.';
  END IF;
  IF v_explicacion IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_explicacion_david: explicacion_david no puede venir vacía -- es la palabra de David, CA-38 exige que exista antes de avanzar la excepción.';
  END IF;
  IF v_accion NOT IN ('confirmo_cita', 'corrigio_cita', 'explico_directo') THEN
    RAISE EXCEPTION 'fn_ronda_explicacion_david: explicacion_david_accion inválida (%). Debe ser confirmo_cita, corrigio_cita o explico_directo.', v_accion;
  END IF;

  SELECT * INTO v_excepcion FROM rondas_excepciones WHERE id = v_excepcion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_explicacion_david: no existe rondas_excepciones %.', v_excepcion_id;
  END IF;
  IF v_excepcion.estado NOT IN ('reportada', 'explicacion_precargada') THEN
    RAISE EXCEPTION 'fn_ronda_explicacion_david: la excepción % no está en un estado válido para que David explique (estado actual: %). Sólo "reportada" o "explicacion_precargada".', v_excepcion_id, v_excepcion.estado;
  END IF;

  UPDATE rondas_excepciones SET
    explicacion_david = v_explicacion,
    explicacion_david_accion = v_accion,
    explicacion_david_en = now(),
    explicacion_david_usuario = v_actor_usuario,
    explicacion_david_telegram = v_actor_telegram,
    estado = 'explicada'
  WHERE id = v_excepcion_id;

  RETURN jsonb_build_object('excepcion_id', v_excepcion_id, 'estado', 'explicada');
END $$;

COMMENT ON FUNCTION fn_ronda_explicacion_david(JSONB) IS
  'Fase 2, RPC 4/10 (§6.2). Llena las 5 columnas explicacion_david_*, estado '
  '-> explicada. CA-38: la explicacion_citada de Uriel NUNCA se convierte en '
  'esta -- es un INSERT en columnas distintas, hecho acá por David, con su '
  'propio sello de tiempo. Sólo válido si la excepción está en '
  '"reportada"/"explicacion_precargada" (el CHECK '
  'excepcion_avanza_solo_con_david de 125 hace además IMPOSIBLE que un '
  'estado posterior exista sin este paso).';

REVOKE EXECUTE ON FUNCTION fn_ronda_explicacion_david(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_ronda_explicacion_david(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION fn_ronda_explicacion_david(JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. fn_ronda_resolver_con_captura -- §6.3, vía (a). Pseudocódigo LITERAL del
--    brief técnico, paso a paso.
-- ---------------------------------------------------------------------------
CREATE FUNCTION fn_ronda_resolver_con_captura(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor_usuario  UUID := NULLIF(payload ->> 'actor_usuario_id', '')::UUID;
  v_actor_telegram UUID := NULLIF(payload ->> 'actor_telegram_usuario_id', '')::UUID;
  v_excepcion_id   UUID := NULLIF(payload ->> 'excepcion_id', '')::UUID;
  v_tipo           TEXT := payload ->> 'tipo_movimiento';
  v_cantidad       NUMERIC := (payload ->> 'cantidad')::NUMERIC;
  v_fecha          DATE := NULLIF(payload ->> 'fecha_movimiento', '')::DATE;
  v_observaciones  TEXT := NULLIF(payload ->> 'observaciones', '');
  v_factura        TEXT := NULLIF(payload ->> 'factura', '');
  v_lote_aplicacion TEXT := NULLIF(payload ->> 'lote_aplicacion', '');
  v_aplicacion_id  UUID := NULLIF(payload ->> 'aplicacion_id', '')::UUID;

  v_excepcion      RECORD;
  v_producto       RECORD;
  v_saldo_anterior NUMERIC;
  v_saldo_nuevo    NUMERIC;
  v_movimiento_id  UUID;
BEGIN
  -- 1. fn_ronda_validar_actor(..., 'inventario_explicacion')
  PERFORM fn_ronda_validar_actor(v_actor_usuario, v_actor_telegram, 'inventario_explicacion');

  IF v_excepcion_id IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: excepcion_id es requerido.';
  END IF;
  IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: cantidad debe ser un número positivo (recibido %).', v_cantidad;
  END IF;
  IF v_fecha IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: fecha_movimiento es requerida -- CA-8 exige la fecha REAL del movimiento, nunca "hoy" por defecto.';
  END IF;

  -- 2. SELECT ... FOR UPDATE -- estado debe ser 'explicada' y
  --    explicacion_david_en IS NOT NULL (CA-38: la cita no habilita nada;
  --    redundante con el CHECK excepcion_avanza_solo_con_david, a propósito).
  SELECT * INTO v_excepcion FROM rondas_excepciones WHERE id = v_excepcion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: no existe rondas_excepciones %.', v_excepcion_id;
  END IF;
  IF v_excepcion.estado <> 'explicada' OR v_excepcion.explicacion_david_en IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: la excepción % no está "explicada" por David (estado: %, explicacion_david_en: %) -- CA-38, la cita de Uriel no habilita esta vía.', v_excepcion_id, v_excepcion.estado, v_excepcion.explicacion_david_en;
  END IF;

  -- 3. tipo_movimiento <> 'Ajuste' -- CA-8 literal: "no se registra como ajuste".
  IF v_tipo NOT IN ('Entrada', 'Salida por Aplicación', 'Salida Otros') THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: tipo_movimiento inválido (%) -- CA-8 exige el movimiento REAL que fue (Entrada, Salida por Aplicación o Salida Otros), nunca "Ajuste".', v_tipo;
  END IF;

  -- 4. SELECT cantidad_actual FROM productos FOR UPDATE -- saldo resultante >= 0
  --    (productos.cantidad_actual no tiene CHECK >= 0 en ningún lado, misma
  --    guarda (b) de la migración 106).
  SELECT id, cantidad_actual, unidad_medida, precio_unitario, activo
    INTO v_producto FROM productos WHERE id = v_excepcion.producto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: no existe productos % (referenciado por la excepción).', v_excepcion.producto_id;
  END IF;

  v_saldo_anterior := COALESCE(v_producto.cantidad_actual, 0);
  IF v_tipo = 'Entrada' THEN
    v_saldo_nuevo := v_saldo_anterior + v_cantidad;
  ELSE
    -- 'Salida por Aplicación' | 'Salida Otros' -- ver decisión (1) de la
    -- cabecera: cantidad guardada como magnitud positiva, dirección real en
    -- saldo_anterior/saldo_nuevo (precedente migración 106).
    v_saldo_nuevo := v_saldo_anterior - v_cantidad;
    IF v_saldo_nuevo < 0 THEN
      RAISE EXCEPTION 'fn_ronda_resolver_con_captura: % dejaría a % en saldo negativo (actual %, movimiento %).', v_tipo, v_producto.id, v_saldo_anterior, v_cantidad;
    END IF;
  END IF;

  -- 5. INSERT movimientos_inventario (fecha REAL del movimiento, no hoy)
  INSERT INTO movimientos_inventario (
    producto_id, tipo_movimiento, cantidad, unidad, fecha_movimiento,
    saldo_anterior, saldo_nuevo, responsable, observaciones, factura,
    lote_aplicacion, aplicacion_id, provisional, valor_movimiento
  ) VALUES (
    v_producto.id, v_tipo::tipo_movimiento, v_cantidad, v_producto.unidad_medida, v_fecha,
    v_saldo_anterior, v_saldo_nuevo,
    fn_ronda_actor_nombre(v_actor_usuario, v_actor_telegram),
    COALESCE(v_observaciones, 'Captura directa -- ronda de inventario, excepción ' || v_excepcion_id::TEXT),
    v_factura, v_lote_aplicacion, v_aplicacion_id, FALSE,
    v_cantidad * COALESCE(v_producto.precio_unitario, 0)
  ) RETURNING id INTO v_movimiento_id;

  -- 6. UPDATE productos SET cantidad_actual = <nuevo>
  UPDATE productos SET cantidad_actual = v_saldo_nuevo WHERE id = v_producto.id;

  -- 7. UPDATE rondas_excepciones -> resuelta_con_captura
  UPDATE rondas_excepciones SET
    estado = 'resuelta_con_captura',
    captura_movimiento_id = v_movimiento_id,
    captura_en = now(),
    captura_por_usuario = v_actor_usuario,
    captura_por_telegram = v_actor_telegram
  WHERE id = v_excepcion_id;

  RETURN jsonb_build_object(
    'excepcion_id', v_excepcion_id,
    'movimiento_id', v_movimiento_id,
    'saldo_anterior', v_saldo_anterior,
    'saldo_nuevo', v_saldo_nuevo
  );
END $$;

COMMENT ON FUNCTION fn_ronda_resolver_con_captura(JSONB) IS
  'Fase 2, RPC 5/10 (§6.3), vía (a) de R-14. Registra el movimiento REAL que '
  'explica la diferencia (Entrada/Salida por Aplicación/Salida Otros, NUNCA '
  'Ajuste -- CA-8), ligado a la excepción, sin pasar por Santiago. Valida '
  'TODO antes de escribir nada (molde de la migración 106): estado '
  '"explicada" con FOR UPDATE, tipo_movimiento válido, saldo resultante >= 0 '
  'con FOR UPDATE sobre productos. cantidad se guarda como magnitud '
  'positiva (decisión documentada en la cabecera de este archivo).';

REVOKE EXECUTE ON FUNCTION fn_ronda_resolver_con_captura(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_ronda_resolver_con_captura(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION fn_ronda_resolver_con_captura(JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. fn_ronda_proponer_ajuste -- §6.2. Columnas propuesta_*, estado ->
--    'ajuste_propuesto'. Exige explicacion_david_en IS NOT NULL. No toca
--    inventario.
-- ---------------------------------------------------------------------------
CREATE FUNCTION fn_ronda_proponer_ajuste(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor_usuario  UUID := NULLIF(payload ->> 'actor_usuario_id', '')::UUID;
  v_actor_telegram UUID := NULLIF(payload ->> 'actor_telegram_usuario_id', '')::UUID;
  v_excepcion_id   UUID := NULLIF(payload ->> 'excepcion_id', '')::UUID;
  v_causa_clave    TEXT := payload ->> 'propuesta_causa';
  v_nota           TEXT := NULLIF(payload ->> 'propuesta_nota', '');
  v_excepcion      RECORD;
  v_causa          RECORD;
  v_delta          NUMERIC;
  v_modulo_intento TEXT;
  v_autorizado     BOOLEAN := FALSE;
  v_ultimo_error   TEXT;
BEGIN
  -- CORRECCIÓN (revisión del dueño, 2026-08-28): B-5 del brief de producto
  -- dice literal "Como David o como Uriel, quiero proponer el ajuste" --
  -- cita directa de Santiago en la entrevista (§3.2 punto 8): "El ajuste lo
  -- puede proponer David o Uriel". La primera versión de este RPC (Fase 2)
  -- transcribió el §6.2 del brief técnico, que sólo listaba
  -- 'inventario_explicacion' (David) -- una divergencia entre los dos
  -- documentos, no una reinterpretación de la decisión ya aprobada. Se
  -- corrige acá para que ambos módulos autoricen, mismo patrón de "probar
  -- los candidatos en secuencia" que ya usa fn_ronda_aplicar_ajuste.
  -- Santiago NO propone (B-5 sólo nombra a David/Uriel; B-6 es su rol, y es
  -- otro RPC) -- por eso la lista NO incluye 'inventario_aprobacion'.
  FOREACH v_modulo_intento IN ARRAY ARRAY['inventario_ronda', 'inventario_explicacion'] LOOP
    BEGIN
      PERFORM fn_ronda_validar_actor(v_actor_usuario, v_actor_telegram, v_modulo_intento);
      v_autorizado := TRUE;
      EXIT;
    EXCEPTION WHEN OTHERS THEN
      v_ultimo_error := SQLERRM;
    END;
  END LOOP;
  IF NOT v_autorizado THEN
    RAISE EXCEPTION 'fn_ronda_proponer_ajuste: actor no autorizado -- debe tener el módulo inventario_ronda (Uriel) o inventario_explicacion (David), nunca inventario_aprobacion (B-5: Santiago no propone, sólo decide). Último error: %', v_ultimo_error;
  END IF;

  IF v_excepcion_id IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_proponer_ajuste: excepcion_id es requerido.';
  END IF;
  IF v_causa_clave IS NULL OR v_causa_clave = '' THEN
    RAISE EXCEPTION 'fn_ronda_proponer_ajuste: propuesta_causa es requerida.';
  END IF;

  SELECT * INTO v_causa FROM inventario_causas_raiz WHERE clave = v_causa_clave AND activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_proponer_ajuste: "%" no es una causa raíz activa del catálogo (R-7).', v_causa_clave;
  END IF;
  -- Decisión (4) de la cabecera: exige_nota deja de ser una columna
  -- declarada sin lector.
  IF v_causa.exige_nota AND v_nota IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_proponer_ajuste: la causa "%s" exige una nota (R-7, "Otro (con nota)") y propuesta_nota vino vacía.', v_causa.etiqueta;
  END IF;

  SELECT * INTO v_excepcion FROM rondas_excepciones WHERE id = v_excepcion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_proponer_ajuste: no existe rondas_excepciones %.', v_excepcion_id;
  END IF;
  IF v_excepcion.explicacion_david_en IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_proponer_ajuste: la excepción % todavía no tiene explicación de David -- no se puede proponer un ajuste antes de esa palabra (CA-38).', v_excepcion_id;
  END IF;

  -- R-4: el delta se calcula de los dos valores YA CONGELADOS en la
  -- excepción (físico reportado, teórico del momento del conteo), nunca de
  -- un número que mande el cliente.
  v_delta := v_excepcion.cantidad_fisica - v_excepcion.teorico_conteo;

  UPDATE rondas_excepciones SET
    estado = 'ajuste_propuesto',
    propuesta_delta = v_delta,
    propuesta_causa = v_causa_clave,
    propuesta_nota = v_nota,
    propuesta_en = now(),
    propuesta_por_usuario = v_actor_usuario,
    propuesta_por_telegram = v_actor_telegram
  WHERE id = v_excepcion_id;

  RETURN jsonb_build_object('excepcion_id', v_excepcion_id, 'estado', 'ajuste_propuesto', 'propuesta_delta', v_delta);
END $$;

COMMENT ON FUNCTION fn_ronda_proponer_ajuste(JSONB) IS
  'Fase 2, RPC 6/10 (§6.2). Vía (b) de R-14, primer paso: columnas '
  'propuesta_*, estado -> ajuste_propuesto. Exige explicacion_david_en IS '
  'NOT NULL. propuesta_delta se calcula server-side de los dos valores YA '
  'congelados en la excepción (R-4). NO toca inventario -- proponer no es '
  'aprobar (B-5). Autoriza inventario_ronda (Uriel) O inventario_explicacion '
  '(David) -- corregido tras revisión del dueño, 2026-08-28: B-5 dice '
  'literal "David o Uriel", cita directa de Santiago (§3.2 punto 8 del '
  'brief de producto). Nunca inventario_aprobacion -- Santiago decide '
  '(B-6/fn_ronda_decidir_ajuste), no propone.';

REVOKE EXECUTE ON FUNCTION fn_ronda_proponer_ajuste(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_ronda_proponer_ajuste(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION fn_ronda_proponer_ajuste(JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. fn_ronda_decidir_ajuste -- §6.1/§6.2. Columnas decision_*, estado ->
--    'ajuste_aprobado'/'ajuste_desestimado'. decision_causa NOT NULL (CA-11).
--    Guarda de Gerencia por el vínculo telegram_usuarios.usuario_id ->
--    usuarios.rol, LITERAL del §6.1 (NO usa es_usuario_gerencia()).
-- ---------------------------------------------------------------------------
CREATE FUNCTION fn_ronda_decidir_ajuste(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor_usuario  UUID := NULLIF(payload ->> 'actor_usuario_id', '')::UUID;
  v_actor_telegram UUID := NULLIF(payload ->> 'actor_telegram_usuario_id', '')::UUID;
  v_excepcion_id   UUID := NULLIF(payload ->> 'excepcion_id', '')::UUID;
  v_decision       TEXT := payload ->> 'decision';
  v_causa_clave    TEXT := payload ->> 'decision_causa';
  v_nota           TEXT := NULLIF(payload ->> 'decision_nota', '');
  v_excepcion      RECORD;
  v_causa          RECORD;
  v_estado_nuevo   estado_excepcion_inventario;
BEGIN
  PERFORM fn_ronda_validar_actor(v_actor_usuario, v_actor_telegram, 'inventario_aprobacion');

  -- Guarda de Gerencia -- §6.1 brief técnico, LITERAL. El helper de rol
  -- SECURITY DEFINER de la 073/093 NO sirve acá: está definido sobre
  -- auth.uid(), y con service_role (Santiago respondiendo desde Telegram)
  -- auth.uid() es NULL y esa función daría falso siempre. Este vínculo sí
  -- resuelve los dos casos porque Santiago ES usuario web además de usuario
  -- de Telegram.
  IF NOT EXISTS (
    SELECT 1 FROM usuarios u
     WHERE u.rol = 'Gerencia'::rol_usuario
       AND u.id = COALESCE(v_actor_usuario, (SELECT t.usuario_id FROM telegram_usuarios t WHERE t.id = v_actor_telegram))
  ) THEN
    RAISE EXCEPTION 'Aprobar o desestimar un ajuste es exclusivo de Gerencia (R-14 vía b).';
  END IF;

  IF v_excepcion_id IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_decidir_ajuste: excepcion_id es requerido.';
  END IF;
  IF v_decision NOT IN ('aprobado', 'desestimado') THEN
    RAISE EXCEPTION 'fn_ronda_decidir_ajuste: decision inválida (%) -- debe ser "aprobado" o "desestimado".', v_decision;
  END IF;
  -- CA-11: decision_causa NOT NULL SIEMPRE, aprobado o desestimado -- B-6
  -- ("clasificar la causa Y aprobar o desestimar" son una sola acción).
  IF v_causa_clave IS NULL OR v_causa_clave = '' THEN
    RAISE EXCEPTION 'fn_ronda_decidir_ajuste: decision_causa es requerida (CA-11) -- Santiago siempre clasifica la causa, apruebe o desestime.';
  END IF;

  SELECT * INTO v_causa FROM inventario_causas_raiz WHERE clave = v_causa_clave AND activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_decidir_ajuste: "%" no es una causa raíz activa del catálogo (R-7).', v_causa_clave;
  END IF;
  IF v_causa.exige_nota AND v_nota IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_decidir_ajuste: la causa "%s" exige una nota (R-7, "Otro (con nota)") y decision_nota vino vacía.', v_causa.etiqueta;
  END IF;

  SELECT * INTO v_excepcion FROM rondas_excepciones WHERE id = v_excepcion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_decidir_ajuste: no existe rondas_excepciones %.', v_excepcion_id;
  END IF;
  IF v_excepcion.estado <> 'ajuste_propuesto' THEN
    RAISE EXCEPTION 'fn_ronda_decidir_ajuste: la excepción % no tiene un ajuste propuesto pendiente de decisión (estado actual: %).', v_excepcion_id, v_excepcion.estado;
  END IF;

  v_estado_nuevo := CASE WHEN v_decision = 'aprobado' THEN 'ajuste_aprobado' ELSE 'ajuste_desestimado' END;

  UPDATE rondas_excepciones SET
    estado = v_estado_nuevo,
    decision_causa = v_causa_clave,
    decision_nota = v_nota,
    decision_en = now(),
    decision_por_usuario = v_actor_usuario,
    decision_por_telegram = v_actor_telegram
  WHERE id = v_excepcion_id;

  RETURN jsonb_build_object('excepcion_id', v_excepcion_id, 'estado', v_estado_nuevo);
END $$;

COMMENT ON FUNCTION fn_ronda_decidir_ajuste(JSONB) IS
  'Fase 2, RPC 7/10 (§6.1/§6.2). Vía (b) de R-14, segundo paso: columnas '
  'decision_*, estado -> ajuste_aprobado/ajuste_desestimado. decision_causa '
  'NOT NULL SIEMPRE (CA-11), aprobado o desestimado. Guarda de Gerencia por '
  'el vínculo telegram_usuarios.usuario_id -> usuarios.rol = ''Gerencia'' -- '
  'NUNCA es_usuario_gerencia(), que con service_role daría falso siempre '
  '(§6.1 brief técnico, literal).';

REVOKE EXECUTE ON FUNCTION fn_ronda_decidir_ajuste(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_ronda_decidir_ajuste(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION fn_ronda_decidir_ajuste(JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. fn_ronda_aplicar_ajuste -- §6.4. DELTA, nunca fijación. Si el teórico
--     vivo difiere del congelado, informa antes de aplicar y NO aplica en
--     silencio (CA-2). Acepta los tres módulos -- ver decisión (2) de la
--     cabecera.
-- ---------------------------------------------------------------------------
CREATE FUNCTION fn_ronda_aplicar_ajuste(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor_usuario  UUID := NULLIF(payload ->> 'actor_usuario_id', '')::UUID;
  v_actor_telegram UUID := NULLIF(payload ->> 'actor_telegram_usuario_id', '')::UUID;
  v_excepcion_id   UUID := NULLIF(payload ->> 'excepcion_id', '')::UUID;
  v_fecha          DATE := NULLIF(payload ->> 'fecha_movimiento', '')::DATE;
  v_confirmar_cambio BOOLEAN := COALESCE((payload ->> 'confirmar_cambio_teorico')::BOOLEAN, FALSE);

  v_modulo         TEXT;
  v_autorizado     BOOLEAN := FALSE;
  v_ultimo_error   TEXT;

  v_excepcion      RECORD;
  v_producto       RECORD;
  v_ronda          RECORD;
  v_causa          RECORD;
  v_delta          NUMERIC;
  v_vivo           NUMERIC;
  v_nuevo          NUMERIC;
  v_movimiento_id  UUID;
  v_observaciones  TEXT;
BEGIN
  -- Decisión (2) de la cabecera: fn_ronda_validar_actor toma UN p_modulo
  -- (literal del brief, no se le cambia la firma). "Cualquiera de los tres"
  -- se resuelve probando los tres -- para una sesión de navegador el primer
  -- intento ya autoriza (esa rama no mira p_modulo); para Telegram, importa
  -- cuál de los tres tiene el actor.
  IF v_excepcion_id IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_aplicar_ajuste: excepcion_id es requerido.';
  END IF;
  IF v_fecha IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_aplicar_ajuste: fecha_movimiento es requerida.';
  END IF;

  FOREACH v_modulo IN ARRAY ARRAY['inventario_ronda', 'inventario_explicacion', 'inventario_aprobacion'] LOOP
    BEGIN
      PERFORM fn_ronda_validar_actor(v_actor_usuario, v_actor_telegram, v_modulo);
      v_autorizado := TRUE;
      EXIT;
    EXCEPTION WHEN OTHERS THEN
      v_ultimo_error := SQLERRM;
    END;
  END LOOP;
  IF NOT v_autorizado THEN
    RAISE EXCEPTION 'fn_ronda_aplicar_ajuste: actor no autorizado -- no tiene ninguno de los tres módulos de la ronda (inventario_ronda, inventario_explicacion, inventario_aprobacion). Último error: %', v_ultimo_error;
  END IF;

  -- 2. SELECT ... FOR UPDATE -- estado debe ser 'ajuste_aprobado'. Esta
  --    guarda es TODA la protección de CA-9: nadie puede aplicar sin que
  --    Santiago haya aprobado antes (fn_ronda_decidir_ajuste), y una segunda
  --    llamada sobre la misma excepción ya aplicada encuentra el estado
  --    cambiado y aborta -- doble aplicación imposible.
  SELECT * INTO v_excepcion FROM rondas_excepciones WHERE id = v_excepcion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_aplicar_ajuste: no existe rondas_excepciones %.', v_excepcion_id;
  END IF;
  IF v_excepcion.estado <> 'ajuste_aprobado' THEN
    RAISE EXCEPTION 'fn_ronda_aplicar_ajuste: la excepción % no tiene un ajuste APROBADO pendiente de aplicar (estado actual: %). Sin aprobación de Santiago, nadie puede aplicar (CA-9).', v_excepcion_id, v_excepcion.estado;
  END IF;

  -- 3. delta := cantidad_fisica - teorico_conteo (ambos congelados al confirmar)
  v_delta := v_excepcion.cantidad_fisica - v_excepcion.teorico_conteo;

  SELECT id, cantidad_actual, unidad_medida, precio_unitario
    INTO v_producto FROM productos WHERE id = v_excepcion.producto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_aplicar_ajuste: no existe productos % (referenciado por la excepción).', v_excepcion.producto_id;
  END IF;
  v_vivo := COALESCE(v_producto.cantidad_actual, 0);

  -- 4. Si el teórico VIVO difiere del congelado al conteo, informar ANTES de
  --    aplicar y no aplicar en silencio (CA-2) -- salvo que el payload traiga
  --    confirmar_cambio_teorico=true (segunda llamada, humano ya avisado).
  IF v_vivo IS DISTINCT FROM v_excepcion.teorico_conteo AND NOT v_confirmar_cambio THEN
    RETURN jsonb_build_object(
      'aplicado', FALSE,
      'motivo', 'teorico_cambio',
      'excepcion_id', v_excepcion_id,
      'teorico_al_conteo', v_excepcion.teorico_conteo,
      'teorico_hoy', v_vivo,
      'delta', v_delta
    );
  END IF;

  -- 5. nuevo := vivo + delta -- DELTA sobre el saldo VIVO, JAMÁS "nuevo := fisico".
  v_nuevo := v_vivo + v_delta;
  IF v_nuevo < 0 THEN
    RAISE EXCEPTION 'fn_ronda_aplicar_ajuste: aplicar el ajuste (delta %) dejaría a % en saldo negativo (vivo %).', v_delta, v_producto.id, v_vivo;
  END IF;

  SELECT r.*, c.etiqueta AS causa_etiqueta
    INTO v_ronda
    FROM rondas_inventario r
    LEFT JOIN inventario_causas_raiz c ON c.clave = v_excepcion.decision_causa
   WHERE r.id = v_excepcion.ronda_id;
  v_observaciones := 'Ronda ' || to_char(v_ronda.periodo, 'YYYY-MM')
    || COALESCE(' · ' || v_ronda.causa_etiqueta, '')
    || ' · excepción ' || v_excepcion_id::TEXT;

  INSERT INTO movimientos_inventario (
    producto_id, tipo_movimiento, cantidad, unidad, fecha_movimiento,
    saldo_anterior, saldo_nuevo, responsable, observaciones, provisional, valor_movimiento
  ) VALUES (
    v_producto.id, 'Ajuste'::tipo_movimiento, v_delta, v_producto.unidad_medida, v_fecha,
    v_vivo, v_nuevo,
    fn_ronda_actor_nombre(v_actor_usuario, v_actor_telegram),
    v_observaciones, FALSE,
    ABS(v_delta) * COALESCE(v_producto.precio_unitario, 0)
  ) RETURNING id INTO v_movimiento_id;

  UPDATE productos SET cantidad_actual = v_nuevo WHERE id = v_producto.id;

  UPDATE rondas_excepciones SET
    estado = 'ajuste_aplicado',
    aplicacion_movimiento_id = v_movimiento_id,
    aplicacion_en = now(),
    aplicacion_por_usuario = v_actor_usuario,
    aplicacion_por_telegram = v_actor_telegram
  WHERE id = v_excepcion_id;

  RETURN jsonb_build_object(
    'aplicado', TRUE,
    'excepcion_id', v_excepcion_id,
    'movimiento_id', v_movimiento_id,
    'delta', v_delta,
    'saldo_anterior', v_vivo,
    'saldo_nuevo', v_nuevo
  );
END $$;

COMMENT ON FUNCTION fn_ronda_aplicar_ajuste(JSONB) IS
  'Fase 2, RPC 8/10 (§6.4). DELTA, nunca fijación: nuevo := vivo + delta, '
  'jamás nuevo := fisico. Si productos.cantidad_actual vivo difiere del '
  'teorico_conteo congelado en la excepción, informa ANTES de aplicar '
  '({aplicado:false, motivo:''teorico_cambio'', ...}) y no aplica en '
  'silencio (CA-2) -- salvo confirmar_cambio_teorico=true en el payload. '
  'Acepta los tres módulos de la ronda (David, Uriel o Santiago pueden '
  'ejecutar un ajuste YA aprobado -- B-7); lo que protege CA-9 es la guarda '
  'de estado = ajuste_aprobado, no el módulo del actor.';

REVOKE EXECUTE ON FUNCTION fn_ronda_aplicar_ajuste(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_ronda_aplicar_ajuste(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION fn_ronda_aplicar_ajuste(JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. fn_ronda_cerrar -- §6.2. Estado -> 'cerrada', exige alcance_declarado.
--     NO exige que las excepciones estén resueltas (CA-5). Normaliza a
--     'sin_confirmar' todo lo que quede en 'preview_pendiente' (hallazgo del
--     CTO, §15.1/§15.3 -- CA-37 necesita un solo predicado que contar).
-- ---------------------------------------------------------------------------
CREATE FUNCTION fn_ronda_cerrar(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_actor_usuario  UUID := NULLIF(payload ->> 'actor_usuario_id', '')::UUID;
  v_actor_telegram UUID := NULLIF(payload ->> 'actor_telegram_usuario_id', '')::UUID;
  v_ronda_id       UUID := NULLIF(payload ->> 'ronda_id', '')::UUID;
  v_alcance        TEXT := payload ->> 'alcance_declarado';
  v_alcance_nota   TEXT := NULLIF(payload ->> 'alcance_nota', '');
  v_ronda          RECORD;
  v_normalizados   INTEGER;
BEGIN
  PERFORM fn_ronda_validar_actor(v_actor_usuario, v_actor_telegram, 'inventario_ronda');

  IF v_ronda_id IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_cerrar: ronda_id es requerido.';
  END IF;
  IF v_alcance NOT IN ('completo', 'parcial') THEN
    RAISE EXCEPTION 'fn_ronda_cerrar: alcance_declarado inválido (%) -- debe ser "completo" o "parcial" (A-5/R-2). El sistema nunca cierra una ronda sin que Uriel declare qué recorrió.', v_alcance;
  END IF;

  SELECT * INTO v_ronda FROM rondas_inventario WHERE id = v_ronda_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_cerrar: no existe rondas_inventario %.', v_ronda_id;
  END IF;
  IF v_ronda.estado <> 'en_curso' THEN
    RAISE EXCEPTION 'fn_ronda_cerrar: la ronda % no está en curso (estado actual: %).', v_ronda_id, v_ronda.estado;
  END IF;

  -- CA-37 (A-10): todo transcrito abandonado en preview_pendiente es un
  -- borrador sin confirmar -- se normaliza acá para que el reporte de cierre
  -- tenga UN solo estado que contar, no dos ideas distintas de lo mismo.
  UPDATE rondas_transcritos SET estado = 'sin_confirmar' WHERE ronda_id = v_ronda_id AND estado = 'preview_pendiente';
  GET DIAGNOSTICS v_normalizados = ROW_COUNT;

  -- CA-5: NO se exige que las excepciones estén resueltas. La ronda y sus
  -- excepciones tienen ciclos de vida separados a propósito (§5.2 brief de
  -- producto).
  UPDATE rondas_inventario SET
    estado = 'cerrada',
    cerrada_en = now(),
    cerrada_por_usuario = v_actor_usuario,
    cerrada_por_telegram = v_actor_telegram,
    alcance_declarado = v_alcance,
    alcance_nota = v_alcance_nota
  WHERE id = v_ronda_id;

  RETURN jsonb_build_object(
    'ronda_id', v_ronda_id,
    'estado', 'cerrada',
    'alcance_declarado', v_alcance,
    'transcritos_normalizados_sin_confirmar', v_normalizados
  );
END $$;

COMMENT ON FUNCTION fn_ronda_cerrar(JSONB) IS
  'Fase 2, RPC 9/10 (§6.2). Estado -> cerrada, exige alcance_declarado '
  '(A-5/R-2). NO exige que las excepciones estén resueltas (CA-5, ciclos de '
  'vida separados). Normaliza a sin_confirmar todo rondas_transcritos que '
  'quede en preview_pendiente de esta ronda (hallazgo del CTO §15.1/§15.3 -- '
  'un transcrito abandonado en preview también es un borrador sin '
  'confirmar, y CA-37 necesita UN predicado, no dos estados para la misma '
  'idea).';

REVOKE EXECUTE ON FUNCTION fn_ronda_cerrar(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_ronda_cerrar(JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION fn_ronda_cerrar(JSONB) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 12. fn_ronda_emitir_reporte -- §6.2. Único por ronda (la PK de
--     rondas_reportes es la idempotencia). NO llama a fn_ronda_validar_actor
--     -- ver decisión (3) de la cabecera. Sólo service_role.
-- ---------------------------------------------------------------------------
CREATE FUNCTION fn_ronda_emitir_reporte(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_ronda_id       UUID := NULLIF(payload ->> 'ronda_id', '')::UUID;
  v_contenido      JSONB := payload -> 'contenido';
  v_texto_telegram TEXT := payload ->> 'texto_telegram';
  v_incluye_valoracion BOOLEAN := COALESCE((payload ->> 'incluye_valoracion')::BOOLEAN, FALSE);
  v_ronda          RECORD;
  v_ya_existia     BOOLEAN;
BEGIN
  IF v_ronda_id IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_emitir_reporte: ronda_id es requerido.';
  END IF;
  IF v_contenido IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_emitir_reporte: contenido es requerido -- debe llegar ya resuelto (R-10, este RPC no calcula nada).';
  END IF;
  IF v_texto_telegram IS NULL OR v_texto_telegram = '' THEN
    RAISE EXCEPTION 'fn_ronda_emitir_reporte: texto_telegram es requerido.';
  END IF;

  SELECT * INTO v_ronda FROM rondas_inventario WHERE id = v_ronda_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_emitir_reporte: no existe rondas_inventario %.', v_ronda_id;
  END IF;
  -- El reporte de cierre sólo tiene sentido sobre una ronda YA cerrada
  -- (C-1/CA-19) -- y es lo que hace que la condición 2 de
  -- fn_ronda_deshacer_confirmacion ("ronda en_curso") sea equivalente a
  -- "el reporte todavía no existe", sin consultar rondas_reportes aparte.
  IF v_ronda.estado <> 'cerrada' THEN
    RAISE EXCEPTION 'fn_ronda_emitir_reporte: la ronda % no está cerrada (estado actual: %) -- el reporte de cierre sólo se emite sobre una ronda cerrada.', v_ronda_id, v_ronda.estado;
  END IF;

  v_ya_existia := EXISTS (SELECT 1 FROM rondas_reportes WHERE ronda_id = v_ronda_id);

  -- R-10/CA-18: el reporte se congela al emitirse, NUNCA se recalcula. La PK
  -- de rondas_reportes es la idempotencia -- un tick que reintenta no
  -- sobrescribe un reporte ya emitido, sólo confirma que ya existe.
  INSERT INTO rondas_reportes (ronda_id, contenido, texto_telegram, incluye_valoracion)
  VALUES (v_ronda_id, v_contenido, v_texto_telegram, v_incluye_valoracion)
  ON CONFLICT (ronda_id) DO NOTHING;

  RETURN jsonb_build_object('ronda_id', v_ronda_id, 'emitido_ahora', NOT v_ya_existia, 'ya_existia', v_ya_existia);
END $$;

COMMENT ON FUNCTION fn_ronda_emitir_reporte(JSONB) IS
  'Fase 2, RPC 10/10 (§6.2). Único por ronda -- la PK de rondas_reportes es '
  'la idempotencia (INSERT ... ON CONFLICT DO NOTHING, precedente '
  'hato_alertas.regla_clave, 056). El contenido llega YA RESUELTO (R-10: '
  'este RPC no calcula nada, sólo persiste). Exige que la ronda esté '
  '"cerrada". A DIFERENCIA de las otras nueve, NO llama a '
  'fn_ronda_validar_actor -- no hay actor humano detrás de esta llamada (la '
  'hace un proceso automático); su autorización es puramente de GRANT: '
  'EXECUTE revocado también de "authenticated", concedido SOLO a '
  'service_role. Ver la decisión (3) documentada en la cabecera de este '
  'archivo -- es una desviación explícita del diagrama del §2 del brief '
  'técnico, no un olvido.';

REVOKE EXECUTE ON FUNCTION fn_ronda_emitir_reporte(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_ronda_emitir_reporte(JSONB) FROM anon;
REVOKE EXECUTE ON FUNCTION fn_ronda_emitir_reporte(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION fn_ronda_emitir_reporte(JSONB) TO service_role;

-- ---------------------------------------------------------------------------
-- 13. POSTCONDICIONES
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_funcion TEXT;
  v_n INTEGER;
  v_def TEXT;
BEGIN
  -- 13.1 Las 12 funciones existen (10 RPC + validar_actor + el helper interno).
  FOREACH v_funcion IN ARRAY ARRAY[
    'fn_ronda_validar_actor', 'fn_ronda_actor_nombre', 'fn_ronda_abrir',
    'fn_ronda_confirmar_hallazgos', 'fn_ronda_deshacer_confirmacion',
    'fn_ronda_explicacion_david', 'fn_ronda_resolver_con_captura',
    'fn_ronda_proponer_ajuste', 'fn_ronda_decidir_ajuste',
    'fn_ronda_aplicar_ajuste', 'fn_ronda_cerrar', 'fn_ronda_emitir_reporte'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = v_funcion) THEN
      RAISE EXCEPTION '126 ABORTADA (post): public.%() no quedó creada.', v_funcion;
    END IF;
  END LOOP;

  -- 13.2 Las 10 RPC del §6 (todas menos validar_actor y el helper) son
  --     SECURITY INVOKER, con search_path = public, pg_temp (pg_temp AL
  --     FINAL), toman JSONB y devuelven JSONB.
  FOREACH v_funcion IN ARRAY ARRAY[
    'fn_ronda_abrir', 'fn_ronda_confirmar_hallazgos', 'fn_ronda_deshacer_confirmacion',
    'fn_ronda_explicacion_david', 'fn_ronda_resolver_con_captura',
    'fn_ronda_proponer_ajuste', 'fn_ronda_decidir_ajuste',
    'fn_ronda_aplicar_ajuste', 'fn_ronda_cerrar', 'fn_ronda_emitir_reporte'
  ] LOOP
    SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_funcion
       AND NOT p.prosecdef
       AND pg_get_function_arguments(p.oid) = 'payload jsonb'
       AND pg_get_function_result(p.oid) = 'jsonb'
       AND array_to_string(p.proconfig, ',') LIKE '%search_path=public, pg_temp%';
    IF v_n <> 1 THEN
      RAISE EXCEPTION '126 ABORTADA (post): public.%(jsonb) no quedó como se esperaba (SECURITY INVOKER, payload jsonb -> jsonb, search_path=public, pg_temp). Coincidencias: %.', v_funcion, v_n;
    END IF;
  END LOOP;

  -- 13.3 fn_ronda_validar_actor: SECURITY INVOKER, 3 argumentos, VOID, con
  --     search_path pineado.
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_validar_actor'
     AND NOT p.prosecdef
     AND pg_get_function_result(p.oid) = 'void'
     AND array_to_string(p.proconfig, ',') LIKE '%search_path=public, pg_temp%';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '126 ABORTADA (post): fn_ronda_validar_actor no quedó con la forma esperada.';
  END IF;

  -- 13.4 anon no tiene EXECUTE en NINGUNA de las 12.
  FOREACH v_funcion IN ARRAY ARRAY[
    'fn_ronda_validar_actor', 'fn_ronda_actor_nombre', 'fn_ronda_abrir',
    'fn_ronda_confirmar_hallazgos', 'fn_ronda_deshacer_confirmacion',
    'fn_ronda_explicacion_david', 'fn_ronda_resolver_con_captura',
    'fn_ronda_proponer_ajuste', 'fn_ronda_decidir_ajuste',
    'fn_ronda_aplicar_ajuste', 'fn_ronda_cerrar', 'fn_ronda_emitir_reporte'
  ] LOOP
    SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_funcion
       AND has_function_privilege('anon', p.oid, 'EXECUTE');
    IF v_n <> 0 THEN
      RAISE EXCEPTION '126 ABORTADA (post): `anon` tiene EXECUTE sobre alguna sobrecarga de public.%(). Se esperaban 0.', v_funcion;
    END IF;
  END LOOP;

  -- 13.5 service_role tiene EXECUTE en las 12 (incluida fn_ronda_emitir_reporte).
  FOREACH v_funcion IN ARRAY ARRAY[
    'fn_ronda_validar_actor', 'fn_ronda_actor_nombre', 'fn_ronda_abrir',
    'fn_ronda_confirmar_hallazgos', 'fn_ronda_deshacer_confirmacion',
    'fn_ronda_explicacion_david', 'fn_ronda_resolver_con_captura',
    'fn_ronda_proponer_ajuste', 'fn_ronda_decidir_ajuste',
    'fn_ronda_aplicar_ajuste', 'fn_ronda_cerrar', 'fn_ronda_emitir_reporte'
  ] LOOP
    SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_funcion
       AND has_function_privilege('service_role', p.oid, 'EXECUTE');
    IF v_n <> 1 THEN
      RAISE EXCEPTION '126 ABORTADA (post): `service_role` no tiene EXECUTE sobre public.%(). Se esperaba exactamente 1 sobrecarga con el privilegio.', v_funcion;
    END IF;
  END LOOP;

  -- 13.6 authenticated tiene EXECUTE en las 9 RPC de navegador+bot, pero NO en
  --     fn_ronda_emitir_reporte (decisión (3) de la cabecera).
  FOREACH v_funcion IN ARRAY ARRAY[
    'fn_ronda_validar_actor', 'fn_ronda_actor_nombre', 'fn_ronda_abrir',
    'fn_ronda_confirmar_hallazgos', 'fn_ronda_deshacer_confirmacion',
    'fn_ronda_explicacion_david', 'fn_ronda_resolver_con_captura',
    'fn_ronda_proponer_ajuste', 'fn_ronda_decidir_ajuste',
    'fn_ronda_aplicar_ajuste', 'fn_ronda_cerrar'
  ] LOOP
    SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_funcion
       AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
    IF v_n <> 1 THEN
      RAISE EXCEPTION '126 ABORTADA (post): `authenticated` no tiene EXECUTE sobre public.%() -- se necesita para que un navegador (David/Santiago) pueda llamarla vía PostgREST.', v_funcion;
    END IF;
  END LOOP;
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_emitir_reporte'
     AND has_function_privilege('authenticated', p.oid, 'EXECUTE');
  IF v_n <> 0 THEN
    RAISE EXCEPTION '126 ABORTADA (post): `authenticated` tiene EXECUTE sobre fn_ronda_emitir_reporte -- debía quedar exclusiva de service_role (decisión (3) de la cabecera).';
  END IF;

  -- 13.7 El cuerpo de fn_ronda_validar_actor es -- salvo espacios -- el
  --     literal del §6.1 del brief técnico: las cuatro frases que sostienen
  --     el modelo de autorización deben estar, textuales.
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_validar_actor';
  IF v_def NOT LIKE '%Actor inválido: debe venir exactamente uno de usuario/telegram.%' THEN
    RAISE EXCEPTION '126 ABORTADA (post): fn_ronda_validar_actor no tiene el guard "exactamente uno de usuario/telegram" -- ¿se editó el literal del §6.1?';
  END IF;
  IF v_def NOT LIKE '%Una sesión autenticada no puede actuar como un usuario de Telegram.%' THEN
    RAISE EXCEPTION '126 ABORTADA (post): fn_ronda_validar_actor no cierra la suplantación de identidad Telegram desde navegador.';
  END IF;
  IF v_def NOT LIKE '%p_modulo = ANY(t.modulos_permitidos)%' THEN
    RAISE EXCEPTION '126 ABORTADA (post): fn_ronda_validar_actor no comprueba modulos_permitidos en la rama service_role.';
  END IF;

  -- 13.8 fn_ronda_decidir_ajuste NO llama a es_usuario_gerencia() -- usa el
  --     vínculo literal del §6.1.
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_decidir_ajuste';
  IF v_def ILIKE '%es_usuario_gerencia()%' THEN
    RAISE EXCEPTION '126 ABORTADA (post): fn_ronda_decidir_ajuste llama a es_usuario_gerencia() -- con service_role esa función da falso siempre (§6.1). Debe usar el vínculo telegram_usuarios.usuario_id -> usuarios.rol.';
  END IF;
  IF v_def NOT LIKE '%u.rol = ''Gerencia''%' THEN
    RAISE EXCEPTION '126 ABORTADA (post): fn_ronda_decidir_ajuste no tiene la guarda de Gerencia por vínculo.';
  END IF;

  -- 13.9 fn_ronda_aplicar_ajuste nunca fija el saldo -- no debe contener
  --     ninguna asignación "v_nuevo :=" que no sea "v_vivo + v_delta" (R-4).
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_aplicar_ajuste';
  IF v_def NOT LIKE '%v_nuevo := v_vivo + v_delta%' THEN
    RAISE EXCEPTION '126 ABORTADA (post): fn_ronda_aplicar_ajuste no aplica el delta sobre el saldo vivo tal como exige R-4/CA-2.';
  END IF;
  IF v_def NOT LIKE '%teorico_cambio%' THEN
    RAISE EXCEPTION '126 ABORTADA (post): fn_ronda_aplicar_ajuste no informa el cambio de teórico antes de aplicar (CA-2).';
  END IF;

  -- 13.10 CORRECCIÓN post-implementación (revisión del orquestador,
  --      2026-08-28): fn_ronda_proponer_ajuste debe autorizar Uriel O David
  --      (B-5, "David o Uriel"), NUNCA sólo David y NUNCA Santiago. El
  --      chequeo mira el LITERAL del arreglo de módulos que intenta, no si
  --      la cadena "inventario_aprobacion" aparece en cualquier parte del
  --      cuerpo -- esa cadena SÍ aparece, legítimamente, en el texto del
  --      RAISE EXCEPTION que explica por qué Santiago no calificó.
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_proponer_ajuste';
  IF v_def NOT LIKE '%ARRAY[''inventario_ronda'', ''inventario_explicacion'']%' THEN
    RAISE EXCEPTION '126 ABORTADA (post): fn_ronda_proponer_ajuste no autoriza a ambos módulos (Uriel y David) -- B-5 "David o Uriel" no se cumple.';
  END IF;
  IF v_def LIKE '%ARRAY[''inventario_ronda'', ''inventario_explicacion'', ''inventario_aprobacion'']%' THEN
    RAISE EXCEPTION '126 ABORTADA (post): fn_ronda_proponer_ajuste incluye inventario_aprobacion en el arreglo de módulos que intenta -- Santiago no debe poder proponer (B-5/B-6).';
  END IF;

  RAISE NOTICE '126 OK: 12 funciones creadas (10 RPC + fn_ronda_validar_actor + fn_ronda_actor_nombre), todas SECURITY INVOKER con search_path pineado, anon sin EXECUTE en ninguna, service_role con EXECUTE en las 12, authenticated con EXECUTE en 11 (todas salvo fn_ronda_emitir_reporte), fn_ronda_validar_actor y fn_ronda_decidir_ajuste con los literales del §6.1, fn_ronda_aplicar_ajuste aplicando delta sobre el saldo vivo, fn_ronda_proponer_ajuste autorizando Uriel y David (B-5).';
END $$;

-- ===========================================================================
-- ROLLBACK (ejecutable). Sin historia que preservar: las 12 funciones son
-- NUEVAS en esta migración -- un DROP directo no pierde nada que una
-- re-aplicación de este archivo no pueda reconstruir, siempre que ninguna
-- fase posterior (Telegram, Fase 3+) ya esté llamando a estos RPC en
-- producción. Verificar eso ANTES de correr esto.
-- ===========================================================================
--   DROP FUNCTION IF EXISTS fn_ronda_emitir_reporte(JSONB);
--   DROP FUNCTION IF EXISTS fn_ronda_cerrar(JSONB);
--   DROP FUNCTION IF EXISTS fn_ronda_aplicar_ajuste(JSONB);
--   DROP FUNCTION IF EXISTS fn_ronda_decidir_ajuste(JSONB);
--   DROP FUNCTION IF EXISTS fn_ronda_proponer_ajuste(JSONB);
--   DROP FUNCTION IF EXISTS fn_ronda_resolver_con_captura(JSONB);
--   DROP FUNCTION IF EXISTS fn_ronda_explicacion_david(JSONB);
--   DROP FUNCTION IF EXISTS fn_ronda_deshacer_confirmacion(JSONB);
--   DROP FUNCTION IF EXISTS fn_ronda_confirmar_hallazgos(JSONB);
--   DROP FUNCTION IF EXISTS fn_ronda_abrir(JSONB);
--   DROP FUNCTION IF EXISTS fn_ronda_actor_nombre(UUID, UUID);
--   DROP FUNCTION IF EXISTS fn_ronda_validar_actor(UUID, UUID, TEXT);
-- ===========================================================================
