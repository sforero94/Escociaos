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
- **No existe cron de reportes semanales, y nunca existio.** `cron.job` tiene exactamente 3 trabajos: `clima-sync-wu`, `clima-daily-rollup`, `hato-alertas-tick`. `git grep cron.schedule -- src/sql/migrations/` da solo 030, 036, 060 y 068. `019_auto_reporte_semanal.sql` NO programa nada — solo agrega `html_storage` y `generado_automaticamente`, columnas del boton de generacion rapida. **Una semana sin reporte es cadencia humana, no un defecto de Reportes.** Al 2026-08-10 el ultimo es la S31/2026 (2026-08-01); la S32 no se genero. [corrida: 2026-08-10-lunes]
- **`hato_correcciones` (084) con 0 filas es el estado correcto.** El trigger arranca con `IF auth.uid() IS NULL THEN RETURN`, asi que solo traza sesiones humanas de navegador; migraciones, `service_role` y el bot no dejan rastro por diseño. Verificar los 5 triggers en `pg_trigger` antes de concluir nada del conteo. [corrida: 2026-08-10-lunes]

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
- **Sonda de contenido para un cambio de BUILD, no de componente**: el banner del CSS servido lleva la version del compilador. `curl .../assets/index-*.css | head -c 80` da `/*! tailwindcss v4.3.3 */`; el artefacto congelado del commit anterior decia `v4.1.3`. **Una version de herramienta en el artefacto servido prueba un cambio de pipeline que ninguna sonda de literal alcanza**, porque el cambio no agrega texto de UI. Guardar tambien el conteo de `@property` (91 hoy). [corrida: 2026-08-10-lunes]
- **Como distinguir "desplegaron y despues commitearon" (benigno) de "commit varado" (real) sin leer el bundle**: convertir `list_edge_functions.updated_at` (ms epoch) a UTC y compararlo contra `git log --format=%aI` de CADA commit que toca el arbol edge. Si el despliegue cae a **segundos** de un commit y el siguiente queda minutos u horas despues, el despliegue ES ese commit y el posterior esta varado. Caso 2026-08-06: v200 a las 21:37:29Z, `ddc62cb` +25 s, `23baf4d` +41 min afuera. Esto **acota** la nota del jueves sobre el falso positivo: esa nota aplica cuando el despliegue precede al commit DEL MISMO cambio. [corrida: 2026-08-10-lunes]
- **`pg_policies` renderiza el predicado NORMALIZADO, no como se escribio.** Un `(SELECT es_usuario_gerencia())` sale como `( SELECT es_usuario_gerencia() AS es_usuario_gerencia)` — con espacio tras el parentesis y con alias. Un `LIKE '%(SELECT es_usuario_gerencia())%'` da 0 aciertos y hace parecer que 093 no se aplico. Buscar `'%( SELECT es_usuario_gerencia()%'`. [corrida: 2026-08-10-lunes]
- **No adivinar el id de un bucket de Storage por el nombre del archivo de migracion.** `086_storage_pesajes_fotos.sql` crea `hato-pesajes-fotos`, no `pesajes-fotos`; `085` crea `hato-liquidaciones-fotos`. Consultar `select id, public, created_at from storage.buckets`; un `count(*) = 0` sobre un id inventado se lee igual que "la migracion no se aplico". [corrida: 2026-08-10-lunes]
- **El ledger de migraciones del `CLAUDE.md` raiz tambien se queda atras, no solo el de Supabase.** Al 2026-08-10 documenta 084 y 093 pero le faltan 083, 083b, 085, 086, 089, 090, 091 y 092, y la entrada de 093 dice "Not applied yet" estandolo. **Para elegir el proximo numero de migracion, `ls src/sql/migrations/`, nunca el CLAUDE.md ni `list_migrations`.** Proximo libre: **094**; 087 y 088 son huecos deliberados. [corrida: 2026-08-10-lunes]

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Estado de despliegue | HEAD main **d797b3f** · edge function **v198** desplegada 2026-08-03T17:04:25Z · migraciones **001-082** aplicadas y verificadas contra el catalogo VIVO (067 y 079 son archivos de registro, no huecos) · frontend de produccion verificado POR CONTENIDO en `index-B_XkmZw2.js` · **nada pendiente de desplegar** | 2026-08-06-jueves |
| Lints de seguridad Supabase | **11** (bajo desde 51 tras 082). Composicion estable y esperada — **no re-diagnosticar como hallazgos nuevos** | 2026-08-06-jueves |
| Estado de despliegue (anterior) | HEAD main 7c232f6 · edge function v197 · migraciones 001-076 | 2026-08-03-lunes |
| Cadencia (primera medicion, ventana 2026-06-08→2026-08-03, 8 semanas) | 22,9 commits/sem · 6,4 aterrizajes first-parent/sem · fix share **46,8%** de feat+fix (bajando: 68,8% 1a mitad → 41,0% 2a, **pero la 2a esta sesgada por el build-out del hato**) · lag de deploy del edge function ~1h44m, frontend automatico. **No existe ventana previa comparable: la historia del repo empieza efectivamente el 2026-06-09** — tratar como primera medicion, NO como tendencia | 2026-08-03-lunes |
| Estado de despliegue | HEAD main **b32585b** · edge function **v200** (2026-08-06T21:37:29Z = `ddc62cb`+25s), **1 commit atrasada** (`23baf4d`) · migraciones **001-093** aplicadas y verificadas contra el catalogo VIVO (067/079 son archivos de registro; 087/088 huecos deliberados; el ledger de Supabase se congelo en 80 filas y NO registro ninguna de las 10 de agosto) · frontend verificado POR CONTENIDO, sirviendo b32585b | 2026-08-10-lunes |
| Cadencia (2a medicion, 9 semanas al 2026-08-10) | 23,8 commits/sem · 6,1 aterrizajes first-parent/sem · fix share **53,5%** (46 fix / 40 feat), SUBIENDO desde 46,8% · lag de deploy: frontend automatico, edge `ddc62cb` 25 s pero `23baf4d` 4+ dias. **El alza del fix share esta sesgada por UNA campaña**: el PR #109 (pipeline de Tailwind + recorrida de movil) aporta los 17 `fix` de la semana. Es amortizacion de deuda de UI, no calidad degradandose. La medicion limpia es la de Code Quality del 2026-09-07 | 2026-08-10-lunes |
| Crons | 3/3 sanos, **0 fallos**: clima-sync 41.582 corridas, rollup 125, hato-alertas-tick 19/19 (ultima 2026-08-10) | 2026-08-10-lunes |

## Archivo
(vacio)
