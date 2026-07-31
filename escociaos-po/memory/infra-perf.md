# Memoria — Infra Perf

Escrita solo por el orquestador (ver `README.md`). Inyectada completa en el
prompt del agente en cada corrida.

## Estados aceptados
(vacio)

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|

## Navegacion
- El cron de clima corre cada 5 min (migracion 030); el rollup diario a las 00:15 Bogota (036/068). El bug del contador congelado de lluvia ya esta resuelto en migracion 068 + `lluviaConfiableDeResumen()` — verificar regresiones, no redescubrir el bug. [seed 2026-07-31]
- Los dos arboles de edge function NO estan en drift real: `diff -rq` marca ~14 archivos por el banner generado `// ARCHIVO: <ruta propia>` en la linea 1 y whitespace en index. Verificar drift real con `tail -n +2` + `diff -w`, o comparando los pares hand-synced con `cmp`. [corrida: 2026-07-31-dryrun-lunes]
- El conector Vercel MCP solo ve el team `Santiago's projects` (team_Ov5b46sLrIUWwVlkuCfdCgdG, 0 proyectos); el proyecto vive en `santiago-foreros-projects-da8a20e8`. Mientras no se re-autorice, sustituir con `gh api repos/sforero94/Escociaos/commits/<sha>/status` (context 'Vercel'). [corrida: 2026-07-31-dryrun-lunes]
- Fix 068 verificado operando en produccion: 2 dias marcados `contador_congelado` en los ultimos 14. No es regresion — es el guard atrapando contadores congelados. [corrida: 2026-07-31-dryrun-lunes]


## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Infra | DB 107 MB · edge function v196, 100% HTTP 200 en muestra de 8h · 3 pg_cron activos (clima */5, rollup 15 5 UTC, hato-tick 45 10 UTC) todos succeeded · clima_lecturas ~419 filas/24h | 2026-07-31-dryrun-lunes |


## Archivo
(vacio)
