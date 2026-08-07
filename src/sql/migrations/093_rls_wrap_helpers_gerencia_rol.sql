-- =============================================================================
-- 093_rls_wrap_helpers_gerencia_rol.sql
--
-- Envuelve como `(SELECT ...)` las 97 llamadas sueltas a
-- `public.es_usuario_gerencia()` y `public.get_user_role()` que quedan en las
-- policies RLS del schema `public`, en 34 tablas.
--
-- Es la secuela directa de la 077 y CORRIGE UNA AFIRMACION FALSA DE SU PROPIO
-- ENCABEZADO. La 077 NO se edita: esta aplicada y es inmutable. La correccion
-- vive aqui.
--
-- RENUMERADA de 081 a 093 al integrar con `main` (mismo caso que la 064, que
-- se renumero de 063). Se escribio el 2026-08-03 cuando 080 era la ultima;
-- mientras esperaba merge, `main` incorporo 081-086 y 089-092. El 081 ahora es
-- `respaldos_fuera_del_esquema_publico`, que no tiene nada que ver con esto.
-- 093 es el siguiente libre despues del maximo; 087 y 088 quedan como huecos
-- sin explicacion en el repo y NO se rellenan a proposito.
--
-- RE-VERIFICADA CONTRA PRODUCCION el 2026-08-07, antes de renumerar: siguen
-- 97 llamadas sueltas y 0 envueltas, y el conjunto de 97 destinos de este
-- archivo sigue dando el mismo md5 (5c98c96c41370ff378f91eed12c0852b, listas
-- ordenadas en colacion C) que las 97 policies vivas. Es decir: las 12
-- migraciones que entraron en medio no crearon, borraron ni renombraron
-- ninguna de las policies que este archivo toca. Las funciones tampoco
-- cambiaron: `provolatile='v'`, `proparallel='u'`, `prosecdef=true`.
--
-- Relacion con la 082 (`endurecer_funciones_y_grants`, aplicada el 2026-08-04):
-- es complementaria, no solapada. La 082 se ocupa de los GRANT de EXECUTE y
-- del `search_path`, y de hecho su propia verificacion aborta si `authenticated`
-- pierde EXECUTE sobre estas dos funciones "porque eso rompe 97 politicas RLS"
-- -- exactamente las 97 que esta migracion envuelve. Ninguna de las dos toca
-- lo que toca la otra.
--
--
-- LO QUE LA 077 AFIRMO, Y POR QUE ESTABA MAL
-- ------------------------------------------
-- La nota (a) de "POLICIES QUE SE DEJAN INTACTAS A PROPOSITO" de la 077 dice,
-- textualmente:
--
--     "Razon: ambas funciones son VOLATILE (verificado en produccion). Postgres
--      no hoistea funciones VOLATILE a InitPlan, asi que `(SELECT
--      es_usuario_gerencia())` seguiria evaluandose por fila. El arreglo real
--      seria marcarlas STABLE (...)"
--
-- Ese razonamiento es incorrecto. Una subconsulta escalar NO CORRELACIONADA se
-- convierte en InitPlan por una consecuencia ESTRUCTURAL de no estar
-- correlacionada con la fila: el planeador no consulta la volatilidad para
-- tomar esa decision. La volatilidad gobierna el constant-folding y la
-- colocacion de quals, no la formacion del InitPlan. Una funcion VOLATILE
-- dentro de un `(SELECT f())` sin correlacion se evalua UNA vez por sentencia
-- igual que una STABLE.
--
--
-- LA MEDICION QUE LO DESMIENTE (produccion, buffers calientes, `shared hit`)
-- ------------------------------------------------------------------------
-- Predicado puesto en un WHERE explicito, como usuario Gerencia:
--
--   Consulta                                                     Tiempo  Buffers
--   ---------------------------------------------------------- -------- -------
--   count(*) from fin_gastos where es_usuario_gerencia()         126,3ms   9.367
--   count(*) from fin_gastos where (select es_usuario_gerencia())  3,2ms     517
--   count(*) from monitoreos where get_user_role() = 'Gerencia'  155,4ms   8.821
--   count(*) from monitoreos where (select get_user_role()) = ..   2,8ms     471
--
-- Los planes envueltos muestran `InitPlan 1` + `One-Time Filter` con `loops=1`.
-- Los sueltos muestran `Filter: es_usuario_gerencia()` y ~1-2 buffers extra POR
-- FILA. Ademas, el plan suelto de `monitoreos` estima `rows=21` contra
-- `rows=4176` reales -- el planeador asume selectividad baja para un booleano
-- volatil suelto; el plan envuelto estima bien. O sea: envolver no solo ahorra
-- llamadas, tambien deja de envenenar las estimaciones de cardinalidad.
--
-- Mejora medida: ~40x en tiempo y ~18x en buffers. No es cosmetico.
--
--
-- `ALTER FUNCTION ... STABLE` SE CONSIDERO Y SE RECHAZA
-- ----------------------------------------------------
-- La 077 proponia marcar ambas funciones STABLE como "el arreglo real". No se
-- hace, y no por falta de tiempo:
--
--   1. Una vez envueltas, marcarlas STABLE no compra NADA medible. El InitPlan
--      ya las reduce a una evaluacion por sentencia; ese es el piso.
--   2. Es un cambio de contrato de la UNICA funcion de autorizacion de toda la
--      app: `es_usuario_gerencia()` es el predicado exclusivo de las 13 tablas
--      `fin_*`, y `get_user_role()` gobierna aplicaciones, despachos,
--      monitoreos, productos y usuarios. Declarar STABLE le promete al
--      planeador que el resultado no cambia dentro de la sentencia, lo que
--      habilita cacheos y reordenamientos adicionales que hoy no ocurren.
--
-- Beneficio medido cero contra riesgo sobre el limite de seguridad de la
-- aplicacion entera: no entra en esta migracion. El arreglo es el envoltorio,
-- y nada mas que el envoltorio.
--
--
-- UN CAVEAT REAL, QUE SE DOCUMENTA Y NO SE ARREGLA AQUI
-- ----------------------------------------------------
-- Ambas funciones son `proparallel = 'u'` (PARALLEL UNSAFE, verificado en
-- produccion junto con `provolatile = 'v'`). Cualquier consulta cuyo plan las
-- contenga -- envueltas o no -- queda inhabilitada para usar un plan paralelo
-- COMPLETO, no solo en ese nodo. Hoy es irrelevante: el proyecto corre con
-- `max_parallel_workers_per_gather = 1` y las tablas mas grandes rondan las 4k
-- filas, tamano en el que Postgres no elegiria un plan paralelo de todos modos.
-- Se deja anotado para cuando alguna tabla crezca un orden de magnitud. Igual
-- que STABLE, cambiar `proparallel` es tocar el contrato de la funcion y va en
-- su propia migracion, con su propia medicion.
--
--
-- POR QUE ES SEMANTICAMENTE IDENTICO
-- ----------------------------------
-- Ninguna de las dos funciones recibe argumentos ni referencia columnas de la
-- fila evaluada: `es_usuario_gerencia()` consulta `usuarios` por `auth.uid()` y
-- `get_user_role()` hace lo mismo. Por eso el `(SELECT f())` no esta
-- correlacionado y devuelve exactamente el mismo escalar que la llamada suelta.
-- Lo unico que cambia es CUANTAS VECES se evalua, nunca QUE devuelve. Ninguna
-- fila que hoy es visible deja de serlo, y ninguna que hoy esta bloqueada se
-- abre.
--
-- Sutileza que vale nombrar: si el `rol` del usuario cambiara EN MEDIO de una
-- sentencia, la version suelta podria (en teoria) ver dos valores distintos en
-- filas distintas de la misma consulta, y la envuelta no. Eso no es una
-- regresion sino lo contrario -- un predicado de autorizacion que se evalua una
-- sola vez por sentencia es MAS coherente, no menos. Y en la practica no
-- ocurre: nada en la app modifica `usuarios.rol` durante una lectura, y desde
-- la 073 `UPDATE` sobre `usuarios` esta revocado para `authenticated`.
--
-- Ningun predicado se reescribe, se simplifica ni se reordena: cada uno se
-- reproduce verbatim y solo se le agregan los parentesis del SELECT. El
-- predicado original va como comentario encima de cada bloque para que el diff
-- sea auditable linea por linea.
--
-- Se usa `ALTER POLICY` y no `DROP` + `CREATE`: es atomico, no deja una ventana
-- en la que la tabla quede sin esa policy, y no puede perder por accidente el
-- `TO <rol>` ni el `AS PERMISSIVE` originales. Tambien lo hace idempotente:
-- correr la migracion dos veces deja el mismo predicado.
--
-- En las policies `FOR ALL` cuyo `with_check` esta en NULL (hereda del USING)
-- se toca SOLO el USING, para que siga heredando. Las 37 policies `ALL` de esta
-- migracion estan TODAS en ese caso (verificado en `pg_policies`).
--
-- Las llamadas se escriben calificadas por schema -- `public.get_user_role()`,
-- no `get_user_role()` -- para que la resolucion no dependa del `search_path`
-- de quien aplique la migracion. Es la misma funcion: Postgres guarda el OID en
-- el arbol y `pg_policies` la volvera a mostrar sin calificar.
--
--
-- ALCANCE
-- -------
-- Policies reescritas: 97 en 34 tablas (verificado contra `pg_policies`, no
-- estimado).
--   * `public.get_user_role()`        50 policies
--   * `public.es_usuario_gerencia()`  47 policies
--   Ninguna policy usa las dos, por eso 50 + 47 = 97 sin solapamiento.
--
-- Filas de datos afectadas: 0. Es un cambio de predicado, no de contenido.
--
-- GlobalGAP: alcanza `aplicaciones*`, `despachos*`, `despachos_trazabilidad`,
-- `movimientos_inventario` y `logs_auditoria`. El cambio no altera QUIEN ve
-- esas filas -- solo cuantas veces se evalua el predicado -- pero por tocar
-- trazabilidad la verificacion del final es bloqueante, no informativa.
--
-- Lo que esta migracion NO hace, igual que la 077: no toca las 485 advertencias
-- `multiple_permissive_policies` (consolidar policies permisivas cambia el
-- modelo de acceso y exige revision de seguridad propia), ni las 12 policies de
-- `storage.objects`, ni la asimetria de `usuarios.activo` entre bloques que la
-- 077 documento y conservo.
--
-- Referencia: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOQUE 1 -- `get_user_role() = 'Gerencia'` en policies [ALL] (22 policies)
-- -----------------------------------------------------------------------------
-- Las 22 se llaman igual, "Gerencia acceso total", y tienen el MISMO predicado
-- exacto (verificado con un GROUP BY sobre `pg_policies`: un solo grupo, n=22).
-- Todas son [ALL] con `with_check` en NULL, asi que se toca SOLO el USING.
--
-- original (identico en las 22):
--   (get_user_role() = 'Gerencia'::rol_usuario)
--
-- Se escriben las 22 completas a proposito: no hay forma de parametrizar un
-- predicado de policy, y un DO-loop con SQL dinamico haria el diff imposible de
-- auditar. Este es el bloque de mayor impacto medible -- incluye `monitoreos`
-- (4.155 filas) y `movimientos_inventario`.

ALTER POLICY "Gerencia acceso total" ON public.aplicaciones
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.aplicaciones_cierre
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.aplicaciones_lotes_planificado
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.aplicaciones_mezclas
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.clientes
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.compras
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.cosechas
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.despachos
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.despachos_trazabilidad
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.focos
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.focos_productos
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.logs_auditoria
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.lotes
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.monitoreos
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.movimientos_inventario
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.plagas_enfermedades_catalogo
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.preselecciones
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.productos
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.sublotes
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.usuarios
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.verificaciones_detalle
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

ALTER POLICY "Gerencia acceso total" ON public.verificaciones_inventario
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);


-- -----------------------------------------------------------------------------
-- BLOQUE 2 -- `get_user_role() = 'Administrador'` en policies [ALL] (13)
-- -----------------------------------------------------------------------------
-- Mismo caso que el bloque 1, con el otro rol. Un solo grupo en el GROUP BY,
-- n=13, todas [ALL] con `with_check` NULL.
--
-- original (identico en las 13):
--   (get_user_role() = 'Administrador'::rol_usuario)

ALTER POLICY "Administrador puede todo en aplicaciones" ON public.aplicaciones
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

ALTER POLICY "Administrador puede todo en cierre" ON public.aplicaciones_cierre
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

ALTER POLICY "Administrador puede todo en lotes_planificado" ON public.aplicaciones_lotes_planificado
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

ALTER POLICY "Administrador puede todo en mezclas" ON public.aplicaciones_mezclas
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

ALTER POLICY "Administrador puede todo en compras" ON public.compras
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

ALTER POLICY "Administrador puede todo en cosechas" ON public.cosechas
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

ALTER POLICY "Administrador puede todo en despachos" ON public.despachos
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

ALTER POLICY "Administrador puede todo en trazabilidad" ON public.despachos_trazabilidad
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

ALTER POLICY "Administrador puede todo en focos" ON public.focos
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

ALTER POLICY "Administrador puede todo en focos_productos" ON public.focos_productos
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

ALTER POLICY "Administrador puede todo en monitoreos" ON public.monitoreos
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

ALTER POLICY "Administrador puede todo en movimientos" ON public.movimientos_inventario
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

ALTER POLICY "Administrador puede todo en preselecciones" ON public.preselecciones
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);


-- -----------------------------------------------------------------------------
-- BLOQUE 3 -- `get_user_role() = 'Administrador'` en policies por comando (9)
-- -----------------------------------------------------------------------------
-- Mismo predicado que el bloque 2, pero en policies acotadas a un comando. En
-- las [INSERT] el predicado vive en `with_check` y `qual` esta en NULL, asi que
-- se toca SOLO el WITH CHECK -- poner un USING ahi seria inventar un predicado
-- que hoy no existe.
--
-- OJO con `plagas_enfermedades_catalogo."Administrador actualiza plagas"`: el
-- nombre dice "actualiza" pero el comando es INSERT. Esa discrepancia ya existe
-- en produccion y se conserva tal cual -- renombrar una policy no es un arreglo
-- de initplan.
--
-- original (identico en las 9):
--   (get_user_role() = 'Administrador'::rol_usuario)

-- [SELECT]
ALTER POLICY "Administrador lee clientes" ON public.clientes
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

-- [SELECT]
ALTER POLICY "Administrador lee lotes" ON public.lotes
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

-- [SELECT]
ALTER POLICY "Administrador lee plagas" ON public.plagas_enfermedades_catalogo
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

-- [SELECT]
ALTER POLICY "Administrador lectura productos" ON public.productos
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

-- [SELECT]
ALTER POLICY "Administrador lee sublotes" ON public.sublotes
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

-- [INSERT]
ALTER POLICY "Administrador crea clientes" ON public.clientes
  WITH CHECK ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

-- [INSERT]
ALTER POLICY "Administrador actualiza plagas" ON public.plagas_enfermedades_catalogo
  WITH CHECK ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

-- [INSERT]
ALTER POLICY "Administrador escritura productos" ON public.productos
  WITH CHECK ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);

-- [UPDATE]
ALTER POLICY "Administrador actualiza productos" ON public.productos
  USING ((SELECT public.get_user_role()) = 'Administrador'::rol_usuario);


-- -----------------------------------------------------------------------------
-- BLOQUE 4 -- `get_user_role() = 'Verificador'` (4 policies)
-- -----------------------------------------------------------------------------
-- Dos [ALL] con `with_check` NULL y dos [SELECT]. En las cuatro el predicado
-- vive en el USING.
--
-- original (identico en las 4):
--   (get_user_role() = 'Verificador'::rol_usuario)

-- [ALL]
ALTER POLICY "Verificador puede todo en verificaciones_detalle" ON public.verificaciones_detalle
  USING ((SELECT public.get_user_role()) = 'Verificador'::rol_usuario);

-- [ALL]
ALTER POLICY "Verificador puede todo en verificaciones" ON public.verificaciones_inventario
  USING ((SELECT public.get_user_role()) = 'Verificador'::rol_usuario);

-- [SELECT]
ALTER POLICY "Verificador lee movimientos" ON public.movimientos_inventario
  USING ((SELECT public.get_user_role()) = 'Verificador'::rol_usuario);

-- [SELECT]
ALTER POLICY "Verificador lee productos" ON public.productos
  USING ((SELECT public.get_user_role()) = 'Verificador'::rol_usuario);


-- -----------------------------------------------------------------------------
-- BLOQUE 5 -- Los dos casos que no caen en ningun patron (2 policies)
-- -----------------------------------------------------------------------------

-- logs_auditoria "Solo Gerencia lee logs" [SELECT]
-- GlobalGAP: es la policy de lectura del log de auditoria. `logs_auditoria`
-- tiene ademas su propia "Gerencia acceso total" [ALL], ya cubierta en el
-- bloque 1; esta es la segunda policy permisiva de la misma tabla y por eso
-- aparece dos veces el mismo rol. Consolidarlas seria trabajo de la nota sobre
-- `multiple_permissive_policies`, fuera de alcance.
--
-- original USING: (get_user_role() = 'Gerencia'::rol_usuario)
ALTER POLICY "Solo Gerencia lee logs" ON public.logs_auditoria
  USING ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario);

-- usuarios "Usuario ve su perfil" [SELECT] -- el unico predicado con OR.
-- La 077 ya envolvio la mitad `auth.uid()` y dejo la otra mitad suelta (su nota
-- (d) lo dice explicitamente). Aqui se cierra.
--
-- estado DESPUES de la 077, verbatim de `pg_policies`:
--   ((id = ( SELECT auth.uid() AS uid)) OR (get_user_role() = 'Gerencia'::rol_usuario))
--
-- La agrupacion se conserva exacta: dos ramas OR-eadas, cada una en su propio
-- parentesis, y el OR envolviendo a las dos. La rama izquierda (`id = auth.uid()`)
-- se reproduce tal cual la dejo la 077 -- no se toca. Solo cambia la derecha:
--   (get_user_role() = 'Gerencia'::rol_usuario)
--     ->  ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario)
-- El `(SELECT ...)` queda DENTRO del parentesis de la comparacion, no
-- envolviendola: envolver la comparacion entera daria un predicado distinto de
-- leer (aunque equivalente) y rompe la transcripcion verbatim.
ALTER POLICY "Usuario ve su perfil" ON public.usuarios
  USING (
    (id = (SELECT auth.uid()))
    OR ((SELECT public.get_user_role()) = 'Gerencia'::rol_usuario)
  );


-- -----------------------------------------------------------------------------
-- BLOQUE 6 -- `es_usuario_gerencia()` en las 10 tablas `fin_*` (40 policies)
-- -----------------------------------------------------------------------------
-- Cuatro policies por tabla (select/insert/update/delete), `TO public`. El
-- predicado es la llamada pelada, sin comparacion:
--
--   select / update / delete   USING:      es_usuario_gerencia()
--   insert                     WITH CHECK: es_usuario_gerencia()
--
-- En las de insert `qual` esta en NULL y en las otras tres `with_check` esta en
-- NULL: cada ALTER toca exactamente la clausula que hoy existe.
--
-- Este bloque es el que la medicion del encabezado cronometro sobre
-- `fin_gastos` (126,3ms -> 3,2ms). `fin_gastos` tiene 4.426 filas (contadas en
-- produccion el 2026-08-03; el issue #96 decia ~2.500, quedo desactualizado) y
-- se lee ENTERA en cada carga de /finanzas/reportes, porque el CLAUDE.md exige
-- que toda consulta de reportes pase por `fetchAll` para esquivar el tope de
-- 1.000 filas de PostgREST. Por eso este bloque es el que mas gana: es
-- justamente el caso "escaneo completo", no el de un LIMIT corto.

-- ---- fin_categorias_gastos ----
ALTER POLICY "fin_categorias_gastos_select" ON public.fin_categorias_gastos
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_categorias_gastos_insert" ON public.fin_categorias_gastos
  WITH CHECK ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_categorias_gastos_update" ON public.fin_categorias_gastos
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_categorias_gastos_delete" ON public.fin_categorias_gastos
  USING ((SELECT public.es_usuario_gerencia()));

-- ---- fin_categorias_ingresos ----
ALTER POLICY "fin_categorias_ingresos_select" ON public.fin_categorias_ingresos
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_categorias_ingresos_insert" ON public.fin_categorias_ingresos
  WITH CHECK ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_categorias_ingresos_update" ON public.fin_categorias_ingresos
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_categorias_ingresos_delete" ON public.fin_categorias_ingresos
  USING ((SELECT public.es_usuario_gerencia()));

-- ---- fin_compradores ----
ALTER POLICY "fin_compradores_select" ON public.fin_compradores
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_compradores_insert" ON public.fin_compradores
  WITH CHECK ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_compradores_update" ON public.fin_compradores
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_compradores_delete" ON public.fin_compradores
  USING ((SELECT public.es_usuario_gerencia()));

-- ---- fin_conceptos_gastos ----
ALTER POLICY "fin_conceptos_gastos_select" ON public.fin_conceptos_gastos
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_conceptos_gastos_insert" ON public.fin_conceptos_gastos
  WITH CHECK ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_conceptos_gastos_update" ON public.fin_conceptos_gastos
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_conceptos_gastos_delete" ON public.fin_conceptos_gastos
  USING ((SELECT public.es_usuario_gerencia()));

-- ---- fin_gastos ----
ALTER POLICY "fin_gastos_select" ON public.fin_gastos
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_gastos_insert" ON public.fin_gastos
  WITH CHECK ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_gastos_update" ON public.fin_gastos
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_gastos_delete" ON public.fin_gastos
  USING ((SELECT public.es_usuario_gerencia()));

-- ---- fin_ingresos ----
ALTER POLICY "fin_ingresos_select" ON public.fin_ingresos
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_ingresos_insert" ON public.fin_ingresos
  WITH CHECK ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_ingresos_update" ON public.fin_ingresos
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_ingresos_delete" ON public.fin_ingresos
  USING ((SELECT public.es_usuario_gerencia()));

-- ---- fin_medios_pago ----
ALTER POLICY "fin_medios_pago_select" ON public.fin_medios_pago
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_medios_pago_insert" ON public.fin_medios_pago
  WITH CHECK ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_medios_pago_update" ON public.fin_medios_pago
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_medios_pago_delete" ON public.fin_medios_pago
  USING ((SELECT public.es_usuario_gerencia()));

-- ---- fin_negocios ----
ALTER POLICY "fin_negocios_select" ON public.fin_negocios
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_negocios_insert" ON public.fin_negocios
  WITH CHECK ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_negocios_update" ON public.fin_negocios
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_negocios_delete" ON public.fin_negocios
  USING ((SELECT public.es_usuario_gerencia()));

-- ---- fin_proveedores ----
ALTER POLICY "fin_proveedores_select" ON public.fin_proveedores
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_proveedores_insert" ON public.fin_proveedores
  WITH CHECK ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_proveedores_update" ON public.fin_proveedores
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_proveedores_delete" ON public.fin_proveedores
  USING ((SELECT public.es_usuario_gerencia()));

-- ---- fin_regiones ----
ALTER POLICY "fin_regiones_select" ON public.fin_regiones
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_regiones_insert" ON public.fin_regiones
  WITH CHECK ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_regiones_update" ON public.fin_regiones
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_regiones_delete" ON public.fin_regiones
  USING ((SELECT public.es_usuario_gerencia()));


-- -----------------------------------------------------------------------------
-- BLOQUE 7 -- `es_usuario_gerencia()` en las policies `TO authenticated` (7)
-- -----------------------------------------------------------------------------
-- Mismo predicado que el bloque 6 pero concedidas `TO authenticated` en vez de
-- `TO public` (patron de las migraciones 052 y 058). `ALTER POLICY` conserva el
-- `TO` original sin que haya que repetirlo.
--
-- `hato_config` tiene tres, no cuatro: su policy de SELECT es abierta a todo
-- authenticated (el motor de alertas lee los parametros para cualquier usuario
-- del hato, decision de la 058), asi que no menciona `es_usuario_gerencia()` y
-- no entra aqui.

-- ---- fin_parametros (052) ----
ALTER POLICY "fin_parametros_select" ON public.fin_parametros
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_parametros_insert" ON public.fin_parametros
  WITH CHECK ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_parametros_update" ON public.fin_parametros
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "fin_parametros_delete" ON public.fin_parametros
  USING ((SELECT public.es_usuario_gerencia()));

-- ---- hato_config (058) ----
ALTER POLICY "hato_config_insert" ON public.hato_config
  WITH CHECK ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "hato_config_update" ON public.hato_config
  USING ((SELECT public.es_usuario_gerencia()));
ALTER POLICY "hato_config_delete" ON public.hato_config
  USING ((SELECT public.es_usuario_gerencia()));


-- =============================================================================
-- VERIFICACION
-- =============================================================================
-- Falla ruidosamente si queda UNA sola llamada suelta a `es_usuario_gerencia()`
-- o `get_user_role()` en cualquier policy del schema `public`.
--
-- El chequeo no depende de como Postgres deparsee el subselect (que se reescribe
-- como `( SELECT es_usuario_gerencia() AS es_usuario_gerencia)`): cuenta las
-- ocurrencias TOTALES del nombre de cada funcion y las compara con las
-- ocurrencias precedidas de `SELECT `. Toda ocurrencia envuelta contiene la
-- segunda cadena; toda ocurrencia suelta no. Si los dos conteos coinciden, no
-- queda ninguna suelta.
--
-- Se cuenta sobre `qual || with_check` de cada policy por separado, no sobre el
-- total del schema, para poder nombrar exactamente cual quedo mal.
-- =============================================================================

DO $$
DECLARE
  v_sueltas   integer;
  v_detalle   text;
  v_envueltas integer;
BEGIN
  WITH p AS (
    SELECT tablename,
           policyname,
           coalesce(qual, '') || ' ' || coalesce(with_check, '') AS pred
      FROM pg_policies
     WHERE schemaname = 'public'
  ),
  conteo AS (
    SELECT tablename, policyname,
           (length(pred) - length(replace(pred, 'es_usuario_gerencia()', ''))) / length('es_usuario_gerencia()')
         + (length(pred) - length(replace(pred, 'get_user_role()',       ''))) / length('get_user_role()')
           AS total,
           (length(pred) - length(replace(pred, 'SELECT es_usuario_gerencia()', ''))) / length('SELECT es_usuario_gerencia()')
         + (length(pred) - length(replace(pred, 'SELECT get_user_role()',       ''))) / length('SELECT get_user_role()')
           AS envueltas
      FROM p
  )
  SELECT count(*) FILTER (WHERE total > envueltas),
         string_agg(tablename || '.' || policyname, ', ' ORDER BY tablename, policyname)
           FILTER (WHERE total > envueltas),
         coalesce(sum(envueltas), 0)
    INTO v_sueltas, v_detalle, v_envueltas
    FROM conteo;

  IF v_sueltas > 0 THEN
    RAISE EXCEPTION
      '093: quedan % policies con es_usuario_gerencia()/get_user_role() sin envolver en public: %',
      v_sueltas, v_detalle;
  END IF;

  -- Segundo chequeo, contra una aplicacion PARCIAL: el primero cuenta policies
  -- con alguna llamada suelta, y ese conteo tambien da 0 si media migracion no
  -- corrio y esas policies simplemente no existen. Antes de aplicar hay 97
  -- ocurrencias totales y 0 envueltas (medido en produccion), asi que despues
  -- tienen que ser 97 envueltas.
  --
  -- Se compara con `<` y no con `<>` a proposito: si mas adelante alguien crea
  -- una policy nueva que ya nazca envuelta, el numero sube legitimamente por
  -- encima de 97 y esta migracion no debe empezar a fallar por eso.
  IF v_envueltas < 97 THEN
    RAISE EXCEPTION
      '093: se esperaban al menos 97 llamadas envueltas en public y hay %. Aplicacion parcial: revisar antes de darla por buena.',
      v_envueltas;
  END IF;

  RAISE NOTICE '093 OK: 97 llamadas envueltas, 0 sueltas en el schema public.';
END $$;

-- Consulta manual equivalente, para correr en el SQL editor despues de aplicar
-- (debe devolver 0 filas):
--
--   SELECT tablename, policyname, cmd
--     FROM pg_policies
--    WHERE schemaname = 'public'
--      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(es_usuario_gerencia|get_user_role)\(\)'
--      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) !~ 'SELECT (es_usuario_gerencia|get_user_role)\(\)';
--
-- Y el conteo positivo, que debe dar 97:
--
--   SELECT count(*) FROM pg_policies
--    WHERE schemaname = 'public'
--      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'SELECT (es_usuario_gerencia|get_user_role)\(\)';
--
-- Comprobacion de que el plan efectivamente cambio (como usuario Gerencia, no
-- con service_role -- el service_role saltea RLS y el plan no lleva el
-- predicado):
--
--   EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM fin_gastos;
--
-- Debe mostrar `InitPlan 1` + `One-Time Filter: $0` con `loops=1`, en vez de
-- `Filter: es_usuario_gerencia()`.


-- =============================================================================
-- LO QUE SIGUE PENDIENTE DESPUES DE ESTA MIGRACION
-- =============================================================================
-- (a) 12 policies de `storage.objects` (facturas de la 039, chequeos-fotos de
--     la 072) siguen llamando `auth.uid()` suelto. La 077 las documento y no
--     las toco por vivir en un schema administrado por Supabase; esta tampoco.
--
-- (b) 485 advertencias `multiple_permissive_policies`. Fuera de alcance por
--     decision explicita: consolidarlas cambia el modelo de acceso.
--     `logs_auditoria` es el ejemplo mas claro -- dos policies permisivas que
--     dicen lo mismo con el mismo rol.
--
-- (c) `proparallel = 'u'` en ambas funciones. Ver el caveat del encabezado.
--
-- (d) La asimetria de `usuarios.activo`: `es_usuario_gerencia()` SI exige
--     `activo = true`, `get_user_role()` NO. Un usuario desactivado conserva su
--     `rol`, asi que sigue pasando todos los predicados de `get_user_role()`
--     (aplicaciones, despachos, monitoreos, productos) y falla los de
--     `es_usuario_gerencia()` (todas las `fin_*`). Existe hoy en produccion,
--     esta migracion la conserva intacta, y NO es un problema de rendimiento
--     sino del modelo de acceso: merece su propia revision.


-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Cada `ALTER POLICY` de arriba se revierte con el mismo ALTER quitando el
-- `(SELECT ...)`. El predicado original de cada bloque esta transcrito verbatim
-- en el comentario que lo precede, asi que el rollback se construye desde este
-- mismo archivo sin necesidad de un dump. Los cuatro predicados originales, en
-- su totalidad, son:
--
--   (get_user_role() = 'Gerencia'::rol_usuario)         -- bloques 1 y 5
--   (get_user_role() = 'Administrador'::rol_usuario)    -- bloques 2 y 3
--   (get_user_role() = 'Verificador'::rol_usuario)      -- bloque 4
--   es_usuario_gerencia()                               -- bloques 6 y 7
--
-- mas el unico compuesto, `usuarios."Usuario ve su perfil"`:
--   ((id = ( SELECT auth.uid() AS uid)) OR (get_user_role() = 'Gerencia'::rol_usuario))
--
-- Dicho eso: revertir no deberia hacer falta nunca. El cambio no altera que
-- filas ve cada rol, solo cuantas veces se evalua el predicado. Si tras aplicar
-- aparece un problema de permisos, la causa NO esta aqui -- buscarla en las
-- policies permisivas multiples, en la asimetria de `activo` de la nota (d), o
-- en `usuarios.rol` del usuario afectado.
-- =============================================================================
