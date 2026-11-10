# P6 — preparación local y protocolo de observación

Fecha: 2026-11-09. Alcance: protocolo, comparador offline y QA sintética separados.
No hay activación, merge, deploy, pregunta real, lectura de banco privado, modelo
pagado, captura en producción ni ejecución held en esta preparación.
La [propuesta de activación](esco-sql-p6-activacion.md) trata la liberación web y
los cambios concretos que deberá aprobar Santiago. Este documento no los autoriza.

## Qué evidencia cuenta

Dos opciones tienen límites distintos:

1. **Replay de un mismo objeto SQL.** Permite aislar diferencias entre adaptadores,
   snapshots, exportación y formato. Su igualdad es determinista, pero no demuestra
   dos semanas de uso de canales vivos ni seguridad/autenticación alojadas.
2. **Dos llamadas por canales vivos.** Ejercitan web y Telegram reales. El modelo
   puede producir prosa/bloques diferentes aunque la pregunta coincida. También
   pueden cambiar datos, actor, historial o configuración entre llamadas.

Usar ambas evidencias. La primera explica el renderizado; la segunda cumple el
smoke vivo si los resultados coinciden. No atribuir automáticamente una diferencia
a un renderer, no aceptar equivalencia semántica como igualdad literal del plan,
ni escoger la repetición que favorezca al candidato. Una divergencia permanece
abierta hasta revisión privada y resolución explícita. No hace falta cambiar el
runtime para preparar este protocolo; el comparador consume capturas externas.
Una puerta de replay alojada requeriría revisión y autorización propias.

## Gate previo: viabilidad de capturas, todavía abierto

No se promete una campaña de ochenta capturas comparables con el código actual.
La revisión de fuente detectó estas diferencias:

| Evidencia | Web | Telegram | Consecuencia |
|---|---|---|---|
| Payload de historial | `escoSqlChatService.ts`: últimos diez mensajes; al asistente SQL añade `textoHistorialSql` con SQL. | `bot.ts` lee veinte mensajes; `historialEscoSql` filtra y envía hasta doce, solo contenido. | Después, el motor usa solo los últimos diez de ambos. Persisten diferencias de representación, filtros y selección de conversación. |
| Selección de conversación | El usuario selecciona conversación; una nueva usa mensajes locales vacíos. | `getOrCreateTelegramConversation` reutiliza una reciente de hasta cuatro horas del mismo usuario. | No hay control común del estado inicial para veinte pares. No vaciar ni editar historial productivo para fabricar igualdad. |
| Coste por turno | El frame SSE `done` contiene la respuesta cruda con `uso`, antes del parser web. | El parser de Telegram conserva texto/bloques/trazas, pero descarta `uso`. | Un recibo web autorizado puede guardar coste reportado; el snapshot Telegram no lo acredita. |
| Correlación | `turno_sql` registra coste/ms/errores. | Ese evento no contiene canal, actor ni ID de request en su payload. | Sin vínculo adicional verificado no adjudicar una línea de logs a un turno por proximidad de hora. |

En `src/utils/escoSql/loop.ts`, `MAX_HISTORIAL_SQL = 10` y el motor aplica
`slice(-10)`. **`history_sha256` debe representar el historial efectivo que usa
el motor**, con ese recorte y la representación exacta de rol/texto; documentar
el normalizador y la versión de fuente. Conservar también el payload original
privado para verificar la transformación. No declarar una diferencia por dos
mensajes antiguos que el motor descarta ni fabricar un historial común vacío.

Los metadatos del proveedor de logs podrían ofrecer vínculos adicionales, pero
esta preparación no los ha verificado. No asumirlos. Incluso un coste reportado
por el motor permanece desconocido si el proveedor devuelve null. Medir la
latencia completa del canal requiere además observar el final de entrega; `ms`
del motor no lo reemplaza.

Orden propuesto, sin autorización de ejecución viva:

1. Completar comparador/QA offline sintéticos de esta PR y validar localmente una
   propuesta de captura/instrumentación que realmente enlace ambos contextos y
   recibos. Si exige runtime nuevo, presentar primero PR/revisión y pedir las
   aprobaciones de deploy correspondientes. Dos llamadas actuales no generan por
   sí mismas una correlación que el código no emite.
2. Solo tras disponer de ese mecanismo validado, solicitar un **piloto previo de un par, como máximo dos llamadas al motor**,
   con presupuesto concreto aprobado antes de usar modelos, cuenta/estado y
   corte conocidos, y captura privada expresamente autorizada. No es el smoke de
   dos semanas ni amplía permiso para leer held. El piloto solo procede si existe
   una forma aprobada de capturar ambos payloads/recibos efectivos; el navegador
   no puede observar por sí solo el POST servidor-a-servidor de Telegram.
3. Demostrar con evidencia por turno: historial exacto enviado, actor autorizado,
   configuración efectiva, corte, recibo del motor, coste observado y entrega
   final. No incluir JWT, headers de autorización ni secretos en la captura.
4. Si falta correlación/coste/corte o los historiales difieren, detener el piloto.
   No iniciar las ochenta capturas, inventar hashes comunes ni relajar el
   comparador. Proponer una decisión adicional: instrumentación mínima o revisión
   explícita del criterio de paridad del plan, con Santiago.

La alternativa de instrumentación futura necesita contrato y revisión propios:
ID opaco por turno enlazado entre canal/motor/entrega, canal derivado en servidor,
conservación de métricas agregadas observadas (incluido null), evidencia privada
del historial efectivo y control explícito de conversación para un ensayo
comparable. No publicar contenido/actor ni añadir secretos a logs. Un control
experimental no debe permitir que un cliente imponga identidad o eluda RLS.
No se implementa ni despliega esa alternativa en esta preparación; afectaría
runtime y exige otra revisión/aprobación de los despliegues que correspondan.

`config_sha256` representa solo configuración pública/no secreta confirmada:
artefactos/SHAs, motor/modelo/parámetros y settings funcionales/flags congelados.
`engine_sha256` y `config_sha256` deben permanecer iguales en las ochenta capturas,
no solo dentro de cada par. Excluir fecha, `hoy` y cortes dinámicos de configuración;
esos datos pertenecen a `data_cut_sha256`/`scope_sha256`, comparados por par. Un
cambio real exige un nuevo ensayo o decisión explícita de Santiago; no forzar una
huella constante para ocultarlo.
**Excluir tokens, contraseñas, secretos, claves de servicio y sus hashes.** No
resolver un secreto ni leer el entorno para construir esa huella. Una
configuración efectiva desconocida no se convierte en confirmada por hashear la
configuración esperada del repo.

## Protocolo de dos semanas, aún sin ejecutar

Solo después de cerrar el gate previo y obtener autorización de la campaña,
congelar fuera del repo veinte casos smoke ajenos al
held, su criterio/oráculo independiente, contexto inicial y trazabilidad. Mantener
los mismos veinte IDs durante ambas semanas. El contenido y sus hashes por caso
son privados; publicar únicamente agregados. Congelar también SHAs frontend/ambas
funciones, configuración/modelo, flags, esquema/ledger pertinente, fecha local y
ruta exacta que recorrerá el SQL (incluye compilador/RPC del candidato).

Registrar dos periodos consecutivos de siete días. Una vez por semana enviar los
veinte casos por web y Telegram: **40 pares, 80 capturas finales** en catorce días.
Recoger además los errores del uso ordinario, aparte de esos ochenta turnos;
no sustituir un fallo del smoke por otra respuesta. Alternar orden de canales;
registrar y mantener actor autorizado, texto de pregunta, historial, alcance,
versión y corte de datos. Las lecturas de canales distintos no garantizan snapshot
transaccional conjunto. Si el corte no puede verificarse, declararlo desconocido
y no afirmar paridad controlada. Las preguntas relativas necesitan fecha/oráculo
fijados; cambios de fuente no se adjudican al adaptador sin investigarlos.

Por turno guardar externamente: request/contexto y recibo de ejecución, respuesta
P2 íntegra, snapshot persistido recuperado, artefactos observados del canal,
estado final, latencia extremo a extremo, uso/coste observados y sus fuentes.
Comparar el snapshot tras reabrir sin una nueva llamada al modelo. Comparar los
CSV completos y las cifras crudas, además de previews de 50 filas web/15 Telegram.
Guardar la evidencia visual requerida: tabla larga, truncado, pie de muchas
leyendas, móvil y CSV de Telegram. Santiago debe realizar el checkpoint de uso web
antes de retirar el FAB beta; esta preparación no lo da por cumplido.

Los formatos usan `src/utils/escoSql/formato.ts`. Conservar nulos como «Sin dato»,
cero como cero, fechas de calendario, unidades, orden y avisos. Para una respuesta
válida sin bloques, `format_observations: []` indica formato no aplicable, con agregado separado y sin fabricar observaciones. Si hay bloques,
la falta de observaciones continúa desconocida y bloquea; un campo ausente no
acredita evidencia. La revisión visual manual sigue siendo un gate separado.
Las observaciones de formato suministradas provienen del artefacto real; calcular
el valor esperado con el formateador y presentarlo como observado sería una prueba circular.

## Herramienta local

[`scripts/esco-sql-p6/README.md`](../../scripts/esco-sql-p6/README.md) documenta el
contrato de captura y comandos exactos. Usa Node 20+, dependencias locales ya
instaladas, y los constructores/formateadores compartidos reales. No tiene código
de red, lector de bancos, runner de preguntas o acceso a secretos. Rechaza como
entrada una ruta dentro del repo, incluso vía symlink. Solo emite agregados con
claves/códigos cerrados; no propaga texto privado en errores.

```sh
node scripts/esco-sql-p6/sintetico.mjs > /tmp/esco-p6-inventado.json
node scripts/esco-sql-p6/comparar.mjs --input /tmp/esco-p6-inventado.json
# Código1 esperado: los costes del fixture son desconocidos, no cero.
```

El fixture inventa ochenta capturas, cuarenta pares y 160 observaciones de
formato. El comparador conserva los ochenta costes como null y bloquea aceptación,
aunque respuestas/snapshots coincidan. QA independiente ensaya además faltantes,
duplicados, cambios de valores/orden/formatos, contexto distinto, desconocidos y
privacidad de stdout/stderr. Un positivo sintético verifica la herramienta;
no agrega evidencia de aceptación real.

## Medidas y decisiones al cierre

- **Paridad:** 40/40 pares comparables, texto/bloques/sugerencias/aclaración exactos;
  ningún faltante, duplicado ni diferencia omitida. El reporte separa generaciones
  compartidas e independientes. Snapshots íntegros; revisión visual y CSV aparte.
- **Latencia:** p95 por canal menor de 25 segundos hasta terminar la entrega
  completa, con rango más próximo, denominador y cobertura explícitos. Mostrar
  errores/timeouts aparte; no calcular un p95 favorable excluyéndolos sin decirlo.
- **Coste:** uso/precio/recibo de coste observados y procedencia congelados. Total
  desconocido si falta una observación; subtotal y cobertura sí pueden mostrarse.
  No existe umbral de coste aprobado en el plan: Santiago debe aceptar la cota del
  ensayo antes de cualquier llamada pagada. Esta fase no propone un precio supuesto.
- **Errores:** separar transporte, autenticación/actor, contrato, SQL, render/archivo,
  persistencia y resultado incierto con códigos agregados. El comparador separa
  turnos fallidos de intentos SQL fallidos recuperados, con cobertura de trazas.
  No reintentar una salida incierta automáticamente. Reportar numerador/denominador y causa revisada.
- **Seguridad/capturas:** conservar gates de rol Gerencia activa, consultas, secreto,
  JWT de ambas funciones y comandos de captura. Un ensayo local positivo no
  sustituye la pasada manual de comandos en producción con Santiago.

## D6 y límites de aprobación

El plan pide dev ≥90 % y **ningún módulo por debajo del 80 %**, más una sola
corrida held en el gate. La evidencia inicial comunicada para P1 es 91,1 % global
y 66,7 % monitoreo: ese agregado histórico no cierra D6. Además, el runner previo
inyecta un ejecutor que no recorre el compilador/RPC P4; no acepta por sí solo el
candidato actual. El README advierte que ciertos seguimientos dev pueden leer
antecesores held. No ejecutar ese runner como paso de esta preparación.

Antes de solicitar la única corrida held, demostrar con un ensayo sintético que
la ruta y el scoring congelados recorren el candidato exacto, separan splits sin
antecesores held, concilian coste y producen agregados seguros. Congelar versión,
banco/dev/oráculo, rúbrica, runner y presupuesto; corregir el gate de cada módulo
sobre dev sin abrir held. Solicitar después aprobación explícita de Santiago para
la ejecución held única, con coste máximo y criterio de parada/reconciliación de
salidas inciertas. Si held falla, informar el gate fallido; no reutilizarlo para
afinar ni repetirlo silenciosamente.

El comparador deja siempre `d6_accepted: false` y `activation_authorized: false`.
Ni su código0 ni un hash coincidente autorizan flags, secretos, deploys o retirada
P7. Falta cerrar la viabilidad de captura/correlación, la autorización concreta de
activación y campaña, ejecución viva de las dos
semanas, aceptación de seguridad/capturas/visuales, D6 y aprobación final del corte.
