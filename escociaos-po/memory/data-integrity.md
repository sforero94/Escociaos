# Memoria — Data Integrity

Escrita solo por el orquestador (ver `README.md`). Inyectada completa en el
prompt del agente en cada corrida.

## Estados aceptados
- La tabla de auditoria (`audit_log`; el prototipo la llamo `logs_auditoria`) se lee vacia via el rol del MCP — estado aceptado, no es perdida de datos. Verificar nombre exacto y causa (RLS vs tabla sin uso) en el primer contacto y `corregir` esta entrada. [seed 2026-07-31]
- `lotes` devuelve 0 filas via el rol del MCP en algunos contextos — RLS-visibility, no tabla vacia. Confirmar siempre con `count(*)` explicito antes de declarar una tabla vacia (constitucion §6). [seed 2026-07-31]
- Brecha documentada de cobertura de pesajes de leche en junio 2026 — conocida y aceptada por el owner; no re-reportar como hueco de datos. [seed 2026-07-31]

## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|

## Navegacion
- Row counts de `list_tables` son RLS-filtered y mienten; usar `select count(*)` directo. [seed 2026-07-31]

## Baselines
| Metrica | Valor | Corrida |
|---|---|---|

## Archivo
(vacio)
