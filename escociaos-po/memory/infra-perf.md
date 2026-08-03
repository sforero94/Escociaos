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

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Infra | DB 109 MB (~1,4% de un plan de 8 GB) · edge function **v197** (2026-07-31T19:11:40Z) · 100% HTTP 200 en ~100 peticiones muestreadas · 3 pg_cron (clima */5, rollup 15 5 UTC, hato-tick 45 10 UTC) — 1.008/4/4 corridas en 3,5 dias, **0 fallos** · clima_lecturas 12 filas/hora exactas · 0 dias faltantes en resumen_diario en 90 · consulta mas lenta 57,8 ms media | 2026-08-03-lunes |
| Advisors performance | **696 total**: 479 multiple_permissive_policies · 88 unindexed_foreign_keys · 63 unused_index · 62 auth_rls_initplan · 3 no_primary_key (los backup_07*) · 1 duplicate_index (kv_store). Subio de 548 porque el conteo anterior solo cubria los dos lints de RLS. Los 88 FK sin indice son ruido a esta escala: la tabla mas grande es `monitoreos` con 1.960 kB | 2026-08-03-lunes |
| Latencia de tableros | Finanzas: 36 round trips por carga (1 + 7 negocios x 5), ~7 ms de DB cada una pero ~130 ms de ida y vuelta = ~5 s de espera puro transporte. Produccion: 7 consultas a una tabla de 205 filas, seq_scan 36.397 / 7,4M tuplas leidas | 2026-08-03-lunes |

## Archivo
(vacio)
