# P2: mensajes de labores en español

2026-11-04. Añadido de presentación autorizado sobre P2-A. Ejemplos sintéticos; ninguna salida proviene de datos reales o de evaluación reservada.

Cada respuesta abre con las cifras principales y el período efectivo. En consultas con varias partes, cada parte lleva su título y su respuesta en el orden original. Los nombres, cifras, unidades y períodos salen de los resultados calculados. El mensaje omite identificadores internos, códigos y nombres de campos; los diagnósticos estructurados los conservan. No hay composición factual de un modelo.

Los millones no tienen decimales y dicen «aprox.» cuando se redondean. También se señala el redondeo de pesos fraccionarios. Los jornales y las razones conservan su precisión; un valor pequeño distinto de cero no se convierte en un cero exacto.

## API y frontera de validación

- `renderMensaje(resultados, aviso?)` y `validarMensajeFinal(texto, resultados, aviso?)` en `src/utils/esco2/mensajes.ts`. El aviso opcional admite únicamente los dos valores cerrados `contexto_no_disponible` y `contexto_demasiado_amplio`. Un texto u objeto arbitrario se rechaza.
- Las aclaraciones van dentro de `ResultadoParte.aclaracion`: tipo cerrado, categoría verificada y nombres reales de las tareas ofrecidas. No se anexa una pregunta libre del planificador o del historial. Un seguimiento pendiente reconstruye el mismo resultado tipado.
- `renderDeterminista` conserva su punto de entrada y delega al renderer nuevo. El handler vuelve a construir y validar el texto factual final, incluido el aviso operativo cuando corresponda. Las disposiciones sin resultados y los avisos operativos solo combinan plantillas de enumeraciones cerradas. Un contexto vencido no elimina la explicación de la capacidad actual.
- El validador compara el texto completo con su regeneración canónica. Esto protege su vínculo con los resultados; no certifica la interpretación de lenguaje ni demuestra por sí solo la aritmética. QA comprueba independientemente entidad, métrica, unidad, período y todos los números de sus salidas representativas, además de libros literales completos para los trece estados.

Los formatters puros compartidos están en `src/utils/formatPuro.ts`; `src/utils/format.ts` conserva sus exportaciones y valores predeterminados. Solo este renderer pide millones con cero decimales y fechas largas de Bogotá.

## Antes y después por estado

Los tres ejemplos indicados como capturados se ejecutaron con el renderer anterior y están registrados por QA. Los otros diez «Antes» son fragmentos reconstruidos de la plantilla anterior, no salidas históricas registradas. Todos los «Después» se generaron ejecutando el renderer nuevo con los mismos objetos sintéticos de `src/__tests__/esco2MensajesFixtures.ts`.

SHA-256 actual del fixture de trece estados: `da87f3f57c27c38efd3643161e9153844fa17f2af88be93db7d1b0194a4b1ed8`. El fixture inicial de diez estados se fijó antes de ejecutar el renderer; QA registra su huella anterior y las revisiones de redacción y contrato exigidas durante la revisión. No cambiaron sus valores aritméticos para acomodar la implementación.

### no-resuelto

Un nombre ambiguo ofrece sugerencias legibles sin seleccionar una entidad.

Antes (patrón reconstruido del código anterior, no salida histórica registrada):

```text
**Labores registradas** (2026-10-26 a 2026-11-01): no encontré en el sistema «Vega». Opciones: Norte, Sur.
```

Después (ejecución actual del mismo fixture):

```text
No pude identificar el lote que quieres consultar. ¿Te refieres a Norte o Sur?
```

### cero-conocido

Un costo cero registrado conserva el trabajo conocido.

Antes (patrón reconstruido del código anterior, no salida histórica registrada):

```text
**Labores registradas** (2026-10-26 a 2026-11-01; fecha: trabajo): 1 jornales registrados, $0.
```

Después (ejecución actual del mismo fixture):

```text
Se registró 1 jornal; costo de mano de obra: $0.
Del 26 de octubre de 2026 al 1 de noviembre de 2026, ambas fechas incluidas.
Se consultaron las labores que puedes ver.
Se incluyen registros sin lote.
No verifiqué que las tareas y sus aplicaciones correspondan al mismo momento.
```

### vacio-programado

Vacío programado es ausencia registrada y visible, no dato desconocido.

Antes (patrón reconstruido del código anterior, no salida histórica registrada):

```text
**Tareas programadas** (2026-10-26 a 2026-11-01; fecha: inicio estimado): 0 tarea(s) con inicio estimado en el período; asignación registrada actual, sin afirmar estado histórico.
```

Después (ejecución actual del mismo fixture):

```text
No hay tareas programadas registradas con inicio planeado en el período consultado entre las que puedes ver.
Del 26 de octubre de 2026 al 1 de noviembre de 2026, ambas fechas incluidas.
Se consultaron las labores que puedes ver.
Se incluyen tareas sin lote asignado.
Los estados y las asignaciones son los que están registrados ahora; no describen cómo estaban en una fecha pasada.
No verifiqué que las tareas y sus aplicaciones correspondan al mismo momento.
```

### conocido

Trabajo y costo conocidos aparecen con su entidad y período inclusivo.

Antes (fragmento capturado por QA):

```text
**Labores registradas** (2026-10-26 a 2026-11-01; fecha: trabajo): 4,5 jornales registrados, $95.000.000.
- Cosecha [task-cosecha]: 2 jornales registrados, $40.000.000
- Poda [task-poda]: 2,5 jornales registrados, $55.000.000
```

Después (ejecución actual del mismo fixture):

```text
Se registraron 4,5 jornales; costo de mano de obra: $95M.
Del 26 de octubre de 2026 al 1 de noviembre de 2026, ambas fechas incluidas.
- Cosecha: 2 jornales registrados; costo de mano de obra: $40M.
- Poda: 2,5 jornales registrados; costo de mano de obra: $55M.
Se consultaron las labores que puedes ver.
Se incluyen registros sin lote.
No verifiqué que las tareas y sus aplicaciones correspondan al mismo momento.
```

### vacio-visible

Vacío verificado se limita al usuario y período.

Antes (patrón reconstruido del código anterior, no salida histórica registrada):

```text
**Labores registradas** (2026-10-26 a 2026-11-01; fecha: trabajo): no hay registros de trabajo en ese alcance; 0 jornales registrados, $0.
```

Después (ejecución actual del mismo fixture):

```text
No hay registros de trabajo en el período consultado.
Se registraron 0 jornales; costo de mano de obra: $0.
Del 26 de octubre de 2026 al 1 de noviembre de 2026, ambas fechas incluidas.
Se consultaron las labores que puedes ver.
Se incluyen registros sin lote.
No verifiqué que las tareas y sus aplicaciones correspondan al mismo momento.
```

### costo-null

NULL no se convierte en costo cero.

Antes (fragmento capturado por QA):

```text
**Labores registradas** (2026-10-26 a 2026-11-01; fecha: trabajo): 4,5 jornales registrados, sin dato.
```

Después (ejecución actual del mismo fixture):

```text
Se registraron 4,5 jornales.
Del 26 de octubre de 2026 al 1 de noviembre de 2026, ambas fechas incluidas.
El costo no está completo: hay registros sin costo registrado.
Se consultaron las labores que puedes ver.
Se incluyen registros sin lote.
No verifiqué que las tareas y sus aplicaciones correspondan al mismo momento.
```

### fuente-no-disponible

La fuente faltante tiene una razón legible y ningún cero.

Antes (fragmento capturado por QA):

```text
**Labores registradas** (2026-10-26 a 2026-11-01; fecha: trabajo): fuente no disponible (campo_registro_no_disponible).
```

Después (ejecución actual del mismo fixture):

```text
No tengo ese dato: no pude leer los datos de los registros de trabajo necesarios para responder.
Del 26 de octubre de 2026 al 1 de noviembre de 2026, ambas fechas incluidas.
```

### no-soportado

Una capacidad no implementada se declara sin datos inventados.

Antes (patrón reconstruido del código anterior, no salida histórica registrada):

```text
**Labores registradas** (2026-10-26 a 2026-11-01; fecha: trabajo): fuente no disponible (valoracion_aplicaciones_no_soportada).
```

Después (ejecución actual del mismo fixture):

```text
Esa consulta todavía no está disponible. Por ahora puedo responder sobre labores registradas y tareas programadas.
```

### aclaracion

Una sola pregunta ofrece dos elecciones concretas.

Antes (patrón reconstruido del código anterior, no salida histórica registrada):

```text
**Labores registradas** (2026-10-26 a 2026-11-01; fecha: trabajo): aclaración pendiente para esta parte.
```

Después (ejecución actual del mismo fixture):

```text
¿Quieres consultar la tarea «Cosecha puntual» o toda la categoría «Cosecha»?
```

### estimados-parciales

Subtotal conocido, plan completo, NULL y no leído se distinguen.

Antes (patrón reconstruido del código anterior, no salida histórica registrada):

```text
Jornales estimados (subtotal conocido) de esas tareas (plan completo, no solo el período): 5; 1 tarea(s) sin estimado.
1 tarea(s) con estimado no disponible: la fuente no permitió leerlo.
```

Después (ejecución actual del mismo fixture):

```text
Se registraron 4,5 jornales; costo de mano de obra: $95M.
Del 26 de octubre de 2026 al 1 de noviembre de 2026, ambas fechas incluidas.
Jornales estimados para el plan completo de esas tareas: 5.
Es un subtotal conocido: 1 tarea no tiene estimado y el estimado de 1 tarea no se pudo leer.
Es el plan completo de las tareas; no corresponde solo al período consultado.
Se consultaron las labores que puedes ver.
Se incluyen registros sin lote.
No verifiqué que las tareas y sus aplicaciones correspondan al mismo momento.
```

### asociaciones

Se conservan los miembros correctos sin códigos ni IDs.

Antes (patrón reconstruido del código anterior, no salida histórica registrada):

```text
- Cosecha [task-cosecha]: 4,5 jornales registrados, $95.000.000; aplicaciones Abono [application-a] código CODE-001; estado Cerrada, Riego [application-b] código CODE-002; estado Abierta
```

Después (ejecución actual del mismo fixture):

```text
Se registraron 4,5 jornales; costo de mano de obra: $95M.
Del 26 de octubre de 2026 al 1 de noviembre de 2026, ambas fechas incluidas.
- Cosecha: 4,5 jornales registrados; costo de mano de obra: $95M.
Aplicaciones asociadas a Cosecha: Abono y Riego.
Estados actuales registrados de esas aplicaciones: Abono: Cerrada; Riego: Abierta.
Se consultaron las labores que puedes ver.
Se incluyen registros sin lote.
No verifiqué que las tareas y sus aplicaciones correspondan al mismo momento.
```

### asociacion-desconocida

La relación no leída no es un conjunto vacío.

Antes (patrón reconstruido del código anterior, no salida histórica registrada):

```text
- Cosecha [task-cosecha]: 4,5 jornales registrados, $95.000.000; asociaciones no disponibles; campos no disponibles: asociaciones
```

Después (ejecución actual del mismo fixture):

```text
Se registraron 4,5 jornales; costo de mano de obra: $95M.
Del 26 de octubre de 2026 al 1 de noviembre de 2026, ambas fechas incluidas.
- Cosecha: 4,5 jornales registrados; costo de mano de obra: $95M.
No pude comprobar las aplicaciones asociadas a Cosecha porque esos datos no están disponibles.
Se consultaron las labores que puedes ver.
Se incluyen registros sin lote.
No verifiqué que las tareas y sus aplicaciones correspondan al mismo momento.
```

### asociacion-vacia

Ausencia verificada solo en el alcance visible.

Antes (patrón reconstruido del código anterior, no salida histórica registrada):

```text
- Cosecha [task-cosecha]: 4,5 jornales registrados, $95.000.000; sin aplicación asociada (vacío verificado)
```

Después (ejecución actual del mismo fixture):

```text
Se registraron 4,5 jornales; costo de mano de obra: $95M.
Del 26 de octubre de 2026 al 1 de noviembre de 2026, ambas fechas incluidas.
- Cosecha: 4,5 jornales registrados; costo de mano de obra: $95M.
Cosecha no tiene aplicaciones asociadas entre las que puedes ver.
Se consultaron las labores que puedes ver.
Se incluyen registros sin lote.
No verifiqué que las tareas y sus aplicaciones correspondan al mismo momento.
```

## Tabla, ranking y conciliación

Estas son ejecuciones de los fixtures sintéticos de QA. La conciliación comprueba primero la cohorte de trabajo registrado, su base de fechas y la suma de las particiones del mismo conjunto de registros. No certifica una lectura conjunta de tareas y aplicaciones. Con costo nulo, una partición faltante o sumas distintas, no afirma que cierre. Si los importes se redondean, no imprime una igualdad exacta falsa.

### Más de cinco grupos

```text
Se registraron 21 jornales; costo de mano de obra: $6M.
Del 26 de octubre de 2026 al 1 de noviembre de 2026, ambas fechas incluidas.
| Grupo | Jornales registrados | Costo de mano de obra |
| --- | --- | --- |
| Norte | 1 | $1M |
| Sur | 2 | $1M |
| Centro | 3 | $1M |
| Alto | 4 | $1M |
| Bajo | 5 | $1M |
| Sin lote | 6 | $1M |
Se consultaron las labores que puedes ver.
Se incluyen registros sin lote.
No verifiqué que las tareas y sus aplicaciones correspondan al mismo momento.
```

### Ranking con empates

```text
Se registraron 4,5 jornales; costo de mano de obra: $95M.
Del 26 de octubre de 2026 al 1 de noviembre de 2026, ambas fechas incluidas.
- Norte: 2 jornales registrados; costo de mano de obra: $40M.
- Sur: 1 jornal registrado; costo de mano de obra: $40M.
Se muestran 2 de 4 grupos. El total incluye también los grupos no mostrados.
Quedan 2 grupos fuera de la lista.
Ordenados por costo de mano de obra, de mayor a menor. Se incluyen los empates en el corte.
Se consultaron las labores que puedes ver.
Se incluyen registros sin lote.
No verifiqué que las tareas y sus aplicaciones correspondan al mismo momento.
```

### Partición que cierra

```text
Se registraron 4,5 jornales; costo de mano de obra: $95M.
Del 26 de octubre de 2026 al 1 de noviembre de 2026, ambas fechas incluidas.
Con lote: 4 jornales; sin lote: 0,5 jornales. Suman los 4,5 jornales del total.
La separación entre registros con lote y sin lote cuadra con el total de jornales.
Con lote: $90M; sin lote: $5M. Suman los $95M de costo total.
También cuadra el costo de mano de obra.
Se consultaron las labores que puedes ver.
Se incluyen registros sin lote.
No verifiqué que las tareas y sus aplicaciones correspondan al mismo momento.
```

## Ejemplo completo de varias partes

Una parte sin datos conserva su explicación; la respuesta independiente mantiene sus cifras y el orden original.

```text
**Parte 1: Labores registradas**
Se registraron 4,5 jornales; costo de mano de obra: $95M.
Del 26 de octubre de 2026 al 1 de noviembre de 2026, ambas fechas incluidas.
- Cosecha: 2 jornales registrados; costo de mano de obra: $40M.
- Poda: 2,5 jornales registrados; costo de mano de obra: $55M.
Se consultaron las labores que puedes ver.
Se incluyen registros sin lote.
No verifiqué que las tareas y sus aplicaciones correspondan al mismo momento.

**Parte 2: Labores registradas**
No tengo ese dato: no pude leer los datos de los registros de trabajo necesarios para responder.
Del 26 de octubre de 2026 al 1 de noviembre de 2026, ambas fechas incluidas.
```

## Disposiciones operativas cerradas

Los errores no muestran mensajes crudos del proveedor o del lector. Estas son las plantillas actuales:

- error_plan: No pude entender tu consulta. ¿Qué período de labores quieres revisar?
- error_llm: No pude procesar tu consulta en este momento. Inténtalo de nuevo.
- error_datos: No pude leer los datos de labores en este momento. Inténtalo de nuevo.
- aclaracion: Necesito precisar tu consulta. ¿Qué período quieres revisar?
- fuera_de_alcance: Hoy puedo ayudarte con labores: jornales, costos de mano de obra y tareas programadas. ¿Qué labor quieres consultar?

Los avisos del contexto son independientes de los hechos calculados:

```text
No pude recuperar el contexto anterior. Repite tu consulta completa.
```

```text
La selección es demasiado amplia para conservarla. Reduce las tareas seleccionadas y repite la consulta.
```

## Reproducción offline

```sh
npm test -- src/__tests__/esco2MensajesBackend.test.ts src/__tests__/esco2Mensajes.test.ts src/__tests__/esco2MensajesMutaciones.test.ts src/__tests__/esco2MensajesFormato.test.ts
npm run typecheck
```

QA mantiene sus expectativas literales aparte de la implementación. Las ocho mutaciones del texto final tienen controles positivos. El handler real se prueba con respuestas del planificador inyectadas y red bloqueada. El añadido no autoriza P3, producción, modelos pagados, despliegues, migraciones ni aceptación de los cinco dominios.
