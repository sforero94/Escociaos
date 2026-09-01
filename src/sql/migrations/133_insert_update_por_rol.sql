-- Migración 133: acota por rol las 33 políticas de INSERT/UPDATE que quedaban
-- con predicado literalmente `true` sobre 20 tablas de `public`.
--
-- Numerada 133: es el siguiente número libre tomado sobre las DOS fuentes que
-- exige la constitución -- el máximo de `src/sql/migrations/` es 132
-- (`132_fn_ronda_proponer_ajuste_cantidad_confirmada.sql`) y el máximo del
-- ledger `supabase_migrations.schema_migrations` es `20260829004821`
-- (`132_fn_ronda_proponer_ajuste_cantidad_confirmada`), o sea la misma
-- migración. Coinciden, y ninguna de las dos llega a 133. Verificado en vivo el
-- 2026-09-01, no heredado de un documento: en cuatro días hubo dos
-- renumeraciones por confiar en un número escrito en otro sitio.
--
-- NO APLICAR DESDE ESTE AGENTE. Este archivo se abre en PR para revisión
-- adversarial independiente y lo aplica Santiago. El hallazgo ESCO-58 está
-- marcado `Requiere aprobacion`.
--
-- ---------------------------------------------------------------------------
-- QUÉ CIERRA
-- ---------------------------------------------------------------------------
-- El barrido histórico de políticas `always-true` sólo cubrió `cmd IN
-- ('DELETE','ALL')`. Las 110, 114, 120 y 123 cerraron esa mitad entera -- hoy
-- el barrido de DELETE devuelve una sola fila y es `reportes_semanales TO
-- service_role`, que no es de esta clase. **INSERT y UPDATE nunca se barrieron
-- en todo el esquema.** Ésta es la mitad sin barrer de la misma clase, no un
-- duplicado del hallazgo #37.
--
-- Consulta canónica del barrido (guardarla al lado de la de DELETE):
--
--   SELECT tablename, policyname, cmd, roles::text, qual, with_check
--   FROM pg_policies
--   WHERE schemaname='public' AND permissive='PERMISSIVE'
--     AND cmd IN ('INSERT','UPDATE') AND 'authenticated' = ANY(roles)
--     AND btrim(coalesce(qual,'true'))='true'
--     AND btrim(coalesce(with_check,'true'))='true';
--
-- El `coalesce(...,'true')` es carga útil, no decoración: una política INSERT
-- tiene `qual` NULL y una UPDATE puede tener `with_check` NULL. Sin él se
-- pierden justo las que hay que cerrar.
--
-- Devuelve **33 políticas sobre 20 tablas** (verificado en producción
-- 2026-09-01). Reparto:
--
--   Sólo INSERT (8, la cadena de trazabilidad GlobalGAP):
--     aplicaciones_calculos · aplicaciones_compras · aplicaciones_lotes
--     aplicaciones_productos · movimientos_diarios · movimientos_diarios_empleados
--     movimientos_diarios_productos · movimientos_diarios_trabajadores
--   INSERT + UPDATE (11):
--     apiarios · contratistas · lotes · mon_colmenas · mon_conductividad
--     monitoreos · plagas_enfermedades_catalogo · produccion
--     registros_trabajo · rondas_monitoreo · sublotes
--   INSERT + DOS UPDATE (1):
--     reportes_semanales
--
-- ---------------------------------------------------------------------------
-- UNA DIVERGENCIA CONTRA EL HALLAZGO, Y ES REAL: SON 33 POLÍTICAS, NO 32
-- ---------------------------------------------------------------------------
-- El hallazgo contaba 20 tablas y daba por sentada una UPDATE por tabla.
-- `reportes_semanales` tiene **dos** políticas UPDATE, las dos always-true y las
-- dos `TO authenticated`: `Authenticated users can update reports` y
-- `Users can update own reports`. **La segunda miente en el nombre**: su `qual`
-- es literalmente `true`, no comprueba `generado_por` (la que sí lo comprueba es
-- la de DELETE, `Users can delete own reports`, con `generado_por = (SELECT
-- auth.uid())`). Se acotan las dos, porque dejar una sin acotar deja la puerta
-- abierta entera -- las políticas PERMISSIVE se suman con OR.
--
-- Tras esta migración las dos quedan con el MISMO predicado, o sea redundantes.
-- No se borra ninguna: un `DROP` no es reversible con un `ALTER` y el nombre
-- engañoso es un hallazgo de higiene aparte, no de seguridad. Se deja anotado.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ AHORA: EL DISPARADOR YA SE ACTIVÓ
-- ---------------------------------------------------------------------------
-- Desde el 2026-08-28 22:32Z existe la **primera cuenta Verificador de la
-- historia del sistema** (`uriel@escocia.com`). Está aprovisionada -- correo
-- confirmado, contraseña puesta, sin baneo ni borrado -- y `last_sign_in_at` es
-- NULL: nunca se ha autenticado. O sea que hoy el hueco no está siendo usado, y
-- está a una entrega de contraseña de estarlo.
--
-- Padrón verificado 2026-09-01: **6 Gerencia + 3 Administrador + 1 Verificador =
-- 10 activas, 0 inactivas**. El enum `rol_usuario` tiene exactamente tres
-- etiquetas -- Administrador, Verificador, Gerencia -- así que el único rol que
-- puede quedar fuera del nuevo predicado es Verificador. **Cuentas que pierden
-- capacidad: exactamente 1 de 10.**
--
-- La intención de diseño es inequívoca y está en el propio esquema: alguien ya
-- acotó las LECTURAS del Verificador con cuidado (`Verificador read
-- registros_trabajo`, y equivalentes en `tareas`, `tipos_tareas`, `productos`,
-- `movimientos_inventario`, `empleados`). Sus ESCRITURAS nunca se acotaron
-- porque hasta el 28 de agosto no existía ninguna cuenta con ese rol.
--
-- Y la única barrera que hay hoy del lado de la aplicación no es una barrera de
-- datos: `ProtectedRoute.tsx:33` sólo bloquea `rol === 'Monitor'`, y
-- `grep -rn 'allowedRoles' src/` devuelve **cuatro** `RoleGuard`, los cuatro
-- `['Gerencia']` -- ni uno solo nombra a Verificador. Lo demás que lo contiene
-- es `modulos_acceso = '{}'`, que el CLAUDE.md raíz define explícitamente como
-- visibilidad de navegación y NO como data boundary.
--
-- ---------------------------------------------------------------------------
-- LA SIMETRÍA QUE CIERRA EL CASO: EL CAMINO ABIERTO ES EL NO TRAZADO
-- ---------------------------------------------------------------------------
-- `trg_globalgap_correccion` (migración 113) es `AFTER UPDATE OR DELETE`.
-- **No traza INSERT.** Comprobado con `pg_get_triggerdef` sobre las 6 tablas
-- que lo llevan. En las 8 tablas GlobalGAP de esta lista el UPDATE ya está
-- cerrado por rol y el INSERT está abierto -- y el trigger traza exactamente el
-- que está cerrado. `trg_hato_correccion` (084) no aplica a ninguna de las 20.
-- `logs_auditoria` sigue con 0 filas desde siempre.
--
-- Enunciado preciso, para no exagerarlo: el UPDATE queda sin traza en las 12
-- tablas que no tienen trigger de corrección; el INSERT queda sin traza por
-- ninguna bitácora en las 20, con **atribución** (que no es traza) sólo en
-- `monitoreos` y `registros_trabajo`, vía `trg_set_monitoreo_user_id` y
-- `trg_set_registro_trabajo_registrado_por` (migración 074).
--
-- ---------------------------------------------------------------------------
-- LAS DOS SALIDAS DE ESCAPE FALLAN LAS DOS
-- ---------------------------------------------------------------------------
--   1. No hay ninguna política RESTRICTIVE que contenga a las 33:
--      `permissive='RESTRICTIVE'` devuelve 0 filas en las 20 tablas.
--   2. El cierre por GRANT que aplicó la 073 sobre `usuarios` **no está puesto
--      aquí**: `has_table_privilege('authenticated', …, 'INSERT'/'UPDATE')` es
--      `true` en las 20 y en los dos verbos.
--
-- Y **`anon` tiene los dos GRANT en las 20** (trampa del `ALTER DEFAULT
-- PRIVILEGES` de Supabase, lección de la 081). **Calibrado, sin inflarlo: hoy
-- `anon` NO puede escribir.** Cero de las 33 políticas always-true apuntan a
-- `public`/`anon` -- las 33 son `TO authenticated` -- así que la RLS lo niega y
-- esto es una trampa LATENTE, no una fuga en curso. Lo que sí es cierto es que
-- deja estas 20 tablas **a UNA política `TO public` de distancia** de la
-- escritura anónima. El `REVOKE` de la sección 3 no es decoración: es la mitad
-- que más pesa a futuro, y es la única que no depende de que nadie se equivoque.
--
-- ---------------------------------------------------------------------------
-- DECISIÓN DE ALCANCE SOBRE EL VERIFICADOR -- ES DELIBERADA, NO UN OLVIDO
-- ---------------------------------------------------------------------------
-- Santiago decidió el 2026-09-01 que **Uriel debe tener acceso al flujo de
-- verificación completo: la ronda de inventario está pensada justamente para
-- Verificadores.** Esta migración NO se lo quita, y conviene dejar escrito por
-- qué, porque quien lea este fichero en seis meses va a asumir lo contrario --
-- que al Verificador se lo olvidó otra vez, que es exactamente como nació el
-- agujero que esto cierra.
--
--   * **Ninguna de las 8 tablas de la ronda** (`rondas_inventario`,
--     `rondas_inventario_alcance`, `rondas_transcritos`, `rondas_excepciones`,
--     `rondas_reportes`, `rondas_avisos`, `inventario_causas_raiz`,
--     `inventario_parametros`) está entre estas 20. Tampoco `productos` ni
--     `movimientos_inventario`.
--   * **Los 12 RPC `fn_ronda_*` (126/130/131/132) no escriben en ninguna de las
--     20.** Verificado sobre `pg_get_functiondef` de los 12: ni uno menciona
--     `movimientos_diarios`. Los dos que sí mueven inventario real --
--     `fn_ronda_resolver_con_captura` y `fn_ronda_aplicar_ajuste` -- escriben en
--     `movimientos_inventario`, `productos` y `rondas_excepciones`. **El parecido
--     de nombre entre `movimientos_inventario` y `movimientos_diarios*` es la
--     trampa que había que descartar, y se descartó leyendo los cuerpos.**
--   * La autorización de la ronda no pasa por estas políticas: corre por
--     `fn_ronda_validar_actor` contra `telegram_usuarios`, que **no lee
--     `usuarios.rol` en ningún momento**; y el camino de Telegram llama los RPC
--     como `service_role`, que tiene `rolbypassrls`, así que ahí la RLS ni
--     siquiera se evalúa.
--
-- O sea: cerrar estas 20 a Gerencia+Administrador **no le quita a Uriel nada de
-- su trabajo de verificación**. Lo que le quita es escribir en labores,
-- aplicaciones, monitoreo, producción, lotes/sublotes, contratistas y reportes
-- semanales -- superficies que nunca se diseñaron para su rol y para las que no
-- existe una sola pantalla ni un solo `RoleGuard` que lo nombre.
--
-- ---------------------------------------------------------------------------
-- BARRIDO DE CAMINOS DE ESCRITURA -- la parte que hay que revisar, no la SQL
-- ---------------------------------------------------------------------------
-- La lección del 2026-08-28 fue que el revisor encontró 13 lectores donde el
-- autor había visto 10. Acá se barrió `src/`, los dos árboles de edge function y
-- `scripts/` buscando `.insert(`, `.update(`, `.upsert(`, `.delete(` y `.rpc(`
-- sobre las 20.
--
-- A) NAVEGADOR -- corren como `authenticated` y SÍ les aplica el nuevo predicado.
--    Ninguna de estas rutas lleva `RoleGuard` salvo donde se indica, así que hoy
--    las ejercen Gerencia y Administrador, los dos roles que el predicado admite:
--    **cero cambios de comportamiento al aplicar.**
--      apiarios          ConfigApiarios.tsx:107 update · :114 insert
--      aplicaciones_*    CalculadoraAplicaciones.tsx:589/646/681/705 insert
--                        AplicacionesList.tsx / CalculadoraAplicaciones.tsx:492-506 delete
--      contratistas      Contratistas.tsx:148 update · :159 insert
--      lotes             LotesConfig.tsx:107 insert · :116/:253/:258 update
--      mon_colmenas      RegistroColmenas.tsx:91 insert
--      mon_conductividad RegistroConductividad.tsx:246 insert
--      monitoreos        RegistroMonitoreo.tsx:278 insert · CargaMasiva.tsx:207 insert
--      movimientos_*     DailyMovementForm.tsx:669 insert (cabecera) · :711 productos
--                        · :766 trabajadores
--      plagas_…_catalogo CatalogoPlagas.tsx:215/:291 update · :229 insert
--      produccion        useProduccionData.ts:620 insert · useCapturaCosecha.ts:535
--                        update · :569 insert  (bajo `RoleGuard allowedRoles={['Gerencia']}`
--                        en ProduccionDashboard.tsx:150 -- el predicado nuevo es
--                        MÁS ancho que la guarda de UI, así que no rompe nada)
--      registros_trabajo RegistrarTrabajoDialog.tsx:257 insert
--                        EditarRegistroDialog.tsx:157 update
--      reportes_semanales reporteSemanalService.ts:262 upsert · :298 insert
--      rondas_monitoreo  calculosMonitoreoV2.ts:99 insert
--                        DashboardMonitoreoV3.tsx:940 update (cerrar ronda)
--      sublotes          SublotesConfig.tsx:149 insert · :157/:269/:274 update
--
--    Dos cosas que el barrido dejó claras y conviene no perder:
--      - **`movimientos_diarios_empleados` no tiene NINGÚN camino de escritura en
--        la aplicación.** La única referencia en todo el repo es el tipo generado
--        en `src/types/database.ts`. Su política INSERT no le sirve hoy a nadie.
--      - `reporteSemanalService.ts:262` intenta `upsert` y, si la RLS lo rechaza,
--        cae a `insert`. El rol que usa esa pantalla es el mismo que gatea el
--        endpoint `generar-reporte-semanal` (`ROLES_PERMITIDOS = Administrador,
--        Gerencia`), o sea el mismo conjunto de este predicado.
--
-- B) EDGE FUNCTIONS Y BOT DE TELEGRAM -- **no los toca esta migración.** Corren
--    con `SUPABASE_SERVICE_ROLE_KEY` (`telegram/bot.ts:115` crea el cliente con
--    esa clave), y `service_role` tiene `rolbypassrls`: la RLS no se evalúa.
--    `telegram/conversations/monitoreo.ts:904` (insert a `monitoreos`) y
--    `jornal.ts:761` (insert a `registros_trabajo`) siguen funcionando igual.
--    En `acciones-paquete-io.ts` los accesos a estas tablas son todos `select`.
--
-- C) DENTRO DE LA BASE -- comprobado sobre `pg_get_functiondef` de todo `public`
--    y sobre `pg_rewrite` (0 reglas distintas de `_RETURN`, o sea ninguna vista
--    escribible). Dos funciones `SECURITY INVOKER` escriben en una de las 20, y
--    las dos escriben en `registros_trabajo`:
--      1. `auto_create_registro_trabajo_from_movimiento()` -- trigger AFTER
--         INSERT OR UPDATE sobre `movimientos_diarios_empleados` y
--         `movimientos_diarios_trabajadores`. Hace `DELETE FROM
--         registros_trabajo` y luego `INSERT INTO registros_trabajo` **con la RLS
--         de quien insertó el movimiento**. Es un borrar-y-reinsertar de verdad,
--         pero vive dentro de un trigger y su mitad DELETE ya está acotada por
--         rol desde antes: hoy sólo funciona entera para Gerencia y
--         Administrador. Acotar el INSERT alinea las dos mitades en vez de
--         partirlas. **Es también la razón por la que estas 20 se cierran JUNTAS
--         y no en tandas**: dejar abierto el INSERT del padre y cerrar el del
--         hijo (o al revés) crearía un camino que empieza y no termina.
--      2. `fn_cerrar_aplicacion(jsonb)` (migración 106) -- `SECURITY INVOKER` a
--         propósito, escribe `registros_trabajo` como el llamante. La llama una
--         sesión Gerencia/Administrador, que conserva el permiso.
--    Ninguna otra función, trigger ni vista de `public` escribe en las 20.
--    Los 12 `fn_ronda_*` quedaron descartados arriba, uno por uno.
--
--    **`calcular_costo_jornal()` NO es un escritor y no se apoya nada en él.**
--    Es tentador citarlo porque la 123 lo puso en el mapa, pero es un trigger
--    BEFORE que sólo hace `SELECT` sobre `empleados`/`contratistas` y asigna
--    `NEW.costo_jornal`: verificado sobre su cuerpo, no ejecuta ni un `INSERT`,
--    `UPDATE` ni `DELETE` (`prosecdef = false`, cero DML). Se deja escrito para
--    que la próxima revisión no lo vuelva a contar como dependencia.
--
--    **RESTRICCIÓN DURA QUE SE DESPRENDE DE (1) Y (2): `registros_trabajo` y las
--    dos hijas `movimientos_diarios_empleados` / `movimientos_diarios_trabajadores`
--    tienen que recibir EXACTAMENTE EL MISMO conjunto de roles.** Si se separan,
--    cada guardado de movimiento diario muere por el rol más estrecho: el trigger
--    de (1) intentaría insertar en `registros_trabajo` sin política que lo admita
--    y la RLS abortaría la transacción del padre. Por el mismo motivo el conjunto
--    **no puede ser sólo Gerencia**: `fn_cerrar_aplicacion` escribe
--    `registros_trabajo` como el llamante y en la misma transacción toca
--    `aplicaciones`, `aplicaciones_cierre`, `tareas`, `productos` y
--    `movimientos_inventario`, todas ya acotadas a Administrador+Gerencia --
--    dejar `registros_trabajo` en Gerencia-only rompería el cierre de
--    aplicaciones del Administrador con un RAISE a mitad del RPC. Gerencia +
--    Administrador es el único conjunto coherente con lo que ya existe.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ TODO VA POR `ALTER POLICY` Y NO HAY NI UN `DROP`
-- ---------------------------------------------------------------------------
-- La 120 borró UNA política (el DELETE de `monitoreos`) porque era pura
-- redundancia contra dos políticas `ALL`. Acá hay dos casos parecidos --
-- `monitoreos` (ALL de Gerencia + ALL de Administrador cubren INSERT y UPDATE,
-- porque en una política ALL con `with_check` NULL el USING hace de check) y
-- `plagas_enfermedades_catalogo` (ALL de Gerencia + `Administrador actualiza
-- plagas`, que pese al nombre es una política de INSERT) -- y aun así **no se
-- borra ninguna**, por tres razones:
--
--   1. Son 33 cambios en una sola migración. Un `ALTER` es reversible con otro
--      `ALTER`; un `DROP` exige recrear la política a mano en el rollback, con
--      el riesgo de transcripción multiplicado por cada nombre.
--   2. La forma uniforme se puede comprobar con UNA post-condición sobre las 33,
--      en vez de con una excepción por caso.
--   3. El reparto es 18 contra 2, y el lado equivocado es el grande: **en 15 de
--      las 20 la always-true es el ÚNICO camino de escritura** -- un `DROP` ahí
--      no endurece, deja la tabla sin escritura para nadie, que es una caída --
--      y en `lotes`, `sublotes` y el UPDATE de `plagas_enfermedades_catalogo` la
--      única política de rol que hay al lado es de **Gerencia sola**, así que un
--      `DROP` le quitaría la escritura al Administrador, que hoy la tiene y usa
--      esas pantallas. Sólo `monitoreos` y `registros_trabajo` sobrevivirían a un
--      `DROP` (llevan `ALL` de Gerencia Y de Administrador). Dos de veinte no
--      justifican dos tratamientos.
--   4. Ninguna de las que quedarían redundantes es gratis de recrear: los nombres
--      están truncados a 63 caracteres por Postgres (`Usuarios autenticados
--      pueden actualizar plagas_enfermedades_cat`, sin la `alogo`), y un rollback
--      que reescriba mal un nombre crea una política nueva en vez de restaurar la
--      vieja.
--
-- Cuatro políticas UPDATE tienen hoy `with_check` NULL (`apiarios`,
-- `mon_colmenas`, `mon_conductividad`, `rondas_monitoreo`). En ese caso Postgres
-- usa el USING también como check, así que **se altera sólo el USING y se deja el
-- `with_check` en NULL**: cambiarlo a un valor explícito sería una deriva de
-- forma que el rollback ya no podría deshacer, para cero diferencia semántica.
--
-- ---------------------------------------------------------------------------
-- POR QUÉ LA GUARDA DEL PADRÓN NO LLEVA EL LITERAL `9`
-- ---------------------------------------------------------------------------
-- La acción recomendada del hallazgo pedía abortar si las cuentas activas de
-- Gerencia+Administrador bajaban de 9. **Se cambió a propósito, y es la
-- divergencia consciente de esta migración.** Dos motivos:
--
--   1. Es un literal absoluto contra una tabla que los humanos mutan -- la misma
--      forma de guarda que caducó a las 24 h en la 103 (`v_total <> 1910`) y que
--      hundió el primer borrador de la 120. **Y el padrón se movió dos veces en
--      cuatro días**: `uriel@escocia.com` (Verificador) el 28 de agosto y
--      `bot@escocia.com` (rol Gerencia, cuenta de automatización, ya con sesión
--      iniciada) el 30. Era 8 y hoy es 9. Cualquier alta o baja antes de aplicar
--      haría abortar la migración sin que nada estuviera mal. El literal `9` no
--      aparece en ninguna guarda de este fichero, ni siquiera en un WARNING: el
--      padrón se captura en ejecución y se informa con `RAISE NOTICE`.
--   2. No hay ninguna razón de seguridad para abortar cuando hay MENOS cuentas
--      privilegiadas: menos privilegio es menos riesgo. La invariante que sí
--      importa es que no queden CERO, porque eso sí dejaría la finca entera sin
--      poder escribir. Eso es lo que se comprueba, sin literales.
--
-- Y la guarda del padrón NO privilegiado es `RAISE WARNING`, nunca `RAISE
-- EXCEPTION` -- lección del primer borrador UNSAFE de la 120: **una guarda que
-- aborta justo cuando el agujero se vuelve real secuencia el defecto menor
-- delante del mayor**, y como una migración aplicada no se edita, mataría el
-- fichero. El día que exista un Verificador es exactamente el día en que esta
-- migración hace falta. Ese día ya llegó.
--
-- ---------------------------------------------------------------------------
-- LO QUE ESTA MIGRACIÓN NO HACE, A PROPÓSITO
-- ---------------------------------------------------------------------------
--   * No toca las políticas SELECT. La lectura de estas 20 sigue abierta a
--     `authenticated` (salvo `contratistas`, que cerró la 123). Es un hallazgo
--     distinto y de otra severidad.
--   * No toca `movimientos_diarios` UPDATE/DELETE ni `reportes_semanales`
--     DELETE, que ya están acotados por propietario (`created_by` /
--     `generado_por = (SELECT auth.uid())`). Ese es otro modelo, no un `true`.
--   * No revoca a `anon` el SELECT ni el TRUNCATE/REFERENCES/TRIGGER. Sí revoca
--     su DELETE en las tres tablas donde todavía lo tiene (ver sección 3): no es
--     ampliar el alcance por comodidad, es cerrar un residuo medido de la 110
--     sobre tablas que esta migración ya está tocando.
--   * No arregla el nombre engañoso de `Users can update own reports`.
--   * No agrega traza de INSERT a las tablas GlobalGAP. Extender la 113 a
--     `AFTER INSERT` es una decisión de producto con costo de volumen
--     (`monitoreos` son ~4.244 filas), no un endurecimiento de RLS.
--
-- ---------------------------------------------------------------------------
-- UN BENEFICIO LATERAL QUE VALE LA PENA DEJAR ESCRITO: 123 Y 133 SON PAREJA
-- ---------------------------------------------------------------------------
-- La 123 acotó el SELECT de `contratistas` a Gerencia+Administrador.
-- `calcular_costo_jornal()` es `SECURITY INVOKER` y LEE `contratistas` desde el
-- trigger BEFORE de `registros_trabajo`. Consecuencia que la propia 123 dejó
-- anotada como "consecuencia futura aceptada": un rol fuera de ese conjunto que
-- insertara un `registros_trabajo` con `contratista_id` no encontraba la fila y
-- guardaba `costo_jornal` en **NULL** -- un registro de mano de obra sin costo,
-- silencioso, sin error. **La 133 cierra ese camino de raíz**, porque ese rol ya
-- no puede insertar en `registros_trabajo`. Las dos migraciones se leen juntas.
--
-- FILAS AFECTADAS: **CERO**. Un `ALTER POLICY` y un `REVOKE` no leen, no
-- escriben, no borran y no actualizan ninguna fila de datos.
--
-- Precedentes: 077 (`ALTER POLICY`, nunca DROP+CREATE: es atómico y no abre una
-- ventana sin política) · 093 (predicado envuelto `(SELECT get_user_role())`,
-- que el planificador sube a un InitPlan y evalúa una vez por consulta, no una
-- por fila) · 081 (`REVOKE` explícito para `anon`) · 110/114/120/123 (acotar por
-- ROL y no por propietario, guardas con línea base relativa, WARNING para el
-- padrón) · 082 (calificar con `public.` la función y el tipo, por el
-- `search_path`).

-- ---------------------------------------------------------------------------
-- 1. Pre-condiciones. Cualquiera que falle aborta la transacción entera.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
  v_tablas integer;
  v_privilegiados integer;
  v_no_privilegiados text;
  v_monitoreos bigint;
  v_registros bigint;
BEGIN
  -- 1.1 Las 33 políticas always-true de INSERT/UPDATE siguen ahí, con la forma
  --     exacta que describe la cabecera, repartidas en 20 tablas distintas.
  --     Contar sólo políticas no basta: 33 repartidas en 19 tablas también
  --     suman 33 y dejarían una tabla fuera del análisis.
  SELECT count(*), count(DISTINCT tablename) INTO v_n, v_tablas
  FROM pg_policies
  WHERE schemaname = 'public'
    AND permissive = 'PERMISSIVE'
    AND cmd IN ('INSERT','UPDATE')
    AND 'authenticated' = ANY (roles)
    AND btrim(coalesce(qual, 'true')) = 'true'
    AND btrim(coalesce(with_check, 'true')) = 'true';
  IF v_n <> 33 OR v_tablas <> 20 THEN
    RAISE EXCEPTION 'PRE 1.1: se esperaban 33 politicas always-true de INSERT/UPDATE sobre 20 tablas; hay % sobre %. LA CAUSA MAS PROBABLE ES QUE ESTA MIGRACION YA SE APLICO -- comprobalo mirando si los predicados ya nombran get_user_role antes de asumir que alguien toco las politicas a mano. Este repo tiene historial de migraciones aplicadas sin fila en el ledger, asi que la ausencia de fila en schema_migrations NO prueba que no se aplico.', v_n, v_tablas;
  END IF;

  -- 1.2 Cero politicas RESTRICTIVE en las 20. Si apareciera alguna, el analisis
  --     de "las dos salidas de escape fallan" ya no describe el esquema.
  SELECT count(*) INTO v_n
  FROM pg_policies
  WHERE schemaname = 'public' AND permissive = 'RESTRICTIVE'
    AND tablename IN ('apiarios','aplicaciones_calculos','aplicaciones_compras','aplicaciones_lotes',
                      'aplicaciones_productos','contratistas','lotes','mon_colmenas','mon_conductividad',
                      'monitoreos','movimientos_diarios','movimientos_diarios_empleados',
                      'movimientos_diarios_productos','movimientos_diarios_trabajadores',
                      'plagas_enfermedades_catalogo','produccion','registros_trabajo','reportes_semanales',
                      'rondas_monitoreo','sublotes');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'PRE 1.2: aparecieron % politicas RESTRICTIVE en las 20 tablas; revisar antes de seguir.', v_n;
  END IF;

  -- 1.3 RLS habilitada en las 20. Sin ella las politicas no se evaluan y este
  --     cambio seria puramente decorativo.
  SELECT count(*) INTO v_n
  FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relrowsecurity
    AND c.relname IN ('apiarios','aplicaciones_calculos','aplicaciones_compras','aplicaciones_lotes',
                      'aplicaciones_productos','contratistas','lotes','mon_colmenas','mon_conductividad',
                      'monitoreos','movimientos_diarios','movimientos_diarios_empleados',
                      'movimientos_diarios_productos','movimientos_diarios_trabajadores',
                      'plagas_enfermedades_catalogo','produccion','registros_trabajo','reportes_semanales',
                      'rondas_monitoreo','sublotes');
  IF v_n <> 20 THEN
    RAISE EXCEPTION 'PRE 1.3: solo % de las 20 tablas tienen RLS habilitada.', v_n;
  END IF;

  -- 1.4 Linea base de politicas TOTALES sobre las 20 (de cualquier cmd), para
  --     que la post-condicion 4.5 pruebe que no se creo ni se perdio ninguna.
  SELECT count(*) INTO v_n
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('apiarios','aplicaciones_calculos','aplicaciones_compras','aplicaciones_lotes',
                      'aplicaciones_productos','contratistas','lotes','mon_colmenas','mon_conductividad',
                      'monitoreos','movimientos_diarios','movimientos_diarios_empleados',
                      'movimientos_diarios_productos','movimientos_diarios_trabajadores',
                      'plagas_enfermedades_catalogo','produccion','registros_trabajo','reportes_semanales',
                      'rondas_monitoreo','sublotes');
  PERFORM set_config('escociaos.mig133_politicas', v_n::text, false);

  -- 1.5 EL PADRON. Ver "POR QUE LA GUARDA DEL PADRON NO LLEVA EL LITERAL 9".
  --     Lo unico que aborta es que no quede NINGUNA cuenta privilegiada, porque
  --     eso dejaria a la finca entera sin poder escribir. Ningun literal.
  SELECT count(*) INTO v_privilegiados
  FROM public.usuarios
  WHERE activo AND rol IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario);
  IF v_privilegiados = 0 THEN
    RAISE EXCEPTION 'PRE 1.5: no hay ninguna cuenta activa de Gerencia ni Administrador. Aplicar esto dejaria a TODOS sin poder escribir en las 20 tablas.';
  END IF;
  -- Se INFORMA el padron real, no se compara contra ningun literal. Al escribir
  -- esta migracion eran 9 (6 Gerencia + 3 Administrador), pero ese numero se
  -- movio dos veces en los cuatro dias anteriores y no es una invariante.
  RAISE NOTICE 'PRE 1.5: % cuenta(s) activa(s) de Gerencia/Administrador conservan la escritura en las 20 tablas.', v_privilegiados;

  -- 1.6 El padron NO privilegiado -- AVISO, NUNCA ABORTO (leccion de la 120).
  SELECT string_agg(u.nombre_completo || ' (' || u.rol::text || ')', ', ')
    INTO v_no_privilegiados
  FROM public.usuarios u
  WHERE u.activo AND u.rol NOT IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario);
  IF v_no_privilegiados IS NOT NULL THEN
    RAISE WARNING 'PRE 1.6: estas cuentas activas pierden la escritura en las 20 tablas: %. ES EL ESCENARIO PARA EL QUE EXISTE ESTA MIGRACION, no un motivo para no aplicarla. Su trabajo de verificacion de inventario NO se ve afectado: la ronda autoriza por fn_ronda_validar_actor y ninguna de sus tablas ni de sus RPC toca estas 20.', v_no_privilegiados;
  END IF;

  -- 1.7 Linea base de filas de las dos tablas de volumen, RELATIVA y capturada
  --     en ejecucion (leccion de la 103: nunca un literal absoluto contra una
  --     tabla a la que el bot de Telegram escribe).
  SELECT count(*) INTO v_monitoreos FROM public.monitoreos;
  SELECT count(*) INTO v_registros  FROM public.registros_trabajo;
  PERFORM set_config('escociaos.mig133_monitoreos', v_monitoreos::text, false);
  PERFORM set_config('escociaos.mig133_registros',  v_registros::text,  false);
END $$;

-- ---------------------------------------------------------------------------
-- 2. El cambio: 33 `ALTER POLICY`, agrupados por tabla.
--    Predicado unico en las 33: Gerencia + Administrador, envuelto (093) y
--    calificado con `public.` (082). `get_user_role()` devuelve el enum
--    `rol_usuario` y con `auth.uid()` nulo da NULL; `NULL IN (...)` no es
--    cierto, asi que falla CERRADO.
--    Grieta conocida y NO cerrada aca, igual que en 110/114/120/123:
--    `get_user_role()` no filtra por `usuarios.activo` (hoy da igual, 0 cuentas
--    inactivas), y cerrarla solo aca seria incoherente con las 97 politicas de
--    la 093.
-- ---------------------------------------------------------------------------

-- apiarios
ALTER POLICY "Usuarios autenticados pueden insertar apiarios" ON public.apiarios
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));
-- `with_check` es NULL en esta politica UPDATE: Postgres usa el USING tambien
-- como check, asi que se altera solo el USING y la forma no deriva.
ALTER POLICY "Usuarios autenticados pueden actualizar apiarios" ON public.apiarios
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- aplicaciones_* (cadena de trazabilidad GlobalGAP, solo INSERT)
ALTER POLICY "authenticated_insert_aplicaciones_calculos" ON public.aplicaciones_calculos
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "authenticated_insert_aplicaciones_compras" ON public.aplicaciones_compras
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "authenticated_insert_aplicaciones_lotes" ON public.aplicaciones_lotes
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "authenticated_insert_aplicaciones_productos" ON public.aplicaciones_productos
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- contratistas (SELECT ya lo cerro la 123; DELETE, la 114)
ALTER POLICY "authenticated_insert_contratistas" ON public.contratistas
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "authenticated_update_contratistas" ON public.contratistas
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario))
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- lotes (DELETE ya lo cerro la 114, por la cascada hacia sublotes)
ALTER POLICY "Usuarios autenticados pueden insertar lotes" ON public.lotes
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "Usuarios autenticados pueden actualizar lotes" ON public.lotes
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario))
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- mon_colmenas
ALTER POLICY "Usuarios autenticados pueden insertar mon_colmenas" ON public.mon_colmenas
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));
-- `with_check` NULL: se altera solo el USING (ver nota en apiarios).
ALTER POLICY "Usuarios autenticados pueden actualizar mon_colmenas" ON public.mon_colmenas
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- mon_conductividad
ALTER POLICY "Usuarios autenticados pueden insertar mon_conductividad" ON public.mon_conductividad
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));
-- `with_check` NULL: se altera solo el USING (ver nota en apiarios).
ALTER POLICY "Usuarios autenticados pueden actualizar mon_conductividad" ON public.mon_conductividad
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- monitoreos (~4.244 filas, la serie de plagas desde 2025; DELETE lo cerro la 120)
ALTER POLICY "Usuarios autenticados pueden insertar monitoreos" ON public.monitoreos
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "Usuarios autenticados pueden actualizar monitoreos" ON public.monitoreos
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario))
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- movimientos_diarios* (GlobalGAP; UPDATE/DELETE de la cabecera ya estan
-- acotados por propietario y NO se tocan)
ALTER POLICY "Usuarios autenticados pueden crear movimientos diarios" ON public.movimientos_diarios
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "authenticated_insert_movimientos_diarios_empleados" ON public.movimientos_diarios_empleados
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "authenticated_insert_movimientos_diarios_productos" ON public.movimientos_diarios_productos
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "authenticated_insert_movimientos_diarios_trabajadores" ON public.movimientos_diarios_trabajadores
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- plagas_enfermedades_catalogo (nombres truncados a 63 caracteres por Postgres;
-- copiados verbatim de `pg_policies`, no reconstruidos)
ALTER POLICY "Usuarios autenticados pueden insertar plagas_enfermedades_catal" ON public.plagas_enfermedades_catalogo
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "Usuarios autenticados pueden actualizar plagas_enfermedades_cat" ON public.plagas_enfermedades_catalogo
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario))
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- produccion (base del rendimiento y del costo por kilo)
ALTER POLICY "Allow authenticated insert on produccion" ON public.produccion
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "Allow authenticated update on produccion" ON public.produccion
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario))
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- registros_trabajo (~2.787 filas; conserva su politica `Verificador read
-- registros_trabajo`, que es de SELECT y no se toca)
ALTER POLICY "authenticated_insert_registros_trabajo" ON public.registros_trabajo
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "authenticated_update_registros_trabajo" ON public.registros_trabajo
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario))
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- reportes_semanales -- LAS DOS politicas UPDATE, no una. `Users can update own
-- reports` miente en el nombre: su predicado es literalmente `true`. Dejar una
-- sin acotar dejaria la puerta abierta entera (las PERMISSIVE se suman con OR).
ALTER POLICY "Authenticated users can create reports" ON public.reportes_semanales
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "Authenticated users can update reports" ON public.reportes_semanales
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario))
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "Users can update own reports" ON public.reportes_semanales
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario))
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- rondas_monitoreo
ALTER POLICY "Usuarios autenticados pueden insertar rondas_monitoreo" ON public.rondas_monitoreo
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));
-- `with_check` NULL: se altera solo el USING (ver nota en apiarios).
ALTER POLICY "Usuarios autenticados pueden actualizar rondas_monitoreo" ON public.rondas_monitoreo
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- sublotes (DELETE lo cerro la 120)
ALTER POLICY "Usuarios autenticados pueden insertar sublotes" ON public.sublotes
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

ALTER POLICY "Usuarios autenticados pueden actualizar sublotes" ON public.sublotes
  USING ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario))
  WITH CHECK ((SELECT public.get_user_role()) IN ('Gerencia'::public.rol_usuario, 'Administrador'::public.rol_usuario));

-- ---------------------------------------------------------------------------
-- 3. Segunda capa: `anon` pierde los GRANT de INSERT y UPDATE en las 20
--    (precedente 081/110/114/120/123). Hoy los tiene por el `ALTER DEFAULT
--    PRIVILEGES` de Supabase y lo unico que lo detiene es no figurar en ninguna
--    politica -- o sea que es una trampa latente, no una fuga en curso.
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE ON public.apiarios                         FROM anon;
REVOKE INSERT, UPDATE ON public.aplicaciones_calculos            FROM anon;
REVOKE INSERT, UPDATE ON public.aplicaciones_compras             FROM anon;
REVOKE INSERT, UPDATE ON public.aplicaciones_lotes               FROM anon;
REVOKE INSERT, UPDATE ON public.aplicaciones_productos           FROM anon;
REVOKE INSERT, UPDATE ON public.contratistas                     FROM anon;
REVOKE INSERT, UPDATE ON public.lotes                            FROM anon;
REVOKE INSERT, UPDATE ON public.mon_colmenas                     FROM anon;
REVOKE INSERT, UPDATE ON public.mon_conductividad                FROM anon;
REVOKE INSERT, UPDATE ON public.monitoreos                       FROM anon;
REVOKE INSERT, UPDATE ON public.movimientos_diarios              FROM anon;
REVOKE INSERT, UPDATE ON public.movimientos_diarios_empleados    FROM anon;
REVOKE INSERT, UPDATE ON public.movimientos_diarios_productos    FROM anon;
REVOKE INSERT, UPDATE ON public.movimientos_diarios_trabajadores FROM anon;
REVOKE INSERT, UPDATE ON public.plagas_enfermedades_catalogo     FROM anon;
REVOKE INSERT, UPDATE ON public.produccion                       FROM anon;
REVOKE INSERT, UPDATE ON public.registros_trabajo                FROM anon;
REVOKE INSERT, UPDATE ON public.reportes_semanales               FROM anon;
REVOKE INSERT, UPDATE ON public.rondas_monitoreo                 FROM anon;
REVOKE INSERT, UPDATE ON public.sublotes                         FROM anon;

-- 3b. RESIDUO MEDIDO DE LA 110, que se cierra aca en vez de dejarlo para una
--     migracion propia. La 110 le quito a `anon` el DELETE de las cuatro
--     `aplicaciones_*` y de las TRES hijas `movimientos_diarios_*`, pero **nunca
--     de `movimientos_diarios`, que es el PADRE de la cadena GlobalGAP**; la 120
--     hizo lo suyo con monitoreo y produccion. Comprobado hoy con
--     `has_table_privilege`: de las 20 tablas de este fichero, `anon` conserva
--     DELETE en exactamente tres.
REVOKE DELETE ON public.movimientos_diarios  FROM anon;
REVOKE DELETE ON public.registros_trabajo    FROM anon;
REVOKE DELETE ON public.reportes_semanales   FROM anon;

-- ---------------------------------------------------------------------------
-- 4. Post-condiciones.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_n integer;
  v_tablas integer;
  v_antes text;
  v_ahora bigint;
BEGIN
  -- 4.1 No queda NINGUNA politica INSERT/UPDATE always-true en todo `public`.
  --     Se corre el barrido canonico COMPLETO, no acotado a las 20: si quedara
  --     una en otra tabla, esta migracion no cerro la clase.
  SELECT count(*) INTO v_n
  FROM pg_policies
  WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
    AND cmd IN ('INSERT','UPDATE') AND 'authenticated' = ANY (roles)
    AND btrim(coalesce(qual, 'true')) = 'true'
    AND btrim(coalesce(with_check, 'true')) = 'true';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'POST 4.1: quedan % politicas INSERT/UPDATE always-true en public.', v_n;
  END IF;

  -- 4.2 Las 33 quedaron acotadas Y envueltas (093), repartidas en las 20 tablas.
  --     Se cuentan las dos cosas por el mismo motivo que en la PRE 1.1.
  SELECT count(*), count(DISTINCT tablename) INTO v_n, v_tablas
  FROM pg_policies
  WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
    AND cmd IN ('INSERT','UPDATE') AND 'authenticated' = ANY (roles)
    AND tablename IN ('apiarios','aplicaciones_calculos','aplicaciones_compras','aplicaciones_lotes',
                      'aplicaciones_productos','contratistas','lotes','mon_colmenas','mon_conductividad',
                      'monitoreos','movimientos_diarios','movimientos_diarios_empleados',
                      'movimientos_diarios_productos','movimientos_diarios_trabajadores',
                      'plagas_enfermedades_catalogo','produccion','registros_trabajo','reportes_semanales',
                      'rondas_monitoreo','sublotes')
    AND coalesce(qual, with_check) LIKE '%SELECT%get_user_role%'
    AND coalesce(qual, with_check) LIKE '%Gerencia%'
    AND coalesce(qual, with_check) LIKE '%Administrador%'
    AND coalesce(with_check, qual) LIKE '%SELECT%get_user_role%';
  IF v_n <> 33 OR v_tablas <> 20 THEN
    RAISE EXCEPTION 'POST 4.2: quedaron % politicas acotadas sobre % tablas; se esperaban 33 sobre 20.', v_n, v_tablas;
  END IF;

  -- 4.3 `anon` no tiene INSERT ni UPDATE en ninguna de las 20.
  SELECT count(*) INTO v_n FROM (
    SELECT unnest(ARRAY['apiarios','aplicaciones_calculos','aplicaciones_compras','aplicaciones_lotes',
                        'aplicaciones_productos','contratistas','lotes','mon_colmenas','mon_conductividad',
                        'monitoreos','movimientos_diarios','movimientos_diarios_empleados',
                        'movimientos_diarios_productos','movimientos_diarios_trabajadores',
                        'plagas_enfermedades_catalogo','produccion','registros_trabajo','reportes_semanales',
                        'rondas_monitoreo','sublotes']) AS t
  ) x
  WHERE has_table_privilege('anon', 'public.' || x.t, 'INSERT')
     OR has_table_privilege('anon', 'public.' || x.t, 'UPDATE');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'POST 4.3: `anon` conserva INSERT o UPDATE en % de las 20 tablas.', v_n;
  END IF;

  -- 4.3b `anon` tampoco conserva DELETE en NINGUNA de las 20: la 110 y la 120
  --      cerraron 17 y la seccion 3b de esta cerro las 3 que faltaban.
  SELECT count(*) INTO v_n FROM (
    SELECT unnest(ARRAY['apiarios','aplicaciones_calculos','aplicaciones_compras','aplicaciones_lotes',
                        'aplicaciones_productos','contratistas','lotes','mon_colmenas','mon_conductividad',
                        'monitoreos','movimientos_diarios','movimientos_diarios_empleados',
                        'movimientos_diarios_productos','movimientos_diarios_trabajadores',
                        'plagas_enfermedades_catalogo','produccion','registros_trabajo','reportes_semanales',
                        'rondas_monitoreo','sublotes']) AS t
  ) x
  WHERE has_table_privilege('anon', 'public.' || x.t, 'DELETE');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'POST 4.3b: `anon` conserva DELETE en % de las 20 tablas.', v_n;
  END IF;

  -- 4.4 `authenticated` CONSERVA los dos GRANT en las 20. La reja es la RLS, no
  --     el grant: sin estos privilegios se romperia la escritura para TODOS los
  --     roles, Gerencia y Administrador incluidos.
  SELECT count(*) INTO v_n FROM (
    SELECT unnest(ARRAY['apiarios','aplicaciones_calculos','aplicaciones_compras','aplicaciones_lotes',
                        'aplicaciones_productos','contratistas','lotes','mon_colmenas','mon_conductividad',
                        'monitoreos','movimientos_diarios','movimientos_diarios_empleados',
                        'movimientos_diarios_productos','movimientos_diarios_trabajadores',
                        'plagas_enfermedades_catalogo','produccion','registros_trabajo','reportes_semanales',
                        'rondas_monitoreo','sublotes']) AS t
  ) x
  WHERE NOT has_table_privilege('authenticated', 'public.' || x.t, 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.' || x.t, 'UPDATE');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'POST 4.4: `authenticated` perdio INSERT o UPDATE en % tabla(s). Eso rompe la escritura tambien para Gerencia y Administrador.', v_n;
  END IF;

  -- 4.4b Y conserva el DELETE en las tres de la seccion 3b. El REVOKE era
  --      nominal a `anon`; si se hubiera llevado por delante a `authenticated`,
  --      moririan el borrado de movimientos diarios y el de registros de trabajo.
  SELECT count(*) INTO v_n FROM (
    SELECT unnest(ARRAY['movimientos_diarios','registros_trabajo','reportes_semanales']) AS t
  ) x
  WHERE NOT has_table_privilege('authenticated', 'public.' || x.t, 'DELETE');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'POST 4.4b: `authenticated` perdio el GRANT de DELETE en % tabla(s) de la seccion 3b.', v_n;
  END IF;

  -- 4.5 No se creo ni se perdio ninguna politica: el total sobre las 20 sigue
  --     igual que en la PRE 1.4. Es la prueba de que fueron 33 `ALTER` y cero
  --     `DROP`/`CREATE`.
  v_antes := nullif(current_setting('escociaos.mig133_politicas', true), '');
  IF v_antes IS NULL THEN
    RAISE WARNING 'POST 4.5: no se pudo leer la linea base de politicas (la seccion 1 corrio en otra sesion); la comprobacion NO se ejecuto.';
  ELSE
    SELECT count(*) INTO v_n
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('apiarios','aplicaciones_calculos','aplicaciones_compras','aplicaciones_lotes',
                        'aplicaciones_productos','contratistas','lotes','mon_colmenas','mon_conductividad',
                        'monitoreos','movimientos_diarios','movimientos_diarios_empleados',
                        'movimientos_diarios_productos','movimientos_diarios_trabajadores',
                        'plagas_enfermedades_catalogo','produccion','registros_trabajo','reportes_semanales',
                        'rondas_monitoreo','sublotes');
    IF v_n <> v_antes::integer THEN
      RAISE EXCEPTION 'POST 4.5: el total de politicas sobre las 20 tablas paso de % a %. Esta migracion solo hace ALTER; abortar.', v_antes, v_n;
    END IF;
  END IF;

  -- 4.6 RLS sigue habilitada en las 20.
  SELECT count(*) INTO v_n
  FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relrowsecurity
    AND c.relname IN ('apiarios','aplicaciones_calculos','aplicaciones_compras','aplicaciones_lotes',
                      'aplicaciones_productos','contratistas','lotes','mon_colmenas','mon_conductividad',
                      'monitoreos','movimientos_diarios','movimientos_diarios_empleados',
                      'movimientos_diarios_productos','movimientos_diarios_trabajadores',
                      'plagas_enfermedades_catalogo','produccion','registros_trabajo','reportes_semanales',
                      'rondas_monitoreo','sublotes');
  IF v_n <> 20 THEN
    RAISE EXCEPTION 'POST 4.6: solo % de las 20 tablas conservan RLS habilitada.', v_n;
  END IF;

  -- 4.7 NO SE PERDIO NI UNA FILA, contra la linea base RELATIVA de la PRE 1.7.
  --     Se comprueba con `<`, no con `<>`, y aqui esta el porque: `monitoreos` y
  --     `registros_trabajo` reciben escrituras del bot de Telegram por
  --     `service_role`, que no evalua RLS. Bajo READ COMMITTED, una insercion
  --     concurrente confirmada a mitad de esta transaccion se ve al final y con
  --     `<>` abortaria una migracion perfectamente sana. Un cambio de politicas
  --     no puede BORRAR filas, asi que la unica direccion que denuncia algo roto
  --     es hacia abajo. (La 120 uso `<>`; esto la afina.)
  v_antes := nullif(current_setting('escociaos.mig133_monitoreos', true), '');
  IF v_antes IS NULL THEN
    RAISE WARNING 'POST 4.7: no se pudo leer la linea base de filas; la comprobacion NO se ejecuto.';
  ELSE
    SELECT count(*) INTO v_ahora FROM public.monitoreos;
    IF v_ahora < v_antes::bigint THEN
      RAISE EXCEPTION 'POST 4.7: monitoreos paso de % a % filas. Un cambio de politicas no puede borrar filas; abortar.', v_antes, v_ahora;
    ELSIF v_ahora > v_antes::bigint THEN
      RAISE WARNING 'POST 4.7: monitoreos crecio de % a % filas durante la migracion (escritura concurrente por service_role). Benigno.', v_antes, v_ahora;
    END IF;

    v_antes := nullif(current_setting('escociaos.mig133_registros', true), '');
    SELECT count(*) INTO v_ahora FROM public.registros_trabajo;
    IF v_antes IS NOT NULL AND v_ahora < v_antes::bigint THEN
      RAISE EXCEPTION 'POST 4.7: registros_trabajo paso de % a % filas. Abortar.', v_antes, v_ahora;
    END IF;
  END IF;

  -- 4.8 El trabajo de 110/114/120 sigue en pie: cero politicas DELETE/ALL
  --     always-true sobre estas 20 para roles que no sean `service_role`.
  SELECT count(*) INTO v_n
  FROM pg_policies
  WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
    AND cmd IN ('DELETE','ALL') AND NOT ('service_role' = ANY (roles))
    AND btrim(coalesce(qual, 'true')) = 'true'
    AND tablename IN ('apiarios','aplicaciones_calculos','aplicaciones_compras','aplicaciones_lotes',
                      'aplicaciones_productos','contratistas','lotes','mon_colmenas','mon_conductividad',
                      'monitoreos','movimientos_diarios','movimientos_diarios_empleados',
                      'movimientos_diarios_productos','movimientos_diarios_trabajadores',
                      'plagas_enfermedades_catalogo','produccion','registros_trabajo','reportes_semanales',
                      'rondas_monitoreo','sublotes');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'POST 4.8: aparecieron % politicas DELETE/ALL always-true en las 20 tablas. Revisar si alguien corrio src/sql/fix_all_monitoreo_rls_policies.sql (marcado OBSOLETO -- NO EJECUTAR), que revierte 110/114/120.', v_n;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ROLLBACK (ejecutable, devuelve las 33 politicas exactamente a como estaban).
-- Las cuatro UPDATE que tenian `with_check` NULL se restauran alterando SOLO el
-- USING, para que la forma tampoco derive al volver.
--
--   ALTER POLICY "Usuarios autenticados pueden insertar apiarios" ON public.apiarios WITH CHECK (true);
--   ALTER POLICY "Usuarios autenticados pueden actualizar apiarios" ON public.apiarios USING (true);
--   ALTER POLICY "authenticated_insert_aplicaciones_calculos" ON public.aplicaciones_calculos WITH CHECK (true);
--   ALTER POLICY "authenticated_insert_aplicaciones_compras" ON public.aplicaciones_compras WITH CHECK (true);
--   ALTER POLICY "authenticated_insert_aplicaciones_lotes" ON public.aplicaciones_lotes WITH CHECK (true);
--   ALTER POLICY "authenticated_insert_aplicaciones_productos" ON public.aplicaciones_productos WITH CHECK (true);
--   ALTER POLICY "authenticated_insert_contratistas" ON public.contratistas WITH CHECK (true);
--   ALTER POLICY "authenticated_update_contratistas" ON public.contratistas USING (true) WITH CHECK (true);
--   ALTER POLICY "Usuarios autenticados pueden insertar lotes" ON public.lotes WITH CHECK (true);
--   ALTER POLICY "Usuarios autenticados pueden actualizar lotes" ON public.lotes USING (true) WITH CHECK (true);
--   ALTER POLICY "Usuarios autenticados pueden insertar mon_colmenas" ON public.mon_colmenas WITH CHECK (true);
--   ALTER POLICY "Usuarios autenticados pueden actualizar mon_colmenas" ON public.mon_colmenas USING (true);
--   ALTER POLICY "Usuarios autenticados pueden insertar mon_conductividad" ON public.mon_conductividad WITH CHECK (true);
--   ALTER POLICY "Usuarios autenticados pueden actualizar mon_conductividad" ON public.mon_conductividad USING (true);
--   ALTER POLICY "Usuarios autenticados pueden insertar monitoreos" ON public.monitoreos WITH CHECK (true);
--   ALTER POLICY "Usuarios autenticados pueden actualizar monitoreos" ON public.monitoreos USING (true) WITH CHECK (true);
--   ALTER POLICY "Usuarios autenticados pueden crear movimientos diarios" ON public.movimientos_diarios WITH CHECK (true);
--   ALTER POLICY "authenticated_insert_movimientos_diarios_empleados" ON public.movimientos_diarios_empleados WITH CHECK (true);
--   ALTER POLICY "authenticated_insert_movimientos_diarios_productos" ON public.movimientos_diarios_productos WITH CHECK (true);
--   ALTER POLICY "authenticated_insert_movimientos_diarios_trabajadores" ON public.movimientos_diarios_trabajadores WITH CHECK (true);
--   ALTER POLICY "Usuarios autenticados pueden insertar plagas_enfermedades_catal" ON public.plagas_enfermedades_catalogo WITH CHECK (true);
--   ALTER POLICY "Usuarios autenticados pueden actualizar plagas_enfermedades_cat" ON public.plagas_enfermedades_catalogo USING (true) WITH CHECK (true);
--   ALTER POLICY "Allow authenticated insert on produccion" ON public.produccion WITH CHECK (true);
--   ALTER POLICY "Allow authenticated update on produccion" ON public.produccion USING (true) WITH CHECK (true);
--   ALTER POLICY "authenticated_insert_registros_trabajo" ON public.registros_trabajo WITH CHECK (true);
--   ALTER POLICY "authenticated_update_registros_trabajo" ON public.registros_trabajo USING (true) WITH CHECK (true);
--   ALTER POLICY "Authenticated users can create reports" ON public.reportes_semanales WITH CHECK (true);
--   ALTER POLICY "Authenticated users can update reports" ON public.reportes_semanales USING (true) WITH CHECK (true);
--   ALTER POLICY "Users can update own reports" ON public.reportes_semanales USING (true) WITH CHECK (true);
--   ALTER POLICY "Usuarios autenticados pueden insertar rondas_monitoreo" ON public.rondas_monitoreo WITH CHECK (true);
--   ALTER POLICY "Usuarios autenticados pueden actualizar rondas_monitoreo" ON public.rondas_monitoreo USING (true);
--   ALTER POLICY "Usuarios autenticados pueden insertar sublotes" ON public.sublotes WITH CHECK (true);
--   ALTER POLICY "Usuarios autenticados pueden actualizar sublotes" ON public.sublotes USING (true) WITH CHECK (true);
--
-- Los GRANT de `anon` (INSERT/UPDATE en las 20, DELETE en las tres de 3b) NO se
-- restauran a proposito: nunca debieron existir, y devolverlos no es parte de
-- deshacer el cierre por rol.
-- ---------------------------------------------------------------------------
