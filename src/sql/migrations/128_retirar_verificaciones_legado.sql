-- Migración 128: retiro del código muerto restante del módulo viejo de
-- Verificaciones (D-T11, docs/brief_tecnico_verificacion_inventario.md §10).
--
-- Fase 6 -- Historial web de docs/plan_verificacion_inventario.md (Pieza B).
-- El alcance de esta migración se ACHICÓ respecto a lo que el brief técnico
-- (rev. 2) le asignaba originalmente: la migración 124 (ya aplicada, Fase 0)
-- se adelantó y ejecutó tres de las cinco cosas que este archivo iba a hacer
-- -- el rótulo D-1 de la fila de prueba, los `COMMENT ON TABLE` de
-- `verificaciones_inventario`/`verificaciones_detalle`, y el
-- `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ... FROM authenticated, anon`
-- sobre esas dos tablas. Ver la "Revisión 3" del brief técnico -- el propio
-- documento registra ese cambio de alcance y dice literalmente: "A la 128 le
-- quedan dos sentencias".
--
-- Lo que le queda a ESTA migración, y nada más:
--   1. `DROP FUNCTION aplicar_ajustes_verificacion(integer, text)` -- código
--      muerto: firma rota (`integer` contra una columna `uuid` real) y CERO
--      call sites en el repo (grep repetido en esta sesión sobre
--      `src/` y `supabase/`, el único resultado es el tipo generado en
--      `src/types/database.ts` y comentarios de migraciones -- ninguno es
--      código que la ejecute). Dejar una función muerta llamada "aplicar
--      ajustes de verificación" al lado de `fn_ronda_aplicar_ajuste`, que
--      SÍ aplica ajustes, es exactamente cómo alguien llama a la
--      equivocada -- razón original del brief técnico §10, sin cambios.
--   2. `COMMENT ON VIEW vista_resumen_verificaciones` -- se ROTULA, NO se
--      dropea. La vista sigue viva y con un consumidor real:
--      `VerificacionesList.tsx` (`src/components/inventory/VerificacionesList.tsx:60`),
--      que esta misma Fase 6 conserva a propósito como lectura histórica de
--      la fila de prueba (D-T11: "la vieja lista ... debería seguir siendo
--      consultable en algún lado por continuidad histórica"). Dropear la
--      vista rompería esa pantalla sin necesidad -- las dos tablas base
--      (`verificaciones_inventario`/`verificaciones_detalle`) tampoco se
--      borraron, así que la vista no queda huérfana.
--
-- QUÉ NO HACE ESTA MIGRACIÓN (a propósito, y por qué):
--   * No borra `verificaciones_inventario`/`verificaciones_detalle` -- ya
--     están congeladas y rotuladas por la 124 (CA-25: "no se borra ni se
--     reescribe" la fila de prueba).
--   * No crea `fn_ronda_aplicar_ajuste` ni ningún otro RPC `fn_ronda_*` --
--     eso es la migración de la Fase 2 (RPC), en curso en paralelo. Esta
--     migración sólo puede aplicarse DESPUÉS de que exista, porque si se
--     dropea `aplicar_ajustes_verificacion` sin que su reemplazo exista
--     todavía, el sistema queda sin NINGÚN camino (ni roto ni funcional)
--     para aplicar un ajuste -- ver la guarda 0.2 más abajo, que aborta si
--     `fn_ronda_aplicar_ajuste` no existe.
--   * No toca RLS ni GRANT de ninguna tabla -- eso ya lo cerró la 124.
--   * No borra pantallas ni rutas de React -- `ConteoFisico.tsx`,
--     `NuevaVerificacion.tsx` y `VerificacionesNav.tsx` se borran en el
--     mismo commit que esta migración, pero son archivos `.tsx`, sin
--     contraparte SQL. `App.tsx` deja de enrutar
--     `verificaciones/nueva`/`verificaciones/conteo/:id`/`verificaciones/:id`
--     (ya no quedaba ningún botón que llevara ahí) y agrega
--     `/inventario/rondas`(`/:id`) como la pantalla nueva de historial
--     (D-T10, C-3 del brief de producto).
--
-- ---------------------------------------------------------------------------
-- VERIFICACIÓN CONTRA EL CATÁLOGO -- LO QUE ESTA SESIÓN PUDO Y NO PUDO
-- COMPROBAR
-- ---------------------------------------------------------------------------
-- Esta sesión (Fase 6, frontend) NO tuvo un conector de Supabase de sólo
-- lectura disponible -- mismo hueco que tuvo la sesión que escribió la 125
-- (Fase 1). Lo que SÍ se comprobó, y contra qué:
--
--   * Cero call sites de `aplicar_ajustes_verificacion` en código real:
--     `grep -rn "aplicar_ajustes_verificacion" src/ supabase/` sólo
--     encuentra el tipo generado en `src/types/database.ts` (que el
--     `CLAUDE.md` raíz ya advierte que no prueba que algo esté vivo -- es un
--     espejo del catálogo, no un consumidor) y comentarios de las
--     migraciones 104/124/128 (ésta) explicando por qué se dropea.
--   * `vista_resumen_verificaciones` SÍ tiene un consumidor real:
--     `VerificacionesList.tsx:60` (`supabase.from('vista_resumen_verificaciones')`).
--     Confirma la decisión de §10 del brief técnico ("se deja viva").
--   * El máximo número de migración en `src/sql/migrations/` al escribir
--     este archivo es 129 (`129_reconstruir_precio_unitario.sql`, de la
--     Fase 0b -- saneamiento de precios, sesión paralela e independiente).
--     125–127 no tienen archivo en este árbol todavía (Fases 1/2/5 en
--     curso en paralelo, en otros worktrees). **128 es el primer hueco
--     libre** en la secuencia 125→129 -- coincide con lo que el brief
--     técnico rev. 3 documentaba, pero se confirmó con `ls` en esta sesión,
--     no se asumió del documento (el propio brief técnico advierte, dos
--     veces, que un número escrito en un documento no es autoritativo el
--     día que alguien crea el fichero).
--
-- Lo que esta sesión NO pudo comprobar contra el catálogo VIVO de
-- producción (sin conector): que `aplicar_ajustes_verificacion(integer,
-- text)` siga existiendo con esa firma exacta, y que `fn_ronda_aplicar_ajuste`
-- ya exista para cuando esto se aplique. Las guardas de la sección 0 son
-- estrictas por eso -- abortan en vez de asumir.
--
-- NO APLICAR DESDE ESTE AGENTE. Este archivo queda escrito y verificado
-- estructuralmente contra el repo (grep de call sites, `ls` de migraciones)
-- para que el dueño lo aplique cuando la Fase 2 (RPC) ya esté en producción
-- -- mismo protocolo que las migraciones 124/125.
--
-- Estilo de guardas: precondiciones (0.x) que abortan con RAISE EXCEPTION si
-- el catálogo no está como se documenta arriba, y postcondiciones (2.x) que
-- comprueban que la migración dejó exactamente lo que dice dejar. No
-- idempotente a propósito (precedente 124/125): si algo de esto ya se
-- aplicó, hay que mirar a mano, no re-aplicar en silencio.
--
-- ROLLBACK ejecutable comentado al pie (mismo patrón que 080/081/099/107/124).
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- 0. PRECONDICIONES
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- 0.1 `aplicar_ajustes_verificacion(integer, text)` debe existir todavía
  --     con esa firma exacta -- si ya no existe (alguien la dropeó por otra
  --     vía, o nunca existió con esos tipos), no hay nada que dropear acá y
  --     hay que revisar a mano antes de seguir.
  IF to_regprocedure('public.aplicar_ajustes_verificacion(integer, text)') IS NULL THEN
    RAISE EXCEPTION '128 ABORTADA: public.aplicar_ajustes_verificacion(integer, text) no existe con esa firma. Puede que ya se haya dropeado, o que la firma real sea otra -- revisar contra pg_proc antes de continuar.';
  END IF;

  -- 0.2 La razón de ser de esta guarda: dropear el código muerto ANTES de
  --     que exista su reemplazo real deja al sistema sin NINGÚN camino para
  --     aplicar un ajuste de ronda -- ni el roto (que nunca funcionó) ni el
  --     nuevo. `fn_ronda_aplicar_ajuste` es de la migración de la Fase 2
  --     (RPC, §6.2 del brief técnico), que corre en paralelo a esta sesión.
  IF to_regprocedure('public.fn_ronda_aplicar_ajuste(jsonb)') IS NULL THEN
    RAISE EXCEPTION '128 ABORTADA: public.fn_ronda_aplicar_ajuste(jsonb) todavía no existe. Esta migración depende de que la Fase 2 (RPC de rondas_*) ya esté aplicada -- no dropear el código muerto antes de que exista su reemplazo. Ver docs/brief_tecnico_verificacion_inventario.md §13, fila "6 · Historial web".';
  END IF;

  -- 0.3 `vista_resumen_verificaciones` debe existir para poder comentarla --
  --     si no existe, algo cambió desde que este archivo se escribió (no
  --     debería: la 124 la dejó viva a propósito) y hay que revisar a mano.
  IF to_regclass('public.vista_resumen_verificaciones') IS NULL THEN
    RAISE EXCEPTION '128 ABORTADA: public.vista_resumen_verificaciones no existe. La migración 124 la dejó viva deliberadamente (JOIN de verificaciones_inventario + verificaciones_detalle) -- si desapareció, VerificacionesList.tsx está rota y hay que investigar antes de continuar, no comentar una vista que no está.';
  END IF;

  -- 0.4 Idempotencia explícita (patrón 124/125): si la vista ya tiene el
  --     comentario de retiro, no se re-aplica en silencio.
  IF (
    SELECT obj_description('public.vista_resumen_verificaciones'::regclass, 'pg_class')
  ) LIKE 'RETIRADA junto con sus dos tablas base%' THEN
    RAISE EXCEPTION '128 ABORTADA: vista_resumen_verificaciones ya tiene el comentario de retiro puesto. Esta migración no es idempotente a propósito -- no se vuelve a aplicar sobre un catálogo ya migrado.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Las dos sentencias -- literal de §10 del brief técnico
-- ---------------------------------------------------------------------------

-- Código muerto: firma rota (`integer` contra una columna `uuid` real en
-- `verificaciones_detalle.id`) y cero call sites (verificado arriba).
DROP FUNCTION public.aplicar_ajustes_verificacion(integer, text);

-- La vista se queda VIVA -- agrega las dos tablas retiradas (rotuladas por
-- la 124), y `VerificacionesList.tsx` la sigue leyendo como lectura
-- histórica de la fila de prueba. Sólo se rotula, para que el próximo lector
-- sepa que es legado y no la "arregle" pensando que es un descuido.
COMMENT ON VIEW public.vista_resumen_verificaciones IS
  'RETIRADA junto con sus dos tablas base (verificaciones_inventario / '
  'verificaciones_detalle, migración 124). Lectura histórica solamente -- '
  'su único consumidor es VerificacionesList.tsx, conservado por '
  'continuidad histórica (D-T11). El módulo vigente es la ronda de '
  'inventario: rondas_inventario / rondas_excepciones (migración 125), '
  'con su historial web en /inventario/rondas.';

-- ---------------------------------------------------------------------------
-- 2. Postcondiciones
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_comentario TEXT;
BEGIN
  -- 2.1 La función quedó dropeada.
  IF to_regprocedure('public.aplicar_ajustes_verificacion(integer, text)') IS NOT NULL THEN
    RAISE EXCEPTION '128 ABORTADA (post): aplicar_ajustes_verificacion(integer, text) sigue existiendo -- el DROP no se completó.';
  END IF;

  -- 2.2 La vista sigue existiendo (no se dropeó por error) y quedó rotulada.
  IF to_regclass('public.vista_resumen_verificaciones') IS NULL THEN
    RAISE EXCEPTION '128 ABORTADA (post): vista_resumen_verificaciones desapareció. Esta migración NUNCA debía dropearla -- sólo comentarla.';
  END IF;

  v_comentario := obj_description('public.vista_resumen_verificaciones'::regclass, 'pg_class');
  IF v_comentario IS NULL OR v_comentario NOT LIKE 'RETIRADA junto con sus dos tablas base%' THEN
    RAISE EXCEPTION '128 ABORTADA (post): vista_resumen_verificaciones no quedó con el comentario de retiro esperado. Comentario actual: %', COALESCE(v_comentario, '<sin comentario>');
  END IF;

  -- 2.3 Las tablas base de la vista siguen intactas -- esta migración no
  --     tiene ninguna sentencia que las toque, esto es un chequeo de
  --     cordura de que nada las afectó por otra vía en la misma transacción.
  IF to_regclass('public.verificaciones_inventario') IS NULL OR to_regclass('public.verificaciones_detalle') IS NULL THEN
    RAISE EXCEPTION '128 ABORTADA (post): verificaciones_inventario/verificaciones_detalle desaparecieron. Esta migración no debía tocarlas.';
  END IF;

  RAISE NOTICE '128 OK: aplicar_ajustes_verificacion(integer, text) dropeada; vista_resumen_verificaciones rotulada y viva; sus dos tablas base intactas.';
END $$;

-- ===========================================================================
-- ROLLBACK (ejecutable). Restaura el comentario anterior de la vista (el que
-- dejó la migración 033, verificado contra ese archivo) y recrea la función
-- dropeada EXACTAMENTE como estaba -- rota a propósito, con la misma firma
-- inservible, porque el punto del rollback es volver al estado previo, no
-- "arreglarla" de paso. Si el cuerpo real difiere del de producción, restaurar
-- desde un respaldo (`pg_dump` de la función) en vez de este bloque.
-- ===========================================================================
--   COMMENT ON VIEW public.vista_resumen_verificaciones IS NULL;
--
--   CREATE OR REPLACE FUNCTION public.aplicar_ajustes_verificacion(
--     p_verificacion_id integer,
--     p_usuario text
--   ) RETURNS void
--   LANGUAGE plpgsql
--   AS $BODY$
--   BEGIN
--     -- Cuerpo original irrecuperable desde este archivo -- la función nunca
--     -- se pudo invocar (firma rota: `integer` contra `verificaciones_detalle.id`
--     -- que es `uuid`), así que no hay comportamiento real que preservar.
--     -- Restaurar desde un respaldo de `pg_proc`/`pg_dump` si de verdad hace
--     -- falta reponerla.
--     RAISE EXCEPTION 'aplicar_ajustes_verificacion: cuerpo original no recuperable desde este rollback.';
--   END;
--   $BODY$;
-- ===========================================================================
