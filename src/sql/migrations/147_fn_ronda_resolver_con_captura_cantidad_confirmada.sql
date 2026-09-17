-- Migración 147: fn_ronda_resolver_con_captura -- la cantidad FÍSICA también
-- se reconfirma a mano en la vía CON respaldo (hallazgo ESCO-61, parte C)
--
-- La 132 cerró la mitad SIN respaldo: quien propone un ajuste
-- (`fn_ronda_proponer_ajuste`) tiene que teclear `cantidad_fisica_confirmada`
-- y el delta se calcula contra ese número, nunca contra el que congeló el
-- intérprete de voz. Su propia cabecera daba por cubierta la otra mitad: «la
-- vía CON respaldo (`fn_ronda_resolver_con_captura`) YA exige que David
-- teclee la cantidad real a mano (CA-8)».
--
-- ESO ES CIERTO DE UN NÚMERO DISTINTO, y ahí está el hueco. David teclea la
-- cantidad del MOVIMIENTO -- cuánto entró o cuánto salió --, que es el delta,
-- no el conteo físico. `rondas_excepciones.cantidad_fisica` (cuánto hay
-- realmente en la bodega) nunca se vuelve a mirar por este camino: la
-- excepción pasa a `resuelta_con_captura` conservando el número del
-- intérprete.
--
-- EL CASO REAL, ya corregido a mano por la 145 y por eso comprobable: la
-- excepción `1d903165-...` de la ronda de agosto. Uriel dictó «tres bultos de
-- 15-15-15 de 50 kilos», el intérprete guardó `cantidad_fisica = 3` (bultos,
-- sin multiplicar) y David capturó -- correctamente, a mano -- una Entrada de
-- 150,00 kilos. El inventario quedó BIEN. El registro de trazabilidad quedó
-- MAL, y el informe de cierre se contradijo a sí mismo en dos líneas
-- seguidas: «hay 3, deberían haber 0» contra «Entrada de 150». Un factor de
-- 50 de diferencia sobre el mismo hecho. Sin esta migración, el mismo mal
-- parseo vuelve a entrar por esta segunda puerta cada vez.
--
-- QUÉ CAMBIA (sólo `fn_ronda_resolver_con_captura`, `CREATE OR REPLACE` --
-- nunca se editan 126 ni 143, ya aplicadas):
--   1. El payload EXIGE `cantidad_fisica_confirmada` (NUMERIC, `>= 0` -- cero
--      es una respuesta real, «no queda nada», nunca un dato faltante).
--      Mismo contrato y mismo nombre de clave que la 132: una sola forma de
--      reconfirmar una cantidad física en todo el módulo.
--   2. `rondas_excepciones.cantidad_fisica` se sobrescribe con ese valor, en
--      la MISMA transacción que escribe el movimiento. El registro que lee el
--      informe de cierre refleja lo que un humano confirmó, no lo que el
--      modelo entendió.
--
-- Lo que NO cambia, a propósito:
--   * `movimientos_inventario` y `productos.cantidad_actual` no se tocan --
--     la cantidad del movimiento sigue siendo la que David teclea (CA-8), y
--     son dos números distintos que NUNCA se derivan uno del otro. Subir el
--     saldo desde el conteo físico sería el remedio que la 119 refutó.
--   * El valor original del intérprete no se preserva en una columna aparte
--     -- misma decisión deliberada de la 132; auditar esa divergencia es su
--     propia migración.
--   * Autorización (`inventario_explicacion`, sólo David), la guarda CA-38
--     de estado `explicada`, el orden validar-todo-antes-de-escribir, el
--     `FOR UPDATE` sobre `rondas_excepciones` y sobre `productos`, y la
--     atribución por `fn_ronda_actor_correo` que puso la 143: todo intacto.
--
-- ESTADO: APLICADA a producción 2026-09-16 (ledger `20260916154436`,
-- issue #263 / ESCO-98), PERO NO CON ESTE FICHERO ENTERO. El CREATE OR
-- REPLACE se compuso a mano (md5 de prosrc después
-- `611a7d7b6ba8bc5e101e8782c0a40f49`). El fichero abortaba siempre en su
-- propia post-condición: el cuerpo (~línea 160) escribe `"Ajuste"` entre
-- comillas DOBLES y la guarda (~línea 261) buscaba `'Ajuste'` entre
-- SIMPLES. Corregido en este mismo archivo (issue #268 / ESCO-112).
-- Editar una migración ya aplicada es INTENCIONAL: el fichero nunca pudo
-- correr, y dejarlo así gasta cada agente que intenta re-aplicarlo.
-- NO re-aplicar el fichero entero a producción -- la pre-guarda de
-- `cantidad_fisica_confirmada` aborta porque la función ya la exige.
--
-- ESTADO ORIGINAL (2026-09-13): escrita y fusionada, se aplicaba DESPUÉS
-- de `npx supabase functions deploy make-server-1ccce916`. Ese orden se
-- respetó: el lado app salió en v253 el 2026-09-14, dos días antes.
--
-- ORDEN DE APLICACIÓN -- INVERTIDO respecto de la 140, y por un motivo que
-- conviene no olvidar: **primero `functions deploy`, después la migración.**
-- El payload es `jsonb`, así que la versión vieja del RPC IGNORA la clave
-- nueva: desplegar antes es inofensivo, y el único costo de esa ventana es
-- que `cantidad_fisica` sigue sin reconfirmarse -- o sea, el estado de hoy.
-- Al revés NO es inofensivo: la migración aplicada contra la conversación
-- vieja hace que cada captura de David muera con un RAISE. Falla cerrada y
-- visible, nunca corrupción silenciosa, pero evitable con el orden correcto.
-- Es la lección de la 105 en espejo: allá la mina era código de seguridad
-- mergeado sin su contraparte en base; acá sería la contraparte en base
-- aplicada sin su código.
--
-- Verificado contra el catálogo vivo antes de escribir esto: `prosrc` de
-- `fn_ronda_resolver_con_captura` con md5 `e2b4878c163624f971b194075e0bb774`
-- (4169 bytes), o sea exactamente el cuerpo que dejó la 143, sin ningún
-- cambio posterior fuera del repo. El cuerpo de abajo reproduce ESE texto
-- vivo, no el del fichero 126.
--
-- Filas de dominio afectadas: CERO. Sin UPDATE, sin DELETE, sin ALTER, sin
-- DROP.

DO $$
DECLARE
  v_src TEXT;
BEGIN
  IF to_regprocedure('public.fn_ronda_resolver_con_captura(jsonb)') IS NULL THEN
    RAISE EXCEPTION '147 ABORTADA (pre): fn_ronda_resolver_con_captura(jsonb) no existe -- depende de 126/143.';
  END IF;
  IF to_regprocedure('public.fn_ronda_actor_correo(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION '147 ABORTADA (pre): fn_ronda_actor_correo(uuid, uuid) no existe -- el cuerpo de abajo la usa (migración 143).';
  END IF;

  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_resolver_con_captura';

  IF v_src ILIKE '%cantidad_fisica_confirmada%' THEN
    RAISE EXCEPTION '147 ABORTADA (pre): fn_ronda_resolver_con_captura YA exige cantidad_fisica_confirmada -- lo más probable es que esta migración ya se aplicó. Revisar a mano antes de reintentar.';
  END IF;

  -- Nunca sobrescribir en silencio un cambio hecho fuera del repo (lección
  -- de la 143): si el cuerpo vivo no es el que se revisó, abortar.
  IF md5(v_src) <> 'e2b4878c163624f971b194075e0bb774' THEN
    RAISE EXCEPTION '147 ABORTADA (pre): fn_ronda_resolver_con_captura difiere del cuerpo vivo revisado (md5 actual %). No sobrescribir un cambio vivo sin incorporarlo primero.', md5(v_src);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION fn_ronda_resolver_con_captura(payload JSONB)
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
  -- Migración 147: el CONTEO FÍSICO reconfirmado a mano. Es un número
  -- distinto de v_cantidad (que es el movimiento) y nunca se deriva de él.
  v_cantidad_fisica_confirmada NUMERIC := (payload ->> 'cantidad_fisica_confirmada')::NUMERIC;

  v_excepcion      RECORD;
  v_producto       RECORD;
  v_saldo_anterior NUMERIC;
  v_saldo_nuevo    NUMERIC;
  v_movimiento_id  UUID;
BEGIN
  PERFORM fn_ronda_validar_actor(v_actor_usuario, v_actor_telegram, 'inventario_explicacion');

  IF v_excepcion_id IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: excepcion_id es requerido.';
  END IF;
  IF v_cantidad IS NULL OR v_cantidad <= 0 THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: cantidad debe ser un número positivo (recibido %).', v_cantidad;
  END IF;
  IF v_fecha IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: fecha_movimiento es requerida -- CA-8 exige la fecha REAL del movimiento.';
  END IF;
  -- ═══ GUARDA NUEVA (147) ═══════════════════════════════════════════════
  -- La cantidad física SIEMPRE se reconfirma a mano, también por esta vía --
  -- nunca se conserva el valor que congeló el intérprete de voz. Un físico
  -- de 0 es un dato real (nunca se rechaza), pero el campo viene SIEMPRE.
  IF v_cantidad_fisica_confirmada IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: cantidad_fisica_confirmada es requerida -- quien captura el movimiento tiene que reconfirmar a mano cuánto hay FÍSICAMENTE, nunca se conserva el valor que puso el intérprete de voz.';
  END IF;
  IF v_cantidad_fisica_confirmada < 0 THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: cantidad_fisica_confirmada no puede ser negativa (recibido %).', v_cantidad_fisica_confirmada;
  END IF;

  SELECT * INTO v_excepcion FROM rondas_excepciones WHERE id = v_excepcion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: no existe rondas_excepciones %.', v_excepcion_id;
  END IF;
  IF v_excepcion.estado <> 'explicada' OR v_excepcion.explicacion_david_en IS NULL THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: la excepción % no está "explicada" por David (estado: %, explicacion_david_en: %) -- CA-38.', v_excepcion_id, v_excepcion.estado, v_excepcion.explicacion_david_en;
  END IF;

  IF v_tipo NOT IN ('Entrada', 'Salida por Aplicación', 'Salida Otros') THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: tipo_movimiento inválido (%) -- CA-8 exige el movimiento REAL que fue, nunca "Ajuste".', v_tipo;
  END IF;

  SELECT id, cantidad_actual, unidad_medida, precio_unitario, activo
    INTO v_producto FROM productos WHERE id = v_excepcion.producto_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_ronda_resolver_con_captura: no existe productos % (referenciado por la excepción).', v_excepcion.producto_id;
  END IF;

  v_saldo_anterior := COALESCE(v_producto.cantidad_actual, 0);
  IF v_tipo = 'Entrada' THEN
    v_saldo_nuevo := v_saldo_anterior + v_cantidad;
  ELSE
    v_saldo_nuevo := v_saldo_anterior - v_cantidad;
    IF v_saldo_nuevo < 0 THEN
      RAISE EXCEPTION 'fn_ronda_resolver_con_captura: % dejaría a % en saldo negativo (actual %, movimiento %).', v_tipo, v_producto.id, v_saldo_anterior, v_cantidad;
    END IF;
  END IF;

  INSERT INTO movimientos_inventario (
    producto_id, tipo_movimiento, cantidad, unidad, fecha_movimiento,
    saldo_anterior, saldo_nuevo, responsable, observaciones, factura,
    lote_aplicacion, aplicacion_id, provisional, valor_movimiento
  ) VALUES (
    v_producto.id, v_tipo::tipo_movimiento, v_cantidad, v_producto.unidad_medida, v_fecha,
    v_saldo_anterior, v_saldo_nuevo,
    fn_ronda_actor_correo(v_actor_usuario, v_actor_telegram),
    COALESCE(v_observaciones, 'Captura directa -- ronda de inventario, excepción ' || v_excepcion_id::TEXT),
    v_factura, v_lote_aplicacion, v_aplicacion_id, FALSE,
    v_cantidad * COALESCE(v_producto.precio_unitario, 0)
  ) RETURNING id INTO v_movimiento_id;

  UPDATE productos SET cantidad_actual = v_saldo_nuevo WHERE id = v_producto.id;

  UPDATE rondas_excepciones SET
    estado = 'resuelta_con_captura',
    cantidad_fisica = v_cantidad_fisica_confirmada,
    captura_movimiento_id = v_movimiento_id,
    captura_en = now(),
    captura_por_usuario = v_actor_usuario,
    captura_por_telegram = v_actor_telegram
  WHERE id = v_excepcion_id;

  RETURN jsonb_build_object(
    'excepcion_id', v_excepcion_id,
    'movimiento_id', v_movimiento_id,
    'saldo_anterior', v_saldo_anterior,
    'saldo_nuevo', v_saldo_nuevo,
    'cantidad_fisica_confirmada', v_cantidad_fisica_confirmada
  );
END $$;

COMMENT ON FUNCTION fn_ronda_resolver_con_captura(JSONB) IS
  'Fase 2, RPC 5/10 (§6.3), vía (a) de R-14. Registra el movimiento REAL que '
  'explica la diferencia (Entrada/Salida por Aplicación/Salida Otros, NUNCA '
  'Ajuste -- CA-8), ligado a la excepción, sin pasar por Santiago. Valida '
  'TODO antes de escribir nada (molde de la migración 106): estado '
  '"explicada" con FOR UPDATE, tipo_movimiento válido, saldo resultante >= 0 '
  'con FOR UPDATE sobre productos. cantidad se guarda como magnitud '
  'positiva (decisión documentada en la cabecera de la migración 126). La '
  'migración 143 atribuye responsable con fn_ronda_actor_correo. La '
  'migración 147 exige cantidad_fisica_confirmada -- el CONTEO FÍSICO, '
  'distinto de la cantidad del movimiento -- y sobrescribe con él '
  'rondas_excepciones.cantidad_fisica, misma garantía que la 132 dio a la '
  'vía sin respaldo.';

DO $$
DECLARE
  v_def     TEXT;
  v_acl     TEXT;
  v_secdef  BOOLEAN;
  v_searchp TEXT[];
BEGIN
  SELECT pg_get_functiondef(p.oid), p.proacl::TEXT, p.prosecdef, p.proconfig
    INTO v_def, v_acl, v_secdef, v_searchp
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_ronda_resolver_con_captura';

  IF v_def NOT ILIKE '%v_cantidad_fisica_confirmada NUMERIC := (payload ->> ''cantidad_fisica_confirmada'')::NUMERIC%' THEN
    RAISE EXCEPTION '147 ABORTADA (post): la función no lee cantidad_fisica_confirmada del payload.';
  END IF;
  IF v_def NOT ILIKE '%cantidad_fisica_confirmada es requerida%' THEN
    RAISE EXCEPTION '147 ABORTADA (post): falta la guarda que exige cantidad_fisica_confirmada.';
  END IF;
  IF v_def NOT ILIKE '%v_cantidad_fisica_confirmada < 0%' THEN
    RAISE EXCEPTION '147 ABORTADA (post): falta la guarda de negativos (0 sigue siendo válido).';
  END IF;
  IF v_def NOT ILIKE '%cantidad_fisica = v_cantidad_fisica_confirmada%' THEN
    RAISE EXCEPTION '147 ABORTADA (post): el UPDATE no sobrescribe rondas_excepciones.cantidad_fisica con el valor confirmado.';
  END IF;
  -- Lo heredado que NO se puede perder en un CREATE OR REPLACE.
  IF v_def NOT ILIKE '%v_excepcion.estado <> ''explicada''%' THEN
    RAISE EXCEPTION '147 ABORTADA (post): la guarda CA-38 de estado "explicada" se perdió en este reemplazo.';
  END IF;
  IF v_def NOT ILIKE '%fn_ronda_actor_correo(v_actor_usuario, v_actor_telegram)%'
     OR v_def ILIKE '%fn_ronda_actor_nombre(%' THEN
    RAISE EXCEPTION '147 ABORTADA (post): la atribución por fn_ronda_actor_correo (migración 143) no sobrevivió.';
  END IF;
  IF v_def NOT ILIKE '%fn_ronda_validar_actor(v_actor_usuario, v_actor_telegram, ''inventario_explicacion'')%' THEN
    RAISE EXCEPTION '147 ABORTADA (post): la autorización por inventario_explicacion se perdió.';
  END IF;
  -- Comillas DOBLES, las mismas que el RAISE del cuerpo (~línea 160:
  -- nunca "Ajuste"). El fichero original buscaba '%''Ajuste''%' (simples)
  -- y abortaba siempre -- ESCO-112. Esta línea es la corrección.
  IF v_def NOT ILIKE '%"Ajuste"%' THEN
    RAISE EXCEPTION '147 ABORTADA (post): la guarda CA-8 sobre tipo_movimiento se perdió.';
  END IF;

  -- Seguridad y grants: prosecdef/proconfig, nunca el texto del DDL
  -- (pg_get_functiondef omite SECURITY INVOKER por ser el default -- lección
  -- de la 130).
  IF v_secdef IS DISTINCT FROM FALSE THEN
    RAISE EXCEPTION '147 ABORTADA (post): la función quedó SECURITY DEFINER -- debía seguir SECURITY INVOKER.';
  END IF;
  IF NOT ('search_path=public, pg_temp' = ANY(COALESCE(v_searchp, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION '147 ABORTADA (post): el search_path pineado no sobrevivió al CREATE OR REPLACE. proconfig actual: %', v_searchp;
  END IF;
  IF v_acl IS NULL OR v_acl NOT LIKE '%authenticated=X%' OR v_acl NOT LIKE '%service_role=X%' OR v_acl LIKE '%anon%' THEN
    RAISE EXCEPTION '147 ABORTADA (post): el ACL de la función cambió respecto al esperado (authenticated+service_role, nunca anon). ACL actual: %', v_acl;
  END IF;

  RAISE NOTICE '147 OK: fn_ronda_resolver_con_captura exige cantidad_fisica_confirmada y la persiste en rondas_excepciones.cantidad_fisica. 0 filas de dominio tocadas.';
END $$;

-- ROLLBACK (no ejecutar salvo instrucción explícita del dueño): restaurar el
-- cuerpo previo -- el que dejó la 143, md5 de prosrc
-- `e2b4878c163624f971b194075e0bb774` -- con un segundo CREATE OR REPLACE
-- FUNCTION fn_ronda_resolver_con_captura(payload JSONB) reproduciendo ese
-- cuerpo literal (es este mismo archivo sin la declaración
-- v_cantidad_fisica_confirmada, sin sus dos guardas, sin la línea
-- `cantidad_fisica = ...` del UPDATE y sin la clave nueva del RETURN).
-- Revertir esto reabre la segunda puerta: un mal parseo de unidad de empaque
-- («tres bultos de 50 kilos» -> 3) vuelve a quedar congelado en el registro
-- de trazabilidad de la excepción y a contradecir el informe de cierre.
