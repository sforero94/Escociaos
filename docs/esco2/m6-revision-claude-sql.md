# Esco 2.0 · M6 y propuesta de consulta SQL para revisión de Claude

**Decisión solicitada.** ¿Vale la pena sustituir la extracción de intención, la planificación y la comparación entre ambas por una sola traducción de la pregunta a SQL de lectura? El CTO recomienda probar esa hipótesis primero en jornales y costos. M6 sigue sin aceptar. El grafo SQL es una propuesta pendiente de medición.

## Resultados medidos

**M6 histórico.** Se registraron 234/234 turnos. Pasaron todos sus turnos en tres repeticiones 15/22 escenarios DEV y 5/50 de la reserva. Hubo tres turnos críticos. La reserva ya había sido reutilizada y adaptada parcialmente en el tiempo. El veredicto fue No-Go. [Diagnóstico histórico](https://github.com/sforero94/Escociaos/blob/c85ce43bdf5a51e5b253489931fbdd3f2b6c2ba2/docs/esco2/m6-correccion-resultado.md)

**Iteración 1 posterior a M6.** El candidato `7765ee19` llegó a evaluación con 8.644 pruebas en verde. B lo comparó con `c85ce43b` sobre DEV y un conjunto privado independiente llamado SOMBRA. La reserva final permaneció cerrada. Las dos evaluaciones usan particiones y reglas de repetición distintas, por lo que la comparación directa válida en esta iteración es entre el control y el candidato. [CI exacto](https://github.com/sforero94/Escociaos/actions/runs/42386553643/job/128445077995) · [Informe auditado](https://github.com/sforero94/Escociaos/blob/325ebd415580d3a1f0f863c1bb2cbe31aafb56c4/docs/esco2/m6-loop-i1-resultado.md)

| Métrica | DEV | SOMBRA |
|---|---:|---:|
| Control, primera repetición | 0/22 | 6/50 |
| Candidato, primera repetición | 2/22 (9,09 %) | 8/50 (16,00 %) |
| Wilson 95 % descriptivo de esa repetición | 2,53–27,81 % | 8,34–28,51 % |
| Segunda repetición del candidato, solo entre quienes pasaron la primera | 0/2 | 7/8 |
| Escenarios inestables observados | 2 | 1 |

**No-Go interno.** Las puertas exigían al menos 90 % en DEV y 95 % en SOMBRA. La puerta DEV quedó fuera de alcance en la primera repetición. Se aplicó el corte escalonado. Los siete SOMBRA que aprobaron dos veces quedaron sin certificación de tres repeticiones. Los imprescindibles de los cinco dominios fallaron en ambas particiones. Hubo cero críticos observados en esta campaña.

En SOMBRA hubo cuatro escenarios que aprobaron con ambas versiones, cuatro solo con el candidato, dos solo con el control y 40 que fallaron con ambas. La mejora neta fue de cuatro puntos porcentuales. En primera repetición, el candidato usó 2,436 llamadas por turno frente a 1,705 del control. La latencia HTTP mediana subió de 4,118 a 7,721 segundos y la p95 de 11,471 a 12,567 segundos.

La campaña costó **USD 0,33258244**, incluido el control. Se conciliaron 349/349 recibos y se revisaron manualmente los 167 turnos antes de ejecutar el chequeo automático. Hubo 98 discrepancias entre la revisión manual y ese chequeo parcial de forma y contrato. La evaluación factual dependió de las referencias SQL independientes y de la revisión de todas las afirmaciones. [Cierre de iteración 1](https://github.com/sforero94/Escociaos/pull/456)

## Hallazgos y límites de la evidencia

- **El mayor bloqueo medido ocurre antes de entregar datos.** En 57/78 turnos de la primera repetición, el candidato terminó con `error_plan`. En 23 rechazó el selector de población y en 18 encontró una discrepancia entre intención y plan. Esas dos categorías explican 41/78 turnos.
- **Hay contradicciones reproducibles en los contratos.** El esquema admite cadenas en una lista de IDs que el servidor exige que sean UUID. También anuncia selectores vacíos o combinaciones que el servidor rechaza. El esquema de análisis laboral anuncia agrupaciones que el motor analítico no admite. En un ejemplo sintético, una chapeta incompatible con la entidad puede desaparecer al normalizarse. Se desconoce qué fracción de los fallos privados resolvería corregir cada defecto.
- **Algunos rechazos protegen una obligación real.** Si se piden jornales y costo y el plan solo consulta jornales, el comparador debe rechazarlo. En el grafo nuevo hará falta otra forma de detectar esa omisión.
- **El error de gestión técnica fue medir tarde el riesgo principal.** Las pruebas con propuestas simuladas comprobaron el motor y sus guardas. La medición con el modelo real mostró con qué frecuencia una pregunta llegaba a una respuesta completa. La cifra que debe gobernar la próxima inversión es el acierto de extremo a extremo.

## Propuesta del CEO

| Paso | Comportamiento propuesto |
|---|---|
| 1. Entender pregunta y contexto | Recuperar período, filtros y población relevantes para el usuario. Conservar las identidades de un conjunto previamente seleccionado. Pedir aclaración si el antecedente es ambiguo. |
| 2. Redactar y ejecutar SQL | En una misma llamada, el modelo interpreta la pregunta y produce SQL parametrizado. Recibe un catálogo pequeño de relaciones, métricas, unidades, fechas de negocio y vínculos permitidos. El servidor valida la consulta y PostgreSQL calcula con los permisos efectivos del usuario. |
| 3. Obtener JSON | Devolver filas, unidades, período, población y cobertura. Distinguir valores ausentes, grupos sin lote y resultados truncados. Para responder basta con conservar el JSON temporalmente en la sesión. |
| 4. Redactar la respuesta | Una plantilla puede presentar totales y desgloses. Cuando haga falta una explicación, el redactor utiliza exclusivamente las cifras y advertencias del resultado. |

**Ejemplo.** Ante «¿Cuántos jornales hubo por lote en octubre de 2026?», el SQL debe sumar el valor numérico de `fraccion_jornal`, filtrar por `fecha_trabajo`, agrupar por lote y conservar el grupo sin lote. Contar filas puede producir una cifra distinta. Ante «¿y en septiembre?», cambia el período y se conservan la métrica, la agrupación y el alcance del usuario.

**Condiciones de viabilidad.** El diseño elimina la doble interpretación y abre un nuevo punto de ejecución que exige controles propios. Habría que analizar la sentencia y admitir una sola consulta de lectura con relaciones, columnas, uniones y funciones autorizadas. PostgreSQL debería aplicar privilegios mínimos, identidad del usuario y RLS efectiva, también a través de las vistas. El servidor limitaría tiempo, filas y volumen. Parametrizar los valores cubre solo una parte de esa protección. El principal riesgo funcional seguiría siendo una consulta válida que elige la métrica, la fecha, el denominador o la población equivocados.

## Experimento propuesto

El CTO propone un bloque acotado a una familia básica de jornales y costos. Fijar preguntas, respuestas SQL independientes y criterios antes de ejecutar. Incluir fracciones de jornal, registros sin lote, datos ausentes, un seguimiento que cambie solo el período y un control de visibilidad. Comparar el recorrido actual y el prototipo con el mismo modelo, usuario, corte y preguntas.

El criterio para ampliar el prototipo sería que **todas las preguntas de esa familia pasen todos sus turnos en tres repeticiones**, con cifras completas y alcance correcto. Medir también llamadas, latencia y gasto real. El CTO propuso un día como límite de inversión para el diagnóstico. Si falla, identificar la causa reproducible y decidir entre corregir, simplificar o detener. Un resultado favorable justificaría probar el siguiente dominio. La aceptación M6 conserva sus puertas independientes. [Protocolo de evaluación](https://github.com/sforero94/Escociaos/blob/7765ee19f77d8be7a8ae712de6e3b009b94ff95f/docs/esco2/m6-loop-protocolo.md)

## Preguntas para Claude

1. ¿Qué obligaciones del grafo actual deben conservarse y dónde debería verificarse cada una en el recorrido SQL?
2. ¿Qué consulta incorrecta podría pasar el validador y devolver una cifra plausible? Da un ejemplo que el experimento deba detectar.
3. ¿Qué controles concretos impedirían acceso fuera de alcance, funciones con efectos y consultas excesivamente costosas, incluso a través de vistas?
4. ¿Recomiendas SQL generado directamente o una intención pequeña compilada a SQL de forma determinista? Propón el experimento más barato que permitiría elegir y el resultado que te haría abandonar cada opción.
