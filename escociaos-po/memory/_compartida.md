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

## Estado de la operacion
- Ultima corrida: **2026-08-03-lunes** (primera corrida programada REAL; primer
  lunes de mes, roster completo de 8). Modo: **full write**.
- Resultado: 12 hallazgos filados en Notion (5 P1 + 7 P2), 4 PRs abiertos y en
  verde (#98 #99 #100 #101), 4 verificaciones adversariales.
- **Rendimiento de la fase de verificacion**: 4 de 4 confirmadas en el mecanismo,
  pero 2 bajadas de severidad (P1->P2) y 2 con el impacto corregido. Ninguna
  murio entera. Ademas Feature Strategy evito un falso positivo (el escalamiento
  a 48h no es defecto: el umbral se cumple justo en el tick siguiente).
- Pendientes heredados de la corrida en seco: (a) P0 de `/usuarios/*` **CERRADO**
  y verificado en el bundle v197; (b) `hato_alertas_config` **YA tiene
  destinatario** (se resolvio entre corridas); (c) conector Vercel **sigue roto**.

## Riesgo operativo detectado esta corrida
- **Todos los agentes comparten UN solo checkout.** Bug Triage hizo `checkout` de
  una rama de trabajo y movio el arbol bajo los pies de los demas: los agentes que
  leyeron archivos despues de ese momento estaban leyendo una rama, no `main`.
  Code Quality si uso worktrees aislados y no tuvo el problema.
  **Regla para la proxima corrida: todo agente que escriba codigo debe usar
  `isolation: worktree`, y los de solo lectura deben leer via `git show main:<path>`
  en vez de confiar en el arbol de trabajo.** [corrida: 2026-08-03-lunes]
- `escociaos-po/CHANGELOG.md` quedo fuera del commit de memoria a proposito: §6
  solo permite `escociaos-po/memory/**` y `escociaos-po/reports/**`. Su contenido
  se absorbio en el reporte de la corrida. Si se quiere un CHANGELOG.md propio,
  necesita su propio PR. [corrida: 2026-08-03-lunes]

## Archivo
(vacio)
