## Problema y objetivo
Esco negó partos de septiembre/octubre de 2026 aunque existen cuatro eventos. Consulta resúmenes actuales o muestras de fichas y produce conclusiones globales sin evidencia completa. Implementar las consultas de prioridad alta acordadas en todos los módulos y corregir ese comportamiento. Esta es la única implementación autorizada para la sesión actual.

## Alcance (prioridad alta)
- [x] Hato: historial completo por período de partos, servicios, secados, abortos y salidas; consulta explícita de partos con madre, cría, fecha, confianza y destino.
- [x] Hato: listado de animales y relaciones madre–cría; tratamientos con pasos programados, ejecutados y pendientes; historial de chequeos; ventas/salidas vinculadas a finanzas.
- [x] Ceba: conciliación transacciones–movimientos–inventario; detalle de compra/venta; historia de movimientos y traslados agrupados.
- [x] Cosecha: detalle por jornada/lote/sublote; trazabilidad cosecha–despacho–cliente; conciliación de cantidades; calidad/destino con datos faltantes explícitos.
- [x] Aplicaciones: historia de intervenciones por lote; planeado vs ejecutado; recomendaciones agronómicas vs ejecución; carencia antes de cosecha.
- [x] Monitoreo: cobertura de rondas por lote/sublote (ausencia de registro no equivale a ausencia de plaga).
- [x] Inventario: rondas y diferencias físicas; consumo por producto/destino; detalle de compra y entradas asociadas.
- [x] Finanzas: detalle de movimiento con soporte/vínculos; pendientes de confirmación y soportes faltantes; explicación de desviaciones presupuestales.
- [x] Labores: detalle de tarea con ejecución; jornales estimados vs reales.
- [x] Clima/operación: cobertura/calidad climática; estado de capturas/importaciones.
- [x] Transversal: procedencia, período, cobertura y completitud en consultas; paginación segura; errores no se convierten en ceros; historial reciente del chat y contexto verificable entre turnos; prohibir negaciones globales sin consulta del rango.

## Contratos y límites
Consultas de solo lectura, sin cambiar modelo ni datos de negocio. Reutilizar motores oficiales y reglas contables. Coincidencias por fechas/texto no son vínculos confirmados. Donde falten datos estructurados o enlaces, informar limitación y no inventar conciliaciones o restricciones. Estado reproductivo no sustituye cronología. Mantener ambos árboles de edge function sincronizados, etiquetas de herramientas en español y permisos vigentes. No implementar las prioridades medias en esta sesión.

## Aceptación y validación
- La secuencia original de preguntas obtiene los cuatro partos del período con madre, cría disponible y destino; incluye madre inactiva y parto sin ficha de cría.
- Pruebas de filtros, paginación, consulta fallida/incompleta, agrupación de traslados, múltiples crías, pasos vencidos, pendientes y ausencia de vínculos.
- Comparaciones contables/operativas se basan en hechos trazables; totales parciales se identifican como parciales.
- Tests relevantes, typecheck y lint; documentación con matriz de herramientas, tablas, parámetros, límites, evidencia y estado de despliegue.
- Conservar abierto hasta verificar criterios; informar cualquier bloqueo de acceso/despliegue.

## Incidente
Diagnóstico local: docs/archive/incidents/2026-10-07-esco-partos-historial.md. Evitar publicar datos personales o registros de animales reales en pruebas/documentación pública; usar fixtures sintéticos.

## Estado de implementación — 2026-10-07
22 herramientas de consulta añadidas; 56 totales. Código en [rama feat/esco-consultas-alta-311](https://github.com/sforero94/Escociaos/tree/feat/esco-consultas-alta-311), commit abadada1baa5226d990c5940c8883e1b8d09b718. La matriz de fuentes, filtros y límites vive en docs/esco/311-consultas-prioridad-alta.md. Backlog posterior: #312.

Validación final sobre main actualizado: 4.123 pruebas pasan (202 archivos); typecheck, build y empaquetado del servidor pasan. Backend versión 272 ACTIVE, health HTTP 200, hash ed115fab0b35188f598ac6a02e73c936127b681d53ab106843e4eb708060caa7.

Autenticación restaurada con autorización explícita del usuario: verify_jwt=false, como en versión 269 y config.toml. GET_FUNCTION confirma versión 272 ACTIVE y el mismo hash; health HTTP 200. El webhook conserva su secreto y el chat JWT+Gerencia internos. Falta repetir la consulta real antes de cerrar el issue.

GitHub devuelve HTTP 500 al crear PR/push. La corrección de documentación que conserva entradas concurrentes 177/178 y el registro final de publicación están comprometidos/preparados localmente pero todavía no publicados. No se han implementado las medias ni mezclado a main.

## Publicación de este seguimiento
GitHub devolvió HTTP 500 al actualizar este issue. Este archivo conserva el cuerpo final pendiente de publicar; el issue remoto todavía tiene el alcance original.

