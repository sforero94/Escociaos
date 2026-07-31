# Memoria — Release Changelog

Escrita solo por el orquestador (ver `README.md`). Inyectada completa en el
prompt del agente en cada corrida.

## Estados aceptados
(vacio)

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|

## Navegacion

- Verificacion de deploys sin Vercel MCP: `gh api repos/sforero94/Escociaos/commits/<sha>/status` trae el estado Vercel por commit. Currency del edge function: comparar `list_edge_functions.updated_at` contra `git log -1 -- supabase/functions/make-server-1ccce916`. Produccion responde en https://escociaos.vercel.app. [corrida: 2026-07-31-dryrun-lunes]


## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Estado de despliegue | HEAD main 3dfe87e (2026-07-30) · edge function v196 desplegada 2026-07-30 02:07:55 UTC, posterior al ultimo commit de su arbol (9becb94, 00:23 UTC) — nada pendiente de deploy manual · migraciones 001-072 (hueco deliberado en 067) | 2026-07-31-dryrun-lunes |


## Archivo
(vacio)
