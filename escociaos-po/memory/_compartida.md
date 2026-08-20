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
- **Vercel MCP sigue inutilizable, 2a corrida consecutiva** — `list_teams` solo
  devuelve `team_Ov5b46sLrIUWwVlkuCfdCgdG` (0 proyectos); `list_projects` contra
  el scope real da 403. El proyecto real es `prj_r9z59zKKLqZo64RgecbEB8lXyYCd`
  bajo `team_hQ3EH5CL5DQFmWLo3VceWeE6` (slug `santiago-foreros-projects-da8a20e8`),
  dato obtenido del comentario de vercel[bot] en el PR #98. **Ya filado como P1
  contra la operacion (§7); no re-diagnosticar, solo declarar bajo NO CORRIO.**
  [corrida: 2026-08-03-lunes]
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
| 2026-08-13-jueves | NO CORRIO (no disparo la Routine) |
| 2026-08-20-jueves | 6 (3 P1 + 3 P2, retenidos por severidad sobre el cap de 5). Racha de ceros: 0 |

## Estado de la operacion
- Ultima corrida: **2026-08-20-jueves** (pulso operativo, roster de 4). Modo:
  **full write · Notion OPERATIVO**.
- Resultado: **6 hallazgos nuevos filados** (3 P1 + 3 P2, uno sobre el cap de 5,
  retenidos por severidad), **2 PRs verdes abiertos** (#130 tests hermeticos, #131
  paginado de clima), **4 verificaciones adversariales** (3 cambiaron el resultado),
  **4 hallazgos cerrados** (#8, #13, #21, #26), **1 actualizado desvinculando su PR
  incorrecto** (#12) y **1 reencaminado a solo brecha de cobertura** (#14).
- **Los dos ANTECEDENTES ROTOS de esta corrida — el 08-13 y el 08-17 — NO
  dispararon.** Cero filas en Notion, cero reportes, 10 dias sin conciliacion sobre
  39 commits y 9 migraciones. **Ya se cruzo el umbral autoimpuesto** ('dos corridas
  seguidas caidas'). Filado como P1 contra la operacion; ver acciones en el reporte.
- **El conector Vercel sigue roto — 5a corrida consecutiva.** 403 "must
  re-authenticate to this scope". Ya filado como P1 (Notion #5); NO re-diagnosticar,
  solo declarar bajo NO CORRIO y sustituir por la sonda de contenido.

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

## Archivo
(vacio)
