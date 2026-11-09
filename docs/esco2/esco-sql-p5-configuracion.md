# P5 — configuración y aprobaciones de Telegram

Estado: preparación local. Esta fase no crea secretos, no activa flags y no despliega.
Proyecto: `ywhtjwawnkeqlwxbvgup`. Cuenta Composio: `escocia-os`.

## Estado confirmado y cambio preparado

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

## Procedimiento preparado, todavía no ejecutado

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
   [spike D3](esco-sql-p5-d3-spike.md). Las medidas Deno locales no certifican el
   presupuesto de memoria del worker productivo. Cualquier prueba productiva,
   mensaje real o llamada pagada requiere su alcance y presupuesto explícitos.
5. Tras aprobación de activación, crear el flag `ESCO_MOTOR_TELEGRAM=sql` por
   Composio. Verificar acceso y captura con el alcance aprobado de esa comprobación.
   Esto no abre held ni acepta D6/P6. La UI web sigue con su autorización aparte.

Comando de despliegue preparado (no ejecutado):

```sh
npx supabase functions deploy make-server-1ccce916
```

Usa `verify_jwt=false` de `supabase/config.toml`. No se publica por conector ni se
redespliega esco-consultas por este paso. No hay migraciones nuevas en P5.

## Textos de aprobación separados

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
