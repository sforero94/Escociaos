-- =====================================================================
-- 085: Hato Lechero -- S4 de la ronda de agosto 2026
--      (docs/plan_hato_ronda_agosto_2026.md, §0 D-8/D-10/D-11/D-12, §4 S4).
-- Fecha: 2026-08-06
--
-- Numerada 085 (084 ya la tomó S3, `hato_correcciones` -- ver ese archivo,
-- corriendo en paralelo). NO APLICADA a producción por esta sesión --
-- punto de parada explícito del brief; la aplica el main loop.
--
-- QUÉ HACE, en orden:
--   1. `hato_config.retencion_ica_leche` = 0.0225 (D-11) -- la retención
--      NUNCA es una constante en código, es la regla dura del módulo.
--      Editable desde Ajustes del Hato (frontend, fuera de esta migración).
--   2. `hato_produccion_quincenal.precio_bruto_litro` -- columna nueva,
--      NUMERIC nullable. Sin ella el bruto de la liquidación se pierde:
--      `fin_ingresos.valor`/`precio_unitario` van a guardar el NETO (D-11),
--      así que el bruto tiene que sobrevivir en algún lado para que la
--      liquidación del Pomar siga siendo auditable (§1.2 del plan).
--   3. Bucket de Storage `hato-liquidaciones-fotos` -- capa cruda de la
--      carga por foto de la liquidación (D-8), mismo patrón que 072
--      (`chequeos-fotos`): privado, RLS Administrador+Gerencia para
--      subir/leer/actualizar, Gerencia-only para borrar.
--   4. `CREATE OR REPLACE FUNCTION fn_hato_guardar_quincena_venta` --
--      cambia el CONTRATO del payload: `fin_ingreso.valor` (antes: el
--      valor que el usuario capturaba a mano, ya neto) se reemplaza por
--      `fin_ingreso.valor_bruto` (el bruto de la liquidación, D-11). La
--      función ahora:
--        a. lee `hato_config.retencion_ica_leche` EN VIVO -- nunca
--           hardcodeada;
--        b. decide si el periodo (anio, mes) cae en o después de julio
--           2026 (D-12) -- antes de esa fecha, ICA = 0 y neto = bruto (lo
--           histórico queda en bruto; ver también
--           `hatoProduccion.ts::aplicaRetencionIcaLeche`, la MISMA
--           comparación reimplementada en TS solo para el preview del
--           formulario -- lo que persiste siempre sale de acá, nunca del
--           cliente);
--        c. calcula `neto = bruto × (1 − ica)` y lo guarda en
--           `fin_ingresos.valor` (igual que antes: la columna real de
--           caja, D-11 dice que el ICA "no entra a caja");
--        d. calcula `precio_unitario = neto / litros_total` (SIN CAMBIO de
--           fórmula respecto a 070 -- antes dividía el valor capturado
--           entre litros, que YA era lo que hoy es "neto"; el único cambio
--           es que el valor capturado ahora se llama bruto y el dividendo
--           pasa a ser el neto recién calculado);
--        e. calcula `precio_bruto_litro = bruto / litros_total` y lo
--           guarda en `hato_produccion_quincenal` (mitigación #2 de arriba).
--      El resto del contrato (find-or-create de negocio/categoría por
--      NOMBRE, UPDATE-por-id-o-INSERT, periodo editable, rechazo de filas
--      `derivado_mensual`) es IDÉNTICO a 070 -- no se repite ese
--      razonamiento acá, ver ese archivo.
--
--      `fn_hato_eliminar_quincena_venta` y `fn_hato_registrar_venta_
--      animales` NO se tocan -- fuera del alcance de S4, ninguna de las
--      dos necesita saber de ICA.
--
--      ADVERTENCIA -- NO verificado contra `pg_proc.prosrc` en vivo: el
--      brief pedía leer el cuerpo VIVO de `fn_hato_guardar_quincena_venta`
--      antes de escribir este `CREATE OR REPLACE` (regla: "los archivos del
--      repo no son prueba de lo que corre en producción"), pero el
--      conector de solo lectura no estaba disponible en esta sesión (ver el
--      reporte). Este `CREATE OR REPLACE` se escribió contra el texto
--      VERSIONADO de 070_hato_produccion_venta_link.sql. Quien aplique esta
--      migración debe confirmar antes con `pg_proc.prosrc` que el cuerpo
--      vivo de la función coincide con ese archivo -- si production
--      diverge (por un hotfix no versionado, por ejemplo), este `CREATE OR
--      REPLACE` lo pisaría en silencio.
--
--      Aprovecha el `CREATE OR REPLACE` para fijar `search_path = public,
--      pg_temp` (antes: `search_path = public`, sin `pg_temp` -- 070 es
--      anterior a la regla de 082). `pg_temp` va AL FINAL a propósito
--      (082 parte 3): si no se menciona, Postgres busca el esquema
--      temporal PRIMERO para nombres de relación, el vector de sombra que
--      esa regla cierra.
--
-- QUÉ NO TOCA (a propósito, fuera de alcance de S4 backend):
--   * Ninguna fila existente de `hato_produccion_quincenal`/`fin_ingresos`
--     se modifica -- todas las filas hoy son `derivado_mensual` (backfill),
--     que este RPC siempre rechazó editar (070) y sigue rechazando. D-12
--     es automático por construcción: el único camino de escritura que usa
--     esta fórmula es este RPC, y el RPC nunca toca una fila
--     `derivado_mensual`.
--   * RLS de las tablas fuente -- sigue el patrón 044/070 (SELECT
--     authenticated, escritura Administrador+Gerencia en
--     `hato_produccion_quincenal`; `fin_ingresos` Gerencia-only, sin
--     cambios).
--   * No se crea ninguna tabla para el resultado del OCR de la
--     liquidación -- el endpoint (`hato-produccion-quincena-foto.ts`,
--     fuera de esta migración) nunca escribe en tablas de dominio, solo
--     devuelve campos interpretados para que el formulario los revise antes
--     de guardar por el RPC de arriba (mismo contrato que
--     `hato/chequeo/preview`).
--
-- Correr el archivo COMPLETO de una sola vez (SQL editor o
-- `apply_migration`), para que sea una transacción. Idempotente:
-- `INSERT ... ON CONFLICT DO NOTHING`, `ADD COLUMN IF NOT EXISTS`,
-- `INSERT ... ON CONFLICT (id) DO NOTHING` para el bucket, `DROP POLICY IF
-- EXISTS` + `CREATE POLICY`, `CREATE OR REPLACE FUNCTION`.
-- =====================================================================


-- -----------------------------------------------------------------------
-- 1. hato_config.retencion_ica_leche (D-11) -- ON CONFLICT DO NOTHING: si
--    Gerencia ya la editó desde Ajustes antes de que esta migración se
--    aplique en algún entorno, no se pisa.
-- -----------------------------------------------------------------------

INSERT INTO hato_config (clave, valor, descripcion)
VALUES (
  'retencion_ica_leche',
  '0.0225'::jsonb,
  'Retención de ICA sobre la venta de leche a El Pomar (D-11, '
  'docs/plan_hato_ronda_agosto_2026.md §0), fracción entre 0 y 1 -- '
  '2,25% confirmado contra la fórmula del dueño '
  '(=IF(ISBLANK(D3),"",D3*0.9775)). Aplica solo a periodos de julio 2026 '
  'en adelante (D-12); lo histórico queda en bruto. Leída en vivo por '
  'fn_hato_guardar_quincena_venta (migración 085) -- nunca una constante '
  'en código.'
)
ON CONFLICT (clave) DO NOTHING;


-- -----------------------------------------------------------------------
-- 2. hato_produccion_quincenal.precio_bruto_litro -- mitigación de
--    auditabilidad (§1.2 del plan). Nullable a propósito: las filas
--    `derivado_mensual` (backfill) no tienen precio bruto que capturar --
--    "sin dato, nunca 0".
-- -----------------------------------------------------------------------

ALTER TABLE hato_produccion_quincenal
  ADD COLUMN IF NOT EXISTS precio_bruto_litro NUMERIC;

ALTER TABLE hato_produccion_quincenal
  DROP CONSTRAINT IF EXISTS hato_prod_quincenal_precio_bruto_no_negativo;
ALTER TABLE hato_produccion_quincenal
  ADD CONSTRAINT hato_prod_quincenal_precio_bruto_no_negativo
  CHECK (precio_bruto_litro IS NULL OR precio_bruto_litro >= 0);

COMMENT ON COLUMN hato_produccion_quincenal.precio_bruto_litro IS
  'Precio bruto por litro de la liquidación de El Pomar ANTES de la '
  'retención de ICA (D-11, migración 085) -- bruto = precio_bruto_litro × '
  'litros_total (leídos vía fin_ingreso_id para una fila medido). NULL '
  'para toda fila anterior a esta migración (derivado_mensual, o medido '
  'anterior a julio 2026 -- ver aplicaRetencionIcaLeche en '
  'hatoProduccion.ts): "sin dato, nunca 0". Poblada únicamente por '
  'fn_hato_guardar_quincena_venta.';


-- -----------------------------------------------------------------------
-- 3. Bucket de Storage `hato-liquidaciones-fotos` -- capa cruda de la
--    carga por foto de la liquidación (D-8). Mismo patrón que 072
--    (`chequeos-fotos`): privado, nunca servido por URL directa.
-- -----------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('hato-liquidaciones-fotos', 'hato-liquidaciones-fotos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Hato: subir fotos de liquidacion" ON storage.objects;
CREATE POLICY "Hato: subir fotos de liquidacion"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'hato-liquidaciones-fotos' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
      AND usuarios.rol IN ('Administrador', 'Gerencia')
  )
);

DROP POLICY IF EXISTS "Hato: leer fotos de liquidacion" ON storage.objects;
CREATE POLICY "Hato: leer fotos de liquidacion"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'hato-liquidaciones-fotos' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
      AND usuarios.rol IN ('Administrador', 'Gerencia')
  )
);

DROP POLICY IF EXISTS "Hato: actualizar fotos de liquidacion" ON storage.objects;
CREATE POLICY "Hato: actualizar fotos de liquidacion"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'hato-liquidaciones-fotos' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
      AND usuarios.rol IN ('Administrador', 'Gerencia')
  )
);

-- Borrar: Gerencia-only, mismo criterio que 072 -- la foto es la capa cruda
-- y la única evidencia de lo que decía el documento del Pomar.
DROP POLICY IF EXISTS "Hato: eliminar fotos de liquidacion" ON storage.objects;
CREATE POLICY "Hato: eliminar fotos de liquidacion"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'hato-liquidaciones-fotos' AND
  EXISTS (
    SELECT 1 FROM usuarios
    WHERE usuarios.id = auth.uid()
      AND usuarios.rol = 'Gerencia'
  )
);


-- =====================================================================
-- 4. fn_hato_guardar_quincena_venta -- CREATE OR REPLACE, nuevo contrato
--    de payload (fin_ingreso.valor -> fin_ingreso.valor_bruto) + cálculo
--    de ICA en vivo desde hato_config.
--
--    Payload (jsonb):
--      {
--        "quincena_id": uuid | null,
--        "anio": int, "mes": int, "quincena": 1 | 2,
--        "fecha_inicio": date | null, "fecha_fin": date | null,
--        "litros_total": numeric,
--        "litros_pomar_confirmado": numeric | null,
--        "num_vacas_ordeno": int | null,
--        "notas": text | null,
--        "fin_ingreso": {
--          "fecha": date,
--          "valor_bruto": numeric,   -- CAMBIA de 070: antes "valor" (ya
--                                    -- neto, capturado a mano). Ahora
--                                    -- SIEMPRE el bruto de la liquidación
--                                    -- (D-11) -- el RPC calcula el neto.
--          "region_id": uuid, "medio_pago_id": uuid,
--          "comprador_id": uuid | null, "nombre": text | null
--        }
--      }
--
--    RETURNS jsonb: { "quincenaId": uuid, "finIngresoId": uuid,
--                      "icaAplicada": boolean, "ica": numeric,
--                      "neto": numeric }.
--    Los tres campos nuevos del RETURN son para que el formulario pueda
--    confirmar en pantalla lo que el servidor realmente calculó, sin
--    tener que releer la fila (mismo criterio que el resto del RPC:
--    el cliente nunca reimplementa la fórmula para decidir qué mostró).
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_hato_guardar_quincena_venta(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER   -- default de plpgsql, explícito a propósito (070 §3.2)
SET search_path = public, pg_temp
AS $$
DECLARE
  v_quincena_id UUID := NULLIF(payload ->> 'quincena_id', '')::UUID;
  v_anio INTEGER := (payload ->> 'anio')::INTEGER;
  v_mes INTEGER := (payload ->> 'mes')::INTEGER;
  v_quincena INTEGER := (payload ->> 'quincena')::INTEGER;
  v_fecha_inicio DATE := NULLIF(payload ->> 'fecha_inicio', '')::DATE;
  v_fecha_fin DATE := NULLIF(payload ->> 'fecha_fin', '')::DATE;
  v_litros_total NUMERIC := (payload ->> 'litros_total')::NUMERIC;
  v_litros_pomar NUMERIC := NULLIF(payload ->> 'litros_pomar_confirmado', '')::NUMERIC;
  v_num_vacas INTEGER := NULLIF(payload ->> 'num_vacas_ordeno', '')::INTEGER;
  v_num_vacas_origen TEXT;
  v_notas TEXT := payload ->> 'notas';
  v_ingreso JSONB := payload -> 'fin_ingreso';
  v_ing_fecha DATE := (v_ingreso ->> 'fecha')::DATE;
  v_ing_valor_bruto NUMERIC := (v_ingreso ->> 'valor_bruto')::NUMERIC;
  v_ing_region_id UUID := (v_ingreso ->> 'region_id')::UUID;
  v_ing_medio_pago_id UUID := (v_ingreso ->> 'medio_pago_id')::UUID;
  v_ing_comprador_id UUID := NULLIF(v_ingreso ->> 'comprador_id', '')::UUID;
  v_ing_nombre TEXT := NULLIF(v_ingreso ->> 'nombre', '');
  v_negocio_id UUID;
  v_categoria_id UUID;
  v_fin_ingreso_id UUID;
  v_existente RECORD;
  -- --- D-11/D-12: ICA sobre la leche -----------------------------------
  v_aplica_ica BOOLEAN;
  v_retencion_ica NUMERIC := 0;
  v_ica NUMERIC;
  v_ing_valor_neto NUMERIC;
  v_precio_bruto_litro NUMERIC;
BEGIN
  -- ---- Validación de payload (antes de cualquier escritura) ----------
  IF v_anio IS NULL OR v_mes IS NULL OR v_quincena IS NULL THEN
    RAISE EXCEPTION 'fn_hato_guardar_quincena_venta: anio/mes/quincena son requeridos';
  END IF;
  IF v_litros_total IS NULL OR v_litros_total < 0 THEN
    RAISE EXCEPTION 'fn_hato_guardar_quincena_venta: litros_total es requerido y debe ser >= 0';
  END IF;
  IF v_ingreso IS NULL OR v_ing_fecha IS NULL OR v_ing_valor_bruto IS NULL
     OR v_ing_region_id IS NULL OR v_ing_medio_pago_id IS NULL THEN
    RAISE EXCEPTION 'fn_hato_guardar_quincena_venta: payload.fin_ingreso requiere fecha, valor_bruto, region_id y medio_pago_id (fin_ingresos NOT NULL, CLAUDE.md R5)';
  END IF;
  IF v_ing_valor_bruto <= 0 THEN
    RAISE EXCEPTION 'fn_hato_guardar_quincena_venta: payload.fin_ingreso.valor_bruto debe ser > 0 -- una quincena sin valor confirmado no se puede guardar todavía (070 §2.3, consecuencia deliberada)';
  END IF;

  -- ---- D-11/D-12: retención de ICA, leída EN VIVO de hato_config ------
  -- Nunca hardcodeada -- regla dura del módulo. D-12: solo aplica desde
  -- julio 2026 en adelante (comparación de tupla (anio, mes), la MISMA
  -- que hatoProduccion.ts::aplicaRetencionIcaLeche reimplementa en TS
  -- solo para el preview del formulario -- lo que persiste sale de acá).
  v_aplica_ica := (v_anio > 2026) OR (v_anio = 2026 AND v_mes >= 7);

  IF v_aplica_ica THEN
    SELECT (valor #>> '{}')::NUMERIC INTO v_retencion_ica
    FROM hato_config
    WHERE clave = 'retencion_ica_leche';
    IF v_retencion_ica IS NULL THEN
      RAISE EXCEPTION 'fn_hato_guardar_quincena_venta: falta hato_config.retencion_ica_leche (migración 085) -- no se puede calcular el ICA de esta quincena';
    END IF;
    IF v_retencion_ica < 0 OR v_retencion_ica >= 1 THEN
      RAISE EXCEPTION 'fn_hato_guardar_quincena_venta: hato_config.retencion_ica_leche = % está fuera de rango (debe ser >= 0 y < 1)', v_retencion_ica;
    END IF;
  END IF;

  v_ica := ROUND(v_ing_valor_bruto * v_retencion_ica, 2);
  v_ing_valor_neto := ROUND(v_ing_valor_bruto - v_ica, 2);
  v_precio_bruto_litro := CASE WHEN v_litros_total > 0 THEN ROUND(v_ing_valor_bruto / v_litros_total, 2) END;

  v_num_vacas_origen := CASE WHEN v_num_vacas IS NOT NULL THEN 'medido' ELSE NULL END;

  SELECT id INTO v_negocio_id FROM fin_negocios WHERE nombre = 'Hato Lechero' LIMIT 1;
  IF v_negocio_id IS NULL THEN
    RAISE EXCEPTION 'fn_hato_guardar_quincena_venta: no existe el negocio "Hato Lechero" en fin_negocios';
  END IF;

  SELECT id INTO v_categoria_id
  FROM fin_categorias_ingresos
  WHERE negocio_id = v_negocio_id AND nombre ILIKE '%leche%' AND activo
  ORDER BY nombre
  LIMIT 1;
  IF v_categoria_id IS NULL THEN
    RAISE EXCEPTION 'fn_hato_guardar_quincena_venta: no hay categoría de ingreso activa que contenga "leche" bajo el negocio Hato Lechero -- configúrala en Finanzas antes de capturar una quincena';
  END IF;

  IF v_ing_nombre IS NULL THEN
    v_ing_nombre := v_litros_total::TEXT || ' L';
  END IF;

  IF v_quincena_id IS NOT NULL THEN
    -- ---- Edición: la quincena y su ingreso deben existir y ser 'medido' --
    SELECT id, fin_ingreso_id, origen_dato, anio, mes, quincena INTO v_existente
    FROM hato_produccion_quincenal
    WHERE id = v_quincena_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'fn_hato_guardar_quincena_venta: no existe la quincena %', v_quincena_id;
    END IF;
    IF v_existente.origen_dato <> 'medido' THEN
      RAISE EXCEPTION 'fn_hato_guardar_quincena_venta: la quincena % es derivado_mensual (backfill) y es de solo lectura -- edítala desde /finanzas/ingresos si necesitas corregir el mensual histórico', v_quincena_id;
    END IF;
    -- El PERIODO (anio/mes/quincena) SÍ se puede mover (070). Recalcular
    -- v_aplica_ica arriba, contra el periodo DESTINO, es lo que hace que
    -- mover una quincena a través de la frontera de julio 2026 recalcule
    -- el ICA correctamente en el mismo guardado -- sin caso especial.
    IF EXISTS (
      SELECT 1 FROM hato_produccion_quincenal
      WHERE anio = v_anio AND mes = v_mes AND quincena = v_quincena AND id <> v_quincena_id
    ) THEN
      RAISE EXCEPTION 'fn_hato_guardar_quincena_venta: ya existe otra quincena para el periodo %/% Q% -- no se puede mover la quincena % a un periodo que otra fila ya ocupa', v_anio, v_mes, v_quincena, v_quincena_id;
    END IF;

    v_fin_ingreso_id := v_existente.fin_ingreso_id;

    UPDATE fin_ingresos
    SET fecha = v_ing_fecha,
        negocio_id = v_negocio_id,
        region_id = v_ing_region_id,
        categoria_id = v_categoria_id,
        nombre = v_ing_nombre,
        comprador_id = v_ing_comprador_id,
        valor = v_ing_valor_neto,
        medio_pago_id = v_ing_medio_pago_id,
        cantidad = v_litros_total,
        precio_unitario = CASE WHEN v_litros_total > 0 THEN ROUND(v_ing_valor_neto / v_litros_total, 2) END
    WHERE id = v_fin_ingreso_id;

    UPDATE hato_produccion_quincenal
    SET anio = v_anio,
        mes = v_mes,
        quincena = v_quincena,
        fecha_inicio = v_fecha_inicio,
        fecha_fin = v_fecha_fin,
        litros_pomar_confirmado = v_litros_pomar,
        num_vacas_ordeno = v_num_vacas,
        num_vacas_ordeno_origen = v_num_vacas_origen,
        precio_bruto_litro = v_precio_bruto_litro,
        notas = v_notas,
        updated_at = NOW(),
        updated_by = auth.uid()
    WHERE id = v_quincena_id;
  ELSE
    -- ---- Alta: ingreso primero (fin_ingreso_id es NOT NULL) -------------
    INSERT INTO fin_ingresos (
      fecha, negocio_id, region_id, categoria_id, nombre, comprador_id,
      valor, medio_pago_id, cantidad, precio_unitario, created_by
    )
    VALUES (
      v_ing_fecha, v_negocio_id, v_ing_region_id, v_categoria_id, v_ing_nombre, v_ing_comprador_id,
      v_ing_valor_neto, v_ing_medio_pago_id, v_litros_total,
      CASE WHEN v_litros_total > 0 THEN ROUND(v_ing_valor_neto / v_litros_total, 2) END,
      auth.uid()
    )
    RETURNING id INTO v_fin_ingreso_id;

    INSERT INTO hato_produccion_quincenal (
      anio, mes, quincena, fecha_inicio, fecha_fin,
      litros_pomar_confirmado, num_vacas_ordeno, num_vacas_ordeno_origen,
      precio_bruto_litro, notas, fuente, origen_dato, fin_ingreso_id,
      created_by, updated_at, updated_by
    )
    VALUES (
      v_anio, v_mes, v_quincena, v_fecha_inicio, v_fecha_fin,
      v_litros_pomar, v_num_vacas, v_num_vacas_origen,
      v_precio_bruto_litro, v_notas, 'web', 'medido', v_fin_ingreso_id,
      auth.uid(), NOW(), auth.uid()
    )
    RETURNING id INTO v_quincena_id;
  END IF;

  RETURN jsonb_build_object(
    'quincenaId', v_quincena_id,
    'finIngresoId', v_fin_ingreso_id,
    'icaAplicada', v_aplica_ica,
    'ica', v_ica,
    'neto', v_ing_valor_neto
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_hato_guardar_quincena_venta(JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_hato_guardar_quincena_venta(JSONB) TO authenticated;

COMMENT ON FUNCTION fn_hato_guardar_quincena_venta(JSONB) IS
  'SECURITY INVOKER: escritura atómica del "registro único" quincena+ingreso '
  '(070). Desde 085: el payload captura fin_ingreso.valor_bruto (la '
  'liquidación de El Pomar antes de retención); el ICA (hato_config.'
  'retencion_ica_leche, leído en vivo) y el neto se calculan acá y el neto '
  'es lo que se guarda en fin_ingresos.valor -- D-11. Solo aplica retención '
  'a periodos anio/mes >= julio 2026 (D-12); antes de esa fecha ica=0 y '
  'neto=bruto. El caller es un navegador Gerencia autenticado; la RLS de '
  'fin_ingresos (Gerencia-only) y de hato_produccion_quincenal '
  '(Administrador+Gerencia) siguen aplicando dentro de esta función. '
  'Rechaza edición sobre filas origen_dato=''derivado_mensual'' (read-only, '
  'backfill).';


-- -----------------------------------------------------------------------
-- 5. Guardas de cierre -- estado final, patrón 080/081/082/084.
-- -----------------------------------------------------------------------

DO $$
DECLARE
  v_config_filas   INTEGER;
  v_config_valor   JSONB;
  v_columna_existe BOOLEAN;
  v_bucket_existe  BOOLEAN;
  v_politicas      INTEGER;
  v_grant_anon     BOOLEAN;
  v_grant_auth     BOOLEAN;
  v_search_path_ok BOOLEAN;
BEGIN
  -- 5.1 hato_config.retencion_ica_leche existe con el valor esperado
  --     (si Gerencia ya la editó antes de esta migración, el ON CONFLICT
  --     DO NOTHING de arriba respetó esa edición -- solo se verifica que
  --     la FILA exista y sea un número en [0,1), no un valor exacto).
  SELECT count(*) INTO v_config_filas FROM hato_config WHERE clave = 'retencion_ica_leche';
  IF v_config_filas <> 1 THEN
    RAISE EXCEPTION '085 ABORTADA: se esperaba exactamente 1 fila de hato_config para retencion_ica_leche, hay %.', v_config_filas;
  END IF;
  SELECT valor INTO v_config_valor FROM hato_config WHERE clave = 'retencion_ica_leche';
  IF NOT (jsonb_typeof(v_config_valor) = 'number'
          AND (v_config_valor #>> '{}')::NUMERIC >= 0
          AND (v_config_valor #>> '{}')::NUMERIC < 1) THEN
    RAISE EXCEPTION '085 ABORTADA: hato_config.retencion_ica_leche = % no es un número en [0,1).', v_config_valor;
  END IF;

  -- 5.2 La columna nueva existe.
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'hato_produccion_quincenal'
      AND column_name = 'precio_bruto_litro'
  ) INTO v_columna_existe;
  IF NOT v_columna_existe THEN
    RAISE EXCEPTION '085 ABORTADA: hato_produccion_quincenal.precio_bruto_litro no existe.';
  END IF;

  -- 5.3 El bucket existe y es privado.
  SELECT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'hato-liquidaciones-fotos' AND public = false
  ) INTO v_bucket_existe;
  IF NOT v_bucket_existe THEN
    RAISE EXCEPTION '085 ABORTADA: el bucket hato-liquidaciones-fotos no existe o quedó público.';
  END IF;

  SELECT count(*) INTO v_politicas
    FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND policyname LIKE 'Hato: % fotos de liquidacion';
  IF v_politicas <> 4 THEN
    RAISE EXCEPTION '085 ABORTADA: se esperaban 4 políticas sobre el bucket de liquidaciones, hay %.', v_politicas;
  END IF;

  -- 5.4 fn_hato_guardar_quincena_venta: anon sin EXECUTE, authenticated
  --     con EXECUTE, search_path fijado (public, pg_temp, pg_temp al final).
  SELECT has_function_privilege('anon', 'fn_hato_guardar_quincena_venta(jsonb)', 'EXECUTE') INTO v_grant_anon;
  SELECT has_function_privilege('authenticated', 'fn_hato_guardar_quincena_venta(jsonb)', 'EXECUTE') INTO v_grant_auth;
  IF v_grant_anon THEN
    RAISE EXCEPTION '085 ABORTADA: anon conserva EXECUTE sobre fn_hato_guardar_quincena_venta.';
  END IF;
  IF NOT v_grant_auth THEN
    RAISE EXCEPTION '085 ABORTADA: authenticated perdió EXECUTE sobre fn_hato_guardar_quincena_venta.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
     WHERE cfg ILIKE 'search_path=%public%' AND cfg ILIKE '%pg_temp%'
  ) INTO v_search_path_ok
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_hato_guardar_quincena_venta';
  IF NOT v_search_path_ok THEN
    RAISE EXCEPTION '085 ABORTADA: fn_hato_guardar_quincena_venta no tiene search_path=public, pg_temp fijado.';
  END IF;

  RAISE NOTICE '085 OK: retencion_ica_leche=%, precio_bruto_litro creada, bucket hato-liquidaciones-fotos privado con 4 políticas, fn_hato_guardar_quincena_venta reemplazada (anon sin EXECUTE, search_path fijado).', v_config_valor;
END $$;


-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- No hay DML sobre filas existentes que revertir (todas las filas de
-- hato_produccion_quincenal/fin_ingresos anteriores a esta migración son
-- derivado_mensual, nunca tocadas por este RPC). Revertir es: devolver la
-- función a su versión de la migración 070 (copiar su CREATE OR REPLACE
-- tal cual desde ese archivo -- el contrato de payload volvería a
-- 'fin_ingreso.valor'), quitar la columna nueva, borrar la clave de
-- config y las políticas/bucket de Storage.
--
--   -- 1. Restaurar fn_hato_guardar_quincena_venta: pegar el CREATE OR
--   --    REPLACE completo de 070_hato_produccion_venta_link.sql (sección 3).
--
--   -- 2. Columna nueva:
--   ALTER TABLE hato_produccion_quincenal
--     DROP CONSTRAINT IF EXISTS hato_prod_quincenal_precio_bruto_no_negativo;
--   ALTER TABLE hato_produccion_quincenal DROP COLUMN IF EXISTS precio_bruto_litro;
--
--   -- 3. Config:
--   DELETE FROM hato_config WHERE clave = 'retencion_ica_leche';
--
--   -- 4. Storage:
--   DROP POLICY IF EXISTS "Hato: subir fotos de liquidacion" ON storage.objects;
--   DROP POLICY IF EXISTS "Hato: leer fotos de liquidacion" ON storage.objects;
--   DROP POLICY IF EXISTS "Hato: actualizar fotos de liquidacion" ON storage.objects;
--   DROP POLICY IF EXISTS "Hato: eliminar fotos de liquidacion" ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'hato-liquidaciones-fotos';
-- =====================================================================
