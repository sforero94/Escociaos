# P4-6: integración y regresión

Fecha de trabajo: 2026-11-05 (Nueva York; ejecución UTC del 6 de noviembre).
Entrega sobre P4-5 `d8aea9d`, según el contrato P4 y la continuación de M5
completo solicitada por Santiago. Los seis PR se apilan para revisar el conjunto;
Codex no fusiona ni despliega. La campaña medirá el SHA integrado y su grafo de
runtime, aunque todavía no esté fusionado.

## Cambios

La cita atribuida a la solicitud conserva números, fechas y nombres de lote.
Continúa escapando Markdown y ocultando UUID. La cita no constituye evidencia
factual. El aviso de respuesta parcial se refiere únicamente a las partes
sustentadas, sin introducir costos cuando la pregunta corresponde a otro dominio.
Ninguna de estas dos reparaciones cambia cifras, operaciones ni disposiciones.

La auditoría independiente reprodujo además dos defectos de integración. Una
parte con una ficha parcial y un homónimo podía combinar disposición `aclarar`
y una marca `parcial` incompatible con su contrato. Ahora la marca se limita a
`fuente_no_disponible`, conservando los dos resultados y la aclaración. Por otra
parte, observaciones climáticas finitas podían desbordar al convertir energía o
sumar. Se comprueba finitud después del cálculo existente: el derivado queda NULL,
con causa explícita y cobertura parcial; permanecen los registros originales,
las variables válidas y sus valores. Un subtotal NULL no se divide para producir
un cero falso. No se reescribe el motor climático.

## QA independiente y RED

Los oráculos de redacción se congelaron antes del parche: **6 fallos y 1 control
aprobado**. La auditoría congeló otros **5 fallos**: tres de finitud climática y
dos de cobertura, incluidos recorridos HTTP con PostgreSQL/JWT/RLS sintéticos.
Ambos RED fueron repetidos por el coordinador. Los mismos archivos, sin cambiar
expectativas, pasan después de reparar el runtime.

La regresión independiente final reúne **48/48 pruebas**. Incluye cuatro
operaciones simultáneas de ficha, pesajes, quincenas y clima; cinco fallos de
fuente aislados; conservación de los otros resultados; seguimiento D26; Gerencia
activa frente a Administrador; rechazo de herramientas fuera del registro;
límites de llamadas; ausencia de UUID no solicitado; y grafo edge. Los catorce
controles finales se añadieron como regresión sobre el runtime ya reparado: no
se presentan como RED previo.

El grafo transitivo real desde `esco-consultas/index.ts` tiene **65 módulos**;
cada dependencia local está vigilada por detección de deriva, usa imports
compatibles con edge y queda fuera de captura, UI y servidores legados. Se
mantienen `verify_jwt = true` y propagación del JWT con cliente anónimo.
Las pruebas locales de permisos no acreditan políticas productivas.

Cuatro archivos anteriores de pruebas exigían el texto de costo universal o
ocultar todos los números de las citas. Se actualizan únicamente esas
expectativas al requisito aprobado. Conservan las verificaciones de cifras,
estado, disposiciones, seguimiento y rechazo de alteraciones; las nuevas
aserciones separan cita atribuida y cuerpo factual, comprueban ausencia del
número en resultados y mantienen UUID oculto. Originales y diferencias se
preservan fuera de Git para revisión independiente. No son cambios del oráculo
de la campaña M5, que todavía no ha sido congelado ni pagado.

## Verificación del coordinador

| Control | Resultado |
| --- | --- |
| Suite global final, dos workers | 8.393/8.393; 387 archivos |
| QA independiente de integración | 48/48; oráculos congelados intactos |
| Cuatro archivos anteriores de redacción/cita | 56/56; mantenimiento revisado por otro agente |
| Auditoría independiente adicional de fronteras | 15/15; semántica de leche 4/4 |
| Detector de deriva | 47/47 |
| Typecheck y build | Aprobados |
| Lint | 0 errores, 907 avisos existentes |
| Diff de espacios | Limpio |

El SHA y CI `verificacion` exactos se consignan en el PR, sin alterar el runtime
para añadir el resultado. Los recibos completos quedan privados.
Una primera ejecución global observó diez expectativas de redacción anteriores
y un timeout de 5 segundos en una prueba de Telegram bajo carga concurrente.
Telegram permanece intacto; se repite la suite con dos workers, sin esa carga.
No se omiten pruebas ni se aumenta su timeout.

Gasto de modelos de implementación: **USD 0**. No hay held-out, deploy,
migraciones, cambios de secretos, escrituras productivas ni RPC climática.
La campaña de desarrollo y su QA manual en otra sesión se informarán por
separado en el cierre agregado de M5; estas pruebas no aceptan M5 por sí solas.

## Corrección M5, ciclo 1 · 2026-11-06

Sobre la base integrada `a593485`, se corrige un seguimiento cuyo reintento podía
volver al inventario y al intervalo del turno anterior. El historial continúa
disponible para completar entidades y elipsis, pero el inventario de una nueva
consulta debe citar al menos un fragmento del mensaje actual. El reintento pide
inequívocamente ese último mensaje y conserva sus cambios explícitos de alcance.
Las elecciones D26 siguen validándose contra el plan y la pregunta guardados por
el servidor; no reciben autoridad del historial del cliente.

Una guarda contrasta los extremos ISO de un intervalo explícito citado del
mensaje actual con su única operación de calendario vinculada. Reconoce una
gramática cerrada: `desde X hasta Y`, `del X al Y` y un marcador
`período`, `intervalo` o `rango` con conectores de intervalo y dos fechas ISO.
Requiere exactamente dos fechas válidas y ordenadas en esa parte. Rechaza el
desajuste sin corregir fechas ni inventar argumentos, también cuando omitir
fechas opcionales ampliaría la ejecución a vida completa. Dos fechas aisladas
que describen hechos no activan la guarda. La selección explícita de ronda por
ID, nombre o selección registrada conserva la ronda completa, sin convertir
fechas de observación en filtros por inicio de ronda. Hato y faltantes no reciben
un filtro temporal nuevo. Varias operaciones vinculadas pueden comparar días
puntuales sin imponerles un intervalo común; las quincenas abiertas conservan
su final canónico.

También se alinean las instrucciones con capacidades existentes: conservar
AM/PM y NULL o pedir no proyectar son condiciones de la consulta admitida;
la distribución CE por bandas, porcentajes y medias disponibles por árbol
pertenece a su operación nativa. La instrucción de agrupar distribución por lote
queda acotada a labores y la descripción de la portadora de fuera de alcance
coincide con el contrato de cobertura. No se añade un clasificador semántico de
texto libre ni se cambia aritmética, fuentes o motores. Se conserva el permiso
de citar el mismo fragmento amplio para obligaciones sustentadas y excluidas
distintas.

QA congeló seis pruebas nuevas de seguimiento antes del parche: **3 RED y
3 controles aprobados**, con contraste SQL independiente. Durante la revisión
se congelaron siete controles adicionales antes de acotar la guarda:
**3 RED y 4 aprobados**, que separan fechas descriptivas, rondas explícitas e
intervalos de las tres formas admitidas. El backend reprodujo ambos RED antes
de sus respectivos parches y añadió un RED de intervalo opcional omitido.
Los positivos de conservación de NULL, turnos, ausencia de proyección y
distribución CE usan planes sintéticos: acreditan ejecución y cobertura,
sin atribuir éxito semántico al modelo. Dos controles adicionales de ronda con
conectores explícitos son positivos posteriores al parche, sin alegar RED previo.

La corrección de una anotación TypeScript en dos resultados SQL de QA conserva
SQL, cifras y expectativas; queda documentada con hashes anteriores y posteriores
fuera de Git. QA independiente confirma **19/19 pruebas nuevas** y, junto con
regresión D26 y multidominio, **51/51**. Los **195 archivos originales**
contrastados conservan sus hashes. Los once controles del backend completan
treinta pruebas nuevas y la regresión acotada final pasa **282/282**.

La primera suite global de esta corrección aprobó **8.420/8.423**: tres pruebas
anteriores de pesajes usaban un helper con una pregunta fija de cinco días y
argumentos de un solo día. La nueva guarda rechaza esa contradicción. El
mantenimiento autorizado alinea únicamente el texto sintético de pregunta y
cobertura con el intervalo que cada caso ya enviaba; conserva datos, SQL,
cifras y aserciones. No se flexibiliza la guarda para aceptar el desajuste.
QA repitió **37/37** controles afectados y una revisión independiente confirmó
el delta exacto del helper y la identidad de todos los bytes fuera de él.
Después se repitió la suite global por este cambio nuevo, con dos workers y sin
otras pruebas simultáneas.

| Verificación final de la corrección | Resultado |
| --- | --- |
| Suite global final, dos workers | 8.423/8.423; 392 archivos |
| Regresión acotada del backend | 282/282 |
| QA independiente nueva y regresión D26/multidominio | 51/51 |
| Helper anterior y treinta controles nuevos | 37/37; revisión independiente del mantenimiento |
| Detector de deriva y grafo edge | 47/47; 65 módulos vigilados |
| Typecheck y build | Aprobados |
| Lint completo | 0 errores, 907 avisos existentes |
| Lint de cambios y helper | 0 errores, 0 avisos |
| Hashes QA congelados y diff de espacios | Coinciden; limpio |

La cita actual no certifica extracción exhaustiva de intención. Las formas de
período ambiguas o no reconocidas, las anclas omitidas en la cita y la
clasificación libre de obligaciones siguen dependiendo del planificador y de
QA independiente. El defecto de clasificación observado en campaña y revisión
manual conserva su evidencia privada. La mejora semántica de Luna y el cierre
M5 esperan otro ciclo congelado con revisión manual ciega; no se declaran
aprobados mediante estos planes sintéticos ni mediante literales del prompt.
Esta implementación no llama modelos: gasto incremental **USD 0**. No hay push,
deploy, cambios productivos ni acceso a held-out.
