-- Migración 109: el borrado del bucket `reportes-semanales` pasa a ser sólo de
-- Gerencia. Cierra el hallazgo #20 del tablero de mantenimiento.
--
-- QUÉ ESTÁ MAL HOY. La migración 019 (`storage_policies_reportes`, en el ledger
-- como versión `021`) creó las cuatro políticas del bucket con el predicado
-- desnudo `bucket_id = 'reportes-semanales'` y `TO authenticated`, sin ninguna
-- comprobación de rol. Los otros seis buckets de `storage.objects` no se
-- parecen en nada: `facturas` exige Administrador o Gerencia, y los tres del
-- hato (`chequeos-fotos`, `hato-pesajes-fotos`, `hato-liquidaciones-fotos`)
-- siguen el patrón de la 072 — leer/subir/actualizar para Administrador +
-- Gerencia, **DELETE sólo Gerencia**. `reportes-semanales` es el único donde
-- cualquier autenticado puede borrar los 49 informes archivados, que son el
-- registro operativo de la finca para la revisión GlobalGAP.
--
-- POR QUÉ NO ES UNA EMERGENCIA, Y POR QUÉ IGUAL SE ARREGLA. El bucket es
-- privado (`public = false`) y `anon` no tiene ninguna política sobre él, así
-- que esto NO es una exposición a internet. Y el padrón de hoy son 8 cuentas
-- activas: 5 Gerencia + 3 Administrador — todo el que alcanza el bucket ya es
-- de confianza. Se vuelve real el día que exista una cuenta Verificador o
-- Monitor: heredaría lectura Y borrado sobre la única copia guardada de los
-- informes. La asimetría del DELETE se cierra igual, porque borrar el artefacto
-- destruye la traza, que es exactamente el motivo por el que los otros seis
-- buckets ya reservan el borrado.
--
-- ALCANCE: sólo el DELETE. Leer / subir / actualizar se dejan como están, a
-- propósito: hoy los necesitan los dos roles que existen, y el generador
-- semanal sube con `upsert`, que es INSERT + UPDATE, nunca DELETE.
--
-- FILAS AFECTADAS: cero. Un `ALTER POLICY` no toca un solo objeto — la guarda
-- 3.2 lo comprueba igual contra el conteo capturado antes, en vez de creerlo.
--
-- NINGÚN CONSUMIDOR SE ROMPE. Verificado por barrido del repo: la única
-- llamada a `.remove(` de todo `src/` es `PurchaseHistory.tsx:365`, y es sobre
-- `facturas`. **Nada en la aplicación borra jamás de `reportes-semanales`.**
-- La evidencia del hallazgo citaba `reporteSemanalService.ts` como consumidor;
-- ese fichero lee y sube, no borra.
--
-- `ALTER POLICY`, NUNCA `DROP` + `CREATE` (precedente 077). Es atómico y no
-- abre una ventana en la que la tabla se queda sin política. La acción
-- propuesta en el tablero decía DROP + CREATE; se cambió a propósito, y de paso
-- eso mantiene la migración dentro del carril estrictamente aditivo.
--
-- El predicado va envuelto como `(SELECT auth.uid())` (precedente 093): un
-- `auth.uid()` pelado se re-evalúa una vez por fila; envuelto, el planificador
-- lo sube a un InitPlan y lo evalúa una sola vez.
--
-- CONSECUENCIA CONOCIDA Y ACEPTADA: `ALTER POLICY … USING` no puede renombrar,
-- así que la política sigue llamándose "Authenticated users can delete reports"
-- aunque ya no signifique eso. Renombrarla sería refactorizar mientras se
-- arregla. Se corrige con un `COMMENT ON POLICY` (paso 4) para que el próximo
-- que lea el catálogo no se lleve el nombre por delante.

-- ---------------------------------------------------------------------------
-- 1. Pre-condiciones. Cualquiera que falle aborta la transacción entera.
--
--    El `set_config` de 1.4 NO es un efecto de la migración: es la captura del
--    estado previo que la post-condición 3.2 necesita para comparar el conteo
--    de objetos contra sí mismo en vez de contra un literal. El bucket lo
--    escribe el generador semanal, así que un literal absoluto envejecería y
--    haría abortar la migración por un motivo que no es un problema — que es
--    exactamente lo que le costó un día a la 103.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_politicas_bucket integer;
  v_predicado_delete text;
  v_gerencia_activos integer;
BEGIN
  -- 1.1 El bucket tiene que seguir teniendo sus cuatro políticas, ni una más.
  SELECT count(*) INTO v_politicas_bucket
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'storage'
    AND c.relname = 'objects'
    AND p.polname IN (
      'Authenticated users can read reports',
      'Authenticated users can upload reports',
      'Authenticated users can update reports',
      'Authenticated users can delete reports'
    );

  IF v_politicas_bucket <> 4 THEN
    RAISE EXCEPTION 'PRE 1.1: se esperaban las 4 políticas de `reportes-semanales` sobre storage.objects, hay %. Alguien tocó el bucket; revisar antes de seguir.', v_politicas_bucket;
  END IF;

  -- 1.2 La política que se va a modificar tiene que ser la irrestricta que
  --     describe el hallazgo. Si ya la cambiaron, esta migración sobra y no
  --     debe pisar lo que haya.
  SELECT pg_get_expr(p.polqual, p.polrelid) INTO v_predicado_delete
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'storage'
    AND c.relname = 'objects'
    AND p.polname = 'Authenticated users can delete reports'
    AND p.polcmd = 'd';

  IF v_predicado_delete IS DISTINCT FROM '(bucket_id = ''reportes-semanales''::text)' THEN
    RAISE EXCEPTION 'PRE 1.2: el predicado DELETE ya no es el irrestricto esperado. Actual: %', coalesce(v_predicado_delete, '<no existe una política DELETE con ese nombre>');
  END IF;

  -- 1.3 Tiene que haber al menos un Gerencia activo. Sin eso, aplicar esto
  --     dejaría el borrado del bucket sin ningún titular vivo.
  SELECT count(*) INTO v_gerencia_activos
  FROM public.usuarios
  WHERE rol = 'Gerencia'::public.rol_usuario
    AND activo;

  IF v_gerencia_activos < 1 THEN
    RAISE EXCEPTION 'PRE 1.3: no hay ningún usuario Gerencia activo. Aplicar dejaría `reportes-semanales` sin nadie que pueda borrar.';
  END IF;

  -- 1.4 Captura del conteo de objetos, para la post-condición 3.2.
  PERFORM set_config(
    'escociaos.mig109_objetos_previos',
    (SELECT count(*)::text FROM storage.objects WHERE bucket_id = 'reportes-semanales'),
    false
  );
END $$;

-- ---------------------------------------------------------------------------
-- 2. El cambio. Una sola sentencia, atómica.
-- ---------------------------------------------------------------------------
ALTER POLICY "Authenticated users can delete reports"
  ON storage.objects
  USING (
    bucket_id = 'reportes-semanales'
    AND EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND u.rol = 'Gerencia'::public.rol_usuario
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Post-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_predicado_delete text;
  v_politicas_bucket integer;
  v_predicados_intactos integer;
  v_objetos_antes integer;
  v_objetos_ahora integer;
BEGIN
  -- 3.1 El DELETE ya no es irrestricto y nombra a Gerencia.
  SELECT pg_get_expr(p.polqual, p.polrelid) INTO v_predicado_delete
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'storage'
    AND c.relname = 'objects'
    AND p.polname = 'Authenticated users can delete reports'
    AND p.polcmd = 'd';

  IF v_predicado_delete IS NULL
     OR v_predicado_delete NOT LIKE '%reportes-semanales%'
     OR v_predicado_delete NOT LIKE '%Gerencia%'
     OR v_predicado_delete NOT LIKE '%usuarios%' THEN
    RAISE EXCEPTION 'POST 3.1: el predicado DELETE no quedó acotado a Gerencia. Actual: %', coalesce(v_predicado_delete, '<nulo>');
  END IF;

  -- 3.2 Cero objetos tocados, contra el conteo capturado en 1.4.
  v_objetos_antes := current_setting('escociaos.mig109_objetos_previos')::integer;
  SELECT count(*) INTO v_objetos_ahora
  FROM storage.objects
  WHERE bucket_id = 'reportes-semanales';

  IF v_objetos_ahora <> v_objetos_antes THEN
    RAISE EXCEPTION 'POST 3.2: el conteo de objetos de `reportes-semanales` cambió de % a %. Un ALTER POLICY no puede hacer eso; abortar.', v_objetos_antes, v_objetos_ahora;
  END IF;

  -- 3.3 Siguen siendo cuatro políticas: no se perdió ninguna por el camino.
  SELECT count(*) INTO v_politicas_bucket
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'storage'
    AND c.relname = 'objects'
    AND p.polname IN (
      'Authenticated users can read reports',
      'Authenticated users can upload reports',
      'Authenticated users can update reports',
      'Authenticated users can delete reports'
    );

  IF v_politicas_bucket <> 4 THEN
    RAISE EXCEPTION 'POST 3.3: quedaron % políticas del bucket en vez de 4.', v_politicas_bucket;
  END IF;

  -- 3.4 Leer / subir / actualizar quedaron BYTE A BYTE como estaban. Es la
  --     comprobación de que el alcance fue sólo el DELETE.
  SELECT count(*) INTO v_predicados_intactos
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'storage'
    AND c.relname = 'objects'
    AND (
      (p.polname = 'Authenticated users can read reports'
        AND p.polcmd = 'r'
        AND pg_get_expr(p.polqual, p.polrelid) = '(bucket_id = ''reportes-semanales''::text)')
      OR
      (p.polname = 'Authenticated users can update reports'
        AND p.polcmd = 'w'
        AND pg_get_expr(p.polqual, p.polrelid) = '(bucket_id = ''reportes-semanales''::text)')
      OR
      (p.polname = 'Authenticated users can upload reports'
        AND p.polcmd = 'a'
        AND pg_get_expr(p.polwithcheck, p.polrelid) = '(bucket_id = ''reportes-semanales''::text)')
    );

  IF v_predicados_intactos <> 3 THEN
    RAISE EXCEPTION 'POST 3.4: se esperaban intactas las 3 políticas de leer/subir/actualizar, coinciden %.', v_predicados_intactos;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. El nombre de la política ya no dice la verdad y no se puede cambiar sin
--    DROP. Que lo diga el comentario.
-- ---------------------------------------------------------------------------
COMMENT ON POLICY "Authenticated users can delete reports" ON storage.objects IS
  'Migración 109: el nombre es histórico (migración 019) y quedó mintiendo. Desde 2026-08-24 el borrado de `reportes-semanales` es SÓLO de Gerencia, igual que en los seis buckets restantes. Renombrarla exigiría DROP + CREATE, que abre una ventana sin política (precedente 077).';

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, si hubiera que devolver el bucket a como estaba):
--
--   ALTER POLICY "Authenticated users can delete reports"
--     ON storage.objects
--     USING (bucket_id = 'reportes-semanales');
--
--   COMMENT ON POLICY "Authenticated users can delete reports"
--     ON storage.objects IS NULL;
-- ---------------------------------------------------------------------------
