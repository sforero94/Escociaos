# Corrección estructural M6: criterios y evidencia QA

Base aceptada: `30deebcd935b9d34c9a13182449435b875e7772f`.
Este documento describe QA de implementación; no es aceptación independiente M6.
Solo controles sintéticos y DEV autorizado. Sin inferencia pagada ni held-out.

## Criterios previos a implementación

1. Dada una solicitud con dos obligaciones, cuando el plan omite una, entonces
   el sistema conserva esa obligación pendiente y no certifica la solicitud completa.
2. Dada una condición de población, entidad, período, base temporal, métrica o
   agrupación, cuando solo cambia esa condición del plan, entonces el comparador
   impide marcar la obligación original como respondida. El positivo produce datos.
3. Dado un filtro que excluye registros sin lote, cuando concilia el subconjunto,
   entonces la respuesta identifica ese universo y no acredita cero en los excluidos.
4. Dada una selección visible que alimenta otra consulta, cuando ejecuta la
   dependencia, entonces consume exactamente los IDs seleccionados y conserva NULL.
5. Dadas identidades homónimas o chapetas repetidas, cuando selecciona población,
   entonces ninguna etiqueta ni actividad resuelve una identidad ambigua.
6. Dada una medida NULL, vínculo invisible o lectura fallida, cuando presenta la
   medida, entonces conserva ese estado y nunca lo sustituye por vacío verificado.
7. Dado un detalle limitado, cuando presenta filas, entonces declara límite y total
   con su universo; no describe el prefijo como lista exhaustiva.
8. Dada una respuesta HTTP propia extensa, cuando el cliente la reenvía sin cambios
   como historial assistant, entonces el siguiente turno no falla con 400 por tamaño.
9. Dada una variante anunciada por el esquema, cuando cumple sus precondiciones,
   entonces el validador la acepta; las incompatibilidades quedan explícitas.
10. Dados importes fraccionarios, cuando presenta detalle y total, entonces ambos
    conservan la base exacta D43 y la respuesta distingue cualquier redondeo visual.

## Diseño de refutación

El oráculo usa filas sintéticas y resultados literales o SQL directo, nunca un
resultado anterior del ejecutor. Las mutaciones cambian una sola frontera cada vez:
población, omisión, período, base temporal, vínculo, identidad, NULL, unidad,
truncamiento y transporte. Los positivos exigen cifras sustantivas.

La integración usa el manejador HTTP real, los lectores reales, Postgres PGlite
con JWT/RLS sintéticos y un proveedor simulado. La red queda prohibida.
Los planes prefijados prueban cumplimiento y transporte; no exactitud del
planificador real. La separación de extracción y plan tampoco certifica por sí
sola exhaustividad semántica del lenguaje natural.

## Resultados

Repetición QA del 6 de noviembre de 2026, 21:02 America/New_York:
**90/90 pruebas en diez archivos**. El coordinador debe repetirlas sobre el SHA exacto
de entrega. El lint de los archivos QA no presentó errores ni advertencias de reglas.

| Integración QA | Pruebas | Estado comprobado |
|---|---:|---|
| Intención previa, mutaciones, residuales y detalle | 13 | GREEN después de RED discriminante |
| Población, identidad, NULL y reproducción | 7 | GREEN después de RED discriminante |
| Precisión monetaria y conciliación D43 | 4 | GREEN después de RED discriminante, incluida la cadena cantidad→costo |
| Analítica con fuente SQL independiente | 11 | GREEN después de RED de integración |
| Composición, vacío y vínculo obligación/operación | 9 | GREEN después de refutación del vacío válido |
| Conformidad del ranking anunciado | 7 | GREEN; RED unitario pertenece a backend |
| Transporte, contexto, Unicode y cotas | 9 | GREEN después de RED discriminante |
| Seguimiento obligatorio, D26, dueño y vencimiento | 5 | GREEN después de RED discriminante |
| Transformaciones de intención y medidas relevantes | 21 | GREEN después de RED discriminante |
| Última observación de monitoreo y límite previo | 4 | GREEN después de RED de observación frente a placeholder |

Las tres fallas corregidas de seguimiento fueron: elección de fecha que no refina el contrato
temporal; un nuevo período explícito ignorado mientras existe una aclaración
pendiente; y HTTP 500 al elegir tareas en D26. No son errores del proveedor simulado.
El coordinador y backend recibieron reproducciones ejecutables; la repetición QA dio 5/5.

Las refutaciones adicionales encontraron dos fronteras corregidas: un detalle
exhaustivo limitado aún marcado respondido y un residual presente en JSON pero
ausente de la respuesta visible. Ambas conservan controles sustantivos de cifras.
La prueba de composición demuestra también que `o2` puede corresponder a `p3`:
dos operaciones anteriores pertenecen a la misma obligación. No equipara índices.

La QA corrigió tres errores propios de preparación antes del cierre de sus oráculos:
`costo_jornal` ya representa el costo guardado de la fila, no una tarifa por multiplicar;
y la categoría del fixture es un enum SQL, por lo cual la colisión D26 se crea mediante
nombres sintéticos de tarea compatibles con una categoría válida. Además, la incidencia
`20/120 × 100` y `100/6` difieren por orden de operaciones IEEE-754; el control independiente
usa una tolerancia explícita de cuatro épsilon por magnitud, sin alterar el motor compartido.
Esas correcciones
no alteraron referencias DEV, rúbrica, runtime ni resultados históricos.

Los controles de transformaciones fijan última lectura, comparación orientada y ranking
antes del plan. Omitir, agregar o cambiar esos requisitos produce rechazo. Los positivos
exigen cifras, unidad física válida y detalle completo del ranking seleccionado, incluidos
empates en el corte. Una métrica CE conocida sigue respondida si el pH NULL es ajeno a
la solicitud; pedir ese mismo pH conserva medidas parciales y fuente no disponible.

Monitoreo distingue una observación anterior real de un placeholder posterior no revisado;
conserva una observación posterior real no calculable y las combinaciones jamás observadas.
El control de 31 rondas verifica que la selección de última lectura ocurra antes del límite
de treinta filas. Este último control ya encontró aplicado el parche al ejecutarse y no
se presenta como una reproducción RED adicional.

La última refutación D43 detectó pérdida de precisión al sumar cantidades antes de valorar:
el costo ya no redondeaba, pero una etapa anterior mantenía doce dígitos significativos.
El oráculo SQL independiente y el control HTTP pasaron después de retirar esa pérdida.
Esto conserva la base numérica representada por las entradas del runtime; no acredita
precisión decimal original más allá de su representación numérica.

Reproducción QA: `npm test -- src/__tests__/esco2M6Qa*.test.ts`.
Los controles usan únicamente fuentes sintéticas publicables y red prohibida.

## Replay privado de desarrollo sin modelos

Un runner privado versionado reproduce 72 slots de 22 escenarios DEV usando
exclusivamente los recibos históricos del proveedor y las cinco capturas autorizadas.
El manejador HTTP y los lectores son reales; el adaptador de captura no demuestra
JWT/RLS productivo. Conserva cobertura obligatoria e intención legado explícita:
no fabrica una extracción previa a partir de referencias o expectativas evaluadoras.

En el baseline exacto, los 72 slots responden HTTP 200, sin excepciones: 69 resultados
y 69 coberturas coinciden estructuralmente con el histórico; 66 textos son iguales.
Las diferencias restantes incluyen tokens opacos que el replay no recrea. En la
repetición final de implementación, también 72/72 responden HTTP 200, sin excepciones:
63 resultados, 69 coberturas y 60 textos son iguales al histórico. La diferencia
adicional de resultados proviene de precisión monetaria y evidencia de población.
Se conservaron los originales y las ejecuciones completas en privado. El grafo de
70 archivos del runtime de esta repetición tiene SHA-256
`257fa219d1f5051fd18abee5ff28051eecfd9de61f1fe1437af079140cc513c4`;
el runner, `b2899804b5320fedd8d03394ce604d4f3101f927579da5ad8668fca094c0b573`.

Estos números miden identidad de replay, **no acierto factual**. No constituyen una
nueva tasa del planificador, extracción de intención, campaña ni aceptación M6.
El gasto y las inferencias nuevos son cero. El runner registra huellas de entradas,
manifiesto, código del runner y grafo de runtime. El coordinador debe repetirlo tras
cualquier cambio posterior. No se cambió ninguna referencia ni se recalificó la campaña.
