# Esco: consultas de prioridad alta (#311)

Issue de implementación: https://github.com/sforero94/Escociaos/issues/311
Backlog posterior, sin implementar aquí: https://github.com/sforero94/Escociaos/issues/312

## Objetivo y alcance

La respuesta sobre partos no consultaba el historial del período y negó registros
existentes. La corrección cubre ese incidente y las consultas altas de todos los
módulos acordadas con el usuario. Son consultas de solo lectura: no cambia el
modelo, los datos, permisos, alertas automáticas ni reglas contables oficiales.

Se añaden 22 herramientas a las 34 existentes (56 en total). Varias capacidades
se agrupan en una herramienta para no crear una función por cada pregunta.

## Matriz de implementación

| Módulo / alcance alto | Herramienta | Fuentes y comportamiento |
| --- | --- | --- |
| Partos: madre, cría, nacimiento, destino | `get_hato_partos` | `hato_eventos` filtrado parto, animales, cría por FK y candidatas por madre/fecha. Incluye madres inactivas y eventos sin ficha de cría. |
| Historia de servicios, secados, abortos, salidas | `get_hato_eventos` | Historia global por fecha/tipo y filtro animal. No son fechas probables. |
| Listado y madre–cría | `get_hato_animales` | Animales y genealogía por UUID; chapetas provisionales identificadas. Rango opcional por nacimiento. |
| Tratamientos y ejecución | `get_hato_tratamientos` | Tratamiento, protocolo y pasos; vencidos/pendientes solo de tratamientos activos. Rango opcional por inicio del tratamiento. |
| Historia de chequeos | `get_hato_chequeos` | Rondas y filas normalizadas, estado y texto crudo de tratamiento/issues. |
| Salidas cruzadas con dinero | `get_hato_salidas_finanzas` | Eventos con ingreso/transacción por FK y transacciones de hato en período. Macho vendido no es venta de la madre. |
| Ceba: compra/venta, conciliación física | `get_ganado_conciliacion` | Transacciones, movimientos ligados (también fuera del período), estados, cantidades y signos; inventario ACTUAL y potreros. |
| Historia y traslados agrupados | `get_ganado_movimientos_detalle` | Movimientos agrupados por `grupo_id` o transacción; recupera todas las patas del grupo, incluso fuera del rango. |
| Jornadas, trazabilidad y conciliación de cosecha | `get_cosecha_trazabilidad` | Cosecha, lote/sublote, responsables, preselecciones, trazabilidad, despacho y cliente. Kilos sin asignar, diferencia en despachos vinculados y despachos sin trazabilidad. |
| Calidad y destino | `get_produccion_calidad` | Producción por año/cosecha con exportación/nacional; desglose nulo no es cero. No mezclar con sanos/descarte de preselección. |
| Historia y planeado vs ejecutado | `get_aplicaciones_ejecucion` | Aplicaciones, alcance/mezclas/recetas/plan por lote, movimientos reales y trabajo. Plan y ejecución se presentan con sus unidades; no comparar dosis con consumo sin conversión. |
| Recomendación frente a ejecución | `get_recomendaciones_ejecucion` | Visitas/snippets y consumos candidatos por insumo/fecha. No hay vínculo confirmado de cumplimiento. |
| Carencia antes de cosecha | `get_carencia_cosecha` | Consumos registrados en movimientos diarios anteriores a la fecha objetivo y carencia actual del catálogo. Sin dato: no verificable. |
| Cobertura de rondas | `get_monitoreo_cobertura` | Rondas/observaciones vs catálogo actual de sublotes. No existe alcance esperado histórico persistido. |
| Diferencias físicas y desenlaces | `get_inventario_conciliacion` | Rondas, alcance teórico congelado y excepciones; físico cero es dato. Excluye precios/valoración restringida. |
| Consumo por producto/destino | `get_producto_consumo` | Consumos de movimientos diarios y movimientos de inventario mostrados como fuentes distintas, sin sumarlos dos veces. |
| Compra y entrada asociada | `get_compra_detalle` | Compra, producto, soporte, gastos por `compra_id`; entradas solo candidatas por producto/factura. |
| Movimiento financiero, pendientes y soporte | `get_finanzas_detalle` | Gastos, ingresos/transacciones, catálogos y soporte; filtros pendientes/sin adjunto donde aplica. No calcula utilidad. |
| Explicación de presupuesto | `get_presupuesto_desviaciones` | Presupuesto vs gastos Confirmados por concepto/categoría, incluye movimientos que explican desviación. Trimestres deduplicados. |
| Tarea, ejecución y jornales | `get_tarea_ejecucion` | Vista oficial y registros de trabajo completos de las tareas seleccionadas; estimado vs registrado. |
| Calidad/cobertura climática | `get_clima_cobertura` | Resumen diario por estación, confianza oficial, lecturas, huecos y fechas ausentes. |
| Capturas/importaciones registradas | `get_capturas_estado` | Capturas fotográficas, chequeos y estado de previsualizaciones de inventario. No hay registro universal de todos los archivos rechazados. |

## Contrato de evidencia y parámetros

El motor `src/utils/escoConsultas.ts` recibe I/O inyectado y fecha de Bogotá.
Todas las nuevas consultas devuelven `_evidencia`: fuentes, rango, fecha de
consulta, cantidad de registros leídos por fuente, cantidad de hechos y límites.
La consulta completa no garantiza que la captura de campo esté completa.

Las listas por período exigen `date_from`/`date_to` en fechas válidas e inclusivas;
rechazan rangos invertidos. Timestamps se filtran de medianoche de Bogotá hasta
medianoche posterior al último día. Listado animal filtra nacimiento;
tratamiento filtra inicio; tarea filtra inicio estimado; ronda filtra apertura.
Calidad de producción usa año/cosecha, presupuesto usa año/trimestres y carencia
usa fecha objetivo. Los parámetros específicos están en el registro de herramientas.

Lecturas en páginas de 200 y orden estable, tope 20.000 filas por fuente: al
alcanzarlo se produce error, no total parcial aparente. Adaptador PostgREST pide
`count=exact` y detecta páginas recortadas por configuración del servidor.
El detalle se presenta en páginas de 100 hechos con `detalle_offset` y
`siguiente_offset`; los agregados se calculan sobre el universo leído completo.
Detalles anidados corresponden al hecho de cada página. No se oculta una consulta
fallida dentro de una lista vacía.

Las herramientas legadas conservan su comportamiento, pero pagan páginas de 200
y declaran que sus límites de universo/detalle no garantizan cobertura global.
Para listas completas y negaciones se debe usar la consulta de evidencia adecuada.

## Protección de respuesta y conversación

- Preguntas explícitas de partos ocurridos fuerzan `get_hato_partos` en la primera
  llamada. Preguntas de partos próximos/probables siguen en panorama reproductivo.
- Antes de devolver texto, si la consulta obligatoria no produjo evidencia completa
  del rango, el servidor devuelve falta de verificación en lugar de la respuesta
  del modelo. Esta protección es determinista para partos; las reglas de evidencia
  de los demás módulos están en el prompt y en el contrato de las herramientas.
- El prompt distingue estado reproductivo de cronología, candidatas de FK,
  ausencia de dato de cero y carencia registrada de autorización para cosechar.
- Llamadas idénticas dentro del turno no se ejecutan otra vez. No hay un bloqueo
  determinista de todas las variantes de nombres; el prompt prohíbe inventarlas.
- Se cargan los últimos 20 mensajes descendentes y se reordenan cronológicamente.
- El contexto mantiene JSON válido hasta 24.000 caracteres por herramienta;
  cuando lo supera, conserva evidencia/resumen y declara recorte. Reconsultar
  antes de afirmar ausencia, cambiar de período o usar datos anteriores como actuales.

## Límites del modelo de datos

- **Compras:** entrada de inventario no tiene `compra_id`. Producto/factura son
  candidatas; no se puede certificar recepción. La app registra compras, no una
  orden de compra estructurada con recepción pendiente.
- **Recomendaciones:** no hay FK recomendación–aplicación; no certificar cumplimiento.
- **Carencia:** catálogo actual, no etiqueta histórica; usa consumos diarios
  registrados, no certifica todas las intervenciones de campo ni focos capturados
  por otra vía. No autoriza cosecha ni calcula retiro de leche.
- **Ganado:** saldo actual no es saldo histórico. Movimientos sin vínculo no son
  necesariamente errores. Sin información de costo validada, no calcular margen
  por animal/transacción desde esta conciliación.
- **Hato:** genealogía por madre/fecha da candidatas, especialmente en gemelos;
  solo `cria_id` constituye enlace explícito. Una salida de cría sin ficha no
  implica salida de madre. Ingreso sin FK a evento no se atribuye por similitud.
- **Monitoreo:** catálogo actual no reconstruye el alcance esperado de rondas históricas.
- **Importación:** solo se consultan estados efectivamente persistidos. Un preview
  que nunca se guardó no aparece como archivo pendiente o rechazado.

## Validación y publicación

Pruebas sintéticas: tres partos en septiembre y uno en octubre, madre inactiva,
crías múltiples, sin ficha, paginación por encima de 1.000 filas, error/tope,
fechas/timestamps/Bogotá, tratamiento cancelado, traslados agrupados fuera del
rango, compras candidatas, presupuesto Confirmado, carencia faltante y cobertura.

`escoToolLoopEvidencia.test.ts` ejecuta el loop con API y PostgREST simulados:
enrutamiento obligatorio, persistencia de evidencia, bloqueo de negación tras
503 y página recortada por servidor. No es evaluación en vivo del modelo.
`esco-schema-columns.json` contiene solo nombres de tablas/columnas del catálogo
verificado el 2026-10-07; una prueba AST comprueba todas las selecciones literales.
No contiene datos de negocio ni credenciales.

Copias regeneradas con `python scripts/sync-esco-consultas.py`; prueba de paridad
byte a byte en ambos árboles. Las etiquetas del cliente provienen del motor
canónico. Compilación del servidor con esbuild verifica todos los imports locales.

Validación local: **240 pruebas relevantes y 4.123 pruebas de la suite completa
(202 archivos), incluyendo los cambios concurrentes de main pasan**, `npm run typecheck` y build Vite pasan. Lint global:
0 errores, 921 advertencias existentes; archivos nuevos/modificados de este
cambio sin errores de lint. Las guardas que lanzan Python requieren ejecución
con subprocesos habilitados; en sandbox daban EPERM, al habilitarlos pasa la suite.

Publicación del backend: versión **272**, estado ACTIVE, hash de paquete
`ed115fab0b35188f598ac6a02e73c936127b681d53ab106843e4eb708060caa7`,
health HTTP 200 `{ "status": "ok" }`. Bundle autocontenido de fuentes locales
con esbuild y dependencias npm/jsr externas. `bundleOnly` comprobó compilación
sin alterar la versión 269 original. El PATCH de cuerpo crudo produjo BOOT_ERROR
(version 270); se corrigió usando DEPLOY_FUNCTION, que compila/empaqueta.

**Autenticación restaurada con autorización explícita del usuario:** se aplicó
`verify_jwt=false`, el valor original de versión 269 y `supabase/config.toml`.
GET_FUNCTION confirmó versión 272 ACTIVE, mismo hash de paquete y false;
health respondió HTTP 200. Se elimina la verificación externa que podía bloquear
Telegram; el webhook conserva su secreto y el chat valida JWT+Gerencia dentro
del handler. Falta repetir la consulta real con el usuario para cerrar #311.
El frontend necesita el merge/publicación habitual para recibir las etiquetas
de las nuevas consultas.
#312 permanece como backlog sin código implementado aquí.

## Estado de GitHub

Issue #311 y #312 creados. Código publicado en la rama
`feat/esco-consultas-alta-311`, commit `abadada1baa5226d990c5940c8883e1b8d09b718`.
Los errores HTTP 500 iniciales se resolvieron. Correcciones y documentación final
publicadas en la rama; [PR #314](https://github.com/sforero94/Escociaos/pull/314)
creado como borrador. No se ha mezclado a main. No cerrar el issue hasta validar
la conversación real y publicar el frontend.
