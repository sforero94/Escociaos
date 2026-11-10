# Esco SQL — P3: canal web

P3 del [plan aprobado #471](https://github.com/sforero94/Escociaos/blob/7425dc3828ec1937f9f710950e95bf94cfe65df6/docs/esco2/plan-migracion-esco2-sql.md).
PR apilada sobre [P2 #474](https://github.com/sforero94/Escociaos/pull/474).
Esta fase conecta el contrato SQL v1 con el panel de chat existente.

## Transporte

La web pide `motor: 'sql'` y `Accept: text/event-stream`. La configuración,
validación del cuerpo, JWT y Gerencia activa se comprueban antes de abrir el stream.
Sin ese encabezado, el mismo endpoint conserva el JSON de P2.

Cada frame usa `event: nombre` y `data: {type: nombre, ...}`:

| Evento | Datos |
|---|---|
| `consulta_inicio` | `consulta` (desde 1), `proposito` |
| `consulta_fin` | `consulta`, `ms`, `ok`, `n_filas` |
| `texto` | `texto` final |
| `bloques` | `bloques` construidos por el servidor |
| `sugerencias` | `sugerencias`, `aclaracion?` |
| `done` | `resultado`: cuerpo JSON completo de P2 |
| `error` | `message` seguro; terminal, sin `done` |

Los eventos de consulta se emiten durante la ejecución; el texto se emite cuando
termina la composición del modelo. No se afirma streaming de tokens del proveedor.
Cancelar cierra el stream y evita iniciar llamadas posteriores. La consulta o
petición al proveedor que ya estaba en vuelo puede terminar; no se promete anularla.

## Panel y persistencia

El adaptador SQL se selecciona con `VITE_ESCO_MOTOR_WEB=sql`. Ausente o cualquier
otro valor mantiene el motor anterior. La fase entrega el código con el flag apagado;
crear/cambiar esa variable o activarlo necesita aprobación de Santiago.

El panel renderiza tablas (50 filas visibles), gráficas, tarjetas, aclaraciones y
preguntas de seguimiento. Las cifras usan el formateador común de P2 y las consultas
se muestran con su propósito y duración. El informe se construye desde los bloques.

Solo un `done` válido permite guardar el turno completado. Usuario y asistente se
insertan juntos en `chat_messages`, con la sesión del usuario y sus políticas RLS.
El asistente guarda `metadata.motor = sql`, fecha del snapshot, bloques con su
proyección de datos y consultas con SQL/conteos/tiempos, sin muestras ni filas de
consulta completas. Reabrir la conversación dibuja el snapshot sin volver a consultar
las fuentes; el mensaje identifica que son datos del momento de la consulta.
Un error o cancelación no guarda una respuesta parcial como turno completado.

## Verificación y pendientes

Las pruebas usan LLM, RPC, transporte y persistencia sintéticos. Incluyen SSE,
autorización previa, error terminal, cancelación, validación del snapshot, límites
visuales y compatibilidad JSON/legado. No usan banco privado, held ni llamadas pagadas.

Verificación del coordinador: 414 archivos, 8.737/8.737 pruebas; tipos y build
verdes; lint con cero errores y 873 avisos existentes. Las 26 pruebas nuevas
incluyen 13 de QA independiente. Se corrigieron las incompatibilidades detectadas
con la tabla compartida y el registro de herramientas, conservando las guardas.
La comprobación visual usó una pantalla local sintética de componentes en escritorio
y móvil; no acredita una conversación productiva de Santiago ni una exportación PDF
completa en navegador. No se incorporan las pantallas temporales al repositorio.

Requiere aprobación explícita para desplegar `esco-consultas` con CLI 2.117.0,
`--project-ref ywhtjwawnkeqlwxbvgup --use-api`, conservando `verify_jwt = true`.
La activación del flag se aprueba aparte. La prueba real de Santiago queda pendiente;
por esa dependencia del plan se conserva el segundo botón beta y su ruta. Su retirada
se hará después de esa comprobación, sin declarar una aceptación que aún no ocurrió.

P4 se revisa por separado. Sus cambios de seguridad no están incluidos aquí.
