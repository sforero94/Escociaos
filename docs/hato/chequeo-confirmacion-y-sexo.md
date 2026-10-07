# Confirmación de reemplazo y sexo impreso del chequeo

Comportamiento de #253/#255, publicado en los PR #305/#306.

## Todas las páginas en un envío

`SubirChequeoExcel` acumula hasta **seis fotos** mediante «Cargar chequeo» y
drag-and-drop antes de «Subir y revisar». El selector acepta un archivo por vez;
agregar otra foto conserva las anteriores dentro del mismo diálogo. El Excel
sigue siendo un solo archivo. No recrear `multipleArchivo` como una dependencia
de la captura: las páginas ya se acumulan antes del envío.

Si existe un chequeo para la fecha aprobada, el navegador lee su UUID y conteo
actual y pide confirmación explícita. Indica el número de filas anteriores y aprobadas, y advierte que se reemplazarán
los eventos derivados; «Volver a revisar» no escribe.
Después de confirmar vuelve a leer: una identidad o cantidad distinta exige
otra confirmación. Una lectura fallida bloquea el envío; nunca se interpreta
como fecha libre. Durante la lectura se conserva el diálogo de confirmación
para evitar superponer overlays al pedir una nueva aceptación.

Esto conserva el contrato de la RPC 065: el reemplazo es de todas las filas de
la fecha, no una adición de la página faltante. La confirmación es una guarda
del navegador; no agrega un token de versión ni una condición de concurrencia
al servidor. La revalidación del edge y el commit transaccional siguen vigentes.

## Sexo impreso y evidencia cruda

`parseSX` distingue **Hembra/Macho/Gemelar** de los códigos **A206/AV/OV/gem+**.
Las etiquetas impresas solo informan sexo o gemelaridad: no indican chapeta,
destino de la cría ni un parto nuevo. `descomponerSX` no deriva un parto de
estas etiquetas; otros hechos válidos de la fila, como un servicio, se conservan.
El texto capturado permanece en `sx_raw`; no se reconstruye el SX original a
partir de una etiqueta que perdió información al imprimirse.

El diff compara etiquetas con el SX conocido solo si ambas filas identifican
la misma **Última Cría** por una fecha parseada sin issues. Una contradicción
de sexo/gemelaridad genera un aviso para revisión; dos partos distintos no se
comparan. Los avisos del cotejo fresco se combinan con los de la fila normalizada
en la revisión. Lo desconocido sigue visible para corrección.

## Mantenimiento

El helper de reemplazo vive en `src/utils/hato/reemplazoChequeo.ts`; el diff en
`src/utils/importHato/diffChequeo.ts`; el parser único en `src/utils/calculosHato.ts`.
Los tres árboles del motor y los dos del diff están protegidos por paridad.
Los tests `reemplazoChequeo.test.ts` y `chequeoSexoImpreso.test.ts` cubren lecturas
fallidas, reconfirmación, etiquetas, contradicciones y ausencia de eventos inventados.
No repetir backfills ni modificar las migraciones aplicadas para cambiar este flujo.
