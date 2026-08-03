-- =============================================================================
-- 067_hato_registrar_salida.sql
--
-- ARCHIVO DE REGISTRO -- NO APLICAR. Reconstruido el 2026-08-03 para cerrar el
-- hueco del numero 067 en el ledger (item 9 del issue 96).
--
-- Esta migracion se aplico a produccion el 2026-07-24 18:19:19 UTC SIN que su
-- archivo existiera en el repo. Se registro en el ledger de Supabase como
-- version `20260724181919`, name `hato_registrar_salida`. El cuerpo de abajo se
-- recupero literal de `supabase_migrations.schema_migrations.statements` -- por
-- eso su primera linea ya se autodenomina "067" y apunta a este mismo archivo,
-- que nunca llego a existir.
--
-- ADEMAS: la funcion YA NO EXISTE EN PRODUCCION. Se dropeo fuera de banda
-- (ninguna migracion la borra; ninguna fila del ledger la menciona despues) al
-- reconciliar esta rama con S6/S9/S10, decision documentada en
-- src/components/hato/CLAUDE.md: venta/muerte quedo a cargo del
-- `VentaAnimalDialog`/`MuerteAnimalDialog` de S9, integrados con finanzas, y
-- este camino atomico redundante se retiro junto con `MarcarSalidaDialog`.
--
-- Verificado 2026-08-03 contra produccion:
--   select proname from pg_proc where proname = 'fn_hato_registrar_salida';
--   -> 0 filas.
--
-- Se conserva aqui SOLO como evidencia de que existio en produccion entre el
-- 2026-07-24 y su drop. Volver a aplicarlo reintroduciria una funcion que el
-- modulo ya no usa y que ningun codigo llama.
-- =============================================================================

-- ------------- CUERPO RECUPERADO (no ejecutar) -------------------------------
-- 067: fn_hato_registrar_salida -- escritura atómica de "Marcar vendida / muerta"
-- Ver src/sql/migrations/067_hato_registrar_salida.sql para la nota completa.

CREATE OR REPLACE FUNCTION fn_hato_registrar_salida(
  p_animal_id UUID,
  p_tipo TEXT,
  p_fecha DATE,
  p_nota TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_estado TEXT;
  v_nota_limpia TEXT;
  v_datos JSONB;
  v_evento_id UUID;
BEGIN
  IF p_tipo NOT IN ('venta', 'muerte') THEN
    RAISE EXCEPTION 'fn_hato_registrar_salida: p_tipo debe ser venta o muerte (recibido: %)', p_tipo;
  END IF;

  IF p_animal_id IS NULL THEN
    RAISE EXCEPTION 'fn_hato_registrar_salida: p_animal_id es requerido';
  END IF;

  IF p_fecha IS NULL THEN
    RAISE EXCEPTION 'fn_hato_registrar_salida: p_fecha es requerida';
  END IF;

  v_estado := CASE WHEN p_tipo = 'venta' THEN 'vendida' ELSE 'muerta' END;

  v_nota_limpia := NULLIF(BTRIM(COALESCE(p_nota, '')), '');
  v_datos := CASE WHEN v_nota_limpia IS NOT NULL THEN jsonb_build_object('nota', v_nota_limpia) ELSE NULL END;

  -- 1. Capa de eventos -- log de auditoria append-only.
  INSERT INTO hato_eventos (animal_id, tipo, fecha, fecha_confianza, datos, fuente, created_by)
  VALUES (p_animal_id, p_tipo, p_fecha, 'exacta', v_datos, 'web', auth.uid())
  RETURNING id INTO v_evento_id;

  -- 2. Capa derivada -- estado NO se deriva de hato_eventos en v_hato_estado_actual.
  UPDATE hato_animales
  SET estado = v_estado, fecha_estado = p_fecha
  WHERE id = p_animal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_hato_registrar_salida: no existe animal con id %', p_animal_id;
  END IF;

  RETURN v_evento_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_hato_registrar_salida(UUID, TEXT, DATE, TEXT) TO authenticated;

COMMENT ON FUNCTION fn_hato_registrar_salida(UUID, TEXT, DATE, TEXT) IS
  'SECURITY INVOKER (default): registra atomicamente la salida (venta/muerte) de un animal del hato -- INSERT en hato_eventos + UPDATE de hato_animales.estado/fecha_estado en una sola transaccion. Llamada directo desde el cliente (useEventoRapidoHato.ts::marcarSalida) con el JWT del usuario; al no ser DEFINER, la RLS patron 044 de ambas tablas sigue gateando la escritura a Administrador/Gerencia sin chequeo de rol manual.';
-- ------------- FIN DEL CUERPO RECUPERADO -------------------------------------
