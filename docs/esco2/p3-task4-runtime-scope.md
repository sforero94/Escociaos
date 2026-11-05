# P3 Task 4: costo por aplicación

Base: `main` `19bbc6ca`. Contrato vinculante: sección 3, tabla de motores y puertas de
`p3-source-contract.md`; convenciones de `Review fixes` en
`p3-task3-result-2026-11-04.md`. Esta tarea prepara código local y un PR propio. No autoriza
merge, deploy, migración, secretos, escrituras productivas ni evaluación final de aplicaciones.

## Operación cerrada

Herramienta: `consultar_costos_aplicacion`. Tipo de operación y resultado:
`costos_aplicacion`. Argumentos permitidos:

```ts
interface ConsultaCostosAplicacion {
  aplicacion_id?: string;
  aplicacion?: string;
  desde?: string;
  hasta?: string;
  incluir_plan?: boolean;
}
```

Exige exactamente un selector, UUID válido o nombre/código no vacío, resuelto contra el
inventario completo visible. Cero o varias coincidencias no se adivinan. `desde`/`hasta`,
si aparecen, van juntos y filtran exclusivamente la ejecución por `fecha_movimiento`.
Sin fechas, ejecución de vida completa. El costo congelado siempre corresponde a la
aplicación completa y el plan guardado siempre es completo. `incluir_plan`, falso por
defecto, añade una valorización del plan expresamente separada. No agrega sintaxis de
consultas, selección implícita de todas las aplicaciones, costo por lote ni costo por árbol.
Las comparaciones de varias aplicaciones usan operaciones separadas; no hay total monetario
que mezcle sus bases. Se conserva el máximo global de cuatro operaciones por turno.

## Fuente y disponibilidad

Módulos propios: `src/utils/esco2/costosTipos.ts`, `costosFuente.ts` y `costos.ts`.
Interfaz pública prevista:

- `FuenteAplicaciones.leerCostos?(consulta)` entrega `DatosCostosAplicacion`.
- `crearLectorCostos(cliente, leerPadres, leerCantidades, tamanoPagina?)` construye ese lector.
- `ejecutarCostosAplicacion(consulta, datos, id, hoy)` es puro; `hoy` llega inyectado en Bogotá.
- `renderCostosAplicacion(resultado)` produce todo texto factual determinista.

El DTO preserva selección `ok`/`no_leido`/`no_resuelto`; la aplicación seleccionada; costos
congelados; cierres; datos de cantidades Task 3 cuando correspondan; y catálogo de precios.
`undefined` significa no leído, `null` significa NULL registrado. Las filas no legibles nunca
se convierten en listas vacías. El resultado preserva por separado el bloque congelado,
la valorización de ejecución y, solo si se pidió, el plan valorizado. Cada bloque conserva
su disponibilidad, fecha y motivos; el total completo queda ausente cuando falta una base.

Las proyecciones adicionales son literales:

- `aplicaciones`: `id,estado,costo_total_insumos,costo_total_mano_obra,costo_total`.
- `aplicaciones_cierre`: `id,aplicacion_id,fecha_cierre`.
- `productos`: `id,nombre,unidad_medida,precio_unitario`.

Primero se verifica el padre visible con el JWT del solicitante. Las lecturas hijas usan
`.in()` en bloques de hasta 100 IDs, paginación y conteo exacto mediante `leerFilasFijas`.
Se verifican IDs únicos, pertenencia al bloque padre, campos requeridos y números finitos.
Un catálogo de precio incompleto no borra un costo congelado verificado. No se lee
`valor_jornal`, compras congeladas, cuadrillas ni el cliente de navegador.

## Bases monetarias

**Cerrada:** exige exactamente un cierre leído, asociado por UUID y con fecha calendario
operativa válida. Cierre ausente, duplicado, inconsistente o no leído significa «sin costo
de cierre verificado». Los importes provienen exclusivamente de los tres campos congelados
de `aplicaciones`; los componentes NULL mantienen su estado y nunca son cero. El total
guardado no se reconstruye sumando componentes ni se cambia para forzar conciliación.
Si los componentes contradicen el total, se muestran como valores guardados con discrepancia,
sin afirmar total completo verificado. Etiqueta: «costo congelado al cierre», con fecha de
cierre operativo y alcance completo. Se conserva la advertencia de calidad de origen de M1:
hay precios mal capturados; este lector no los corrige ni certifica su corrección histórica.
No se usan precios actuales, jornales vivos ni `calcularCostosVivosAplicacion` para este bloque.

**Abierta:** la operación de costos ya expresa una petición de dinero. Reutiliza ejecución de
Task 3, sumada por producto y unidad sin fan-out de mezclas/lotes, y multiplica por
`precio_unitario` leído hoy para el mismo `productos.id` y unidad compatible. Etiqueta:
«subtotal de insumos a precio de hoy», con fecha de consulta Bogotá. No es costo histórico
ni costo total de aplicación. Precio NULL/no leído, producto no visible, cantidad incompleta
o unidad incompatible retienen el producto como no valorizable e impiden el total completo.
Precio cero explícito conserva cero y lo señala. Sin movimientos/productos no se certifica
un costo real cero. Estado de aplicación NULL/no leído no se trata como abierta por defecto.

**Plan solicitado:** usa cantidades guardadas por mezcla/producto de Task 3, una vez cada
fila, y el mismo catálogo actual validado. Se rotula «plan guardado a precio de hoy», con
su fecha y disponibilidad propias. No usa el desglose por lote retenido como `no_concilia`
ni transforma un plan guardado discrepante en exacto. Nunca suma plan y ejecución. En una
cerrada, este bloque explícito tampoco reemplaza ni cambia el bloque congelado.

Se limpia ruido binario en acumulaciones nuevas y formato con `toPrecision(12)`, sin
modificar la aritmética de los motores originales. Sin sumas de bases heterogéneas.

## Integración mínima y QA

Cambios aditivos locales en `aplicacionesTipos.ts`/`aplicacionesFuente.ts`, `tipos.ts`,
`registro.ts`, `prompts.ts`, `nucleo.ts` y `mensajes.ts`. También actualizar `estado.ts`
(whitelist y mapeo herramienta/tipo) y estrechamiento de resultados de `evaluacion.ts`.
No crear una capa genérica nueva ni depender de commits de Tasks 5/6.

Cada módulo nuevo alcanzable desde `supabase/functions/esco-consultas/index.ts` usa imports
relativos con `.ts` explícito, sin `@/`, y entra a la lista de esco-consultas en
`.github/workflows/deteccion-deriva-despliegue.yml` y la regex de
`scripts/check-deploy-drift.test.mjs`. Recorrer imports sin Deno local y verificar que ningún
módulo alcanzable requiere `import.meta.env`, cliente de navegador o I/O inesperado.

Backend posee tests unitarios; QA posee integración con fixtures sintéticos y oráculos
literales/SQL independientes. Mutaciones obligatorias con controles positivos: precio actual
rotulado histórico, plan sumado a ejecución, fan-out de producto, cierre no verificado,
NULL sustituido por cero, unidad incompatible y lectura hija de padre invisible. Además:
precio cero legítimo, fechas inclusivas, cierre operativo distinto de consulta, 101+ IDs,
costos cerrados independientes de precio vivo/`valor_jornal`, nombres repetidos y precisión
decimal. QA debe ejercer el handler y el registro cerrado, no solo el ejecutor aislado.

El coordinador repite `npm test`, `npx tsc --noEmit`, `npm run lint`, conteos y análisis de
imports; cada PR reporta `verificacion` verde en su SHA exacto, gasto, preguntas y agregados
de líneas/caracteres sobre simulación local autorizada. No se publican filas, respuestas,
snapshots ni trazas. No se ejecuta el runner final ni el held-out.
