# Corrección estructural tras M6: entrega de desarrollo

Fecha: 2026-11-06. Esta sesión implementa y verifica desarrollo. No es el evaluador
independiente ni concede aceptación M6.

## Base, custodia y alcance

Base exacta: PR #450, `30deebcd935b9d34c9a13182449435b875e7772f`, con runtime
`138dce3a741063ea1637cf827edb77ec87d3c946`. Composio, cuenta `thinksid`, confirmó
que el PR sigue abierto y conserva ese HEAD; `main` apuntaba a otro SHA.
El checkout gestionado de `codex/m6-correccion-estructural` parte del SHA aceptado.
El checkout principal ajeno y sus cambios permanecen intactos.
La guía compartida M5–M6 no existe en el árbol de ese SHA; se aplicó como
instrucción vigente de la sesión, sin atribuir sus bytes al baseline.

La entrega autorizada pasó las seis huellas externas y las 33 del manifiesto
interno. La extracción rechazó rutas absolutas, recorridos al padre, enlaces y
miembros especiales; directorios 0700 y archivos 0600, fuera del repositorio.
Solo contiene 22 escenarios DEV y 72 slots históricos. Originales, capturas,
referencias, votos y respuestas permanecen privados e inmutables.
No se abrió la reserva, sus carpetas ni conversaciones evaluadoras.

El diagnóstico histórico permanece **No-Go**: 234/234 turnos, 72 escenarios con
tres repeticiones, 15/22 DEV y 5/50 de la reserva completan todos sus turnos en
las tres repeticiones; respondibles 9/16 y 4/43, con tres turnos críticos.
La reserva histórica fue reutilizada y parcialmente adaptada temporalmente.
Esta entrega no recalifica esos resultados ni convierte el replay en una tasa nueva.

## Cambios funcionales

| Frente | Cambio comprobable |
|---|---|
| Intención y cobertura | Extracción previa exclusiva, contrato inmutable, intervalos de evidencia formalmente válidos (sin certificar sustento semántico), población, período/base, métricas, agrupaciones, condiciones, ranking, última observación y comparación. El plan no puede omitir o añadir transformaciones ni reescribir obligaciones. Residuales visibles. |
| Población | Excluido, seleccionado, desconocido y vacío verificado permanecen separados. Una partición excluida no publica métricas cero. La conciliación declara selección efectiva. |
| Composición | Dependencias tipadas de resultados anteriores por IDs visibles, máximo cuatro operaciones y cincuenta miembros. Varias operaciones pueden pertenecer a una obligación. Cantidades y costos plurales conservan cada aplicación y base; vacíos válidos no disparan una lectura global. |
| Hato | Poblaciones por campos registrados o clasificación del motor existente, identidad por ID y aclaración de nombres/chapetas ambiguos. Un filtro reproductivo exige vista/configuración legibles; presunta no se vuelve confirmada ni se inventa historia. |
| Analítica | Calendario diario/semanal/mensual por estación desde observaciones originales; umbrales con unidad; deltas y porcentajes con base positiva; última CE por lote, pesaje por animal y monitoreo por lote/sublote/plaga. Empates y última observación no calculable se conservan. |
| Fuentes y presentación | Plan, ejecución, cierre congelado y valoración actual separados; muestra distinta de población y producción; lluvia parcial como subtotal. Detalle limitado identifica su total. D43 conserva resumen y detalle de la misma base numérica, sin precisión significativa arbitraria previa. |
| Esquema | Registro compartido de métricas/unidades para esquema y validación; fechas fuera del ranking numérico. Tipado contextual evita una explosión de inferencia sin cambiar los bytes JSON de las herramientas. |
| Conversación y transporte | Elecciones estructuradas refinan solo la dimensión ambigua y conservan intención inicial; nuevo período explícito prevalece. Estado ligado al usuario y vencimiento comprobados. Respuesta extensa admite reenvío como historial. |

Monitoreo elige últimas observaciones antes del límite de treinta filas, para que
el prefijo de rondas antiguas no oculte la última lectura. Un placeholder posterior
`no_revisado` no reemplaza una observación; una observación posterior incompatible
sí permanece como última, sin sustituirla por una lectura antigua utilizable.
Una combinación nunca observada conserva NULL, no incidencia cero.

La disponibilidad se comprueba para las medidas solicitadas: un pH NULL ajeno no
impide responder una CE conocida. Pedir ese pH conserva la medida parcial.
Un detalle exhaustivo de un ranking usa el universo seleccionado por el ranking,
incluidos empates; el total de toda la selección sigue rotulado aparte.

## Verificación del coordinador

Las pruebas
nuevas usan oráculos literales o SQL sobre fuentes sintéticas, proveedor simulado y
HTTP real. QA y backend trabajaron por separado; el coordinador repitió sus pruebas.
El informe [QA](m6-qa.md) conserva RED, GREEN y correcciones propias del oráculo.

- Pruebas nuevas repetidas por el coordinador: 123/123 en catorce archivos.
- Tipos aprobados; lint con cero errores y 907 avisos existentes; build aprobado.
- Suite completa repetida tras el último cambio: **8.576/8.576**, 409 archivos.
- QA separada: **90/90** en diez archivos; coordinador repitió los **123/123**
  controles nuevos de las catorce familias M6 (QA y backend).
- Regresiones de M4/M5, JWT/RLS sintéticos y grafo edge conservadas; la nueva
  dependencia de historial también queda bajo la guarda de deriva existente.
- Historial: máximo doce mensajes; user hasta 4.000 unidades UTF-16, assistant
  y respuesta hasta 262.144. El modelo recibe extractos explícitos de hasta
  4.000 unidades por respuesta anterior, con cabeza y cola; no una lista completa
  aparente. Una salida textual mayor da HTTP 413 explícito, sin `respuesta` válida.
- No se modificaron `chat.tsx`, árboles heredados, Telegram, motores compartidos,
  migraciones, secretos ni configuración de dependencias.

## Desarrollo histórico: replay separado

El coordinador repitió los 72 slots de los 22 escenarios con las cinco fuentes
pareadas y recibos anteriores: 72 HTTP 200, cero excepciones, cero inferencias y
USD 0 nuevos. Identidad con el histórico: 63 resultados, 69 coberturas y 60 textos.
Son comparaciones de bytes/estructura, no puntuaciones de corrección.
El baseline reproducido conserva 69 resultados, 69 coberturas y 66 textos idénticos;
no recrea tokens opacos anteriores. La diferencia adicional refleja precisión y
estado poblacional. Los originales y cada ejecución nueva se conservan en privado.

Este replay usa intención legado explícita; no fabrica una intención desde las
referencias para simular el extractor nuevo. Los controles sintéticos prueban
la etapa nueva por HTTP, con positivos y mutaciones; no miden su exactitud real.
El adaptador de captura no demuestra JWT/RLS productivo ni un snapshot transaccional.

## Límites y rechazo de revisión automática

Dos etapas del mismo modelo no certifican comprensión semántica independiente.
La exhaustividad del lenguaje natural permanece no certificada; la nueva aceptación
debe medir extractor y planificador reales, además de fidelidad del ejecutor.
Se conservan los límites del contrato: no SQL libre, fórmulas del modelo, estado
histórico sin fuente, severidad sustituida por gravedad ni pronósticos.

La revisión automática rechazó añadir un catálogo adicional al prompt del extractor,
por posible egreso sensible sin autorización específica. Ese comando no se ejecutó,
no se reintentó por otra vía y no hubo envío. El extractor conserva los selectores
del usuario y contexto tipado válido; las comparaciones por clave exigen IDs ya
disponibles en la pregunta/contexto, o aclaración. No se presenta esa limitación
como una capacidad de resolución por nombres ya medida.

La base numérica es `Number` finito: se conserva su representación, sin afirmar
precisión decimal SQL superior a la que el transporte entrega. El estado conversacional
sigue efímero por instancia, con TTL y límites existentes. La compilación local no
acredita despliegue, acceso real del usuario ni aceptación funcional independiente.

## Propuesta concreta de siguiente evaluación

Propuesta histórica para `c85ce43b`. El encargo posterior del 2026-11-07 se rige por
[`m6-loop-protocolo.md`](m6-loop-protocolo.md): hasta **cuatro** llamadas normales
(dos extracciones y dos planes), cota recalculada por B y autorización D-L1/D-L2
delimitada. Las cifras de tres llamadas y 216 de abajo describen únicamente aquella versión.

1. Otro evaluador, en otra sesión y con custodia D17, toma el SHA final de esta entrega.
   No recibe contexto de implementación ni transfiere su reserva a estos agentes.
2. Congela versión, configuración, modelo, fuentes pareadas, preguntas, referencias,
   rúbrica y runner. Declara expresamente si reutiliza la reserva anterior. No deriva
   una reserva nueva de este DEV, sus paráfrasis o el diagnóstico.
3. Repite primero el preflight HTTP sin modelos, con intención obligatoria y proveedor
   simulado. Separa errores del arnés y del producto. Después prepara el recorrido
   pregunta → extractor real → planificador real → misma fuente → respuesta.
4. Antes de pagar, presenta la cota concreta sobre ese freeze. La ruta nueva permite
   una extracción de hasta 3.000 tokens y hasta dos propuestas de plan de 1.500:
   máximo tres llamadas por turno sin elección estructurada. Si conserva exactamente
   los 72 slots DEV, son como máximo 216 llamadas; el evaluador dimensiona su reserva
   aparte. Incluye entrada completa, tarifas verificadas, reintentos, incertidumbre y
   tratamiento de datos; no reutiliza USD 3,10 ni presupuestos anteriores como permiso.
5. Conserva escenario como unidad, tres repeticiones sin mejor intento, ≥90 % completo
   y correcto tanto DEV como reserva, imprescindibles binarios, cero críticos,
   referencias concluyentes y Wilson 95 %. Reporta costo total y latencia reales,
   fallos, guardas y parciales por separado. Esta sesión no emite el Go/No-Go nuevo.

Sin despliegue, fusión, migración, nuevas lecturas productivas, M7 ni piloto.

## Cierre de verificaciones

Huella del grafo público de runtime (70 archivos):
`257fa219d1f5051fd18abee5ff28051eecfd9de61f1fe1437af079140cc513c4`.
Runner privado v1: `b2899804b5320fedd8d03394ce604d4f3101f927579da5ad8668fca094c0b573`.
El coordinador repitió el replay sobre esta huella; QA conserva su ejecución separada.

La configuración Git de Vercel desactiva el despliegue automático únicamente para
`codex/m6-correccion-estructural`; las demás ramas conservan su comportamiento.
La publicación del PR permite CI y revisión sin abrir la puerta de despliegue.
Regla documentada por [Vercel](https://vercel.com/docs/project-configuration/git-configuration#gitdeploymentenabled).
