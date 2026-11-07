# Loop M6 · Iteración 0 · Contratos QA de implementación

Fecha: 2026-11-07. Base de revisión: `c85ce43b` (PR #451).
Esta pista pertenece al implementador A. No es SOMBRA, aceptación independiente ni HO.
No autoriza inferencias, lecturas productivas ni cambios de referencias privadas.

## Criterios fijados antes de implementar

### F1 · Identidad semántica del selector

- Dado un nombre que resuelve a una única identidad visible, cuando la intención usa
  ese nombre y el plan usa su ID, entonces la consulta responde con la misma población.
- Dado un selector ambiguo o ausente en el catálogo visible, cuando el plan ofrece
  unilateralmente un ID, entonces el producto pide aclaración y no elige ese miembro.
- Dado un catálogo no leído, cuando intenta normalizar identidad, entonces conserva
  no disponible; no acredita una selección vacía.
- Dados dominios o padres distintos, cuando sus nombres coinciden, entonces la
  normalización no cruza aplicaciones, tareas, lotes o sublotes por etiqueta.

### F2 · Reintento acotado del extractor

- Dado un primer recibo de extracción con JSON o esquema inválido, cuando el segundo
  recibo es válido, entonces un reintento con razón cerrada permite un plan sustantivo.
- Dados dos recibos de extracción inválidos, cuando termina el segundo, entonces
  detiene la extracción; nunca intenta un tercero.
- Dado un error del proveedor, transporte o recibo desconocido, cuando ocurre en
  extracción, entonces detiene el turno y no ejecuta llamadas posteriores.
- Dadas una reparación de extracción y una reparación de plan, cuando ambas son
  necesarias, entonces conserva sus etapas y el máximo de cuatro llamadas del turno.

### F3 · Referencia de rango, sin garantía semántica inventada

- Dado un intervalo de un carácter dentro de la pregunta, cuando la validación solo
  acredita sus límites, entonces la documentación no lo presenta como prueba de que
  contiene el significado de una obligación. No se añade una heurística de términos.

### F5 · Seguimiento y selección previa

- Dada una población efectiva y completa de tres aplicaciones, cuando el siguiente
  turno refiere esas tres con un token válido, entonces conserva exactamente sus IDs.
- Dado un token ausente o vencido, cuando la prosa omitida no permite recuperar la
  identidad, entonces pide aclaración y no sustituye la referencia por todo el catálogo.
- Dado un resultado parcial, un detalle limitado o un conteo de grupos, cuando guarda
  contexto, entonces no lo convierte en una población de entidades completa.
- Dado un cambio explícito del turno actual, cuando difiere del alcance anterior,
  entonces tiene prioridad y mantiene la validación de identidad y período.

## Método

Los controles usan el manejador HTTP real, lectores fijos y fixtures SQL sintéticos
con JWT/RLS locales. El proveedor es simulado y la red queda prohibida.
Los oráculos vienen de identidades y filas de fuente, no de una respuesta anterior.
Se registran RED y GREEN por separado. Los controles positivos exigen resultados
sustantivos, no solamente rechazo seguro.

F4 pertenece al coordinador: cortes de historial en espacios o líneas, cifras en los
dos bordes, Unicode válido y marcador explícito. F6 conserva la exclusión de despliegue
para la rama actual hasta el momento de publicación autorizado.

## Evidencia

Repetición final QA del 7 de noviembre de 2026, 09:48 America/New_York:
**31/31 controles nuevos y 21/21 regresiones de transformaciones: 52/52.**

| Frente | RED observado | Última repetición QA |
|---|---|---|
| F1: nombre e ID, ambigüedad, fuente y dominios | 7 fallos en 7 controles iniciales | 11/11 GREEN |
| F2: extracción, razones cerradas y transporte | 5 fallos y 1 control positivo en 6 pruebas | 6/6 GREEN |
| F3: rango formal sin certificación semántica | Se eligió corregir la afirmación documental, sin heurística | 1/1 HTTP GREEN y revisión documental |
| F4: cortes Unicode vía HTTP | 1 fallo y 1 control positivo con NBSP | 3/3 GREEN; incluye cifras astrales |
| F5: población previa, tokens y visibilidad | 6 fallos iniciales; luego un fallo de UUID negados y un rechazo temporal indebido | 10/10 GREEN |

La repetición conjunta de los cuatro archivos `esco2LoopI0Qa*.test.ts` y las 21
regresiones de transformaciones dio 52/52. Lint de esos archivos: cero errores y
cero advertencias de reglas. El coordinador controla typecheck y la suite global;
esta pista no inicia otro proceso de tipos concurrente.

F1 añade cuatro controles sobre nombre, chapeta e IDs: una contradicción no puede
perder su condición al canonicalizar, dos selectores coincidentes sí responden y
un filtro adicional conserva la intersección no vacía del selector original. La
corrección ya estaba presente al ejecutar esos cuatro controles; no se atribuye
un RED adicional a sus resultados.

F4 comprobó ambos cortes con espacios no separables y estrechos, dígitos ASCII,
arábigos y astrales. El fallo Unicode encontró una cifra parcial antes del marcador;
la corrección conserva únicamente tokens completos y pares UTF-16 válidos.

F3 conserva la prueba de un rango de un carácter válido y datos factuales, junto a
`exhaustividad: no_certificada`. La sección F3 de la arquitectura del loop explica
que el rango no acredita obligación, solapamiento de términos ni exhaustividad
semántica. Esto delimita la garantía; no mide comprensión del extractor real.

Por el nuevo contrato F2, y con autorización del coordinador, dos regresiones de
`esco2M6QaTransformaciones.test.ts` esperan ahora dos extracciones y cero planes
para una intención inválida. Se conservaron las entradas, el rechazo y los
oráculos; no se modificaron referencias ni la rúbrica.

Los controles F5 pasan para: token ausente o vencido, ampliación indebida de tres IDs
a cuatro o a todo el catálogo, población solicitada con fecha desconocida y revocación
de visibilidad después de guardar estado. El positivo exige la misma selección factual
de tres miembros y contexto tipado enviado al extractor. Un ID revocado no se reenvía
al proveedor como parte de contexto antiguo.

Mencionar tres UUID en un mensaje de usuario negado o ambiguo no acredita una selección
afirmativa. Sin un token fiable, las referencias poblacionales detectadas piden aclaración.
La herencia temporal queda separada: una población actual explícita puede reutilizar un
período aportado por el usuario sin token. Su positivo conserva cifras y la advertencia
de fechas desconocidas; no exige una población falsamente completa.

## Reproducción y límites

```sh
npm test -- src/__tests__/esco2LoopI0Qa*.test.ts src/__tests__/esco2M6QaTransformaciones.test.ts
```

No quedan fallos reproducidos pendientes en estos controles. El coordinador debe repetir
la suite global, tipos, lint, build y replay sobre el SHA final; esta QA no sustituye esos
resultados ni ejecuta un typecheck concurrente.

Las guardas de referencia poblacional tienen un vocabulario finito; no prueban resolución
universal de anáforas del lenguaje natural. Los planes y recibos simulados verifican contratos,
llamadas, transporte y fuentes, no exactitud del extractor o planificador real. F3 limita su
garantía a rangos formales. F7, latencia y costo del modelo real, sigue para la evaluación B.

Los errores de recibo desconocido en estas pruebas son errores del proveedor/transporte;
se comprobó que detienen llamadas posteriores. El ledger durable y el control de costo
desconocido entre envíos corresponden al runner de B y no se dan por verificados aquí.

Costo nuevo de inferencia: USD 0. No se abrió SOMBRA, HO ni una sesión evaluadora.
