-- =====================================================================
-- 160: hato_capturas_foto acepta el tipo 'liquidacion' -- la TERCERA ruta
-- de carga por foto del Hato Lechero, hoy sin ningun rastro.
-- Fecha: 2026-09-21
-- Fuente: hallazgo ESCO-115 del PO -- "la 146 instrumento dos rutas de
-- foto; hay tres. La liquidacion quincenal de leche de El Pomar sube al
-- bucket `hato-liquidaciones-fotos` y no escribe una sola fila de
-- `hato_capturas_foto`".
--
-- LO QUE MIDE EL PROBLEMA, verificado contra produccion antes de escribir
-- esta migracion (2026-09-21):
--   - `storage.objects` del bucket `hato-liquidaciones-fotos`: 13 objetos,
--     del 2026-08-06 al 2026-09-20. O sea 46 dias de cargas.
--   - `hato_capturas_foto`: 5 filas en total -- 3 `pesaje` y 2 `chequeo`.
--     Ninguna de liquidacion, y no podria haberla: el CHECK
--     `hato_capturas_foto_tipo_check` solo admite esos dos valores, asi
--     que un INSERT de liquidacion aborta con 23514.
--
-- POR QUE ESTA RUTA PESA MAS QUE LAS OTRAS DOS: es la que termina creando
-- `hato_produccion_quincenal`, cuya `fin_ingreso_id` es NOT NULL (migracion
-- 070). Es decir, la venta quincenal de leche que aterriza en el P&G. Si la
-- carga falla, la venta no llega a Finanzas y hoy NADA registra que hubo un
-- intento -- el mismo modo de fallo silencioso que motivo la 146, sobre el
-- dato que mas caro sale perder.
--
-- QUE HACE ESTA MIGRACION: un solo cambio, el valor `'liquidacion'` en el
-- CHECK de `tipo`. Nada mas. La tabla, sus indices, su RLS y sus grants
-- quedan exactamente como los dejo la 146.
--
-- QUE NO HACE, a proposito:
--   - No toca `hato_capturas_foto_periodo_pesaje`
--     (`tipo <> 'pesaje' OR (anio IS NOT NULL AND mes IS NOT NULL)`).
--     Se leyo antes de tocar nada, y el valor nuevo NO interactua con el:
--     la guarda esta acotada a `pesaje`, asi que una fila `liquidacion`
--     queda exenta -- que es lo correcto, porque en esta ruta el periodo
--     (mes y quincena) lo LEE el modelo de vision DEL documento. Exigirlo
--     en el INSERT, que ocurre antes del OCR, obligaria a inventarlo.
--     Misma regla de siempre: NULL es "todavia no se sabe", nunca un
--     centinela.
--   - No agrega indices: `idx_hato_capturas_foto_creado (tipo, creado_en
--     DESC)` ya sirve al valor nuevo.
--   - No hace backfill de las 13 cargas historicas. No hay de donde sacar
--     su desenlace: el objeto en Storage no dice si el OCR leyo, si Martha
--     guardo ni si la venta llego al P&G. Inventar un desenlace seria
--     exactamente lo que esta tabla existe para impedir.
--   - No crea un cierre `ok` para esta ruta. El endpoint de liquidacion
--     NUNCA escribe en tablas de dominio -- el guardado real pasa por
--     `fn_hato_guardar_quincena_venta` desde el navegador, y el navegador
--     no tiene UPDATE sobre esta tabla (la 146 se lo revoco a proposito).
--     Asi que una carga leida queda en `pendiente` con sus campos leidos,
--     que es el estado honesto y ya es la senal accionable -- mismo
--     criterio con el que la 146 dejo `abandonado` sin escritor.
--
-- VERIFICACION DEL NUMERO contra las cuatro fuentes del runbook.
-- Re-verificada 2026-09-21 despues de que dos ramas hermanas tomaran sus
-- numeros: `160_` es UNICO en las 106 referencias de `origin`, no esta en
-- el ledger `supabase_migrations.schema_migrations` (cabeza
-- `20260921132809 / 150_retirar_stock_15_15_15_prueba`) ni en `respaldos`,
-- y `origin/main` llega hasta `158_`.
--   OJO, el 159 y el 161 YA NO ESTAN LIBRES: los tomaron
--   `claude/po-clima-159` y `claude/po-rls-161`, empujadas DESPUES de que
--   se escribiera la primera version de este encabezado. La version
--   anterior de estas lineas decia que los tres numeros estaban libres;
--   era cierta al escribirla y falsa una hora despues. Es exactamente la
--   nota que el proximo autor lee para elegir numero, asi que el barrido
--   se corre de nuevo en el momento de elegir -- nunca se cita de memoria
--   ni de un encabezado ajeno.
--
-- ORDEN DE APLICACION: MIGRACION PRIMERO, `functions deploy` DESPUES.
-- Este PR SI embarca un productor del valor nuevo --
-- `registrarCapturaFoto({ tipo: 'liquidacion' })` en
-- `hato-produccion-quincena-foto.ts`, en los DOS arboles -- asi que no es
-- un CHECK ampliado para un valor que nadie escribe todavia. Mismo
-- criterio explicito que la 140, y la leccion de la 105.
--   Al reves el fallo es DEGRADADO, no duro: el INSERT choca con el CHECK
--   viejo y devuelve 23514, pero `registrarCapturaFoto` no lanza nunca --
--   lo registra en el log y devuelve `null`, y `cerrarCapturaFoto` no hace
--   nada con un id nulo. La carga de la liquidacion sigue funcionando
--   igual que hoy. Lo que se pierde, en silencio, es justo la
--   instrumentacion que esta migracion existe para agregar.
--
-- Aditiva al dominio: amplia un CHECK, no toca ninguna fila.
-- Filas afectadas: cero.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Linea base + precondiciones.
-- La linea base va en una tabla temporal y NO en un literal: es la
-- leccion de la 103 y de la 120 (`monitoreos` con el literal 4000). Esta
-- tabla la escribe la edge function en cualquier momento, asi que un
-- numero contado hoy puede estar viejo cuando la migracion corra.
--
-- SIN `BEGIN;`/`COMMIT;` propios: `apply_migration` ya envuelve el fichero
-- entero, y esta acreditado -- 080, 081, 099 y 103 abortaron por
-- `RAISE EXCEPTION` y revirtieron todo sin aportar su propia transaccion.
-- Solo 4 de 167 ficheros de este directorio traen `BEGIN;`, y ninguna de
-- las siete migraciones aplicadas mas recientes. Un `COMMIT;` propio
-- cerraria la transaccion EXTERNA, y lo que viniera despues correria
-- fuera de ella, donde ninguna guarda posterior puede revertirlo.
-- Por eso `ON COMMIT DROP` de aca abajo cuelga de ESA transaccion: la
-- tabla temporal muere con ella.
-- ---------------------------------------------------------------------
CREATE TEMP TABLE _base_160 ON COMMIT DROP AS
SELECT count(*) AS filas FROM public.hato_capturas_foto;

DO $$
DECLARE
  v_def_tipo    text;
  v_def_periodo text;
  v_fuera       integer;
  v_checks      integer;
BEGIN
  SELECT pg_get_constraintdef(con.oid) INTO v_def_tipo
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'hato_capturas_foto'
    AND con.conname = 'hato_capturas_foto_tipo_check';

  IF v_def_tipo IS NULL THEN
    RAISE EXCEPTION '160: no existe hato_capturas_foto_tipo_check -- la migracion 146 no esta aplicada o la tabla cambio de forma.';
  END IF;

  -- El cuerpo vivo tiene que ser el revisado. Si alguien ya amplio el
  -- CHECK por fuera del repo, esta migracion no debe pisarlo en silencio.
  IF v_def_tipo <> 'CHECK ((tipo = ANY (ARRAY[''pesaje''::text, ''chequeo''::text])))' THEN
    RAISE EXCEPTION '160: hato_capturas_foto_tipo_check no es el de la 146. Vivo: %', v_def_tipo;
  END IF;

  -- La otra guarda de la tabla que podria interactuar con el valor nuevo.
  -- Esta acotada a `pesaje`, asi que una fila `liquidacion` queda exenta.
  -- Se comprueba literal: si algun dia deja de estar acotada, este
  -- cambio dejaria de ser inocuo y la migracion tiene que abortar.
  SELECT pg_get_constraintdef(con.oid) INTO v_def_periodo
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'hato_capturas_foto'
    AND con.conname = 'hato_capturas_foto_periodo_pesaje';

  IF v_def_periodo <> 'CHECK (((tipo <> ''pesaje''::text) OR ((anio IS NOT NULL) AND (mes IS NOT NULL))))' THEN
    RAISE EXCEPTION '160: hato_capturas_foto_periodo_pesaje cambio -- el tipo nuevo ya no es inocuo frente a el. Vivo: %', v_def_periodo;
  END IF;

  -- Ninguna fila fuera del contrato vigente: el CHECK nuevo tiene que
  -- validar sobre datos que ya cumplen.
  SELECT count(*) INTO v_fuera
  FROM public.hato_capturas_foto
  WHERE tipo NOT IN ('pesaje', 'chequeo');
  IF v_fuera <> 0 THEN
    RAISE EXCEPTION '160: hay % filas con un tipo fuera de (pesaje, chequeo) -- revisar antes de ampliar el CHECK.', v_fuera;
  END IF;

  SELECT count(*) INTO v_checks
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'hato_capturas_foto' AND con.contype = 'c';
  IF v_checks <> 10 THEN
    RAISE EXCEPTION '160: se esperaban 10 CHECK sobre hato_capturas_foto, hay %.', v_checks;
  END IF;

  RAISE NOTICE '160: precondiciones OK (% filas en la tabla, 0 fuera del contrato).',
    (SELECT filas FROM _base_160);
END $$;

-- ---------------------------------------------------------------------
-- El cambio. DROP + ADD porque un CHECK de tabla no se puede ampliar en
-- sitio (no hay `ALTER CONSTRAINT` que cambie la expresion), y va dentro
-- de la misma transaccion, asi que no existe un instante publicado sin la
-- guarda. El ADD valida las filas existentes: son 5 y las 5 cumplen.
-- ---------------------------------------------------------------------
ALTER TABLE public.hato_capturas_foto
  DROP CONSTRAINT hato_capturas_foto_tipo_check;

ALTER TABLE public.hato_capturas_foto
  ADD CONSTRAINT hato_capturas_foto_tipo_check
  CHECK (tipo IN ('pesaje', 'chequeo', 'liquidacion'));

COMMENT ON COLUMN public.hato_capturas_foto.tipo IS
  'Que planilla se fotografio: pesaje (planilla mensual), chequeo (planilla veterinaria) o liquidacion (documento quincenal de leche de El Pomar, migracion 160 / ESCO-115). Las tres rutas comparten tabla porque comparten la pregunta ("esta carga produjo algo?") y el mismo modo de fallo silencioso.';

COMMENT ON TABLE public.hato_capturas_foto IS
  'Un intento de carga por foto (pesaje/chequeo/liquidacion) por fila. Se inserta como pendiente justo despues de guardar la foto en Storage y ANTES del OCR, y se cierra con el desenlace real. Hallazgos ESCO-76 (146) y ESCO-115 (160).';

-- ---------------------------------------------------------------------
-- Postcondiciones.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_def_tipo    text;
  v_def_periodo text;
  v_checks      integer;
  v_filas       integer;
  v_base        integer;
BEGIN
  SELECT pg_get_constraintdef(con.oid) INTO v_def_tipo
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'hato_capturas_foto'
    AND con.conname = 'hato_capturas_foto_tipo_check';

  IF v_def_tipo IS NULL OR v_def_tipo NOT LIKE '%liquidacion%' THEN
    RAISE EXCEPTION '160: el CHECK de tipo no quedo con liquidacion. Vivo: %', coalesce(v_def_tipo, '(no existe)');
  END IF;
  IF v_def_tipo NOT LIKE '%pesaje%' OR v_def_tipo NOT LIKE '%chequeo%' THEN
    RAISE EXCEPTION '160: el CHECK de tipo perdio un valor previo. Vivo: %', v_def_tipo;
  END IF;

  -- La guarda del periodo de pesaje sigue igual: ampliar `tipo` no puede
  -- haberla tocado.
  SELECT pg_get_constraintdef(con.oid) INTO v_def_periodo
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'hato_capturas_foto'
    AND con.conname = 'hato_capturas_foto_periodo_pesaje';
  IF v_def_periodo <> 'CHECK (((tipo <> ''pesaje''::text) OR ((anio IS NOT NULL) AND (mes IS NOT NULL))))' THEN
    RAISE EXCEPTION '160: hato_capturas_foto_periodo_pesaje cambio durante la migracion. Vivo: %', coalesce(v_def_periodo, '(no existe)');
  END IF;

  SELECT count(*) INTO v_checks
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'hato_capturas_foto' AND con.contype = 'c';
  IF v_checks <> 10 THEN
    RAISE EXCEPTION '160: quedaron % CHECK sobre hato_capturas_foto, se esperaban 10.', v_checks;
  END IF;

  -- RLS y grants: la 146 los dejo asi y esta migracion no los toca.
  IF has_table_privilege('anon', 'public.hato_capturas_foto', 'SELECT') THEN
    RAISE EXCEPTION '160: anon no deberia tener SELECT sobre hato_capturas_foto.';
  END IF;
  IF has_table_privilege('authenticated', 'public.hato_capturas_foto', 'INSERT')
     OR has_table_privilege('authenticated', 'public.hato_capturas_foto', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.hato_capturas_foto', 'DELETE') THEN
    RAISE EXCEPTION '160: authenticated no deberia poder escribir hato_capturas_foto -- solo service_role.';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.hato_capturas_foto', 'SELECT') THEN
    RAISE EXCEPTION '160: authenticated necesita SELECT -- la tarjeta de Pesaje lee la ultima captura.';
  END IF;

  -- Cero filas afectadas. Se compara con `<`, no con `<>` (patron de la
  -- 133): la edge function escribe esta tabla en cualquier momento, y un
  -- INSERT ajeno confirmado a mitad de la transaccion no es un defecto.
  -- Ampliar un CHECK no puede borrar filas, asi que la unica direccion
  -- que denuncia algo roto es hacia abajo.
  SELECT count(*) INTO v_filas FROM public.hato_capturas_foto;
  SELECT filas INTO v_base FROM _base_160;
  IF v_filas < v_base THEN
    RAISE EXCEPTION '160: la tabla perdio filas (% -> %).', v_base, v_filas;
  END IF;

  RAISE NOTICE '160 OK: tipo admite pesaje/chequeo/liquidacion, 10 CHECK intactos, % filas (base %), RLS y grants sin cambios.',
    v_filas, v_base;
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, si hubiera que revertir).
--
-- OJO: solo corre limpio mientras no exista ninguna fila `liquidacion`.
-- Si ya las hay, el ADD aborta con 23514 -- y eso es correcto: volver
-- atras implicaria decidir que hacer con intentos reales ya registrados,
-- y esa decision no la toma un rollback. Para ver si quedan:
--   SELECT count(*) FROM public.hato_capturas_foto WHERE tipo = 'liquidacion';
--
--   BEGIN;
--   ALTER TABLE public.hato_capturas_foto
--     DROP CONSTRAINT hato_capturas_foto_tipo_check;
--   ALTER TABLE public.hato_capturas_foto
--     ADD CONSTRAINT hato_capturas_foto_tipo_check
--     CHECK (tipo IN ('pesaje', 'chequeo'));
--   COMMENT ON TABLE public.hato_capturas_foto IS
--     'Un intento de carga por foto (pesaje/chequeo) por fila. Se inserta como pendiente justo despues de guardar la foto en Storage y ANTES del OCR, y se cierra con el desenlace real. Hallazgo ESCO-76.';
--   -- La migracion escribe DOS comentarios y el rollback tiene que
--   -- deshacer los dos. `col_description` sobre `tipo` estaba en NULL
--   -- antes de la 160 (verificado en vivo 2026-09-21), asi que NULL es el
--   -- estado previo real. Sin esta linea, la columna se queda describiendo
--   -- `liquidacion` mientras el CHECK vuelto atras lo prohibe.
--   COMMENT ON COLUMN public.hato_capturas_foto.tipo IS NULL;
--   COMMIT;
--
-- El lado codigo se revierte aparte: hay que sacar la llamada a
-- `registrarCapturaFoto` de `hato-produccion-quincena-foto.ts` en los dos
-- arboles y redesplegar, o la ruta empezara a fallar el INSERT de
-- instrumentacion. No rompe la carga -- `registrarCapturaFoto` nunca lanza
-- y devuelve `null` -- pero deja ruido en los logs.
-- ---------------------------------------------------------------------------
