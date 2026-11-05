# P3 Task 6: faltantes vigentes (D37)

Operación cerrada `consultar_faltantes_aplicacion`: exactamente un selector explícito en
listas `aplicacion_ids` o `aplicaciones`. No tiene período histórico ni selección implícita de
cerradas. Una cerrada solo entra cuando el usuario la selecciona explícitamente.

La fuente lee padres visibles con caller-JWT y limita mezclas, productos e inventario a IDs
validados de esos padres, en bloques `in` de 100 y paginación con conteo exacto. No lee
`aplicaciones_compras`, cálculos, lotes ni ejecución. Cada mezcla y fila producto entra una
vez; la identidad de producto es `producto_id`, no su nombre. El inventario se cruza una vez
por `productos.id` después de sumar necesidades de todas las aplicaciones seleccionadas.

`calculosNecesidadProductos.ts` extrae dos fases puras de los motores existentes: acumulación
sin redondeo de `calcularTotalesGlobalesProductos` y `max(0, necesidad − stock)` de
`generarListaCompras`. Los motores originales llaman los mismos helpers y conservan su
redondeo y defaults originales; el ejecutor P3 valida disponibilidad/unidades antes de usarlos,
sin fabricar categoría, presentación, precio ni stock para satisfacer una firma comercial.
Las sumas y la presentación limpian residuos binarios con `toPrecision(12)`; no se aplica
`ceil` a la necesidad D37. Pruebas de precisión conservan faltantes menores de 0,01.

Necesidad o inventario no leídos, NULL, inventario no visible y unidades incompatibles
retienen estado. Un plan sin mezcla/productos en cualquier aplicación seleccionada impide
publicar necesidad/faltante completos. Stock cero explícito permanece cero. Un producto con
stock en otra unidad no muestra una cantidad de stock rotulada con la unidad del plan.
«Alcanza el inventario registrado hoy» solo aparece con necesidades y stock completos,
compatibles y faltante cero para todos los productos. Fecha de consulta Bogotá inyectada;
lecturas independientes no garantizan reserva ni snapshot conjunto.

Una línea por producto, nombres antes de UUID; UUID completo solo ante nombre ausente o
colisión. No se suman unidades físicas distintas. No se resta ejecución ni se corrigen
capturas de origen. No hay deploy, migración, escritura productiva, cambio de secretos ni
acceso al held-out o casos privados. QA usa fuentes y oráculos sintéticos independientes.
