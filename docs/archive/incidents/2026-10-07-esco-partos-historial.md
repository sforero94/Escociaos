# Esco omitió partos de septiembre y octubre

Investigación de solo lectura del 2026-10-07. El usuario preguntó por partos
nuevos, pidió una tabla de madre/cría/fecha de nacimiento y precisó septiembre
y octubre. Esco negó eventos del período, aunque `hato_eventos` contiene tres
partos en septiembre y uno en octubre, todos capturados por Telegram.

La traza confirmó consultas del panorama reproductivo y algunas fichas, no
una consulta global del historial solicitado. También hubo búsquedas repetidas
de variantes de un nombre ajeno a la pregunta. `parida_reciente` describe un
estado del ciclo sin un umbral de antigüedad y no demuestra que sean los últimos
nacimientos. La respuesta convirtió evidencia insuficiente en una negación.

No se requiere recapturar los eventos. La corrección de #311 añade una consulta
específica por período, incluye madres inactivas y partos sin ficha de cría,
distingue FK de candidatas por madre/fecha, y bloquea la afirmación cuando falla
la consulta completa. El detalle público usa fixtures sintéticos y omite
identidades, IDs de conversación y datos personales de los registros reales.

Implementación y límites: [matriz de consultas](../../esco/311-consultas-prioridad-alta.md).
