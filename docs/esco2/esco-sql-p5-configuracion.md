# P5 — configuración y aprobaciones de Telegram

Estado al cierre de la liberación del 2026-11-09: secreto compartido creado y make-server desplegado con aprobación explícita de Santiago. Telegram permanece en legacy; no se activaron flags. El procedimiento y los textos de aprobación originales se conservan como referencia.
Proyecto: `ywhtjwawnkeqlwxbvgup`. Cuenta Composio: `escocia-os`.

## Liberación autorizada del 2026-11-09

- Candidato aprobado y desplegado: `0a9883c227e550446230bcb8f18a9b5c8f2077b9`,
  árbol `ab3e622c9e2c56b743698a0e2d54bcca4456d600`.
- Se creó únicamente `ESCO_TELEGRAM_SECRET`: 32 bytes aleatorios base64url,
  generados en memoria. El valor no se imprimió ni se guardó en archivos, chat,
  PR o Notion. Lectura por conector: secreto presente, flag ausente y los demás
  nombres de secretos intactos.
- Se desplegó únicamente make-server mediante CLI fijada 2.117.0:
  `npx supabase@2.117.0 functions deploy make-server-1ccce916`, desde una copia
  congelada del árbol aprobado. QA contrastó los 2.201 blobs versionados con Git.
- make-server: versión **299**, ACTIVE, `verify_jwt=false`, health anónimo **200**,
  hash del bundle `e2642bd441e6bffe84ad387c47829f66d3dd8bab7889f4e0a62acb9d44c939e2`.
- esco-consultas: metadato versión **16**, ACTIVE, `verify_jwt=true`, health anónimo
  **401**. Conserva el mismo hash `903db296ef4ecf9c77930dc32c3de936d78a16804a0de13c9c5d02e7711e6295`,
  fecha de despliegue y entrypoint anteriores. No se ejecutó su comando de deploy.
  El incremento del contador no se presenta como un cambio de código.
- `ESCO_MOTOR_TELEGRAM` sigue ausente: las preguntas continúan por legacy.
  No se cambiaron credenciales ajenas, flags web ni migraciones. No hubo preguntas,
  mensajes, modelos pagados o lecturas de datos del negocio en producción.

El grafo completo pasó la verificación local de [D3](esco-sql-p5-d3-spike.md):
45 peticiones HTTP de ensayo, 46 turnos reales del handler, 161 PNG y 23 CSV
sintéticos de 500×12 celdas; límite de worker 256 MB/2 s CPU. Incluyó respuestas
de 3.731.697 bytes, reutilización y concurrencia. La base simulada conservó
historial y snapshots; no se certifica un pico RSS ni el entorno productivo.
El siguiente paso requiere autorización separada para activar SQL e iniciar P6;
también hay que verificar la disponibilidad del adaptador web P3 y su flag. La activación no está autorizada por
la creación del secreto ni por este despliegue. Held conserva su gate D6.

## Preflight y propuesta originales (histórico)

La lectura de nombres del 2026-11-09 confirmó que no existen
`ESCO_TELEGRAM_SECRET` ni `ESCO_MOTOR_TELEGRAM`. Se descartaron todos los campos de
valor de la respuesta; solo se retuvieron esas dos presencias. Antes de escribir
se vuelve a comprobar el estado para evitar sobrescribir configuración concurrente.

| Nombre | Alcance | Propuesta |
|---|---|---|
| `ESCO_TELEGRAM_SECRET` | Secreto de Edge Functions del proyecto, leído por las dos funciones | Crear un valor aleatorio de 32 bytes, codificado base64url sin padding. Generarlo solo después de aprobación; nunca imprimirlo ni ponerlo en código, chat, PR, Notion o argumentos del shell. |
| `ESCO_MOTOR_TELEGRAM` | Flag de ejecución del bot | Mantener ausente durante el despliegue: el código usa legacy. Crear `sql` solo con aprobación de activación separada. `legacy` permite volver al motor anterior durante la transición. |
| `VITE_ESCO_MOTOR_WEB` | Configuración del frontend | Fuera de P5; no se cambia. |

Los secretos de producción se comparten a nivel de proyecto y se leen con
`Deno.env.get`. Un cambio de secreto llega a las funciones desplegadas sin un nuevo
despliegue, así que también un cambio del flag tiene efecto inmediato.
[Fuente oficial: secretos de Edge Functions](https://supabase.com/docs/guides/functions/secrets).
No son dos valores diferentes ni dos escrituras para el secreto compartido.

La credencial de servicio existente autentica al bot ante el gateway; el secreto
nuevo añade la segunda comprobación. No se cambia `SUPABASE_SERVICE_ROLE_KEY`,
`TELEGRAM_BOT_TOKEN`, el secreto del webhook, el JWT del proyecto ni credenciales
ajenas a estos dos nombres. La puerta de esco-consultas v15 ya está desplegada.

## Procedimiento original y estado de los pasos

Los pasos 1–3 quedaron cumplidos con la aprobación reanudada por Santiago; no volver a solicitarla para ese mismo cambio. El paso 4 se documenta en D3 y el paso 5 sigue sin autorización.

1. Congelar el SHA revisado del PR P5 y verificar CI, contenido, pares de archivos
   del bot y configuración JWT: make-server=false, esco-consultas=true.
2. Tras aprobación del secreto, volver a consultar SOLO nombres mediante Composio.
   Generar el valor en memoria y usar `SUPABASE_CREATE_BULK_SECRETS`, cuenta
   `escocia-os`, proyecto anterior y una sola entrada `ESCO_TELEGRAM_SECRET`.
   Pasar el JSON por stdin, sin argumentos con valores ni archivos versionados.
   Filtrar la respuesta antes de mostrarla o guardarla: solo éxito y nombres.
   Verificar presencia por `SUPABASE_LIST_SECRETS`, descartando campos de valor.
   No consultar claves del proyecto ni el endpoint de configuración PostgREST.
3. Tras aprobación del despliegue, publicar solo make-server desde ese SHA,
   manteniendo `ESCO_MOTOR_TELEGRAM` ausente. Comprobar nueva versión/hash, JWT=false,
   health anónimo200 y esco-consultas v15/JWT=true sin cambios. El secreto por sí solo
   no cambia el enrutamiento de preguntas a SQL.
4. Antes de activar SQL, cerrar el gate de recursos PNG descrito en el
   [spike D3](esco-sql-p5-d3-spike.md). El renderer aislado pasó 45 peticiones y 180 PNG con cuota de 256 MB; eso no
   certifica el grafo completo de make-server ni el worker productivo. Cualquier prueba productiva,
   mensaje real o llamada pagada requiere su alcance y presupuesto explícitos.
5. Tras aprobación de activación, crear el flag `ESCO_MOTOR_TELEGRAM=sql` por
   Composio. Verificar acceso y captura con el alcance aprobado de esa comprobación.
   Esto no abre held ni acepta D6/P6. La UI web sigue con su autorización aparte.

Comando originalmente preparado (ejecutado con CLI fijada 2.117.0):

```sh
npx supabase functions deploy make-server-1ccce916
```

Usa `verify_jwt=false` de `supabase/config.toml`. No se publica por conector ni se
redespliega esco-consultas por este paso. No hay migraciones nuevas en P5.

## Textos de aprobación separados: secreto y despliegue cumplidos; activación pendiente

El SHA concreto y el enlace al PR revisado se añaden a la solicitud final; una
aprobación de un paso no aprueba los siguientes.

**Secreto compartido:**

> Apruebo crear únicamente ESCO_TELEGRAM_SECRET en ywhtjwawnkeqlwxbvgup con un
> valor aleatorio de 32 bytes generado en memoria y compartido por ambas funciones.
> No autorizo crear ni activar ESCO_MOTOR_TELEGRAM ni cambiar otras credenciales.

**Despliegue:**

> Apruebo desplegar únicamente make-server-1ccce916 desde el SHA revisado del PR P5
> con npx supabase functions deploy make-server-1ccce916 y verify_jwt=false,
> manteniendo ESCO_MOTOR_TELEGRAM ausente y sin cambiar secretos ni otros flags.

**Activación, después del gate PNG y de la aprobación de su verificación:**

> Apruebo crear ESCO_MOTOR_TELEGRAM=sql en ywhtjwawnkeqlwxbvgup para activar el
> adaptador P5 del SHA desplegado revisado. Esta aprobación no incluye activar la
> web, ejecutar held, hacer campañas pagadas ni modificar la captura de Telegram.

## Fallos y reversión

Un fallo del secreto o de la llamada SQL se muestra como error cerrado; no reenvía
silenciosamente la pregunta al motor legacy ni a otro proveedor de gráficos.
Si el problema es el render PNG, se conserva el texto/snapshot y se ofrece el
CSV completo del bloque con un aviso. No se usa QuickChart en el camino SQL.

Volver el flag a `legacy` también es un cambio de configuración y necesita
aprobación explícita. No borrar ni rotar el secreto para intentar apagar SQL:
se usa el flag. Si una escritura tiene resultado incierto, se reconcilia por el
mismo conector antes de reintentar; nunca se repite por otra conexión. La RPC
arbitraria antigua permanece cerrada por la 194.
