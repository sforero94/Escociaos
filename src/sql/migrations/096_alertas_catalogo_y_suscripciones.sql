-- =====================================================================
-- 096: Suscripciones a alertas por usuario de Telegram -- catálogo
--      genérico + suscripciones + cola de envíos del broadcast del hato.
-- Fecha: 2026-08-14
--
-- CONTEXTO Y DECISIONES DEL DUEÑO (2026-08-14, contrato, no se negocian
-- en esta migración):
--   - "Broadcast con cierre por el primero": una alerta se manda a TODOS
--     los suscritos de su tipo; la primera respuesta la cierra para
--     todos, y los demás ven que ya se resolvió y por quién. NUNCA una
--     alerta por persona.
--   - El escalamiento es una segunda casilla POR TIPO DE ALERTA y por
--     persona -- `HATO_ALERTAS_ESCALAMIENTO_TELEGRAM_ID` (variable de
--     entorno) deja de ser la fuente de verdad del escalamiento; el
--     motor (`hato-alertas-tick.ts`, cambiado junto con esta migración,
--     fuera del alcance de un archivo SQL) resuelve destinatarios y
--     escalamiento desde las tablas de abajo.
--
-- POR QUÉ GENÉRICO A PROPÓSITO: el CATÁLOGO y las SUSCRIPCIONES sirven
-- para cualquier módulo (`hato`, y lo que venga de `aguacate`/`ganado`
-- más adelante) -- `alertas_catalogo.clave` es `modulo.tipo`. Las
-- INSTANCIAS de alerta siguen siendo por módulo (`hato_alertas`, ya
-- existente desde 056) -- no se generaliza eso, no es lo que se pidió.
--
-- QUÉ CREA:
--   1. alertas_catalogo               -- catálogo de tipos de alerta,
--                                         cualquier módulo.
--   2. telegram_alertas_suscripciones -- quién recibe / quién escala,
--                                         por usuario de Telegram y tipo.
--   3. hato_alertas_envios            -- un envío por (alerta, suscrito)
--                                         del broadcast del hato -- lo
--                                         que permite editar el mensaje
--                                         de cada suscrito cuando la
--                                         alerta se cierra (guarda
--                                         `message_id`). Es del hato
--                                         porque referencia hato_alertas;
--                                         cuando exista un motor de
--                                         alertas de otro módulo, ese
--                                         módulo tendrá su propia tabla
--                                         de envíos con el mismo patrón.
--
-- SIEMBRA: las 5 claves salen de los `tipo` que hoy tiene
-- `hato_alertas_config` (CHECK de la migración 056: secado_due,
-- tratamiento_paso, rechequeo_due, servicio_sin_confirmacion,
-- parto_proximo), con nombre/descripción en español pensados para una
-- casilla que un humano marca, no para un log técnico.
--
-- Las suscripciones se siembran DERIVADAS DEL ESTADO ACTUAL de
-- `hato_alertas_config.destinatario_telegram_id` (verificado en
-- producción antes de escribir esta migración: las 5 filas apuntan a
-- `8505349717`, Santiago -- migración 091, D-14): quien hoy está ahí
-- queda con `recibe=true` y **`escalamiento=false`**, para que el día del
-- despliegue el comportamiento del motor NO CAMBIE.
--
-- El `false` del escalamiento NO es un descuido, es el estado actual:
-- verificado con `supabase secrets list` el 2026-08-14, la variable
-- `HATO_ALERTAS_ESCALAMIENTO_TELEGRAM_ID` **nunca se configuró**, así que
-- hoy una alerta escalada no le llega a nadie -- se marca `escalada` y
-- muere ahí. Sembrar `true` habría encendido, de refilón y dentro de una
-- migración de andamiaje, una función apagada desde julio. Encenderla es
-- una decisión del dueño, y a partir de esta migración tiene una casilla
-- para tomarla.
--
-- `hato_alertas_config` NO SE TOCA en esta migración (ni su columna
-- `destinatario_telegram_id`, ni `activo`, ni `horas_escalamiento`) --
-- el motor sigue leyendo `activo`/`horas_escalamiento` de ahí (son
-- ajustes por tipo, no de destinatario). `destinatario_telegram_id` en
-- esa tabla queda VESTIGIAL desde el momento en que el motor deja de
-- leerla para resolver a quién enviar (cambio de código, no de esquema)
-- -- se documenta acá para que quede constancia, igual que se documenta
-- abajo qué pasa con `hato_alertas.destinatario_telegram_id` (esa sí es
-- una columna que el motor sigue escribiendo, con un significado nuevo:
-- "a quién se le envió primero", ya no "el único destinatario" -- ver el
-- reporte de la sesión que acompaña esta migración).
--
-- RLS: NO es el patrón 044/056 uniforme en las tres tablas -- corregido
-- (mensaje del orquestador, verificado contra producción antes de escribir
-- una sola política): `telegram_usuarios` no usa 044, tiene UNA sola policy
-- `ALL` para `authenticated` Gerencia-only (lectura incluida). Como
-- `telegram_alertas_suscripciones` se edita desde la MISMA pantalla
-- (`TelegramConfig.tsx`) que ya gestiona `telegram_usuarios` con esa
-- policy, la imita verbatim -- darle escritura a Administrador sería un
-- permiso inalcanzable desde esa pantalla y dejaría el modelo de seguridad
-- diciendo dos cosas distintas.
--   - alertas_catalogo: SELECT authenticated (catálogo de NOMBRES, no de
--     destinatarios -- lo puede leer cualquier pantalla, lo va a necesitar
--     el futuro módulo de aguacate), escritura Gerencia-only.
--   - telegram_alertas_suscripciones: UNA sola policy ALL, Gerencia-only
--     (lectura incluida), mismo predicado que `telegram_usuarios`.
--   - hato_alertas_envios: NINGUNA política para `authenticated`/`anon`,
--     sin grants de navegador en absoluto -- es plomería del motor (quién
--     recibió qué mensaje, con qué message_id), la escribe y la lee el
--     `service_role` desde el tick y desde el callback del bot, igual que
--     `telegram_mensajes` (026).
--
-- Todos los predicados de rol van envueltos `(SELECT auth.uid())`, nunca
-- `auth.uid()` a secas -- mismo criterio que 077/093 y que la policy real
-- de `telegram_usuarios`, que ya está así.
--
-- Trampa de la migración 081: Supabase concede `ALL` a `anon`/`authenticated`
-- por defecto en tablas nuevas de `public` (`ALTER DEFAULT PRIVILEGES`) --
-- eso es justo lo que dejó expuesto un backup el 2026-08-03. Con RLS
-- habilitada y sin política `TO anon`, `anon` ya queda bloqueado por RLS
-- sola, pero esta migración además REVOCA el grant por defecto de forma
-- explícita (defensa en profundidad, mismo criterio que 084 aplicó sobre
-- `hato_correcciones`) -- nunca se deja como decoración.
--
-- Guardas de entrada/salida con RAISE EXCEPTION (patrón 075/080/091/095):
-- verifica que `hato_alertas_config` siga teniendo exactamente los 5
-- tipos esperados antes de sembrar, y que la siembra deje exactamente
-- las filas esperadas después -- un INNER JOIN que no encuentra a quién
-- resolver un `telegram_id` se traga la fila en silencio si nadie lo
-- comprueba, y eso es exactamente lo que este guard existe para atrapar.
--
-- NO SE APLICA por esta sesión -- la aplica el orquestador con el
-- conector autenticado, igual que 086/091/095.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. alertas_catalogo -- genérico, cualquier módulo.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS alertas_catalogo (
  clave       TEXT PRIMARY KEY,            -- 'hato.secado_due' (modulo.tipo)
  modulo      TEXT NOT NULL,               -- 'hato' | 'aguacate' | 'ganado' (sin CHECK: a propósito, ver cabecera)
  nombre      TEXT NOT NULL,               -- lo que ve el humano en la casilla
  descripcion TEXT,
  orden       INTEGER NOT NULL DEFAULT 0,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alertas_catalogo_modulo ON alertas_catalogo(modulo);

DROP TRIGGER IF EXISTS update_alertas_catalogo_updated_at ON alertas_catalogo;
CREATE TRIGGER update_alertas_catalogo_updated_at
  BEFORE UPDATE ON alertas_catalogo
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------
-- 2. telegram_alertas_suscripciones -- quién recibe / quién escala.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS telegram_alertas_suscripciones (
  telegram_usuario_id UUID NOT NULL REFERENCES telegram_usuarios(id) ON DELETE CASCADE,
  alerta_clave         TEXT NOT NULL REFERENCES alertas_catalogo(clave) ON DELETE CASCADE,
  recibe                BOOLEAN NOT NULL DEFAULT TRUE,
  escalamiento          BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- UUID pelado, SIN FK a `auth.users`: verificado 2026-08-14 contra
  -- producción, en toda la base hay CERO claves foráneas hacia `auth.users`.
  -- Las columnas de atribución del repo (`created_by` en tareas, fin_gastos,
  -- fin_ingresos, monitoreos, registros_trabajo -- migraciones 040/050/063/074)
  -- son todas `uuid` sin referencia. Introducir aquí la primera FK al esquema
  -- `auth` acoplaría este módulo al ciclo de vida de la tabla de auth de
  -- Supabase por una columna que sólo sirve de traza.
  updated_by            UUID,
  PRIMARY KEY (telegram_usuario_id, alerta_clave)
);

CREATE INDEX IF NOT EXISTS idx_telegram_alertas_suscripciones_clave ON telegram_alertas_suscripciones(alerta_clave);

DROP TRIGGER IF EXISTS update_telegram_alertas_suscripciones_updated_at ON telegram_alertas_suscripciones;
CREATE TRIGGER update_telegram_alertas_suscripciones_updated_at
  BEFORE UPDATE ON telegram_alertas_suscripciones
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------
-- 3. hato_alertas_envios -- un envío por (alerta, suscrito) del
--    broadcast. `message_id` es lo que permite editar el mensaje de
--    CADA suscrito cuando la alerta se cierra (Telegram no tiene forma
--    de "cerrar para todos" de otro modo que editar cada mensaje que
--    mandó). `telegram_id` (no el uuid de `telegram_usuarios`) porque es
--    lo que la Bot API necesita para `editMessageText` (`chat_id`).
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS hato_alertas_envios (
  alerta_id   UUID NOT NULL REFERENCES hato_alertas(id) ON DELETE CASCADE,
  telegram_id TEXT NOT NULL,
  message_id  BIGINT,
  enviado_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (alerta_id, telegram_id)
);

-- ---------------------------------------------------------------------
-- 4. RLS.
-- ---------------------------------------------------------------------

-- Corrección post-escritura (mensaje del orquestador, verificado contra
-- producción antes de aplicar cualquier cambio): `telegram_usuarios` NO usa
-- el patrón 044 -- tiene UNA sola policy `ALL` para `authenticated`,
-- Gerencia-only (lectura incluida), predicado envuelto `(select auth.uid())`
-- (077/093). Texto EXACTO copiado de `pg_policies` (2026-08-14):
--
--   cmd: ALL, roles: {authenticated}
--   qual = with_check = EXISTS (
--     SELECT 1 FROM usuarios
--     WHERE usuarios.id = (SELECT auth.uid()) AND usuarios.rol = 'Gerencia'::rol_usuario
--   )
--
-- `telegram_alertas_suscripciones` se edita desde la MISMA pantalla
-- (Configuración -> Telegram, `TelegramConfig.tsx`) que ya gestiona
-- `telegram_usuarios` con esa policy -- imita el MISMO predicado, verbatim,
-- para que el modelo de seguridad de esa pantalla no diga dos cosas
-- distintas (darle escritura a Administrador sería un permiso que nadie
-- puede ejercer: la pantalla ya es inalcanzable para ese rol).
--
-- `alertas_catalogo` SÍ queda con SELECT abierto a `authenticated` -- es un
-- catálogo de NOMBRES (no de destinatarios), lo puede leer cualquier
-- pantalla del sistema y lo va a necesitar el futuro módulo de aguacate;
-- solo la escritura es Gerencia-only, mismo predicado envuelto.

-- 4.1 alertas_catalogo -- SELECT authenticated (catálogo de nombres, no de
--     destinatarios), escritura Gerencia-only.
ALTER TABLE alertas_catalogo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alertas_catalogo_select_authenticated" ON alertas_catalogo;
CREATE POLICY "alertas_catalogo_select_authenticated" ON alertas_catalogo
  FOR SELECT TO authenticated
  USING (TRUE);

DROP POLICY IF EXISTS "alertas_catalogo_write_gerencia" ON alertas_catalogo;
CREATE POLICY "alertas_catalogo_write_gerencia" ON alertas_catalogo
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = (SELECT auth.uid())
        AND usuarios.rol = 'Gerencia'::rol_usuario
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = (SELECT auth.uid())
        AND usuarios.rol = 'Gerencia'::rol_usuario
    )
  );

REVOKE ALL ON TABLE alertas_catalogo FROM anon;

-- 4.2 telegram_alertas_suscripciones -- UNA sola policy ALL, Gerencia-only
--     (lectura incluida), texto verbatim de la policy real de
--     `telegram_usuarios` (ver nota arriba) -- misma pantalla, mismo dueño.
ALTER TABLE telegram_alertas_suscripciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "telegram_alertas_suscripciones_select_authenticated" ON telegram_alertas_suscripciones;
DROP POLICY IF EXISTS "telegram_alertas_suscripciones_write_admin_gerencia" ON telegram_alertas_suscripciones;
DROP POLICY IF EXISTS "Gerencia puede gestionar telegram_alertas_suscripciones" ON telegram_alertas_suscripciones;
CREATE POLICY "Gerencia puede gestionar telegram_alertas_suscripciones"
  ON telegram_alertas_suscripciones
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = (SELECT auth.uid())
        AND usuarios.rol = 'Gerencia'::rol_usuario
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios
      WHERE usuarios.id = (SELECT auth.uid())
        AND usuarios.rol = 'Gerencia'::rol_usuario
    )
  );

REVOKE ALL ON TABLE telegram_alertas_suscripciones FROM anon;

-- 4.3 hato_alertas_envios -- deny-all para anon/authenticated, SIN grants
--     de navegador en absoluto (ni siquiera SELECT) -- es traza del motor,
--     no dato de pantalla, mismo criterio que `telegram_mensajes` (026). El
--     tick y el callback del bot escriben/leen con la `service_role`, que
--     ignora RLS.
ALTER TABLE hato_alertas_envios ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE hato_alertas_envios FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. Guarda de entrada -- hato_alertas_config debe seguir teniendo
--    exactamente los 5 tipos que la migración 056 sembró. Si esto
--    cambió (una migración futura agregó/quitó un tipo sin actualizar
--    esta), la siembra de abajo estaría incompleta o inventando una
--    clave que no corresponde -- mejor abortar que sembrar mal.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_tipos_esperados TEXT[] := ARRAY['secado_due', 'tratamiento_paso', 'rechequeo_due', 'servicio_sin_confirmacion', 'parto_proximo'];
  v_tipos_actuales   TEXT[];
BEGIN
  SELECT array_agg(tipo ORDER BY tipo) INTO v_tipos_actuales FROM hato_alertas_config;
  IF v_tipos_actuales IS DISTINCT FROM (SELECT array_agg(t ORDER BY t) FROM unnest(v_tipos_esperados) AS t) THEN
    RAISE EXCEPTION '096 ABORTADA: hato_alertas_config.tipo no son los 5 esperados. Esperados: %, encontrados: %. Revisar antes de sembrar alertas_catalogo.', v_tipos_esperados, v_tipos_actuales;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 6. Siembra de alertas_catalogo -- las 5 claves del hato, nombre y
--    descripción en español para la UI de casillas.
-- ---------------------------------------------------------------------

INSERT INTO alertas_catalogo (clave, modulo, nombre, descripcion, orden, activo)
VALUES
  ('hato.secado_due', 'hato', 'Vaca por secar',
   'La vaca llegó a la fecha programada de secado y todavía no se registró el secado real.',
   1, TRUE),
  ('hato.tratamiento_paso', 'hato', 'Paso de tratamiento pendiente',
   'Un paso de un tratamiento veterinario tiene fecha programada para hoy y no se ha marcado como ejecutado.',
   2, TRUE),
  ('hato.rechequeo_due', 'hato', 'Rechequeo veterinario pendiente',
   'Pasó el tiempo esperado desde el último chequeo de la vaca sin que se haya registrado uno nuevo.',
   3, TRUE),
  ('hato.servicio_sin_confirmacion', 'hato', 'Servicio sin confirmar preñez',
   'La vaca fue servida hace tiempo y todavía no hay confirmación de preñez ni ninguna novedad registrada.',
   4, TRUE),
  ('hato.parto_proximo', 'hato', 'Parto próximo',
   'La fecha probable de parto de la vaca está cerca.',
   5, TRUE)
ON CONFLICT (clave) DO NOTHING;

-- ---------------------------------------------------------------------
-- 7. Siembra de telegram_alertas_suscripciones -- derivada del estado
--    actual de hato_alertas_config.destinatario_telegram_id, para que
--    el despliegue no le cambie el comportamiento a nadie (ver cabecera).
--
--    El CAST a bigint puede fallar si algún día `destinatario_telegram_id`
--    trae algo no numérico -- preferible un error de tipo ruidoso a un
--    JOIN que descarta la fila en silencio.
-- ---------------------------------------------------------------------

-- `escalamiento = FALSE`, NO true. Corregido antes de aplicar: la versión
-- anterior sembraba `TRUE` diciendo que así "el comportamiento no cambia", y
-- es exactamente al revés. Verificado el 2026-08-14 con `supabase secrets
-- list`: **`HATO_ALERTAS_ESCALAMIENTO_TELEGRAM_ID` NUNCA se configuró**, así
-- que hoy el escalamiento no le manda mensaje a NADIE -- las alertas sin
-- responder sólo se marcan `escalada` y ahí mueren (comportamiento
-- documentado en CLAUDE.md: "unset -> escalated alerts are only marked
-- escalada, no message sent"). Sembrar `TRUE` habría ENCENDIDO, como efecto
-- colateral de una migración de andamiaje, una función que lleva apagada
-- desde julio. Encenderla es una decisión del dueño y ahora tiene una casilla
-- para tomarla.
INSERT INTO telegram_alertas_suscripciones (telegram_usuario_id, alerta_clave, recibe, escalamiento)
SELECT tu.id, 'hato.' || hac.tipo, TRUE, FALSE
FROM hato_alertas_config hac
JOIN telegram_usuarios tu ON tu.telegram_id = hac.destinatario_telegram_id::bigint
WHERE hac.destinatario_telegram_id IS NOT NULL
ON CONFLICT (telegram_usuario_id, alerta_clave) DO NOTHING;

-- ---------------------------------------------------------------------
-- 8. Guarda de salida -- todo lo esperado quedó sembrado, y nada se
--    perdió en el JOIN del paso 7.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  v_catalogo_hato       INTEGER;
  v_config_con_destino  INTEGER;
  v_config_resueltas    INTEGER;
  v_suscripciones       INTEGER;
  v_suscripciones_no_full INTEGER;
BEGIN
  SELECT count(*) INTO v_catalogo_hato FROM alertas_catalogo WHERE modulo = 'hato';
  IF v_catalogo_hato <> 5 THEN
    RAISE EXCEPTION '096 ABORTADA: se esperaban 5 filas en alertas_catalogo con modulo=''hato'', hay %.', v_catalogo_hato;
  END IF;

  SELECT count(*) INTO v_config_con_destino
    FROM hato_alertas_config WHERE destinatario_telegram_id IS NOT NULL;

  SELECT count(*) INTO v_config_resueltas
    FROM hato_alertas_config hac
    JOIN telegram_usuarios tu ON tu.telegram_id = hac.destinatario_telegram_id::bigint
   WHERE hac.destinatario_telegram_id IS NOT NULL;

  IF v_config_con_destino <> v_config_resueltas THEN
    RAISE EXCEPTION '096 ABORTADA: % fila(s) de hato_alertas_config tienen destinatario_telegram_id que NO resuelve contra telegram_usuarios (de % con destinatario). Revisar telegram_usuarios antes de reintentar -- el JOIN de la siembra las habría descartado en silencio.',
      (v_config_con_destino - v_config_resueltas), v_config_con_destino;
  END IF;

  SELECT count(*) INTO v_suscripciones FROM telegram_alertas_suscripciones;
  IF v_suscripciones <> v_config_resueltas THEN
    RAISE EXCEPTION '096 ABORTADA: se esperaban % suscripciones sembradas (una por hato_alertas_config con destinatario resuelto), hay %.', v_config_resueltas, v_suscripciones;
  END IF;

  -- El estado sembrado tiene que reproducir EXACTAMENTE lo de hoy: quien
  -- recibía, recibe; y el escalamiento queda APAGADO porque hoy no le llega a
  -- nadie (el secreto nunca se configuró -- ver la nota del paso 7). Si
  -- alguna fila saliera con `escalamiento=true`, el despliegue estaría
  -- encendiendo mensajes que hoy no existen.
  SELECT count(*) INTO v_suscripciones_no_full
    FROM telegram_alertas_suscripciones
   WHERE NOT recibe OR escalamiento;
  IF v_suscripciones_no_full <> 0 THEN
    RAISE EXCEPTION '096 ABORTADA: % suscripción(es) sembradas no quedaron con recibe=true y escalamiento=false -- el despliegue le cambiaría el comportamiento a alguien.', v_suscripciones_no_full;
  END IF;

  RAISE NOTICE '096 OK: alertas_catalogo con 5 filas del hato, % suscripciones sembradas (recibe=true, escalamiento=false) reproduciendo el estado actual de hato_alertas_config.', v_suscripciones;
END $$;

-- =============================================================================
-- ROLLBACK (manual)
-- =============================================================================
--   DROP TABLE IF EXISTS hato_alertas_envios;
--   DROP TABLE IF EXISTS telegram_alertas_suscripciones;
--   DROP TABLE IF EXISTS alertas_catalogo;
-- Ninguna de las tres tiene historia que preservar todavía (son nuevas en
-- esta migración) -- a diferencia de 075/080/095, un DROP directo no
-- pierde nada que no se pueda volver a sembrar corriendo esta migración
-- de nuevo, siempre que hato_alertas_config no haya cambiado mientras
-- tanto.
-- =============================================================================
