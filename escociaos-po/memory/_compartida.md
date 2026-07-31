# Memoria compartida — navegacion y estado del entorno

Hechos que aplican a mas de un agente. Mismas reglas de escritura que el resto
(`README.md`): solo el orquestador escribe aqui.

## Entorno y acceso
- ~~El rol del MCP de Supabase ve el esquema completo pero algunas tablas se leen
  como vacias por RLS.~~ **CORREGIDO en 2026-07-31-dryrun-lunes**: `execute_sql`
  corre como rol `postgres` con `rolbypassrls = true` (verificado:
  `SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user)`).
  Un `count(*)` por SQL directo **SI es autoritativo**. Lo enganoso son los
  row-estimates de `list_tables`, que mostraban 0 en tablas con datos
  (`lotes`=9, `fin_negocios`=7, `plagas_enfermedades_catalogo`=33) y 5 en
  `usuarios`, que tiene 7. **Regla: nunca clasificar una tabla por `list_tables`;
  siempre `count(*)` explicito, con un control en la misma sentencia.**
- Los reads del PostgREST cap-ean en 1.000 filas; para agregados usar SQL directo
  con `count(*)`/`group by`, nunca paginar a mano a menos que se necesiten las
  filas. [seed 2026-07-31]
- **Vercel MCP inutilizable**: el conector autentica contra el team
  `Santiago's projects` (`team_Ov5b46sLrIUWwVlkuCfdCgdG`), que tiene 0 proyectos.
  El proyecto real vive en `santiago-foreros-projects-da8a20e8`. Hasta que se
  re-autorice, los deploys se verifican con
  `gh api repos/sforero94/Escociaos/commits/<sha>/status` (context 'Vercel'), que
  prueba exito/fallo por commit pero no expone logs ni errores de runtime.
  **Si sigue asi en la siguiente corrida, es P1 contra la operacion (§7).**
  [corrida: 2026-07-31-dryrun-lunes]
- `get_advisors` devuelve salidas enormes (security ~111k chars, performance
  ~614k) que revientan el limite de tokens. Guardar y resumir con python.
  [corrida: 2026-07-31-dryrun-lunes]

## Racha del jueves (regla de auto-poda)
| Corrida | Hallazgos nuevos |
|---|---|

## Estado de la operacion
- Ultima corrida completada: **2026-07-31-dryrun-lunes** (ensayo, solo lectura;
  no escribio en Notion ni abrio PRs). Reporte:
  `escociaos-po/reports/2026-07-31-dryrun-lunes.md`
- Modo: dry run. Roster: los 6 semanales. 6 verificadores adversariales.
- Resultado: 1 P0 + 3 P1 + 5 P2 + 3 P3 confirmados; 2 hallazgos refutados, 1
  bajado de severidad, 1 subido, 1 reducido de alcance.
- Primera corrida programada real: **2026-08-03** (lunes).
- **Pendientes heredados a la primera corrida real**: (a) verificar si el P0 del
  endpoint `/usuarios/*` ya fue cerrado — si sigue abierto, re-archivar como P0
  sin re-investigar desde cero; (b) verificar si `hato_alertas_config` ya tiene
  destinatario; (c) confirmar si el conector Vercel fue re-autorizado.

## Archivo
(vacio)
