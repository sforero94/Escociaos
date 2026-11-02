# Recuperación de entrada a `/pesaje` — BL54

Estado: cambio local pendiente de revisión, integración y despliegue coordinado.
No cierra la aceptación funcional de Fernando.

## Fallos reproducidos

- Con `/evento` pendiente de un botón, grammY consume `/pesaje` y el botón
  `start_pesajeLeche` antes de sus handlers. El usuario no recibe respuesta.
- El propio pesaje puede interpretar `/pesaje` como mes inválido, mensaje
  inesperado o corrección, en lugar de reconocer una nueva intención de entrada.
- Un rechazo de transporte en la consulta inicial de atribución ocurría antes
  del `try` de la conversación y escapaba sin respuesta al chat.
- Si Telegram rechazaba la confirmación de un callback de menú vencido, el
  handler terminaba antes de responder o abrir el pesaje.

La captura del incidente mostraba fotos a la 1:06 y `/pesaje` a la 1:40.
El usuario precisó: «1:06 pm en Colombia el sábado fue Fernando y luego envié un
/pesaje yo a las 2:09 hora de Nueva York que si funcionó».
Para el sábado 31 de octubre de 2026, 14:09 Nueva York equivale a 13:09 Colombia.
No está probado que Fernando enviara el comando a las 13:06. Los tres minutos
solo comparan esa actividad/fotos con la prueba del usuario. Ninguna prueba
local demuestra cuál fue la causa histórica de Fernando.

## Cambio acotado

El aviso vive después de autenticar e instalar `conversations()`, antes del
primer `createConversation`. Solo reconoce `/pesaje` (incluido el sufijo del
propio bot) y `start_pesajeLeche`. Conserva el módulo `hato_produccion`. Si hay
una conversación activa, ofrece terminarla o cancelarla de forma explícita.
No expone el nombre del flujo, no ejecuta `exit`/`exitAll` y no modifica su
contenido persistido. El plugin puede reescribir el mismo JSON al finalizar.

Sin conversación activa, `next()` permite registrar los builders antes del
`enter()` existente. Los demás callbacks siguen su ruta original. La
confirmación del botón de entrada es best-effort: un callback vencido no oculta
la respuesta. `/cancelar` conserva su salida prioritaria.

El rechazo de transporte se convierte en `error_db` dentro del mismo
`external()`: conserva la secuencia de efectos del replay exitoso, memoriza el
fallo seguro y no muestra detalles técnicos en el chat.

No cambian el motor/contexto/herramientas de Esco, el resolver compartido,
permisos, migraciones, endpoints web, OCR, storage de fotos ni commits de negocio.
Ambos árboles del servidor conservan las mismas fuentes Telegram.

## Validación reproducible

`node_modules/.bin/vitest run src/__tests__/telegramPesajeRecuperacion.test.ts`
ejecuta el router y las conversaciones originales con grammY `1.46.0` y
conversations `2.1.1`, fijados como dependencias de desarrollo. Cada operación
de Telegram, base de datos, descarga y pipeline usa datos sintéticos; el fetch
global y los accesos inesperados fallan. No consulta sesiones reales ni llama
modelos/proveedores. Las versiones fijadas para pruebas no prueban las versiones
del runtime productivo.

Las regresiones fallaron primero contra `95c85b3` (34 fallos / 53 casos).
La suite final añade un estado sintético anterior al cambio y verifica replay
tras recrear el bot, fotos conservadas, atribución no repetida, estados activos
de otros flujos, permisos revocados, callbacks vencidos y salida explícita.
Las pruebas de otros nombres de flujo usan el mismo estado sintético renombrado
para comprobar el guard antes del replay; no ejercitan sus escrituras de negocio.

## Coordinación de publicación

El padre revisa el borrador antes de integrar. La ventana de Faithfulness tiene
prioridad. Este hilo no despliega ni modifica controles de publicación. El
backend comparte edge function con Esco, aunque los archivos de este cambio
no tocan sus fuentes ni los controles de Faithfulness. Revalidar la base antes
de integrar y publicar una sola versión por ventana.

Si hiciera falta atribuir el incidente, confirmar fecha/zona del comando y
limitar la siguiente investigación autorizada a metadatos del chat y registros
del webhook alrededor de ese instante. No descargar mensajes ni fotos.
