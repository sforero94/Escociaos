-- =============================================================================
-- 107_normalizar_responsable_movimientos.sql
--
-- `movimientos_diarios.responsable` es texto libre (ver
-- `src/components/aplicaciones/CLAUDE.md`, sección "Datos que se capturan y no
-- se veían"): "no es la cuadrilla, y está sucio ('Felipe García' / 'Felipe
-- Garcia')". Esta migración limpia esa suciedad con la aprobación explícita
-- del dueño. La parte que evita que vuelva a ensuciarse -- reemplazar el
-- `<Input>` de texto libre por un picker sobre empleados+contratistas en
-- `DailyMovementForm.tsx` -- es un cambio de frontend, no de esta migración.
--
-- CAMBIO DE ALCANCE respecto a la primera versión de este archivo (misma
-- sesión, antes de aplicarse a producción): el encargo original dejaba 12
-- filas (Emiliano Garcia/García + las 3 variantes de "David Garcia (Libardo
-- operario dron)") sin tocar, por no tener a quién mapearlas. El dueño
-- revisó esos dos casos contra producción y decidió lo contrario para cada
-- uno -- ver §1 y §2 abajo. Ya NO quedan filas sin normalizar: las 154 se
-- tocan.
--
-- ALCANCE FINAL: de las 154 filas de `movimientos_diarios` con `responsable`
-- no vacío, repartidas en 19 grafías distintas, las 154 se normalizan a 6
-- nombres canónicos.
--
-- =============================================================================
-- §1 -- EMILIANO GARCIA se crea como empleado (no existía su ficha)
-- =============================================================================
--
-- Verificado por el dueño contra producción antes de este encargo: "Emiliano
-- Garcia" no está en `empleados` ni en `contratistas`, pero tiene 110 filas
-- en `fin_gastos` (cesantías, seguridad social, planillas de aportes,
-- bonificación) -- es personal de nómina desde 2023 al que simplemente nunca
-- se le creó la ficha en `empleados`. Esta migración la crea:
--
--   * `nombre = 'EMILIANO GARCIA'` (MAYÚSCULAS -- convención de la tabla;
--     nombre literal tomado del gasto "CESANTIAS 2024 EMILIANO GARCIA"). NO
--     se le inventa un segundo apellido -- a diferencia de los otros 4
--     canónicos de esta migración (p.ej. "DAVID JOVANY GARCIA MANCERA"), no
--     hay registro en ninguna parte del segundo apellido de Emiliano, y
--     fabricarlo sería inventar un dato de personal.
--   * `estado = 'Activo'` (le pagaron cesantías en feb-2026).
--   * `salario`, `prestaciones_sociales`, `auxilios_no_salariales`, `cargo`,
--     `horas_semanales` quedan **NULL** a propósito, y NO es un hueco
--     pendiente: el dueño confirmó que Emiliano SOLO SUPERVISA, nunca entra
--     a cuadrilla, así que estos campos de compensación/cargo de jornalero
--     no le aplican. Poner 0 sería peor que NULL -- diría "trabaja gratis",
--     que es falso. Que nadie los "complete" después con ceros pensando que
--     falta capturarlos: es la ausencia correcta del dato, no un olvido.
--   * Idempotente: el INSERT va condicionado a que no exista ya un empleado
--     con ese nombre.
--
-- =============================================================================
-- §2 -- Libardo: se limpia la anotación de texto, no se toca el movimiento
-- =============================================================================
--
-- Las 4 filas con "(Libardo operario dron)" pertenecen a la aplicación
-- "Fumigación mes de abril (Dron)". Libardo operó el dron como tercero. El
-- dueño ya verificó la cuadrilla real de esos 4 movimientos en
-- `movimientos_diarios_trabajadores`: son DAVID JOVANY GARCIA MANCERA y LUIS
-- FELIPE GARCIA HUERTAS únicamente -- Libardo NO aparece ahí, así que el
-- costo de mano de obra de esos movimientos ya es correcto y esta migración
-- no lo toca. Lo único que cambia es el texto libre de `responsable`: las 4
-- filas pasan a "DAVID JOVANY GARCIA MANCERA" (se une al grupo David que ya
-- existía). Las canecas/movimientos en sí NO se borran ni se alteran -- son
-- trabajo real.
--
-- =============================================================================
-- MAPEO COMPLETO (literal, no regex/fuzzy -- una regex que se equivoca acá le
-- cambia a alguien el nombre de quien hizo el trabajo, en silencio):
-- =============================================================================
--
--   Clara Ridriguez (1), Clara Rodriguez (11)
--     -> CLARA YANETH RODRIGUEZ RODRIGUEZ                              (12)
--   David  Garcia (1, doble espacio), David Garcia (37), David García (2),
--   David Garcia ( Libardo operario dron ) (1),
--   David Garcia (Libardo operario dron ) (1),
--   David Garcia (Libardo operario dron) (2)
--     -> DAVID JOVANY GARCIA MANCERA                                   (44)
--   Diego giraldo (2), Diego Giraldo (26), Diego Jiraldo (1)
--     -> DIEGO ARMANDO GIRALDO OCAMPO                                  (29)
--   Feipe Garcia (1), Felipe Garcia (54), Felipe García (2), Felpe Garcia (1)
--     -> LUIS FELIPE GARCIA HUERTAS                                    (58)
--   Jarrinson jula (1), Jarrinson Jula (2)
--     -> JARRINSON ALVARADO JULA                                        (3)
--   Emiliano Garcia (6), Emiliano García (2)
--     -> EMILIANO GARCIA                                                (8)
--                                                                 total 154
--
-- Los 19 conteos por grafía de arriba fueron reverificados por el
-- orquestador contra producción (con acceso de lectura a Supabase que este
-- agente no tiene) y calzan EXACTOS, incluidos los espaciados que solo se
-- distinguen por longitud: 'David  Garcia' (doble espacio, largo 13) vs
-- 'David Garcia' (largo 12), y las 3 variantes de Libardo (largos 38/37/36).
-- Aun así las guardas de abajo abortan la transacción completa si
-- producción no calza EXACTO al momento de aplicar -- verificar una vez no
-- exime de comprobar de nuevo en el momento de escribir; no se adivina ni se
-- sigue de largo.
--
-- Respaldo en el esquema `respaldos`, JAMÁS en `public` (081: un
-- `CREATE TABLE public.backup_*` hereda el `ALTER DEFAULT PRIVILEGES` de
-- Supabase y publica el respaldo a `anon` sin RLS). RLS habilitada y sin
-- políticas (deny-all), mismo patrón que backup_080/081/099.
--
-- IDEMPOTENTE: si ya no queda ninguna fila con alguna de las 19 grafías
-- sucias, los 6 nombres canónicos ya tienen sus totales exactos, el empleado
-- EMILIANO GARCIA ya existe y el respaldo existe, la migración emite RAISE
-- NOTICE y sale sin error. Si el estado es intermedio (no debería poder
-- pasar), aborta en vez de adivinar.
--
-- Corre completa de una sola vez (sin BEGIN/COMMIT explícitos, mismo patrón
-- que 075/076/077/080/081/082/098/099): un solo RAISE EXCEPTION en cualquier
-- punto deshace TODO, incluidos el respaldo y el empleado recién creados.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Esquema de respaldos (creado por 081; se asegura por si acaso, mismo
--    patrón que 095/099).
-- -----------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS respaldos;
REVOKE ALL ON SCHEMA respaldos FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA respaldos TO service_role;


DO $$
DECLARE
  v_total_no_vacio      integer;
  v_mismatch_sucios     integer;
  v_sucios_restantes    integer;
  v_canonico_mismatch   integer;
  v_backup_existe       boolean;
  v_empleado_existe     boolean;
  v_actualizadas        integer;
  v_distintos_final     integer;
BEGIN
  -- ===========================================================================
  -- Lista literal (§5.2 del criterio de 099: lista auditable línea por línea,
  -- nunca una expresión regular). `cantidad_esperada` es la línea base que el
  -- dueño aprobó -- las guardas comparan CADA grafía contra su propio
  -- número, no solo el total agregado.
  -- ===========================================================================

  CREATE TEMP TABLE mov_107_mapeo (
    valor_original     text PRIMARY KEY,
    nombre_canonico     text NOT NULL,
    cantidad_esperada   integer NOT NULL
  );

  INSERT INTO mov_107_mapeo (valor_original, nombre_canonico, cantidad_esperada) VALUES
    ('Clara Ridriguez',                        'CLARA YANETH RODRIGUEZ RODRIGUEZ',  1),
    ('Clara Rodriguez',                        'CLARA YANETH RODRIGUEZ RODRIGUEZ', 11),
    ('David  Garcia',                          'DAVID JOVANY GARCIA MANCERA',       1), -- doble espacio, literal
    ('David Garcia',                           'DAVID JOVANY GARCIA MANCERA',      37),
    ('David García',                           'DAVID JOVANY GARCIA MANCERA',       2),
    ('David Garcia ( Libardo operario dron )', 'DAVID JOVANY GARCIA MANCERA',       1), -- espacio tras "(" y antes de ")"
    ('David Garcia (Libardo operario dron )',  'DAVID JOVANY GARCIA MANCERA',       1), -- espacio solo antes de ")"
    ('David Garcia (Libardo operario dron)',   'DAVID JOVANY GARCIA MANCERA',       2), -- sin espacios extra
    ('Diego giraldo',                          'DIEGO ARMANDO GIRALDO OCAMPO',      2),
    ('Diego Giraldo',                          'DIEGO ARMANDO GIRALDO OCAMPO',     26),
    ('Diego Jiraldo',                          'DIEGO ARMANDO GIRALDO OCAMPO',      1),
    ('Feipe Garcia',                           'LUIS FELIPE GARCIA HUERTAS',        1),
    ('Felipe Garcia',                          'LUIS FELIPE GARCIA HUERTAS',       54),
    ('Felipe García',                          'LUIS FELIPE GARCIA HUERTAS',        2),
    ('Felpe Garcia',                           'LUIS FELIPE GARCIA HUERTAS',        1),
    ('Jarrinson jula',                         'JARRINSON ALVARADO JULA',           1),
    ('Jarrinson Jula',                         'JARRINSON ALVARADO JULA',           2),
    ('Emiliano Garcia',                        'EMILIANO GARCIA',                   6),
    ('Emiliano García',                        'EMILIANO GARCIA',                   2);

  CREATE TEMP TABLE mov_107_canonico_esperado (
    nombre_canonico     text PRIMARY KEY,
    cantidad_esperada    integer NOT NULL
  );

  INSERT INTO mov_107_canonico_esperado (nombre_canonico, cantidad_esperada) VALUES
    ('CLARA YANETH RODRIGUEZ RODRIGUEZ', 12),
    ('DAVID JOVANY GARCIA MANCERA',      44),
    ('DIEGO ARMANDO GIRALDO OCAMPO',     29),
    ('LUIS FELIPE GARCIA HUERTAS',       58),
    ('JARRINSON ALVARADO JULA',           3),
    ('EMILIANO GARCIA',                   8);

  -- ===========================================================================
  -- 1. Guardas previas -- cualquier falla aborta TODA la transacción.
  -- ===========================================================================

  -- 1.1 Invariante universal: el total de movimientos con responsable no
  --     vacío NO cambia con esta migración (solo se re-etiqueta texto, no se
  --     borra ni se inserta ninguna fila de `movimientos_diarios`). Vale
  --     antes Y después de correr esto.
  SELECT count(*) INTO v_total_no_vacio
    FROM movimientos_diarios
   WHERE responsable IS NOT NULL AND btrim(responsable) <> '';

  IF v_total_no_vacio <> 154 THEN
    RAISE EXCEPTION '107 ABORTADA: se esperaban 154 movimientos con responsable no vacío (línea base aprobada por el dueño); se encontraron %. La tabla cambió desde esa verificación -- revisar a mano antes de continuar.', v_total_no_vacio;
  END IF;

  SELECT count(*) INTO v_sucios_restantes
    FROM movimientos_diarios m
   WHERE EXISTS (SELECT 1 FROM mov_107_mapeo mp WHERE mp.valor_original = m.responsable);

  SELECT to_regclass('respaldos.backup_107_responsable_movimientos') IS NOT NULL
    INTO v_backup_existe;

  SELECT EXISTS (SELECT 1 FROM empleados WHERE nombre = 'EMILIANO GARCIA')
    INTO v_empleado_existe;

  -- 1.2 Idempotencia: si ya no queda ninguna fila con grafía sucia, el
  --     empleado ya existe y el respaldo existe, hay que confirmar que los 6
  --     canónicos ya tienen sus totales exactos antes de decir "ya corrió".
  IF v_sucios_restantes = 0 AND v_backup_existe AND v_empleado_existe THEN
    SELECT count(*) INTO v_canonico_mismatch
      FROM mov_107_canonico_esperado ce
     WHERE (SELECT count(*) FROM movimientos_diarios m WHERE m.responsable = ce.nombre_canonico)
           <> ce.cantidad_esperada;

    IF v_canonico_mismatch = 0 THEN
      RAISE NOTICE '107: ya corrió -- 0 filas con grafía sucia, los 6 nombres canónicos tienen sus totales esperados (12/44/29/58/3/8), empleado EMILIANO GARCIA presente, respaldo presente. Nada que hacer.';
      RETURN;
    ELSE
      RAISE EXCEPTION '107 ABORTADA: no quedan filas con grafía sucia, el empleado y el respaldo existen, pero % de los 6 nombres canónicos no tienen el total esperado. Estado intermedio inesperado -- revisar a mano, no reintentar a ciegas.', v_canonico_mismatch;
    END IF;
  END IF;

  IF v_backup_existe OR v_empleado_existe THEN
    RAISE EXCEPTION '107 ABORTADA: estado intermedio -- respaldo_existe=%, empleado_EMILIANO_GARCIA_existe=%, filas_con_grafia_sucia=% (¿una corrida anterior se cortó a la mitad?). Revisar a mano, no reintentar a ciegas.', v_backup_existe, v_empleado_existe, v_sucios_restantes;
  END IF;

  -- 1.3 Estado fresco: deben ser exactamente 154 filas con grafía sucia (las
  --     19 grafías cubren TODO el universo no vacío).
  IF v_sucios_restantes <> 154 THEN
    RAISE EXCEPTION '107 ABORTADA: se esperaban 154 filas con alguna de las 19 grafías a normalizar; se encontraron %.', v_sucios_restantes;
  END IF;

  -- 1.4 Cada una de las 19 grafías tiene, individualmente, el conteo exacto
  --     verificado -- no solo el agregado de 154.
  SELECT count(*) INTO v_mismatch_sucios
    FROM mov_107_mapeo mp
   WHERE (SELECT count(*) FROM movimientos_diarios m WHERE m.responsable = mp.valor_original)
         <> mp.cantidad_esperada;

  IF v_mismatch_sucios > 0 THEN
    RAISE EXCEPTION '107 ABORTADA: % de las 19 grafías a normalizar no tienen el conteo exacto aprobado por el dueño. No se adivina -- hay que re-verificar contra producción antes de tocar nada.', v_mismatch_sucios;
  END IF;

  -- ===========================================================================
  -- 2. Respaldo -- fila completa de las 154 filas afectadas, ANTES de tocar
  --    nada. En `respaldos`, nunca en `public` (081).
  -- ===========================================================================

  CREATE TABLE respaldos.backup_107_responsable_movimientos AS
    SELECT m.*
      FROM movimientos_diarios m
     WHERE EXISTS (SELECT 1 FROM mov_107_mapeo mp WHERE mp.valor_original = m.responsable);

  ALTER TABLE respaldos.backup_107_responsable_movimientos ENABLE ROW LEVEL SECURITY;

  REVOKE ALL ON TABLE respaldos.backup_107_responsable_movimientos
    FROM PUBLIC, anon, authenticated;

  COMMENT ON TABLE respaldos.backup_107_responsable_movimientos IS
    'Fila completa de las 154 `movimientos_diarios` cuyo `responsable` la migración 107 normalizó (19 grafías sucias -> 6 nombres canónicos: Clara Yaneth Rodríguez Rodríguez, David Jovany Garcia Mancera -- incluye las 3 grafías "Libardo operario dron" fusionadas aquí --, Diego Armando Giraldo Ocampo, Luis Felipe Garcia Huertas, Jarrinson Alvarado Jula, Emiliano Garcia). Fuente del ROLLBACK documentado al pie de 107.';

  -- ===========================================================================
  -- 3. Empleado EMILIANO GARCIA -- se crea antes de normalizar el texto que
  --    lo referencia (ver §1 arriba). `salario`, `prestaciones_sociales`,
  --    `auxilios_no_salariales`, `cargo`, `horas_semanales` NO se listan en
  --    el INSERT y por lo tanto quedan NULL. Esto es DELIBERADO, no un
  --    hueco: el dueño confirmó que Emiliano solo supervisa, nunca entra a
  --    cuadrilla, así que la compensación de jornalero no le aplica. NO
  --    "completar" estas columnas con 0 en una migración futura pensando
  --    que quedaron sin capturar.
  -- ===========================================================================

  INSERT INTO empleados (nombre, estado)
  SELECT 'EMILIANO GARCIA', 'Activo'
   WHERE NOT EXISTS (SELECT 1 FROM empleados WHERE nombre = 'EMILIANO GARCIA');

  IF NOT EXISTS (SELECT 1 FROM empleados WHERE nombre = 'EMILIANO GARCIA') THEN
    RAISE EXCEPTION '107 ABORTADA: el INSERT del empleado EMILIANO GARCIA no dejó la fila esperada -- revisar constraints de la tabla `empleados` a mano.';
  END IF;

  -- ===========================================================================
  -- 4. UPDATE -- por igualdad literal de string, nunca regex/fuzzy (una
  --    regex que se equivoca acá relabela quién hizo el trabajo, en
  --    silencio).
  -- ===========================================================================

  UPDATE movimientos_diarios m
     SET responsable = mp.nombre_canonico
    FROM mov_107_mapeo mp
   WHERE mp.valor_original = m.responsable;

  GET DIAGNOSTICS v_actualizadas = ROW_COUNT;

  IF v_actualizadas <> 154 THEN
    RAISE EXCEPTION '107 ABORTADA: el UPDATE tocó % fila(s), se esperaban exactamente 154. Se aborta para no dejar una normalización a medias.', v_actualizadas;
  END IF;

  -- ===========================================================================
  -- 5. Guardas de cierre -- dentro de la misma transacción: si algo no
  --    cuadra, se deshace TODO, incluidos el respaldo y el empleado recién
  --    creados.
  -- ===========================================================================

  -- 5.1 Cada nombre canónico quedó con exactamente su total esperado.
  SELECT count(*) INTO v_canonico_mismatch
    FROM mov_107_canonico_esperado ce
   WHERE (SELECT count(*) FROM movimientos_diarios m WHERE m.responsable = ce.nombre_canonico)
         <> ce.cantidad_esperada;

  IF v_canonico_mismatch > 0 THEN
    RAISE EXCEPTION '107 ABORTADA (post-UPDATE): % de los 6 nombres canónicos no quedaron con el total esperado (12/44/29/58/3/8).', v_canonico_mismatch;
  END IF;

  -- 5.2 No queda ninguna fila con alguna de las 19 grafías sucias.
  SELECT count(*) INTO v_sucios_restantes
    FROM movimientos_diarios m
   WHERE EXISTS (SELECT 1 FROM mov_107_mapeo mp WHERE mp.valor_original = m.responsable);

  IF v_sucios_restantes <> 0 THEN
    RAISE EXCEPTION '107 ABORTADA (post-UPDATE): quedan % fila(s) con una grafía sucia -- el UPDATE no las cubrió todas.', v_sucios_restantes;
  END IF;

  -- 5.3 El universo de responsable no vacío no cambió de tamaño.
  SELECT count(*) INTO v_total_no_vacio
    FROM movimientos_diarios
   WHERE responsable IS NOT NULL AND btrim(responsable) <> '';

  IF v_total_no_vacio <> 154 THEN
    RAISE EXCEPTION '107 ABORTADA (post-UPDATE): el total de movimientos con responsable no vacío pasó de 154 a % -- esta migración solo debía re-etiquetar texto, nunca borrar ni insertar filas de `movimientos_diarios`.', v_total_no_vacio;
  END IF;

  -- 5.4 Grafías distintas finales: exactamente los 6 nombres canónicos.
  SELECT count(DISTINCT responsable) INTO v_distintos_final
    FROM movimientos_diarios
   WHERE responsable IS NOT NULL AND btrim(responsable) <> '';

  IF v_distintos_final <> 6 THEN
    RAISE EXCEPTION '107 ABORTADA (post-UPDATE): quedan % grafías distintas de responsable no vacío, se esperaban exactamente 6 (los nombres canónicos).', v_distintos_final;
  END IF;

  -- 5.5 El empleado EMILIANO GARCIA existe, está Activo y sus columnas de
  --     compensación/cargo quedaron NULL (no se adivinaron ni se pusieron
  --     en 0).
  IF NOT EXISTS (
    SELECT 1 FROM empleados
     WHERE nombre = 'EMILIANO GARCIA'
       AND estado = 'Activo'
       AND salario IS NULL
       AND prestaciones_sociales IS NULL
       AND auxilios_no_salariales IS NULL
       AND cargo IS NULL
       AND horas_semanales IS NULL
  ) THEN
    RAISE EXCEPTION '107 ABORTADA (post-INSERT): el empleado EMILIANO GARCIA no quedó exactamente como se esperaba (Activo, con salario/prestaciones_sociales/auxilios_no_salariales/cargo/horas_semanales en NULL).';
  END IF;

  RAISE NOTICE '107: normalización completa -- 154 filas re-etiquetadas a 6 nombres canónicos, empleado EMILIANO GARCIA creado (Activo, compensación sin capturar), respaldo en respaldos.backup_107_responsable_movimientos.';
END $$;


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Restaura las 154 filas re-etiquetadas a su `responsable` original, leyendo
-- de la copia de seguridad por `id` (columna estable -- el texto de
-- `responsable` ya no lo es después de este UPDATE):
--
--   UPDATE movimientos_diarios m
--      SET responsable = b.responsable
--     FROM respaldos.backup_107_responsable_movimientos b
--    WHERE b.id = m.id;
--
-- El empleado EMILIANO GARCIA creado por esta migración se puede borrar
-- SOLO si nada lo referenció después de crearse (revisar
-- `movimientos_diarios_trabajadores.empleado_id`, `registros_trabajo` y
-- `tareas`/`empleados_tareas` antes de borrar -- un DELETE contra una fila
-- ya referenciada por FK falla, y eso es la protección correcta, no un
-- obstáculo a saltarse):
--
--   DELETE FROM empleados WHERE nombre = 'EMILIANO GARCIA';
--
-- La tabla `respaldos.backup_107_responsable_movimientos` se deja en la base
-- a propósito, mismo criterio que `backup_080_*`/`backup_099_*`. Bórrala
-- cuando Santiago confirme que el histórico de Movimientos/Reportes de
-- Aplicaciones se ve correcto para los 6 responsables normalizados.
-- =============================================================================
