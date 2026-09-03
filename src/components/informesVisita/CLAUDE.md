# Informes de visita agronómica (`/informes-visita`, issue #189)

Word mensual de la agrónoma → cabecera + filas confirmadas + fotos. **No es**
`rondas_monitoreo` / `monitoreos`.

## Contrato

- Solo `.docx`. Sin OCR, sin PDF, sin ingest de correo.
- Extraer propone filas. El humano confirma / edita / descarta **antes** de
  persistir. `filasListasParaPersistir` lanza si queda alguna pendiente.
  `persistirInforme` llama esa puerta primero y no escribe propuestas crudas.
- Sin texto extraíble: se guarda el archivo y se muestra «sin texto para extraer».
  Cero filas inventadas.
- `lote` es texto/sector. `lote_id` solo con match claro de nombre (`resolverLoteId`).
- FTS español sobre `informes_visita.texto_busqueda`.
- Esco: `get_informes_visita`. Cita `informe_id` / `observacion_id`. No mezcla
  esta fuente con rondas de monitoreo. No inventa insumos.

## Tablas (migración 134)

`informes_visita`, `informes_visita_fotos`, `observaciones_agronomicas`.
Bucket privado `informes-visita`.

## Archivos

- Pure: `src/utils/informesVisita/`
- UI: este directorio
- Tests: `src/__tests__/informesVisitaExtract.test.ts` (fixture sintético; nunca
  el Word real de Salazar)
