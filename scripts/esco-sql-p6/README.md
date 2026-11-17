# P6: comparar capturas sin servicios

Herramienta **offline**. Requiere Node 20+ y `npm ci`. No captura tráfico, ejecuta
preguntas ni lee bancos, `.env`, secretos, modelos, red o bases de datos.
`cargar.mjs` transpila en memoria el módulo fijo y sus imports TypeScript puros
mediante la dependencia TypeScript instalada; no escribe código ni carga imports
remotos. Usa el constructor y formateador P2 reales.

```sh
# Solo datos inventados, en una ruta externa al repo público.
node scripts/esco-sql-p6/sintetico.mjs > /tmp/esco-p6-inventado.json
node scripts/esco-sql-p6/comparar.mjs --input /tmp/esco-p6-inventado.json
```

El ejemplo sale **1**, intencionadamente: sus 80 costes son desconocidos (`null`),
no cero. Aunque 40 pares y sus snapshots coincidan, no acredita mediciones reales.
El CLI sale 0 si el protocolo suministrado pasa; 1 si falta evidencia o difiere;
2 si rechaza lectura/JSON/argumentos. Un 0 de replay nunca acepta P6 real ni D6.
Usa `realpath` para rechazar entradas dentro del repo, incluso enlaces simbólicos.
La salida es un objeto fijo de agregados. No imprime casos, hashes, SQL, preguntas,
respuestas, trazas, errores originales ni rutas de entrada.

## Entrada privada, versiones 1 y 2

Raíz: `schema_version: 1 | 2`, `mode: paired_live | shared_response_replay`,
`period: {started_at, ended_at}` (ISO UTC con Z, fecha real, intervalo concluido de al menos 14 días),
`captures: [...]`. Hay exactamente **80 capturas**: los mismos veinte `case_id`
en cada semana, dos canales por caso. No combina ni escoge repeticiones favorables.

Cada captura contiene:

| Campo | Contrato |
|---|---|
| `week` | Número 1 o 2. Su fecha cae en los siete días correspondientes desde `started_at`. |
| `case_id` | ID privado opaco. No aparece en el reporte. |
| `channel` | `web` o `telegram`. |
| `observed_at` | Fecha ISO UTC con Z, real y concluida; no futura. |
| `context` | Siete SHA-256 hex de 64 caracteres, todos obligatorios: `actor_sha256`, `question_sha256`, `history_sha256`, `scope_sha256`, `data_cut_sha256`, `engine_sha256`, `config_sha256`. Ambos canales deben coincidir. |
| `generation_id` | Identificador privado de ejecución del motor. Igual para replay; distinto entre canales para pareado real. |
| `outcome` | `success`, `error` o `unknown`. Un error o estado desconocido bloquea el protocolo. |
| `metrics` | `{latency_scope: 'end_to_end', latency_ms: number\|null, cost_source: 'observed'\|'unknown', cost_usd: number\|null}`. Números finitos no negativos. `unknown` exige coste null. `observed` exige un número. |
| `response` | Respuesta SQL P2 completa: `motor`, `texto`, `bloques`, `sugerencias`, `aclaracion?`, `consultas`, `ms`. Las consultas no contienen filas. |
| `snapshot` | Objeto persistido completo, mismos campos y `motor: sql`, más `snapshot_at` ISO UTC con Z, fecha real. |
| `format_observations` | Con bloques, lista no vacía de `{block, row, column, display}` observados; sin bloques válidos, lista vacía `[]` (no aplicable). Índices desde cero; `row: null` para tarjeta. `column` es la columna cruda y `display` el texto observado. |

El capturador autorizado calcula los hashes con un método canónico documentado y
conserva los originales/evidencia fuera de Git. `huella` exporta SHA-256 canónico
con claves de objetos ordenadas; preserva el orden de arrays. Un hash igual no
prueba por sí solo actor, contexto ni un corte transaccional real. Si no se conoce
ese dato, no fabricar un hash constante: dejarlo desconocido y resolver el gate.
`config_sha256` solo contiene configuración pública/no secreta confirmada; excluir
tokens, secretos, contraseñas, claves de servicio y también sus hashes.
Motor/artefactos y settings funcionales/modelo/configuración permanecen congelados:
`engine_sha256` y `config_sha256` son invariantes globales de las ochenta capturas.
Cambiar ambos canales juntos entre semanas también bloquea. Fecha, `hoy` y cortes
dinámicos quedan fuera de configuración; van en `data_cut_sha256`/`scope_sha256`
y se comparan por par. Un cambio real exige nuevo ensayo o decisión de Santiago,
nunca hashear como si el valor anterior siguiera vigente. No leer
secretos para construirla. La huella de historial describe el array efectivo
normalizado por `src/utils/escoSql/historial.ts`: últimos diez mensajes SQL, texto
y consultas completas bajo el límite común. `hashHistorialSql` calcula SHA-256 de
UTF-8 de `JSON.stringify(arrayFinal)`; no usar la huella genérica con objetos
ordenados para sustituir esta convención. Conservar evidencia privada del input.
La implementación local enlaza UUID/canal/uso; todavía debe liberarse y verificarse
con las aprobaciones del [protocolo](../../docs/esco2/esco-sql-p6-preparacion.md).

### V2: recibos obligatorios para protocolo vivo

V1 sigue aceptando replay/fixtures offline; nunca produce `p6_live_protocol_pass`.
V2 exige `mode: paired_live`, ochenta UUID distintos y los requisitos anteriores.
Cada captura añade:

- `response.recibo` y `response.uso` coherentes según el contrato compartido; UUID
  igual a generation_id, canal igual a channel y huella igual a context.history_sha256.
- `snapshot.recibo`/`snapshot.uso` idénticos a los recibidos, sin perder null.
- `execution_log`: JSON terminal de aplicación con claves exactas `funcion`,
  `evento`, `turno_id`, `canal`, `estado`, `uso`, `coste`, `consultas`, `errores`,
  `ms`, `llamadas`, `costoUsd`. funcion es esco-consultas y evento es turno_sql;
  identidad/estado/uso/coste coinciden con el recibo. Excluir envoltorios del proveedor,
  actor, contenido, SQL y huellas de contenido/historial.

Éxito requiere recibo completado. Coste completo observado puede coexistir con
error de ejecución o entrega: el gasto conserva evidencia pero el protocolo falla.
Coste parcial/desconocido obliga metrics.cost_source unknown y cost_usd null;
`partial_observed_subtotal` muestra el subtotal parcial por separado. No inventar
un total desde tokens. Reutilizar IDs, eliminar recibos, alterar hash, snapshot,
log o métricas bloquea el vínculo. La respuesta del reporte es schema_version2,
con evidence_schema_version y counts.receipt_linked_captures explícitos.

Las observaciones de formato deben venir del artefacto del canal, no de ejecutar
el mismo formateador para rellenarlas. La herramienta solo comprueba las celdas
aportadas contra su valor crudo; **no acredita cobertura visual completa**. Una
respuesta válida sin bloques (aclaración/sin dato/rechazo) admite exclusivamente
la lista vacía explícita `[]` como formato no aplicable y suma
`format_not_applicable_captures`, no observaciones ni checks inventados. Un campo
ausente continúa siendo evidencia incompleta. Con bloques, lista vacía o ausente
sigue siendo formato desconocido y bloquea. Una observación de una columna/bloque
inexistente tampoco acredita formato. Capturar
por separado la tabla larga, truncado, pie con muchas leyendas, gráfica móvil y
CSV, con revisión humana. Las vistas previas 50/15 filas difieren por diseño; los
snapshots/CSV deben conservar todas las filas.

## Comparación y métricas

El constructor P2 valida tipos, filas/columnas, límites, formatos, orden y avisos.
No repara entradas. Rechaza un bloque cuya forma canónica cambie. El snapshot
conserva texto, bloques, sugerencias y aclaración exactos, y trazas sin cambiar SQL,
propósito, conteo, truncado o error. Los únicos campos volátiles excluidos de
la igualdad de snapshot son `ms` total, `consultas[].ms` y `snapshot_at`. La paridad entre canales compara texto, bloques,
sugerencias y aclaración; no borra espacios, orden, cifras, unidades ni avisos.
`null`, cero, columna ausente y cadena vacía no son equivalentes. El comparador no
demuestra que un bloque venga de una lectura real ni corrige factualidad del texto.

`counts.errors` cuenta turnos con outcome error. `sql_trace_captures`,
`sql_query_attempts` y `sql_query_errors` cuentan las trazas de respuestas válidas
observadas, sin mensajes SQL. Un intento SQL fallido recuperado no equivale a
un turno fallido ni bloquea por sí solo el protocolo; no debe ocultarse como
«cero errores». Las respuestas inválidas no acreditan cobertura de esas trazas.

El p95 usa rango más próximo y la latencia aportada debe medir hasta completar
texto, bloques y archivos en el canal. No usar `response.ms`, tiempo hasta primer
token ni solo tiempo del motor. Umbral: **menor de 25.000 ms por canal**. Todos los
80 turnos deben aportar latencia y coste observados para cerrar este protocolo.
El reporte muestra subtotal observado y cobertura; el total queda null mientras
falte un coste. No infiere precios a partir de tokens ni atribuye precio cero a
uso/coste ausente. El presupuesto para capturas/juez/modelos queda por aprobar.

`protocol_pass` solo evalúa los archivos aportados. `p6_live_protocol_pass` exige
además esquema v2, modo real y todos los recibos enlazados; no es autorización ni aceptación de captura/comandos, seguridad,
factualidad o D6. `d6_accepted` y `activation_authorized` siempre son false. La CLI
no ofrece opción `held`, ejecutor de eval ni automatización de activación.
