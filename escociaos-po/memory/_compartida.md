# Memoria compartida — navegacion y estado del entorno

Hechos que aplican a mas de un agente. Mismas reglas de escritura que el resto
(`README.md`): solo el orquestador escribe aqui.

## Entorno y acceso
- `execute_sql` del MCP corre como rol `postgres` con `rolbypassrls = true`
  (verificado). Un `count(*)` por SQL directo **SI es autoritativo**. Lo enganoso
  son los row-estimates de `list_tables`. **Regla: nunca clasificar una tabla por
  `list_tables`; siempre `count(*)` explicito.** [corrida: 2026-08-03-lunes]
- Los reads del PostgREST cap-ean en 1.000 filas. Triangulado esta corrida: 0 de
  900 formas de consulta en `pg_stat_statements` usan `LIMIT ALL` (PostgREST lo
  emite cuando NO hay tope), `fetchAll` pagina en bloques de 1.000 y funciona, y
  `docs/plan_reportes_finanzas.md:193` lo midio contra esta misma base. El tope
  NO es legible por SQL: vive en el fichero de PostgREST, no en la BD.
  [corrida: 2026-08-03-lunes]
- **El 403 de Vercel NUNCA fue del conector: era la IDENTIDAD.** Diagnosticado
  2026-08-21 probando los dos caminos contra la API real. Los dos conectores
  (el directo y Composio) estaban OAuth-eados como **`thinksid` /
  `subs@thinksid.co`**, cuyo equipo por defecto es `team_Ov5b46sLrIUWwVlkuCfdCgdG`
  — 5 proyectos, ninguno es Escocia OS. Pruebas: `VERCEL_GET_PROJECTS
  search:"escocia"` → **0 proyectos**; `VERCEL_GET_DEPLOYMENTS app:"escociaos"` →
  **0 despliegues**; pedir `teamId=team_hQ3EH5CL5DQFmWLo3VceWeE6` → **403
  forbidden "Not authorized"**. Ese equipo es `santiago-foreros-projects-da8a20e8`
  y es el dueno de `prj_r9z59zKKLqZo64RgecbEB8lXyYCd`.
  **Consecuencia: 6 corridas filaron "conector Vercel roto, re-autenticar" y
  re-autenticar con el MISMO usuario no habria cambiado nada.** La leccion general:
  un 403 dice "este usuario no", no "este conector no" — antes de culpar al
  conector, preguntar *como quien* esta hablando.
  **Resuelto 2026-08-21**: Santiago reconecto Vercel en Composio con su cuenta
  personal. Cuenta nueva `vercel_tetric-hash` (default). Verificado en vivo: ve
  `escociaos` y sus despliegues de produccion.
  [corrida: 2026-08-03-lunes, corregido y resuelto 2026-08-21]
- **Vercel se lee por Composio, con estos slugs** (verificados 2026-08-21):
  `VERCEL_GET_PROJECTS` (usar `search:"escocia"`) · `VERCEL_GET_DEPLOYMENTS`
  (`projectId` + `teamId` + `limit` + `target:"production"`) · `VERCEL_GET_DEPLOYMENT`
  (`idOrUrl`) · `VERCEL_GET_DEPLOYMENT_EVENTS2` (logs de build, `idOrUrl`) ·
  `VERCEL_GET_DEPLOYMENT_LOGS2` (logs de runtime, `projectId` + `deploymentId`).
  Ids fijos: `projectId=prj_r9z59zKKLqZo64RgecbEB8lXyYCd`,
  `teamId=team_hQ3EH5CL5DQFmWLo3VceWeE6`.
  - **Hay DOS cuentas vercel conectadas en Composio**, asi que
    `COMPOSIO_MULTI_EXECUTE_TOOL` exige `account`. Usar la personal
    (`vercel_tetric-hash`); la vieja `vercel_unami-dogie` (thinksid) no ve el
    proyecto. **Comprobacion de una linea antes de confiar en cualquier lectura**:
    `VERCEL_GET_PROJECTS search:"escocia"` tiene que devolver **1**, no 0. **Si da 0, estas
    en la cuenta equivocada** — no es que el proyecto no exista.
  - **Pedir siempre `limit` bajo (3-5).** Una respuesta grande se guarda en el
    sandbox de Composio (`/mnt/files/...`) y **la operacion no puede leerla**,
    porque `COMPOSIO_REMOTE_BASH_TOOL` y `COMPOSIO_REMOTE_WORKBENCH` estan fuera
    de la allowlist a proposito. Si una respuesta se desborda, eso es NO CORRIO,
    no una excusa para pedir el sandbox.
  - **SECRETO: `VERCEL_GET_PROJECTS` devuelve el bloque `env` del proyecto** con
    los valores cifrados de `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Estan
    cifrados, no en claro, pero **no se copian jamas** a Notion, a un reporte, a
    un commit ni a una notificacion.
  - **RIESGO ACEPTADO Y ANOTADO**: `COMPOSIO_MULTI_EXECUTE_TOOL` es un ejecutor
    **generico** — puede correr cualquier slug de Composio de cualquier toolkit
    conectado (gmail, github, googledrive, quickbooks…), no solo Vercel.
    Permitirlo **no acota el radio** como si lo hace limitar Supabase_Escritura a
    `apply_migration`. Regla, y es de prompt, no de mecanismo: **por Composio solo
    se leen slugs `VERCEL_GET_*`.** Nunca un slug de escritura, nunca otro toolkit.
  - **ESTADO 2026-08-21: CABLEADO Y VERIFICADO en las tres rutinas.** El clasificador de
    auto mode bloqueo el `RemoteTrigger update` tres veces desde la sesion interactiva —
    la aprobacion del dueno en el chat **no alcanza ese gate**, es del harness, no un
    prompt de permiso — asi que Santiago lo aplico el mismo. Estado final confirmado por
    `RemoteTrigger get` en las tres: conector `Composio` presente con los 3 tools en
    `always_allow`, URL real `https://connect.composio.dev/mcp`, y **el conector Vercel
    directo (`159f73fd-…`) retirado de las tres.** Prueba de humo el mismo dia:
    `VERCEL_GET_DEPLOYMENTS` (account `vercel_tetric-hash`) devolvio los despliegues de
    produccion de `escociaos`, el mas reciente `c1a1908` (PR #141) READY/PROMOTED.
    **Si el clasificador vuelve a bloquear un cambio de conectores, no insistir: pasarle
    el payload al dueno para una sesion interactiva.**
  [corrida: 2026-08-21]
- `get_advisors` (security ~111k chars, performance ~614k) y `get_edge_function`
  (~999k chars en v197) revientan el limite de tokens. Guardar a archivo con
  python y leer por partes. El JSON de `get_edge_function` trae
  `files: [{name, content}]`. [corrida: 2026-08-03-lunes]
- **Verificar un deploy de frontend SIN Vercel**: `curl https://escociaos.vercel.app/`,
  extraer `/assets/*.js` del index.html y hacer grep en el chunk lazy relevante de
  una cadena que solo exista despues del commit bajo prueba. Prueba por contenido,
  mejor que un check verde de CI. [corrida: 2026-08-03-lunes]

## Racha del jueves (regla de auto-poda)
| Corrida | Hallazgos nuevos |
|---|---|
| 2026-08-06-jueves | 5 (racha de ceros: **0**) |
| 2026-08-13-jueves | 0 filados — **la Routine SI disparo** (`cse_01PLVdhx…`); murio en prompts de permiso, ver abajo |
| 2026-08-20-jueves | 6 (3 P1 + 3 P2, retenidos por severidad sobre el cap de 5). Racha de ceros: 0 |

## Estado de la operacion
- Ultima corrida: **2026-08-20-jueves** (pulso operativo, roster de 4). Modo:
  **full write · Notion OPERATIVO**.
- Resultado: **6 hallazgos nuevos filados** (3 P1 + 3 P2, uno sobre el cap de 5,
  retenidos por severidad), **2 PRs verdes abiertos** (#130 tests hermeticos, #131
  paginado de clima), **4 verificaciones adversariales** (3 cambiaron el resultado),
  **4 hallazgos cerrados** (#8, #13, #21, #26), **1 actualizado desvinculando su PR
  incorrecto** (#12) y **1 reencaminado a solo brecha de cobertura** (#14).
- **CORRECCION 2026-08-21 — el 08-13 y el 08-17 SI dispararon.** El reporte del
  08-20 dijo "no dispararon" y filo un P1 apuntando al scheduler. Es falso, y
  verificado contra los logs de ejecucion de las propias Routines:
  - `cse_01PLVdhxWGidH513tu31MoGd` (08-13, jueves) — disparo 11:01, ~12 prompts de
    permiso sobre `mcp__Supabase__query_logs`, Santiago interrumpio a las 16:53 y
    escribio *"run with all permisions grantes (auto). stop asking me for
    permissions"*; eso abrio un turno nuevo en otro modelo y la corrida descarrilo.
  - `cse_01Jjf134rJfLxbYnATT4zT7K` (08-17, lunes) — disparo 11:24 y **trabajo bien**:
    Security & Compliance devolvio un P1 real (el `telegram_id` de un usuario Gerencia
    esta commiteado en el repo PUBLICO, asi que forjar el webhook paso de "adivinar
    un id de 10 digitos" a "leer el repo") y Data Integrity dos P2 (la reja de lluvia
    congelada de la 068 sobre-dispara; 43 cabezas sin confirmar). A las **11:37:47**
    pego contra un prompt de permiso de `query_logs`, **espero 22 minutos** con
    cuatro agentes todavia fuera, y murio a las 11:59 sin filar nada. **Esos tres
    hallazgos se perdieron.**
  - **Causa raiz unica**: las rutinas tenian en su allowlist un tool llamado
    `get_logs` que **no existe** en el conector; el real es `query_logs` y no estaba
    en la lista, asi que cada consulta de logs pedia permiso. Corregido 2026-08-21.
  - **Leccion, y es de diseno, no de configuracion**: una allowlist a mano se pudre
    en silencio, y una entrada podrida no falla ruidosamente — convierte una corrida
    desatendida en una corrida esperando a un humano que no esta. Por eso el
    preflight de tools del §4 Phase 0 es el arreglo durable, no el rename.
  [corrida: 2026-08-20-jueves, corregido 2026-08-21]
- **RESUELTO 2026-08-21 — el 403 de Vercel era de identidad, no del conector.** Durante
  6 corridas se filo como "conector roto, re-autenticar"; el conector estaba sano y
  autenticado como un usuario que no pertenece al equipo dueno del proyecto. Santiago
  reconecto Vercel en Composio con su cuenta personal y quedo verificado en vivo. Ver
  el detalle, los slugs y las trampas en "Entorno y acceso" arriba. **La sonda de
  contenido sigue siendo el respaldo valido** cuando Composio no este disponible.

## Leccion de metodo de la corrida 2026-08-10 (la mas cara de olvidar)
**Cinco de cinco verificaciones adversariales cambiaron el resultado**, y ninguna
fue ceremonia:
- El P0 de seguridad sobrevivio pero bajo a P1 (la via de escalamiento al
  inventario real esta cerrada — funcion muerta por desajuste uuid/integer).
- Dos P1 del hato quedaron **refutados enteros**, y su remedio habria revertido una
  decision del dueño de cuatro dias antes (D-14, migracion 091).
- Un P1 de datos bajo a P2 al probarse falsa su consecuencia economica.
- El P1 de inventario quedo **refutado con daño evitado**: el remedio propuesto
  habria fabricado $5,36M de fertilizante inexistente.
**Regla que se gana el sitio: ninguna cirugia de datos en produccion sin que un
verificador independiente reproduzca la reconciliacion por un metodo distinto.**
Dos agentes reconciliaron el mismo inventario y les dio 3 y 5 productos; el
desempate importaba mas que cualquiera de los dos hallazgos. [corrida: 2026-08-10-lunes]

## Lecciones de metodo de la corrida 2026-08-20 (mantener las tres)
1. **El ref local `main` puede estar semanas atrasado respecto a `origin/main`.** Esta
   corrida arranco con `main = cfae769` (2026-08-11) contra `origin/main = 8306dbf`
   (2026-08-18) — 29 commits atras. `git show main:<path>` **falla en silencio
   semantico** (devuelve un arbol viejo, o `exists on disk, but not in 'main'` si el
   archivo es nuevo). Un agente re-leyendo el mismo archivo sin `git rev-parse` habria
   sacado conclusiones sobre codigo de 9 dias antes sin darse cuenta. **Regla: el
   primer comando de cada corrida es `git rev-parse main HEAD origin/main`; si difieren,
   fast-forward `main` a `origin/main` (HEAD queda quieto si esta detached en el commit
   correcto) y leer por `HEAD:<path>`, jamas por `main:` hasta confirmar.** Y notificar
   la correccion a los agentes ya en vuelo por SendMessage, para que rederiven lo que
   este apoyado en lecturas rancias.
2. **`CLAUDE.md` NO es autoritativo sobre el estado de migraciones aplicadas.** Esta
   corrida el archivo decia 'no aplicada' de 3 migraciones aplicadas dias atras, con la
   advertencia de una de ellas invertida ('la app rompe' cuando lo cierto es lo
   contrario). Costo real: 4 agentes gastaron ciclos verificando una ruptura de
   produccion inexistente. **Regla ya escrita en el propio archivo, aplicar sin
   excepcion: verificar contra `pg_proc`/`pg_indexes`/`information_schema` en vivo,
   nunca contra la lista del CLAUDE.md ni contra `list_migrations`.**
3. **`pg_cron succeeded` + HTTP 200 + edge log limpio NO prueban que la operacion
   hizo algo.** El endpoint del clima responde 200 con `{"message":"No data
   available","synced":0}` cuando Ecowitt no tiene datos; los tres verdes coexisten
   con **13,5 h de datos perdidos**. **La unica prueba de liveness del clima es el
   dato mismo:** `SELECT round(extract(epoch FROM (now()-MAX(timestamp)))/60) FROM
   clima_lecturas` y `clima_resumen_diario.lecturas_count`. Agregar `net._http_response.content`
   a la consulta — fue lo que delato la causa en 10 segundos.

## Corrida anterior (2026-08-03-lunes)
- 12 hallazgos filados en Notion (5 P1 + 7 P2), 4 PRs (#98 #99 #100 #101), todos
  fusionados el mismo dia. 4 verificaciones adversariales: 4 de 4 confirmadas en
  el mecanismo, 2 bajadas de severidad, 2 con el impacto corregido.
- Pendientes heredados de la corrida en seco: (a) P0 de `/usuarios/*` **CERRADO**;
  (b) `hato_alertas_config` **YA tiene destinatario**; (c) conector Vercel roto.

## Riesgo operativo detectado esta corrida
- **Todos los agentes comparten UN solo checkout.** Bug Triage hizo `checkout` de
  una rama de trabajo y movio el arbol bajo los pies de los demas: los agentes que
  leyeron archivos despues de ese momento estaban leyendo una rama, no `main`.
  Code Quality si uso worktrees aislados y no tuvo el problema.
  **Regla para la proxima corrida: todo agente que escriba codigo debe usar
  `isolation: worktree`, y los de solo lectura deben leer via `git show main:<path>`
  en vez de confiar en el arbol de trabajo.** [corrida: 2026-08-03-lunes]
  **La regla FUNCIONO el 2026-08-06**: los 4 agentes leyeron por `git show main:`,
  nadie movio el arbol, `git status` quedo limpio toda la corrida. Mantenerla en el
  prompt de despacho — no es opcional. [corrida: 2026-08-06-jueves]
- **`net._http_response` se poda sola en ~7h** y a ese ritmo solo sobreviven los
  del cron de clima (1 cada 5 min). Para ver la respuesta del tick del hato hay
  que mirarla el mismo dia o ir al log de la edge function. Ademas `pg_cron` dice
  `succeeded` con solo haber encolado el `net.http_post`: **no prueba que el
  endpoint respondiera 200**. Para liveness real, cotejar el edge log, nunca
  `cron.job_run_details`. [corrida: 2026-08-06-jueves]
- **`extensions.pg_stat_statements`, no `public`.** Escrito sin esquema falla con
  42P01. El top esta dominado por introspeccion de la plataforma (pg_timezone_names,
  listado de extensiones) y los COPY de pg_dump — filtrarlos antes de concluir nada.
  [corrida: 2026-08-06-jueves]
- **La regla del arbol compartido volvio a funcionar (3a corrida).** Los 5 agentes de
  barrido leyeron por `git show main:<path>`, nadie movio el arbol, `git status`
  quedo limpio. Un solo incidente, detectado y revertido por el propio agente:
  `git -C <repo> worktree add ./ruta-relativa` crea el worktree DENTRO del checkout
  compartido, porque `-C` resuelve la ruta relativa alli. **El prompt de despacho
  debe decir "worktree en ruta ABSOLUTA al scratchpad", no solo "worktree aislado".**
  [corrida: 2026-08-10-lunes]
- **La regla del chequeo del backup nocturno (`thinksid/escocia-backups`, escrita
  2026-08-13) es INEJECUTABLE en el scope actual.** `actions_list` sobre ese repo
  devuelve `Access denied: repository "thinksid/escocia-backups" is not configured
  for this session. Allowed repositories: sforero94/escociaos`. Verificado por el
  orquestador esta corrida. No es que el backup fallara; es que la sesion no puede
  verlo. **Hasta que se ajuste el allowlist, la regla se declara NO CORRIO en cada
  corrida y no se investiga.** Alternativas discutidas para Santiago: (a) agregar
  el repo, (b) heartbeat semanal por Telegram desde el propio `escocia-backups`,
  (c) delegar a otra sesion. [corrida: 2026-08-20-jueves]
- `escociaos-po/CHANGELOG.md` quedo fuera del commit de memoria a proposito: §6
  solo permite `escociaos-po/memory/**` y `escociaos-po/reports/**`. Su contenido
  se absorbio en el reporte de la corrida. Si se quiere un CHANGELOG.md propio,
  necesita su propio PR. [corrida: 2026-08-03-lunes]

## Reglas de negocio confirmadas por Santiago
- **El divisor del jornal es 22** (Santiago, 2026-08-20). Cierra la ambiguedad
  del hallazgo #3 (la app dividia por ~23,8, Esco por 22). La formula legal
  colombiana no aplica aca — es decision del dueno. **Fix pendiente: alinear
  `calculosCostoKg.ts` (y cualquier consumidor de app) al divisor 22 y anadir
  guarda estatica que impida reintroducir otro divisor.** No es refactor;
  cambia la cifra de $ por jornal / $ por kg. [corrida: 2026-08-20-jueves]

## Archivo
(vacio)

## Conectores y capacidad de escritura (corrida 2026-08-20-jueves)
- **La sesion de una corrida programada recibe su lista de conectores CONGELADA al disparar.**
  Habilitar un conector en la cuenta, o editarlo en la rutina, **no alcanza a la sesion que ya
  esta corriendo** — aplica desde la corrida siguiente. Por eso el 2026-08-20 no se pudieron
  aplicar las migraciones desde la propia corrida por mas que el dueno lo autorizara.
  [corrida: 2026-08-20-jueves]
- **`Supabase (Routines)` conecta como `supabase_read_only_user` con
  `default_transaction_read_only = on` y NO expone `apply_migration`.** Toda escritura muere en
  el nivel de transaccion con `25006`, antes de mirar politicas. No es un problema de permisos
  que se pueda sortear: es el guardarrail. [corrida: 2026-08-20-jueves]
- **HECHO DE PLATAFORMA QUE GOBIERNA EL DISENO — de la documentacion de routines, textual:**
  «all of your connected MCP connectors are included by default. Remove any the routine doesn't
  need: **Claude can use every tool from an included connector, including writes, without asking
  for permission during a run**» y «there is no permission-mode picker and no approval prompts
  during a run». **Consecuencia: si se agrega Composio a la lista de conectores de la rutina, las
  corridas de lunes y jueves quedan con escritura irrestricta a produccion, a las 07:00, sin
  nadie mirando y sin que la plataforma pregunte nunca.** Lo unico que lo frenaria seria la
  instruccion del §6 — una guarda de prompt, no de plataforma, en una operacion cuyo trabajo es
  justamente leer contenido no confiable todo el dia.
  **Recomendacion de esa corrida: mantener el conector de escritura FUERA de la rutina.**
  [corrida: 2026-08-20-jueves]
- **REVISADA 2026-08-21 por decision explicita de Santiago.** La recomendacion de arriba
  resolvia un riesgo creando otro: como la lista de conectores se congela al disparar, una
  sesion sin conector de escritura **no puede actuar aunque el dueno diga "go"** — que es
  exactamente lo que costo las migraciones 103/104 y dos dias de clima fabricados. Santiago
  usa la sesion de la propia corrida para actuar cuando se conecta, asi que el camino de
  escritura tiene que estar ahi. Lo que cambio, y es lo que lo hace defendible:
  - **El camino de escritura a la BASE no pasa por Composio.** Es `Supabase_Escritura`
    (`1eeabe38-…`) con `permitted_tools: ["apply_migration"]` y **nada mas**. Sin
    `execute_sql`, el SQL a mano es **mecanicamente imposible**, no solo prohibido. Eso
    convierte la regla del §6 «se ejecuta una migracion revisada, verbatim» en mecanismo.
  - `always_ask` en lunes/jueves; `always_allow` en viernes, que lo necesita desatendido.
  - **ADVERTENCIA — `always_ask` dentro de una Routine NO esta verificado.** La documentacion
    citada arriba dice que no hay prompts durante una corrida; la evidencia observada dice lo
    contrario (los prompts de `query_logs` del 08-13 y 08-17 ocurrieron **y bloquearon**). Las
    dos cosas se concilian si el prompt aparece para tools fuera de `permitted_tools`, pero
    **nadie lo probo para un `always_ask` explicito.** Mientras no se pruebe, **la garantia real
    no es la politica: es que el conector solo expone `apply_migration`.** El peor caso es "corre
    un fichero de migracion que esta en un PR", no "corre SQL arbitrario" — y no hay migracion
    que correr si la corrida no la escribio. Verificar en la primera corrida que intente
    escribir y anotar el resultado aca.
  - **Composio SI quedo adentro de las tres rutinas — pero solo para LEER Vercel.** Esto
    supera la recomendacion del 08-20 de mantenerlo afuera, y se cambio sabiendo lo que
    cuesta. **`COMPOSIO_MULTI_EXECUTE_TOOL` es un ejecutor GENERICO**: corre cualquier slug
    de cualquier toolkit conectado a la cuenta (gmail, github, googledrive, quickbooks,
    linkedin), no solo Vercel. Permitirlo **NO acota el radio** como si lo hace limitar
    `Supabase_Escritura` a `apply_migration`. **La regla «por Composio solo se leen slugs
    `VERCEL_GET_*`» es de prompt, no de mecanismo — y es el unico conector de la operacion
    del que eso es cierto.** En el mismo cambio se quito el conector Vercel directo
    (`159f73fd-…`). Reversa mas segura si alguna vez se quiere: re-autenticar ese conector
    directo con la cuenta personal — mismos datos, 10 tools de solo lectura, sin ejecutor
    generico. **El como leer Vercel (cuenta, ids, slugs, trampas) vive en «Entorno y acceso»
    arriba, no aca** — un solo sitio por hecho.
  [corrida: 2026-08-21, sesion interactiva]
- **Transferir SQL largo por contenido, nunca retecleado.** base64 del fichero -> decode -> una
  sola sentencia atomica. Probado: el round-trip da el mismo sha256. Retipear 496 lineas de
  plpgsql contra produccion es un riesgo de transcripcion que no hace falta correr.
  [corrida: 2026-08-20-jueves]
- **Ningun total absoluto en una guarda de migracion que corre contra una tabla con cron.** La
  103 fijo `v_total <> 1910`; el cron de clima inserta una fila por dia, asi que la guarda
  caduco a las 24 h y volvio la migracion inaplicable (habria hecho todo el trabajo y abortado
  contra si misma). Se captura el conteo de partida y se coteja contra si mismo. [corrida: 2026-08-20-jueves]

## Preflight de tools — la lista esperada (constitucion §4 Phase 0)

Esta es **la** lista. No duplicar en los briefs. Si un nombre no resuelve, es un P1
contra la operacion y la especialidad que dependia de el va bajo NO CORRIO.

| Conector | Tools |
|---|---|
| `Supabase` (solo lectura, `1e08d12f-…`) | `execute_sql` · `list_tables` · `list_migrations` · `list_extensions` · `get_advisors` · **`query_logs`** · `list_edge_functions` · `get_edge_function` · `get_project_url` · `generate_typescript_types` · `list_branches` · `search_docs` |
| `Supabase_Escritura` (`1eeabe38-…`) | `apply_migration` — y nada mas, a proposito |
| `Notion` (`af1e5776-…`) | `notion-search` · `notion-fetch` · `notion-query-data-sources` · `notion-get-users` · `notion-get-comments` · `notion-create-pages` · `notion-update-page` · `notion-create-comment` |
| `Composio` (`2982c4d2-…`) | `COMPOSIO_SEARCH_TOOLS` · `COMPOSIO_GET_TOOL_SCHEMAS` · `COMPOSIO_MULTI_EXECUTE_TOOL` — **solo para leer Vercel**, slugs `VERCEL_GET_*`. Sin `REMOTE_BASH`/`REMOTE_WORKBENCH`/`MANAGE_CONNECTIONS`, a proposito |
| `Vercel` directo (`159f73fd-…`) | **retirado.** Estaba autenticado como `thinksid`, que no ve el proyecto — 6 corridas de ruido. Si alguna vez se re-autentica con la cuenta personal, es el camino *preferible*: sus 10 tools de lectura acotan el radio mecanicamente, cosa que Composio no hace |

**El nombre del tool va como lo expone el conector, sin prefijo.** `get_logs` **NO
existe** y costo dos corridas enteras; el real es `query_logs`.
`notion-query-database-view` esta deprecado y se quito de la allowlist.

## Estado de la operacion (corrida 2026-08-24-lunes)
- Ultima corrida: **2026-08-24-lunes** (barrido semanal, roster de 6). Modo: **full write · Notion OPERATIVO**.
- Resultado: **10 hallazgos nuevos filados** (1 P0 + 1 P1 + 5 P2 + 3 P3), **2 PRs verdes abiertos** (#144
  divisor del jornal, #145 semana ISO), **4 verificaciones adversariales de las cuales las 4 cambiaron el
  resultado**, **1 hallazgo cerrado** (#15, Obsoleto) y **7 actualizados** (#3 #4 #11 #22 #25 #29 #35).
- **EL PREFLIGHT DE TOOLS FUNCIONO Y NO HUBO NI UN PROMPT DE PERMISO EN TODA LA CORRIDA.** `query_logs` —
  el rename que mato las corridas del 08-13 y 08-17 — resuelve y responde. El arreglo del 2026-08-21 quedo
  confirmado en vivo.
- **Migration drift check (lo que el lunes posee): LIMPIO.** Los 19 ficheros 090-108 estan en `main` y las 8
  entradas del ledger desde 20260805 mapean todas a un fichero. Ninguna migracion aplicada sin mezclar.
  PERO la deriva que si existe es de DESPLIEGUE, no de migraciones — ver abajo.

## La leccion de la corrida 2026-08-24: 'fusionado' dejo de ser prueba de nada
El arreglo de seguridad ESCO-1 (PR #133) se escribio, se reviso, se fusiono el 2026-08-20... y **nunca se
desplego**. La operacion lo habia dado por CERRADO contra el merge. Cuatro dias despues las 5 rutas siguen
abiertas anonimamente desde internet, comprobado con los logs del gateway (IP externa, apikey y authorization
vacios, HTTP 200; controles 401 y 404 en el mismo lote).
- **Regla que se gana el sitio: un hallazgo cuyo arreglo toca `supabase/functions/**` NO se cierra con el
  merge. Se cierra con `list_edge_functions.updated_at` posterior al commit.**
- El chequeo cuesta una linea y va en cada corrida: `updated_at` a UTC contra
  `git log -1 --format=%aI -- supabase/functions/make-server-1ccce916`.
- Y el remedio esta BLOQUEADO por otra cosa: desplegar sin aplicar antes la migracion 105 deja el cron de
  clima en 401 cada 5 minutos, en silencio (pg_cron seguira diciendo `succeeded` porque solo encola).
  Orden obligatorio: Vault -> `CLIMA_SYNC_SECRET` en la funcion -> migracion 105 -> deploy.

## INCIDENTE DE METODO 2026-08-24 — una sonda escribio en produccion
El agente de Infra probo la deriva con `curl -X POST .../clima/sync` y recibio 200 **con escritura efectiva**;
el verificador lo encontro despues en los logs del gateway. Fue decisivo y benigno (es exactamente lo que el
cron hace cada 5 minutos, y sin ella la deriva habria tardado mucho mas en probarse), pero **viola la regla de
que el diagnostico es de solo lectura.**
- **Regla afinada, no prohibicion:** la sonda de rutas de edge function se permite **solo sobre endpoints
  idempotentes** y jamas sobre uno que escriba dominio. Cuando exista alternativa, preferir la prueba por
  CONTENIDO del bundle (`get_edge_function` + grep de identificadores, con un control positivo), que prueba lo
  mismo sin tocar produccion — fue lo que uso el verificador y resulto ser evidencia mas fuerte.
- Un segundo agente hizo POST `{}` al webhook de Telegram (no-op: sin `ctx.from` no muta nada). Mismo criterio.

## Preflight de tools — resultado 2026-08-24
| Tool | Resultado |
|---|---|
| `execute_sql`, `list_migrations`, `list_edge_functions`, `get_edge_function`, `get_advisors` | OK |
| **`query_logs`** | **RESUELVE Y RESPONDE.** Notas: la ventana es de 24 h EXACTAS (pedir 24h+5min falla) y en este proyecto `log_attributes['error_severity']` y `['status_code']` vienen vacios en el 100% de las filas — filtrar por `event_message ilike` sobre `source='function_logs'`. Devolvio `Backend error! Retry your query.` en dos agregaciones sobre `edge_logs`; es fallo del backend de logs, no de allowlist |
| Notion (`notion-fetch`, `notion-query-data-sources`, `notion-create-pages`, `notion-update-page`) | OK |
| github (`list_pull_requests`, `pull_request_read`) | OK |
| **`COMPOSIO_MULTI_EXECUTE_TOOL`** | **NO RESOLVIO** — `ToolSearch` devuelve «No matching deferred tools found». Vercel quedo sin cubrir por conector por SEGUNDA causa distinta (la primera fue identidad, resuelta el 08-21). La sonda de contenido lo cubrio igual. **Reverificar el conector antes de la proxima corrida** |

## Corrida 2026-08-24-drenaje (W0+W1, sesion interactiva)
- **EL FLAG `Requiere aprobacion` ERA EL CUELLO DE BOTELLA REAL, no el volumen.** 18 de 25
  hallazgos lo llevaban, y §5 dice que anula `clase` por completo: una sesion desatendida
  podia trabajar en 7 de 25. El re-triage desbloqueo 4 (`#20 #16 #19 #37`, los cuatro
  `ddl_aditivo`) y separo otros 4 (`#11 #45 #12 #42`).
- **Criterio del re-triage, para repetirlo**: se quita el flag cuando (a) las filas
  afectadas esperadas son CERO, (b) la politica ya esta elegida en otro sitio del sistema,
  o (c) es un patron ya aplicado varias veces sin incidente. Se CONSERVA cuando el hallazgo
  empaqueta una decision — y entonces se escribe el corte PARTE A / PARTE B en la propia
  fila, en vez de crear filas nuevas que inflan el conteo.
- **Un hallazgo puede estar sobredimensionado y eso lo bloquea entero.** #19 mezclaba
  <<endurecer logs_auditoria>> (trivial, 0 filas, nada escribe) con <<no existe historial de
  cambios general>> (decision de producto). Recortarlo lo desbloqueo. Buscar ese patron.
- **Escribir SQL no es ejecutarlo.** Una migracion se puede redactar y dejar en un PR sin
  permiso; lo que necesita go es aplicarla. #42 estaba bloqueado entero por confundir las dos.

## ERROR PROPIO 2026-08-24 — el orquestador se salto su propia regla del arbol compartido
Cree la rama del runbook EN el checkout compartido y despache 3 agentes mientras estaba
activa. Los tres heredaron mi commit: el PR #148 nacio con 253 lineas del runbook dentro de
un PR de 8 lineas de docs. El agente lo detecto y lo limpio solo antes de que yo llegara.
- **La regla del arbol compartido (escrita el 2026-08-03) aplica al ORQUESTADOR igual que a
  los agentes.** Nunca crear ni cambiar de rama en el checkout compartido mientras haya
  agentes en vuelo; usar un worktree en ruta absoluta tambien para el trabajo propio.
- **LA MITAD QUE FALTABA, y es la que de verdad protege**: el agente de infra diagnostico el
  mismo incidente y saco una regla mejor — **en este checkout compartido, un worktree se basa
  en `origin/main` EXPLICITAMENTE, nunca en `HEAD`.** Asi el agente queda inmune aunque el
  orquestador se porte mal. Las dos mitades hacen falta: el orquestador no crea ramas en el
  arbol compartido, Y los agentes no confian en HEAD. Ese agente lo detecto con
  `git merge-base --is-ancestor` y lo corrigio con `git rebase --onto origin/main`.
- **Chequeo barato de contaminacion antes de dar por bueno cualquier PR de agente**:
  `git diff --name-only origin/main origin/<rama>` — si aparece un fichero que el hallazgo
  no menciona, hay contaminacion. Las estadisticas del PR (adiciones/ficheros) la delatan
  antes: <<8 lineas>> en el cuerpo contra 261 adiciones en las stats.

## ERROR PROPIO 2026-08-24 — el barrido de secretos no miraba la propia operacion
El P0 de la corrida del lunes era <<hay chat ids en el repo publico>>, y el barrido miro
`src/` y `docs/` y **nunca miro `escociaos-po/`**. Habia un chat id de Gerencia en
`escociaos-po/memory/usage-analytics.md:69` desde el 2026-08-10 (commit `8aae063`);
sobrevivio dos corridas. Ademas aparecio un TERCER id en `docs/plan_hato_telegram_estados_agosto_2026.md:52`
que el hallazgo original no listaba.
- **Regla: los ficheros de la propia operacion son parte del repo publico y entran en todo
  barrido de secretos.** La guarda del PR #150 ya incluye `escociaos-po` en sus
  DIRECTORIOS, asi que queda cerrado por mecanismo.
- **Al buscar ids con un regex de 9-11 digitos, los numeros de version de migracion
  (`20260803170340`) son falsos positivos.** Filtrarlos antes de contar, o se reporta un
  filtrado donde no lo hay.

## Metodo confirmado 2026-08-24: cerrar contra el despliegue, no contra el merge
Santiago desplego durante la corrida y **#36 se cerro con cuatro pruebas independientes**:
cron mandando el encabezado, `list_edge_functions` en v215, sonda anonima 401 con controles
404/401, y — la que de verdad importaba — el clima sin perder un tick (6 ticks 200 con
`synced:1`, ultima lectura 1 minuto). **El bucle de 401 silencioso que era el riesgo del
orden no ocurrio porque los dos valores del secreto coincidian.**

## Corrida 2026-08-24-drenaje-continuacion — herramientas que fallan EN SILENCIO
Las tres costaron trabajo real esta corrida. El patron es el mismo y el remedio tambien:
**verificar el EFECTO, nunca el codigo de salida del comando.**

- **`sed` de BSD (macOS) falla en silencio sobre cualquier caracter multibyte dentro de
  corchetes.** `s/[Mm]igraci[oó]n 113/…/g` no reemplaza nada: BSD trata la expresion entre
  corchetes **byte a byte**, asi que `[oó]` es el conjunto `{o, 0xC3, 0xB3}` y jamas coincide
  con «o». Nueve citas sobrevivieron mientras un `echo "corregido: $f"` incondicional
  informaba exito, **y el mensaje de commit afirmo en falso que no quedaba ninguna**. Con
  acentos: **Python con conteo explicito de reemplazos**, nunca `sed`. Y nunca un `echo` de
  exito que no dependa del resultado.
- **`git push -q` oculta un push RECHAZADO.** Si la rama local no se llama igual que la de
  arriba, bajo `push.default=simple` el push se rechaza; `-q` mas `tail -1` se comen el
  mensaje y dos commits se quedan locales creyendose empujados. **Siempre refspec explicito
  (`git push origin HEAD:<rama>`) y comparar `git rev-parse HEAD` contra
  `git ls-remote origin <rama>` en la misma salida.**
- **`pg_get_functiondef()` DEVUELVE LOS COMENTARIOS DEL CUERPO.** Una post-condicion que
  busca un patron prohibido con `ILIKE` se dispara con el comentario que explica por que ese
  patron esta mal. Si hay que nombrar el antipatron, nombralo **fuera** del cuerpo.

## Corrida 2026-08-24-drenaje-continuacion — la compuerta 3 se gano el sitio dos veces
En una sesion con go del dueno y prisa, **el verificador adversarial independiente corrigio
dos migraciones de datos antes de que tocaran produccion**, y las dos veces con una prueba
EXTERNA que el autor no habia buscado:

- **La 118 apuntaba a la fila equivocada.** Habia dos `Entrada` identicas y el borrador
  razono que eran intercambiables. La evidencia que decide **no estaba en la tabla del
  hallazgo**: `compras` mostraba que la fila superviviente debia ser la que coincide en
  ~0,5 s con el INSERT de la compra, firma de `NewPurchase.tsx` (`compras → productos →
  movimiento`) que se repite en TODAS las compras de la tabla. **Guardar esa firma: sirve
  para atribuir cualquier movimiento huerfano de inventario.**
- **El argumento central de la 119 era CIRCULAR.** Sostenia que un saldo era de fiar porque
  coincidia con el `saldo_anterior` **de la propia fila bajo sospecha**. El argumento valido
  era `productos.updated_at`, dos minutos anterior a la compra corregida, mas una tabla
  distinta (`verificaciones_detalle`) que ya lo decia seis dias despues.

**Regla que se gana el sitio: si la prueba de que una fila es mala sale de la misma fila,
no es prueba.** Buscar el artefacto de OTRA tabla o de OTRO momento antes de escribir.

## Desviacion registrada de la compuerta 5 (2026-08-24)
Tras un **503 de la API de administracion** en pleno `apply_migration`, el reintento se envio
con los comentarios condensados y los mensajes sin acentos: **los bytes aplicados no fueron
los bytes del fichero**. Se verifico primero contra el catalogo que nada se habia aplicado
antes de reintentar, pero la desviacion es real y queda anotada. **Ante un 503, reintentar el
MISMO contenido** — y si hay que cambiarlo, cambiar el fichero, empujarlo y reintentar desde
ahi.

## Racha del viernes (regla de auto-poda)

| Corrida | Elegibles drenados |
|---|---|
| (primera: 2026-08-28-viernes) | — |

Tres viernes seguidos con el conjunto elegible vacio → el reporte recomienda pasar
el viernes a mensual.

## LIMITE DURO 2026-08-24: el carril `ddl_aditivo` ya NO alcanza `storage.objects`

`ALTER POLICY`, `CREATE POLICY`, `DROP POLICY` y `COMMENT ON POLICY` exigen ser
**DUENO** de la tabla. Ningun `GRANT` lo confiere, por completo que sea —
`postgres` tiene `a*r*w*d*D*x*t*m*` sobre `storage.objects` (DML entero, con
grant option) y aun asi no puede tocar una politica.

`storage.objects` pertenece a `supabase_storage_admin`. **`apply_migration` corre
como `postgres`**, y `postgres` hoy no llega a ese rol por ninguna via:

```
current_user = postgres | session_user = postgres
pg_has_role(current_user,'supabase_storage_admin','USAGE')  = f
pg_has_role(current_user,'supabase_storage_admin','MEMBER') = f
pg_has_role(current_user, relowner_de_storage_objects,'USAGE') = f
```

**Antes si se podia.** La migracion 072 creo cuatro politicas sobre esa misma
tabla y tiene fila en el ledger con version de marca de tiempo
(`20260730002128`), que es el formato que genera `apply_migration`. Entremedio el
servicio de Storage corrio migraciones propias el 2026-08-10, 08-20 y 08-23.
**Un permiso de julio no prueba el permiso de hoy.**

Consecuencias practicas:

- Cualquier hallazgo sobre politicas de Storage **no es `ddl_aditivo`**. Se
  clasifica aparte desde el principio, o se pierde una corrida entera
  descubriendolo. Le paso a #20.
- La via que si funciona: panel de Supabase -> Storage -> Policies, que pasa por
  el servicio de Storage y corre como el dueno. No la puede recorrer un agente.
- **`pg_auth_members` no guarda historia**, asi que no se puede saber cuando se
  perdio la membresia. No gastes tokens buscandolo.

[corrida: 2026-08-24-drenaje-cierre]

## TECNICA 2026-08-24: la sonda que NO puede escribir

El conector de solo lectura no puede contestar «con que rol corre
`apply_migration`». El de escritura solo expone `apply_migration`. La salida es
una migracion que **aborta por construccion**: un `DO $$ ... RAISE EXCEPTION $$`
incondicional que mete las respuestas en el propio mensaje de error.

```sql
DO $$
BEGIN
  RAISE EXCEPTION 'SONDA :: current_user=% | usage=%',
    current_user, pg_has_role(current_user,'supabase_storage_admin','USAGE');
END $$;
```

La transaccion revierte, **no queda fila en `supabase_migrations.schema_migrations`**
y no se muta nada — verificado despues: 0 filas, `max(version)` sin cambio,
predicado intacto. Es la forma segura de contestar una pregunta de permisos
antes de escribir una migracion que quiza ni arranca.

**Contraste con el incidente de la sonda de `/clima/sync`** (2026-08-24, mas
arriba): aquella escribio en produccion porque el endpoint sondeado NO era
idempotente. La diferencia no es la intencion, es que **esta sonda no puede
escribir aunque quiera**. Diseña la sonda para que el fallo sea el unico
resultado posible.

[corrida: 2026-08-24-drenaje-cierre]

## Verificar un despliegue de edge function SIN leer el codigo desplegado

`get_edge_function` desborda el limite de tokens (ya anotado). Pero el
despliegue se hace desde un **worktree local**, y `list_edge_functions` devuelve
su ruta en `entrypoint_path`. Eso permite fijar exactamente que se desplego:

1. `entrypoint_path` -> el worktree usado.
2. `git -C <worktree> reflog --date=iso` -> a que commit estaba y **cuando**.
3. `stat -f '%Sm'` sobre los ficheros del arbol de la funcion -> cuando se
   escribieron. Un fichero con `mtime` anterior al checkout es un fichero que el
   checkout no toco.
4. `git merge-base --is-ancestor <merge> <HEAD del worktree>` -> si el arreglo
   viajaba.

Caso real: el despliegue de las 15:52:43Z venia de un worktree puesto en
`b70206e` a las **15:52:01Z** — 42 s antes. `jornal.ts` tenia `mtime` 15:52:01Z
(el arreglo de #3 viajo), y `bot.ts` tenia `mtime` del 2026-08-21 (la puerta del
webhook de #11 NO viajo). Los commits posteriores del worktree (16:09Z, 16:10Z)
eran solo documentacion. **Dos hallazgos resueltos en direcciones opuestas con
el mismo despliegue.**

[corrida: 2026-08-24-drenaje-cierre]

## Sonda de contenido contra Vercel: como se hace bien

192 chunks; el codigo de un modulo vive en un chunk perezoso, no en
`index-*.js`. El procedimiento:

1. `curl` de `/` -> sacar `/assets/index-*.js`.
2. `grep -oE '"\./[A-Za-z0-9._-]+\.js"|assets/[A-Za-z0-9._-]+\.js'` sobre el
   bundle de entrada -> la lista de chunks perezosos.
3. Bajar todos y buscar en el conjunto.

**El control positivo se elige entre cadenas de dominio** (`fraccion_jornal`,
`tarifa_jornal`), nunca nombres de funcion ni de constante exportada — el
minificado se los come. Sin control valido, una *ausencia* no significa nada.

**Un literal numerico si sobrevive al minificado** y sirve de sonda negativa:
asi se probo que `WEEKS_PER_MONTH = 4.33` salio de produccion — `4.33` no
aparece en ninguno de los 192 chunks de la app, solo en el vendor
`jspdf.es.min`.

[corrida: 2026-08-24-drenaje-cierre]

## Corrida 2026-08-24-drenaje-cierre (sesion interactiva, §1 del runbook de drenaje)

- **#3 CERRADO** contra el despliegue verificado, no contra el merge. El criterio
  que traia el runbook (`version > 215`) partia de una premisa falsa: suponia que
  la mitad de Telegram viajaba en el SIGUIENTE despliegue, y ya viajaba en el
  actual. **Cuando un criterio de cierre es un proxy, verifica la regla, no el
  proxy.**
- **#20**: migracion 109 escrita, revisada y corregida; **no aplicada** (compuerta
  3 UNSAFE, ver el limite duro de `storage.objects` arriba). PR #154.
- **#11 y #22 siguen abiertos por CREDENCIAL, no por esfuerzo.** Ninguna cantidad
  de trabajo desatendido los cierra: uno necesita `TELEGRAM_BOT_TOKEN` y el otro
  un `SUPABASE_ACCESS_TOKEN` de repositorio. **Escalar temprano un bloqueo de
  credencial vale mas que investigarlo bien.**
- Backlog 23 -> 22. Cero hallazgos nuevos, que es lo correcto en drenaje.

[corrida: 2026-08-24-drenaje-cierre]
