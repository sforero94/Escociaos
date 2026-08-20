# Memoria — Infra Perf

Escrita solo por el orquestador (ver `README.md`). Inyectada completa en el
prompt del agente en cada corrida.

## Estados aceptados
- **Los `TIMEOUT` en `net._http_response` del clima son cosmeticos, no perdida de
  datos.** pg_net corta a 5.000 ms; los logs muestran `/clima/sync` con
  `execution_time_ms` de 1.829 a 18.709 y **status 200 en todos los casos**: la
  lectura se escribe aunque pg_net ya se rindio. Tasa 3 de 73 peticiones en ~6h,
  contra un solo hueco real de 10 min en 32h. **`net._http_response.status_code IS
  NULL` NO es evidencia de sync fallido para este endpoint** — cruzarlo contra
  huecos en `clima_lecturas`. [corrida: 2026-08-03-lunes]
- **El contador de lluvia congelado es hardware del sensor, no software, y su tasa
  es plana.** Ventanas de 30 dias: 5, 6, 6 congelados. 17 de 90 dias (19%), igual al
  baseline. La guarda de 068 opera como se diseno. **No refilar.** Hecho operativo
  estable: ~1 de cada 5 dias no tiene cifra de lluvia utilizable.
  [corrida: 2026-08-03-lunes]
- **Migraciones 077–082: verificadas sin regresion, no revisar de nuevo.** Advisors
  de performance 696 → **615** (auth_rls_initplan 62→0 por 077; duplicate_index 1→0
  y unused_index 63→46 por 078, exactamente los 17 indices de kv_store;
  no_primary_key 3→1, el sobreviviente es `respaldos.backup_080_*` tras 081).
  Advisors de seguridad **51 → 11**, el estado final documentado tras 082.
  `multiple_permissive_policies` sigue en 479 y `unindexed_foreign_keys` en 88 —
  ambos fuera de alcance A PROPOSITO. [corrida: 2026-08-06-jueves]
- **Los triggers de atribucion sobrevivieron el REVOKE EXECUTE de 082 — riesgo
  CERRADO.** Desde 2026-08-04: `fin_gastos` 38/38 con `created_by`,
  `registros_trabajo` 32/32 con `registrado_por`, `tareas` 2/2. Confirma en
  produccion lo que el CLAUDE.md ya afirmaba: Postgres verifica EXECUTE en
  `CREATE TRIGGER`, no en cada disparo. [corrida: 2026-08-06-jueves]
- **El fix de fechas locales (PR #105) esta vivo y funciona en la BD.** 15
  `fin_gastos` capturados el 2026-08-05 entre 23:15 y 23:38 Bogota, **0 con fecha
  en el futuro**. El incidente del 2026-08-03 (5 gastos a las 21:13–21:18 guardados
  como 2026-08-04) no se reproduce. OJO: eso valida el camino de CAPTURA; el guard
  estatico sigue siendo evadible y quedan 25 sitios de lectura vivos (hallazgo
  abierto). [corrida: 2026-08-06-jueves]
- **El 502 de `/clima/sync` del 2026-08-06 03:11 Bogota es un evento aislado**, NO
  el patron cosmetico de pg_net: la funcion misma devolvio 502 tras colgarse 63 s
  (upstream Ecowitt), frente a los TIMEOUT de pg_net que registran status_code NULL
  con la funcion en 200. Costo: 9 lecturas de 288 (3%), auto-sanado. **Si se repite,
  dejar de tratarlo como aislado y poner un AbortController de ~15 s en el fetch a
  Ecowitt.** [corrida: 2026-08-06-jueves]
- **El 502 de `/clima/sync` del 2026-08-06 NO se repitio — evento aislado, NO poner el AbortController todavia.** Medido con `clima_resumen_diario.lecturas_count` (288 = dia completo): 08-06 = **279** (las 9 lecturas perdidas, exactamente), 08-07 = 287, 08-08 = 288, 08-09 = 288. Perdidas de 1 a 6/dia son ruido normal. Una segunda ocurrencia de ~9 seguidas si cambia la recomendacion. [corrida: 2026-08-10-lunes]
- **El contador de lluvia congelado es hardware del sensor y su tasa es plana**: 5 de 30 dias (17%) contra 5/6/6 en ventanas anteriores. La guarda de 068 opera como se diseno. No refilar. [corrida: 2026-08-10-lunes]
- **La migracion 093 SI esta aplicada a produccion — el CLAUDE.md dice "Not applied yet" y esta desactualizado.** 47 policies llaman `es_usuario_gerencia()` y 50 `get_user_role()`, las 97 envueltas como `(SELECT ...)`, 0 desnudas. El efecto ya se ve: ninguna consulta de aplicacion aparece en el top-20 de pg_stat_statements, y `v_hato_estado_actual` (antes la mas lenta, 126,0 ms) ya no figura. [corrida: 2026-08-10-lunes]
- **La regla de 081 (respaldos fuera de `public`) se esta siguiendo.** Los 3 respaldos vivos (backup_080/083/090) estan en `respaldos`, RLS on, 0 policies, 0 grants para anon/authenticated. 0 tablas `backup_*` en `public`. El `rls_enabled_no_policy` sobre ellas es el estado final buscado. [corrida: 2026-08-10-lunes]
- **El backup nocturno de `thinksid/escocia-backups` es parte del perimetro de esta operacion y NADIE lo estaba mirando.** Fallo el 2026-08-12 y el 2026-08-13 con `Failed to CreateArtifact: Artifact storage quota has been hit` y se descubrio solo porque Santiago pregunto. Las dos noches el backup salio bien (dump validado, buckets bajados, cifrado verificado) y se descarto en el ultimo paso: el fallo estaba en el `upload-artifact`, no en el respaldo. Causa: PR #2 (2026-08-10) bajo el artefacto diario de ~77 MB a ~5,7 MB pero solo para los NUEVOS — los 27 anteriores al split seguian ocupando ~2,00 GB (99,4% del total) y no expiraban hasta el 08-21. **Leccion transversal: un arreglo de consumo que solo aplica a lo nuevo no es un arreglo hasta que se cuenta el tiempo de drenaje de lo viejo.** [corrida: 2026-08-13-jueves]
- **Chequear el estado del backup nocturno en toda corrida — son 10 segundos.** `actions_list` con `method: list_workflow_runs, owner: thinksid, repo: escocia-backups` y mirar `conclusion` de los ultimos 3. El repo casi no recibe commits, y **GitHub deshabilita los cron de repos sin actividad**, asi que "no hay noticias" no prueba que corrio. Desde 2026-08-13 hay latido semanal por Telegram en las corridas completas justamente por eso; si deja de llegar, el cron murio. [corrida: 2026-08-13-jueves]
- **La cuota de artefactos de Actions es de la CUENTA, la API es por REPOSITORIO.** `GET /repos/{owner}/{repo}/actions/artifacts` no ve lo que acumulen otros repos de `thinksid`. Verificado el 2026-08-16 contra *Usage by repository*: `escocia-backups` es el unico que consume, asi que esa hipotesis quedo descartada. [corrida: 2026-08-13-jueves, verificado 2026-08-16]
- **RESUELTO 2026-08-16 — la cuota de Actions se mide en GB-MES, no en bytes guardados. Esto invalida tres estimaciones previas de esta memoria y del RESTORE.md.** `0,5 GB included` es bytes × tiempo acumulado durante el ciclo de facturacion, no un techo de cuanto se puede tener guardado; la pagina lo rotula *Metered usage* y dice *"Included usage limits reset in N days"*. Dos consecuencias que cambian todo el diagnostico: **(a) borrar artefactos NO devuelve cuota** —solo frena lo que se siga acumulando, por eso purgar de 2,00 GB → 774 MB → 396 MB no destrabo nada— y **(b) agotada, queda agotada hasta que reinicia el ciclo**. La aritmetica cierra exacto: ~2 GB guardados del 1 al 11 de agosto = `2 × (11/30) ≈ 0,73 GB-mes` contra 0,5 incluidos, agotado hacia el 08-08/09 y bloqueando el 08-12 al recalcular. Ese 0,73 es **el mismo numero que RESTORE.md ya traia escrito** como consumo esperado del esquema de 30 dias. **Y bloqueo en vez de cobrar porque el presupuesto de Actions estaba en $0** (lo que el propio RESTORE.md advertia); se puso en USD 3 el 08-16 y el respaldo subio de inmediato. [corrida: 2026-08-16]
- **Ante cualquier `quota has been hit`: ir PRIMERO a Settings → Billing → Metered usage → Actions.** No estimar el techo a partir de cuando fallan las subidas — se hizo tres veces en este incidente (~2 GB, ~0,5 GB de bytes, <400 MB) y las tres estuvieron mal, porque median la magnitud equivocada. Esa pagina da el numero exacto, si el medidor esta agotado, cuando reinicia, y el consumo por repositorio. Cinco noches sin respaldo (08-12 → 08-16) es el costo de haberla mirado al final. [corrida: 2026-08-16]
- **Estado final del backup: verde.** Retencion 7 dias para los tres tipos (PR #4), purga con umbral 300 MB y palancas `dias_protegidos`/`minimo_artefactos` (PR #5), avisos a Telegram solo a Santiago funcionando —confirmado en corridas rojas y verdes—, y presupuesto en USD 3. Primer respaldo bueno tras el hueco: `escocia-backup-semanal-2026-08-16` (84,2 MB, completo, incluye `reportes-semanales`, expira a los 7 dias exactos). Regimen esperado ~111 MB ≈ 0,11 GB-mes, dentro de los 0,5 incluidos. **El hueco 08-12 → 08-15 no es recuperable**: no se perdio dato (la BD estaba intacta y el respaldo del 08-16 la captura entera), lo que falta es recuperacion punto-en-el-tiempo de esos cuatro dias. [corrida: 2026-08-16]

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|

## Navegacion
- El cron de clima corre cada 5 min (mig 030); el rollup a las 00:15 Bogota (036/068).
  El bug del contador congelado ya esta resuelto — verificar regresiones, no
  redescubrirlo.
- Los dos arboles de edge function NO estan en drift real: `diff -rq` marca ~14
  archivos por el banner generado en la linea 1. Verificar con `tail -n +2` + `diff -w`.
- **El conector Vercel MCP sigue mal alcanzado (2a corrida).** Ya filado como P1
  contra la operacion. Sustituir con los commit statuses de GitHub y con verificacion
  de deploy POR CONTENIDO (curl del index.html + grep del chunk lazy).
  [corrida: 2026-08-03-lunes]
- **El P0 de despliegue del 2026-07-31 quedo CERRADO; no revisarlo otra vez.** La
  edge function se redesplego a v197 el 2026-07-31T19:11:40Z, despues de f6fdfa2
  (17:27:24Z). El bundle desplegado contiene `verificarAccesoGerencia` (5 ocurrencias)
  y `ROLES_PERMITIDOS` (8). El agujero de /usuarios NO esta abierto en produccion.
  [corrida: 2026-08-03-lunes]
- **Migraciones 073/075/076: verificadas sin regresion.** Una sola consulta las cubre:
  0 grants de UPDATE sobre `usuarios`, 0 politicas UPDATE, las 3 funciones muertas
  siguen eliminadas, `search_path` fijado, indice `plagas_catalogo_nombre_btrim_unique`
  presente. [corrida: 2026-08-03-lunes]
- **La alerta del hato YA tiene destinatario** — el pendiente heredado esta RESUELTO.
  Los 5 tipos tienen `destinatario_telegram_id`; 0 pendientes. El tick del 2026-08-03
  devolvio `{generadas:0, enviadas:0, escaladas:0}`. Que no se generen alertas nuevas
  es correcto: `regla_clave` es clave de idempotencia. [corrida: 2026-08-03-lunes]
- **`useDashboardData.ts` (tablero de Finanzas) no usa `fetchAll` en ninguno de sus
  12 call sites** (lineas 74, 81, 145, 225, 261, 345, 373, 403, 437, 465, 491, 521).
  La regla "todas las consultas de reportes pasan por fetchAll" se escribio para
  /finanzas/reportes (`useReportesFinancierosData.ts`, el unico que la cumple) y el
  tablero quedo fuera del contrato. **Ese es el sitio a revisar primero en cada
  barrido de Finanzas, no /finanzas/reportes, que esta bien.**
  [corrida: 2026-08-03-lunes]

- **`extensions.pg_stat_statements`, no `public`** — sin esquema falla con 42P01. El
  top de lentas esta dominado por introspeccion de la plataforma (pg_timezone_names
  303 ms, listado de extensiones 412 ms) y los COPY de pg_dump: filtrarlos. La
  consulta de APLICACION mas lenta es la vista `v_hato_estado_actual` por PostgREST,
  126,0 ms de media. [corrida: 2026-08-06-jueves]
- **Sonda de frontend por contenido que funciono**: `curl https://escociaos.vercel.app/`
  da el entry `assets/index-<hash>.js`; los chunks lazy se leen con
  `grep -oE '"\./[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.js"'` sobre ese entry. Positiva:
  la cadena `Sin lectura en la ronda actual` dentro de `DashboardMonitoreoV3-*.js`
  (solo existe desde PR #100). Negativa: `CargaCSV` debe estar AUSENTE (limpieza
  e018949). **La ausencia prueba mas que la presencia**: los nombres de funcion se
  minifican, los literales y nombres de propiedad no. [corrida: 2026-08-06-jueves]
- **El export `calcularCoberturaRonda` que 950350f agrego a los dos arboles de edge
  function NO lo consume nada del lado Deno** — solo el frontend. Por eso da igual
  que la v198 se desplegara 2 minutos ANTES del commit (deploy 17:04:25Z vs commit
  17:06:28Z): el flujo real es desplegar y despues commitear, y no hay consecuencia
  en runtime. **No gastar contexto en `get_edge_function` para verificar esto.**
  [corrida: 2026-08-06-jueves]
- **Para liveness del cron de clima usar `clima_resumen_diario.lecturas_count`, no `net._http_response` ni `cron.job_run_details`.** Columna ya existente, poblada por `fn_clima_rollup_diario`, 288 = dia completo, y sobrevive indefinidamente — mientras `clima_lecturas` se poda a 24h, `net._http_response` a ~7h y `cron.job_run_details` solo prueba que se encolo el POST. Una consulta da semanas: `select fecha, lecturas_count, 288 - lecturas_count as faltantes, lluvia_confianza from clima_resumen_diario where fecha >= current_date - 21 order by fecha desc`. [corrida: 2026-08-10-lunes]
- **El drift de edge function que importa NO es entre los dos arboles del repo, es entre `main` y lo desplegado.** Los dos arboles llevan 3 corridas identicos y los tests de paridad ya los cubren. Nadie cubre comparar `list_edge_functions.updated_at` contra `git log -1 --format=%cI -- supabase/functions/make-server-1ccce916`. **Hacer esa comparacion cada corrida — son 10 segundos y ya cazo un hallazgo.** El `entrypoint_path` delata desde que worktree se desplego. [corrida: 2026-08-10-lunes]
- **Para leer el bundle DESPLEGADO** (la unica prueba real, mejor que cualquier timestamp): `get_edge_function` trae `files: [{name, content}]` y pesa ~1 MB — volcarlo a fichero con python y hacer grep, nunca imprimirlo. Con eso se puede hacer `diff` fichero a fichero contra `git show <ref>:<path>` y aislar exactamente que commit falta. [corrida: 2026-08-10-lunes]
- **El top de `extensions.pg_stat_statements` por tiempo total esta dominado por pg_net, no por la aplicacion**: `net.http_post` 41.577 llamadas / 1.456.287 ms y el jardinero `DELETE FROM net._http_response` 103.797 / 172.620 ms. Filtrar esos dos ademas de la introspeccion de plataforma y los COPY de pg_dump. Filtrado todo, NO queda ninguna consulta de aplicacion problematica: la mas lenta recurrente es `fn_clima_rollup_diario()` a 100,5 ms de media, 1 vez al dia. [corrida: 2026-08-10-lunes]
- **El conector Vercel sigue roto — 4a corrida consecutiva**, 403 "must re-authenticate to this scope". Ya filado (Notion #5). Declarar bajo NO CORRIO, no re-diagnosticar. Colateral: no hay forma de saber si Web Analytics esta habilitado. [corrida: 2026-08-10-lunes]

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Infra | DB **110 MB** (1,4% de 8 GB) — pero **59 MB de eso es `net._http_response` vacia** (72 filas vivas); datos reales ~51 MB. Storage 105 MB / 51 objetos. MAU 6. Edge function **v198** (2026-08-03T17:04:25Z). Frontend en d797b3f verificado POR CONTENIDO. 3 pg_cron: **870 corridas en 3 dias, 0 fallos** (clima 864/864). clima_lecturas 12 filas/hora. Payload inicial **366 KB gzip** en 5 chunks; jsPDF/xlsx/html2canvas siguen dinamicos | 2026-08-06-jueves |
| Advisors performance | **615 total** (era 696): 479 multiple_permissive_policies · 88 unindexed_foreign_keys · 46 unused_index · 1 no_primary_key (`respaldos.backup_080`) · 1 **table_bloat (NUEVO: `net._http_response`)**. Desaparecieron los 62 auth_rls_initplan y el duplicate_index | 2026-08-06-jueves |
| Advisors seguridad | **11 total** (eran 51): 5 rls_enabled_no_policy (kv_store, 3 telegram_*, respaldos.backup_080 — todos deny-all buscado) · 2 anon_security_definer (`es_usuario_gerencia`, `get_user_role` — **accept PERMANENTE**, 97 policies los llaman) · 3 authenticated_security_definer · 1 auth_leaked_password_protection. **No re-diagnosticar estos 11 como hallazgos nuevos** | 2026-08-06-jueves |
| Tamanos de tabla | `net._http_response` 59 MB (72 filas) · reportes_semanales 2.448 kB · clima_lecturas 2.192 kB · monitoreos 1.960 kB · fin_gastos 1.808 kB (4.464) · registros_trabajo 1.560 kB (2.550) · hato_chequeo_vacas 960 kB · hato_eventos 712 kB (735) | 2026-08-06-jueves |
| Latencia de tableros | Finanzas: 36 round trips por carga (1 + 7 negocios x 5), ~7 ms de DB cada una pero ~130 ms de ida y vuelta = ~5 s de espera puro transporte. Produccion: 7 consultas a una tabla de 205 filas, seq_scan 36.397 / 7,4M tuplas leidas | 2026-08-03-lunes |
| Infra | DB **111 MB** (1,4% de 8 GB) — 59 MB siguen siendo `net._http_response` (72 filas vivas, **0 dead tuples**: VACUUM normal NO lo recupera, requiere VACUUM FULL). Storage 105 MB / 55 objetos. MAU 6, 7 usuarios auth. Edge function **v200** (2026-08-06T21:37:29Z), **1 commit atrasada respecto de main**. Frontend verificado POR CONTENIDO en >=60ae9fe. 3 pg_cron: **2.030 corridas en 7 dias, 0 fallos**. Payload inicial **386 KB gzip** (359 JS + 25 CSS); 51 rutas React.lazy; jsPDF/xlsx/html2canvas siguen dinamicos | 2026-08-10-lunes |
| Advisors performance (por SQL) | unindexed_fks **89** (era 88) · unused_index **43** (era 46) · no_primary_key **3** (era 1; los 2 nuevos son respaldos.backup_083 y backup_090, estado final buscado, NO es hallazgo). **El conteo de multiple_permissive_policies NO es comparable con el del advisor** — la consulta SQL agrupa por (tabla, cmd, roles) y da 54; el advisor cuenta pares y reporta ~479. No cruzar las dos cifras | 2026-08-10-lunes |
| Tamanos de tabla | net._http_response 59 MB (72 filas) · reportes_semanales 2.448 kB · clima_lecturas 2.192 kB · monitoreos 1.960 kB (4.200) · fin_gastos 1.808 kB (4.464) · registros_trabajo 1.576 kB (2.579) · hato_chequeo_vacas 960 kB · hato_eventos 712 kB | 2026-08-10-lunes |

## Archivo
(vacio)


## Estados aceptados (corrida 2026-08-20-jueves)
- **El drift de edge function y de frontend NO existio esta corrida — los dos estan en HEAD
  `8306dbf`.** Edge v213 desplegada 2026-08-18T01:36:38Z, 25 s DESPUES de b257671 (el ultimo
  commit que toca `supabase/functions/make-server-1ccce916`); los dos commits posteriores
  (91c7100, 8306dbf) no tocan ese arbol. Frontend verificado POR CONTENIDO en 8306dbf.
  Los hallazgos #21/#22 siguen abiertos por estructura pero NO hay evidencia nueva.
  [corrida: 2026-08-20-jueves]
- **La estacion Ecowitt estuvo caida el 2026-08-19/20 y es de un orden de magnitud distinto al
  ruido conocido.** Baseline previo: perdidas de 1-6 lecturas/dia = ruido; 9 seguidas (08-06) =
  evento aislado. Esto fue **121 de 288 el 08-19** (hueco diurno 10:55→17:00) mas **13,5 h y
  contando** desde el 08-19 21:05. En 40 dias los unicos dias bajo 280 lecturas son 08-06 (279)
  y 08-19 (167). Si vuelve a pasar, ya no es hardware esporadico: es la estacion.
  [corrida: 2026-08-20-jueves]
- **`contador_congelado` subio de 5/30 (17%) a 8/30 (27%) y 19/90 (21%).** La memoria previa lo
  tenia como "plano, no refilar"; ya no lo es. El sensor se esta degradando; considerar accion
  aparte cuando lleguen los ~14/30 que serian claramente epidemicos. [corrida: 2026-08-20-jueves]

## Refutaciones (corrida 2026-08-20-jueves)
| CLAUDE.md 097/100/093 «No aplicada aun» | Que las migraciones 093, 097 y 100 esten pendientes en produccion | Las tres estan aplicadas y verificadas contra el catalogo vivo: las 2 RPC de 097 existen en `pg_proc`, el indice 044 `gan_movimientos_transaccion_confirmado_unique` esta en 0 y el trigger `trg_gan_validar_cabezas_transaccion` presente; `respaldos.backup_100_*` existen y 48/53 `gan_movimientos` llevan `grupo_id`; 093 da 0 llamadas desnudas y 82 envueltas. **No hay carrera migracion-vs-frontend y no hay ruptura en produccion por este lado.** 101/102 tambien aplicadas (3 tablas `acciones_*`, jobid 6 corriendo). | 2026-08-20-jueves |

## Navegacion (corrida 2026-08-20-jueves)
- **Sonda de ruta de edge function, mejor que cualquier timestamp y cuesta 3 curl:**
  `curl -s -o /dev/null -w '%{http_code}' -X POST <fn>/<ruta>` — una ruta desplegada que exige
  secreto da **401**, una inexistente da **404**. Control positivo `hato/alertas/tick` (401),
  control negativo `ruta/que/no/existe` (404). Con eso se prueba que `/acciones/tick` esta
  desplegada sin gastar 1 MB de contexto en `get_edge_function`. [corrida: 2026-08-20-jueves]
- **`cron.job_run_details` = 'succeeded' Y el edge log = 200 Y `net._http_response.status_code` = 200
  pueden ser los TRES verdes con CERO datos entrando.** `/clima/sync` responde
  `{"message":"No data available","synced":0}` con status 200 cuando Ecowitt no tiene datos. **La
  unica prueba de liveness del clima es el dato mismo**: `select round(extract(epoch from
  (now()-max(timestamp)))/60) from clima_lecturas` (minutos sin lectura) y
  `clima_resumen_diario.lecturas_count` (288 = dia completo). Anadir a esa consulta el
  `left(content,200)` de `net._http_response`, que es lo que delato la causa en 10 segundos.
  [corrida: 2026-08-20-jueves]
- **El chequeo obligatorio del backup nocturno NO se pudo hacer: `actions_list` sobre
  `thinksid/escocia-backups` devuelve `Access denied ... Allowed repositories: sforero94/escociaos`.**
  No es que el backup fallara — es que el scope de GitHub de la sesion no incluye ese repo.
  Hay que anadirlo al allowlist del despacho o mover el chequeo a quien tenga el scope, o la
  regla escrita el 2026-08-13 es inejecutable. [corrida: 2026-08-20-jueves]

## Baselines (corrida 2026-08-20-jueves)
| Infra | DB **113 MB** (1,4% de 8 GB) — 59 MB siguen siendo `net._http_response` (74 filas) y **16 MB `cron.job_run_details` con 0 filas vivas (NUEVO en el top-2)**; datos reales ~38 MB. 8 usuarios auth. Edge function **v213** (2026-08-18T01:36:38Z), **al dia con HEAD**. Frontend verificado POR CONTENIDO en 8306dbf. **4 pg_cron** (nuevo: `acciones-recomendadas-tick`, `50 10 * * *` UTC): 2.903 corridas en 10 dias, 0 fallos. Edge log 24h: 310 peticiones, **0 no-200**. Motor de acciones: corre diario, ~USD 0,010/dia, estados ok/parcial | 2026-08-20-jueves |
| Advisors performance (por SQL) | unindexed_fks **89** (igual) · unused_idx **80** (era 43 — el salto es por indices nuevos nunca escaneados en `gan_lotes`/`acciones_*`/`pest_*`, `stats_reset` es NULL asi que no hubo reinicio de estadisticas; **NO es hallazgo**) · sin_pk **9** (eran 3; los 6 nuevos son `respaldos.backup_095/099×3/100×2`, estado final buscado). Consulta de aplicacion mas lenta: `v_hato_estado_actual` por PostgREST 149,2 ms / 6 llamadas; `fn_clima_rollup_diario` subio de 100,5 a **229,7 ms** de media (27 llamadas, 1/dia — irrelevante) | 2026-08-20-jueves |

## Correccion de causa (corrida 2026-08-20-jueves, post-barrido)
- **La caida de la estacion Ecowitt del 2026-08-19/20 fue un CORTE DE LUZ prolongado en la
  finca, confirmado por Santiago** — no degradacion del sensor. **Revisar la entrada de arriba
  que decia "si vuelve a pasar, ya no es hardware esporadico: es la estacion": esa inferencia
  quedo refutada por el dueno.** Antes de escalar una caida de clima a hallazgo de hardware,
  preguntar por la luz: la finca tiene cortes largos y son la explicacion mas simple de un
  silencio total (a diferencia del `contador_congelado`, que si es del sensor).
  [corrida: 2026-08-20-jueves]
- **Implicacion de diseno que sobrevive a la causa**: los cortes de luz recurren, asi que la
  ausencia de reja de frescura en `ClimaCard`/`useSaludDatos` y la ausencia de gate de cobertura
  en `fn_clima_rollup_diario` son defectos **periodicos**, no anecdoticos. El peor caso del
  rollup es la restauracion de luz a media jornada: produce un dia parcial que pasa el gate de
  frescura de la 068 y se sella `ok`. Un dia sin NINGUNA lectura no inserta fila y es seguro.
  [corrida: 2026-08-20-jueves]
