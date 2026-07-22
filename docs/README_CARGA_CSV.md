# Importación masiva de monitoreos

La pantalla [`/monitoreo/carga-masiva`](/monitoreo/carga-masiva) permite importar registros desde `.csv`, `.xlsx` o `.xls`. La fuente de verdad del formato es la plantilla que se descarga desde esa pantalla.

## Antes de importar

1. En Configuración, confirma que ya existen los lotes, sublotes y plagas del archivo.
2. Descarga una plantilla actualizada desde **Descargar plantilla**.
3. Conserva los encabezados de la plantilla:
   - `Fecha (YYYY-MM-DD)`
   - `Lote`
   - `Sublote`
   - `Plaga/Enfermedad`
   - `Árboles Monitoreados`
   - `Árboles Afectados`
   - `Individuos Encontrados`
   - `Monitor` y `Observaciones` son opcionales.

Los nombres de lote, sublote y plaga deben coincidir, sin distinguir mayúsculas, con los catálogos actuales. El importador no crea catálogos nuevos.

## Validaciones

Cada fila se procesa de forma independiente. Se rechaza si:

- La fecha no es válida.
- No se encuentra el lote, el sublote dentro de ese lote, o la plaga.
- Los árboles monitoreados son cero o negativos.
- Los afectados o individuos encontrados son negativos.
- Los árboles afectados superan los monitoreados.

Las filas válidas se insertan aun cuando otras tengan errores. Al finalizar, la pantalla muestra el total cargado y el detalle por fila de los rechazos.

La incidencia y la severidad se calculan automáticamente a partir de los conteos. La gravedad se clasifica como baja, media o alta según la incidencia.

## Problemas frecuentes

- **“Lote/Sublote/Plaga no encontrado”**: corrige el valor del archivo o crea/corrige el catálogo correspondiente antes de reintentar.
- **“Fecha inválida”**: usa el formato `YYYY-MM-DD`, por ejemplo `2026-07-22`.
- **Sin registros insertados**: descarga nuevamente la plantilla y compara sus encabezados y valores con el archivo.

## Referencias técnicas

- UI e importación: `src/components/monitoreo/CargaMasiva.tsx`
- Parser CSV heredado: `src/utils/csvMonitoreo.ts`
- Tipos: `src/types/monitoreo.ts`
- Gestión de lotes y sublotes: [`GUIA_CONFIGURACION_LOTES_SUBLOTES.md`](./GUIA_CONFIGURACION_LOTES_SUBLOTES.md)
- Configuración histórica y guías de una sola vez: [`archive/csv/`](./archive/csv/)
