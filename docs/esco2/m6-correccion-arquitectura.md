# M6: arquitectura de corrección estructural

Fecha: 2026-11-06. Base aceptada: PR #450, `30deebcd935b9d34c9a13182449435b875e7772f`; runtime `138dce3a741063ea1637cf827edb77ec87d3c946`.

Este documento define una entrega de implementación y QA de desarrollo. No constituye aceptación M6, una campaña nueva, permiso de inferencia ni autorización productiva. Las preguntas, fuentes, referencias y respuestas privadas no forman parte de este documento.

## Decisión y alternativas

1. Extender solo las herramientas actuales evita una migración, pero mantiene la equivalencia incorrecta entre declaración del plan y solicitud satisfecha.
2. Un lenguaje analítico general resolvería muchas composiciones, pero introduciría una superficie de validación desproporcionada y pondría en riesgo las garantías de fuente.
3. **Decisión: intención previa separada, evidencia común y composición tipada acotada**, sobre los lectores y ejecutores actuales. Se conservan JWT/RLS, cálculos deterministas, motores compartidos y contratos de fecha/unidad. No se habilitan SQL libre, fórmulas del modelo ni selección arbitraria de columnas.

```text
pregunta + contexto de usuario + catálogo visible mínimo
  → extracción de intención (sin plan ni resultados)
  → intención validada e inmutable
  → plan de operaciones vinculado a obligaciones
  → comparación intención/plan
  → selecciones y dependencias por IDs visibles
  → lectores fijos → motores deterministas
  → evidencia población/medida/detalle
  → comprobación de obligaciones → mensaje canónico
```

## Contrato de intención y separación causal

La herramienta `declarar_intencion` es exclusiva de una primera llamada. Su entrada es la pregunta, la fecha de Bogotá, contexto anterior de usuario y catálogo mínimo. No recibe propuestas de plan, resultados, referencias DEV, rúbricas ni respuestas del evaluador. La segunda etapa recibe el contrato congelado y produce operaciones; no puede editarlo al reintentar.

Forma conceptual de `IntencionSolicitud`, versión 1:

- `obligaciones`: entre una y ocho, IDs consecutivos `o1`…`o8`.
- Cada obligación conserva `evidencias`, `capacidad`, `poblacion`, `periodo`, `metricas`, `agrupaciones`, `condiciones` y `detalle`.
- `evidencias`: intervalos `[inicio,fin)` válidos de la pregunta actual o de un mensaje anterior de **usuario**, identificado por índice. Al menos una evidencia pertenece al mensaje actual. Una cita no equivale por sí sola a exactitud semántica.
- `poblacion`: unión cerrada `explicita` (entidad y exactamente una clase de IDs/nombres/chapetas), `todas_visibles` (entidad y filtros tipados) o `derivada` (obligación previa y entidad). La política `sin_lote` pertenece a la población laboral.
- `periodo`: `intervalo` con fechas calendario inclusivas y `base_fecha`, `actual`, `vida_completa` o `sin_precisar`. Una fecha descriptiva no cambia la fecha operativa; estado actual e histórico son requisitos distintos.
- `metricas` y `agrupaciones`: enums del dominio, sin texto ejecutable. Una condición compara una métrica registrada contra un literal, con operador cerrado, unidad y base explícitas.
- `detalle`: resumen o detalle exhaustivo. No se confunde con disponibilidad de la medida.
- `residuales`: intervalos de texto y motivo cerrado para requisito ambiguo, no soportado o no interpretado. Ningún residual relevante se elimina para declarar completitud.

Una operación referencia obligaciones sin redefinirlas. El comparador puro proyecta su contrato efectivo y exige identidad de población, período/base temporal, métricas, agrupaciones y condiciones. No basta la igualdad de `consulta` con el resultado ni que la cita aparezca en la pregunta. Una omisión o discrepancia conserva la obligación pendiente y prohíbe marcarla respondida. Una parte soportada puede conservar una respuesta sustantiva mientras otra pide aclaración.

**Límite explícito:** dos etapas del mismo modelo no certifican comprensión independiente del lenguaje natural. El sistema verifica cumplimiento de la intención extraída, intervalos válidos dentro del texto y residuales declarados. Validar esos intervalos no demuestra que el fragmento citado sustente semánticamente cada obligación. Las pruebas con proveedor simulado verifican esa separación y sus invariantes; la exactitud del extractor real requiere una nueva medición autorizada. No se anuncia exhaustividad semántica universal ni se usa el segundo plan para corregir retroactivamente la intención inicial.

## Evidencia de población, medida y presentación

Cada resultado distingue tres ejes:

| Eje | Evidencia mínima | Condición de completitud |
|---|---|---|
| Población | Universo visible, miembros seleccionados, excluidos por regla, desconocidos y origen de lectura | Ningún desconocido relevante; la selección corresponde a la obligación |
| Medida | Unidad, métrica, base, NULL registrado, no leído, ausente y cero explícito | Campos y vínculos requeridos disponibles; agregación válida |
| Detalle | Filas totales, mostradas, límite aplicado | Un detalle exhaustivo requiere todas las filas; resumen puede estar completo con detalle limitado explícito |

Un filtro que excluye registros sin lote no genera evidencia de cero en ese grupo. La partición excluida debe decir `excluida`, no `vacio_verificado`. Las sumas y conciliaciones nombran su universo seleccionado. No acreditan completitud de la población pedida por sumar correctamente dentro de un subconjunto. Un cero por vacío exige lectura completa y contrato que permita ese cero. Si falta un campo para aplicar un filtro, su fila es desconocida respecto al filtro; no se descarta como no coincidente.

## Composición cerrada y límites

Las dependencias son referencias tipadas a selecciones anteriores. Solo se admiten aplicaciones→cantidades/costos/labor/faltantes y animales→ficha/pesajes. No se ejecuta código del modelo. Las referencias deben apuntar hacia atrás, ser del tipo correcto, únicas y acíclicas. Un máximo explícito de operaciones lógicas y expansión de miembros limita lectura y payload; excederlo produce una disposición honesta, nunca ejecución de un prefijo como si fuera el conjunto completo. Los límites finales deben constar en el registro y su prueba de conformidad.

La expansión usa IDs realmente seleccionados y visibles. El modelo no enumera nombres para imitar una población. La población vacía verificada no se sustituye por selección global ni por nombres del catálogo. Una selección ilegible no se convierte en vacía.

| Familia | Corrección/transformación general | Invariantes |
|---|---|---|
| Labores | Población, agrupación, ranking numérico, comparación/delta y umbral tipados | Cohorte/fecha conservadas; sin lote aparte; estimados D30 separados; denominador cero implica porcentaje no calculable |
| Aplicaciones | Selección por fecha/base/estado actual seguida de cantidades o costos por ID | Plan completo separado de ejecución; costo cerrado separado de valoración actual; no sumar bases monetarias heterogéneas |
| Hato | Todas visibles y filtros por campos registrados/categoría/estado derivado actual | Motor existente y configuración estricta; NULL es sin dato; presunción nunca confirmación; históricos no acreditados quedan fuera de contrato |
| Pesajes | Selección derivada por IDs y últimas mediciones por animal/período | Muestras distintas de producción quincenal; último por entidad, no último global; fechas y AM/PM conservados |
| Monitoreo | Última observación/ronda por combinación pedida, agrupación y filtros de resultado | Identidad de ronda y plaga; incidencia ponderada de observaciones; no árboles únicos; gravedad no es severidad |
| CE | Mediciones por entidad/período y transformaciones sobre su base explícita | No promediar promedios; no inventar ronda ni completitud de JSON |
| Clima | Agrupación calendario y comparación/umbrales sobre variables aprobadas | Estación separada; lluvia parcial/cota distinta de total; cobertura por variable; no contar día desconocido como día que no supera umbral |

Cada nueva variante necesita tabla de compatibilidad: tipo de métrica, unidad, base temporal, NULL, empates, límites y detalle. Las variantes no aprobadas se excluyen del esquema y permanecen identificadas como limitación. El implementador no inventa promedios, comparaciones ni umbrales sin una base definida en el PRD y contratos. Una decisión de alcance irresoluble con esas fuentes requiere CPO.

## Dinero D43 y fuente

D43 conserva la banda de la magnitud original: pesos enteros por debajo de un millón; millones con un decimal entre uno y cien millones; millones enteros desde cien millones. `aprox.` identifica pérdida de precisión. El añadido aprobado muestra el valor exacto del mismo resultado en pesos. No se cambia esta regla para adaptar referencias.

El detalle exacto conserva la representación decimal del valor usado para calcular; no redondea cada fila antes de sumar ni altera un número mediante precisión significativa arbitraria y después lo presenta como exacto de origen. La conciliación usa la misma base y tolerancia documentada; distingue total guardado, suma calculada, cantidad y precio. Cuando la fuente numérica no permite acreditar exactitud decimal original, el contrato declara esa limitación y no certifica igualdad exacta de origen. No mezclar costo congelado, plan y ejecución valorizada.

## Historial y transporte

El contrato de entrada debe aceptar la respuesta válida que el producto devuelve como próximo mensaje assistant, dentro de una cota pública de transporte. La cota de transporte y la de contexto del modelo son distintas. La normalización mantiene intactos los mensajes user admitidos; el contexto factual se conserva por estado del servidor ligado al usuario. Si un mensaje assistant requiere compactación, debe ser determinista, explícita y no crear hechos ni borrar los selectores efectivos del usuario.

El estado conserva intención, población y período efectivos, con prioridad a cambios explícitos del turno actual. Token ausente/vencido, usuario distinto o instancia nueva no permiten inferir contexto inexistente; el producto pide aclaración precisa. Los clientes no pueden sobrescribir intención aprobada mediante estado editable. Mantener TTL, límite de memoria y aislamiento entre usuarios.

HTTP debe probar ida y vuelta con respuesta extensa, límite y exceso de mensajes, contexto heredado y cambiado, token expirado, estado de otro usuario, proveedor simulado y ausencia de modelo. Informar defecto de arnés y defecto de producto por separado. Ninguna reparación del transporte convierte un replay en nueva campaña.

## Secuencia, propiedad y pruebas

1. CTO fija contratos y matriz; QA fija oráculos desde fuente sintética/DEV autorizada antes de implementar.
2. Backend implementa intención/evidencia, comparación y registro. QA muta solo el plan respecto de una intención congelada, y verifica también extracción/forma/residuales con proveedor simulado.
3. Backend integra población y dependencias, después transformaciones de dominio aprobadas; QA intenta refutar por omisión, período, base de fecha, vínculo, identidad, NULL, unidad y truncamiento.
4. Backend cierra historial/HTTP; QA comprueba recorrido real sin inferencias. Los positivos exigen cifras sustantivas; rechazo universal no pasa.
5. Coordinador repite pruebas pertinentes, suite/regresiones M4/M5, typecheck, lint y build; entrega SHA y diferencias/limitaciones reales.

Propiedad sugerida: backend `src/utils/esco2/` y `supabase/functions/esco-consultas/`; QA archivos nuevos `src/__tests__/esco2M6*Qa*.test.ts` y arnés autorizado, sin editar código del implementador; CTO este documento y cambios operativos necesarios en CLAUDE.md; coordinador integración, evidencia y Notion. Coordinar archivos compartidos antes de tocar registro, tipos, cobertura o núcleo. No modificar captura, chat legado, Telegram ni árboles de servidor excluidos.

Comandos existentes: `npm test -- <archivos>`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. No crear infraestructura duplicada cuando el manejador HTTP y proveedor inyectable existentes permiten demostrar el recorrido.

La entrega contiene únicamente agregados y controles sintéticos publicables. Las pruebas DEV autorizadas conservan originales y nuevas versiones fuera de Git. USD 0 de inferencia durante esta fase. Antes de cualquier campaña, congelar código/configuración/modelo/fuentes/casos/referencias/rúbrica/runner y recalcular el máximo completo de llamadas, tokens, precios y reintentos. La aceptación requiere otra sesión con custodia D17 y autorización propia.

## Álgebra analítica mínima para implementación

Fuentes de decisión: [PRD §5.3–5.6 y §8](https://app.notion.com/p/40d67755ed68803e8c37e928d0b31860), P4 §Monitoreo (comparación fija y última por combinación), P4 §Clima y §Pesajes, y P3 tabla de motores (`calcularCambio`). La solicitud actual autoriza composición, comparación, deltas, umbrales y últimas mediciones dentro del alcance. Estas reglas técnicas precisan ese alcance; no agregan severidad, estado histórico, pronóstico ni recomendaciones.

Interfaz acotada: `AnalisisConsulta` admite `agrupar_por`, `ultima_por_entidad`, `condiciones` y `comparacion`; `ejecutarAnalisis(analisis, resultado)` produce `ResultadoAnalisis`; `renderAnalisis` publica solo esa salida. `metrica` y dimensiones se validan contra una tabla cerrada por dominio. Un string desconocido se rechaza; nunca selecciona una propiedad arbitraria. Los límites de grupos/miembros siguen los del runtime y no autorizan un prefijo silencioso.

| Dominio | Métricas/base aptas | Agrupación/última/condición permitida | Restricciones |
|---|---|---|---|
| Labores | Métricas numéricas ya registradas: jornales, costo, días con registro, jornales/árbol, jornales/hectárea, costo/jornal | Dimensiones existentes; umbral y comparación sobre grupos completos | Razones se recalculan desde sus numeradores/denominadores originales o no se agregan. No sumar razones ni repetir denominadores físicos. Programadas no produce jornales registrados. |
| Monitoreo | Afectados, muestreados, incidencia | Lote/sublote/plaga; última por combinación lote_id+sublote_id+plaga_id según inicio de ronda | Incidencia=100×Σafectados/Σmuestreados de misma plaga/ronda. No mezclar plagas ni fabricar ronda. Última conserva ronda completa; empate conserva todas las rondas empatadas. Gravedad nativa sigue separada de severidad. |
| CE | valor_ce y ph por registro | Filtro de valor; última por lote_id y fecha_monitoreo; empate conserva todas las filas | No agregar promedios de registros ni asociar una ronda por fecha. pH usa su unidad propia, no dS/m. |
| Pesajes | litros_total usable, AM y PM registrados | Animal_id y día; última fecha por animal dentro del período | Última fecha se elige entre registros, antes de descartar NULL: última incompleta no se reemplaza silenciosamente por una vieja completa. Litros faltantes no son cero. No extrapolar muestras a producción del hato. |
| Clima | Variables registradas del resumen diario | Día, semana de lunes a domingo y mes calendario, estación siempre separada | Lluvia/energía/horas de sol: suma; temperatura/humedad/viento medio/radiación media: media de diarios usables originales, rotulada media de valores diarios; mínimos y máximos corresponden a su variable física. Dirección predominante no se promedia. |
| Costos/cantidades | Valores de bloques completos existentes y unidades originales | Comparación entre grupos de la misma base; condiciones por métrica/unidad | No mezclar plan/ejecución ni congelado/actual; no sumar kg y L. Faltantes descuenta stock una vez por producto antes de analítica. |
| Hato | Campos numéricos o estados tipados existentes, derivados con el motor compartido | Selección actual, sin reconstrucción histórica | No inventar preñez confirmada, fechas ni conteos a partir de campo ausente. Una categoría calculada sigue indicando su origen. |

**Comparación:** `izquierda` y `derecha` identifican claves estables de grupos derivados del mismo resultado padre: IDs, período y base; nunca nombre, posición de fila o prosa. El resultado incluye ambos valores, fechas, unidad y procedencia. Delta se define como derecha menos izquierda. El porcentaje de cambio usa izquierda como denominador y solo existe con izquierda estrictamente positiva y ambos lados completos, comparables y finitos. Para incidencia, el cambio principal son puntos porcentuales, con ambos numeradores/denominadores visibles; no se publica automáticamente porcentaje relativo ni causalidad. Diferente tamaño de muestra se indica; incompatibilidad de método/universo no se resuelve mediante aritmética.

**Condiciones:** operadores cerrados `gt`, `gte`, `lt`, `lte`, `eq`, literal finito y unidad exacta. No convertir unidades implícitamente. Cada miembro termina en cumple, no cumple o indeterminado. NULL, no leído, día ausente o calidad insuficiente pertenecen a indeterminado. El conteo de quienes cumplen solo describe población evaluable; no acredita que todos los demás no cumplan. No inventar umbrales agronómicos/veterinarios.

**Clima/cobertura:** intervalos calendario inclusivos, fecha operativa Bogotá y días esperados explícitos por estación. Un mes o semana inicial/final recortado conserva sus límites reales. Una suma de lluvia requiere días completos usables; las cotas y observaciones de calidad desconocida permanecen separadas. Una suma incompleta es subtotal observado, no total del período; una comparación completa queda no disponible si un lado carece de cobertura requerida. Media parcial puede mostrarse como media de días observados con su denominador, pero no como comparación completa de períodos. Nunca promedio de promedios agrupados sin sus aportes originales.

**Procedencia y enlace:** `ResultadoAnalisis` conserva `resultado_id` del `ResultadoConsulta` padre, obligación(es) enlazada(s), miembros/fuentes exactos de cada grupo, período/base/unidad, disponibilidad y cobertura. No toma como entrada datos del evaluador ni redefine el resultado original. Una selección o agregación debe ocurrir antes de truncar datos necesarios; si recibe solo un prefijo del resultado, no certifica una operación exhaustiva. El mensaje muestra estados y límites. Cobertura de una obligación solo puede ser completa cuando plan, base y salida analítica satisfacen sus condiciones.

## Precisión del corte de transporte y contexto

La API implementada fija 256 × 1024 unidades UTF-16 por texto de respuesta/assistant (`String.length`), no bytes UTF-8 del cuerpo HTTP. Una respuesta textual mayor produce 413 después del cálculo; un mensaje assistant de entrada que supera la cota falla la validación de solicitud. Continúan los límites de pregunta, roles y doce mensajes. El JSON completo puede ocupar más por campos estructurados y codificación; esta cota no promete un límite de bytes del cuerpo. Aceptar un historial mayor no amplía permisos.

Un extracto determinista de cabeza y cola de un mensaje assistant puede limitar el contexto enviado al modelo a 4.000 caracteres. Debe incluir un marcador explícito de omisión dentro de esos 4.000, sin cortar una cifra y volver a presentarla como valor completo. Ese extracto es contexto incompleto, no evidencia factual ni sustituto de intención/estado estructurados. No afirmar que preserva toda condición, entidad o cifra del mensaje. El estado efectivo del servidor tiene prioridad; cuando falta y la continuación depende de la parte omitida, la respuesta pide aclaración. El cuerpo HTTP admitido y el extracto del modelo son pruebas separadas.

**Control de omisión:** una intención congelada con obligaciones A y B no puede terminar completa con plan que solo ejecute A, aunque el plan cite todo el texto o declare su propio inventario A. Otra prueba conserva la obligación pero muta únicamente fecha, población, condición, métrica o agrupación; el comparador debe detectar cada pérdida. Estos controles prueban el contrato; no prueban que el extractor real descubra toda obligación de lenguaje natural.


## Estado de revisión arquitectónica del runtime

El runtime conserva cuatro operaciones lógicas por turno y cincuenta miembros por dependencia. `seleccion_de` referencia `p1`…`p4`; las obligaciones derivadas referencian `o1`…`o8` y resuelven la operación productora por su vínculo, no por asumir que ordinal de obligación equivale a operación. Los productores permitidos son aplicaciones/hato; los consumidores son los de sus entidades respectivas. Esos productores no admiten analítica, así que no existe en esta versión una dependencia desde una población filtrada por análisis de resultado. No se atribuye como defecto corregido una combinación rechazada por el registro.

La analítica disponible se limita a labores, CE, pesajes, monitoreo y clima. La tabla anterior define restricciones de diseño para otras familias, no anuncia analítica desplegada sobre costos/cantidades/hato. Las selecciones poblacionales de hato usan campos registrados o el motor actual antes de la dependencia. La evidencia sigue declarando exhaustividad semántica no certificada.

La revisión identificó dos controles por cerrar sobre el árbol revisado: representar y comparar última/comparación/ranking en la intención (incluida su ausencia), y no elegir un placeholder `no_revisado` como última observación registrada de monitoreo. Son hallazgos de implementación, no resultados de evaluación del planificador real. El informe final del coordinador registra su resolución y las pruebas sobre el SHA entregado.
