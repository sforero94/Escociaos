-- =====================================================================
-- 106: Cierre de aplicación atómico — fn_cerrar_aplicacion(payload jsonb)
--
-- Motivación (src/components/aplicaciones/CLAUDE.md, sección "Riesgo que
-- no se tocó"): `cerrarAplicacion()` en CierreAplicacion.tsx eran 6+
-- escrituras sueltas a Supabase, sin transacción. Si fallaba a la mitad
-- (ej. el UPDATE de un producto tras haber descontado otro), la aplicación
-- quedaba con inventario parcialmente descontado, tarea parcialmente
-- completada y registros de labor a medio editar. Es el camino de mayor
-- riesgo del módulo porque descuenta inventario real.
--
-- Esta migración NO cambia qué se escribe, ni en qué orden, ni con qué
-- valores -- solo envuelve las mismas 8 escrituras en una sola transacción
-- plpgsql. El cálculo de esos valores (costos, fechas, consolidación de
-- insumos) sigue viviendo en el cliente, en la función pura
-- `construirPayloadCierreAplicacion` (src/utils/calculosCierreAplicacion.ts)
-- -- el RPC no reimplementa esa aritmética, solo escribe lo que el payload
-- ya trae calculado. Mantener el cálculo en un solo lenguaje evita que
-- JS y SQL diverjan silenciosamente, el mismo criterio que motivó separar
-- "cálculo" de "escritura" en 070/097.
--
-- Orden de escritura preservado EXACTO (verificado contra la versión no
-- transaccional del archivo antes de tocarlo):
--   1. registros_trabajo DELETE   (por registro marcado _deleted con id)
--   2. registros_trabajo INSERT  (por registro marcado _isNew, no _deleted)
--   3. registros_trabajo UPDATE  (por registro marcado _modified con id, no _deleted)
--   4. aplicaciones_cierre INSERT
--   5. aplicaciones UPDATE (estado -> Cerrada, fechas reales, costos)
--   6. tareas UPDATE (estado -> Completada), solo si hay tarea_id
--   7. productos UPDATE (descuento de inventario), por producto consolidado
--   8. movimientos_inventario INSERT (traza del descuento), por producto
--
-- Los pasos 1-3 se agrupan por TIPO de operación en vez de recorrer el
-- arreglo en el orden en que el usuario editó -- comportamiento idéntico:
-- cada registro dispara como máximo UNA de las tres operaciones (los flags
-- _isNew/_deleted/_modified son mutuamente excluyentes por diseño del
-- estado del formulario, ver el comentario sobre las 3 pasadas más abajo),
-- así que agrupar por tipo no cambia qué fila recibe qué operación ni con
-- qué valores -- solo el orden relativo ENTRE filas distintas, que nunca
-- fue significativo (no hay FK ni unicidad entre registros_trabajo que
-- dependa de ese orden).
--
-- SECURITY INVOKER (precedente migración 070): quien llama es una sesión
-- de navegador Gerencia/Administrador ya autenticada, con RLS de escritura
-- sobre las 6 tablas que este RPC toca. Lo único que faltaba era
-- atomicidad -- un SECURITY DEFINER saltaría esa RLS y obligaría a
-- reimplementar el chequeo de rol adentro de la función, duplicando una
-- política que ya existe.
--
-- search_path fijado a `public, pg_temp` con pg_temp AL FINAL (migración
-- 082 parte 3): si no se lista, Postgres busca el esquema temporal
-- PRIMERO para nombres de relación, que es justo el vector de shadowing
-- que se cierra listándolo último.
--
-- Guardas nuevas (estilo 080/081/099 -- RAISE EXCEPTION antes de escribir
-- nada, nunca a mitad de la transacción):
--   (a) Doble cierre imposible: si aplicaciones.estado ya es 'Cerrada' se
--       aborta. La fila se bloquea con FOR UPDATE apenas entra la función,
--       así que dos llamadas concurrentes sobre la misma aplicación se
--       serializan -- la segunda ve el estado ya actualizado por la
--       primera y aborta, en vez de correr una carrera sobre la misma
--       fila. Hoy nada impedía esto (el estado solo se revisaba en la UI).
--   (b) Inventario nunca negativo: antes de tocar registros_trabajo o
--       cualquier otra tabla, se valida CADA producto del cierre contra
--       su `cantidad_actual` (con FOR UPDATE, mismo bloqueo temprano que
--       (a)). Si algún descuento dejaría el saldo negativo, se aborta con
--       el nombre del producto y los saldos en el mensaje. Hoy nada lo
--       impedía -- `productos.cantidad_actual` no tiene CHECK >= 0
--       (verificado: no existe en ninguna migración ni en
--       docs/supabase_tablas.md).
--
-- fraccion_jornal es un ENUM en BD con EXACTAMENTE 4 etiquetas, verificadas
-- contra `pg_enum` en producción el 2026-08-21: '0.25', '0.5', '0.75', '1.0'.
-- No hay '1.5' ni '2.0', y no existe ningún ALTER TYPE que las haya
-- agregado -- el enum nunca se extendió.
--
-- Eso destapó un defecto PREEXISTENTE, anterior a esta migración, que se
-- arregló en el cliente en el mismo commit:
--   (a) Los registros viven en React como NÚMEROS (`laborCosts.ts` hace
--       `parseFloat` al cargarlos). En JavaScript `(1.0).toString()` es
--       "1", NO "1.0" -- y '1' no es una etiqueta válida del enum. El
--       jornal completo es el valor por defecto de un registro nuevo y son
--       1.068 de 2.688 filas de `registros_trabajo`.
--   (b) `FRACCION_OPTIONS` ofrecía además 1.5 y 2.0, que el enum no puede
--       guardar. El módulo de Labores, que edita la MISMA tabla, siempre
--       ofreció solo las 4 correctas.
-- Ambos eran invisibles porque la versión no transaccional escribía con
-- `await supabase.from('registros_trabajo').insert({...})` SIN mirar
-- `{ error }`: el rechazo del enum se tragaba en silencio y el cierre
-- reportaba éxito habiendo perdido el registro.
--
-- El payload ahora trae la etiqueta LITERAL del enum, producida por
-- `etiquetaFraccionJornal()` (src/utils/calculosCierreAplicacion.ts), que
-- lanza ante cualquier valor fuera de las 4 en vez de inventar un formato
-- que la base va a rechazar. El RPC solo hace `::fraccion_jornal` sobre ese
-- texto -- cero reformateo, cero intento de "corregir" el string. Dentro de
-- la transacción un enum inválido aborta el cierre entero, que es más
-- honesto que el silencio anterior, pero la corrección real es que ya no
-- puede llegar uno inválido.
--
-- cerrado_por / responsable ya no se leen de `supabase.auth.getUser()` en
-- el cliente -- se derivan server-side de `auth.jwt() ->> 'email'`
-- (STABLE, mismo helper que RLS usa, verificado en la migración 077). Es
-- el mismo usuario autenticado en ambos casos; se documenta como el único
-- cambio de MECANISMO (no de valor) que esta migración introduce.
--
-- Idempotente: CREATE OR REPLACE, seguro de re-ejecutar.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_cerrar_aplicacion(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_aplicacion_id            UUID    := NULLIF(payload ->> 'aplicacion_id', '')::UUID;
  v_fecha_cierre             DATE    := NULLIF(payload ->> 'fecha_cierre', '')::DATE;
  v_fecha_inicio_ejecucion   DATE    := NULLIF(payload ->> 'fecha_inicio_ejecucion', '')::DATE;
  v_fecha_fin_ejecucion      DATE    := NULLIF(payload ->> 'fecha_fin_ejecucion', '')::DATE;
  v_dias_aplicacion          INTEGER := (payload ->> 'dias_aplicacion')::INTEGER;
  v_jornales_utilizados      NUMERIC := (payload ->> 'jornales_utilizados')::NUMERIC;
  v_valor_jornal             NUMERIC := (payload ->> 'valor_jornal')::NUMERIC;
  v_observaciones_cierre     TEXT    := payload ->> 'observaciones_cierre';
  v_observaciones_generales  TEXT    := NULLIF(payload ->> 'observaciones_generales', '');
  v_costo_total_insumos      NUMERIC := (payload ->> 'costo_total_insumos')::NUMERIC;
  v_costo_total_mano_obra    NUMERIC := (payload ->> 'costo_total_mano_obra')::NUMERIC;
  v_costo_total              NUMERIC := (payload ->> 'costo_total')::NUMERIC;
  v_costo_por_arbol          NUMERIC := (payload ->> 'costo_por_arbol')::NUMERIC;
  v_lote_aplicacion          TEXT    := payload ->> 'lote_aplicacion';
  v_registros                JSONB   := COALESCE(payload -> 'registros_trabajo', '[]'::jsonb);
  v_insumos                  JSONB   := COALESCE(payload -> 'insumos_aplicados', '[]'::jsonb);
  v_email                    TEXT    := auth.jwt() ->> 'email';

  v_aplicacion   RECORD;
  v_producto     RECORD;
  v_reg          JSONB;
  v_insumo       JSONB;
  v_cierre_id    UUID;
  v_n_eliminados INTEGER := 0;
  v_n_insertados INTEGER := 0;
  v_n_actualizados INTEGER := 0;
  v_n_productos  INTEGER := 0;
  v_producto_id  UUID;
  v_cantidad     NUMERIC;
  v_saldo_anterior NUMERIC;
  v_saldo_nuevo    NUMERIC;
BEGIN
  IF v_aplicacion_id IS NULL THEN
    RAISE EXCEPTION 'fn_cerrar_aplicacion: aplicacion_id es requerido';
  END IF;
  IF v_fecha_cierre IS NULL THEN
    RAISE EXCEPTION 'fn_cerrar_aplicacion: fecha_cierre es requerida';
  END IF;
  IF jsonb_typeof(v_registros) <> 'array' THEN
    RAISE EXCEPTION 'fn_cerrar_aplicacion: registros_trabajo debe ser un arreglo';
  END IF;
  IF jsonb_typeof(v_insumos) <> 'array' THEN
    RAISE EXCEPTION 'fn_cerrar_aplicacion: insumos_aplicados debe ser un arreglo';
  END IF;

  -- -------------------------------------------------------------------
  -- Guarda (a): bloquea la fila y prohíbe el doble cierre. FOR UPDATE
  -- serializa dos llamadas concurrentes sobre la misma aplicación -- la
  -- segunda espera a que la primera termine (commit o rollback) y luego
  -- ve el estado real, en vez de correr una carrera.
  -- -------------------------------------------------------------------
  SELECT id, estado, tarea_id INTO v_aplicacion
  FROM aplicaciones
  WHERE id = v_aplicacion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_cerrar_aplicacion: la aplicación % no existe', v_aplicacion_id;
  END IF;
  IF v_aplicacion.estado = 'Cerrada' THEN
    RAISE EXCEPTION 'fn_cerrar_aplicacion: la aplicación % ya está Cerrada -- no se puede cerrar dos veces', v_aplicacion_id;
  END IF;

  -- -------------------------------------------------------------------
  -- Guarda (b): valida TODO el descuento de inventario antes de escribir
  -- nada. FOR UPDATE bloquea cada producto ya en esta pasada -- el mismo
  -- candado se reutiliza (no se libera y se vuelve a tomar) en el paso 7.
  -- -------------------------------------------------------------------
  FOR v_insumo IN SELECT * FROM jsonb_array_elements(v_insumos) LOOP
    v_producto_id := (v_insumo ->> 'producto_id')::UUID;
    v_cantidad := (v_insumo ->> 'cantidad')::NUMERIC;

    IF v_producto_id IS NULL THEN
      RAISE EXCEPTION 'fn_cerrar_aplicacion: hay un insumo del cierre sin producto_id';
    END IF;

    SELECT cantidad_actual INTO v_saldo_anterior
    FROM productos
    WHERE id = v_producto_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'fn_cerrar_aplicacion: el producto % no existe', v_producto_id;
    END IF;

    IF COALESCE(v_saldo_anterior, 0) - COALESCE(v_cantidad, 0) < 0 THEN
      RAISE EXCEPTION
        'fn_cerrar_aplicacion: el cierre dejaría el inventario de "%" en negativo (saldo actual %, se intenta descontar %)',
        v_insumo ->> 'producto_nombre', v_saldo_anterior, v_cantidad;
    END IF;
  END LOOP;

  -- -------------------------------------------------------------------
  -- 1. registros_trabajo DELETE -- registros marcados _deleted que ya
  --    existían en BD (tienen id). Espejo de:
  --    `if (reg._deleted && reg.id) { .delete().eq('id', reg.id) }`
  -- -------------------------------------------------------------------
  FOR v_reg IN SELECT * FROM jsonb_array_elements(v_registros) LOOP
    IF COALESCE((v_reg ->> '_deleted')::boolean, false)
       AND (v_reg ->> 'id') IS NOT NULL THEN
      DELETE FROM registros_trabajo WHERE id = (v_reg ->> 'id')::UUID;
      v_n_eliminados := v_n_eliminados + 1;
    END IF;
  END LOOP;

  -- -------------------------------------------------------------------
  -- 2. registros_trabajo INSERT -- registros marcados _isNew, no
  --    eliminados. Espejo de:
  --    `else if (reg._isNew && !reg._deleted) { .insert({...}) }`
  --    `valor_jornal_empleado` viene YA CALCULADO en el payload
  --    (`construirPayloadCierreAplicacion`, misma fórmula que el cliente
  --    usaba inline) -- el RPC no reimplementa esa aritmética.
  -- -------------------------------------------------------------------
  FOR v_reg IN SELECT * FROM jsonb_array_elements(v_registros) LOOP
    IF COALESCE((v_reg ->> '_isNew')::boolean, false)
       AND NOT COALESCE((v_reg ->> '_deleted')::boolean, false) THEN
      INSERT INTO registros_trabajo (
        tarea_id, empleado_id, contratista_id, lote_id, fecha_trabajo,
        fraccion_jornal, costo_jornal, valor_jornal_empleado, observaciones
      ) VALUES (
        NULLIF(v_reg ->> 'tarea_id', '')::UUID,
        NULLIF(v_reg ->> 'empleado_id', '')::UUID,
        NULLIF(v_reg ->> 'contratista_id', '')::UUID,
        NULLIF(v_reg ->> 'lote_id', '')::UUID,
        (v_reg ->> 'fecha_trabajo')::DATE,
        (v_reg ->> 'fraccion_jornal')::fraccion_jornal,
        (v_reg ->> 'costo_jornal')::NUMERIC,
        (v_reg ->> 'valor_jornal_empleado')::NUMERIC,
        NULLIF(v_reg ->> 'observaciones', '')
      );
      v_n_insertados := v_n_insertados + 1;
    END IF;
  END LOOP;

  -- -------------------------------------------------------------------
  -- 3. registros_trabajo UPDATE -- registros existentes marcados
  --    _modified, no eliminados. Espejo de:
  --    `else if (reg._modified && reg.id && !reg._deleted) { .update({fraccion_jornal, costo_jornal}) }`
  -- -------------------------------------------------------------------
  FOR v_reg IN SELECT * FROM jsonb_array_elements(v_registros) LOOP
    IF COALESCE((v_reg ->> '_modified')::boolean, false)
       AND (v_reg ->> 'id') IS NOT NULL
       AND NOT COALESCE((v_reg ->> '_deleted')::boolean, false) THEN
      UPDATE registros_trabajo
      SET fraccion_jornal = (v_reg ->> 'fraccion_jornal')::fraccion_jornal,
          costo_jornal = (v_reg ->> 'costo_jornal')::NUMERIC
      WHERE id = (v_reg ->> 'id')::UUID;
      v_n_actualizados := v_n_actualizados + 1;
    END IF;
  END LOOP;

  -- -------------------------------------------------------------------
  -- 4. aplicaciones_cierre INSERT
  -- -------------------------------------------------------------------
  INSERT INTO aplicaciones_cierre (
    aplicacion_id, fecha_cierre, dias_aplicacion, valor_jornal,
    observaciones_generales, cerrado_por
  ) VALUES (
    v_aplicacion_id, v_fecha_cierre, v_dias_aplicacion, v_valor_jornal,
    v_observaciones_generales, v_email
  )
  RETURNING id INTO v_cierre_id;

  -- -------------------------------------------------------------------
  -- 5. aplicaciones UPDATE
  -- -------------------------------------------------------------------
  UPDATE aplicaciones
  SET estado = 'Cerrada',
      fecha_cierre = v_fecha_cierre,
      fecha_inicio_ejecucion = v_fecha_inicio_ejecucion,
      fecha_fin_ejecucion = v_fecha_fin_ejecucion,
      jornales_utilizados = v_jornales_utilizados,
      valor_jornal = v_valor_jornal,
      observaciones_cierre = v_observaciones_cierre,
      costo_total_insumos = v_costo_total_insumos,
      costo_total_mano_obra = v_costo_total_mano_obra,
      costo_total = v_costo_total,
      costo_por_arbol = v_costo_por_arbol
  WHERE id = v_aplicacion_id;

  -- -------------------------------------------------------------------
  -- 6. tareas UPDATE -- solo si hay tarea vinculada. La versión no
  --    transaccional no revisaba el error de este UPDATE (ver el
  --    encabezado de esta migración); dentro de la transacción, un fallo
  --    acá revierte los pasos 1-5 en vez de quedar en silencio.
  -- -------------------------------------------------------------------
  IF v_aplicacion.tarea_id IS NOT NULL THEN
    UPDATE tareas
    SET estado = 'Completada', fecha_fin_real = v_fecha_fin_ejecucion
    WHERE id = v_aplicacion.tarea_id;
  END IF;

  -- -------------------------------------------------------------------
  -- 7 y 8. productos UPDATE + movimientos_inventario INSERT, por
  --    producto consolidado. La consolidación (sumar cantidad_utilizada
  --    por producto_id, con la conversión cc/g -> L/Kg) ya viene hecha en
  --    el payload (`construirPayloadCierreAplicacion`) -- este RPC solo
  --    aplica el descuento ya validado en la guarda (b) de arriba.
  -- -------------------------------------------------------------------
  FOR v_insumo IN SELECT * FROM jsonb_array_elements(v_insumos) LOOP
    v_producto_id := (v_insumo ->> 'producto_id')::UUID;
    v_cantidad := (v_insumo ->> 'cantidad')::NUMERIC;

    SELECT cantidad_actual, unidad_medida, precio_unitario INTO v_producto
    FROM productos
    WHERE id = v_producto_id
    FOR UPDATE;

    v_saldo_anterior := COALESCE(v_producto.cantidad_actual, 0);
    v_saldo_nuevo := v_saldo_anterior - v_cantidad;

    UPDATE productos
    SET cantidad_actual = v_saldo_nuevo
    WHERE id = v_producto_id;

    INSERT INTO movimientos_inventario (
      fecha_movimiento, producto_id, tipo_movimiento, cantidad, unidad,
      lote_aplicacion, aplicacion_id, saldo_anterior, saldo_nuevo,
      valor_movimiento, responsable, observaciones, provisional
    ) VALUES (
      v_fecha_fin_ejecucion, v_producto_id, 'Salida por Aplicación', v_cantidad,
      v_producto.unidad_medida, v_lote_aplicacion, v_aplicacion_id,
      v_saldo_anterior, v_saldo_nuevo,
      v_cantidad * COALESCE(v_producto.precio_unitario, 0), v_email,
      'Cierre de aplicación: ' || COALESCE(v_lote_aplicacion, ''), false
    );

    v_n_productos := v_n_productos + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'aplicacionId', v_aplicacion_id,
    'cierreId', v_cierre_id,
    'registrosEliminados', v_n_eliminados,
    'registrosInsertados', v_n_insertados,
    'registrosActualizados', v_n_actualizados,
    'productosActualizados', v_n_productos
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_cerrar_aplicacion(JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_cerrar_aplicacion(JSONB) TO authenticated;

COMMENT ON FUNCTION fn_cerrar_aplicacion(JSONB) IS
  'SECURITY INVOKER: cierra una aplicación en una sola transacción (8 escrituras: '
  'registros_trabajo DELETE/INSERT/UPDATE, aplicaciones_cierre INSERT, aplicaciones '
  'UPDATE, tareas UPDATE, productos UPDATE, movimientos_inventario INSERT -- mismo '
  'orden y mismos valores que la versión no transaccional de CierreAplicacion.tsx). '
  'El caller es un navegador Gerencia/Administrador autenticado con RLS de escritura '
  'sobre las 6 tablas; esta función solo aporta atomicidad, no bypassa ninguna '
  'política. Rechaza el doble cierre (aplicaciones.estado = ''Cerrada'') y cualquier '
  'descuento que dejaría productos.cantidad_actual en negativo -- ninguna de las dos '
  'cosas estaba impedida antes de esta migración.';
