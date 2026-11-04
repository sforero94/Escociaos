# P2: contrato de los mensajes de labores

2026-11-04. Decisión técnica CTO para el añadido autorizado de presentación en
español y pruebas del texto final. No modifica el alcance de fuentes, operaciones,
modelos ni aceptación definido en [P2-A](p2-runtime-scope-2026-11-04.md).
Los resultados estructurados conservan identidad, procedencia y calificadores;
el mensaje para la persona evita identificadores internos y códigos técnicos.

## API mínima y límite de confianza

El módulo `src/utils/esco2/mensajes.ts` recibe los `ResultadoParte[]` calculados y
devuelve un texto canónico, determinista. `renderDeterminista` puede delegar en
él para conservar el punto de entrada existente.

```ts
renderMensaje(resultados: ResultadoParte[], aviso?: AvisoMensaje): string
validarMensajeFinal(texto: string, resultados: ResultadoParte[], aviso?: AvisoMensaje): boolean
```

Estas funciones son la API del módulo; `renderDeterminista` delega en ellas.
El validador regenera el mensaje y compara el texto completo por
igualdad exacta. No elimina palabras, números, unidades ni calificadores antes de
compararlo. No hay composición de hechos por un modelo, bolsa de cifras admitidas,
parser genérico de afirmaciones ni un motor nuevo de fragmentos auditados.
Las aclaraciones también son datos tipados dentro del resultado: categoría y
nombres de tareas verificados contra las opciones ofrecidas. No existe un
parámetro de contexto que permita anexar texto libre y hacerlo pasar por validado.
Una respuesta no relacionada con una aclaración pendiente vuelve a construir
esa disposición tipada; no publica una pregunta guardada como texto arbitrario.
El campo concreto es `ResultadoParte.aclaracion` con tipo
`categoria_o_tareas`, categoría canónica y nombres obtenidos de los IDs ofrecidos.
`AvisoMensaje` es una enumeración cerrada de avisos operativos sobre contexto no
disponible o demasiado amplio; no acepta una frase libre ni añade hechos de la
finca. Un aviso no elimina la disposición principal de la consulta.

Esta frontera detecta alteraciones del texto respecto del resultado. No demuestra
por sí misma que el resultado sea correcto ni que el plan haya interpretado la
pregunta. Eso requiere los oráculos independientes de tabla/SQL y las pruebas de
texto literal de QA. La API HTTP sigue sin aceptar resultados o respuestas
factuales suministrados por el cliente.

## Presentación y hechos vinculados

- Primero aparece una respuesta breve con las cifras principales y el período
  efectivo. Los valores corresponden a su entidad, métrica, unidad y cohorte.
  Fechas previstas no se presentan como trabajo realizado.
- Las partes conservan su orden. Sus títulos derivan de plantillas cerradas y
  del alcance validado, nunca de `proposito`, rechazos del planificador o texto
  libre del historial. Un encabezado no añade hechos.
- Los nombres vienen de resultados verificados. No se imprimen UUID, IDs de
  tarea/lote/aplicación, códigos de procedencia, claves de enumeración o motivos
  técnicos. Los diagnósticos estructurados siguen disponibles fuera del mensaje.
- Hasta cinco filas pueden usar una lista. Más de cinco usan una tabla Markdown
  con encabezados en español. Cada importe permanece en su fila/columna; la
  tabla no cambia la selección, el orden ni los totales.
- Los nombres repetidos no fusionan filas. Se informa que hay nombres repetidos
  y se usan descriptores naturales disponibles, como tipo o fecha, cuando ayuden.
  No se inventa una identidad para distinguirlos ni se expone el ID interno.
- Una selección limitada dice cuántos grupos muestra, cuántos quedan fuera y que
  el total corresponde al alcance completo. Explica los empates y el criterio de
  orden con nombres de métricas en español.
- Cada parte pendiente o no disponible tiene una frase comprensible, mientras
  las partes independientes respondidas conservan sus cifras. Las opciones D26
  se explican con sus etiquetas; sus claves de transporte no son texto factual.
- Cero conocido, dato nulo, campo no leído y conjunto verificado vacío conservan
  frases distintas. Un estimado no leído no se convierte en una tarea que carece
  de estimado. El subtotal conocido y las dos coberturas siguen explícitos.
  La ausencia verificada de registros conserva los ceros solicitados y conocidos,
  incluidos jornales y costo, en lugar de omitirlos por ser cero.

Los calificadores obligatorios pueden expresarse en español natural. No pueden
desaparecer: ámbito visible, trabajo registrado frente a inicio previsto, estado
actual frente a histórico, estimados de la tarea completa, exclusiones sin lote,
recorte a hoy, cobertura parcial y límite de lecturas separadas.

## Números, moneda y conciliación

Se reutilizan las utilidades puras existentes de `src/utils/format.ts`. Si hace
falta precisión opcional en `formatMillonesCOP`, su valor por defecto conserva el
comportamiento de todos los consumidores existentes. Solo el mensaje nuevo pide
un decimal por debajo de $10M y cero decimales desde $10M para dinero expresado en millones. No se amplía a una migración de
formato del producto.

Los pesos se muestran sin decimales. Los millones se muestran con `M`, sin cambiar
a billones ni introducir `K`: un decimal por debajo de $10M y ninguno desde $10M.
Si el valor publicado pierde precisión respecto del resultado, se marca como
aproximado. Por ejemplo, un importe de 5.640.000 dice «aprox. $5,6M» y uno de
56.400.000 dice «aprox. $56M»; ninguno se afirma como cifra exacta. (Revisión
posterior: con cero decimales, 1.449.000 se publicaba «aprox. $1M».) Los jornales y
las razones mantienen los decimales necesarios para representar su resultado.
La regla de aproximación también aplica a fracciones de peso inferiores al
millón. Un valor pequeño escrito en notación científica no se transforma en un
cero exacto por el formateador. Un total ausente tampoco se rellena con cero.

La conciliación usa las particiones del mismo conjunto de registros. Antes de
decir que cierra, comprueba la suma con lote + sin lote contra el total y sus
estados nulos. No calcula un conjunto diferente desde etiquetas. Si falta una
partición o costo, explica qué no puede conciliar; no fabrica el cierre.

Una igualdad impresa debe ser cierta también en las cifras impresas. Si el
formato en millones redondea, se usa aproximación o prosa con el calificador
correspondiente, no una igualdad exacta falsa. La suma del mismo conjunto no
certifica una instantánea entre tablas: el mensaje conserva una frase breve sobre
las lecturas separadas.

## Prueba independiente del texto que se publica

QA dispone de fixtures P2 nuevos y literales. Comprueba el texto final de la
respuesta, además de los resultados JSON: nombre, cifra, unidad, período,
estado y calificador deben estar juntos en la fila o frase esperada. Incluye
cifras iguales y cifras intercambiables entre entidades/métricas para que una
coincidencia numérica global no pueda aprobar una respuesta cruzada.

Cada una de las ocho clases conserva un control legítimo que pasa y una
alteración del texto que falla: entidad equivocada, unidad equivocada, base de
fecha equivocada, miembro de conjunto equivocado, calificador eliminado, número
presente solo en la pregunta, parte omitida y desconocido convertido en vacío
verificado. QA comprueba también los cambios contra sus expectativas literales;
comparar el renderer consigo mismo no basta como evidencia independiente.

Se añaden controles de tabla con más de cinco filas, truncación y empates,
millones redondeados con aviso, cierre real de particiones, ausencia de datos
técnicos en el texto y nombres repetidos. El handler real debe publicar este
mismo texto, con planificador inyectado y red bloqueada. No se ejecuta una
campaña pagada ni se abre evidencia privada para validar estilo.

Los comandos, tamaños y resultados finales se registran en el resultado P2 y en
los ejemplos del implementador. CTO es dueño solo de este contrato; backend
implementa mensajes y formato, QA prueba independientemente y el coordinador
verifica y gestiona Notion/Git/PR. No se infiere autorización para P3, despliegue,
producción, migraciones o aceptación de los cinco dominios.
