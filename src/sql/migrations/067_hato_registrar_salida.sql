-- =====================================================================
-- 067: fn_hato_registrar_salida -- escritura atómica de "Marcar
-- vendida / muerta" (acción rápida de HojaDeVida.tsx, Figma alignment
-- spec §3).
-- Fecha: 2026-07-24
--
-- Problema que resuelve: `useEventoRapidoHato.ts::marcarSalida` hacía DOS
-- escrituras secuenciales desde el cliente -- INSERT en `hato_eventos`
-- (tipo venta/muerte) y luego UPDATE de `hato_animales.estado` -- sin
-- transacción que las una. Si la segunda fallaba, el evento quedaba
-- logueado pero el animal seguía "activa" en `v_hato_estado_actual`
-- (`estado` es `a.estado` directo, migración 056 §5, no se deriva de
-- `hato_eventos` como sí lo hace `num_partos`), dejando dashboard/listas/
-- KPIs mintiendo. Ver el FLAG que dejó esa sesión en la cabecera de
-- `useEventoRapidoHato.ts`.
--
-- Por qué SECURITY INVOKER (el default -- a diferencia de 065): esta
-- función se llama directo desde el navegador con el JWT del usuario, vía
-- `supabase.rpc(...)`, sin un edge function como borde de autorización. Una
-- función plpgsql corre implícitamente dentro de la transacción del
-- statement que la invoca, así que UNA llamada = UNA transacción =
-- atomicidad, sin necesitar SECURITY DEFINER. Y al NO usar DEFINER, el
-- INSERT y el UPDATE de adentro siguen evaluando la RLS de patrón 044 de
-- `hato_eventos`/`hato_animales` (escritura Administrador+Gerencia) con el
-- rol de quien llama -- el mismo gate que ya existía en las dos escrituras
-- sueltas, sin necesidad de un chequeo de rol manual dentro de la función.
-- (Contraste con `fn_hato_commit_chequeo`, 065: ese es DEFINER y
-- service-role-only porque su único caller es un edge function que YA
-- verificó el rol en el borde -- situación distinta, no copiar su
-- REVOKE/GRANT acá.)
--
-- Parámetros: p_tipo restringido a 'venta'|'muerte' (mismo dominio que el
-- CHECK de `hato_eventos.tipo`); p_nota opcional, se recorta y se guarda
-- como `{"nota": "..."}` en `datos` solo si queda no vacía (mismo shape que
-- ya escribía el hook a mano).
--
-- Idempotente de re-crear (CREATE OR REPLACE): seguro de re-ejecutar esta
-- migración.
-- =====================================================================

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

  -- 1. Capa de eventos -- log de auditoría append-only (V7).
  INSERT INTO hato_eventos (animal_id, tipo, fecha, fecha_confianza, datos, fuente, created_by)
  VALUES (p_animal_id, p_tipo, p_fecha, 'exacta', v_datos, 'web', auth.uid())
  RETURNING id INTO v_evento_id;

  -- 2. Capa derivada (ficha/lista/dashboard) -- `estado` NO se deriva de
  --    hato_eventos en v_hato_estado_actual, hay que tocarlo explícito.
  UPDATE hato_animales
  SET estado = v_estado, fecha_estado = p_fecha
  WHERE id = p_animal_id;

  -- Defensivo: en la práctica el FK NOT NULL de hato_eventos.animal_id ya
  -- habría abortado el INSERT de arriba si el animal no existiera, pero se
  -- deja el chequeo explícito para un mensaje de error claro si algún día
  -- esa FK cambia.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_hato_registrar_salida: no existe animal con id %', p_animal_id;
  END IF;

  RETURN v_evento_id;
END;
$$;

-- Esta RPC es una mutación que exige sesión (la llama el cliente con el JWT
-- del usuario). Postgres concede EXECUTE a PUBLIC por defecto y Supabase
-- además concede a `anon` en cada función nueva del schema public -- se
-- revocan ambos para que solo `authenticated` pueda invocarla. La RLS patrón
-- 044 de las dos tablas hace el resto del gate (Administrador/Gerencia): un
-- authenticated sin ese rol invoca pero la escritura falla por RLS, igual que
-- antes con las dos escrituras sueltas.
REVOKE EXECUTE ON FUNCTION fn_hato_registrar_salida(UUID, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_hato_registrar_salida(UUID, TEXT, DATE, TEXT) TO authenticated;

COMMENT ON FUNCTION fn_hato_registrar_salida(UUID, TEXT, DATE, TEXT) IS
  'SECURITY INVOKER (default): registra atómicamente la salida (venta/muerte) '
  'de un animal del hato -- INSERT en hato_eventos + UPDATE de '
  'hato_animales.estado/fecha_estado en una sola transacción. Llamada directo '
  'desde el cliente (useEventoRapidoHato.ts::marcarSalida) con el JWT del '
  'usuario; al no ser DEFINER, la RLS patrón 044 de ambas tablas sigue '
  'gateando la escritura a Administrador/Gerencia sin chequeo de rol manual.';
