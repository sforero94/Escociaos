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

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Infra | DB **110 MB** (1,4% de 8 GB) — pero **59 MB de eso es `net._http_response` vacia** (72 filas vivas); datos reales ~51 MB. Storage 105 MB / 51 objetos. MAU 6. Edge function **v198** (2026-08-03T17:04:25Z). Frontend en d797b3f verificado POR CONTENIDO. 3 pg_cron: **870 corridas en 3 dias, 0 fallos** (clima 864/864). clima_lecturas 12 filas/hora. Payload inicial **366 KB gzip** en 5 chunks; jsPDF/xlsx/html2canvas siguen dinamicos | 2026-08-06-jueves |
| Advisors performance | **615 total** (era 696): 479 multiple_permissive_policies · 88 unindexed_foreign_keys · 46 unused_index · 1 no_primary_key (`respaldos.backup_080`) · 1 **table_bloat (NUEVO: `net._http_response`)**. Desaparecieron los 62 auth_rls_initplan y el duplicate_index | 2026-08-06-jueves |
| Advisors seguridad | **11 total** (eran 51): 5 rls_enabled_no_policy (kv_store, 3 telegram_*, respaldos.backup_080 — todos deny-all buscado) · 2 anon_security_definer (`es_usuario_gerencia`, `get_user_role` — **accept PERMANENTE**, 97 policies los llaman) · 3 authenticated_security_definer · 1 auth_leaked_password_protection. **No re-diagnosticar estos 11 como hallazgos nuevos** | 2026-08-06-jueves |
| Tamanos de tabla | `net._http_response` 59 MB (72 filas) · reportes_semanales 2.448 kB · clima_lecturas 2.192 kB · monitoreos 1.960 kB · fin_gastos 1.808 kB (4.464) · registros_trabajo 1.560 kB (2.550) · hato_chequeo_vacas 960 kB · hato_eventos 712 kB (735) | 2026-08-06-jueves |
| Latencia de tableros | Finanzas: 36 round trips por carga (1 + 7 negocios x 5), ~7 ms de DB cada una pero ~130 ms de ida y vuelta = ~5 s de espera puro transporte. Produccion: 7 consultas a una tabla de 205 filas, seq_scan 36.397 / 7,4M tuplas leidas | 2026-08-03-lunes |

## Archivo
(vacio)
