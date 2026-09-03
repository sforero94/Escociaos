# Informes de visita agronómica (`/informes-visita`, issue #189)

Word mensual de la agrónoma → evidencia (.docx + fotos + texto) + cabecera +
**snippets** (una idea confirmada). **No es** `rondas_monitoreo` / `monitoreos`.
No hay embeddings ni pgvector: FTS español.

## Contrato

- Solo `.docx`. Sin OCR, sin PDF, sin ingest de correo.
- El modelo propone snippets. Cada snippet de origen `informe` necesita
  `cita_word` literal en el Word; si no, se descarta. Un chip `insumo` que no
  aparece en texto/cita también se descarta.
-   El humano confirma / edita / ignora (swipe) **antes** de persistir.
  `snippetsListosParaPersistir` lanza si queda alguna propuesta sin decidir.
  Cada nota lleva chips de tema (catálogo fijo). Un campo abierto añade una
  nota de `origen = conversacion` con los mismos chips.
- Sin texto extraíble: se guarda el archivo y se muestra «sin texto para extraer».
  Cero ideas inventadas.
- Chips `tipo` / `insumo` / `plaga` son pistas, no un formulario de 69 campos.
- FTS español sobre `informes_visita.texto_busqueda` y
  `informes_visita_snippets.texto_busqueda`.
- Esco: `get_informes_visita`. Cita `informe_id` / `snippet_id`. Si FTS trae
  pocos hits, rellena con la ventana de visitas recientes (`ventana_completa`).
  No mezcla esta fuente con rondas de monitoreo. No inventa insumos.

## Tablas (migraciones 134–136, **aplicadas**)

`informes_visita`, `informes_visita_fotos`, `informes_visita_snippets`.
Bucket privado `informes-visita`. Chips en `informes_visita_snippets.temas`
(la 136). La 134 que corrió dejó `temas`/`notas` en la cabecera; no se re-ejecuta.
La 135 agregó la columna con CHECK sin tildes; la 136 lo corrige.

## Archivos

- Pure: `src/utils/informesVisita/`
- UI: este directorio (`SnippetDeck`, swipe)
- Edge: standalone `informes-visita-proponer` (LLM, no escribe DB) plus the
  same handler inside `make-server-1ccce916`. The browser calls the
  standalone slug. `verify_jwt = false`; the handler checks JWT +
  Administrador/Gerencia. Propose does not write DB, so that deploy is
  safe without the tables. Persist needs 134–136 (applied 2026-09-03).
- Tests: `src/__tests__/informesVisitaExtract.test.ts` (fixture sintético; nunca
  el Word real de Salazar)
