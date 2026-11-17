# P6 — preparación local y protocolo de observación

Fecha: 2026-11-09. Alcance: historial/recibo compartidos, comparador offline y QA sintética separados.
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
abierta hasta revisión privada y resolución explícita. El comparador consume capturas externas; el runtime local ahora emite el vínculo
que deberá verificarse después de su liberación aprobada.
Una puerta de replay alojada requeriría revisión y autorización propias.

## Historial y coste: implementación local, pendiente de liberación

El PR #478 incorpora el [contrato de turno](esco-sql-p6-contrato-turno.md), con
implementación web/Telegram y QA separado sobre handlers reales y servicios
sintéticos. No acredita disponibilidad productiva ni inicia las dos semanas.

| Punto resuelto localmente | Contrato |
|---|---|
| Historial comparable | Helper puro común; filas SQL de ambos roles filtradas antes de limitar a diez; orden created_at/id; prosa y consultas completas acotadas a 4.000 unidades UTF-16. Excluye legacy, pending y error. |
| Conversación | Web usa fuente persistida y propietario comprobado. Telegram mantiene autoridad SQL separada de capturas y del selector legacy; `/esco_nueva` crea contexto vacío sin borrar mensajes. Un turno tardío no restaura el contexto anterior. |
| Identidad de turno | UUID generado por el motor después del acceso, canal derivado de la puerta autenticada y SHA-256 del historial efectivo normalizado. |
| Coste | Recibo por request conservado en JSON/SSE, cliente y snapshot; log terminal enlazado por UUID/canal. Completo, parcial y desconocido mantienen sus diferencias; null nunca se convierte en cero. |
| Persistencia incierta | Conserva recibo/identidad para conciliación y no repite el modelo ni una escritura posiblemente confirmada. Los errores no entran al historial SQL. |
| Comparación | Captura v2 exige respuesta/snapshot/log/uso/identidad coherentes. El esquema v1 conserva utilidad offline y nunca acredita protocolo vivo P6. |

La huella corresponde al array exacto `{rol,texto}` que recibe el motor. Vive en el
recibo privado; no se registra en logs públicos. Para nuevos seguimientos, dos
respuestas diferentes pueden producir historiales diferentes: el código no fuerza
igualdad ni fabrica un contexto vacío. El comparador conserva ese gate.

Antes de cualquier piloto se requieren candidatos congelados y aprobaciones para
publicar frontend, esco-consultas y make-server. La autorización anterior de P5 no
cubre este runtime. No requiere migración ni secreto nuevo; usa metadata existente.
Después se debe verificar el gateway, autorización, snapshots y entrega alojados,
así como los recursos del servidor completo del nuevo candidato. La prueba de
recursos P5 corresponde a su SHA anterior y no certifica P6.

Un piloto previo de un par/dos llamadas necesita autorización, presupuesto concreto,
captura privada y exposición acotada o aceptación explícita del alcance global de
los flags. Detenerse si actor, historial, corte, configuración, coste o entrega no
pueden verificarse; no iniciar las ochenta capturas. No adjudicar costes por hora
aproximada, rebajar comparabilidad o reintentar una salida incierta.

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

## Verificación local del candidato

Coordinador: 445 archivos y 9.129 pruebas pasan con Node20.20.2; typecheck completo
verde y lint con cero errores/873 avisos existentes. QA independiente añade 77
pruebas de P6; conserva además 120 regresiones P5/legacy. Se actualizaron las
expectativas previas de SSE para reconocer el evento inicial de turno, manteniendo
orden, cancelación, actor y ausencia de contenido privado. Los nueve archivos del
bot modificados/nuevos se mantienen idénticos entre ambos árboles.

Los builds legacy y SQL pasan en copia externa sin `.env`, con credenciales
ficticias; sus fuentes utils/components coinciden con el candidato. No se promueven.
El comparador tiene chequeo TypeScript estricto propio. Los grafos congelados de
ambas funciones y ambos árboles resuelven; los módulos Telegram SQL aislados pasan
Deno2.1.4. **El chequeo Deno del bot completo no está verde:** baseline53,
candidato54, con un TS2589 adicional de expansión estructural señalado en una
llamada legacy sin cambios. Los adaptadores SQL tienen puertos explícitos y no usan
`any` para ocultarlo. No se atribuye el diagnóstico adicional al baseline. Resolver
ese diferencial antes de proponer el candidato para despliegue; estas pruebas no
certifican recursos del servidor completo P6 ni aceptación alojada.

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
P7. Faltan liberar y verificar la captura/correlación alojadas, aprobar
activación y campaña, ejecutar las dos
semanas, aceptación de seguridad/capturas/visuales, D6 y aprobación final del corte.
