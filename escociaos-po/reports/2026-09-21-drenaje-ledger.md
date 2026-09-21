# Drenaje del ledger — proyecto de una sola pasada

**Fecha**: 2026-09-21 · **Pedido de Santiago**: «quiero limpiar el ledger de Notion
completo … trátalo como un solo proyecto de varias fases y no como tareas acumuladas».
**Modo**: autónomo, con punteo sólo cuando haga falta.

## Decisiones que abrieron el trabajo

Santiago contestó las 8 preguntas de arranque. Las que cambiaron el alcance:

| # | Pregunta | Respuesta | Consecuencia |
|---|---|---|---|
| 2 | ¿Ruta de escritura? | «Actualiza la ruta a composio, donde hay escritura» | PR #278 |
| 3 | ¿ESCO-117? | «Aparte por ahora, quíta el flujo de gastos» | PR #282 + migración 162 |
| 6 | ¿Cuenta Grok Bot? | «Deja la cuenta … hay que monitorearlo igual» | ESCO-122 **cerrado** |
| 7 | ¿Foto del pesaje? | «No puedo ahora, deja ese pendiente» | ESCO-124 queda abierto |
| 8 | ¿Cadencia? | «Autónomo y me punteas solo si me necesitas» | sin punteos intermedios |

## Estado del ledger

Entró con **10 fichas** sin cerrar. Al momento de este informe: **1 cerrada**, **8 en
curso con PR**, **1 aplazada por Santiago**.

| Ficha | Sev | Clase | PR | Estado |
|---|---|---|---|---|
| ESCO-114 | P1 | decision | #278 | En curso — la mitad de las Rutinas la hace Santiago |
| ESCO-115 | P2 | ddl_aditivo | #280 | En curso — migración 160 |
| ESCO-116 | P2 | datos | #279 | En curso — migración 159 |
| ESCO-117 | P2 | decision | #282 | En curso — migración 162 |
| ESCO-119 | P2 | ddl_aditivo | #281 | En curso — migración 161 |
| ESCO-120 | P3 | codigo | #278 | En curso |
| ESCO-121 | P2 | decision | #279 | En curso — migración 159 + backfill |
| ESCO-122 | P3 | decision | — | **Done** — regla escrita, cero código |
| ESCO-123 | P2 | codigo | #283 | En curso — falta identificar la foto (Santiago) |
| ESCO-124 | P3 | datos | — | Aplazada por Santiago |

## Dos causas raíz que se fusionaron

**ESCO-116 y ESCO-121 son el mismo defecto**: `fn_clima_rollup_diario` cuenta lecturas
en vez de medir cobertura temporal. Una sola migración (159) cierra las dos.

El arreglo ingenuo —anular los 29 días que el umbral llama «parciales»— habría
**destruido 19 días de radiación válida y 11 días de lluvia medida**. Los 19 días
gruesos de marzo–mayo tienen 48 lecturas porque Ecowitt sólo sirve 30 minutos más allá
de ~90 días: son días **completos** muestreados grueso, no truncados. El umbral por
conteo no los distingue; el de hueco temporal sí.

## Lo que la revisión adversarial encontró

Las cuatro migraciones pasaron por revisión adversarial con veredicto obligatorio.

- **159 → `SAFE WITH CORRECTIONS`.** Tres correcciones, todas aplicadas y empujadas.
  La sustantiva: el `CASE` que encaja la cadencia aceptaba 15–45 min como 30, mientras
  el comentario de arriba prometía «cualquier otra → NULL». Un día cuyo sync de 5
  minutos se degrade a uno cada 15 pasa la prueba de cobertura como completo y luego
  calcula el sol **al doble de la verdad**, en la misma columna donde la 151 ya embarcó
  una magnitud mal rotulada y la 158 tuvo que anular un `0,00` fabricado.
  La revisión también encontró un caso que el diagnóstico no tenía: **2026-08-27 con
  288 lecturas** —conteo completo— pero cerrando a las 15:50. Ningún umbral por conteo
  lo encuentra. La población pasó de 10 a **11 días**.
- **161 → `SAFE`.** 45 de 45 transcripciones verificadas contra el catálogo vivo, cero
  vectores de ampliación. Cerró además un agujero que el autor no había cubierto: si
  algún rol careciera de `SELECT` sobre `usuarios`, el `EXISTS` en línea daría error hoy
  y el helper `SECURITY DEFINER` tendría éxito mañana — un ensanchamiento de
  *error → permitido*. Medido: `anon` y `authenticated` ya tienen ese `SELECT`, así que
  el vector no existe.

## Un informe de agente que se refutó antes de convertirse en PR

El agente de ESCO-123 reportó que `hato_capturas_foto` no persiste el período y propuso
«un cambio de una línea en la edge function». **Producción lo refuta**: `anio` y `mes`
están poblados en las 3 filas de pesaje, y el NULL de `fecha` es el contrato del módulo
—una fecha leída de una imagen nunca se persiste—, no un hueco. La nota de memoria que
lo indujo estaba mal escrita y quedó corregida.

El hueco real es otro y no es una línea: falta el enlace entre la carga y la fila de
dominio que escribió. No se filó — la 146 tiene 8 días y hay 5 filas. Condición de
disparo anotada.

## Veredictos finales de las cuatro migraciones

| Mig. | Ficha | Veredicto | Correcciones | Filas de dominio |
|---|---|---|---|---|
| 159 | ESCO-116 + 121 | `SAFE WITH CORRECTIONS` | 3, aplicadas | UPDATE sobre **11** |
| 160 | ESCO-115 | `SAFE WITH CORRECTIONS` | 3, aplicadas | **cero** |
| 161 | ESCO-119 | `SAFE` | ninguna | **cero** |
| 162 | ESCO-117 | `SAFE WITH CORRECTIONS` | 7, aplicadas | UPDATE sobre **3** |

La 162 fue la más cargada, y por una razón que vale guardar: **reintrodujo el literal de
padrón que 103, 120 y 133 ya habían prohibido** — tres guardas comparando por igualdad
contra una población que Gerencia escribe desde Configuración → Telegram. La
pre-condición se negaba a correr si no había exactamente 3 filas con la llave, o sea
justo cuando hay **más** que limpiar. Es el veredicto de la 120 al pie de la letra, y es
la cuarta vez que el mismo error entra por la puerta.

Su otra corrección sustantiva **refutó una evidencia del encabezado**: justificaba el
costo cero por `created_by`, y eso no prueba nada porque el insert borrado sí ponía
autor. La evidencia que sostiene la conclusión es otra — las **4.534 de 4.534** filas de
`fin_gastos` están en `Confirmado` y el flujo borrado escribía `Pendiente` fijo.
Verificado en vivo.

## Orden de aplicación — NO es uniforme

Las cuatro migraciones son independientes entre sí, pero **dos tienen orden opuesto
frente al despliegue**:

- **160 → migración PRIMERO, deploy después.** El PR sí embarca un productor de
  `tipo='liquidacion'`. Al revés, el INSERT viola el CHECK, y `registrarCapturaFoto`
  devuelve `null` sin lanzar: la carga perdería en silencio justo la instrumentación
  que la migración agrega.
- **162 → también migración PRIMERO.** El borrador recomendaba deploy-primero y la
  revisión lo dio vuelta; se verificó y es correcto invertirlo. Las dos ventanas son
  inofensivas —ningún camino escribe—, así que el desempate es otro: la llave **es** la
  autorización, y desplegar primero la deja **imposible de quitar desde la interfaz y
  reescribiéndose sola**, porque el formulario se siembra desde la fila, las casillas
  salen de `TELEGRAM_MODULES` y `handleSubmit` reescribe el arreglo entero.

## Pendiente de Santiago

1. **El `go`** para aplicar las cuatro migraciones (propuesta aparte, con SQL, conteo de
   filas y rollback de cada una).
2. **Editar las tres Rutinas** para la ruta de escritura por Composio — el clasificador
   de modo automático no deja que un agente se modifique a sí mismo.
3. **Las 23 políticas de `storage.objects`** (`docs/rls_activo_storage_objects.sql`):
   no hay carril de migración que las pueda aplicar; `apply_migration` corre como
   `postgres`, que no es dueño de esa tabla (precedente 109). Van por el panel.
4. **Identificar las dos fotos** de ESCO-123.
