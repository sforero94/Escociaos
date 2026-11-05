# P3 Task 5: labor vinculada por ID (D36)

Operación cerrada `consultar_labor_aplicacion`: exactamente un selector explícito en listas
`aplicacion_ids` o `aplicaciones`; fechas `desde`/`hasta` opcionales y juntas, inclusivas por
`fecha_trabajo`. Sin fechas: vida completa, sin recorte silencioso al calendario de consulta.

La fuente conserva aplicaciones sin tarea; no usa el adaptador laboral que las omite.
Lee todos los padres visibles para detectar una tarea común incluso con selección singular.
Después limita tareas, registros y lotes a IDs del padre, en bloques `in` de 100 y paginación
con conteo exacto. Una lectura incompleta/fallida queda no leída, nunca vacía.

Cada tarea vinculada contribuye una vez al agregado. Sus aplicaciones visibles comparten
la etiqueta de costo común, sin atribución exclusiva. No se usan nombres como joins ni se
suman tablas de cuadrilla. Los nombres de aplicación/tarea/lote preceden a IDs; UUID completo
solo ante falta de nombre o colisión. Una línea por lote; sin-lote permanece separado.

El ejecutor reutiliza `metricas` de P2 con su cuerpo aritmético intacto. NULL de costo conserva
jornales y un subtotal rotulado; impide el costo completo. Sin vínculo, vínculo no leído,
tarea no disponible, registros no leídos y lectura válida vacía tienen estados distintos.
Una población no verificada no acredita cero ni un total completo. Esta labor viva no cambia
el costo congelado de D34. Lecturas independientes no prueban un snapshot conjunto.

Despliegue, migraciones, cambios de secretos, escrituras productivas y evaluación held-out
no forman parte de esta tarea. Los nuevos módulos de runtime están en la lista de deriva
con imports relativos `.ts`. QA usa fixtures sintéticas y oráculos ajenos al ejecutor.
