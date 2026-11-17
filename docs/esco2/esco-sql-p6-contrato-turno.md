# P6 — contrato local de historial y recibo por turno

Fecha: 2026-11-09. Contrato para implementación local en PR478. No autoriza deploy,
flags, secretos, modelos reales, capturas productivas, held ni migraciones.
Extiende P2/P3/P5 de forma aditiva; no reemplaza sus bloques ni su autorización.

## Decisión de historial

Alternativas: mantener representaciones por canal y aceptar divergencias; o una
función pura común que conserve seguimiento con procedencia SQL. Elegir la segunda:
reduce diferencias del adaptador y conserva la capacidad ya presente en web.
El control de contexto crea conversaciones SQL independientes; no borra mensajes.
No introduce un replay alojado ni garantiza igualdad de dos generaciones del modelo.

Fuente única: `src/utils/escoSql/historial.ts`, sin imports runtime del
loop, red, filas SQL ni metadatos arbitrarios. Exports:

```ts
export const MAX_HISTORIAL_SQL = 10;
export const MAX_TEXTO_HISTORIAL_SQL = 4000;
export interface MensajeHistorialSql { rol: 'user' | 'assistant'; texto: string }
export function construirHistorialSql(filas: readonly unknown[]): MensajeHistorialSql[];
export function normalizarHistorialEfectivoSql(historial: readonly unknown[]): MensajeHistorialSql[];
export function textoHistorialSql(texto: string, consultas: readonly {sql: string}[]): string;
```

Política común, en este orden:

1. Seleccionar la conversación explícita y comprobar propiedad/actor autorizado.
2. Leer filas SQL de ambos roles: `metadata->>motor = 'sql'` y role user/assistant.
   El filtro debe ocurrir **antes** del límite en ambos clientes. Query equivalente:
   conversation_id, metadata.motor SQL y roles elegibles; ordenar created_at DESC,
   id DESC; limit10. Reordenar ASC con el mismo desempate. No leer veinte filas
   arbitrarias y después filtrar; podría esconder mensajes elegibles antiguos.
3. Helper común valida filas, filtra ambos roles por metadata.motor SQL, ordena
   `(created_at, id)` ASC y toma últimos diez. No incluye usuarios legacy huérfanos
   ni assistant legacy, capturas o tools. IDs/fechas de filas elegibles deben permitir
   orden verificable; evidencia inválida no se repara por suposición.
4. User aporta solo content. Assistant SQL aporta content y allowlist de hasta
   cuatro `consultas[].sql` de su snapshot; nunca filas, resultados, actor ni otra
   metadata. Un snapshot SQL antiguo **sin recibo** sigue siendo válido para
   render/historial. Un recibo nuevo no es requisito retrospectivo.
5. Aplicar máximo 4.000 unidades UTF-16 por mensaje, coherente con `.length` HTTP.
   Con consultas reservar al menos 200 unidades para prosa. Incorporar únicamente
   SQL completos que quepan, en su orden original, con el encabezado de procedencia.
   Reservar espacio para un marcador explícito de consultas omitidas por límite.
   **Nunca cortar SQL y presentarlo como consulta completa**. Si no cabe una consulta,
   omitirla y marcarlo; no prometer procedencia completa. Sin consultas, recortar prosa.

El motor normaliza el array final `{rol,texto}`, últimos10 y máximo4000, antes de
hash y ejecución. El helper de filas ya produce esa forma; normalizarla otra vez
no debe añadir SQL ni cambiarla. `hashHistorialSql` usa SHA-256 sobre UTF-8 de
`JSON.stringify(arrayFinal)`, sin objeto de metadata ni ordenación de mensajes.
El mismo array se entrega al loop. No calcular la huella sobre doce mensajes antes
del recorte ni sobre filas sin transformar. El loop puede reexportar las funciones
previas para compatibilidad, pero no conservar otra implementación del formateador.

## Conversación nueva y callbacks

Telegram registra **`/esco_nueva`**, namespaced y antes del fallback, solo en la
ruta SQL. Respeta el flag legacy y los handlers de captura existentes. Reautoriza
Gerencia activa/consultas, crea una conversación del actor y guarda un puntero de
sesión ligado a usuario, cuenta Telegram y chat. Cada uso vuelve a comprobar dueño
con id y user_id. Una identidad cambiada no hereda la conversación anterior.
No reutiliza el selector legacy de cuatro horas; no llama al modelo ni borra
chat_messages. El primer turno SQL también puede crear su propia conversación
si no existe puntero SQL válido. Web conserva su acción Nuevo y selección explícita.

La autoridad del contexto SQL vive en una fila namespaced independiente en `telegram_sessions`, ligada a actor/Telegram/chat. Las preguntas leen esa autoridad y no la escriben al finalizar: un turno tardío no puede deshacer `/esco_nueva`. Inicializar usa insert-if-absent y resuelve únicamente un conflicto23505 leyendo el ganador; un resultado incierto no se reintenta. El reset explícito reemplaza solo esa autoridad y no la sesión de capturas.

Nueva conversación invalida los botones SQL previos. Cada callback contrasta la conversación del botón con la autoridad actual, sin crear una conversación para un botón vencido. «Ver consultas» no genera gasto ni llama al motor; el recibo original permanece
en el snapshot del turno. una sugerencia válida crea un turno y recibo nuevos.
No permitir que un botón antiguo continúe accidentalmente el contexto nuevo.

Un primer turno en dos conversaciones nuevas puede verificar historial vacío por
sus recibos. Para seguimientos se compara el historial efectivo real: una respuesta
distinta del modelo puede hacer divergir el siguiente contexto. No forzar vacío
si la pregunta depende de antecedentes ni afirmar que este cambio garantiza todos
los pares del smoke. El comparador P6 mantiene sus gates estrictos.

## API compartida del recibo

Fuente: `src/utils/escoSql/turno.ts`; pura, portable Deno/browser/Node20,
con Web Crypto, sin imports runtime del loop ni librerías externas. Exports:

```ts
export type CanalTurnoSql = 'web' | 'telegram';
export interface UsoTurnoSql {
  llamadas: number; entrada: number; salida: number; costoUsd: number | null;
}
export interface ContextoTurnoSql {
  turno_id: string; canal: CanalTurnoSql; historial_sha256: string;
}
export interface ReciboTurnoSql extends ContextoTurnoSql {
  version: 1;
  estado: 'completado' | 'error' | 'cancelado';
  uso: UsoTurnoSql | null;
  coste: {
    estado: 'completo' | 'parcial' | 'desconocido';
    observadoUsd: number | null;
    llamadasConCoste: number;
    llamadasSinCoste: number;
  };
}
export function leerUsoTurnoSql(valor: unknown): UsoTurnoSql | null;
export function leerReciboTurnoSql(valor: unknown): ReciboTurnoSql | null;
export function hashHistorialSql(historial: readonly MensajeHistorialSql[]): Promise<string>;
export function crearContextoTurnoSql(
  canal: CanalTurnoSql,
  historial: readonly MensajeHistorialSql[],
  crearId?: () => string,
): Promise<ContextoTurnoSql>;
```

La puerta crea UUID aleatorio después de autenticar/autorizar y validar la solicitud;
`crearId` solo permite inyección en pruebas. Deriva canal de puerta JWT web o puerta
servicio Telegram ya autenticada. No acepta turno_id, canal, actor autorizado ni
coste declarados por un cliente. El historial es contexto generativo, nunca permiso
ni identidad. Una denegación inicial no genera UUID, modelo ni recibo autorizado.

Coste: envolver `ClienteLLM.completar` por request dentro del manejador. No modificar
el loop para deducir costes de precios/tokens. Cada intento termina exactamente
una vez en observación o fallo; validar coste **por llamada**, finito y no negativo,
antes de sumarlo. Cero reportado explícitamente sí es observado. Ausente, null,
malformado, negativo, NaN, infinito o llamada lanzada sin recibo son desconocidos.

- `completo`: al menos una llamada con coste, ninguna desconocida y resultado de
  medición cierto. `uso.costoUsd` coincide con observadoUsd finito.
- `parcial`: existe subtotal observado, pero falta algún coste o queda una llamada o medición monetaria incierta. Total `uso.costoUsd = null`; subtotal nunca es total.
- `desconocido`: ningún coste observado; observadoUsd null y total null. Si no hubo
  respuestas de modelo utilizables, uso null; no usar el acumulador inicial cero.

Uso.llamadas/tokens corresponden a respuestas LLM completadas observadas según el
contrato existente. Fallos sin recibo no inventan tokens y cuentan en llamadasSinCoste.
El adaptador LLM actual normaliza tokens ausentes a cero: estos contadores no
certifican cobertura raw del proveedor. Esta ampliación certifica coste reportado,
no corrige esa limitación del adaptador. Sumas no finitas no son totales conocidos.
Una llamada sin recibo o salida monetaria incierta conserva total null y subtotal etiquetado. Cancelar ejecución o entrega no vuelve desconocidos cargos ya observados si todos los intentos tienen recibo.

Si la solicitud está abortada al cerrar, el estado operacional cancelado tiene prioridad, aunque el proveedor también falle. La certeza monetaria se determina por los recibos, no por ese estado.

Un 42501 de RPC después de una llamada pagada es error autorizado con recibo y
coste observado posible, sin filas ni contenido del actor revocado. Puede tener
coste completo si todas las llamadas terminaron con coste reportado; error de
respuesta y desconocimiento de gasto son estados distintos. Un error anterior
al modelo tiene uso null, no gasto real cero inferido.

## Transporte, persistencia y medición

Campo aditivo externo **`recibo`**, con `uso` compatible e igual a recibo.uso en
respuestas nuevas JSON, SSE done.resultado y snapshot. Ambos parsers lo conservan;
validan coherencia y nunca sustituyen null por cero. Snapshots viejos sin recibo
siguen visibles; no se les inventa identidad/coste retrospectivos.

SSE inicio: `type: 'turno'` con turno_id, canal e historial_sha256, sin uso inicial
falso. Progreso conserva turno_id/canal. Error SSE autorizado devuelve recibo y uso,
igual que JSON de error; no lo transforma en éxito parcial. Abort/cancelación puede
impedir enviar el terminal: registrar cierre operacional cuando sea posible.
Los adaptadores conservan un error recibido como error (metadata.motor sql_error),
no como respuesta exitosa ni historial SQL. No hacen una segunda llamada al modelo
para guardar, reabrir, exportar, recuperar coste o resolver un resultado incierto.

Logs solo incluyen UUID opaco, canal, estado, uso y resumen de coste/códigos cerrados.
**Nunca historial_sha256, actor, hash de contenido, pregunta, SQL, filas, respuesta,
secretos o sus hashes**. Historial_sha256 vive únicamente en recibo/snapshot privado.
Recibo completo devuelto enlaza exactamente snapshot/JSON/SSE/uso por turno, incluso
con turnos intercalados. Un timeout antes de recibir ID/recibo queda desconocido;
no se enlaza por timestamp ni se reintenta automáticamente. El ID inicial permite
identificar la ejecución pero por sí solo no demuestra su coste final.

Capturas privadas P6 usan generation_id = recibo.turno_id e history_sha256 =
recibo.historial_sha256. Coste completo permite cost_source observed/total observado incluso si la ejecución
o entrega falló; ese error bloquea la aceptación del protocolo. Parcial/desconocido
conservan total desconocido y evidencia de subtotal aparte. Latencia del
motor no sustituye entrega completa del canal. Configuración congelada excluye
secretos, fecha/hoy/corte dinámico. El comparador no rebaja esos gates.

Persistencia usa metadata JSON ya existente; no requiere nueva migración ni secreto.
Cualquier despliegue futuro sigue requiriendo aprobación explícita. QA separado
prueba límites/orden/legacy, SQL omitido, snapshots antiguos, UUID postauth,
canal derivado, costes por llamada/errores, intercalación, callbacks y nueva sesión.
