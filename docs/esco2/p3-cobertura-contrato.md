# P3: contrato mínimo de cobertura por subparte

Fecha: 2026-11-05. Trabajo acotado autorizado por Santiago después del corte M4.
Base de integración local: `882d2c83`, sobre `main` `ecd04` y el avance del PR #434.
Este contrato prepara la revisión del mismo PR; no acepta P3, M4 ni fase 1.
No habilita P4, M6, deploy, migraciones, secretos ni escrituras productivas.

## Problema que se pone a prueba

La regeneración canónica existente comprueba que el texto corresponda a los resultados
producidos. No comprueba que se hayan representado todas las obligaciones de la pregunta.
El segundo ciclo conservó omisiones de subparte y solo un turno solicitó la marca parcial.
La reparación añade un inventario declarado y una correspondencia comprobable con las
operaciones y sus resultados. La extracción de ese inventario sigue dependiendo de Luna.

Hay dos opciones técnicas:

| Opción | Ventaja | Límite |
|---|---|---|
| Aviso parcial global | Conserva el transporte ya probado | No identifica la parte omitida ni obliga a darle disposición |
| Inventario declarado en las herramientas existentes | Hace comprobables subpartes, vínculos y disposiciones sin otro modelo ni otro ejecutor | Un inventario incompleto puede ser estructuralmente válido; requiere oráculo independiente |

Se elige la segunda. No se añaden herramientas para las familias M8, SQL generado,
expresiones ejecutables, operaciones aritméticas nuevas ni un lenguaje general de consultas.
Los motores, lectores fijos con JWT/RLS y validadores de cada consulta conservan su autoridad.

## Entrada del planificador

Una respuesta de Luna propone el inventario y las llamadas a las herramientas registradas.
Se conserva el máximo de **cuatro llamadas por turno**. No hay una llamada adicional para
extraer obligaciones ni un segundo modelo que certifique al primero. El reintento de esquema
ya existente sigue siendo como máximo uno; se contabiliza dentro del presupuesto.

La **primera** llamada lleva este metadato registrado, además de sus argumentos actuales:

```ts
interface InventarioDeclarado {
  version: 1;
  partes: {
    id: string;             // s1, s2, ... en orden consecutivo
    texto: string;          // fragmento literal de la pregunta original
    capacidad:
      | 'labores'
      | 'aplicaciones'
      | 'cantidades_aplicacion'
      | 'costos_aplicacion'
      | 'labor_aplicacion'
      | 'faltantes_aplicacion'
      | 'fuera_de_contrato';
    disposicion: 'consultar' | 'aclarar' | 'fuera_de_contrato';
  }[];
}
// En argumentos de la primera llamada: cobertura: InventarioDeclarado.
// En cada llamada ejecutable: parte_ids: string[].
```

El esquema expuesto y la validación parten de las mismas constantes de capacidades y
disposiciones. El inventario tiene entre una y **ocho subpartes**. Cada `texto` es no vacío,
de hasta 300 caracteres, y debe aparecer literalmente en la pregunta original del turno.
Se permiten fragmentos iguales si representan obligaciones distintas del mismo fragmento;
los IDs siempre son únicos. Una cita no demuestra por sí sola que la capacidad sea correcta.

La cita sirve como etiqueta de la **solicitud del usuario**. No es evidencia factual y no
autoriza selecciones, fechas, acceso, cálculos ni afirmaciones. El renderer la escapa y la
presenta como solicitud citada, sustituyendo UUID y tokens que contienen caracteres
numéricos por etiquetas fijas. La cita no puede aportar anclas numéricas al puntuador;
`texto` conserva el fragmento literal en la cobertura estructurada. No publica un resumen
libre del modelo ni sus motivos.
No se exige que un fragmento contenga todos los argumentos heredados del contexto: los
selectores y períodos siguen sujetos a sus validadores y a la visibilidad del solicitante.

## Correspondencia antes de ejecutar

1. Solo la primera llamada puede incluir `cobertura`. La falta del metadato, su repetición,
   propiedades no registradas, IDs inválidos o citas ajenas a la pregunta invalidan el plan.
2. Cada llamada ejecutable contiene `parte_ids` no vacío y sin duplicados. Cada referencia
   apunta a una subparte declarada con disposición `consultar` y capacidad igual al tipo
   real de esa operación.
3. Cada subparte `consultar` queda vinculada al menos a una operación. Se admite una
   operación para varias subpartes compatibles y varias operaciones de la misma capacidad
   para una subparte. No se admite una operación sin obligación ni una referencia huérfana.
4. `fuera_de_contrato` exige capacidad `fuera_de_contrato` y ninguna operación ejecutable.
   `aclarar` exige una capacidad soportada y ninguna operación ejecutable para esa subparte.
5. Las subpartes no ejecutables se resuelven desde el inventario con texto fijo. No necesitan
   una herramienta adicional por subparte. Si no hay ninguna operación ejecutable, se usa
   la herramienta existente `fuera_de_alcance` o `pedir_aclaracion` como portadora; sus
   `parte_ids` quedan ausentes o vacíos y no producen resultados de dominio.
   Si alguna subparte necesita aclaración, la portadora es `pedir_aclaracion`; si todas
   están fuera de contrato, es `fuera_de_alcance`. No se acepta una portadora de consulta
   sin subpartes `consultar`. Una solicitud mixta no necesita una portadora adicional.
6. Una pregunta que excede los límites se rechaza para precisarla. No se recorta silenciosamente
   el inventario ni se ejecuta un prefijo. En todas las combinaciones se mantiene el tope
   de cuatro llamadas. Los argumentos de dominio se validan después de separar el metadato.

No se añade un enum por cada familia excluida. La capacidad `fuera_de_contrato` registra una
disposición; no vuelve consultable la calibración, una agregación o cualquier otra capacidad M8.
La falta de una fuente no se transforma en capacidad soportada por escoger una herramienta
que entregue números parecidos. QA contrasta el significado con un oráculo externo.

## Plan interno, resultados y salida pública

El plan validado conserva el inventario, la pregunta original y las asociaciones `parte_ids`
en cada operación. Los IDs de resultado `p1`, `p2`, etc. los asigna el runtime en el orden
ejecutable; el modelo no aporta esos IDs ni valores de resultados.

Cada resultado se corresponde con la operación esperada, su capacidad, consulta y selección.
Resultados duplicados, faltantes, ajenos o asociados a otra operación no acreditan la parte.
Si una fuente falla, se conserva el resultado tipado de indisponibilidad y las otras partes.
El contraste de entidad se hace contra el selector explícito y la consulta validada. Un
filtro amplio interpretado incorrectamente desde el lenguaje puede conservar esa
correspondencia interna; detectarlo sigue requiriendo el oráculo semántico independiente.

La salida agrega `cobertura` tanto al turno interno como al cuerpo HTTP:

```ts
interface CoberturaTurno {
  version: 1;
  estado: 'declarada_validada' | 'no_certificada';
  exhaustividad: 'no_certificada';
  partes: {
    id: string;
    texto: string;
    capacidad: InventarioDeclarado['partes'][number]['capacidad'];
    disposicion:
      | 'respondida'
      | 'fuente_no_disponible'
      | 'aclarar'
      | 'fuera_de_contrato';
    resultado_ids: string[];
    parcial?: true;
  }[];
}
```

`declarada_validada` significa correspondencia válida **entre las partes declaradas** y sus
operaciones/resultados. No significa extracción exhaustiva, corrección semántica independiente
ni aceptación del producto. Por eso `exhaustividad` permanece `no_certificada`.

La disposición final se deriva en código:

| Evidencia | Disposición final |
|---|---|
| Resultado completo `ok`, vacío verificado o ausencia verificada dentro del alcance leído | `respondida`, con los calificadores del resultado |
| Resultado parcial o fuente no disponible | `fuente_no_disponible`; se conservan datos parciales sustentados y se marca `parcial: true` cuando corresponda |
| Identidad no resuelta, selección ambigua o aclaración del ejecutor | `aclarar` |
| Operación no soportada o subparte declarada fuera del contrato | `fuera_de_contrato` |

El planner no puede declarar una parte `respondida` ni fabricar el estado de una lectura.
NULL, no leído y vacío verificado mantienen sus diferencias. Una indisponibilidad no se
rotula automáticamente como fuera de contrato. Un resultado parcial no pasa como respuesta
completa, aunque contenga todas las cifras que conoce el ejecutor.

El renderer muestra una disposición por subparte. Conserva los resultados sustentados,
declara lo pendiente y no llama costo completo de producción a una respuesta parcial.
No publica `motivo` ni `pregunta` libres de las herramientas especiales.

La respuesta se regenera y valida con la misma cobertura en el núcleo y en el manejador HTTP,
también cuando **no hay resultados** y todo el turno es aclaración o rechazo. El manejador
no puede eliminar las disposiciones al regenerar un texto desde `resultados`.

## Seguimiento y compatibilidad

- El estado efímero del servidor conserva pregunta original, inventario y asociaciones.
  D26 valida las citas contra esa pregunta guardada; una elección de opción no la sustituye.
- La reconstrucción de planes y el cambio de una consulta D26 no pierden `parte_ids` ni la
  disposición. Se recalcula la cobertura final después de ejecutar la elección.
- Una pregunta nueva obtiene un inventario nuevo. El historial ayuda a interpretar entidades
  y períodos; no hereda como autoridad el inventario del turno anterior.
- `responderTurnoDesdeFuente`, el manejador productivo y la campaña nueva exigen el contrato
  por defecto. No existe un parámetro de la solicitud HTTP que desactive esa exigencia.
- La validación antigua de operaciones y el wrapper puro `responderTurno(datos)` pueden
  conservar compatibilidad documentada como `legado_sin_certificar`. Los fixtures HTTP
  antiguos usan una dependencia interna de prueba explícita; el índice productivo no la fija.
- Toda salida de ese modo lleva `estado: no_certificada`, `partes: []` y exhaustividad no
  certificada. No se genera un inventario implícito para volver verdes los fixtures antiguos.
  Sus pruebas certifican motores o transporte, no extracción ni cobertura de la pregunta.
- Estados antiguos sin inventario no se aceptan como estados con cobertura validada.
  El nuevo recorrido independiente usa siempre el modo obligatorio.

## Comprobaciones previas a otra campaña

QA congeló ocho casos y sus oráculos antes de implementar: cuatro casos nuevos privados de
desarrollo, sustentados por la captura pareada existente del mismo corte, y cuatro casos
sintéticos contrastivos. Los dos carriles son intención aprobada→resultado/respuesta y
pregunta→Luna→plan→resultado/respuesta. La campaña prevista tiene 24 intentos y 30 turnos,
incluidos los seguimientos congelados. No se publican los casos privados de desarrollo,
sus respuestas, fuentes, referencias ni trazas. El recorrido de campaña usa autenticación
sintética y PostgREST local; no acredita JWT/RLS productivo real. Las pruebas SQL/RLS
independientes aportan evidencia sintética separada.

Antes del carril pagado se requieren **8/8** comprobaciones offline y estas cuatro mutaciones
detectadas en su frontera correcta:

| Mutación | Frontera que debe detectarla |
|---|---|
| Conservar una subparte declarada pero quitar su vínculo/operación | Validación del plan, antes de ejecutar |
| Asociar la parte a una operación de otra capacidad o a resultados de otra selección | Validación de correspondencia plan/resultado |
| Quitar o cambiar una disposición de la respuesta final | Regeneración canónica del núcleo y HTTP |
| Quitar simultáneamente una subparte del inventario y del plan | Oráculo independiente de obligaciones, aunque el plan restante sea estructuralmente válido |

La cuarta prueba es obligatoria para mostrar el límite del mecanismo. No se agrega una
heurística para que el validador diga que detecta una obligación que nunca recibió.
Los controles positivos deben conservar respuestas sustantivas; rechazar todo no satisface
la puerta. Se verifican también D26, fuentes fallidas, dinero exacto, IDs de entidad,
límite de llamadas, registro cerrado y regresiones JWT/RLS y de deriva.

La puerta offline queda en un recibo local con cero llamadas a modelos externos y costo
cero, ligado a los hashes del runtime, runner, oráculos, fuentes e inputs congelados.
Debe acreditar los ocho
casos, sus diez turnos, controles positivos y las cuatro fronteras anteriores. `--execute`
rechaza un recibo ausente, fallido o que no corresponda a los hashes actuales. Cualquier
cambio posterior exige repetir la puerta offline antes de habilitar el transporte pagado.

## Dinero, medición y siguiente puerta

La autorización incluye conservar el resumen monetario D43 y añadir el detalle exacto
sustentado. El detalle reutiliza el mismo valor del resultado, con separadores colombianos
y sin COP; no cambia el valor, el puntuador, las anclas ni las tolerancias. No se hace una
segunda cuenta para producir otra cifra. El carril offline debe demostrar que el texto exacto
corresponde a la métrica y base del resultado y que el resumen conserva su `aprox.` cuando
redondea. Esa corrección no sustituye la revisión de obligaciones.

Tras la puerta offline, Santiago autorizó **una campaña nueva de ocho casos × tres
repeticiones**, solo `openai/gpt-6-luna`, esfuerzo `none`. No se ejecuta por escribir este
contrato. El coordinador comprueba fuentes/referencias pareadas, congela código, inputs y
oráculos, y verifica el presupuesto antes de iniciarla. Los siete casos anteriores y sus
corridas permanecen intactos y separados; no se reetiquetan como esta nueva pista.

El límite sigue siendo P3 **USD 0,25 acumulados**. Antes de este añadido: gasto
USD 0,059417265; saldo USD 0,190582735. Cada llamada requiere reserva; costo desconocido,
resultado de red incierto o reserva excedida detienen la campaña sin repetición automática.
El presupuesto P4 no se usa para continuar P3. D17 conserva cerrado el held-out.

El informe posterior separa cobertura declarada, cobertura contra oráculo independiente,
corrección factual, presentación, fuente suficiente/insuficiente, aclaraciones, rechazos,
repeticiones y gasto. No cuenta repeticiones como escenarios independientes ni una negativa
segura como respuesta factual completa. El corte M4 y cualquier decisión posterior de avance
se aplican sobre evidencia válida; este contrato no levanta por sí solo el corte ni acepta P3.

## Propiedad y revisión

CTO mantiene este contrato. Backend implementa cobertura y sus pruebas; QA mantiene oráculos,
integración y mutaciones independientes. El coordinador implementa la precisión monetaria,
repite verificaciones, congela y dirige la única campaña autorizada, y actualiza el PR #434
sin forzar historial. Claude Code revisa y decide la fusión. No se crea un PR superpuesto ni
se modifica el legado, Telegram o producción. Cada nuevo módulo que alcance el bundle usa
imports relativos `.ts` y se incorpora a ambas listas de deriva exigidas por Santiago.
