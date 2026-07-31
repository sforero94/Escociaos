# Memoria compartida — navegacion y estado del entorno

Hechos que aplican a mas de un agente. Mismas reglas de escritura que el resto
(`README.md`): solo el orquestador escribe aqui.

## Entorno y acceso
- El rol del MCP de Supabase ve el esquema completo pero **algunas tablas se leen
  como vacias o parciales por RLS** (`lotes`, la tabla de auditoria). Un conteo
  en 0 via MCP no prueba tabla vacia. [seed 2026-07-31]
- Los reads del PostgREST cap-ean en 1.000 filas; para agregados usar SQL directo
  con `count(*)`/`group by`, nunca paginar a mano a menos que se necesiten las
  filas. [seed 2026-07-31]

## Racha del jueves (regla de auto-poda)
| Corrida | Hallazgos nuevos |
|---|---|

## Estado de la operacion
- Ultima corrida completada: (ninguna — primera corrida programada 2026-08-03)
- Modo de la ultima corrida: n/a

## Archivo
(vacio)
