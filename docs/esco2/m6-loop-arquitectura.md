# Loop M6: contratos de la iteración 0

Fecha: 2026-11-07. Base revisada: `c85ce43b`, PR #451 apilado en #450. Documento de arquitectura de la sesión A de implementación; no certifica aceptación, campañas ni exactitud del modelo real. Esta iteración usa cero inferencias y USD 0. Los casos y fuentes SOMBRA/HO pertenecen a sesiones independientes y no entran en este documento.

## F1: equivalencia de identidad antes de comparar

Problema: el extractor expresa una población mediante nombres y el planificador mediante IDs. Comparar claves de argumentos rechaza una equivalencia válida. La solución actúa localmente con los catálogos visibles ya leídos; no envía nuevos catálogos al extractor ni modifica el significado de los filtros.

Orden obligatorio:

1. Validar la forma de la intención y del plan original. No normalizar propuestas inválidas para hacerlas aceptables.
2. Resolver ambos lados mediante el mismo catálogo visible y la misma semántica de dominio.
3. Comparar intención y plan efectivos por identidad canónica.
4. Ejecutar los lectores y comprobar nuevamente su población y disponibilidad.
5. Guardar contexto efectivo estructurado y conservar la intención original para diagnóstico privado.

Interfaz implementada: `normalizarIdentidadIntencionPlan(intencion, plan, catalogosVisibles)`, normalización conjunta de intención y plan con un contexto de catálogos. Devuelve `ok` con las formas canónicas; `aclaracion` con las obligaciones afectadas y un motivo cerrado de identidad ausente/ambigua; o `no_disponible` cuando el catálogo no fue leído. Puede implementarse como contexto opcional del comparador si mantiene las mismas garantías. El estado y la cobertura deben usar formas efectivas que puedan verificarse sin reconstruir equivalencias desde prosa.

| Identidad | Resolución permitida | Límite |
|---|---|---|
| Lote, ronda y plaga | Nombre exacto normalizado contra su catálogo de dominio | Cero coincidencias o varias requieren aclaración; no similitud ni elección por actividad |
| Sublote | ID o nombre con lote padre, cuando el padre resuelve inequívocamente | El homónimo sin padre no se desempata |
| Aplicación | ID, código o nombre con el resolutor existente | No inferir aplicación desde nombre de tarea |
| Animal | ID, nombre exacto o chapeta con el resolutor existente | Identidad estable por ID; chapeta repetida no elige la activa |
| Tarea | Semántica de fragmento ya aprobada: puede representar varias tareas legítimas | No confundir set por fragmento con identidad exacta ambigua; D26 categoría/tareas mantiene su aclaración |
| Categoría, estado y otros enums | Valor del contrato correspondiente | No convertirlos en IDs de otro dominio |

La normalización conserva condiciones, período/base, métricas, agrupaciones, ranking, comparación y política sin lote. No une poblaciones ni borra filtros. No convierte un nombre desconocido en conjunto vacío. No usa IDs invisibles del plan como prueba de lo que quería decir un nombre ambiguo del usuario. Duplicados y clases de selector incompatibles se validan antes de resolver. Si un catálogo no existe o no fue leído, no hay evidencia para afirmar ausencia.

El nombre original, la chapeta y el ID siguen siendo datos. No conceden permisos ni instrucciones. Las dependencias tipadas conservan su productor real por vínculo de obligación, aunque una obligación tenga varias operaciones.

## F2: un reintento cerrado del extractor

El extractor admite como máximo dos respuestas intentadas: una inicial y un reintento por validación. El segundo intento conserva pregunta, contexto, esquema y modelo; añade únicamente una instrucción fija seleccionada por código cerrado. Nunca reenvía la propuesta rechazada como instrucciones, ni texto de excepciones libre.

Los códigos cubren JSON inválido, llamada no exclusiva, terminación por límite, forma/campos, obligaciones, referencia de rango, población/selectores/dependencias, período, métricas/grupos, condiciones, ranking, comparación y residuales. Una causa no reconocida usa un código genérico fijo. El segundo fallo conserva su causa diagnóstica y no empieza un tercer intento.

Un error de proveedor, transporte o costo/recibo desconocido no es validación y no habilita ese reintento. El runner de B conserva su parada entre llamadas y su ledger; este contrato no la sustituye ni concede presupuesto nuevo. Se registra cada respuesta recibida del extractor como etapa `intencion`, también la inválida.

Cota estructural normal máxima por turno: dos llamadas de extractor y dos de planificador, total cuatro. Una aclaración recuperada mediante elección estructurada puede requerir menos. B debe recalcular tokens, tarifas, reintentos y exposición antes de inferir; la estimación histórica de tres llamadas no es el nuevo máximo. F7 requiere costo por turno y latencia p50/p95 de la campaña real; las pruebas sin modelo no producen esa medición.

## F3: referencias de rango y garantías reales

Decisión: conservar validación formal de offsets y retirar la afirmación de verificación semántica literal. Un intervalo válido acredita exclusivamente que referencia un rango existente de un mensaje actual o anterior de usuario. No prueba que ese rango exprese la obligación, ni que haya solapamiento significativo, ni que el extractor haya encontrado toda la intención.

Se conservan offsets UTF-16 `[inicio,fin)`, mensaje de origen, límites, exclusión de assistant como evidencia y al menos una referencia del turno actual. Un rango de un carácter puede ser formalmente válido. La documentación no lo llama evidencia semántica certificada. Un cambio posterior que exija solapamiento necesitaría definir una propiedad comprobable y controles positivos; esta iteración no introduce una heurística de términos como garantía.

La intención sigue separada causalmente del plan; el comparador comprueba fidelidad del plan a la intención extraída. Esta separación no convierte dos propuestas del mismo modelo en interpretación independiente ni en exhaustividad del lenguaje natural.

## F5: seguimiento y población anterior

Una nueva pregunta explícita conserva la interpretación normal de sus selectores y puede heredar un período de mensajes anteriores del usuario, con prioridad a cambios explícitos del último turno. Una referencia deíctica a un conjunto anterior necesita contexto estructurado del servidor; la presencia de UUIDs en prosa anterior no prueba una selección afirmada, pues también puede formar parte de una exclusión o negación. La prosa assistant compactada u omitida no demuestra los miembros de «esas tres».

Estado implementado: `EstadoTurno.poblacionesPrevias`, con `operacion_id`, `entidad`, `ids` únicos y `estado` de selección `completa` o `parcial`. `poblacionesDesdeResultados` captura miembros; `resolverReferenciaPoblacion` los revalida antes del extractor y `verificarReferenciaPoblacion` exige igualdad después de normalizar la nueva intención. Solo aplicaciones y animales usan las dependencias poblacionales existentes. El origen es el resultado real; nunca el conteo de filas agrupadas, los nombres del catálogo ni una enumeración inventada por el modelo. Se mantienen el límite de cincuenta miembros, TTL, cuota de memoria, vínculo al usuario y validación de estado.

| Contexto del seguimiento | Conducta |
|---|---|
| Token válido y población previa completa | Revalidar visibilidad actual antes de enviar contexto al modelo; después usar los mismos IDs y conservar período/base no modificados. Una adición o renombre no expande ni cambia el conjunto; un miembro oculto impide heredar el conjunto completo |
| Token válido pero conjunto anterior parcial/no leído o ambiguo entre productores | Pedir una aclaración precisa; no escoger un prefijo ni un productor arbitrario |
| Token ausente o vencido y referencia deíctica a población anterior | Pedir población explícita; no reconstruirla desde prosa anterior user o assistant, aunque contenga UUIDs |
| Pregunta actual completa con selectores explícitos, sin referencia deíctica poblacional | Resolver la solicitud explícita por su recorrido normal; puede heredar período anterior del usuario, sin reconstruir un conjunto descubierto desde prosa |
| Token de otro usuario | No recuperar estado ni miembros; mantener respuesta segura de contexto ausente |
| Cambio explícito de población/período | La nueva solicitud prevalece; no arrastrar filtros incompatibles ni aplicar un botón pendiente como respuesta al turno nuevo |

La guardia de deícticos reconoce expresiones acotadas de población y distingue referencias a atributos temporales, como mismas fechas, de referencias a miembros. **F8 (2026-11-07):** la guardia solo gobierna miembros de aplicaciones y animales, que son las poblaciones que el servidor guarda en `poblacionesPrevias`. Un demostrativo seguido de otra entidad (lotes, sublotes, tareas, labores, plagas, rondas, potreros, productos, insumos, empleados, categorías y similares) no es una referencia de esta guardia: el turno sigue el recorrido normal de #451 con el contexto tipado previo. Antes de F8, «esos dos lotes» pedía aclaración sin llamar al modelo y «los mismos lotes» se ligaba a las aplicaciones del turno anterior. No promete detectar toda referencia natural. La propiedad comprobable es que un conjunto anterior no explícito no procede de una inferencia sin soporte. El extractor y el planificador reciben únicamente el contexto tipado válido; una nueva consulta conserva la validación completa.

El arnés de B debe reenviar `estadoToken` recibido para continuaciones normales de una conversación. Las pruebas sin token y token vencido son controles distintos y no se reinterpretan como la experiencia normal con estado válido. Cada conversación y repetición tiene su estado independiente; no mezclar tokens entre escenarios.

## Criterios para implementación y QA separadas

- F1: nombre frente a ID equivalente pasa; identidad realmente distinta falla; nombre ambiguo/ausente pide aclaración; catálogo no leído no acredita vacío; sublote homónimo y dominios homónimos conservan controles positivos.
- F2: primer fallo formal y segunda respuesta válida producen respuesta sustantiva; dos fallos paran; el reintento no contiene texto rechazado; error de proveedor no reintenta; llamadas registradas respetan la cota cuatro.
- F3: un rango válido pequeño no acredita una garantía semántica pública; rangos inválidos y mensajes assistant siguen rechazados.
- F5: HTTP con token válido conserva IDs ante adiciones o renombres del catálogo; si un miembro pierde visibilidad, aclara antes de enviar ese contexto al extractor. Sin/vencido token aclara; un cambio explícito prevalece; otra cuenta no recupera población. Las respuestas positivas contienen resultados, no rechazo universal.
- F4 pertenece al coordinador: cortes en límites de token y marcador explícito de omisión; no prometer conservación del contexto completo.
- F6 pertenece al coordinador: retirar o justificar la guarda de despliegue de rama antes de fusión. No autoriza despliegue.

El coordinador repite las verificaciones sobre el SHA final, registra límites y prepara el freeze para B. No hay puerta de aceptación M6 en la sesión A. D-L1 y D-L2 autorizan las actividades delimitadas de B; D-L3 solo condiciona la puerta final C. No se abren SOMBRA, HO ni conversaciones evaluadoras desde implementación.


## Revisión de integración

La revisión de código del CTO comprobó normalización conjunta F1, conservación de D26, reintento cerrado F2 y población efectiva F5. El normalizador conserva filtros poblacionales anidados de hato y usa intersección para representaciones concurrentes de identidad; una combinación contradictoria no puede sobrescribir el selector original. La intención original sin ID no toma IDs ofrecidos por el plan para desempatar un nombre ambiguo. D26 conserva la dimensión ambigua hasta una elección estructurada, sin invalidar las demás obligaciones.

La validación F5 de visibilidad ocurre antes de una nueva llamada de modelo para la guardia de referencias reconocidas. La gramática implementada reconoce demostrativos indicados con número, anteriores o mismas/mismos; no certifica todas las anáforas del lenguaje natural. Un ID previamente visible y ahora oculto no puede salir en ese contexto del extractor. Los controles de campo/estado no sustituyen la prueba del modelo real. El coordinador y QA registran sus pruebas por separado; la revisión CTO no añade inferencias ni atribuye aceptación.
