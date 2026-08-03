# Memoria — Release Changelog

Escrita solo por el orquestador (ver `README.md`). Inyectada completa en el
prompt del agente en cada corrida.

## Estados aceptados
- **Una BD de hallazgos vacia durante el barrido es NORMAL, no un lazo roto**: el
  orquestador escribe en Fase 5, despues de que vuelvan todos los agentes, y Release
  corre ultimo entre los agentes pero antes de esa escritura. Consultar el listado de
  fases en `escociaos-po/CLAUDE.md` antes de filar un "el lazo esta roto". Las corridas
  en seco (sufijo `-dryrun-`) no escriben nada en Notion por diseno.
  [corrida: 2026-08-03-lunes]

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|

## Navegacion
- Verificacion de deploys sin Vercel MCP: `pull_request_read` con `get_status` trae el
  commit status de Vercel por PR. Currency del edge function: comparar
  `list_edge_functions.updated_at` contra `git log -1 -- supabase/functions/make-server-1ccce916`.
- **Verificar el frontend POR CONTENIDO**: `curl https://escociaos.vercel.app/`, extraer
  `/assets/*.js` del index.html y hacer grep en el chunk lazy relevante de una cadena que
  solo exista despues del commit bajo prueba. Los chunks lazy llevan el nombre de su
  componente. Prueba por contenido > check verde de CI. [corrida: 2026-08-03-lunes]
- **Antes de reportar sobre un lote de PRs con la misma base, SIMULAR los merges**:
  `git worktree add /tmp/mo <base>` y fusionar cada rama en secuencia. **Un conflicto
  modify/delete (un PR borra un archivo que otro edita) es invisible en el CI por PR —
  todos siguen verdes.** Deteccion barata previa: para cada rama,
  `git diff --name-only <base> origin/<rama>` | `sort | uniq -d`.
  [corrida: 2026-08-03-lunes]
- **`supabase_migrations.schema_migrations` NO es un registro confiable de lo que
  shippeo, y falla en las dos direcciones**: 035/036/046 estan aplicadas (los objetos
  existen) pero ausentes; `hato_registrar_salida` (20260724181919) figura pero la
  funcion no existe ni tiene archivo (la 070 la sustituyo); `drop_compra_a_gasto_trigger`
  (20260702173945) no tiene archivo en el repo. **Verificar siempre consultando el objeto
  vivo del catalogo, nunca la fila del ledger.** [corrida: 2026-08-03-lunes]

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Estado de despliegue | HEAD main **7c232f6** (2026-07-31 19:12:45Z) · edge function **v197** desplegada 2026-07-31T19:11:40Z, posterior al ultimo commit de su arbol (f6fdfa2, 17:27:24Z) — nada pendiente de deploy manual · migraciones 001-076 aplicadas, hueco deliberado en el repo en 067 · frontend de produccion verificado POR CONTENIDO | 2026-08-03-lunes |
| Cadencia (primera medicion, ventana 2026-06-08→2026-08-03, 8 semanas) | 22,9 commits/sem · 6,4 aterrizajes first-parent/sem · fix share **46,8%** de feat+fix (bajando: 68,8% 1a mitad → 41,0% 2a, **pero la 2a esta sesgada por el build-out del hato**) · lag de deploy del edge function ~1h44m, frontend automatico. **No existe ventana previa comparable: la historia del repo empieza efectivamente el 2026-06-09** — tratar como primera medicion, NO como tendencia | 2026-08-03-lunes |

## Archivo
(vacio)
