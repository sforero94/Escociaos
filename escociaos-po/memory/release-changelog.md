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

- **Probar un PR de frontend por contenido: el chunk lazy lleva el nombre del
  componente RUTA, no del archivo tocado.** `GastoForm.tsx` vive dentro de
  `GastosView-*.js` (se confirma buscando la etiqueta "Nuevo Gasto"). Metodo que
  funciono: identificar un literal que EXISTIA antes del PR y ya no
  (`toISOString().split("T")[0]`, `>=30?"rojo"`) y contarlo en el chunk — **la
  ausencia prueba mas que la presencia**, porque los nombres de funcion se minifican
  pero los literales y los nombres de propiedad sobreviven. [corrida: 2026-08-06-jueves]
- **Los guards estaticos con regex de patron literal se evaden aliaseando.**
  `hatoFechaLocalGuard.test.ts` exige `new Date().toISOString()` pegado;
  `const now = new Date(); now.toISOString()` pasa limpio. **Al verificar que un PR
  cerro una clase de bug, correr el grep de la CLASE, no el del guard.**
  [corrida: 2026-08-06-jueves]
- **Numeros de migracion duplicados entre PRs son invisibles para git y para el CI**
  (archivos con nombre distinto ⇒ sin conflicto). Antes de reportar sobre un PR
  abierto con migracion, comparar su numero contra `ls src/sql/migrations/` en main,
  ademas de simular el merge. [corrida: 2026-08-06-jueves]
- **Los respaldos `backup_*` desaparecen sin dejar rastro en el ledger.** Verificar
  su existencia con `information_schema.tables` sobre TODOS los esquemas; no confiar
  en lo que digan la migracion ni el CLAUDE.md. [corrida: 2026-08-06-jueves]
- La edge function puede figurar con `updated_at` unos minutos ANTERIOR al timestamp
  de autoria del commit que contiene su cambio: el flujo real es desplegar y despues
  commitear. **No es evidencia de que falte redesplegar.** Antes de reportarlo,
  comprobar si el archivo tocado tiene consumidor del lado edge — los espejos de
  paridad (`priorizacion-scouting.ts`, `calculosHato.ts`, `hatoAlertas.ts`,
  `importHato/*`) a menudo no lo tienen. [corrida: 2026-08-06-jueves]

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Estado de despliegue | HEAD main **d797b3f** · edge function **v198** desplegada 2026-08-03T17:04:25Z · migraciones **001-082** aplicadas y verificadas contra el catalogo VIVO (067 y 079 son archivos de registro, no huecos) · frontend de produccion verificado POR CONTENIDO en `index-B_XkmZw2.js` · **nada pendiente de desplegar** | 2026-08-06-jueves |
| Lints de seguridad Supabase | **11** (bajo desde 51 tras 082). Composicion estable y esperada — **no re-diagnosticar como hallazgos nuevos** | 2026-08-06-jueves |
| Estado de despliegue (anterior) | HEAD main 7c232f6 · edge function v197 · migraciones 001-076 | 2026-08-03-lunes |
| Cadencia (primera medicion, ventana 2026-06-08→2026-08-03, 8 semanas) | 22,9 commits/sem · 6,4 aterrizajes first-parent/sem · fix share **46,8%** de feat+fix (bajando: 68,8% 1a mitad → 41,0% 2a, **pero la 2a esta sesgada por el build-out del hato**) · lag de deploy del edge function ~1h44m, frontend automatico. **No existe ventana previa comparable: la historia del repo empieza efectivamente el 2026-06-09** — tratar como primera medicion, NO como tendencia | 2026-08-03-lunes |

## Archivo
(vacio)
