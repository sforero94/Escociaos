# Memoria — Data Integrity

Escrita solo por el orquestador (ver `README.md`). Inyectada completa en el
prompt del agente en cada corrida.

## Estados aceptados
- La tabla de auditoria (`audit_log`; el prototipo la llamo `logs_auditoria`) se lee vacia via el rol del MCP — estado aceptado, no es perdida de datos. Verificar nombre exacto y causa (RLS vs tabla sin uso) en el primer contacto y `corregir` esta entrada. [seed 2026-07-31]
- `lotes` devuelve 0 filas via el rol del MCP en algunos contextos — RLS-visibility, no tabla vacia. Confirmar siempre con `count(*)` explicito antes de declarar una tabla vacia (constitucion §6). [seed 2026-07-31]
- Brecha documentada de cobertura de pesajes de leche en junio 2026 — conocida y aceptada por el owner; no re-reportar como hueco de datos. [seed 2026-07-31]
- Los 30 grupos de eventos `servicio` duplicados mismo-dia son el balde `conflictosToroDistinto` documentado, dejado intacto a proposito para revision de Martha. El unico par de partos <60 dias (RICARENA #88, 55d) es artefacto aceptado por la misma limpieza. No re-reportar; confirmar conteos (30 / 1). [corrida: 2026-07-31-dryrun-lunes]
- 1 header de chequeo vacio en `hato_chequeos` (fecha 2024-01-17, id 210a470b) sin filas hijas — ruido del backfill, no vale un finding. Re-evaluar solo si aparecen mas headers vacios por el camino B0 en vivo. [corrida: 2026-07-31-dryrun-lunes]
- CORRIGE el seed: la tabla de auditoria se llama `logs_auditoria` (`audit_log` NO existe; el CLAUDE.md raiz usa el nombre equivocado). Causa determinada: genuinamente vacia (n_tup_ins=0 historico), sin ningun camino de escritura. NO es RLS. Archivada como hallazgo P2 en 2026-07-31-dryrun-lunes; no re-investigar la causa. [corrida: 2026-07-31-dryrun-lunes]


## Refutaciones
| Fingerprint | Afirmacion | Por que murio | Corrida |
|---|---|---|---|
| data-integrity/monitoreo/plagas-sin-umbral-omitidas | Las plagas sin fila en `pest_umbral_economico` se omiten de la priorizacion de scouting | Refutada leyendo el motor: `priorizacionMonitoreo.ts` construirSeries() les crea serie propia con grupo_key null y cae al tercil estadistico. Las 14 plagas activas sin umbral SI aparecen. | 2026-07-31-dryrun-lunes |


## Navegacion
- Row counts de `list_tables` son RLS-filtered y mienten; usar `select count(*)` directo. [seed 2026-07-31]
- CORRIGE el seed: `execute_sql` del MCP corre como rol `postgres` con `rolbypassrls=true` — los `count(*)` por SQL directo SON autoritativos y no estan filtrados por RLS. La advertencia de RLS-visibility aplica a PostgREST/anon, no a esta herramienta. Los row counts de `list_tables` siguen siendo estimados de pg_stats: usar `count(*)`. [corrida: 2026-07-31-dryrun-lunes]
- Los cuerpos SQL de migraciones aplicadas se recuperan integros con `select version, name, statements from supabase_migrations.schema_migrations` — util para reconstruir archivos faltantes en el repo. [corrida: 2026-07-31-dryrun-lunes]


## Baselines
| Metrica | Valor | Corrida |
|---|---|---|
| Conteos de dominio | hato_animales 171 (80 activas) · partos 333 · chequeos 33 / chequeo_vacas 1.479 · eventos 768 · pesajes 364 · quincenal 79 · alertas 62 · monitoreos 4.233 / 28 rondas · mov_inventario 137 · compras 26 | 2026-07-31-dryrun-lunes |
| Clima | ultima lectura <2 min · 0 duplicados (station,timestamp) · resumen_diario 90/90 dias · PERO lluvia_confianza='contador_congelado' en 16 de 90 dias (~18%): el sensor no resetea a medianoche con esa frecuencia. Si la tasa sube, escalar a Infra como revision fisica del sensor. | 2026-07-31-dryrun-lunes |


## Archivo
(vacio)
