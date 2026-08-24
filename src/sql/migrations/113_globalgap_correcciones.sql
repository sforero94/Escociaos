-- =============================================================================
-- 113_globalgap_correcciones.sql
--
-- PARTE B del hallazgo #19. Decisión ya tomada por el dueño (2026-08-24, ver
-- el runbook de mantenimiento): extender el disparador genérico de la
-- migración 084 a la cadena GlobalGAP -- `aplicaciones` y `movimientos_diarios*`
-- -- para que, fuera del módulo Hato, un UPDATE/DELETE humano deje de ser
-- indetectable.
--
-- NUMERACIÓN: 113. Los archivos 110 (`delete_globalgap_por_rol`) y 111
-- (`cerrar_logs_auditoria`) ya están aplicados a producción (ledger
-- `20260824200409` y posterior); 112 (`productos_updated_by`) está en vuelo.
-- Si al leer esto no ves 110-112 en este árbol es porque esos PR todavía no se
-- fusionaron a `main` -- no es un hueco (mismo aviso que dejó la 111 sobre la
-- 110). Esta migración NO depende de que 110/111/112 estén aplicadas: es
-- aditiva e independiente de las tres.
--
-- La propia migración 111 (cierra la PARTE A -- INSERT sin autenticar en
-- `logs_auditoria`) deja escrito textualmente qué falta: "extender el
-- disparador genérico de la 084 (fn_hato_registrar_correccion, ya agnóstico de
-- tabla vía to_jsonb(OLD)) a aplicaciones y movimientos_diarios*". Esta
-- migración es exactamente eso, con una decisión de forma que se justifica
-- abajo: NO reutiliza literalmente esa función ni esa tabla -- crea una
-- hermana. La razón no es preferencia, es una restricción dura de este mismo
-- encargo (ver "POR QUÉ UNA TABLA HERMANA, NO `hato_correcciones`" más abajo).
--
-- ---------------------------------------------------------------------------
-- QUÉ ESTÁ MAL HOY (fuera del Hato)
-- ---------------------------------------------------------------------------
-- Si alguien edita o borra una aplicación o un movimiento diario -- las dos
-- superficies centrales de trazabilidad GlobalGAP ("quién hizo el trabajo,
-- cuándo, en qué lote, con qué producto") -- no queda ningún registro de qué
-- decía antes ni de quién lo cambió. `logs_auditoria` tiene 0 filas (y desde
-- la 111 tampoco acepta escritura sin rol Gerencia). `hato_correcciones`
-- (084) sólo cubre las 5 tablas del módulo Hato Lechero. Fuera de esas 5, un
-- cambio o un borrado no deja rastro en ninguna parte.
--
-- ---------------------------------------------------------------------------
-- QUÉ TABLAS ENTRAN, Y POR QUÉ ESTAS 9
-- ---------------------------------------------------------------------------
-- El "core GlobalGAP" nombrado en el encargo es `aplicaciones`,
-- `movimientos_diarios`, `movimientos_diarios_productos`. Verificado contra
-- `src/types/database.ts` (columnas reales, no `docs/supabase_tablas.md`, que
-- CLAUDE.md ya marca desactualizado) que la familia `movimientos_diarios*`
-- completa son exactamente 4 tablas -- `movimientos_diarios`,
-- `movimientos_diarios_productos`, `movimientos_diarios_empleados`,
-- `movimientos_diarios_trabajadores` -- ni una más.
--
-- La migración 110 (recién aplicada, 2026-08-24) mapea la otra mitad de la
-- cadena: verificó contra el catálogo vivo que 4 tablas de `aplicaciones_*`
-- comparten la MISMA anatomía de acceso que sus 3 primas de
-- `movimientos_diarios_*` -- SELECT/INSERT abiertos a `authenticated`, y
-- hasta el 24-ago DELETE también abierto (110 lo acotó a Gerencia/
-- Administrador, sin tocar SELECT/INSERT). Esas 7 tablas son, literalmente,
-- "aplicaciones" en plural: `aplicaciones_productos`, `aplicaciones_calculos`,
-- `aplicaciones_lotes`, `aplicaciones_compras` + las 3 de movimientos.
--
-- Sumando el encabezado `aplicaciones` (que 110 excluyó de su alcance por una
-- razón distinta -- ya tenía DELETE acotado por rol, no por estar fuera de la
-- "cadena") y el encabezado `movimientos_diarios` (misma situación: 110 no lo
-- tocó porque su DELETE ya está acotado por `created_by = auth.uid()`, no
-- porque no sea parte del mismo relato), el conjunto de esta migración son
-- las 9 tablas que registran de verdad "qué se hizo, dónde, con qué producto":
--
--   aplicaciones                       (encabezado de la aplicación)
--   aplicaciones_productos             (qué producto, qué dosis)
--   aplicaciones_calculos               (cálculo de mezcla por lote)
--   aplicaciones_lotes                  (qué lote, cuántos árboles)
--   aplicaciones_compras                (faltante/compra derivada)
--   movimientos_diarios                 (encabezado del movimiento real)
--   movimientos_diarios_productos       (qué producto se usó de verdad)
--   movimientos_diarios_empleados       (0 filas hoy -- ver 110: reemplazada
--                                        por movimientos_diarios_trabajadores,
--                                        pero es gratis dejarla cubierta si
--                                        algún día vuelve a usarse)
--   movimientos_diarios_trabajadores    (quién trabajó, en qué lote)
--
-- QUÉ SE DEJA FUERA A PROPÓSITO -- y por qué NO es un descuido:
--
--   * `aplicaciones_mezclas` -- misma familia de nombre, pero NO es parte de
--     la cadena que mapeó la 110 (esa migración la nombra aparte como "la
--     hermana" que YA tenía DELETE acotado a Gerencia/Administrador desde
--     siempre). Verificado además contra la 093 (líneas ~185-267): tiene sus
--     propias políticas ALL "Gerencia acceso total" / "Administrador puede
--     todo en mezclas" -- el mismo patrón restrictivo que `aplicaciones`, no
--     el patrón abierto de las 7. Es un problema de acceso ya resuelto, no de
--     trazabilidad sin resolver; añadirla aquí es crecer el alcance que el
--     dueño explícitamente rechazó ("most of those tables nobody will ever
--     audit").
--   * `aplicaciones_cierre` -- verificado con grep sobre
--     `src/components/aplicaciones/` y `src/utils/`: CERO llamadas `.update(`
--     o `.delete(` contra esta tabla en toda la app. Es un registro de
--     evidencia de cierre, INSERT-only por contrato (migración 106). Un
--     trigger AFTER UPDATE OR DELETE sobre una tabla que nadie edita no
--     protege nada -- a diferencia de `hato_chequeo_vacas` en la 084 (que SÍ
--     se dejó cubierta "por si algún día se toca" porque el diseño del hato
--     preveía UI de edición futura ahí). Aquí no hay ese plan.
--   * `aplicaciones_lotes_planificado` -- CLAUDE.md es explícito: 0 filas,
--     nunca se escribió, contractualmente vacía. Cubrir una tabla muerta con
--     un trigger de auditoría no compra nada.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ UNA TABLA HERMANA, NO `hato_correcciones`
-- ---------------------------------------------------------------------------
-- `hato_correcciones` (084) YA es agnóstica de tabla en su trigger
-- (`to_jsonb(OLD)`/`to_jsonb(NEW)`, sin lista de columnas) -- pero NO en su
-- esquema: la columna `tabla` tiene un CHECK que sólo admite los 5 nombres de
-- tablas del hato. Ampliarlo a las 9 de esta migración exige DROP + ADD de
-- ese CHECK (un CHECK no se "amplía" en sitio), y el encargo es explícito:
-- "Strictly additive ... Any DROP ... disqualifies it". No hay forma de
-- reutilizar esa tabla sin un DROP. Se crea entonces `globalgap_correcciones`
-- como hermana -- mismo diseño, mismo espíritu, su propio CHECK con sus 9
-- nombres.
--
-- Por la misma razón (y por "un concern por cambio" -- no tocar un trigger
-- que lleva corriendo en producción sobre el módulo Hato desde el
-- 2026-08-06 mientras se construye algo para un módulo distinto) esta
-- migración tampoco reutiliza `fn_hato_registrar_correccion()`: crea
-- `fn_globalgap_registrar_correccion()`, casi calcada -- mismas 3 propiedades
-- de la 084 preservadas EXACTO (ver abajo) -- pero con su propia columna de
-- referencia denormalizada (`aplicacion_id` en vez de `animal_id`, ver
-- siguiente sección) y sin la lógica de `motivo` que sólo tenía sentido para
-- `hato_eventos.datos->>'motivo_correccion'`.
--
-- Se PRESERVAN EXACTO las 3 propiedades de la 084 que el encargo marca como
-- no negociables:
--   1. `IF auth.uid() IS NULL THEN RETURN` -- sólo sesiones humanas de
--      navegador dejan traza. El bot de Telegram, `service_role` (incluye el
--      `fn_cerrar_aplicacion` de la 106, que corre SECURITY INVOKER pero como
--      sesión Gerencia/Administrador autenticada -- SÍ deja traza, que es lo
--      correcto: es una sesión humana cerrando una aplicación) y las
--      migraciones no generan ruido.
--   2. `SECURITY DEFINER` con `search_path` fijado a `public, pg_temp` (en
--      ESE orden) y `EXECUTE` revocado de `PUBLIC`/`anon`/`authenticated` --
--      un trigger dispara igual sin ese EXECUTE (082 parte 2, verificado dos
--      veces contra producción).
--   3. La app NUNCA inserta en la tabla de traza: sólo SELECT para
--      `authenticated`, sin política de escritura, y REVOKE explícito de
--      INSERT/UPDATE/DELETE/TRUNCATE (trampa de `ALTER DEFAULT PRIVILEGES`
--      que documentó la 081).
--
-- `globalgap_correcciones` vive en `public`, NO en `respaldos`: es operativa
-- (se leerá desde una futura pantalla de trazabilidad, igual que
-- `hato_correcciones` alimenta la Hoja de Vida), no un respaldo forense.
-- `respaldos` es sólo para backups que PostgREST no debe exponer nunca
-- (080/081/099/107) -- esto es lo contrario: una tabla que SÍ se expone,
-- deliberadamente, a los roles que auditan.
--
-- ---------------------------------------------------------------------------
-- LA COLUMNA DENORMALIZADA: `aplicacion_id`, y por qué es parcial a propósito
-- ---------------------------------------------------------------------------
-- 084 denormalizó `animal_id` para "correcciones de este animal" sin que la
-- tabla de traza conociera la forma de las 5 fuentes -- usando
-- `to_jsonb(OLD)->>'animal_id'`, que devuelve NULL sin error en la tabla que
-- no tiene esa columna (`hato_produccion_quincenal`). Se repite exactamente
-- esa técnica acá con `aplicacion_id`, verificado columna por columna contra
-- `src/types/database.ts` (no contra `docs/supabase_tablas.md`):
--
--   aplicaciones                     -- es la propia entidad: se usa su `id`
--   aplicaciones_calculos            -- tiene aplicacion_id (directo)
--   aplicaciones_compras             -- tiene aplicacion_id (directo)
--   aplicaciones_lotes               -- tiene aplicacion_id (directo)
--   movimientos_diarios              -- tiene aplicacion_id (directo)
--   aplicaciones_productos           -- NO tiene aplicacion_id -- sólo
--                                        mezcla_id (FK a aplicaciones_mezclas)
--                                        -- queda NULL, honesto: ese dato no
--                                        vive en esta fila.
--   movimientos_diarios_productos    -- NO tiene aplicacion_id -- sólo
--   movimientos_diarios_empleados       movimiento_diario_id -- queda NULL,
--   movimientos_diarios_trabajadores    mismo criterio.
--
-- 5 de 9 quedan pobladas, 4 quedan NULL por construcción -- mismo hueco
-- aceptado que documentó la 084 para `hato_produccion_quincenal`. El dato no
-- se pierde: sigue dentro de `datos_anteriores`/`datos_nuevos` (ej.
-- `datos_anteriores->>'movimiento_diario_id'`), sólo no queda como columna
-- indexada propia -- igual que 084 no le dio a cada tabla su propia columna.
--
-- La columna `motivo` se mantiene por paridad de esquema con
-- `hato_correcciones` (mismo nombre, mismo tipo) pero SIEMPRE queda NULL hoy:
-- ninguna de las 9 tablas tiene una columna `datos jsonb` con
-- `motivo_correccion` como sí tiene `hato_eventos`. Queda lista para el día
-- en que alguna la tenga, sin necesitar una migración de esquema nueva.
--
-- ---------------------------------------------------------------------------
-- RLS DE LECTURA: por qué Gerencia/Administrador y NO "SELECT authenticated"
-- (a diferencia de `hato_correcciones`)
-- ---------------------------------------------------------------------------
-- 084 le dio a `hato_correcciones` lectura abierta a cualquier `authenticated`
-- porque las 5 tablas fuente del hato SIGUEN ese mismo patrón (044: escritura
-- Administrador+Gerencia, lectura abierta). Acá NO es uniforme. Verificado
-- por partida doble -- el propio texto de la 110 Y las políticas reales de la
-- 093 (líneas 185-186, 261-262) -- que `aplicaciones` tiene EXACTAMENTE 2
-- políticas, ambas `ALL` acotadas a Gerencia/Administrador, SIN ninguna
-- política de SELECT abierta. Las otras 8 tablas de este conjunto (incluida
-- `movimientos_diarios`, que no aparece en absoluto en la 093 -- prueba de que
-- su SELECT es el `true` sin envolver, no un `get_user_role()`) sí tienen
-- lectura abierta a cualquier `authenticated`.
--
-- Una tabla de traza COMPARTIDA no puede ser más permisiva que la más
-- restrictiva de sus 9 fuentes sin abrir una fuga: si `globalgap_correcciones`
-- fuera SELECT-abierta, cualquier `authenticated` (hoy son sólo Gerencia/
-- Administrador, pero el día que exista un Verificador -- el mismo escenario
-- que motivó la 110 -- ese usuario podría leer el valor ANTERIOR de una fila
-- de `aplicaciones` que su propia RLS le prohíbe leer en la tabla real.
-- Se opta por la lectura simple y pareja -- Gerencia/Administrador para las 9
-- -- en vez de un predicado condicional por valor de `tabla` (abrir para las 8
-- y cerrar sólo para 'aplicaciones'): un predicado así es más difícil de
-- verificar en revisión adversarial y el costo de equivocarse es exponer
-- justo el dato que se quiere proteger. Si algún día se necesita lectura más
-- amplia para las 8 tablas abiertas, es una migración aparte con su propia
-- revisión -- no se empaqueta acá.
--
-- ---------------------------------------------------------------------------
-- VOLUMEN -- a qué crece esta tabla en la práctica
-- ---------------------------------------------------------------------------
-- Las 9 fuentes hoy sólo suman unos pocos miles de filas en total, acumuladas
-- desde que el módulo opera (labores desde oct-2025, insumos desde dic-2025 --
-- ver CLAUDE.md, sección Producción): `aplicaciones` ~20, `movimientos_diarios`
-- ~158, `movimientos_diarios_productos` ~765 (cifras del propio encargo);
-- `aplicaciones_productos`/`aplicaciones_calculos`/`aplicaciones_lotes` en el
-- mismo orden de magnitud (decenas a unos pocos cientos, verificado estable
-- por la propia guarda de conteo de la 110); `movimientos_diarios_empleados`
-- en 0 (muerta); `aplicaciones_compras` y `movimientos_diarios_trabajadores`
-- sin cifra exacta a mano pero del mismo orden.
--
-- Y el trigger sólo escribe ante: (a) un UPDATE o DELETE -- nunca un INSERT,
-- que es la mayoría del volumen de estas tablas --, (b) hecho por una sesión
-- de navegador autenticada -- nunca el bot de Telegram ni `service_role` --,
-- y (c) hoy sólo hay 8 cuentas activas, todas Gerencia o Administrador (misma
-- cifra que verificó la 110). Corregir una aplicación o un movimiento ya
-- cerrado es la excepción, no la rutina. Crecimiento realista: unas pocas
-- filas al mes, muy lejos de necesitar partición o poda.
--
-- ---------------------------------------------------------------------------
-- FILAS AFECTADAS: cero
-- ---------------------------------------------------------------------------
-- Esta migración es puramente aditiva -- tabla nueva, función nueva, 9
-- triggers nuevos, una política nueva. Ningún UPDATE/DELETE toca las 9 tablas
-- fuente ni ninguna otra. La instalación de un trigger no reescribe filas
-- existentes -- sólo empieza a disparar ante el PRÓXIMO UPDATE/DELETE. La
-- postcondición 4.7 lo prueba comparando contra una línea base capturada en
-- tiempo de corrida (nunca un literal absoluto -- lección de la 103, que
-- perdió un día entero por comparar contra un conteo fijo en una tabla que
-- crece con cron).
--
-- ---------------------------------------------------------------------------
-- FORMA: por qué 9 `CREATE TRIGGER` explícitos y no un DO-loop
-- ---------------------------------------------------------------------------
-- El encargo permite `DO $$...$$` únicamente para bloques cuyo único efecto
-- son guardas `RAISE EXCEPTION` (verificación, sin mutar catálogo). Un
-- DO-loop con `EXECUTE format('CREATE TRIGGER ...')` no calza ahí -- muta el
-- catálogo dentro de un bloque que el encargo reserva para lectura. Por eso
-- las 9 sentencias `CREATE TRIGGER` van explícitas, una por tabla -- mismo
-- criterio que ya usa la 110 para su "2. El cambio" (7 `ALTER POLICY`
-- explícitas, sin loop, "no hay forma de parametrizar ... y un DO-loop con
-- SQL dinámico haría el diff imposible de auditar" -- cita textual de la 093).
-- Tampoco hay `DROP TRIGGER IF EXISTS` antes de cada `CREATE TRIGGER` (a
-- diferencia de la 084): `DROP` está fuera del carril aditivo de este
-- encargo. Si esta migración se reintenta sobre un estado ya aplicado, el
-- `CREATE TRIGGER` sin `IF NOT EXISTS` (Postgres no lo soporta) falla alto y
-- claro y aborta la transacción entera -- no corrompe nada, sólo obliga a que
-- un humano lo mire, que es exactamente lo que hace además la guarda 1.1.
--
-- ---------------------------------------------------------------------------
-- UNA DISCREPANCIA ENCONTRADA, NO CORREGIDA AQUÍ (fuera de alcance)
-- ---------------------------------------------------------------------------
-- CLAUDE.md (sección "Audit", encabezado del proyecto) dice: "aplicaciones and
-- movimientos_diarios* still have no capturer column". Verificado contra
-- `src/types/database.ts` y contra el propio texto de la 110: `movimientos_
-- diarios.created_by` SÍ existe y está poblada en 157 de 157 filas ("esa
-- columna está poblada en 157 de 157 filas", cita literal de la 110). CLAUDE.md
-- parece desactualizado en ese punto puntual. No se corrige en esta migración
-- (ni se edita CLAUDE.md desde este rol) -- queda señalado en el reporte para
-- que el dueño invoque al `cto` si hace falta.
-- =============================================================================


-- =============================================================================
-- 1. Pre-condiciones. Cualquiera que falle aborta la transacción entera.
-- =============================================================================
DO $$
DECLARE
  v_tablas text[] := ARRAY[
    'aplicaciones',
    'aplicaciones_productos',
    'aplicaciones_calculos',
    'aplicaciones_lotes',
    'aplicaciones_compras',
    'movimientos_diarios',
    'movimientos_diarios_productos',
    'movimientos_diarios_empleados',
    'movimientos_diarios_trabajadores'
  ];
  v_t text;
  v_n integer;
  v_conteos text := '';
BEGIN
  -- 1.1 La tabla de traza NO existe todavía.
  IF to_regclass('public.globalgap_correcciones') IS NOT NULL THEN
    RAISE EXCEPTION 'PRE 1.1: public.globalgap_correcciones ya existe. LA CAUSA MAS PROBABLE ES QUE ESTA MIGRACION YA SE APLICO -- comprobar contra el catalogo antes de reintentar. Este repo tiene historial de migraciones aplicadas sin fila en el ledger (067, 079, 108, 035-039, 041, 046, 093), asi que la ausencia de fila en el ledger NO prueba que no se aplico.';
  END IF;

  -- 1.2 La función del trigger tampoco existe todavía.
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_globalgap_registrar_correccion'
  ) THEN
    RAISE EXCEPTION 'PRE 1.2: public.fn_globalgap_registrar_correccion ya existe. Misma sospecha que 1.1.';
  END IF;

  -- 1.3 Las 9 tablas GlobalGAP existen; se captura su conteo de filas como
  --     linea base -- la postcondicion 4.7 compara contra ESTA captura, nunca
  --     contra un literal absoluto (leccion de la 103: estas tablas crecen con
  --     la captura diaria de campo).
  -- 1.4 Ninguna de las 9 tiene ya un trigger `trg_globalgap_correccion`
  --     (estado a medio aplicar).
  FOREACH v_t IN ARRAY v_tablas LOOP
    IF to_regclass('public.' || v_t) IS NULL THEN
      RAISE EXCEPTION 'PRE 1.3 (%): la tabla no existe en el catalogo. El mapa de la cadena GlobalGAP cambio; revisar antes de seguir.', v_t;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_t
        AND t.tgname = 'trg_globalgap_correccion'
        AND NOT t.tgisinternal
    ) THEN
      RAISE EXCEPTION 'PRE 1.4 (%): ya existe un trigger trg_globalgap_correccion sobre esta tabla. Estado a medio aplicar; revisar antes de reintentar.', v_t;
    END IF;

    EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_n;
    v_conteos := v_conteos || v_t || '=' || v_n || ';';
  END LOOP;

  -- 1.5 El enum de roles trae los dos valores que la política de lectura va a
  --     nombrar -- si el catálogo cambió de nombre, mejor abortar acá que
  --     escribir una política con un literal que no compila.
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'rol_usuario' AND e.enumlabel = 'Gerencia'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'rol_usuario' AND e.enumlabel = 'Administrador'
  ) THEN
    RAISE EXCEPTION 'PRE 1.5: el enum rol_usuario no trae Gerencia/Administrador como se esperaba.';
  END IF;

  PERFORM set_config('escociaos.mig113_conteos', v_conteos, false);
END $$;


-- =============================================================================
-- 2. Tabla `globalgap_correcciones` -- traza append-only, hermana de
--    `hato_correcciones` (084), para la cadena GlobalGAP fuera del hato.
-- =============================================================================
CREATE TABLE public.globalgap_correcciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla TEXT NOT NULL CHECK (tabla IN (
    'aplicaciones',
    'aplicaciones_productos',
    'aplicaciones_calculos',
    'aplicaciones_lotes',
    'aplicaciones_compras',
    'movimientos_diarios',
    'movimientos_diarios_productos',
    'movimientos_diarios_empleados',
    'movimientos_diarios_trabajadores'
  )),
  fila_id UUID NOT NULL,
  operacion TEXT NOT NULL CHECK (operacion IN ('update', 'delete')),
  datos_anteriores JSONB NOT NULL,
  -- NULL en 'delete' -- no hay valor "nuevo" cuando la fila desaparece.
  datos_nuevos JSONB,
  -- Desnormalizado a propósito, población parcial por construcción -- ver la
  -- sección "LA COLUMNA DENORMALIZADA" del encabezado. 5 de las 9 tablas la
  -- traen directo; en las otras 4 queda NULL (el dato sigue dentro de
  -- datos_anteriores/datos_nuevos, sólo no está indexado como columna propia).
  aplicacion_id UUID,
  -- Ninguna de las 9 tablas tiene hoy una columna `datos jsonb` con
  -- `motivo_correccion` (a diferencia de hato_eventos en la 084) -- queda
  -- SIEMPRE NULL por ahora. Se mantiene por paridad de esquema con
  -- hato_correcciones, lista para si alguna tabla la gana más adelante.
  motivo TEXT,
  corregido_por UUID REFERENCES auth.users(id),
  corregido_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_globalgap_correcciones_tabla_fila
  ON public.globalgap_correcciones (tabla, fila_id);

CREATE INDEX idx_globalgap_correcciones_aplicacion_fecha
  ON public.globalgap_correcciones (aplicacion_id, corregido_en DESC);

COMMENT ON TABLE public.globalgap_correcciones IS
  'Traza append-only de UPDATE/DELETE humanos sobre la cadena GlobalGAP fuera '
  'del modulo Hato Lechero (aplicaciones, aplicaciones_productos, '
  'aplicaciones_calculos, aplicaciones_lotes, aplicaciones_compras, '
  'movimientos_diarios, movimientos_diarios_productos, '
  'movimientos_diarios_empleados, movimientos_diarios_trabajadores). Hermana '
  'de hato_correcciones (migracion 084) -- mismo diseno table-agnostic via '
  'to_jsonb(OLD)/to_jsonb(NEW), tabla propia porque el CHECK de tabla de '
  'hato_correcciones no admite ampliarse sin un DROP. Escrita EXCLUSIVAMENTE '
  'por el trigger fn_globalgap_registrar_correccion() -- nunca por PostgREST '
  'directo (sin politica de INSERT/UPDATE/DELETE, y REVOKE explicito a '
  'anon/authenticated mas abajo). Parte B del hallazgo #19. Migracion 113.';


-- =============================================================================
-- 3. Trigger genérico `fn_globalgap_registrar_correccion()`.
--
-- Mismas 3 propiedades no negociables de fn_hato_registrar_correccion (084),
-- ver el encabezado de esta migración para el razonamiento completo de cada
-- una: (1) auth.uid() IS NULL => no traza, (2) SECURITY DEFINER con
-- search_path fijado y EXECUTE revocado, (3) tabla de traza sin política de
-- escritura para roles de navegador.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.fn_globalgap_registrar_correccion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aplicacion_id UUID;
BEGIN
  -- Regla dura, idéntica a la 084: sólo sesiones humanas de navegador dejan
  -- traza. auth.uid() es NULL para service_role (bot de Telegram, migraciones,
  -- el commit de chequeo del hato) -- limitación conocida, misma que
  -- 050/063/074 aceptaron para `created_by`.
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- No-op: un UPDATE que reenvía el mismo valor no es una corrección real.
  IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN
    RETURN NEW;
  END IF;

  -- `aplicacion_id`: sin SQL dinámico, `to_jsonb(...)->>'columna'` resuelve
  -- columnas que no existen en todas las tablas (ej. aplicaciones_productos no
  -- tiene aplicacion_id, sólo mezcla_id) sin romper la compilación de plpgsql
  -- -- misma técnica que la 084 usó para animal_id.
  IF TG_TABLE_NAME = 'aplicaciones' THEN
    v_aplicacion_id := (to_jsonb(OLD) ->> 'id')::uuid;
  ELSE
    v_aplicacion_id := (to_jsonb(OLD) ->> 'aplicacion_id')::uuid;
  END IF;

  INSERT INTO public.globalgap_correcciones (
    tabla, fila_id, operacion, datos_anteriores, datos_nuevos,
    aplicacion_id, corregido_por
  )
  VALUES (
    TG_TABLE_NAME,
    (to_jsonb(OLD) ->> 'id')::uuid,
    lower(TG_OP),
    to_jsonb(OLD),
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    v_aplicacion_id,
    auth.uid()
  );

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Ni `anon` ni `authenticated` tienen por qué invocarla como RPC -- es
-- exclusivamente una función de trigger (082 parte 2: un trigger dispara
-- igual sin este EXECUTE).
REVOKE EXECUTE ON FUNCTION public.fn_globalgap_registrar_correccion() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_globalgap_registrar_correccion() IS
  'Trigger AFTER UPDATE OR DELETE sobre las 9 tablas de la cadena GlobalGAP '
  '(aplicaciones y movimientos_diarios*, fuera del modulo Hato). Escribe una '
  'fila en globalgap_correcciones con el valor ANTERIOR completo. Hermana de '
  'fn_hato_registrar_correccion (migracion 084), mismo diseno y mismas 3 '
  'propiedades de seguridad. SECURITY DEFINER porque globalgap_correcciones '
  'deniega escritura a los roles del navegador; sin chequeo de rol interno '
  'porque no es invocable como RPC (EXECUTE revocado de '
  'PUBLIC/anon/authenticated). Ignora toda escritura con auth.uid() IS NULL '
  '(service_role). Migracion 113.';


-- =============================================================================
-- 4. Instalar el trigger en las 9 tablas. Sentencias explícitas -- ver
--    "FORMA: por qué 9 CREATE TRIGGER explícitos" en el encabezado.
-- =============================================================================
CREATE TRIGGER trg_globalgap_correccion
  AFTER UPDATE OR DELETE ON public.aplicaciones
  FOR EACH ROW EXECUTE FUNCTION public.fn_globalgap_registrar_correccion();

CREATE TRIGGER trg_globalgap_correccion
  AFTER UPDATE OR DELETE ON public.aplicaciones_productos
  FOR EACH ROW EXECUTE FUNCTION public.fn_globalgap_registrar_correccion();

CREATE TRIGGER trg_globalgap_correccion
  AFTER UPDATE OR DELETE ON public.aplicaciones_calculos
  FOR EACH ROW EXECUTE FUNCTION public.fn_globalgap_registrar_correccion();

CREATE TRIGGER trg_globalgap_correccion
  AFTER UPDATE OR DELETE ON public.aplicaciones_lotes
  FOR EACH ROW EXECUTE FUNCTION public.fn_globalgap_registrar_correccion();

CREATE TRIGGER trg_globalgap_correccion
  AFTER UPDATE OR DELETE ON public.aplicaciones_compras
  FOR EACH ROW EXECUTE FUNCTION public.fn_globalgap_registrar_correccion();

CREATE TRIGGER trg_globalgap_correccion
  AFTER UPDATE OR DELETE ON public.movimientos_diarios
  FOR EACH ROW EXECUTE FUNCTION public.fn_globalgap_registrar_correccion();

CREATE TRIGGER trg_globalgap_correccion
  AFTER UPDATE OR DELETE ON public.movimientos_diarios_productos
  FOR EACH ROW EXECUTE FUNCTION public.fn_globalgap_registrar_correccion();

CREATE TRIGGER trg_globalgap_correccion
  AFTER UPDATE OR DELETE ON public.movimientos_diarios_empleados
  FOR EACH ROW EXECUTE FUNCTION public.fn_globalgap_registrar_correccion();

CREATE TRIGGER trg_globalgap_correccion
  AFTER UPDATE OR DELETE ON public.movimientos_diarios_trabajadores
  FOR EACH ROW EXECUTE FUNCTION public.fn_globalgap_registrar_correccion();


-- =============================================================================
-- 5. RLS de `globalgap_correcciones` -- SELECT sólo Gerencia/Administrador,
--    deny-all para todo lo demás. Ver "RLS DE LECTURA" en el encabezado para
--    por qué esto es MÁS estricto que el patrón SELECT-authenticated de
--    hato_correcciones.
-- =============================================================================
ALTER TABLE public.globalgap_correcciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY globalgap_correcciones_select ON public.globalgap_correcciones
  FOR SELECT TO authenticated
  USING ((SELECT public.get_user_role()) = ANY (ARRAY['Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario]));

-- No decoración: `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON
-- TABLES TO anon, authenticated` de Supabase es lo que expuso el backup de la
-- 081 -- RLS y GRANT son capas distintas, se quieren las dos. `anon` pierde
-- TODO; `authenticated` pierde sólo la escritura (incluye REFERENCES/TRIGGER/
-- MAINTAIN -- lección de la revisión adversarial de la 111, que encontró que
-- una lista de REVOKE más corta dejaba esos tres privilegios reales de PG17
-- sin tocar) y CONSERVA SELECT, que la política de arriba acota por rol.
REVOKE ALL ON public.globalgap_correcciones FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON public.globalgap_correcciones FROM authenticated;

COMMENT ON POLICY globalgap_correcciones_select ON public.globalgap_correcciones IS
  'Lectura acotada a Gerencia/Administrador -- MAS estricta que el patron '
  'SELECT-authenticated de hato_correcciones (084), porque una de las 9 '
  'fuentes (aplicaciones) es ella misma Gerencia/Administrador-only para TODA '
  'operacion (verificado contra la migracion 093, lineas ~185-267: sus unicas '
  '2 politicas son ALL acotadas a esos roles, sin SELECT abierto). Una tabla '
  'de traza compartida no puede ser mas permisiva que la mas restrictiva de '
  'sus fuentes. Migracion 113.';


-- =============================================================================
-- 6. Postcondiciones.
-- =============================================================================
DO $$
DECLARE
  v_tablas text[] := ARRAY[
    'aplicaciones',
    'aplicaciones_productos',
    'aplicaciones_calculos',
    'aplicaciones_lotes',
    'aplicaciones_compras',
    'movimientos_diarios',
    'movimientos_diarios_productos',
    'movimientos_diarios_empleados',
    'movimientos_diarios_trabajadores'
  ];
  v_t text;
  v_conteos text;
  v_antes integer;
  v_ahora integer;
  v_rls boolean;
  v_politicas integer;
  v_secdef boolean;
  v_search_path_ok boolean;
  v_triggers integer;
  v_grants_indebidos integer;
  v_select_ok boolean;
  v_check_def text;
  v_select_acotado boolean;
BEGIN
  v_conteos := nullif(current_setting('escociaos.mig113_conteos', true), '');
  IF v_conteos IS NULL THEN
    RAISE WARNING 'POST: no se pudo leer la linea base de conteos (la seccion 1 corrio en otra sesion). La comprobacion de "cero filas tocadas" NO se ejecuto.';
  END IF;

  -- 4.1 La tabla existe.
  IF to_regclass('public.globalgap_correcciones') IS NULL THEN
    RAISE EXCEPTION 'POST 4.1: public.globalgap_correcciones no existe.';
  END IF;

  -- 4.2 RLS habilitada.
  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'globalgap_correcciones';
  IF NOT v_rls THEN
    RAISE EXCEPTION 'POST 4.2: RLS no quedo habilitada en globalgap_correcciones.';
  END IF;

  -- 4.3 Exactamente 1 política, de SELECT, acotada a Gerencia/Administrador
  --     via get_user_role.
  SELECT count(*) INTO v_politicas
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'globalgap_correcciones';
  IF v_politicas <> 1 THEN
    RAISE EXCEPTION 'POST 4.3: se esperaba exactamente 1 politica sobre globalgap_correcciones, hay %.', v_politicas;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relname = 'globalgap_correcciones'
       AND p.polcmd = 'r'
       AND pg_get_expr(p.polqual, p.polrelid) LIKE '%get_user_role%'
       AND pg_get_expr(p.polqual, p.polrelid) LIKE '%Gerencia%'
       AND pg_get_expr(p.polqual, p.polrelid) LIKE '%Administrador%'
  ) INTO v_select_acotado;
  IF NOT v_select_acotado THEN
    RAISE EXCEPTION 'POST 4.3b: la politica SELECT no quedo acotada a Gerencia/Administrador via get_user_role.';
  END IF;

  -- 4.4 `anon` sin ningún privilegio; `authenticated` sin escritura pero con
  --     SELECT.
  SELECT count(*) INTO v_grants_indebidos
    FROM (VALUES ('anon','SELECT'), ('anon','INSERT'), ('anon','UPDATE'), ('anon','DELETE'),
                  ('anon','TRUNCATE'), ('anon','REFERENCES'), ('anon','TRIGGER'), ('anon','MAINTAIN'),
                  ('authenticated','INSERT'), ('authenticated','UPDATE'), ('authenticated','DELETE'),
                  ('authenticated','TRUNCATE'), ('authenticated','REFERENCES'), ('authenticated','TRIGGER'),
                  ('authenticated','MAINTAIN')
         ) AS g(rol, priv)
   WHERE has_table_privilege(g.rol, 'public.globalgap_correcciones', g.priv);
  IF v_grants_indebidos <> 0 THEN
    RAISE EXCEPTION 'POST 4.4: quedaron % privilegio(s) indebidos sobre globalgap_correcciones.', v_grants_indebidos;
  END IF;

  SELECT has_table_privilege('authenticated', 'public.globalgap_correcciones', 'SELECT') INTO v_select_ok;
  IF NOT v_select_ok THEN
    RAISE EXCEPTION 'POST 4.4b: authenticated perdio el GRANT de SELECT -- la politica de lectura quedaria inservible.';
  END IF;

  -- 4.5 La función es SECURITY DEFINER, search_path pinneado (public,
  --     pg_temp, en ese orden), y sin EXECUTE para PUBLIC/anon/authenticated.
  SELECT p.prosecdef,
         EXISTS (
           SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
            WHERE cfg ILIKE 'search_path=%public%' AND cfg ILIKE '%pg_temp%'
         )
    INTO v_secdef, v_search_path_ok
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_globalgap_registrar_correccion';
  IF NOT v_secdef THEN
    RAISE EXCEPTION 'POST 4.5: fn_globalgap_registrar_correccion no quedo SECURITY DEFINER.';
  END IF;
  IF NOT v_search_path_ok THEN
    RAISE EXCEPTION 'POST 4.5b: fn_globalgap_registrar_correccion no tiene search_path=public, pg_temp fijado.';
  END IF;

  IF has_function_privilege('anon', 'public.fn_globalgap_registrar_correccion()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.fn_globalgap_registrar_correccion()', 'EXECUTE') THEN
    RAISE EXCEPTION 'POST 4.5c: anon/authenticated conservan EXECUTE sobre la funcion del trigger.';
  END IF;

  -- 4.6 Exactamente 9 triggers instalados, uno por tabla, apuntando a la
  --     función.
  SELECT count(*) INTO v_triggers
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'fn_globalgap_registrar_correccion'
     AND NOT t.tgisinternal;
  IF v_triggers <> 9 THEN
    RAISE EXCEPTION 'POST 4.6: se esperaban 9 triggers sobre fn_globalgap_registrar_correccion, hay %.', v_triggers;
  END IF;

  -- 4.7 Cero filas tocadas en las 9 tablas fuente, contra la línea base
  --     capturada en la sección 1.
  IF v_conteos IS NOT NULL THEN
    FOREACH v_t IN ARRAY v_tablas LOOP
      v_antes := split_part(split_part(v_conteos, v_t || '=', 2), ';', 1)::integer;
      EXECUTE format('SELECT count(*) FROM public.%I', v_t) INTO v_ahora;
      IF v_ahora <> v_antes THEN
        RAISE EXCEPTION 'POST 4.7 (%): el conteo de filas cambio de % a %. Esta migracion es aditiva -- no deberia tocar datos.', v_t, v_antes, v_ahora;
      END IF;
    END LOOP;
  END IF;

  -- 4.8 El CHECK de `tabla` nombra las 9, ni una menos ni una de más.
  SELECT pg_get_constraintdef(con.oid) INTO v_check_def
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'globalgap_correcciones' AND con.contype = 'c'
     AND pg_get_constraintdef(con.oid) LIKE '%tabla%';
  IF v_check_def IS NULL THEN
    RAISE EXCEPTION 'POST 4.8: no se encontro el CHECK de la columna tabla.';
  END IF;
  FOREACH v_t IN ARRAY v_tablas LOOP
    IF v_check_def NOT LIKE '%''' || v_t || '''%' THEN
      RAISE EXCEPTION 'POST 4.8 (%): el CHECK de tabla no nombra esta tabla. Definicion actual: %', v_t, v_check_def;
    END IF;
  END LOOP;

  RAISE NOTICE '113 OK: globalgap_correcciones creada (RLS on, 1 politica SELECT Gerencia/Administrador, 0 grants de escritura para anon/authenticated), 9 triggers instalados sobre fn_globalgap_registrar_correccion (SECURITY DEFINER, search_path fijado, EXECUTE revocado), 0 filas tocadas en las 9 tablas fuente.';
END $$;


-- =============================================================================
-- ROLLBACK (ejecutable, no destruye datos de las 9 tablas fuente -- sólo
-- pierde la traza acumulada en globalgap_correcciones hasta ese momento;
-- pensarlo dos veces si ya hay correcciones registradas):
--
--   DROP TRIGGER IF EXISTS trg_globalgap_correccion ON public.aplicaciones;
--   DROP TRIGGER IF EXISTS trg_globalgap_correccion ON public.aplicaciones_productos;
--   DROP TRIGGER IF EXISTS trg_globalgap_correccion ON public.aplicaciones_calculos;
--   DROP TRIGGER IF EXISTS trg_globalgap_correccion ON public.aplicaciones_lotes;
--   DROP TRIGGER IF EXISTS trg_globalgap_correccion ON public.aplicaciones_compras;
--   DROP TRIGGER IF EXISTS trg_globalgap_correccion ON public.movimientos_diarios;
--   DROP TRIGGER IF EXISTS trg_globalgap_correccion ON public.movimientos_diarios_productos;
--   DROP TRIGGER IF EXISTS trg_globalgap_correccion ON public.movimientos_diarios_empleados;
--   DROP TRIGGER IF EXISTS trg_globalgap_correccion ON public.movimientos_diarios_trabajadores;
--
--   DROP FUNCTION IF EXISTS public.fn_globalgap_registrar_correccion();
--   DROP TABLE IF EXISTS public.globalgap_correcciones;
-- =============================================================================
