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

## Estado de la operacion
- Ultima corrida: **2026-08-10-lunes** (barrido semanal, roster de 6). Modo:
  **full write · Notion OPERATIVO otra vez**.
- Resultado: **12 hallazgos filados** (1 P1 · 11 P2), **2 PRs verdes** (#110, #111),
  **5 verificaciones adversariales** y **2 hallazgos del jueves cerrados**.
- **Notion se recupero y se puso al dia**: se filaron con retraso los 5 hallazgos
  del jueves que se habian perdido, se cerraron los 3 del lunes que ya estaban
  resueltos, se bajo #4 a P3 y se corrigio el diagnostico de #2. La base de
  seguimiento ya no tiene huecos. **No se llego a 2 corridas seguidas caidas**, asi
  que no hubo hallazgo contra la operacion por ese lado.
- **El conector Vercel sigue roto — 4a corrida consecutiva.** 403 "must
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
- `escociaos-po/CHANGELOG.md` quedo fuera del commit de memoria a proposito: §6
  solo permite `escociaos-po/memory/**` y `escociaos-po/reports/**`. Su contenido
  se absorbio en el reporte de la corrida. Si se quiere un CHANGELOG.md propio,
  necesita su propio PR. [corrida: 2026-08-03-lunes]

## Archivo
(vacio)
