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


## Corrida 2026-08-24-lunes
- **EL LAG DE DESPLIEGUE DE LA EDGE FUNCTION ES AHORA LA METRICA IMPORTANTE DE ESTE ROL.** Paso de 25 s
  (2026-08-06) a **3 dias 17 h** (2026-08-24). Chequeo de una linea, cada corrida: convertir
  list_edge_functions.updated_at (epoch ms) a UTC y compararlo contra
  `git log -1 --format=%aI -- supabase/functions/make-server-1ccce916`.
- Cuando el despliegue vivo es ANTERIOR al commit por DIAS (no por segundos), el falso positivo conocido de
  'desplegaron y despues commitearon' queda descartado sin necesidad de la comparacion byte a byte, que ademas
  desborda el limite de tokens.
- **ESCO-1 SE CERRO CONTRA EL MERGE Y NO CONTRA EL DESPLIEGUE, y ese es el error de proceso de la corrida.**
  Regla del rol que hay que hacer cumplir explicitamente: un hallazgo cuyo arreglo toca `supabase/functions/**`
  NO se cierra con el merge; se cierra con updated_at posterior al commit.
- **LA 105 BLOQUEA EL DESPLIEGUE.** 0a7308c pone la puerta verificarAccesoClima en /clima/sync y /clima/backfill,
  y el job 1 clima-sync-wu no manda el encabezado. Verificar SIEMPRE con
  `select (command ilike '%x-clima-sync-secret%') from cron.job where jobid=1` antes de recomendar un deploy.
  Orden obligatorio: Vault -> CLIMA_SYNC_SECRET en la funcion -> migracion 105 -> deploy.
- **Hallazgo #15 CERRADO como Obsoleto**: los respaldos de 075/076 se borraron a proposito
  (`20260803170340 drop_backups_075_076_monitoreo`, issue #96 item 12, aprobado por Santiago).
  **Un respaldo backup_* que desaparece puede ser deliberado, y la unica forma de saberlo es
  `select statements from supabase_migrations.schema_migrations where name ilike '%backup%'`.
  La ausencia de la tabla no prueba descuido.**
- **PR #118 (arregla #35) YA NO FUSIONA** desde que cf894d5 corrigio el estado de la 093. Verificado sin tocar
  el arbol compartido con `git merge-tree --write-tree --messages 2d0006e refs/po/pr118` — **esa es la forma de
  simular un merge en un checkout compartido.**
- Los 15 'DESYNC' entre los dos arboles de edge function siguen siendo SOLO la primera linea `// ARCHIVO:`
  (verificado con diff completo, no solo -w). Y index.tsx vs index.ts difiere de nombre a proposito. Ninguna de
  las dos cosas es un hallazgo. No re-investigar.
- **El fix share NO es interpretable en ventanas de 4 dias**: tres periodos seguidos con un sesgo identificable
  distinto (Tailwind, features, cosecha del propio PO). Reportarlo mensual. Esta ventana: 72,2% fix, pero 5 de
  los 13 fix son PRs de esta misma operacion.
- Cadencia: 29 commits sin merge en 3,76 dias = 54/semana, pero TODO cabe en 27 horas y despues hay 2 dias 15 h
  sin un solo commit. Es un pico, no un ritmo.

- **SONDA DE CONTENIDO — el control positivo se elige entre cadenas de DOMINIO, no entre nombres de
  funcion.** El 2026-08-24 use `obtenerFechaHoy` como control y dio 0: no sobrevive al minificado. No
  invalido el resultado porque lo buscado era una PRESENCIA (`anioISO`, que si aparecio), y un hit prueba
  presencia — un control roto solo hace ininterpretable una AUSENCIA. La segunda sonda uso `tarifa_jornal` /
  `fraccion_jornal` / `salario` y funciono: ahi si se pudo afirmar que `4.33` tiene 0 ocurrencias y `/22` una.
- #144 y #145 se mezclaron el 2026-08-24 15:49 UTC (main = b70206e). **#27 cerro (frontend puro, Vercel
  despliega solo). #3 NO cerro: su mitad de Telegram vive en telegram/conversations/jornal.ts y necesita el
  deploy de la edge function.** Mientras tanto hay una ventana real en la que el bot cotiza el jornal 8,25%
  por debajo del navegador Y LO ESCRIBE a registros_trabajo.costo_jornal. Es el caso de libro de por que la
  regla 'merge != deploy' importa.

## Corrida 2026-08-27-jueves

### Estados aceptados
- **`contador_congelado > 0` en `clima_resumen_diario` NO refuta la reparacion de la 122.** Al
  2026-08-27 quedan 27 filas y **las 27 son de `station_id = 'wunderground-historico'`** (2020-2025);
  la serie Ecowitt esta en cero, que es lo que la 122 afirma. **Agrupar SIEMPRE por `station_id` antes
  de concluir nada sobre confianza de lluvia** — hay dos estaciones y solo una alimenta el sistema hoy.
- **`hato_alertas_tick_runs` con `generadas = 0` es el motor funcionando**, no una falla: 179
  evaluados / 176 sin raza / 0 generadas, tres dias seguidos `estado='ok'`. El cero es consecuencia
  del dato faltante, y ese era justamente el punto de la migracion 116. **No filar como «el motor esta
  caido».**
- **`productos.updated_by` en 0 filas tras la 112 es correcto**: el trigger solo dispara en `UPDATE` de
  sesion humana de navegador, y en 3 dias no hubo ninguno. Misma familia que `hato_correcciones`.

### Navegacion
- **`VERCEL_GET_*` por Composio exige `limit` como STRING** (`"3"`), no entero: un entero devuelve
  `400 Invalid request data — Input should be a valid string on parameter 'limit'`. Ese 400 se lee
  igual que «el conector sigue roto». **Composio quedo VERIFICADO el 2026-08-27** — fallo el 08-24 por
  no resolver; hoy resuelve y devuelve el proyecto.
- **Prueba de que una RUTA existe en el bundle desplegado, sin leerlo y sin escribir**: `POST` anonimo
  a la ruta contra `POST` a una ruta hermana inventada. **401 = la ruta existe y su puerta esta puesta;
  404 = no esta desplegada.** Mas barato que `get_edge_function` (~1 MB) y mas fuerte que comparar
  timestamps. Cumple la regla de la sonda idempotente: el gate corta antes de tocar dominio.
- **`net._http_response` no tiene columna `url`**, asi que no se puede correlacionar por endpoint.
  Correlacionar por `created` al segundo contra `cron.job_run_details.start_time`, y **desempatar por
  la FORMA del `content`, no por proximidad temporal** — dos jobs pueden disparar en el mismo minuto
  (1 y 8 a las 11:00). Un `JOIN LATERAL` por cercania devuelve el cuerpo del job equivocado y se ve
  perfectamente plausible.
- **`status_code IS NULL` + `error_msg` con `Timeout of 5000 ms` NO significa que el endpoint fallara**
  — es pg_net rindiendose, con la funcion corriendo del otro lado. Distinguir por el efecto en las
  tablas de dominio, nunca por el `status_code`.

### Baselines
| Que | Valor | Corrida |
|---|---|---|
| Cadencia | Ventana de 3 dias, **NO interpretable como tendencia**: 63 commits, 41 aterrizajes, fix share 31/32 = 97%. **Es el drenaje del backlog, no calidad degradandose.** La medicion limpia es mensual | 2026-08-27-jueves |
| Backlog | **8 abiertos** (eran 25 antes del drenaje). Mas viejo: 24 dias. **0 estancados** (>60 dias) | 2026-08-27-jueves |

### Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|
| release/clima/122-no-reparo-congelados | Quedan 27 `contador_congelado`, luego la reparacion historica de la 122 no funciono | Las 27 son de `wunderground-historico`, otra estacion. La serie Ecowitt esta en 0, exactamente como la 122 declara | 2026-08-27-jueves |
| release/frontend/reconstruido-ausente-del-bundle | El bundle servido no contiene `reconstruido`, luego no es la build de #178 | El literal `'reconstruido'` **no existe en el fuente** de `calculosClima.ts` en `d1627f6` — es un valor solo de base de datos, el frontend no lo nombra. La build se probo con marcadores de dominio (`sin lluvia >=`) y control negativo (`text-amber-600 mt-0.5` ausente) | 2026-08-27-jueves |

## Archivo
(vacio)


## Estados aceptados (corrida 2026-08-20-jueves)
- **`acciones_corridas` con `estado='parcial'` es el motor funcionando, no una falla.** El
  validador anti-invento rechaza acciones individuales (`LONGITUD` >90 caracteres,
  `SIN_DATO_MAL_USADO`, `NUMERAL_EN_LETRA`) y publica el resto; `parcial` = hubo rechazos,
  `ok` = ninguno. 4 de las 5 primeras corridas fueron `parcial` y publicaron 7-8 acciones
  igual. **No filar como defecto sin mirar `rechazos`.** [corrida: 2026-08-20-jueves]
- **`acciones-render.ts` no tiene importador del lado edge** — el validador re-implementa el
  render. Su ausencia del bundle desplegado es correcta, igual que `acciones-tipos.ts`,
  `importHato/tipos.ts` y `telegram/types.ts`, que son `import type` y se borran al transpilar.
  [corrida: 2026-08-20-jueves]
- **Los 16 "DESYNC" entre `src/supabase/functions/server/` y `supabase/functions/make-server-1ccce916/`
  son solo el comentario `// ARCHIVO:` de la primera linea.** Verificar con `diff -w` antes de
  reportar paridad rota. [corrida: 2026-08-20-jueves]
- **Migracion aplicada sin archivo commiteado**: `ganado_revertir_duplicado_carga_inicial`
  (version 20260817152442) removio 43 cabezas del inventario (Bosque -19 toros, Mochuelos
  Repele -11 novillos, Quebradas -13 toros) para revertir un duplicado de la carga inicial.
  Es del mismo patron que 067 y 079 — el cuerpo se recupera de
  `supabase_migrations.schema_migrations.statements`. Debe archivarse como `NNN_ganado_revertir_duplicado_carga_inicial.sql`
  marcado "archivo de registro, no aplicar" con la aritmetica 163+238-43=369 en el encabezado.
  [corrida: 2026-08-20-jueves]

## Navegacion (corrida 2026-08-20-jueves)
- **El ref local `main` puede estar semanas atrasado respecto a `origin/main`, y `git show
  main:<path>` falla en silencio semantico** (devuelve un arbol viejo, o `exists on disk, but
  not in 'main'` si el archivo es nuevo). **Arrancar toda corrida con `git rev-parse main HEAD
  origin/main` y leer por el SHA de la corrida, nunca por `main:`.** Esta corrida el ref estaba
  29 commits atras (cfae769 vs 8306dbf). [corrida: 2026-08-20-jueves]
- **Verificacion fuerte del edge function: comparacion byte a byte, no timestamp.**
  `get_edge_function` → guardar el JSON → `files: [{name, content}]` → comparar cada uno contra
  `git show <sha>:supabase/functions/make-server-1ccce916/<n>`. Da tres listas (solo-repo /
  solo-desplegado / contenido distinto) y elimina la ambiguedad de "desplegaron antes de
  commitear". [corrida: 2026-08-20-jueves]
- **Sonda de contenido para un hook compartido: el chunk lleva el nombre del HOOK, no de la
  ruta.** Los RPC de ganado no estan en `GanadoDashboard-*.js` ni en `GanadoMovimientos-*.js`
  sino en `useGanadoInventario-*.js`. Extraer el grafo completo con
  `grep -oE '[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.js'` sobre `main.js` **y sobre los chunks de
  ruta**, no solo sobre el index. [corrida: 2026-08-20-jueves]
- **Un PR adjunto a una fila de Notion no prueba que esa fila este arreglada.** El PR #100
  estaba adjunto al hallazgo #12 y nunca toco `CargaMasiva.tsx`. **Verificar `git show --stat
  <merge>` contra el archivo que el hallazgo nombra**, antes de cualquier veredicto de cierre.
  [corrida: 2026-08-20-jueves]

## Baselines (corrida 2026-08-20-jueves)
| Estado de despliegue | HEAD main **8306dbf** · edge function **v213** (2026-08-18T01:36:38Z), **byte-identica a HEAD** (56/56 archivos, 0 diferencias) · migraciones **001-102 aplicadas y verificadas contra el catalogo VIVO** (067/079 archivos de registro; 087/088 huecos deliberados; `ganado_revertir_duplicado_carga_inicial` aplicada sin archivo) · frontend verificado POR CONTENIDO en `index-CeSmVn6y.js` sirviendo 8306dbf, incluida la ultima commit · **nada pendiente de desplegar** | 2026-08-20-jueves |
| Crons | **4/4 sanos** (nuevo: `acciones-recomendadas-tick` a `50 10 * * *`), todos `succeeded` el 2026-08-20 | 2026-08-20-jueves |
| Cadencia (ventana corta 2026-08-10→08-18, 8 dias) | 34,1 commits/sem (sube desde 23,8) · fix share **31,8 %** (baja desde 53,5 %). **Empujon de features, no calidad degradandose** | 2026-08-20-jueves |
| Motor de acciones | 5 corridas · 38 acciones · 9 publicadas hoy · `estado` hoy `ok` | 2026-08-20-jueves |
| Handoff del hato a captura viva | **173 pesajes + 10 eventos** desde 2026-08-10 via Telegram — el hallazgo #8 ("nunca hizo el handoff") **cambio de estado en los hechos** | 2026-08-20-jueves |

## Corrida 2026-08-24-drenaje-cierre

- **Cuando el criterio de cierre de un hallazgo es un PROXY, verifica la regla y
  no el proxy.** El runbook mandaba cerrar #3 si `version > 215`. La version sigue
  en 215 y el arreglo **igual estaba vivo**: el despliegue (15:52:43Z) es
  posterior al merge del PR #144 (15:49:12Z). La regla real del contrato §5 —
  `list_edge_functions.updated_at` posterior al commit — si se cumplia. Cerrar por
  el proxy habria dejado abierto un hallazgo ya resuelto durante otra semana.
- **Un solo despliegue puede resolver dos hallazgos en direcciones OPUESTAS.** El
  mismo v215 llevo el arreglo de #3 (`jornal.ts`, `mtime` 15:52:01Z, 42 s antes
  del deploy) y **no** llevo el de #11 (`bot.ts`, `mtime` del 2026-08-21). No
  asumas que un despliegue arrastra todo lo fusionado antes: mira fichero por
  fichero. La receta esta en `_compartida.md` («Verificar un despliegue de edge
  function SIN leer el codigo desplegado»).
- **Un hallazgo puede tener dos superficies y hay que probar las dos.** #3 vivia
  en la edge function Y en el navegador. La mitad de Vercel se probo con sonda de
  contenido sobre los 192 chunks; receta y trampas en `_compartida.md`.
- Cerrado esta corrida: **#3** (`Arreglado`). Backlog 23 -> 22.

[corrida: 2026-08-24-drenaje-cierre]

---

## Corrida 2026-08-31-lunes

**Baselines**

| Que | Valor |
|---|---|
| Estado de despliegue | HEAD `cc19bdb` · **frontend Vercel AL DIA**, probado por contenido (`"No tienes permisos para eliminar"` de `c60c9ef` presente en `Contratistas--runZII5.js`, control positivo `tarifa_jornal` presente) · **edge function v236 REGRESADA al bundle de la v224** (`ezbr_sha256` `4fba67c3…` identico), 11 commits / 17 ficheros / +6.062 lineas fuera de produccion · **migraciones 001-132 todas aplicadas**. Cero fusionadas-sin-aplicar, cero aplicadas-sin-fusionar |
| Crons | **6 jobs, todos `active`** (nuevo: jobid 9 `ronda-inventario-tick`, 12:00 UTC). **Los 6 sin `timeout_milliseconds`** — el #55 crece a tres jobs |
| Backlog | **6 abiertos al inicio → 18 al cierre** (13 filados, 1 cerrado). Mas viejo: 28 dias (#4). **0 estancados** |
| Cadencia (6,58 dias) | 90 commits sin merge = **95,7/sem** (record) · 54 aterrizajes = **57,4/sem** · fix share **78,8%** — **NO interpretable**, cuarta ventana seguida con sesgo distinto (ahora: drenaje del viernes). **80 de 90 commits caben en DOS dias**: es un pico doble, no un ritmo |

**Primera semana con el drenaje del viernes en operacion, y el efecto es medible**: el 28-ago concentra 24 commits sin
merge y 4 PRs (#180-#183) fusionados en 23 segundos, contra un backlog que **no crecio** hasta esta corrida. La rutina
hace lo que se diseno para hacer.

**Navegacion (nuevo)**
- **La regla de los tres testigos tiene un ATAJO DE UN PASO cuando lo que se sospecha es una REVERSION**: comparar
  `ezbr_sha256` contra el hash de la ultima version verificada por contenido, que esta memoria ya guarda. Si coincide
  exacto, el bundle vivo es aquel arbol y **no hace falta leer 1 MB de `get_edge_function`**. Hoy la v236 devolvio el
  hash de la v224 y eso fijo el cutoff sin una sola descarga. **Guardar SIEMPRE el hash de toda version verificada.**
- **Con el cutoff fijado, la consecuencia release-side se calcula con
  `git diff --stat <sha-del-bundle> HEAD -- supabase/functions/make-server-1ccce916/`**, separando los **modulos de
  runtime nuevos** de los de solo-tipos: la ausencia de `acciones-tipos.ts`, `importHato/tipos.ts`,
  `telegram/types.ts` y `acciones-render.ts` es **esperada**; la de cualquier otro `.ts` con exports de runtime, no.
- **Un modulo puede estar MEDIO vivo y hay que decirlo asi**: la ronda tiene frontend en Vercel y las 9 migraciones
  aplicadas, pero cero superficie servidor. No es «el modulo no existe» sino **«el modulo es de solo lectura y el cron
  dispara al vacio»**.

**Estados aceptados**
- **`verificaciones_inventario` 1 fila / `verificaciones_detalle` 223 con `contado=false` es el estado CORRECTO y
  congelado.** #49 cerrado esta corrida como `Aceptado (no se arregla)` — superado por la ronda, no arreglado.
  **No re-filar.**
- **La entrada `132_fn_ronda_proponer_ajuste_cantidad_confirmada` del ledger lleva el prefijo numerico DENTRO del
  campo `name`**, a diferencia de las otras diez de esa tanda. Un barrido que empareje `name` contra el fichero la
  marca como huerfana. Cosmetico, ya anotado, **no re-investigar**.
- **`escociaos-po/CHANGELOG.md` NUNCA se creo** pese a que el brief lo manda desde la primera corrida
  (`.claude/agents/release-changelog.md:52`). El contenido existe repartido en `escociaos-po/reports/`. **NO se filo
  por el cupo de 12**; es P3 `decision` y hay dos salidas legitimas y opuestas: crearlo con bootstrap desde los
  reportes, o **retirar el mandato del brief** si el reporte por corrida ya cubre la necesidad. Lo que no es
  defendible es el estado actual: un entregable obligatorio que lleva un mes sin producirse y que ninguna corrida
  reporto como faltante. **La entrada de changelog de esta semana esta escrita dentro de
  `escociaos-po/reports/2026-08-31-lunes.md`, lista para migrar si se decide crearlo.**
