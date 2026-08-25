-- Migración 120: cierra el borrado incondicional en las 8 tablas que quedaron
-- fuera de la 110 -- las de monitoreo y producción.
--
-- ---------------------------------------------------------------------------
-- QUÉ CIERRA
-- ---------------------------------------------------------------------------
-- El barrido de políticas `always-true` **sin filtro de rol** devolvía 17 tablas.
-- La 110 cerró 7 (la cadena de trazabilidad GlobalGAP) y la 114 otras 2
-- (`contratistas` y `lotes`, por la cascada). Quedan estas 8, todas con una
-- política DELETE `PERMISSIVE`, `TO authenticated`, predicado literalmente `true`:
--
--   apiarios · mon_colmenas · mon_conductividad · monitoreos
--   plagas_enfermedades_catalogo · produccion · rondas_monitoreo · sublotes
--
-- `monitoreos` son ~4.200 filas -- la serie completa de plagas desde 2025 -- y
-- `produccion` es la base del rendimiento y del costo por kilo. **Ninguna de las
-- 8 está trazada**: `globalgap_correcciones` (113) cubre `aplicaciones*` y
-- `movimientos_diarios*`, `hato_correcciones` (084) cubre las 5 del hato, y
-- `logs_auditoria` nunca recibió una fila. Un borrado acá **no deja rastro**.
--
-- ---------------------------------------------------------------------------
-- DOS COSAS QUE CORRIGEN LO QUE DECÍA EL BORRADOR
-- ---------------------------------------------------------------------------
-- 1. **`anon` NO está limpio: tiene GRANT de DELETE directo sobre las 8.**
--    Comprobado con `has_table_privilege('anon', …, 'DELETE')` -- devuelve
--    `true` en las 8. Es la trampa de la 081 (`ALTER DEFAULT PRIVILEGES … GRANT
--    ALL … TO anon` de Supabase). Hoy no dispara sólo porque **ninguna política
--    apunta a `anon`** y la RLS lo niega, pero eso deja estas tablas **a una
--    política `TO public` de distancia del borrado anónimo**. O sea que el
--    `REVOKE` de abajo no es decoración: es la mitad que más pesa.
-- 2. **La lectura del riesgo va al revés de como estaba escrita.** Esta migración
--    **baja el riesgo neto en el momento en que se aplica**. El defecto #46
--    (toast de éxito sobre un borrado que la RLS filtró) es independiente y de
--    una línea por sitio, y su peor caso es un mensaje confuso sobre una fila que
--    sobrevive: recuperable, cero pérdida de datos. El peor caso de dejar la
--    política abierta es la **destrucción irreversible y sin rastro** de la serie
--    de monitoreo. No se secuencia lo menor delante de lo mayor.
--
-- ---------------------------------------------------------------------------
-- LA TRAMPA DE LA 110 **NO** ESTÁ ACÁ -- comprobado, no supuesto
-- ---------------------------------------------------------------------------
-- La 110 no pudo acotar por propietario porque la always-true era el único
-- camino de borrado y sostenía el borrar-y-reinsertar de
-- `CalculadoraAplicaciones.tsx`. Acá se buscó lo mismo en los dos árboles de
-- edge function y en todo `src/`, dos veces y por separado, y **no hay ningún
-- borrar-y-reinsertar**:
--
--   * **5 de las 8 no tienen NINGUNA llamada de borrado en la aplicación**:
--     `mon_colmenas`, `mon_conductividad`, `monitoreos`, `produccion`,
--     `rondas_monitoreo`. Su política DELETE no le sirve a nadie.
--   * Las otras 3 borran **una fila por id**:
--       src/components/monitoreo/ConfigApiarios.tsx:147
--       src/components/monitoreo/CatalogoPlagas.tsx:274
--       src/components/configuracion/SublotesConfig.tsx:198
--     Ninguna reinserta. (`ConfigApiarios` además comprueba antes que el apiario
--     no tenga colmenas y se niega, así que su exposición es la más chica.)
--   * `CargaMasiva.tsx` sólo inserta; `useCapturaCosecha.ts` hace UPDATE-by-id y
--     luego INSERT, nunca DELETE; la conversación de monitoreo del bot de
--     Telegram sólo inserta. Ninguna RPC ni trigger de `pg_proc` borra de las 8.
--   * Cascadas, en las dos direcciones: la única `ON DELETE CASCADE` que entra es
--     `sublotes_lote_id_fkey` desde `lotes`, **y la 114 ya cerró `lotes`**, así
--     que esa puerta trasera está tapada. El resto es `NO ACTION`/`RESTRICT`, y
--     ninguna de las 8 es padre de una cascada.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ DOS TRATAMIENTOS Y NO UNO -- ésta es la parte que importa
-- ---------------------------------------------------------------------------
-- Las 8 NO están en el mismo estado, y tratarlas igual sería un error en las
-- dos direcciones. Contado contra `pg_policies`:
--
--   GRUPO A -- la always-true es el ÚNICO camino de borrado (5 tablas):
--     apiarios · mon_colmenas · mon_conductividad · produccion · rondas_monitoreo
--   → **ALTER POLICY**. Un DROP las dejaría sin ninguna política DELETE, o sea
--     sin camino de borrado para nadie: eso no es endurecer, es romper.
--
--   GRUPO B -- ya existe una política de rol al lado (3 tablas):
--     monitoreos (Administrador ALL + Gerencia ALL)
--     plagas_enfermedades_catalogo (Gerencia ALL)
--     sublotes (Gerencia ALL)
--   → En `monitoreos` la always-true es **pura redundancia**: las dos políticas
--     que sobreviven son `polcmd = '*'` y `PERMISSIVE`, o sea que `ALL` cubre
--     DELETE de verdad, y su `TO {public}` es MÁS amplio que `{authenticated}`,
--     no más estrecho. Se **BORRA** y no cambia nada para Gerencia ni
--     Administrador.
--   → En `plagas_enfermedades_catalogo` y `sublotes` la política de rol es
--     **sólo Gerencia**. Un DROP le quitaría el borrado al Administrador, que
--     hoy lo tiene y usa esas dos pantallas (ninguna lleva `RoleGuard`).
--     Por eso también van por **ALTER POLICY**, a Gerencia+Administrador.
--
-- Resultado: 7 `ALTER POLICY` + 1 `DROP POLICY` + 8 `REVOKE`.
-- **Filas afectadas: cero.** La post-condición 4.6 lo prueba con línea base.
--
-- ---------------------------------------------------------------------------
-- ⚠️ DOS SCRIPTS SUELTOS DEL REPO REVIERTEN ESTO -- y también la 114
-- ---------------------------------------------------------------------------
-- `src/sql/fix_monitoreos_rls_policies.sql` y
-- `src/sql/fix_all_monitoreo_rls_policies.sql` hacen `DROP POLICY IF EXISTS` +
-- `CREATE POLICY … FOR DELETE TO authenticated USING (true)` sobre exactamente
-- estos nombres -- y el segundo incluye `lotes`, que es trabajo de la 114.
-- **No son migraciones numeradas**, así que nada impide que alguien los corra
-- creyendo que arregla algo. En el mismo PR se marcan `OBSOLETO / NO EJECUTAR`.
--
-- ---------------------------------------------------------------------------
-- EL DEFECTO #46, QUE ES INDEPENDIENTE Y VA EN PARALELO
-- ---------------------------------------------------------------------------
-- Las 3 pantallas que sí borran llaman `.delete().eq('id', …)` **sin `.select()`**.
-- Si la RLS filtra la fila, PostgREST no devuelve error: devuelve cero filas.
--   * `ConfigApiarios.tsx:151` y `SublotesConfig.tsx` muestran el toast de éxito
--     igual -- "Apiario eliminado" / "Sublote eliminado exitosamente".
--   * `CatalogoPlagas.tsx` **no muestra toast de éxito**: sólo recarga, así que
--     su síntoma es distinto -- la fila sigue en pantalla después de recargar.
-- Misma causa raíz, dos síntomas. Se arregla aparte y no bloquea esto.
--
-- Precedentes: 077 (ALTER POLICY, nunca DROP+CREATE: es atómico y no abre una
-- ventana sin política) · 093 (predicado envuelto `(SELECT get_user_role())`,
-- que lo hoista a InitPlan y lo evalúa una vez por consulta, no una por fila) ·
-- 081 (REVOKE explícito para `anon`) · 114 (guardas por rol y línea base
-- relativa; acá se copia su patrón, no se inventa uno) · 082 (calificar con
-- `public.` la función y el tipo, por el `search_path`).

DO $$
DECLARE
  v_always_true integer;
  v_no_permitidos text;
  v_monitoreos_gerencia integer;
  v_monitoreos_admin integer;
  v_filas_monitoreos bigint;
BEGIN
  -- 1.1 Las 8 siguen teniendo su politica always-true con la forma esperada.
  SELECT count(*) INTO v_always_true
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('apiarios','mon_colmenas','mon_conductividad','monitoreos',
                      'plagas_enfermedades_catalogo','produccion','rondas_monitoreo','sublotes')
    AND cmd = 'DELETE' AND permissive = 'PERMISSIVE' AND btrim(qual) = 'true';
  IF v_always_true <> 8 THEN
    RAISE EXCEPTION 'PRE 1.1: se esperaban 8 politicas DELETE always-true y hay %. Alguien ya toco esto, o esta migracion ya corrio.', v_always_true;
  END IF;

  -- 1.2 AVISO, NO ABORTO -- y el borrador lo tenia al reves.
  --     Si existe una cuenta activa que no sea Gerencia ni Administrador, el
  --     defecto #46 empieza a disparar para ella. Pero ese es el problema MENOR
  --     (un mensaje confuso sobre una fila que sobrevive) y esta migracion cierra
  --     el MAYOR (borrado irreversible y sin rastro de la serie de monitoreo).
  --     Abortar aca haria que la migracion se negara a correr justo cuando mas
  --     falta -- y como una migracion aplicada no se edita, el fichero quedaria
  --     muerto y habria que reescribir una 121 identica sin la guarda.
  SELECT string_agg(u.nombre_completo || ' (' || u.rol::text || ')', ', ')
    INTO v_no_permitidos
  FROM public.usuarios u
  WHERE u.activo AND u.rol NOT IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario);
  IF v_no_permitidos IS NOT NULL THEN
    RAISE WARNING 'PRE 1.2: hay cuentas activas que pierden el borrado en estas 8 tablas: %. Para ellas el defecto #46 (toast de exito sobre un borrado filtrado por RLS) ya dispara. Arreglalo en paralelo -- NO es motivo para no aplicar esto.', v_no_permitidos;
  END IF;

  -- 1.3 monitoreos es el unico DROP y solo es seguro si conserva UNA politica de
  --     Gerencia Y UNA de Administrador. Contarlas juntas no sirve: dos de
  --     Gerencia y cero de Administrador tambien suman 2, que es exactamente el
  --     estado que este mensaje dice estar evitando.
  SELECT count(*) FILTER (WHERE qual LIKE '%Gerencia%'),
         count(*) FILTER (WHERE qual LIKE '%Administrador%')
    INTO v_monitoreos_gerencia, v_monitoreos_admin
  FROM pg_policies
  WHERE schemaname='public' AND tablename='monitoreos' AND cmd='ALL' AND permissive='PERMISSIVE';
  IF v_monitoreos_gerencia < 1 OR v_monitoreos_admin < 1 THEN
    RAISE EXCEPTION 'PRE 1.3: monitoreos tiene % politica(s) ALL de Gerencia y % de Administrador. NO borrar la always-true: alguno quedaria sin camino de borrado.',
      v_monitoreos_gerencia, v_monitoreos_admin;
  END IF;

  -- 1.4 LINEA BASE RELATIVA, no un literal absoluto (leccion de la 103, patron
  --     de la 114). monitoreos crece: el bot de Telegram y la app le escriben.
  SELECT count(*) INTO v_filas_monitoreos FROM public.monitoreos;
  PERFORM set_config('escociaos.mig120_monitoreos', v_filas_monitoreos::text, false);
END $$;

-- --------------------------------------------------------------------------
-- GRUPO A -- unico camino de borrado: se ACOTA, nunca se borra.
-- --------------------------------------------------------------------------
ALTER POLICY "Usuarios autenticados pueden eliminar apiarios" ON public.apiarios
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "Usuarios autenticados pueden eliminar mon_colmenas" ON public.mon_colmenas
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "Usuarios autenticados pueden eliminar mon_conductividad" ON public.mon_conductividad
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "Allow authenticated delete on produccion" ON public.produccion
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "Usuarios autenticados pueden eliminar rondas_monitoreo" ON public.rondas_monitoreo
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- --------------------------------------------------------------------------
-- GRUPO B -- ya hay politica de rol, pero solo de Gerencia: se ACOTA igual,
-- para no quitarle el borrado al Administrador que hoy lo tiene y lo usa.
-- --------------------------------------------------------------------------
ALTER POLICY "Usuarios autenticados pueden eliminar plagas_enfermedades_catal" ON public.plagas_enfermedades_catalogo
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "Usuarios autenticados pueden eliminar sublotes" ON public.sublotes
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- --------------------------------------------------------------------------
-- GRUPO B -- monitoreos: pura redundancia. Gerencia y Administrador ya borran
-- por sus propias politicas ALL, asi que aca el DROP no le quita nada a nadie
-- que deba tenerlo, y deja UNA politica menos que mantener.
-- --------------------------------------------------------------------------
DROP POLICY "Usuarios autenticados pueden eliminar monitoreos" ON public.monitoreos;

-- --------------------------------------------------------------------------
-- Segunda capa, y la que mas pesa: anon TIENE hoy GRANT de DELETE directo sobre
-- las 8 (trampa 081). Sin esto, el cierre depende solo de que nadie escriba una
-- politica `TO public` por accidente.
-- --------------------------------------------------------------------------
REVOKE DELETE ON public.apiarios                     FROM anon;
REVOKE DELETE ON public.mon_colmenas                 FROM anon;
REVOKE DELETE ON public.mon_conductividad            FROM anon;
REVOKE DELETE ON public.monitoreos                   FROM anon;
REVOKE DELETE ON public.plagas_enfermedades_catalogo FROM anon;
REVOKE DELETE ON public.produccion                   FROM anon;
REVOKE DELETE ON public.rondas_monitoreo             FROM anon;
REVOKE DELETE ON public.sublotes                     FROM anon;

DO $$
DECLARE
  v_always_true integer;
  v_tablas_acotadas integer;
  v_monitoreos_gerencia integer;
  v_monitoreos_admin integer;
  v_anon integer;
  v_auth_sin_grant integer;
  v_filas_ahora bigint;
  v_filas_antes text;
BEGIN
  -- 4.1 No queda NINGUNA politica DELETE always-true en estas 8.
  SELECT count(*) INTO v_always_true
  FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN ('apiarios','mon_colmenas','mon_conductividad','monitoreos',
                      'plagas_enfermedades_catalogo','produccion','rondas_monitoreo','sublotes')
    AND cmd='DELETE' AND permissive='PERMISSIVE' AND btrim(qual)='true';
  IF v_always_true <> 0 THEN
    RAISE EXCEPTION 'POST 4.1: quedan % politicas DELETE always-true de las 8.', v_always_true;
  END IF;

  -- 4.2 Las 7 del ALTER quedaron acotadas Y envueltas (precedente 093).
  --     Se cuentan TABLAS DISTINTAS, no politicas: 7 politicas repartidas 2+0
  --     entre dos tablas tambien suman 7 y dejarian una sin acotar.
  SELECT count(DISTINCT tablename) INTO v_tablas_acotadas
  FROM pg_policies
  WHERE schemaname='public' AND cmd='DELETE'
    AND tablename IN ('apiarios','mon_colmenas','mon_conductividad',
                      'plagas_enfermedades_catalogo','produccion','rondas_monitoreo','sublotes')
    AND qual LIKE '%SELECT%get_user_role%'
    AND qual LIKE '%Gerencia%' AND qual LIKE '%Administrador%';
  IF v_tablas_acotadas <> 7 THEN
    RAISE EXCEPTION 'POST 4.2: solo % de las 7 tablas quedaron con su politica acotada y envuelta.', v_tablas_acotadas;
  END IF;

  -- 4.3 monitoreos perdio la always-true y CONSERVA un camino POR CADA ROL.
  SELECT count(*) FILTER (WHERE qual LIKE '%Gerencia%'),
         count(*) FILTER (WHERE qual LIKE '%Administrador%')
    INTO v_monitoreos_gerencia, v_monitoreos_admin
  FROM pg_policies
  WHERE schemaname='public' AND tablename='monitoreos' AND cmd='ALL' AND permissive='PERMISSIVE';
  IF v_monitoreos_gerencia < 1 OR v_monitoreos_admin < 1 THEN
    RAISE EXCEPTION 'POST 4.3: monitoreos quedo con % politica(s) de Gerencia y % de Administrador. Alguno se quedo sin borrar.',
      v_monitoreos_gerencia, v_monitoreos_admin;
  END IF;

  -- 4.4 anon no tiene DELETE en ninguna de las 8.
  SELECT count(*) INTO v_anon FROM (
    SELECT unnest(ARRAY['apiarios','mon_colmenas','mon_conductividad','monitoreos',
                        'plagas_enfermedades_catalogo','produccion','rondas_monitoreo','sublotes']) AS t
  ) x WHERE has_table_privilege('anon', 'public.' || x.t, 'DELETE');
  IF v_anon <> 0 THEN
    RAISE EXCEPTION 'POST 4.4: anon conserva DELETE en % de las 8 tablas.', v_anon;
  END IF;

  -- 4.5 authenticated CONSERVA su GRANT de DELETE (patron de la 114 POST 4.7).
  --     Perderlo romperia el borrado para TODOS los roles, politica o no.
  SELECT count(*) INTO v_auth_sin_grant FROM (
    SELECT unnest(ARRAY['apiarios','mon_colmenas','mon_conductividad','monitoreos',
                        'plagas_enfermedades_catalogo','produccion','rondas_monitoreo','sublotes']) AS t
  ) x WHERE NOT has_table_privilege('authenticated', 'public.' || x.t, 'DELETE');
  IF v_auth_sin_grant <> 0 THEN
    RAISE EXCEPTION 'POST 4.5: authenticated perdio el GRANT de DELETE en % tabla(s). Eso rompe el borrado para Gerencia y Administrador tambien.', v_auth_sin_grant;
  END IF;

  -- 4.6 NO SE BORRO NI UNA FILA -- contra la linea base de la PRE 1.4, nunca
  --     contra un literal absoluto (leccion de la 103).
  v_filas_antes := nullif(current_setting('escociaos.mig120_monitoreos', true), '');
  SELECT count(*) INTO v_filas_ahora FROM public.monitoreos;
  IF v_filas_antes IS NULL THEN
    RAISE WARNING 'POST 4.6: no se pudo leer la linea base; la comprobacion de filas NO se ejecuto.';
  ELSIF v_filas_ahora <> v_filas_antes::bigint THEN
    RAISE EXCEPTION 'POST 4.6: monitoreos paso de % a % filas. Un cambio de politicas no puede hacer eso; abortar.', v_filas_antes, v_filas_ahora;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable):
--   ALTER POLICY "Usuarios autenticados pueden eliminar apiarios"  ON public.apiarios  USING (true);
--   ALTER POLICY "Usuarios autenticados pueden eliminar mon_colmenas" ON public.mon_colmenas USING (true);
--   ALTER POLICY "Usuarios autenticados pueden eliminar mon_conductividad" ON public.mon_conductividad USING (true);
--   ALTER POLICY "Allow authenticated delete on produccion" ON public.produccion USING (true);
--   ALTER POLICY "Usuarios autenticados pueden eliminar rondas_monitoreo" ON public.rondas_monitoreo USING (true);
--   ALTER POLICY "Usuarios autenticados pueden eliminar plagas_enfermedades_catal" ON public.plagas_enfermedades_catalogo USING (true);
--   ALTER POLICY "Usuarios autenticados pueden eliminar sublotes" ON public.sublotes USING (true);
--   CREATE POLICY "Usuarios autenticados pueden eliminar monitoreos" ON public.monitoreos FOR DELETE TO authenticated USING (true);
--   -- Los GRANT de anon NO se restauran a proposito: nunca debieron existir.
-- ---------------------------------------------------------------------------
