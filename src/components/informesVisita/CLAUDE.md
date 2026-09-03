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
  Temas de visita (chips de catálogo fijo) y un único campo `notas` viven en
  `informes_visita`. La UI ya no crea snippets de `origen = conversacion`.
- Sin texto extraíble: se guarda el archivo y se muestra «sin texto para extraer».
  Cero ideas inventadas.
- Chips `tipo` / `insumo` / `plaga` son pistas, no un formulario de 69 campos.
- FTS español sobre `informes_visita.texto_busqueda` y
  `informes_visita_snippets.texto_busqueda`.
- Esco: `get_informes_visita`. Cita `informe_id` / `snippet_id`. Si FTS trae
  pocos hits, rellena con la ventana de visitas recientes (`ventana_completa`).
  No mezcla esta fuente con rondas de monitoreo. No inventa insumos.

## Tablas (migración 134, **sin aplicar**)

`informes_visita`, `informes_visita_fotos`, `informes_visita_snippets`.
Bucket privado `informes-visita`.

## Archivos

- Pure: `src/utils/informesVisita/`
- UI: este directorio (`SnippetDeck`, swipe)
- Edge: standalone `informes-visita-proponer` (LLM, no escribe DB) plus the
  same handler inside `make-server-1ccce916`. The browser calls the
  standalone slug. `verify_jwt = false`; the handler checks JWT +
  Administrador/Gerencia. Propose does not write DB, so that deploy is
  safe without migration 134. Persist still needs 134.
- Tests: `src/__tests__/informesVisitaExtract.test.ts` (fixture sintético; nunca
  el Word real de Salazar)
