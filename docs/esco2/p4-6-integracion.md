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
