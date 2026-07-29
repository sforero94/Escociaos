-- =====================================================================
-- 070: Vínculo Producción (hato) <-> Finanzas para la venta quincenal de
--      leche y para las ventas de animales del hato (terneros / descarte).
-- Fecha: 2026-07-28
--
-- Parte de SOW 1 del rework del submódulo Producción — plan
-- docs/plan_hato_produccion_rework.md §2/§3. Decisiones del dueño §0
-- (grano quincenal, vínculo duro bidireccional, un solo registro repartido
-- en dos tablas por dueño de dato).
--
-- Toca fin_ingresos en UNA sola forma, deliberada y acotada: agrega la
-- columna aditiva y nullable `cabezas` (sección 0, primer statement de
-- este archivo). Esto relaxa la LETRA de la regla original del brief
-- ("070 no toca fin_ingresos") pero preserva su INTENCIÓN por completo:
-- esa regla existe para que el P&G, el Flujo de Caja y su port Deno
-- (reportes-financieros.ts) queden byte-idénticos por construcción --
-- ninguno de los tres selecciona `cabezas` (calculosPyG.ts,
-- calculosFlujoCaja.ts), así que una columna nueva y nullable que ningún
-- motor lee no cambia ningún total ni ninguna línea de reporte. La
-- alternativa (SQL dinámico vía EXECUTE...USING para diferir la
-- resolución de la columna hasta que 071 la creara) convertía un error de
-- migración en un error de runtime a mitad de un formulario -- corregido
-- tras revisión: mejor un DDL estático que falla ruidosamente al aplicar
-- la migración, que nunca. Ni RLS ni filas de fin_ingresos se tocan aquí
-- (071 sigue siendo la única migración que escribe filas de fin_ingresos
-- vía DML de migración, acotada a categoria_id en 6 ids).
--
-- No hay columnas GENERATED en esta migración (lección de la 061:
-- hato_pesajes_leche.litros_total nació GENERATED bajo una suposición
-- falsa y hubo que hacerle DROP EXPRESSION). Stored vs. derived por
-- columna, documentado inline.
--
-- RLS: ninguna política nueva (plan §2.1, tabla "RLS"). hato_produccion_
-- quincenal conserva las de 054 (SELECT authenticated / escritura
-- Administrador+Gerencia); fin_ingresos conserva las de
-- create_finanzas_tables.sql (Gerencia-only). "Solo Gerencia captura
-- quincenales" EMERGE de la intersección de esas dos políticas dentro de
-- los RPC SECURITY INVOKER de abajo — no se inventa una policy nueva.
--
-- Camino de escritura (plan §3): tres RPC plpgsql, LAS TRES
-- SECURITY INVOKER (default de plpgsql, escrito explícito aquí para que
-- quede imposible de confundir con DEFINER). El llamador es un navegador
-- Gerencia ya autenticado con escritura RLS en las dos tablas -- lo único
-- que falta es atomicidad, y eso lo da la función, NO un DEFINER. Un
-- DEFINER aquí forzaría reimplementar "es Gerencia" adentro de la función,
-- duplicando la política SQL que ya existe (plan §3.1, opción C rechazada).
--
-- SIN TRIGGER en fin_ingresos -- corrección sobre DOS revisiones
-- anteriores de este archivo, que sí tenían un trigger inverso
-- (`fn_hato_sync_quincena_desde_ingreso`, SECURITY DEFINER). Se eliminó
-- por decisión del dueño, sobre tres hechos que invalidaron el diseño:
--   (a) Ese trigger es AFTER UPDATE -- nunca cubrió el requisito real del
--       dueño ("agrego un ingreso en Finanzas y aparece en Producción",
--       un CREATE). Solo mantenía sincronizado un par YA enlazado; nunca
--       resolvió el caso que el dueño pidió.
--   (b) La justificación original de "esto podría filtrarle ingresos del
--       Hato a Martha (Administrador)" (plan §2.0) era FÁCTICAMENTE
--       INCORRECTA: Martha Vega es Gerencia en producción, no
--       Administrador. Los dos únicos Administrador reales (David García,
--       "Santiago Admin") tienen modulos_acceso = ['aguacate'] y ni
--       siquiera pueden entrar al módulo Hato. No hay a quién filtrarle
--       nada.
--   (c) Decisión explícita del dueño: el bloque de ventas es
--       Gerencia-only para VER (eso sigue en pie, es un gate de UI en
--       SOW 5, no de esta migración), y NO debe existir mecanismo de
--       sincronización -- "simple, clean is always best".
-- La garantía de "un solo registro" ahora es ESTRUCTURAL, no sincronizada:
-- hato_produccion_quincenal.fin_ingreso_id es NOT NULL (sección 1) y, para
-- una fila MEDIDA, los litros NO se guardan dos veces -- se leen a través
-- del FK (ver la nota de litros_total más abajo). Sin una segunda copia
-- del dato, no hay ventana en la que las dos mitades puedan divergir; es
-- una garantía estrictamente más fuerte que cualquier trigger de
-- sincronización, porque no depende de que el trigger se dispare, no
-- falle, ni cubra todos los caminos de escritura.
--
-- fin_ingresos.fecha vs. hato_produccion_quincenal.anio/mes/quincena --
-- decisión del dueño, corrección sobre una asunción del brief original:
-- el Pomar paga la quincena DESPUÉS de que cierra (una quincena que cubre
-- los días 1-15 se puede pagar el día 20 o más tarde), así que la fecha
-- de pago del ingreso y el periodo de producción de la quincena son DOS
-- HECHOS DISTINTOS sobre DOS EVENTOS DISTINTOS -- ninguno determina al
-- otro, y no tiene sentido exigir que la fecha de pago "caiga dentro" del
-- periodo que produjo la leche. El histórico lo confirma: de 44 filas
-- mensuales, solo 7 caen en un límite real de mes; el resto están
-- fechadas día 21, día 28, fin de mes -- fechas de pago, no de
-- producción. El RPC de captura (sección 3) no valida la fecha contra el
-- periodo; lo único que debe seguir siendo único es el PERIODO DE
-- PRODUCCIÓN (UNIQUE(anio, mes, quincena), 054).
--
-- Idempotente: seguro de re-ejecutar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. fin_ingresos.cabezas -- columna dedicada para el conteo de cabezas
--    de una venta de animales del hato (terneros/descarte, RPC 3/3 más
--    abajo), NUNCA sobrecargada sobre `cantidad` (que ya significa litros
--    para leche o kg para aguacate según el negocio -- una tercera unidad
--    no declarada ahí sería la misma clase de bug que
--    calculosCostoKg.ts:41). Nullable: toda fila que no sea una venta de
--    animales del hato (leche, aguacate, ganado de ceba, etc.) la deja
--    NULL -- "sin dato", nunca 0 ni un valor fabricado. El CHECK admite
--    NULL libremente (una comparación contra NULL nunca viola un CHECK) y
--    solo exige que, cuando SÍ hay un valor, sea positivo.
--
--    Se agrega AQUÍ, como primer statement de 070 (no en 071, donde vivió
--    en una revisión anterior), para que la función `fn_hato_registrar_
--    venta_animales` de la sección 5 pueda referenciarla con un INSERT
--    ESTÁTICO normal: la columna ya existe en el mismo archivo, antes de
--    que ese CREATE FUNCTION se ejecute, así que Postgres la valida al
--    aplicar la migración (con check_function_bodies=on, el default) en
--    vez de fallar en el primer llamado real del RPC, a mitad de un
--    formulario, con un mensaje de columna inexistente.
-- ---------------------------------------------------------------------

ALTER TABLE fin_ingresos
  ADD COLUMN IF NOT EXISTS cabezas INTEGER CHECK (cabezas > 0);

-- ---------------------------------------------------------------------
-- 1. hato_produccion_quincenal: enlace + procedencia del dato
-- ---------------------------------------------------------------------
--
-- fin_ingreso_id      STORED (FK). Vínculo duro -- nada en la fila
--                     quincenal permite derivarlo. NOT NULL porque la
--                     decisión 3 del dueño dice "un solo registro": una
--                     quincena sin su contraparte financiera ES la
--                     divergencia que la decisión prohíbe.
-- origen_dato         STORED. Flag medido-vs-derivado. TEXT + CHECK, no
--                     boolean (precedente clima_resumen_diario.
--                     lluvia_confianza, 068), para que un tercer valor
--                     futuro sea una migración de un renglón. No
--                     derivable de `fuente`: fuente dice DE DÓNDE vino la
--                     fila (web/telegram/backfill), origen_dato dice si
--                     la CIFRA fue medida -- dos preguntas distintas.
-- num_vacas_ordeno_origen STORED. num_vacas_ordeno ya existía (054) y
--                     sigue siendo stored; falta su procedencia: en el
--                     backfill lo deriva el motor reproductivo desde
--                     chequeos, hacia adelante lo digita Gerencia. Sin
--                     esta columna la UI no puede cumplir la decisión 16
--                     ("marcado como derivado, no medido").
-- updated_at/by       STORED. La fila es ahora un registro financiero
--                     editable por DOS caminos (Producción y Finanzas).
--                     Poblados por el RPC de la sección 3 -- esta tabla
--                     nunca instaló update_updated_at_column() de
--                     finanzas, y NO hay trigger (ver la nota "SIN
--                     TRIGGER" de la cabecera del archivo).
-- litros_total        CAMBIA DE SIGNIFICADO según origen_dato -- ya NO es
--                     "los litros de esta quincena" para toda fila.
--                     Existía desde 054 como NOT NULL; esta migración le
--                     quita el NOT NULL y agrega el CHECK de
--                     correspondencia de más abajo. Ver el comentario de
--                     columna (COMMENT ON COLUMN) para el detalle
--                     completo -- resumen: NULL para 'medido' (los
--                     litros reales viven en fin_ingresos.cantidad, leídos
--                     a través de fin_ingreso_id), NOT NULL para
--                     'derivado_mensual' (el reparto del backfill no
--                     tiene dónde más vivir).
--
-- Deliberadamente NO se agrega: ninguna columna de dinero (plan §2.0),
-- precio_unitario (ya vive en fin_ingresos, se deriva en el render),
-- productividad L/vaca (calcularProductividad() ya la deriva, nunca 0),
-- ni una columna para el reparto del backfill aparte de litros_total
-- (arriba) -- el método de partición 15/N días sigue siendo una constante
-- de un backfill único, documentada en esa migración + notas de cada fila.
-- ---------------------------------------------------------------------

ALTER TABLE hato_produccion_quincenal
  ADD COLUMN IF NOT EXISTS fin_ingreso_id UUID
      REFERENCES fin_ingresos(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS origen_dato TEXT NOT NULL DEFAULT 'medido'
      CHECK (origen_dato IN ('medido', 'derivado_mensual')),
  ADD COLUMN IF NOT EXISTS num_vacas_ordeno_origen TEXT
      CHECK (num_vacas_ordeno_origen IN ('medido', 'derivado_chequeos')),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

-- La tabla está VACÍA hoy (0 filas, verificado en el brief). El NOT NULL
-- se puede poner de entrada, sin ventana de filas huérfanas. Si al aplicar
-- esta migración la tabla NO estuviera vacía, este statement falla
-- ruidosamente -- que es lo correcto (nunca una quincena sin contraparte
-- financiera silenciosa).
ALTER TABLE hato_produccion_quincenal
  ALTER COLUMN fin_ingreso_id SET NOT NULL;

-- 1:1 SOLO para las filas medidas (hacia adelante). Las derivadas del
-- backfill (SOW 4) enlazan muchos-a-uno al mismo ingreso mensual, por eso
-- el índice es PARCIAL -- mismo mecanismo que 066 usó para la chapeta.
CREATE UNIQUE INDEX IF NOT EXISTS hato_prod_quincenal_ingreso_medido_unico
  ON hato_produccion_quincenal (fin_ingreso_id)
  WHERE origen_dato = 'medido';

-- Índice llano (NO parcial): lo necesita la búsqueda inversa
-- ingreso -> quincenas y la verificación del FK ON DELETE RESTRICT, que
-- también recorre las filas derivadas (muchas quincenas por ingreso).
CREATE INDEX IF NOT EXISTS idx_hato_prod_quincenal_ingreso
  ON hato_produccion_quincenal (fin_ingreso_id);

-- Una fila declara CÓMO se derivó su num_vacas_ordeno, o lo deja NULL.
-- Nunca un número sin procedencia (regla "sin dato, nunca 0" aplicada a
-- procedencia, no solo a valor).
ALTER TABLE hato_produccion_quincenal
  DROP CONSTRAINT IF EXISTS hato_prod_quincenal_vacas_origen_coherente;
ALTER TABLE hato_produccion_quincenal
  ADD CONSTRAINT hato_prod_quincenal_vacas_origen_coherente
  CHECK (num_vacas_ordeno IS NULL OR num_vacas_ordeno_origen IS NOT NULL);

-- litros_total deja de ser NOT NULL: para una fila MEDIDA los litros ya
-- no se guardan aquí (viven en fin_ingresos.cantidad, leídos a través de
-- fin_ingreso_id -- decisión del dueño, ver la nota "SIN TRIGGER" de la
-- cabecera del archivo: "un solo registro" ahora es estructural, no
-- sincronizado). La tabla está VACÍA hoy (mismo hecho verificado que
-- justifica el NOT NULL de fin_ingreso_id más arriba), así que quitar el
-- NOT NULL no puede fallar por datos existentes.
ALTER TABLE hato_produccion_quincenal
  ALTER COLUMN litros_total DROP NOT NULL;

-- Correspondencia exacta origen_dato <-> litros_total -- nunca los dos
-- valores posibles a la vez, nunca ninguno. Una fila MEDIDA con
-- litros_total poblado sería una segunda copia del dato que puede
-- divergir de fin_ingresos.cantidad (justo lo que se eliminó al quitar el
-- trigger); una fila DERIVADO_MENSUAL sin litros_total perdería el
-- reparto del backfill sin ningún otro lugar donde recuperarlo.
ALTER TABLE hato_produccion_quincenal
  DROP CONSTRAINT IF EXISTS hato_prod_quincenal_litros_origen_coherente;
ALTER TABLE hato_produccion_quincenal
  ADD CONSTRAINT hato_prod_quincenal_litros_origen_coherente
  CHECK (
    (origen_dato = 'medido' AND litros_total IS NULL)
    OR (origen_dato = 'derivado_mensual' AND litros_total IS NOT NULL)
  );

COMMENT ON COLUMN hato_produccion_quincenal.litros_total IS
  'NO es "los litros de esta quincena" para toda fila -- es la partición '
  'del backfill mensual (SOW 4), STORED solo cuando '
  'origen_dato=''derivado_mensual'' (esa fila referencia un fin_ingresos '
  'MENSUAL que no tiene una contraparte de quincena propia, así que su '
  'reparto 15/N días debe guardarse en algún lado). Para '
  'origen_dato=''medido'' es NULL a propósito: los litros reales viven en '
  'fin_ingresos.cantidad, leídos a través de fin_ingreso_id (NOT NULL) -- '
  'una sola copia del dato, nunca dos que puedan divergir. Para leer los '
  'litros de una fila medida, hace el JOIN/select anidado contra '
  'fin_ingresos por fin_ingreso_id -- nunca esta columna.';

-- ---------------------------------------------------------------------
-- 2. hato_eventos: enlace al ingreso de una venta de animales
-- ---------------------------------------------------------------------
--
-- fin_ingreso_id  STORED (FK). N animales -> 1 fila de fin_ingresos; el
--                 evento es la capa "muchos". ON DELETE SET NULL, igual
--                 que transaccion_ganado_id (053, línea 166): corregir el
--                 registro financiero no borra el hecho de que el animal
--                 salió del hato.
-- ---------------------------------------------------------------------

ALTER TABLE hato_eventos
  ADD COLUMN IF NOT EXISTS fin_ingreso_id UUID
      REFERENCES fin_ingresos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hato_eventos_fin_ingreso
  ON hato_eventos (fin_ingreso_id) WHERE fin_ingreso_id IS NOT NULL;

-- =====================================================================
-- 3. RPC 1/3 -- fn_hato_guardar_quincena_venta(payload jsonb)
--
--    Find-or-create de fin_ingresos (negocio Hato Lechero, categoría de
--    leche resuelta por NOMBRE -- nunca UUID hardcodeado, precedente
--    NEGOCIO_GANADO en IngresosList.tsx) + UPDATE-por-id-o-INSERT de la
--    quincena, enlazadas. origen_dato='medido' siempre (una quincena
--    derivada del backfill es read-only y nunca pasa por este RPC --
--    rechazo explícito más abajo si el llamador intenta editar una).
--
--    Payload (jsonb):
--      {
--        "quincena_id": uuid | null,   -- null => alta; presente => edita
--                                      -- esa fila (debe ser 'medido')
--        "anio": int, "mes": int, "quincena": 1 | 2,
--        "fecha_inicio": date | null, "fecha_fin": date | null,
--        "litros_total": numeric,   -- NUNCA se guarda en hato_produccion_
--                                    -- quincenal.litros_total (esa columna
--                                    -- es NULL para origen_dato='medido',
--                                    -- ver COMMENT ON COLUMN de la sección
--                                    -- 1) -- solo alimenta fin_ingresos.
--                                    -- cantidad/precio_unitario más abajo.
--        "litros_pomar_confirmado": numeric | null,
--        "num_vacas_ordeno": int | null,
--        "notas": text | null,
--        "fin_ingreso": {
--          "fecha": date, "valor": numeric,
--          "region_id": uuid, "medio_pago_id": uuid,
--          "comprador_id": uuid | null, "nombre": text | null
--        }
--      }
--
--    UPDATE-por-id-o-INSERT (nunca upsert de PostgREST, precedente
--    useProduccionHato.ts / CapturaCosechaGrid): "quincena_id" presente
--    decide edición; ausente/null decide alta. Un alta que colisiona con
--    UNIQUE(anio, mes, quincena) falla con 23505 explícito -- no se
--    silencia, ni se convierte en upsert.
--
--    El PERIODO (anio/mes/quincena) de una quincena existente ES
--    EDITABLE -- decisión del dueño (ver cabecera del archivo): la fecha
--    de pago de fin_ingresos y el periodo de producción de
--    hato_produccion_quincenal son dos hechos distintos sobre dos eventos
--    distintos (cuándo se produjo vs. cuándo el Pomar pagó), y ninguno
--    determina al otro. El único guard que queda es de negocio real: el
--    periodo destino no puede coincidir con el de OTRA fila -- eso sí
--    sería un duplicado del periodo de producción, no una corrección.
--    UNIQUE(anio, mes, quincena) lo atraparía de todas formas (23505),
--    pero el guard de abajo da un mensaje legible que nombra el periodo
--    en conflicto ANTES de tocar nada.
--
--    RETURNS jsonb: { "quincenaId": uuid, "finIngresoId": uuid }.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_hato_guardar_quincena_venta(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER   -- default de plpgsql, explícito a propósito (plan §3.2):
SET search_path = public
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
  v_ing_valor NUMERIC := (v_ingreso ->> 'valor')::NUMERIC;
  v_ing_region_id UUID := (v_ingreso ->> 'region_id')::UUID;
  v_ing_medio_pago_id UUID := (v_ingreso ->> 'medio_pago_id')::UUID;
  v_ing_comprador_id UUID := NULLIF(v_ingreso ->> 'comprador_id', '')::UUID;
  v_ing_nombre TEXT := NULLIF(v_ingreso ->> 'nombre', '');
  v_negocio_id UUID;
  v_categoria_id UUID;
  v_fin_ingreso_id UUID;
  v_existente RECORD;
BEGIN
  -- ---- Validación de payload (antes de cualquier escritura) ----------
  IF v_anio IS NULL OR v_mes IS NULL OR v_quincena IS NULL THEN
    RAISE EXCEPTION 'fn_hato_guardar_quincena_venta: anio/mes/quincena son requeridos';
  END IF;
  IF v_litros_total IS NULL OR v_litros_total < 0 THEN
    RAISE EXCEPTION 'fn_hato_guardar_quincena_venta: litros_total es requerido y debe ser >= 0';
  END IF;
  IF v_ingreso IS NULL OR v_ing_fecha IS NULL OR v_ing_valor IS NULL
     OR v_ing_region_id IS NULL OR v_ing_medio_pago_id IS NULL THEN
    RAISE EXCEPTION 'fn_hato_guardar_quincena_venta: payload.fin_ingreso requiere fecha, valor, region_id y medio_pago_id (fin_ingresos NOT NULL, CLAUDE.md R5)';
  END IF;
  IF v_ing_valor <= 0 THEN
    RAISE EXCEPTION 'fn_hato_guardar_quincena_venta: payload.fin_ingreso.valor debe ser > 0 (CHECK de fin_ingresos) -- una quincena sin valor confirmado no se puede guardar todavía (plan §2.3, consecuencia deliberada)';
  END IF;

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
    -- El PERIODO (anio/mes/quincena) SÍ se puede mover -- decisión del
    -- dueño: la fecha de pago (fin_ingresos.fecha) y el periodo de
    -- producción (hato_produccion_quincenal.anio/mes/quincena) son dos
    -- hechos distintos y no hay trigger que compare uno contra otro (ver
    -- la nota "SIN TRIGGER" de la cabecera del archivo), así que no hay
    -- carrera que evitar aquí. El único guard real: el periodo destino no
    -- puede coincidir con el de OTRA fila -- eso sí sería un duplicado
    -- del periodo de producción. UNIQUE(anio, mes, quincena) lo
    -- atraparía de todas formas (23505), pero este IF da un mensaje
    -- legible que nombra el conflicto ANTES de tocar nada.
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
        valor = v_ing_valor,
        medio_pago_id = v_ing_medio_pago_id,
        cantidad = v_litros_total,
        precio_unitario = CASE WHEN v_litros_total > 0 THEN ROUND(v_ing_valor / v_litros_total, 2) END
    WHERE id = v_fin_ingreso_id;

    -- litros_total NO se escribe aquí (columna NULL para 'medido', ver
    -- COMMENT ON COLUMN en la sección 1): los litros ya quedaron en
    -- fin_ingresos.cantidad, arriba -- una sola copia. anio/mes/quincena
    -- SÍ se reescriben (el periodo es editable); fecha_inicio/fecha_fin
    -- vienen del payload, que el llamador computa vía
    -- rangoQuincena(anio, mes, quincena) para el periodo DESTINO -- nunca
    -- una segunda aritmética de quincenas en SQL, mismo criterio que el
    -- resto del módulo.
    UPDATE hato_produccion_quincenal
    SET anio = v_anio,
        mes = v_mes,
        quincena = v_quincena,
        fecha_inicio = v_fecha_inicio,
        fecha_fin = v_fecha_fin,
        litros_pomar_confirmado = v_litros_pomar,
        num_vacas_ordeno = v_num_vacas,
        num_vacas_ordeno_origen = v_num_vacas_origen,
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
      v_ing_valor, v_ing_medio_pago_id, v_litros_total,
      CASE WHEN v_litros_total > 0 THEN ROUND(v_ing_valor / v_litros_total, 2) END,
      auth.uid()
    )
    RETURNING id INTO v_fin_ingreso_id;

    -- litros_total NO se incluye en esta lista de columnas -- toda fila
    -- que este RPC crea es origen_dato='medido', y el CHECK de la sección
    -- 1 exige litros_total IS NULL para esas filas (los litros viven en
    -- fin_ingresos.cantidad, arriba). Incluirla aquí violaría ese CHECK.
    INSERT INTO hato_produccion_quincenal (
      anio, mes, quincena, fecha_inicio, fecha_fin,
      litros_pomar_confirmado, num_vacas_ordeno, num_vacas_ordeno_origen,
      notas, fuente, origen_dato, fin_ingreso_id, created_by, updated_at, updated_by
    )
    VALUES (
      v_anio, v_mes, v_quincena, v_fecha_inicio, v_fecha_fin,
      v_litros_pomar, v_num_vacas, v_num_vacas_origen,
      v_notas, 'web', 'medido', v_fin_ingreso_id, auth.uid(), NOW(), auth.uid()
    )
    RETURNING id INTO v_quincena_id;
  END IF;

  RETURN jsonb_build_object('quincenaId', v_quincena_id, 'finIngresoId', v_fin_ingreso_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_hato_guardar_quincena_venta(JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_hato_guardar_quincena_venta(JSONB) TO authenticated;

COMMENT ON FUNCTION fn_hato_guardar_quincena_venta(JSONB) IS
  'SECURITY INVOKER: escritura atómica del "registro único" quincena+ingreso '
  '(plan_hato_produccion_rework.md §3.2). El caller es un navegador Gerencia '
  'autenticado; la RLS de fin_ingresos (Gerencia-only) y de '
  'hato_produccion_quincenal (Administrador+Gerencia) siguen aplicando dentro '
  'de esta función -- un Administrador que la invoque recibe un error de '
  'política de fin_ingresos, no un bypass. Rechaza edición sobre filas '
  'origen_dato=''derivado_mensual'' (read-only, backfill).';

-- =====================================================================
-- 4. RPC 2/3 -- fn_hato_eliminar_quincena_venta(p_quincena_id uuid)
--
--    Borra la quincena medida Y su ingreso, en una transacción (plan §2.1
--    "Semántica de DELETE"). Único camino de borrado de una quincena
--    medida: el ingreso NO se puede borrar solo desde /finanzas/ingresos
--    (ON DELETE RESTRICT del FK, sección 1) -- ese camino queda bloqueado
--    a propósito, con un mensaje humano capturado en IngresosList.tsx (SOW 3).
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_hato_eliminar_quincena_venta(p_quincena_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER   -- default de plpgsql, explícito a propósito (plan §3.2)
SET search_path = public
AS $$
DECLARE
  v_fila RECORD;
BEGIN
  SELECT id, fin_ingreso_id, origen_dato INTO v_fila
  FROM hato_produccion_quincenal
  WHERE id = p_quincena_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_hato_eliminar_quincena_venta: no existe la quincena %', p_quincena_id;
  END IF;
  IF v_fila.origen_dato <> 'medido' THEN
    RAISE EXCEPTION 'fn_hato_eliminar_quincena_venta: la quincena % es derivado_mensual (backfill) y no se puede eliminar desde Producción -- el ingreso mensual histórico nunca se reescribe (Decisión 4 del dueño)', p_quincena_id;
  END IF;

  -- Se borra primero la fila hija (quincena) que referencia el ingreso:
  -- el FK ON DELETE RESTRICT de la sección 1 solo bloquea un DELETE
  -- directo sobre fin_ingresos mientras exista una fila que lo referencie.
  DELETE FROM hato_produccion_quincenal WHERE id = p_quincena_id;
  DELETE FROM fin_ingresos WHERE id = v_fila.fin_ingreso_id;

  RETURN jsonb_build_object('quincenaId', p_quincena_id, 'finIngresoId', v_fila.fin_ingreso_id, 'eliminado', TRUE);
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_hato_eliminar_quincena_venta(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_hato_eliminar_quincena_venta(UUID) TO authenticated;

COMMENT ON FUNCTION fn_hato_eliminar_quincena_venta(UUID) IS
  'SECURITY INVOKER: borra una quincena MEDIDA y su fin_ingresos en una sola '
  'transacción (plan_hato_produccion_rework.md §2.1). Rechaza filas '
  'origen_dato=''derivado_mensual''. Único camino de borrado -- el ingreso NO '
  'se puede borrar directo desde /finanzas/ingresos (FK ON DELETE RESTRICT).';

-- =====================================================================
-- 5. RPC 3/3 -- fn_hato_registrar_venta_animales(payload jsonb)
--
--    Inserta fin_ingresos (categoría terneros O descarte según el
--    payload, resuelta por nombre) + N hato_eventos tipo 'venta' con
--    fin_ingreso_id + UPDATE hato_animales estado='vendida' para los
--    animales enlazados (decisión 6 del dueño: el vínculo de animal es
--    OPCIONAL, N puede ser 0).
--
--    Payload (jsonb):
--      {
--        "tipo": "terneros" | "descarte",
--        "cabezas": int (>=1), "valor": numeric (>0), "fecha": date,
--        "region_id": uuid, "medio_pago_id": uuid,
--        "comprador_id": uuid | null, "nombre": text | null,
--        "animal_ids": uuid[] | null
--      }
--
--    RETURNS jsonb: { "finIngresoId": uuid, "animalesActualizados": int }.
--
--    `cabezas` (columna dedicada, sección 0 de este mismo archivo) NUNCA
--    `cantidad`: cantidad ya tiene un significado fijo por negocio
--    (litros para leche, kg para aguacate) y la decisión 6 del dueño
--    exige capturar cabezas SIEMPRE, incluso sin animal_ids --
--    sobrecargar cantidad con una tercera unidad no declarada es la misma
--    clase de bug que calculosCostoKg.ts:41. Al vivir `cabezas` en la
--    sección 0 de ESTE archivo (antes que este CREATE FUNCTION), el
--    INSERT de abajo es estático y normal -- Postgres la valida al
--    aplicar la migración, no en el primer llamado real del RPC.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_hato_registrar_venta_animales(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER   -- default de plpgsql, explícito a propósito (plan §3.2)
SET search_path = public
AS $$
DECLARE
  v_tipo TEXT := payload ->> 'tipo';
  v_cabezas INTEGER := (payload ->> 'cabezas')::INTEGER;
  v_valor NUMERIC := (payload ->> 'valor')::NUMERIC;
  v_fecha DATE := (payload ->> 'fecha')::DATE;
  v_region_id UUID := (payload ->> 'region_id')::UUID;
  v_medio_pago_id UUID := (payload ->> 'medio_pago_id')::UUID;
  v_comprador_id UUID := NULLIF(payload ->> 'comprador_id', '')::UUID;
  v_nombre TEXT := NULLIF(payload ->> 'nombre', '');
  v_animal_ids UUID[];
  v_negocio_id UUID;
  v_categoria_id UUID;
  v_categoria_patron TEXT;
  v_fin_ingreso_id UUID;
  v_animal_id UUID;
  v_actualizados INTEGER := 0;
BEGIN
  IF v_tipo NOT IN ('terneros', 'descarte') THEN
    RAISE EXCEPTION 'fn_hato_registrar_venta_animales: payload.tipo debe ser ''terneros'' o ''descarte'' (recibido: %)', v_tipo;
  END IF;
  IF v_cabezas IS NULL OR v_cabezas < 1 THEN
    RAISE EXCEPTION 'fn_hato_registrar_venta_animales: payload.cabezas es requerido y debe ser >= 1';
  END IF;
  IF v_valor IS NULL OR v_valor <= 0 THEN
    RAISE EXCEPTION 'fn_hato_registrar_venta_animales: payload.valor es requerido y debe ser > 0 (CHECK de fin_ingresos)';
  END IF;
  IF v_fecha IS NULL OR v_region_id IS NULL OR v_medio_pago_id IS NULL THEN
    RAISE EXCEPTION 'fn_hato_registrar_venta_animales: fecha, region_id y medio_pago_id son requeridos (fin_ingresos NOT NULL)';
  END IF;

  SELECT id INTO v_negocio_id FROM fin_negocios WHERE nombre = 'Hato Lechero' LIMIT 1;
  IF v_negocio_id IS NULL THEN
    RAISE EXCEPTION 'fn_hato_registrar_venta_animales: no existe el negocio "Hato Lechero" en fin_negocios';
  END IF;

  -- Resolución por NOMBRE, nunca UUID hardcodeado (precedente
  -- NEGOCIO_GANADO, IngresosList.tsx). "descarte" matchea la categoría
  -- sembrada por 071 ("Venta de Vacas de Descarte"); "terneros" matchea
  -- cualquier categoría activa que contenga esa palabra.
  v_categoria_patron := CASE WHEN v_tipo = 'descarte' THEN '%descarte%' ELSE '%ternero%' END;
  SELECT id INTO v_categoria_id
  FROM fin_categorias_ingresos
  WHERE negocio_id = v_negocio_id AND nombre ILIKE v_categoria_patron AND activo
  ORDER BY nombre
  LIMIT 1;
  IF v_categoria_id IS NULL THEN
    RAISE EXCEPTION 'fn_hato_registrar_venta_animales: no hay categoría de ingreso activa que contenga "%" bajo el negocio Hato Lechero -- configúrala en Finanzas antes de registrar esta venta', v_categoria_patron;
  END IF;

  IF v_nombre IS NULL THEN
    v_nombre := 'Venta ' || v_tipo || ' (' || v_cabezas || ' cabezas)';
  END IF;

  -- `cabezas` (columna dedicada, sección 0 de este archivo) NUNCA
  -- `cantidad`: cantidad ya tiene un significado por-negocio establecido
  -- (litros para leche, kg para aguacate) y sobrecargarla con una tercera
  -- unidad no declarada es la misma clase de bug que
  -- calculosCostoKg.ts:41. cantidad queda NULL en una venta de animales:
  -- no hay litros ni kg que reportar aquí.
  INSERT INTO fin_ingresos (
    fecha, negocio_id, region_id, categoria_id, nombre, comprador_id,
    valor, medio_pago_id, cabezas, created_by
  )
  VALUES (
    v_fecha, v_negocio_id, v_region_id, v_categoria_id, v_nombre, v_comprador_id,
    v_valor, v_medio_pago_id, v_cabezas, auth.uid()
  )
  RETURNING id INTO v_fin_ingreso_id;

  -- animal_ids es OPCIONAL (decisión 6 del dueño): un arreglo vacío o
  -- ausente es una venta de N cabezas sin vínculo de animal específico.
  v_animal_ids := COALESCE(
    (SELECT array_agg((value)::UUID) FROM jsonb_array_elements_text(COALESCE(payload -> 'animal_ids', '[]'::jsonb))),
    '{}'
  );

  FOREACH v_animal_id IN ARRAY v_animal_ids
  LOOP
    INSERT INTO hato_eventos (
      animal_id, tipo, fecha, fecha_confianza, fin_ingreso_id, fuente, datos, created_by
    )
    VALUES (
      v_animal_id, 'venta', v_fecha, 'exacta', v_fin_ingreso_id, 'web',
      jsonb_build_object('tipo_venta', v_tipo, 'cabezas_transaccion', v_cabezas, 'valor_transaccion', v_valor),
      auth.uid()
    );

    UPDATE hato_animales SET estado = 'vendida', fecha_estado = v_fecha
    WHERE id = v_animal_id AND estado = 'activa';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'fn_hato_registrar_venta_animales: el animal % no existe o ya no está activo -- no se puede vender', v_animal_id;
    END IF;

    v_actualizados := v_actualizados + 1;
  END LOOP;

  RETURN jsonb_build_object('finIngresoId', v_fin_ingreso_id, 'animalesActualizados', v_actualizados);
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_hato_registrar_venta_animales(JSONB) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION fn_hato_registrar_venta_animales(JSONB) TO authenticated;

COMMENT ON FUNCTION fn_hato_registrar_venta_animales(JSONB) IS
  'SECURITY INVOKER: registra una venta de animales del hato (terneros o '
  'descarte, decisión 7 del dueño) como fin_ingresos + N hato_eventos ''venta'' '
  '+ hato_animales.estado=''vendida'' para los animales enlazados (el vínculo '
  'es OPCIONAL, N puede ser 0). Distinto del camino fin_transacciones_ganado '
  '+ es_hato (SOW 0), reservado para compras y para el registro de muerte.';

-- =====================================================================
-- 6. SIN trigger inverso -- decisión del dueño, corrección sobre DOS
--    revisiones anteriores de este archivo que sí tenían
--    `fn_hato_sync_quincena_desde_ingreso` / `trg_hato_sync_quincena_
--    desde_ingreso` (SECURITY DEFINER, Finanzas -> Producción).
--
--    Se elimina por tres hechos que invalidaron el diseño (ver también la
--    nota "SIN TRIGGER" de la cabecera del archivo, sección 0):
--      (a) El requisito real del dueño para SOW 1 es "agrego un ingreso
--          en Finanzas y aparece en Producción" -- un CREATE. Un trigger
--          AFTER UPDATE nunca cubrió eso; solo mantenía sincronizado un
--          par que YA estaba enlazado.
--      (b) La premisa de seguridad del brief original ("esto podría
--          filtrarle ingresos del Hato a Martha, Administrador") era
--          fácticamente incorrecta -- Martha Vega es Gerencia en
--          producción; los dos Administrador reales no tienen ni
--          siquiera el módulo Hato habilitado (modulos_acceso =
--          ['aguacate']).
--      (c) Decisión explícita: "simple, clean is always best" -- sin
--          mecanismo de sincronización.
--
--    La garantía de "un solo registro" no depende ya de que un trigger se
--    dispare, no falle, y cubra los 4 caminos que escriben fin_ingresos
--    (IngresoForm, IngresosBatchTable, CargaMasivaIngresos, Telegram) --
--    depende de la ESTRUCTURA: fin_ingreso_id es NOT NULL (sección 1) y,
--    para una fila MEDIDA, litros_total es NULL a propósito (CHECK
--    hato_prod_quincenal_litros_origen_coherente, sección 1) -- los
--    litros solo existen en fin_ingresos.cantidad, leídos a través del
--    FK. Una sola copia del dato no tiene ventana para divergir de sí
--    misma.
--
--    Los DROP de abajo son una limpieza de seguridad, no una declaración
--    de intención: si este archivo (o una revisión anterior de él) ya se
--    aplicó contra un ambiente de desarrollo/pruebas con el trigger
--    creado, esta migración lo retira ahí también -- idempotente y segura
--    de re-ejecutar en cualquier estado previo (trigger presente o
--    ausente).
-- =====================================================================

DROP TRIGGER IF EXISTS trg_hato_sync_quincena_desde_ingreso ON fin_ingresos;
DROP FUNCTION IF EXISTS fn_hato_sync_quincena_desde_ingreso();
