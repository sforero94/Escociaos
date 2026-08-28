-- Migración 124: rotula la única fila de `verificaciones_inventario` como lo
-- que fue -- una exploración del módulo, nunca una ronda real -- y retira por
-- estructura (no por política) la capacidad de volver a escribir en las dos
-- tablas viejas del módulo de Verificaciones.
--
-- Fase 0 -- Higiene de docs/plan_verificacion_inventario.md (D-1/CA-25) y
-- docs/brief_tecnico_verificacion_inventario.md (§10, §13 fila "0 · Higiene").
-- El rediseño completo (tablas `rondas_*`, RPC, pipeline de voz por Telegram)
-- es de una fase posterior y esta migración NO lo toca.
--
-- NO APLICAR DESDE ESTE AGENTE. Este archivo queda escrito y correcto para
-- que el dueño lo revise y lo aplique junto con el resto de la Fase 0.
--
-- Numerada 124: el máximo de `src/sql/migrations/` es 123
-- (`123_select_contratistas_por_rol.sql`, todavía sin aplicar según su propia
-- cabecera). Confirmar contra `supabase_migrations.schema_migrations` antes
-- de aplicar -- el CLAUDE.md raíz documenta migraciones que corrieron sin
-- archivo (067/079/108) y archivos que están aplicados sin fila en el ledger
-- (035-039/041/046/093/109/123..): la ausencia de fila NO prueba que 124
-- siga libre, hay que mirar el catálogo vivo.
--
-- ---------------------------------------------------------------------------
-- QUÉ HACE Y QUÉ NO HACE
-- ---------------------------------------------------------------------------
-- `verificaciones_inventario` tiene UNA sola fila en toda su historia
-- (id = 4a595f8c-e114-44df-a80c-1856a2315609, abierta 2026-07-30), con 223
-- renglones en `verificaciones_detalle` y CERO contados -- nadie llegó a usar
-- el módulo, fue una exploración de un agente. Ponerle `estado = 'Rechazada'`
-- a secas sería peor que no tocarla: se leería como "una ronda real que
-- Gerencia rechazó", que es exactamente lo que D-1 quiere impedir. Por eso
-- son TRES marcas, ninguna destructiva:
--
--   1. `estado = 'Rechazada'` -- el único valor del enum que la saca de los
--      estados "viva"/"en curso" sin fingir que se completó.
--   2. `motivo_rechazo` -- dice en texto llano que fue una prueba, cuándo, y
--      cuántos renglones NO se contaron. Es lo que un humano lee primero.
--   3. `observaciones_generales` -- se le antepone el prefijo `[PRUEBA]` en
--      vez de sobrescribirla, por si algo se había anotado ahí.
--
-- NO se borra la fila. NO se tocan sus 223 renglones de `verificaciones_detalle`
-- -- ni su `cantidad_teorica`, ni `contado`, ni `diferencia`, nada. El precedente
-- explícito son las migraciones "archivo de registro, no aplicar" (067/079/108):
-- lo que protege al próximo lector es el rótulo, nunca la desaparición.
--
-- Fuera de alcance a propósito, y de una migración posterior (§10 D-T11 del
-- brief técnico, no antes de la Fase 6 del plan):
--   * Borrar `ConteoFisico.tsx` / `NuevaVerificacion.tsx` -- siguen existiendo
--     hasta que el rediseño las reemplace.
--   * `DROP FUNCTION aplicar_ajustes_verificacion(integer, text)` -- código
--     muerto (firma rota, cero call sites), pero retirarla es la migración
--     que además crea su reemplazo (`fn_ronda_aplicar_ajuste`), no ésta.
--   * `COMMENT ON VIEW vista_resumen_verificaciones` -- la vista se queda VIVA
--     (agrega las dos tablas que esta migración congela, y con la fila ya
--     rotulada no queda huérfana ni miente). Comentarla es parte del mismo
--     retiro posterior que borra las pantallas, no de esta higiene puntual.
--
-- ---------------------------------------------------------------------------
-- EL RETIRO ESTRUCTURAL: POR QUÉ UN REVOKE Y NO SOLO EL RÓTULO
-- ---------------------------------------------------------------------------
-- La migración 104 (2026-08-21) dejó INSERT/UPDATE/DELETE con predicado de
-- rol (Administrador, más Gerencia/Verificador por sus políticas `ALL`) sobre
-- estas dos tablas -- correcto para el módulo que existía entonces. Ese
-- estado por sí solo NO impide que alguien (Administrador, o el propio
-- `NuevaVerificacion.tsx`/`ConteoFisico.tsx`, que esta migración no toca ni
-- borra) vuelva a crear o tocar filas mañana.
--
-- Lección de la migración 081, aplicada acá al revés: un GRANT ausente le
-- gana a cualquier política. Por eso, además del rótulo, se revoca a nivel de
-- GRANT -- no de policy -- la capacidad de escribir:
--
--   REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON verificaciones_inventario,
--     verificaciones_detalle FROM authenticated, anon;
--
-- Consecuencia real y deliberada, que hay que decir en voz alta: a partir de
-- esta migración, `NuevaVerificacion.tsx` ("Nueva Verificación") y
-- `ConteoFisico.tsx` (grabar `cantidad_fisica`) van a fallar con
-- "permission denied" la primera vez que alguien los use -- el `GRANT` que
-- necesitan para escribir ya no existe, sin importar su rol ni la RLS. Es
-- exactamente lo que pide D-T1 del brief técnico ("las tablas viejas se
-- congelan y se rotulan, no se borran") y es la forma en que la Fase 0 deja
-- el módulo de Verificaciones en un estado consistente con "nadie debe volver
-- a escribir acá" mientras las pantallas de creación/conteo siguen existiendo
-- sin uso hasta que una fase posterior las borre (D-T11, Fase 6). No hay hoy
-- ningún usuario activo del flujo (D-1: cero rondas reales en toda la
-- historia), así que el costo de este corte es teórico, no operativo.
--
-- `anon` ya no tenía SELECT/INSERT/UPDATE/DELETE desde la 104 (`REVOKE ALL
-- ... FROM anon`); incluirlo acá en el REVOKE de INSERT/UPDATE/DELETE/TRUNCATE
-- es un no-op seguro (Postgres no falla al revocar un privilegio que el rol
-- ya no tiene) y deja el fichero explícito sin depender de memoria sobre qué
-- revocó cada migración anterior.
--
-- SELECT NO se toca. `vista_resumen_verificaciones` (security_invoker=true,
-- aplica la RLS/GRANT de quien consulta) sigue devolviendo la única fila --
-- ahora rotulada -- y `VerificacionesList.tsx` la sigue leyendo sin cambios.
-- `service_role` conserva acceso total por `rolbypassrls`; nada de esto
-- afecta a Esco ni al bot de Telegram, que no escriben en estas tablas.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ RAISE EXCEPTION Y NO RAISE WARNING EN LAS GUARDAS
-- ---------------------------------------------------------------------------
-- A diferencia de la 120/123 (barridos amplios de política donde negarse a
-- correr deja abierto un agujero de seguridad), ésta es una migración de
-- corrección de UN dato puntual y ya identificado. Si el estado en vivo no
-- coincide exactamente con lo documentado (otra fila, otro id, ya rotulada,
-- conteos distintos), lo correcto es abortar y mirar a mano -- no adivinar
-- sobre cuál fila escribir "REGISTRO DE PRUEBA". Precedente: 080/081/099.
--
-- Esta sesión no tuvo conector de Supabase para verificar en vivo antes de
-- escribir el fichero (a diferencia de 120/123): los hechos citados (id,
-- estado, 223 renglones, 0 contados) vienen documentados en el CLAUDE.md raíz
-- (migración 104, verificado 2026-08-20/21) y en el brief de producto/técnico
-- (verificado 2026-08-27/28). Las guardas de abajo hacen que, si la realidad
-- divergió desde entonces, la migración aborte sin tocar nada en vez de
-- confiar ciegamente en el documento -- exactamente la advertencia que el
-- propio CLAUDE.md hace sobre no verificar contra la documentación.
--
-- FILAS ESCRITAS: 1 (el UPDATE de la cabecera). CERO renglones de
-- `verificaciones_detalle` tocados -- la post-condición 4.3 lo prueba.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_id CONSTANT uuid := '4a595f8c-e114-44df-a80c-1856a2315609';
  v_total_verificaciones integer;
  v_estado public.estado_verificacion;
  v_motivo_previo text;
  v_total_detalle integer;
  v_contados integer;
  v_policies_inv integer;
  v_policies_det integer;
BEGIN
  -- 0.1 Debe existir EXACTAMENTE una fila en `verificaciones_inventario`, y
  --     tiene que ser la que este archivo documenta. Si hay más de una, algo
  --     cambió desde que se escribió esta migración y hay que mirar a mano
  --     antes de rotular nada.
  SELECT count(*) INTO v_total_verificaciones FROM public.verificaciones_inventario;
  IF v_total_verificaciones <> 1 THEN
    RAISE EXCEPTION '124 ABORTADA: se esperaba exactamente 1 fila en verificaciones_inventario (la exploración del 2026-07-30); hay %. Esta migración solo sabe rotular UNA fila puntual -- revisar a mano.', v_total_verificaciones;
  END IF;

  SELECT count(*) INTO v_total_verificaciones
    FROM public.verificaciones_inventario WHERE id = v_id;
  IF v_total_verificaciones <> 1 THEN
    RAISE EXCEPTION '124 ABORTADA: la fila de verificaciones_inventario no tiene el id documentado (%). No se encontró -- puede que el id real haya cambiado; revisar antes de escribir un rótulo sobre la fila equivocada.', v_id;
  END IF;

  -- 0.2 Idempotencia explícita, patrón 104: si ya está rotulada, NO se
  --     "arregla" en silencio -- se aborta, porque una migración aplicada dos
  --     veces sobre datos reales no es el comportamiento que se quiere.
  SELECT estado, motivo_rechazo INTO v_estado, v_motivo_previo
    FROM public.verificaciones_inventario WHERE id = v_id;

  IF v_estado = 'Rechazada'::public.estado_verificacion
     AND v_motivo_previo LIKE 'REGISTRO DE PRUEBA%' THEN
    RAISE EXCEPTION '124 ABORTADA: la fila % ya está rotulada como REGISTRO DE PRUEBA (estado=%, motivo_rechazo=%). Esta migración no es idempotente a propósito -- no se vuelve a aplicar sobre datos ya rotulados.', v_id, v_estado, v_motivo_previo;
  END IF;

  IF v_estado <> 'En proceso'::public.estado_verificacion THEN
    RAISE EXCEPTION '124 ABORTADA: se esperaba estado = En proceso (el estado documentado desde que se abandonó el 2026-07-30); la fila % tiene estado = %. Alguien la tocó por otra vía -- revisar antes de rotular.', v_id, v_estado;
  END IF;

  -- 0.3 Los 223 renglones y los 0 contados, tal como los documenta el
  --     CLAUDE.md raíz (migración 104) y el brief de producto (CA-25).
  SELECT count(*), count(*) FILTER (WHERE contado IS TRUE)
    INTO v_total_detalle, v_contados
    FROM public.verificaciones_detalle WHERE verificacion_id = v_id;

  IF v_total_detalle <> 223 THEN
    RAISE EXCEPTION '124 ABORTADA: se esperaban 223 renglones en verificaciones_detalle para la verificacion %; hay %. El dato documentado no coincide con el estado en vivo -- revisar antes de continuar.', v_id, v_total_detalle;
  END IF;

  IF v_contados <> 0 THEN
    RAISE EXCEPTION '124 ABORTADA: se esperaban 0 renglones contados; hay %. Si alguien empezó a contar de verdad, esta fila puede ya no ser "solo una exploración" y el rótulo de esta migración dejaría de ser honesto.', v_contados;
  END IF;

  -- 0.4 Sanity check de RLS: el estado que dejó la 104 (6 políticas por
  --     tabla) sigue en pie. No es lo que esta migración endurece -- es la
  --     base sobre la que el REVOKE de abajo se apoya -- pero si drift, hay
  --     que mirar antes de asumir que el REVOKE alcanza por sí solo.
  SELECT count(*) INTO v_policies_inv
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'verificaciones_inventario';
  SELECT count(*) INTO v_policies_det
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'verificaciones_detalle';

  IF v_policies_inv <> 6 OR v_policies_det <> 6 THEN
    RAISE WARNING '0.4: se esperaban 6 políticas por tabla (estado dejado por la 104); verificaciones_inventario=%, verificaciones_detalle=%. No es motivo para abortar -- el REVOKE de esta migración corta el acceso de escritura por GRANT, no por política -- pero conviene revisar qué cambió.', v_policies_inv, v_policies_det;
  END IF;

  -- Línea base para las post-condiciones de "cero renglones de detalle
  -- tocados" y "cero filas nuevas/borradas en cualquiera de las dos tablas".
  PERFORM set_config('escociaos.mig124_total_inv', v_total_verificaciones::text, false);
  PERFORM set_config('escociaos.mig124_total_det', v_total_detalle::text, false);
END $$;

-- ---------------------------------------------------------------------------
-- 1. El rótulo -- tres marcas, ninguna destructiva. UN solo UPDATE, una sola
--    fila (el WHERE por id es la única guarda real de la sentencia; las
--    guardas de arriba ya probaron que hay exactamente una fila con ese id).
-- ---------------------------------------------------------------------------
UPDATE public.verificaciones_inventario
   SET estado = 'Rechazada'::public.estado_verificacion,
       motivo_rechazo = 'REGISTRO DE PRUEBA — no fue una ronda real. Creada por una exploración '
                         'el 2026-07-30, 0 de 223 renglones contados. Ver '
                         'docs/plan_verificacion_inventario.md D-1/CA-25 y '
                         'docs/brief_tecnico_verificacion_inventario.md §10.',
       observaciones_generales = '[PRUEBA] ' || COALESCE(observaciones_generales, '')
 WHERE id = '4a595f8c-e114-44df-a80c-1856a2315609';

-- ---------------------------------------------------------------------------
-- 2. Comentarios en el catálogo -- para que la próxima persona no "arregle"
--    el retiro ni intente reactivar la escritura pensando que fue un olvido.
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.verificaciones_inventario IS
  'RETIRADA 2026-08. Reemplazada por el rediseño de docs/plan_verificacion_inventario.md '
  '("ronda de inventario", decisión 9.9; tablas rondas_* de una fase posterior). Conserva UNA '
  'fila, id 4a595f8c-e114-44df-a80c-1856a2315609, que es un registro de prueba (migración 124), '
  'no una ronda real. Sólo lectura desde authenticated/anon -- INSERT/UPDATE/DELETE/TRUNCATE '
  'revocados por la migración 124; no reponerlos.';

COMMENT ON TABLE public.verificaciones_detalle IS
  'RETIRADA 2026-08, junto con verificaciones_inventario (ver su comentario). Conserva los 223 '
  'renglones de la única verificación de prueba, sin tocar (0 contados). Sólo lectura desde '
  'authenticated/anon -- INSERT/UPDATE/DELETE/TRUNCATE revocados por la migración 124; no '
  'reponerlos.';

-- ---------------------------------------------------------------------------
-- 3. El retiro estructural: ningún GRANT de escritura sobrevive, sin importar
--    la política. Lección de la 081 aplicada al revés (acá se quita, no se
--    repone). SELECT no se toca.
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.verificaciones_inventario, public.verificaciones_detalle
  FROM authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. Post-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_id CONSTANT uuid := '4a595f8c-e114-44df-a80c-1856a2315609';
  v_estado public.estado_verificacion;
  v_motivo text;
  v_obs text;
  v_total_det_ahora integer;
  v_contados_ahora integer;
  v_total_inv_antes text;
  v_total_det_antes text;
  v_total_inv_ahora integer;
  t text;
BEGIN
  -- 4.1 La fila quedó rotulada con las tres marcas.
  SELECT estado, motivo_rechazo, observaciones_generales
    INTO v_estado, v_motivo, v_obs
    FROM public.verificaciones_inventario WHERE id = v_id;

  IF v_estado IS DISTINCT FROM 'Rechazada'::public.estado_verificacion THEN
    RAISE EXCEPTION '124 ABORTADA: post-condición -- el estado no quedó en Rechazada (%).', v_estado;
  END IF;
  IF v_motivo IS NULL OR v_motivo NOT LIKE 'REGISTRO DE PRUEBA%' THEN
    RAISE EXCEPTION '124 ABORTADA: post-condición -- motivo_rechazo no quedó marcado como prueba: %', coalesce(v_motivo, '<nulo>');
  END IF;
  IF v_obs IS NULL OR v_obs NOT LIKE '[PRUEBA]%' THEN
    RAISE EXCEPTION '124 ABORTADA: post-condición -- observaciones_generales no quedó prefijada con [PRUEBA]: %', coalesce(v_obs, '<nulo>');
  END IF;

  -- 4.2 Sigue habiendo exactamente 1 fila en verificaciones_inventario (no se
  --     insertó ni se borró nada).
  v_total_inv_antes := nullif(current_setting('escociaos.mig124_total_inv', true), '');
  SELECT count(*) INTO v_total_inv_ahora FROM public.verificaciones_inventario;
  IF v_total_inv_antes IS NULL THEN
    RAISE WARNING 'POST 4.2: no se pudo leer la línea base (la sección 0 corrió en otra sesión); la comprobación de "ninguna fila nueva/borrada" no se ejecutó.';
  ELSIF v_total_inv_ahora <> v_total_inv_antes::integer THEN
    RAISE EXCEPTION '124 ABORTADA: verificaciones_inventario pasó de % a % filas. Un UPDATE por id no puede hacer eso.', v_total_inv_antes, v_total_inv_ahora;
  END IF;

  -- 4.3 CERO renglones de verificaciones_detalle tocados: mismo conteo total
  --     y mismo conteo de contados que antes del UPDATE.
  v_total_det_antes := nullif(current_setting('escociaos.mig124_total_det', true), '');
  SELECT count(*), count(*) FILTER (WHERE contado IS TRUE)
    INTO v_total_det_ahora, v_contados_ahora
    FROM public.verificaciones_detalle WHERE verificacion_id = v_id;

  IF v_total_det_antes IS NULL THEN
    RAISE WARNING 'POST 4.3: no se pudo leer la línea base de renglones; la comprobación de "0 renglones tocados" no se ejecutó.';
  ELSE
    IF v_total_det_ahora <> v_total_det_antes::integer THEN
      RAISE EXCEPTION '124 ABORTADA: verificaciones_detalle pasó de % a % renglones para la verificacion %. Esta migración no debía tocar renglones.', v_total_det_antes, v_total_det_ahora, v_id;
    END IF;
    IF v_contados_ahora <> 0 THEN
      RAISE EXCEPTION '124 ABORTADA: verificaciones_detalle tiene % renglones marcados contado=true tras la migración; se esperaban 0. Esta migración no debía tocar `contado`.', v_contados_ahora;
    END IF;
  END IF;

  -- 4.4 `authenticated` y `anon` perdieron INSERT/UPDATE/DELETE/TRUNCATE en
  --     las dos tablas. Es la comprobación que sostiene "nadie puede volver a
  --     escribir acá", más allá de cualquier política.
  FOREACH t IN ARRAY ARRAY['verificaciones_inventario', 'verificaciones_detalle'] LOOP
    IF has_table_privilege('authenticated', 'public.' || t, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || t, 'DELETE')
       OR has_table_privilege('authenticated', 'public.' || t, 'TRUNCATE') THEN
      RAISE EXCEPTION '124 ABORTADA: `authenticated` conserva algún privilegio de escritura sobre public.%. El retiro estructural no se completó.', t;
    END IF;

    IF has_table_privilege('anon', 'public.' || t, 'INSERT')
       OR has_table_privilege('anon', 'public.' || t, 'UPDATE')
       OR has_table_privilege('anon', 'public.' || t, 'DELETE')
       OR has_table_privilege('anon', 'public.' || t, 'TRUNCATE') THEN
      RAISE EXCEPTION '124 ABORTADA: `anon` conserva algún privilegio de escritura sobre public.%.', t;
    END IF;

    -- 4.5 SELECT para `authenticated` NO se tocó -- sin esto la vista de
    --     resumen y `VerificacionesList.tsx` quedarían ciegas.
    IF NOT has_table_privilege('authenticated', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION '124 ABORTADA: `authenticated` perdió SELECT sobre public.%. Esta migración no debía tocar la lectura.', t;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable). Devuelve el GRANT de escritura y el rótulo al estado
-- previo EXACTO solo si se conoce el `motivo_rechazo`/`observaciones_generales`
-- de antes -- en este caso eran NULL (estado 'En proceso', recién creada). Si
-- alguien corrió esto sobre una fila con observaciones propias, ese texto se
-- perdió detrás del prefijo [PRUEBA] y el rollback NO lo reconstruye solo:
-- hay que restaurarlo a mano desde un respaldo si existiera.
--
--   UPDATE public.verificaciones_inventario
--      SET estado = 'En proceso',
--          motivo_rechazo = NULL,
--          observaciones_generales = NULL
--    WHERE id = '4a595f8c-e114-44df-a80c-1856a2315609';
--
--   COMMENT ON TABLE public.verificaciones_inventario IS
--     'Cabecera de la verificacion fisica de inventario. RLS endurecida por la '
--     'migracion 104 (hallazgo ESCO-18): lectura para `authenticated`, escritura '
--     'para Administrador + Gerencia + Verificador. Antes tenia 3 policies TO PUBLIC '
--     'con predicado `true`, o sea lectura y escritura sin autenticar con la llave '
--     '`anon` publicada. `anon` no tiene GRANT sobre esta tabla: no reponerlos.';
--
--   COMMENT ON TABLE public.verificaciones_detalle IS
--     'Renglon por producto de una verificacion fisica. RLS endurecida por la '
--     'migracion 104 (hallazgo ESCO-18), mismo criterio que la cabecera. El UPDATE '
--     'de `cantidad_fisica` era escribible por cualquiera en internet. `anon` no '
--     'tiene GRANT sobre esta tabla: no reponerlos.';
--
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE
--     ON public.verificaciones_inventario, public.verificaciones_detalle
--     TO authenticated;
--   -- El GRANT a `anon` NO se restaura: nunca debió existir (081/104).
-- ---------------------------------------------------------------------------
