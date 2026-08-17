# Tablero General → Centro de Control

**Propuesta de producto** · 2026-08-16 · CPO
Ruta afectada: `/` (`src/components/Dashboard.tsx` + `src/components/dashboard/*`)

> **Revisión 2 — 2026-08-16, tras el prototipo maquetado.** El dueño revisó el prototipo y
> lo aprobó con cuatro cambios, todos incorporados: (1) se **elimina** la "Agenda: qué
> hablar con cada quien" porque el tablero lo leen todos los usuarios de Gerencia y un
> bloque por interlocutor asume un lector único (§3); (2) en su lugar va **"Acciones
> recomendadas por negocio"**, redactadas por un LLM sobre hechos ya calculados (§4,
> bloque 4); (3) **Dinero baja al penúltimo puesto**, justo antes de Salud de los datos; y
> (4) **desaparece la nomenclatura Z0…Z6 de la interfaz** — en pantalla cada bloque se
> identifica sólo por su título. El **motor** de recomendación no se diseña en esta pasada,
> por decisión explícita del dueño: lo que hay aquí es el contrato de producto del bloque
> y las preguntas que quedan abiertas (§11).

Todos los números de este documento salen de producción el 2026-08-16. Están puestos a
propósito, incluidos los feos: son los casos que el maquetado tiene que resolver.

> No existe `docs/brief-business.md` ni `docs/brief-general.md`. Para este entregable no
> hace falta: Escocia OS es una herramienta interna de un solo dueño, sin modelo de
> monetización ni segmento de mercado que condicione el alcance. Si alguna vez se abre a
> terceros, esta propuesta se revisa contra ese análisis, no antes.

---

## 1. Diagnóstico del tablero actual

Hoy el tablero responde bien tres preguntas y sólo tres: *¿qué tiempo hace?*, *¿cuánto
llevo gastado este mes?* y *¿hay alguna de estas seis cosas fuera de rango?*. Es un
índice con números. Lo que le falta para ser un centro de control no es más información:
es otro trabajo.

**Los diez huecos, en orden de gravedad.**

1. **El Hato Lechero no existe en el tablero.** Cero. 65 animales activos, el módulo más
   nuevo y el que más trabajo consumió en 2026, y la pantalla principal no muestra ni un
   litro, ni una vaca, ni una señal. Las cuatro señales derivadas ya están escritas y
   probadas (`derivarAlertasTablero`, `src/utils/hatoAlertasTablero.ts`) y viven
   únicamente dentro de `/hato-lechero`. Mientras tanto, en producción hay **11 vacas
   vacías con más de 90 días desde el parto** y **5 con la fecha de secado ya vencida**,
   y ninguna de esas 16 situaciones es alerta de nada en ninguna pantalla.

2. **No se puede hacer absolutamente nada desde el tablero.** Cada clic es un
   `navigate()`. Los 2 movimientos de ganado pendientes se *anuncian* y se confirman en
   otra pantalla. Un centro de control donde toda acción empieza por salirse no es un
   centro de control.

3. **Las "alertas" no son alertas: son observaciones sin estado.** No se pueden marcar
   como vistas, no tienen dueño, no tienen acción, y se recalculan desde cero cada 2
   minutos. Nada persiste entre visitas. Y conviven —sin saberlo— con la cola real
   `hato_alertas`, que sí tiene estado y sí manda Telegram, y de la que **63 de 64 se
   descartaron y 1 se confirmó**. Una señal que se descarta el 98% de las veces no es una
   alerta; es ruido con presupuesto de atención.

4. **El tablero se contradice con sus propios módulos.** La alerta de plagas
   (`loadMonitoreoAlertas`) promedia todas las lecturas de 14 días **sin agrupar por
   `ronda_id`** — exactamente el error que el módulo de Monitoreo tiene prohibido por
   contrato y que costó tres rondas de limpieza. El KPI de plagas de la misma pantalla sí
   agrupa por ronda. Dos números distintos para la misma pregunta, a 40 líneas de
   distancia.

5. **Los umbrales son constantes escondidas en el componente.** `avg > 10` para plagas
   (con un comentario que reconoce que no coincide con `clasificarGravedad`), `$500.000`
   para vencimientos, `7` y `14` días para aplicaciones atascadas, `50%` para la brecha de
   jornales. Ninguna es configurable ni está registrada como decisión del dueño. El resto
   de la app hace lo contrario: `hato_config` existe justamente para que ningún umbral
   viva en el código.

6. **Ningún dato dice qué edad tiene.** Último monitoreo: 3 de agosto, hace 13 días.
   Último chequeo veterinario: 9 de julio, hace 38. Último pesaje: 12 de agosto, hace 4.
   Tres relojes distintos, ninguno visible. Un número viejo mostrado sin su edad se lee
   como fresco, y ése es el modo de falla que `priorizacionMonitoreo` prohíbe
   explícitamente en su propio módulo.

7. **El "sin dato" está fabricado como cero.** `KPIS_VACIO` arranca todo en `0` y los
   `catch` devuelven `0`. Si falla la consulta de ganado, la pantalla dice **"0 cabezas"**.
   Es la regla más dura del proyecto ("sin dato nunca es 0"), rota en el sitio donde más
   se mira. Hoy mismo hay tres casos vivos que el tablero mostraría mal: agosto sin
   ningún ingreso registrado, 3 de los últimos 10 días con la lluvia en
   `contador_congelado`, y 7 de 34 vacas sin pesar.

8. **Es la única ruta de la app que ignora `modulos_acceso`.** Un Administrador con sólo
   `aguacate` ve "Cabezas de ganado" y la alerta de presupuesto. Esa última sale vacía por
   RLS, lo que produce un silencio indistinguible de "todo bien" — el mismo motivo por el
   que `/finanzas/reportes` conserva su `RoleGuard`.

9. **`QuickLinksRow` duplica el sidebar.** Cuatro botones hacia cuatro entradas que están
   dos centímetros arriba. `Guidelines.md` ya escribió esa regla ("no dupliques
   navegación") y esta fila la incumple.

10. **No hay una sola señal de aguacate más allá de plagas.** Existe `calculosCostoKg`,
    existe `priorizarMonitoreo` con recomendaciones de scouting, existe cobertura de
    ronda. Nada de eso llega a la pantalla principal.

**El resumen de una frase:** el tablero de hoy contesta *"¿cómo va?"* a medias y no
contesta *"¿qué tengo que hacer?"* en absoluto. Ése es el trabajo que falta.

---

## 2. El trabajo que el tablero tiene que hacer

Modelado sobre el día real de Santiago: vive fuera de la finca, revisa desde el celular,
escribe poco en la app (los que escriben son David en campo, Consuelito en gastos, y
Martha en papel que después se fotografía). Tres momentos, y sólo tres.

### Momento A — El barrido de las 6:00 · **celular, vertical, una mano, 60–90 segundos**

> *¿Pasó algo anoche que cambie mi día?*

No quiere números. Quiere saber si tiene que llamar a alguien antes de que arranque la
jornada. Necesita, en este orden: **qué está esperando una decisión mía**, **si llovió y
si va a llover** (decide si se fumiga hoy), y **qué está vencido**. No necesita el gasto
del mes ni las cabezas de ganado a las 6am.

El diseño se juzga contra este momento: si la primera pantalla, sin desplazar, en un
teléfono de 375px, no contesta esas tres cosas, el tablero falló.

### Momento B — El lunes · **escritorio (a veces tablet), 5–15 minutos**

> *¿Cómo va la semana y qué se me está quedando atrás?*

Aquí sí quiere números y comparaciones: jornales contra la semana anterior (45,0 vs 48,0,
−6%), gasto del mes contra lo presupuestado ($66,5M en agosto contra $144,8M en julio),
litros por vaca con su serie (15,4 · 15,7 · 14,5 · 13,9…), presión de plagas de la última
ronda con su edad. Y sobre todo: **el inventario de lo que está pendiente de él**, que hoy
no existe en ninguna parte y por eso se atrasa —la quincena de leche va tres ciclos
atrás y cada una vale entre $11M y $27M.

### Momento C — Cinco minutos antes de una conversación operativa · **celular, 2–3 minutos**

> *¿Qué hay que empujar en cada negocio esta semana?*

Éste es el momento de mayor valor y hoy **no lo sirve ninguna pantalla de la app**.
En el hato: los nombres de las 11 vacas vacías con más de 90 días, las 5 con secado
vencido, que el último chequeo fue hace 38 días, que se pesaron 27 de 34. En aguacate:
que los huevos de ácaro van en 25,5% sobre 420 árboles en la ronda del 3 de agosto,
que hay dos aplicaciones en ejecución desde hace 12 días sin cerrar, y que la enmienda
arranca en 2 días.

Es una lista para leer en voz alta. No es un reporte.

**La unidad de este momento es el negocio, no la persona.** La primera versión de este
documento lo organizaba por interlocutor ("Con Martha", "Con Efraín"). Cambió el
2026-08-16 por decisión del dueño; el razonamiento completo está en §3, y se resume en
que el tablero lo leen **todos los usuarios de Gerencia** y las relaciones personales de
uno no son las del otro. El negocio sí es el mismo para todos.

**Un cuarto momento que deliberadamente NO se sirve:** el análisis mensual o anual. Eso es
`/finanzas/reportes` y `/produccion`, que ya lo hacen bien y con las notas al pie que el
número necesita para no mentir. El tablero no compite con ellos.

---

## 3. Arquitectura de información

Siete bloques, en este orden vertical, idéntico en móvil y escritorio (lo que cambia es el
número de columnas dentro de cada bloque). Cada uno justifica su sitio contra un momento.

> **En pantalla no aparece ninguna numeración.** Cada bloque se identifica **sólo por su
> título de sección** — "Requiere tu decisión", "Hoy en la finca", "Pulso por negocio",
> "Acciones recomendadas", "Dinero", "Salud de los datos". Los números de este documento
> son referencia editorial, para poder citarlos aquí y en el maquetado. Si alguno se filtra
> a la interfaz ("Z5", "Zona 4"), es un error de implementación: son jerga interna y no
> significan nada para quien lee el tablero.

| # | Sección (así se titula en pantalla) | Sirve a | Por qué está ahí |
|---|---|---|---|
| 0 | Barra de estado | A | Una línea. En un día tranquilo es todo lo que hay que leer |
| 1 | **Requiere tu decisión** | A, B | Lo único con acción directa. Va primero porque es lo único irreemplazable |
| 2 | Hoy en la finca (clima) | A | Segundo porque es lo único que cambia entre las 6 y las 8 de la mañana |
| 3 | Pulso por negocio | B | El "cómo va". Tres tarjetas, una por negocio |
| 4 | **Acciones recomendadas** | C | Qué empujar en cada negocio, con la evidencia debajo |
| 5 | Dinero | B | Penúltimo a propósito: es contexto, no disparador de la jornada |
| 6 | Salud de los datos (colapsada) | B | Lo que hace auditable todo lo de arriba |

**Se corta `QuickLinksRow`**: duplica el sidebar y no responde a ningún momento.

**Por qué Dinero baja al penúltimo puesto.** Antes iba justo después del pulso. El gasto
del mes no cambia lo que se hace hoy: es contexto, no disparador, y en la mitad de la
pantalla compite por la atención con lo que sí dispara algo. Queda como el último dato duro
antes de la Salud de los datos, que es su nota al pie natural — "$66,5M gastados en agosto"
y "faltan tres quincenas de leche por registrar" piden leerse juntos, no a dos pantallazos
de distancia.

### La decisión que hay que registrar: por qué se elimina la agenda por persona

La versión anterior de este documento tenía como quinto bloque una **"Agenda: qué hablar
con cada quien"** — tres tarjetas, una por interlocutor: Martha, Efraín/David, Consuelo.
**Se elimina.** El motivo es de producto y conviene dejarlo escrito, porque es exactamente
la clase de decisión que alguien va a querer reabrir dentro de seis meses:

> El tablero lo ven **todos los usuarios de Gerencia**, no un lector único. Un bloque
> organizado por interlocutor asume que quien mira es Santiago y que sus relaciones son las
> de todos. Para cualquier otro usuario de Gerencia, "Con Martha" es una lista de encargos
> ajenos: no sabe si ya se hablaron, no puede accionarlos, y el bloque le ocupa un tercio
> de la pantalla principal. Un bloque que sólo tiene sentido para un lector no pertenece a
> una pantalla compartida.

De ahí sale una **regla general del tablero, no sólo de este bloque**: *ninguna sección se
organiza alrededor de un lector concreto ni de sus relaciones personales.* Las unidades
admisibles son el **negocio**, el **módulo** y el **objeto de trabajo** (la vaca, el lote,
la aplicación). Es lo que permite que la misma pantalla sirva a varias personas sin
duplicarse ni personalizarse.

Lo que **no** se pierde son los hechos. Los nombres de las 11 vacas vacías con más de 90
días, las 5 con secado vencido, la ronda de hace 13 días, las dos aplicaciones colgadas:
todo eso seguía siendo el contenido más valioso de la agenda. Dejan de ser el bloque y
pasan a ser **la evidencia** que sustenta cada acción recomendada (§4, bloque 4). Cambia el
envoltorio, no los datos.

**Relación con el pulso (bloque 3):** el bloque 3 muestra **conteos y tendencias**; el
bloque 4 muestra **qué hacer y sobre qué evidencia**. Un chip del bloque 3 ("16 por
revisar") lleva a la evidencia de la acción correspondiente. Nunca el mismo hecho en dos
formatos en la misma pantalla.

---

## 4. Inventario de bloques

Formato por bloque: **pregunta · dato y fuente real · regla de sin dato · acción · coste**.
El bloque 4 es la excepción y se especifica aparte: no tiene una fuente única sino un
contrato (qué forma tiene una acción, cuántas caben, y las barreras contra el invento).

### Bloque 0 — Barra de estado

| | |
|---|---|
| **Pregunta** | "¿Tengo que leer esta pantalla hoy?" |
| **Dato** | Saludo + fecha larga en español + conteo de filas del bloque 1. `obtenerFechaHoy()` (`src/utils/fechas.ts`) — **nunca** `toISOString().slice(0,10)`, que en Bogotá ya es mañana después de las 19:00 |
| **Sin dato** | Mientras carga: skeleton de una línea. Nunca "0 pendientes" antes de saberlo |
| **Acción** | Ninguna |
| **Coste** | **Bajo** — reemplaza `EstadoHeader.tsx`, que ya hace algo parecido |

---

### Bloque 1 — Requiere tu decisión

Regla de admisión, y es la decisión de diseño más importante del documento: **aquí sólo
entra lo que tiene dueño = Santiago y un botón que lo resuelve.** Una observación sin
acción ("la incidencia subió") no entra: se va a la tarjeta de su negocio. Mezclar
"confirma este movimiento" con "las plagas subieron" es exactamente lo que hizo que
`hato_alertas` acumulara 63 descartes.

#### 1.1 · Movimientos de ganado pendientes de confirmar

| | |
|---|---|
| **Pregunta** | "¿Qué compra o venta de ganado está esperando que yo diga en qué potrero quedó?" |
| **Dato hoy** | **2 pendientes** |
| **Fuente** | `gan_movimientos` con `estado='pendiente'` → `useGanadoInventario.countPendientes()` / `fetchMovimientos()`. Ya se consulta desde el tablero |
| **Sin dato** | Si la consulta falla, la fila no aparece y el bloque muestra "No se pudo leer ganado". Nunca "0 pendientes" |
| **Acción** | **Confirmar aquí mismo**: `Dialog size="md"` con potrero + reparto novillos/toros (la suma debe igualar las cabezas de la transacción, `calculosGanado` ya valida). Segunda acción: Descartar |
| **Coste** | **Bajo** — `confirmarPendiente`/`descartarPendiente` y la validación pura ya existen; es reutilizar el diálogo de `/ganado/movimientos` |

#### 1.2 · Quincena de leche sin registrar

| | |
|---|---|
| **Pregunta** | "¿Ya facturé la leche de la quincena que cerró?" |
| **Dato hoy** | Última registrada: **2026-07 Q2 → 5.938 L / $11.608.790**. Hoy es 16 de agosto: **faltan tres quincenas** |
| **Fuente** | `hato_produccion_quincenal` (última fila por `anio/mes/quincena`) contra `resolverQuincena`/`rangoQuincena` (`calculosHato.ts`, puras). Los litros de una fila `medido` viven en `fin_ingresos.cantidad` vía el FK — `litros_total` es NULL por contrato (migración 070); leerlo directo es el error clásico de este módulo |
| **Sin dato** | Sin ninguna fila: "Sin registro de quincena". Nunca 0 litros ni $0 |
| **Acción** | Abre `ProduccionQuincenalDialog`. **Gerencia-only** (escribe `fin_ingresos`); para otros roles la fila ni se calcula |
| **Coste** | **Medio** — el diálogo existe pero vive acoplado a `ProduccionView`; extraerlo o entrar con un parámetro de ruta es decisión del CTO. La función "qué quincena debería estar registrada" hay que escribirla (pequeña, sobre `resolverQuincena`) |
| **Por qué importa más que ninguna otra** | Es la única serie del hato atada a dinero. Cada quincena sin capturar es entre $11M y $27M que hoy no están ni en el P&G ni en el flujo de caja, y la app los presenta indistinguibles de "no vendimos" |

#### 1.3 · Aplicaciones colgadas o que arrancan ya

| | |
|---|---|
| **Pregunta** | "¿Cuál aplicación tengo sin cerrar y cuál arranca esta semana?" |
| **Dato hoy** | "Drench agosto" y "Fumigación control monalonion agosto": **En ejecución desde el 4 de agosto, 12 días**. "Aplicacion Enmienda": Calculada, **arranca el 18 de agosto, en 2 días** |
| **Fuente** | `aplicaciones` (`estado`, `created_at`, `fecha_inicio_planeada`). Ya se consulta |
| **Sin dato** | Sin filas, no aparece la fila |
| **Acción** | "Ir al cierre" → `/aplicaciones/:id/cierre`. **No se cierra desde el tablero**: cerrar una aplicación es un formulario con consumo real de producto y trazabilidad GlobalGAP, no un botón |
| **Coste** | **Bajo** — la consulta existe. Nuevo: el caso "arranca en N días", que hoy no se muestra en ninguna parte |

#### 1.4 · Gastos pendientes de confirmar

| | |
|---|---|
| **Pregunta** | "¿Hay plata registrada que todavía no cuenta?" |
| **Dato hoy** | **0** — la fila no se muestra |
| **Fuente** | `fin_gastos` con `estado='Pendiente'`. Es la misma exclusión que aplica todo el motor contable |
| **Sin dato** | No aplica: si no se puede leer, no se muestra la fila |
| **Acción** | `/finanzas/gastos?tab=historial` con el filtro puesto |
| **Coste** | **Bajo** |

#### Lo que NO entra a este bloque

- **El chequeo veterinario vencido.** Hoy van 38 días sobre una cadencia real de 63–234.

  > **Corregido 2026-08-17 contra producción.** Este documento decía "65–71", y ese rango es
  > falso: los intervalos reales entre los últimos 8 chequeos son **71, 63, 92, 63, 105, 71,
  > 234 y 81 días**. No hay cadencia estable — hay una mediana de ~71 con una varianza enorme.
  > La conclusión operativa no cambia (38 días no es abandono), pero **se refuerza**: cualquier
  > temporizador de intervalo fijo por debajo de 63 días dispararía antes del chequeo en los
  > ocho casos. Es el dato que sostiene la decisión de disparar la revisión de productividad
  > del hato **por evento** y no por intervalo (ver `brief_tecnico_motor_acciones.md`, O-8).
  A 38 días esto no es una acción, es frescura: va al bloque 6. Sube al bloque 1 sólo
  pasados los **75 días**. Ponerlo antes es el error que la operación de mantenimiento ya
  documentó ("cero chequeos nuevos NO es señal de abandono antes de esa fecha").
- **La cola `hato_alertas`.** Ver §5.

---

### Bloque 2 — Hoy en la finca

#### 2.1 · Clima ahora + pronóstico + lluvia de los últimos días

| | |
|---|---|
| **Pregunta** | "¿Se puede fumigar hoy?" |
| **Dato hoy** | Lectura actual (temp/humedad/viento/radiación) + pronóstico 3 días. Últimos 10 días: **08-15 0,00 · 08-14 0,00 · 08-13 s/d · 08-12 0,25 · 08-11 0,00 · 08-10 s/d · 08-09 0,25 · 08-08 s/d · 08-07 0,51 · 08-06 0,25** |
| **Fuente** | `clima_lecturas` vía `useClimaData` (ya montado) + edge `/clima/forecast` (mejora progresiva: si falla, se omite la fila sin romper). La franja de días: `clima_resumen_diario` **leída siempre por `lluviaConfiableDeResumen()`** (`calculosClima.ts`) |
| **Sin dato** | **Es el caso normal, no el borde: 3 de 10 días.** Un día con `lluvia_confianza = 'contador_congelado'` renderiza **`s/d`** en gris rayado y suma al pie "3 de 10 días sin dato de lluvia — el contador del pluviómetro no se reinició". Nunca una barra de 0 mm: se ve idéntica a un día seco real |
| **Acción** | Ninguna. Link a `/clima` |
| **Coste** | **Bajo** — la `ClimaCard` existe. Se le añade la franja de 10 días y el pie de confianza |

#### 2.2 · Lo programado para hoy y esta semana

| | |
|---|---|
| **Pregunta** | "¿Qué se supone que se hace hoy en la finca?" |
| **Dato** | `tareas` con `estado IN ('Programada','En Proceso')` y `fecha_estimada_inicio`/`fecha_estimada_fin` dentro de la semana |
| **Fuente** | `tareas` (la interfaz ya trae `fecha_estimada_inicio`, `prioridad`, `responsable`) |
| **Sin dato** | "Nada programado para hoy" — honesto: el Kanban puede estar sin planear |
| **Acción** | Cambiar estado desde el tablero: `TareaEstadoSelect` ya es un componente aislado |
| **Coste** | **Medio** — consulta nueva, control existente |
| **Riesgo a verificar antes de construirlo** | Si `fecha_estimada_inicio` no se llena en la práctica, esta tarjeta sale vacía siempre y es peor que no tenerla. **Medir la tasa de llenado antes de la Ola 2**; si es baja, el bloque no se construye — se propone en su lugar hacer el campo obligatorio en el Kanban |

---

### Bloque 3 — Pulso por negocio

#### 3.1 · Tarjeta Hato Lechero  *(módulo `hato_lechero`)*

| | |
|---|---|
| **Pregunta** | "¿Cuánta leche está dando el hato y va subiendo o bajando?" |
| **Dato hoy** | **15,4 L/vaca** · 416,5 L el 12 de agosto. Serie de 8 puntos: 15,4 · 15,7 · 14,5 · 13,9 · 14,0 · 13,5 · 14,7 · 15,9 |
| **Fuente** | `hato_pesajes_leche` → `rendimientoPorVaca` / `proyectarHato` (`src/utils/hatoProduccion.ts`, puro y testeado). Frescura: `chipVejezPesajes` (`hatoUi.ts`), hoy 4 días, nivel ok |
| **Denominador declarado, obligatorio** | **"27 de 34 vacas pesadas"** visible bajo el número, no en un tooltip. Es la regla R-4 del módulo: el total del hato nunca se muestra sin decir sobre cuántas vacas se midió, porque la cobertura se ha movido de 20 a 28 sin declararse |
| **Sin dato** | Sin pesajes: `—` + "Sin pesaje registrado". Una vaca sin pesar **no entra al promedio** — no cuenta como 0 |
| **Línea de revisión** | "**16 por revisar**: 11 vacías con más de 90 días · 5 con secado vencido" → abre la **evidencia** de la acción recomendada del hato (bloque 4). Si el motor no tiene ninguna acción viva para el hato, el mismo enlace lleva a `/hato-lechero` con el filtro puesto: la línea de revisión nunca queda muerta por culpa del motor |
| **Acción** | Ninguna directa. Link a `/hato-lechero` |
| **Coste** | **Medio.** `usePesajesYPartos` y `rendimientoPorVaca` existen; montar el hook en el tablero es lo nuevo. **Las dos señales de revisión no existen hoy como tales**: `derivarAlertasTablero` mezcla `secado_due` (vencido) con `proxima_a_secar` (todavía no) en una sola lista, y "vacía con más de 90 días" nunca se ha expuesto fuera de la ficha. Separarlas es trabajo nuevo, pequeño, en `hatoAlertasTablero.ts` |

#### 3.2 · Tarjeta Aguacate  *(módulo `aguacate`)*

| | |
|---|---|
| **Pregunta** | "¿Qué plaga está apretando y desde cuándo no miramos?" |
| **Dato hoy** | **Huevos de ácaro 25,5%** (107/420) · Ácaro 16,0% (67/420) · Monalonion 11,4% (20/175). Ronda del **3 de agosto, hace 13 días** |
| **Fuente** | `monitoreos` **agrupado por `ronda_id`, nunca por `fecha_monitoreo`** (una ronda cruza varios días); `calcularIncidencia(Σafectados, Σmonitoreados)`; colores de `clasificarGravedad` (cortes 10% / 30%). Semántica de color **invertida**: subir es rojo |
| **Sin dato** | Una plaga sin lectura en la ronda actual **no aparece** — nunca 0%. Sin ronda en la ventana: "Sin monitoreo reciente" |
| **Frescura** | Chip "Ronda del 3 de agosto · hace 13 días", en ámbar pasados 14 días |
| **Acción** | Link a `/monitoreo`. Segunda línea: "2 aplicaciones en ejecución" (el detalle vive en el bloque 1) |
| **Coste** | **Bajo-medio** — la consulta existe. Lo nuevo es unificar el agrupamiento por ronda entre el KPI y la alerta, que hoy discrepan |
| **Mejora de Ola 2** | Sustituir el top-3 por la primera línea de `priorizarMonitoreo` (sublote + plaga + el porqué), que es una recomendación y no un promedio. Cuesta 6 consultas: por eso no va en la Ola 1 |

#### 3.3 · Tarjeta Ganado  *(módulo `ganado`)*

| | |
|---|---|
| **Pregunta** | "¿Cuántas cabezas tengo y dónde?" |
| **Dato hoy** | **369 cabezas** = 222 novillos + 147 toros. Escocia 197 · santimp 67 · Carrizal 45 · Mochuelos 23 · Andalucía 19 · Maryland 18 |
| **Fuente** | `gan_inventario` → `calcularKPIsInventario` / `calcularVariacion` (`calculosGanado.ts`). El tablero ya usa este hook |
| **Sin dato** | Fallo de consulta: `—`, jamás 0 |
| **Cabezas/ha: NO se muestra** | `gan_fincas.hectareas = 0,00` en las **6** fincas, así que `calcularKPIsInventario` devuelve `cabezasPorHa: null` — correctamente. Mostrarlo sería un `—` permanente. **Trabajo que lo desbloquea**: capturar 6 hectáreas en Configuración → Ganado. Formulario que ya existe, seis campos, y enciende el KPI en todo el módulo. Va como recomendación, no como bloqueo |
| **Dato sucio real a exhibir** | La finca "santimp" está sin normalizar. El tablero la muestra tal cual: si el nombre está mal, que se vea |
| **Acción** | Link a `/ganado` |
| **Coste** | **Bajo** |

---

### Bloque 4 — Acciones recomendadas  *(título en pantalla: "Acciones recomendadas")*

Tres tarjetas, **una por negocio** — Hato Lechero, Aguacate Hass, Ganado —, en el mismo
orden y con el mismo ancho que las del pulso, para que el ojo mapee tarjeta con tarjeta.
Cada tarjeta contiene entre 0 y 3 acciones **redactadas y priorizadas por un LLM sobre
hechos que el sistema ya calculó**.

**Qué es:** la respuesta a *"¿qué habría que empujar en este negocio esta semana, y por
qué?"*, en frases que se pueden leer en voz alta, cada una con la evidencia que la
sostiene.

**Qué NO es:** no es un chat, no es un resumen narrativo de la semana, no es un feed, y
**no reemplaza al bloque 1**. El bloque 1 es lo que sólo se puede resolver desde arriba y
tiene un botón que lo cierra. El bloque 4 es lo que conviene empujar, y su valor está en la
priorización, no en la ejecución.

> **Este bloque cambia una recomendación anterior de este documento, y conviene decirlo.**
> La versión previa recomendaba explícitamente *no* meter un LLM en el tablero hasta la Ola
> 3, por latencia, costo y riesgo de un número inventado. El dueño decidió lo contrario y
> la decisión es suya. Las tres objeciones no se archivan: se convierten en las restricciones
> duras de abajo. La objeción de fondo —"si algún día Esco participa, que escriba el *texto*
> sobre números ya calculados, nunca que los calcule"— es hoy la regla R-1 del bloque.

#### 4.1 · Las siete barreras contra el invento

Poner texto de un LLM en la pantalla donde se decide es el riesgo obvio del bloque. Estas
son reglas, no sugerencias: **una implementación que incumpla cualquiera de ellas no se
libera.**

**R-1 · El motor redacta y prioriza. Nunca calcula.** Todo número que aparezca en el bloque
—litros, porcentajes, días, cabezas, pesos, kilos— entra al motor **ya computado** por el
mismo data layer que alimenta el pulso (`calculosHato.ts`, `hatoAlertasTablero.ts`,
`calculosMonitoreo.ts`, `calculosGanado.ts`, `priorizacionMonitoreo.ts`) y sale a pantalla
**desde ese mismo objeto tipado**. El modelo elige qué decir y en qué orden; no produce
aritmética.

**R-2 · Ninguna cifra visible puede tener como origen el texto del modelo.** No basta con
pedírselo en el prompt. La propiedad que hay que garantizar mecánicamente es: *si el modelo
escribe un dígito por su cuenta, ese dígito no llega a la pantalla.* Dos mecanismos válidos
—plantilla con ranuras tipadas que el renderizador sustituye, o validación posterior que
rechaza la acción si su texto libre contiene un literal numérico no declarado— y **cuál se
usa es decisión del CTO**. Lo que no es negociable es que exista uno.

**R-3 · Una acción sin evidencia no se publica.** La evidencia son 1 a 3 hechos, cada uno
con su cifra, su fuente y su fecha. Se ve **sin desplegar** en escritorio. Es lo que hace
auditable el bloque de un vistazo: si la frase no cuadra con los hechos que tiene debajo,
el lector lo nota sin salir de la pantalla y sin confiar en nadie.

**R-4 · Una acción sin destino no se publica.** Cada acción declara la pantalla, el filtro
o el diálogo que la resuelve. Si el motor propone algo que no se puede accionar desde
ninguna parte de la app, el bloque lo descarta antes de renderizar. Es la misma regla de
admisión del bloque 1, aplicada un escalón más abajo, y es lo que impide que el bloque
degenere en consejos genéricos ("hacer seguimiento a la reproducción").

**R-5 · El motor no consulta la base de datos.** Recibe un paquete cerrado de hechos ya
calculados y nada más: sin herramientas, sin SQL, sin navegación. **No se conecta a las 33
herramientas de Esco.** Un modelo sin acceso no puede inventarse una cifra que no le
dieron; sólo puede redactar mal, que es un fallo visible en pantalla y no un fallo silencioso
en un número.

**R-6 · El contexto conversacional entra como texto citado, jamás como fuente de cifras.**
Si el paquete incluye notas de comités o llamadas (§4.4), el motor puede apoyarse en ellas
para *priorizar* ("esto se acordó hace dos semanas y sigue sin moverse") y debe citarlas
como evidencia con su fecha. Pero **una cifra dicha en una reunión no es un dato del
sistema**: si el acta dice "vamos en 300 novillos" y `gan_inventario` dice 369, en pantalla
va 369. La única forma admisible de mostrar el número del acta es entrecomillado y
atribuido, junto al del sistema, como una discrepancia.

**R-7 · Sin dato sigue siendo sin dato.** El motor recibe los huecos marcados como huecos
(7 de 34 vacas sin pesar, 3 de 10 días con la lluvia en `contador_congelado`, agosto sin
ingresos) y tiene **prohibido tratarlos como ceros o como caídas**. "Completar el pesaje de
las 7 vacas que faltaron el 12 de agosto" es una acción válida y buena. "La producción
cayó" derivado del mismo hueco es una alucinación, y es la más peligrosa de todas porque
suena razonable.

**Validación al pintar, no al generar.** Además de las siete, una regla de frescura que
resuelve sola el caso más común de vergüenza: **al renderizar, cada acción se coteja contra
el data layer fresco; si el hecho que la sostiene ya no existe, la acción no se muestra.**
Si Martha marcó preñada a una de las 11 vacías a las 7 de la mañana, la acción de las 5:45
desaparece sola. Sin esto, el bloque envejece entre generación y lectura, que es
exactamente el defecto que hizo ruido a `hato_alertas`.

#### 4.2 · Anatomía de una acción

Cinco partes, en este orden de arriba abajo. Las cuatro primeras son obligatorias.

| Parte | Contenido | Quién lo produce |
|---|---|---|
| **1. La acción** | Una frase imperativa, verbo primero, **una línea** (≈90 caracteres, nunca dos líneas en escritorio). *"Revisar las 11 vacas vacías con más de 90 días desde el parto."* | LLM (texto) + data layer (cifras, R-2) |
| **2. La evidencia** | 1 a 3 hechos, uno por línea, cada uno con cifra + fuente + fecha. *"11 de 65 vacas vacías, >90 d desde el parto — `v_hato_estado_actual`, hoy"* · *"Último chequeo veterinario: 9 de julio, hace 38 días"* · *"Sólo 2 servicios registrados en 90 días"* | **Data layer, íntegramente** |
| **3. El botón** | Exactamente **uno** primario, que resuelve o lleva al sitio con el filtro puesto: *"Ver las 11 vacas"* → `/hato-lechero` filtrado. Nunca dos botones primarios compitiendo | Data layer (R-4) |
| **4. La procedencia** | Chip discreto al pie de la tarjeta, no de cada acción: *"Sugerido · hoy 05:45"*. El lector tiene que saber que esto lo escribió una máquina y de cuándo es | Sistema |
| **5. El descarte** *(opcional en pantalla, obligatorio en el modelo de datos)* | Acción secundaria en `ghost`: **"No es útil"**. Es la única señal de calidad que vamos a tener del motor, y es la que decide si el bloque vive o se retira (§7) | Usuario |

**El descarte es compartido y atribuido**, no personal: la acción es sobre el negocio, no
sobre el lector, así que si un usuario de Gerencia la descarta desaparece para todos y
queda la traza *"descartada por Santiago el 16 de agosto"* en una línea colapsada al pie.
Es la consecuencia coherente de la decisión de §3 (el tablero no se personaliza). Si en la
práctica genera roces entre usuarios de Gerencia, se revisa — pero se arranca así.

#### 4.3 · Cuántas, en qué orden, y qué pasa cuando no hay

**Cuántas.** Máximo **3 por negocio**, máximo **9 en pantalla**. El orden dentro de la
tarjeta lo fija el motor y la interfaz **no lo reordena** (reordenar por criterios propios
haría imposible evaluar si el motor prioriza bien). En móvil se pinta la **primera de cada
negocio** expandida y el resto bajo *"ver N más"* — tres tarjetas de tres acciones con su
evidencia son 20+ filas de scroll para un momento de uso de dos minutos.

**Sin solapamiento con el bloque 1.** Una acción recomendada **nunca repite** una fila de
"Requiere tu decisión". La lista de lo que ya está arriba se le pasa al motor como
exclusión, y la deduplicación es determinística, no un ruego en el prompt. Si falta la
quincena de leche, eso vive en 1.2 con su botón; el bloque 4 no lo menciona.

**Los cuatro estados que hay que maquetar.** Ninguno es un caso raro: dos de ellos van a
verse en producción la primera semana.

| Estado | Qué se ve | Regla |
|---|---|---|
| **Con acciones** | 1–3 acciones por tarjeta | El caso normal |
| **Vacío honesto** (el motor corrió y no hay nada) | La tarjeta del negocio muestra una sola línea: *"Sin acciones recomendadas para el hato hoy"* + el chip de generación | **Prohibido rellenar.** Nada de genéricos ("seguir monitoreando"), nada de bajar el umbral para llenar la tarjeta. Un bloque que siempre tiene tres acciones enseña a ignorarlo, que es exactamente lo que le pasó a `hato_alertas` (63 de 64 descartadas) |
| **Todos vacíos** | La sección entera colapsa a **una línea verde con check**: *"Nada recomendado hoy · última revisión hoy 05:45"* | Mismo tratamiento que el bloque 1 vacío. No ocupa un tercio de pantalla para decir que no hay nada |
| **Motor no disponible** (falla, sin clave, sin corrida, o corrida de hace más de 48 h) | **Una línea gris**: *"Las acciones recomendadas no están disponibles ahora."* + enlaces a los tres módulos | **Nunca** un error técnico en pantalla. **Nunca** acciones viejas sin decir que son viejas: pasadas 48 h el bloque se comporta como no disponible, porque una acción rancia sobre datos que ya cambiaron es peor que ninguna. Y **el fallo no toca nada más**: el bloque es aditivo, ningún otro bloque depende de él |

**El bloque nunca está en el camino crítico.** Se genera fuera de la carga de la pantalla y
se lee de una caché. Si no está listo cuando el tablero pinta, no se renderiza y punto — el
bloque 1 sigue siendo lo primero que aparece, en un teléfono con mala conexión, sin esperar
a nadie (restricción de producto de §10, intacta).

#### 4.4 · De dónde saldría el contexto de los comités — lo que hay hoy, de verdad

Santiago pidió "conectar esto por detrás con la BD de llamadas de Escocia para traer
contexto de los comités semanales". Se revisó el código antes de prometer nada:

**No existe ninguna base de datos de llamadas en Supabase.** Ni tabla, ni vista, ni columna.
Lo que existe es una **base de Notion**, consultada por HTTP desde una sola función del
edge server:

| | |
|---|---|
| **Qué es** | Base de Notion `31167755ed688015a5c4f09e04cd65f5`, leída por `fetchResumenesNotion()` en `src/supabase/functions/server/generar-reporte-semanal.tsx` (y su copia espejo en `supabase/functions/make-server-1ccce916/`) |
| **Quién la usa hoy** | **Sólo el reporte semanal.** Su texto se concatena al prompt del LLM que redacta el reporte, bajo el encabezado "LLAMADAS CON PROPIETARIO — ÚLTIMAS 4 SEMANAS". Nada más en la app la lee |
| **Qué estructura tiene** | Propiedades `Date` (fecha) y `Name` (título). El cuerpo se lee como bloques hijos: los `to_do` **sin marcar** se extraen como *"Compromisos pendientes"*, y los `paragraph` / `bulleted_list_item` / `numbered_list_item` / `heading_2` / `heading_3` se aplanan en *"Temas discutidos"* **truncados a las 5 primeras líneas** |
| **Cuánto trae** | Las **4 páginas más recientes** por `Date` descendente. Sin filtro de fecha: si la última reunión fue en mayo, trae mayo y la llama "últimas 4 semanas". Y sólo los bloques de **primer nivel, sin paginar** (el `has_more` de Notion se ignora): lo que esté dentro de un *toggle*, una columna o una subpágina **es invisible** |
| **Con qué cadencia se llena** | **No lo sabe el código, y no hay nada en el repo que lo diga.** La llena una persona o una herramienta externa en Notion; la app sólo lee. Cualquier promesa de cadencia hay que confirmarla con Santiago, no inferirla |
| **Se puede leer desde donde correría el motor** | **Sí, si el motor corre en el edge function.** Necesita `NOTION_TOKEN`, que es un secreto del servidor. **No** es alcanzable desde el navegador: el token no puede viajar en el bundle. Esto no es un detalle de implementación — **decide dónde vive el motor** |
| **Degradación** | Sin token, o si Notion responde mal, `fetchResumenesNotion()` devuelve cadena vacía y el reporte sale igual. El mismo patrón sirve para el motor: sin contexto de comités, hay acciones sin esa evidencia, no ausencia de acciones |

**Tres advertencias que conviene tener antes de la sesión del motor, no después:**

1. **Es la fuente menos gobernada de todas las que tocaría este tablero.** No tiene esquema
   forzado, no tiene RLS, no tiene tests, la llena una persona a mano y una llamada mal
   titulada o un `to_do` mal marcado cambia el texto que ve el modelo. Todo lo demás en el
   tablero sale de tablas con constraints. Por eso R-6 existe.
2. **La base de Notion del PO es otra distinta** (*Escocia OS — Mantenimiento*, hallazgos de
   la operación de mantenimiento, `escociaos-po/CLAUDE.md`). No confundirlas: la de
   hallazgos está viva y documentada; la de llamadas sólo se conoce por su id embebido en
   el código.
3. **`esco_memorias` (migración 041) no es esto y no sirve para esto.** Es memoria de largo
   plazo de Esco, **por usuario** (`user_id`, RLS `user_id = auth.uid()`), escrita sólo
   cuando alguien le dice "guarda esto" y confirma, tope de 50 filas activas. Alimentar un
   bloque compartido con memorias privadas de un usuario reintroduce por la puerta de atrás
   exactamente el problema que hizo eliminar la agenda por persona (§3). **No es candidata.**

**Recomendación de producto:** el contexto de comités es un **enriquecedor de prioridad,
no una fuente de acciones**. La primera versión del motor debería funcionar entera sin él y
verificar que las acciones son buenas; sólo entonces se le suma Notion, y se mide si las
prioriza mejor. Conectar primero la fuente sucia y evaluar después es la vía rápida a un
bloque en el que nadie confía.

---

#### 4.5 · La capa de evidencia — lo que sobrevive de la agenda eliminada

La agenda por persona (§3) desapareció, pero **los hechos que la componían son ahora la
evidencia de este bloque** y hay que derivarlos igual. Se listan porque son trabajo
concreto, medible, y son el insumo sin el cual el motor no tiene de qué agarrarse: es el
paquete cerrado del que habla R-5. Nótese que ya no se agrupan por interlocutor sino por
negocio.

**Hato Lechero.** 11 vacías con >90 días desde el parto **con nombre y días** · 5 con
secado vencido y sus días de vencimiento · 7 de 34 sin pesar el 12 de agosto · último
chequeo hace 38 días · sólo **2 servicios en 90 días** contra 300 partos históricos · 65
vacas sin raza registrada.
*Fuente:* `v_hato_estado_actual` → `derivarEstadoReproductivo` (`calculosHato.ts`) →
`derivarAlertasTablero` extendido. Umbrales desde `hato_config`
(`dias_espera_voluntaria_post_parto` = 90), nunca constantes.
*Sin dato:* una vaca sin `ultimo_parto_fecha` **no entra** a "vacías >90 días" — no se
infiere una fecha.
*Identidad:* `AnimalLabel`, que lidera con el **nombre** cuando la chapeta es provisional
(800–999) o nula; "sin caravana" nunca es un blanco.
*Escritura:* ninguna desde el tablero. Marcar un ciclo pasa por `MarcarCicloDialog` con su
gate de rol y su decisión de tipo de evento; hacerlo en fila desde una lista de 11 invita
al error.
*La señal que no se puede dejar pasar:* 2 servicios en 90 días con 20 preñadas de 65 es, o
un hueco de captura, o un problema reproductivo real. El sistema hoy no puede distinguirlos,
y la evidencia debe decir exactamente eso en vez de elegir una interpretación — **incluido
el motor**, que tiene prohibido resolver la ambigüedad por su cuenta (R-7).

**Aguacate Hass.** Ronda del 3 de agosto, hace 13 días · huevos de ácaro 25,5% sobre 420
árboles, ácaro 16,0% · 2 aplicaciones en ejecución hace 12 días · la enmienda arranca en 2
días · jornales **45,0** esta semana contra 48,0 (−6%), último registro el 14 de agosto.
*Fuente:* `monitoreos` + `rondas_monitoreo`, `aplicaciones`, `registros_trabajo` — todo ya
se consulta. *Sin dato:* semana sin registros de trabajo dice "sin jornales registrados
esta semana", nunca 0 jornales.

**Ganado.** 369 cabezas (222 novillos + 147 toros), variación a 30 días, 2 movimientos
pendientes de confirmar, 6 fincas sin hectáreas capturadas.
*Fuente:* `gan_inventario` → `calculosGanado.ts`, ya montado en el tablero.

*Coste:* **medio** para el hato (la separación vencido/próximo y el corte de vacías >90
días no existen hoy como tales en `hatoAlertasTablero.ts`), **bajo** para los otros dos.

*Se entrega en la Ola 2, antes que el motor* (§6): se expone como el detalle desplegable de
las líneas de revisión del pulso, así que tiene valor por sí sola aunque nadie la redacte
todavía.

---

### Bloque 5 — Dinero  *(módulo `finanzas` **y** rol Gerencia)*

#### 5.1 · Gasto del mes contra presupuesto

| | |
|---|---|
| **Pregunta** | "¿Voy a la velocidad que presupuesté?" |
| **Dato hoy** | Agosto Confirmado **$66,5M** · julio $144,8M |
| **Fuente** | `fin_gastos` con `estado='Confirmado'` (los Pendientes se excluyen y se declaran aparte, regla contable aprobada) contra `fin_presupuestos` agregado por categoría × (trimestre / 4) — la misma regla del acumulado al trimestre que ya usa la alerta actual |
| **Sin dato** | Sin presupuesto cargado para el año: se muestra sólo el gasto y la comparación con el mes anterior, más la nota "sin presupuesto cargado para 2026". Nunca una barra al 0% |
| **Acción** | `/finanzas/presupuesto` |
| **Coste** | **Bajo** — la consulta ya está escrita en `loadPresupuestoAlertas`; cambia de alerta a tarjeta |

#### 5.2 · Ingreso del mes

| | |
|---|---|
| **Pregunta** | "¿Entró plata este mes?" |
| **Dato hoy** | **Agosto: ningún ingreso registrado** |
| **Fuente** | `fin_ingresos` del mes en curso |
| **Sin dato — el caso más importante del documento** | Se muestra **`—`** en grande, más una línea ámbar: *"Sin ingresos registrados en agosto"*, y si además falta la quincena de leche, *"Falta registrar 3 quincenas de leche (≈$11M–$27M cada una)"* con el botón de 1.2. **Jamás `$0`.** La diferencia entre "no vendimos" y "no capturamos" es la razón de ser de este tablero, y hoy la app las presenta idénticas |
| **Acción** | Registrar quincena (1.2) · `/finanzas/ingresos?tab=registrar` |
| **Coste** | **Bajo** |

---

### Bloque 6 — Salud de los datos  *(colapsada por defecto)*

| | |
|---|---|
| **Pregunta** | "¿De cuándo es lo que estoy viendo?" |
| **Dato hoy** | Monitoreo hace 13 d · Chequeo hace 38 d · Pesaje hace 4 d · Última quincena 2026-07 Q2 · Clima: 7 de 10 días con lluvia confiable · Último gasto capturado hace N d |
| **Fuente** | `MAX(fecha)` por tabla + conteo de `lluvia_confianza='ok'` |
| **Sin dato** | Tabla sin filas: "nunca" |
| **Acción** | Ninguna |
| **Coste** | **Bajo** |
| **Por qué existe** | Es lo que hace auditable todo lo de arriba. Sin ella, un número de hace 38 días se lee igual que uno de hoy — el modo de falla que el módulo de monitoreo tiene prohibido por contrato y que el tablero comete hoy en toda la pantalla |

---

## 5. Qué NO va en el tablero, y por qué

Esta sección vale tanto como el resto. Un centro de control que muestra todo no es un
centro de control.

1. **P&G, Flujo de Caja, margen.** Son acumulativos, tienen cuatro vistas y reglas que
   exigen contexto (comprar ganado es inventario y no gasto; la cosecha Principal cruza
   años). Un renglón suelto se malinterpreta garantizado. Además `useReportesFinancierosData`
   carga el año entero: llevarlo al tablero es pagar el reporte completo en cada visita.
   Su sitio es `/finanzas/reportes`.

2. **Costo por kilo de aguacate.** Sólo hay dato por lote desde 2026 y los años previos
   caen a nivel finca. Fuera de cosecha el número no significa nada. `/produccion` lo
   muestra con sus notas al pie ("Nivel finca 2023–2025", "Sin desglose por lote"); en el
   tablero perdería las notas y ganaría autoridad que no tiene.

3. **La cola `hato_alertas` en crudo.** 64 alertas históricas: **63 descartadas, 1
   confirmada, 0 abiertas**. Traer al tablero una cola con 98% de descarte es importar el
   ruido a la pantalla principal y quemar la única bandeja que Santiago va a mirar. Lo que
   sí se trae son las **señales derivadas** —vacías >90 días, secado vencido— que tienen
   nombre de vaca y consecuencia. *Corolario para el equipo: el motor de alertas del hato
   necesita una revisión de umbrales por su cuenta; que sea ruido es un hallazgo, no un
   detalle de presentación.*

4. **Cabezas por hectárea.** Sin hectáreas es un `—` permanente. Vuelve cuando se capturen
   las 6 fincas.

5. **Gráficas de serie larga** (tendencia anual de gastos, histórico de producción, mapa de
   calor de plagas). Son de análisis, no de control, y en un teléfono son ilegibles.

6. **`QuickLinksRow`.** Duplica el sidebar.

7. **Productos bajo stock mínimo.** `hasLowStock` existe (`cantidad_actual < stock_minimo`),
   pero 270 de 341 productos no tienen libro de movimientos y la reconciliación por suma
   con signo está documentada como inválida en este esquema — un intento reciente de
   corregirlo habría fabricado $5,36M de fertilizante inexistente. Publicar "N productos
   bajo mínimo" es publicar un número que ya se sabe frágil. **Ola 3, condicionado a que se
   sanee la contabilidad de stock.** Sí se conserva el vencimiento de producto (>$500.000 en
   30 días), que se apoya en `compras.fecha_vencimiento`, un dato capturado y no derivado.

8. **Un feed de "actividad reciente"** (quién registró qué). Interesante una vez, ruido
   siempre. La pregunta que sí importa —¿alguien dejó de capturar?— ya está en el bloque 6.

9. **Ventas/despachos y Lotes.** Siguen en `ComingSoon`.

10. **Un resumen narrativo de la semana escrito por el LLM.** Es la deriva natural del
    bloque 4 y hay que atajarla ahora: un párrafo bien redactado sobre la finca se lee bien,
    no se puede auditar de un vistazo, y no dice qué hacer. El LLM entra al tablero para
    **priorizar y redactar acciones con evidencia**, no para narrar. Si alguien quiere el
    relato, ahí está el Reporte Semanal, que ya lo hace y con sus fuentes.

---

## 6. Priorización en olas

Criterio: **valor por momento de uso ÷ esfuerzo**, con una restricción dura en la Ola 1
—no se toca el esquema y no se pide ningún dato que hoy no exista.

### Ola 1 — El tablero que ya se puede construir

Cero migraciones, cero datos nuevos. Todo sale de tablas y funciones puras existentes.

- Bloque 0 (barra de estado) · bloque 1 con **1.1 ganado (confirmar en sitio)**, 1.3
  aplicaciones y 1.4 gastos pendientes
- Bloque 2.1 clima **con `lluvia_confianza` y `s/d`**
- Bloque 3 completo: las tres tarjetas de negocio
- Bloque 5 completo: gasto vs presupuesto e ingreso del mes con su caso "sin ingresos"
- Bloque 6 salud de datos
- **Gating por `puedeAccederModulo`** en los cinco bloques
- **Eliminar `KPIS_VACIO`**: todo arranca en `null`, se renderiza `—`, y se pinta 0 sólo
  cuando el dato es genuinamente cero
- Eliminar `QuickLinksRow`
- Unificar el agrupamiento por `ronda_id` entre el KPI y la alerta de plagas

**El bloque 4 no se renderiza en la Ola 1** — el orden vertical queda 0·1·2·3·5·6 y el
diseño no salta cuando aparezca, porque el bloque 4 se inserta entre el pulso y Dinero sin
tocar a ninguno de los dos.

Después de la Ola 1 el tablero ya contesta el Momento A completo y el Momento B casi
entero.

### Ola 2 — El tablero que cierra ciclos

- **1.2 quincena de leche pendiente**, con el diálogo abierto desde el tablero. Es la
  señal de mayor valor económico; va en la Ola 2 y no en la Ola 1 sólo porque exige
  extraer un diálogo hoy acoplado
- **La capa de evidencia por negocio** (§4.5): la separación
  vencido/próximo y el corte de vacías >90 días en `hatoAlertasTablero.ts`, y el resto de
  hechos derivados del hato, aguacate y ganado. **Se entrega expuesta en la interfaz** como
  el detalle desplegable de las líneas de revisión del pulso, así que tiene valor por sí
  sola aunque el motor todavía no exista
- 2.2 tareas de la semana con cambio de estado en sitio — **precedido de medir si
  `fecha_estimada_inicio` se llena**
- Primera línea de `priorizarMonitoreo` en la tarjeta de aguacate
- Persistir en `localStorage` qué bloques dejó colapsados

Después de la Ola 2, el Momento C se puede servir en su forma determinística: los nombres y
los hechos por negocio, a un toque desde el pulso, sin nadie que los redacte.

### Ola 3 — El tablero que se ajusta

- **Bloque 4 "Acciones recomendadas" con su motor.** Es aquí y no antes, y el motivo está
  escrito abajo
- **Umbrales configurables.** Hoy `>10%`, `$500.000`, `7/14 días` y `50%` son constantes
  dentro de `Dashboard.tsx`. Moverlos a una tabla de configuración con el precedente de
  `hato_config`, y que cambiarlos sea una decisión registrada y no un commit
- Hectáreas capturadas ⇒ vuelve cabezas/ha
- Stock bajo, una vez saneada la contabilidad de inventario
- **Marcar una acción o una señal como vista/atendida** — requiere persistencia; el camino
  natural es el catálogo genérico de alertas que la migración 096 ya empezó
  (`alertas_catalogo`, pensado explícitamente para `aguacate` y `ganado` además de `hato`).
  **El descarte del bloque 4 cuelga de ahí**, no de un mecanismo propio

#### Por qué el bloque 4 va en la Ola 3 y no antes

El maquetado se hace **ahora**, con esta pasada, para que la forma quede decidida y el
bloque no reabra el diseño cuando llegue. Pero **no se libera hasta tener motor**, por tres
razones que conviene tener por escrito:

1. **Un bloque cuyo contenido sólo puede producir un motor que no existe deja un hueco
   permanente** en el centro de la pantalla principal. El estado vacío del §4.3 está pensado
   para un día tranquilo, no para seis semanas seguidas.
2. **No tiene sentido inventarle un motor de reemplazo determinístico** "mientras tanto".
   Serían dos motores con dos criterios, y el segundo habría que apagarlo justo cuando el
   bueno funcione. Lo determinístico que sí vale la pena ya está: es la capa de evidencia de
   la Ola 2.
3. **La capa de evidencia es su prerrequisito duro.** Sin ella el motor no tiene un paquete
   de hechos que consumir, y sin ese paquete R-1 y R-5 son inaplicables. Construirlas en
   este orden no es prudencia: es la única secuencia posible.

---

## 7. Cómo se ve el éxito

Siete señales observables. Las tres primeras son de comportamiento, las cuatro últimas son
criterios de aceptación.

1. **Santiago deja de entrar a `/ganado/movimientos` para confirmar pendientes.** Medible:
   la mediana de días entre que se crea un movimiento `pendiente` y se confirma baja
   respecto de hoy, y las visitas a esa ruta caen.

2. **La quincena de leche deja de ir tres ciclos atrás.** Señal: la brecha entre el cierre
   de la quincena y su registro pasa de semanas a días. Es la única serie del hato atada a
   dinero, y es la prueba más limpia de que el tablero cambió una conducta.

3. **La lista de vacías con más de 90 días se acorta.** Hoy son 11 de 65. Si la evidencia
   por negocio y las acciones recomendadas funcionan, esa lista se usa en las
   conversaciones del hato y baja. **Si a los dos meses siguen siendo 11, el tablero no
   cambió nada y hay que decirlo en voz alta**, no buscarle una explicación.

4. **Santiago abre el tablero, lo lee, y no necesita entrar a ningún módulo.** Pregunta
   que él puede responder solo cada semana. Si la respuesta es "no" dos semanas seguidas,
   el bloque 1 está mal elegido y hay que rehacerlo, no ampliarlo.

5. **Ningún cero fabricado.** Prueba de aceptación explícita, con los casos reales de hoy:
   agosto sin ingresos, los 3 días de lluvia congelada, las 7 vacas sin pesar y las 6
   fincas sin hectáreas tienen que renderizar `—` con su explicación. Un solo `0` en
   cualquiera de esos sitios es un bloqueo de release.

6. **Ningún número inventado.** Criterio de aceptación del bloque 4, del mismo rango que el
   anterior: **toda cifra visible en una acción recomendada tiene que ser rastreable a un
   campo del data layer**, y la prueba se hace con el caso feo, no con el bonito — una
   corrida contra los datos reales de hoy (7 vacas sin pesar, 3 días de lluvia congelada,
   agosto sin ingresos) donde ninguna acción los convierta en ceros ni en caídas. **Una
   cifra alucinada en pantalla es bloqueo de release**, igual que un cero fabricado. Y una
   sola vale por muchas: el bloque se cree entero o no se cree.

7. **La tasa de descarte del bloque 4 se queda por debajo de la mitad.** Es la métrica que
   decide si el bloque vive. La referencia es dura y está en casa: `hato_alertas` va **63
   descartadas de 64**. Si a las seis semanas las acciones recomendadas se descartan más de
   lo que se accionan, **el bloque se retira, no se afina**. Afinar un bloque que ya perdió
   la confianza del lector es la trampa exacta en la que cayó el motor de alertas.

**Contra-métricas.**

- Si el bloque 1 tiene de forma sostenida más de 5 filas, el tablero se está degradando:
  una bandeja que nunca se vacía se ignora.
- Si el bloque 4 tiene **siempre** 3 acciones por negocio, alguien está rellenando. El
  estado vacío honesto tiene que ocurrir de verdad y con frecuencia; si nunca se ve, es
  señal de que el umbral se bajó para que la tarjeta no quedara sola.

---

## 8. Roles y `modulos_acceso`

`/` es hoy la única ruta sin `ModuleGuard`, y **debe seguir siéndolo** —es la home, no
puede negar acceso—. El filtro se aplica **bloque por bloque** con
`puedeAccederModulo(profile, modulo)` (`src/utils/modulosAcceso.ts`), la misma función pura
del sidebar, nunca una reimplementación.

**El tablero es una pantalla de varios lectores.** Es la premisa que eliminó la agenda por
persona (§3) y tiene consecuencia aquí: lo que un usuario ve depende de **sus módulos y su
rol**, nunca de quién es. No hay personalización por identidad en ninguna parte de esta
pantalla, y eso incluye el bloque 4.

| Bloque | Gate | Qué ve quien no lo tiene |
|---|---|---|
| 0 barra de estado | ninguno | siempre visible |
| 1.1 ganado pendientes | `ganado` **+** rol con escritura (Administrador/Gerencia, igual que la RLS de `gan_movimientos`) | sin el módulo: la fila no se calcula ni se muestra. Con el módulo pero sin escritura: se muestra informativa, sin botón |
| 1.2 quincena de leche | `hato_lechero` **+ rol Gerencia** | no se calcula |
| 1.3 aplicaciones · 1.4 gastos | `aguacate` · `finanzas` | no se calculan |
| 2 clima | `aguacate` | no se muestra |
| 3.1 / 3.2 / 3.3 | `hato_lechero` · `aguacate` · `ganado` | la tarjeta no se renderiza; la grilla se reacomoda a las que quedan |
| **4 acciones recomendadas** | por tarjeta: `hato_lechero` · `aguacate` · `ganado` — **el mismo gate que su tarjeta de pulso** | la tarjeta del negocio no se renderiza. Sin ninguno de los tres, la sección entera desaparece |
| 5 dinero | `finanzas` **+ rol Gerencia** | **candado explicativo**, no un vacío |
| 6 salud de datos | filtra sus filas por módulo | sólo las señales de sus módulos |

Cinco reglas duras:

- **Un bloque sin módulo no se renderiza *y no se consulta*.** Ahorra la consulta además
  de la confusión. Nunca un mensaje de "sin permisos" — el usuario no pidió eso.
- **Dinero se cierra por ROL, jamás por resultado de consulta.** Todas las `fin_*` son
  Gerencia-only por RLS: un Administrador con el módulo `finanzas` vería $0 y no sabría
  por qué. Precedente exacto: `/finanzas/reportes` conserva su `RoleGuard` y el bloque de
  ventas de `ProduccionView` hace lo mismo.
- **Una acción recomendada cuya evidencia incluya cifras de `fin_*` sólo se genera y sólo
  se muestra para rol Gerencia.** El bloque 4 no es una puerta trasera al bloque 5: el
  gate del dato viaja con el dato, no con el sitio donde se pinta. Si el motor tiene el
  paquete financiero y el lector no es Gerencia, esa acción se filtra **antes** de generar,
  no después — un LLM no es un control de acceso.
- **Durante los ~2 s en que `AuthContext` resuelve el perfil, Dinero muestra un
  skeleton de su mismo tamaño**, no un hueco en blanco (un `RoleGuard` en `isLoading`
  devuelve `null` y eso se ve como un bug de carga). Mismo patrón que `ProduccionView`.
  `puedeAccederModulo` falla **abierto** con perfil nulo, así que los demás bloques pueden
  pintar durante esa ventana.
- **Usuario sin ningún módulo** (Administrador y Verificador arrancan en `'{}'`): bloque 0 +
  un estado vacío honesto — *"Tu usuario todavía no tiene módulos asignados. Pídeselos a
  Gerencia."* Nunca un tablero vacío sin explicación. `Monitor` no llega: `ProtectedRoute`
  lo bloquea antes.

---

## 9. Especificación visual

Suficiente para maquetar sin volver a preguntar. Sistema de referencia:
`src/guidelines/Guidelines.md` (tokens y navegación) y `docs/sistema-visual.md` (escala
tipográfica, densidad y los dos patrones de móvil).

### 9.1 Reglas globales

**Lienzo.** Fondo `--background` `#F8FAF5`. Contenedor `max-w-7xl mx-auto`, padding
`p-4 lg:p-8`. Separación entre bloques: `space-y-4` en móvil, `space-y-6` en escritorio.

**Los bloques se identifican por su título, y por nada más.** En pantalla no aparece
ninguna numeración ni la palabra "zona": el encabezado de cada sección es literalmente
"Requiere tu decisión", "Hoy en la finca", "Pulso por negocio", "Acciones recomendadas",
"Dinero", "Salud de los datos". Los números de este documento son referencia editorial
(§3).

**Tarjeta.** `rounded-xl` · `bg-white` (`--card`) · `border border-primary/10`
(`rgba(115,153,28,0.1)`) · `shadow-sm` · padding `p-4 lg:p-5`.
⚠️ **`--radius` es `1rem`, así que `rounded-xl` en este build son 20px, no 12.** Cualquier
elemento que deba encajar con el borde de una tarjeta usa la misma expresión.
Sin gradientes en tarjetas de dato: el gradiente queda reservado para la navegación.
Se elimina el blur decorativo del header actual (`bg-primary/5 blur-2xl`): no aporta y
cuesta pintura en móvil.

**Tipografía** (la clase va **en el elemento que lleva el texto**, nunca en un contenedor —
un `<p>` dentro de `.text-sm` renderiza a 16px por la regla base):

| Rol | Escritorio | Móvil | Dónde |
|---|---|---|---|
| Título de pantalla | `text-2xl` | `text-2xl` | barra de estado, uno solo |
| Encabezado de sección | `text-xl` | `text-xl` | "Requiere tu decisión", "Pulso por negocio", "Acciones recomendadas" |
| **Dato principal** | `text-2xl font-bold text-foreground` | igual | el número de cada tarjeta |
| Cuerpo | `text-sm` | `text-base` | nombre de la vaca, texto de la acción |
| Metadato | `text-xs` | `text-sm` | fechas, "hace 13 días", unidades |

**Números.** Siempre por `src/utils/format.ts`, nunca inline. Dinero abreviado a millones,
sin decimales, sin `COP`: `$66,5M`, `$11,6M`. Miles con punto. Litros con un decimal:
`15,4 L/vaca`. Incidencia con un decimal: `25,5%`. Cabezas enteras: `369`.

**Color semántico.**

| Uso | Token | Valor |
|---|---|---|
| Bien / positivo / acción primaria | `--primary` | `#73991C` |
| Atención · vence pronto | `--warning` | `#FFC107` |
| Vencido · crítico | `--destructive` | `#DC3545` |
| Texto secundario | `--brand-brown` al 60–70% | `#4D240F` |
| Sin dato | `--brand-brown` al 40% | — |

**Semántica invertida en plagas**: subir es rojo, bajar es verde. Ya lo hace
`PlagasKPICard`; se mantiene y se documenta en la tarjeta con la flecha.

**"Sin dato" tiene un único tratamiento en toda la pantalla:** em-dash `—` en el sitio del
número, en `text-brand-brown/40`, **más una línea de metadato que dice por qué**. Nunca
`0`, nunca un blanco mudo, nunca "N/A". Ejemplos literales del maquetado:
`— · Sin ingresos registrados en agosto` · `s/d · contador del pluviómetro congelado` ·
`15,4 L/vaca · 27 de 34 vacas pesadas`.

**Toque.** Cualquier fila o botón accionable: mínimo 44px de alto en móvil, por encima de
cualquier objetivo de densidad.

**Carga.** Skeleton por bloque, del tamaño final. Nunca un spinner de pantalla completa: el
bloque 1 debe pintar apenas lo tenga, sin esperar al resto. **Excepción deliberada: el
bloque 4 no tiene skeleton** — si sus acciones no están listas cuando el tablero pinta, la
sección simplemente no aparece; un esqueleto reserva un hueco que a lo mejor nunca se llena.

### 9.2 Bloque por bloque

**Barra de estado (0).** Una línea. `text-2xl` "Buenos días, Santiago" y debajo
`text-sm text-brand-brown/70` con la fecha larga en español y el conteo de pendientes.

**Requiere tu decisión (1).** *Lo primero que el ojo debe encontrar en toda la pantalla.*
Contenedor propio con `border border-warning/40` y `bg-warning/5` cuando tiene filas;
cuando está vacía colapsa a **una sola línea verde** con check: "Nada pendiente de ti".
Cada fila: círculo de 36px con el icono del tipo (tono por módulo) · texto de la acción en
cuerpo · **botón primario verde a la derecha** (`Button size="sm"`) · secundario en `ghost`.
Máximo 5 filas visibles + "y N más".
**Escritorio:** fila completa, botones a la derecha.
**Móvil:** el botón baja a su propia línea, ancho completo — un botón de 44px junto a dos
líneas de texto no cabe en 375px.

**Hoy en la finca (2).** Tarjeta ancha única.
**Escritorio:** una fila horizontal — temperatura `text-2xl` a la izquierda, métricas
actuales en el centro (humedad · viento · radiación), pronóstico de 3 días a la derecha
separado por `border-l border-gray-100`. Debajo, franja de **10 días** de lluvia como
barras de 4px: día con dato en `--primary` a media opacidad; día `contador_congelado` como
rectángulo rayado gris con `s/d` bajo la barra. Pie de tarjeta: "3 de 10 días sin dato de
lluvia".
**Móvil:** se apila en dos filas — (temperatura + métricas) y (pronóstico, 3 items en fila
horizontal). La franja baja a **7 días**.

**Pulso por negocio (3).** `grid grid-cols-1 lg:grid-cols-3 gap-4`.
⚠️ **Una sola columna por debajo de `lg`, no dos.** Cada tarjeta lleva número + sparkline +
chip de frescura + línea de revisión; a media celda de 375px eso se rompe — es el mismo
desbordamiento ya medido en las tarjetas del hato.
Anatomía, de arriba abajo:
1. Etiqueta del negocio — `text-xs uppercase tracking-wide text-brand-brown/60`, **una sola
   línea en las tres tarjetas** (es lo que permite alinear los números)
2. **Dato principal** `text-2xl font-bold` con su unidad en `text-sm` al lado, y el
   sparkline (`Sparkline.tsx`, ya existe) alineado a la derecha en la misma línea
3. Tendencia: flecha + porcentaje, color por semántica
4. **Chip de frescura** — `rounded-full bg-gray-100 px-2.5 py-0.5 text-xs`, en ámbar cuando
   el dato pasa su umbral de vejez
5. Línea de revisión clicable con su conteo, con `ChevronRight`

*Lo primero que el ojo debe encontrar en este bloque: los tres datos principales alineados a
la misma altura.*

**Acciones recomendadas (4).** `grid grid-cols-1 lg:grid-cols-3 gap-4`, **una tarjeta por
negocio, en el mismo orden y con el mismo ancho que el pulso** — la columna del hato queda
justo debajo de la del hato. Esa alineación es la que convierte el bloque en "la lectura
del pulso" en vez de en una lista suelta.

*Encabezado de la sección:* `text-xl` "Acciones recomendadas", y a la derecha, en
`text-xs text-brand-brown/60`, el chip de procedencia: **"Sugerido · hoy 05:45"**. Va en el
encabezado y no en cada acción, para no repetirlo nueve veces, pero **no es opcional**: es
lo que le dice al lector que esto lo escribió una máquina y de cuándo es.

*Tarjeta de negocio, de arriba abajo:*
1. Etiqueta del negocio — `text-xs uppercase tracking-wide text-brand-brown/60`, **idéntica
   a la de la tarjeta de pulso correspondiente**
2. De 0 a 3 **acciones**, separadas por `border-t border-gray-100` (no por tarjetas
   anidadas: una tarjeta dentro de otra a 375px es ruido de bordes)

*Anatomía de una acción:*
- **Frase** en cuerpo (`text-sm` escritorio / `text-base` móvil), `font-medium`, **una sola
  línea en escritorio** — si no cabe, se acorta la frase, no se envuelve. Verbo primero.
- **Evidencia**: 1–3 líneas en `text-xs text-brand-brown/70`, cada una con viñeta `·`, y la
  cifra en `font-medium` para que se distinga del texto que la rodea. Cada línea termina en
  su fecha o su edad (*"— ronda del 3 de agosto, hace 13 días"*). **Visible sin desplegar en
  escritorio.** En móvil, la primera línea visible y el resto tras *"ver evidencia"*.
- **Botón primario** `Button size="sm"` verde, alineado a la derecha en escritorio; en
  móvil baja a su propia línea a ancho completo (44px), igual que en el bloque 1.
- **"No es útil"** en `ghost`, `text-xs`, discreto y a la izquierda del primario. Discreto a
  propósito: es una salida, no una invitación.

*Jerarquía visual dentro de la sección:* **la frase manda, la evidencia susurra.** El
contraste entre la frase (`font-medium`, color de texto pleno) y la evidencia
(`text-brand-brown/70`, `text-xs`) es lo que permite barrer las nueve frases en cinco
segundos y bajar a la evidencia sólo en la que interesa. Si la evidencia compite con la
frase, el bloque se vuelve un muro y no se lee.

*El bloque nunca lleva borde de alerta.* Sin `border-warning`, sin fondo de color, sin
puntos rojos. Ese lenguaje es del bloque 1, que sí es una bandeja de pendientes con dueño;
teñirlos igual haría que el lector no distinga lo que debe hacer de lo que convendría
hacer, que es justamente la distinción que este tablero está intentando construir.

*Estados (los cuatro de §4.3):*
- **Vacío de un negocio:** la tarjeta se conserva con su etiqueta y una sola línea en
  `text-sm text-brand-brown/60`: *"Sin acciones recomendadas para el hato hoy."* La tarjeta
  no desaparece — su ausencia se leería como que el negocio se dejó de mirar.
- **Todos vacíos:** la sección entera colapsa a **una línea verde con check**, exactamente
  como el bloque 1 vacío: *"Nada recomendado hoy · última revisión hoy 05:45"*.
- **Motor no disponible / acciones de hace más de 48 h:** **una línea gris** en `text-sm
  text-brand-brown/60`, sin icono de error, sin color de alarma: *"Las acciones recomendadas
  no están disponibles ahora."* + tres enlaces de texto a los módulos. Nunca un mensaje
  técnico, nunca un reintento visible, nunca acciones viejas sin marcar.
- **Todavía cargando:** nada. Sin skeleton (§9.1).

**Móvil: Patrón B.** Las tres tarjetas se colapsan en un `<Select>` de negocio con una sola
lista debajo. Tres tarjetas apiladas de tres acciones con su evidencia son 20+ filas de
scroll para un momento de uso de dos minutos. El `<Select>` arranca en el negocio con más
acciones; si hay empate, en el orden del pulso.

**Dinero (5).** Una tarjeta ancha, `grid grid-cols-1 sm:grid-cols-2 gap-6` adentro.
Izquierda: gasto del mes `text-2xl` + barra de progreso de 8px `rounded-full` contra el
presupuesto acumulado al trimestre (relleno `--primary`, `--destructive` al pasar el 100%)
+ etiqueta "$66,5M de $X presupuestado al Q3".
Derecha: ingreso del mes; en el caso real de hoy, `—` grande + línea ámbar + botón
"Registrar quincena".
Sin Gerencia: la tarjeta entera se sustituye por una compacta con candado y "Requiere
permisos de Gerencia", **de la misma altura** para que el layout no salte.

**Salud de los datos (6).** Una línea colapsada, `text-xs`, con un punto de color por
señal (verde / ámbar / rojo). Al expandir, tabla de dos columnas (señal · edad) usando
`src/components/ui/table.tsx` —que es el recurso tabla del proyecto y hoy no lo importa
nadie: **este tablero es un buen sitio para estrenarlo**. En móvil se queda colapsada.

### 9.3 Componentes a reutilizar y a jubilar

**Se reutilizan:** `Sparkline.tsx` · `ClimaCard.tsx` (extendida) · `DashboardKPICard.tsx`
(base de las tarjetas del pulso) · `PlagasKPICard.tsx` (dentro de la tarjeta de
aguacate) · `AnimalLabel` y `EstadoChip` del hato · `chipDiasRestantes`/`chipVencimiento`
(`hatoUi.ts`) · `Dialog` + `DialogBody` para las acciones · `TareaEstadoSelect` (Ola 2).

**Se jubilan:** `QuickLinksRow.tsx` (duplica navegación) · `EstadoHeader.tsx` (lo absorbe
la barra de estado) · el `CompactAlertList` como lista indiferenciada (se parte en la
bandeja del bloque 1 y las líneas de revisión del pulso) · `KPIS_VACIO`.

---

## 10. Decisiones que no son mías

Se dejan explícitas para que nadie las tome por descuido:

- **Cómo se consulta todo esto.** Hoy el tablero dispara ~10 consultas cada 2 minutos;
  esta propuesta sube el número. Si eso se resuelve con un hook único, con carga escalonada
  por bloque, con caché, o con un endpoint que agregue del lado del servidor, **es una
  decisión del CTO**. La restricción de producto es una sola: *el bloque 1 debe pintar antes
  que el resto, en un teléfono con mala conexión, sin esperar a los demás bloques.*
- **Extraer `ProduccionQuincenalDialog`** de `ProduccionView` o entrar por parámetro de
  ruta: CTO.
- **Dónde corre el motor del bloque 4, con qué modelo, con qué caché y a qué hora.** CTO.
  Las restricciones de producto son cuatro y están en §4: fuera del camino crítico; sin
  acceso a la base ni a las herramientas de Esco (R-5); mecanismo que impida que un dígito
  escrito por el modelo llegue a pantalla (R-2); y cotejo contra datos frescos al renderizar.
  Hay una consecuencia que conviene ver ahora: **si el motor necesita el contexto de Notion
  (§4.4), tiene que correr en el servidor** — el `NOTION_TOKEN` no puede viajar en el bundle
  del navegador.
- **Los umbrales de la Ola 3** (qué es "colgada", qué es "vencida") son decisiones del
  dueño, no del código. Hoy están escondidas como constantes y ése es el problema.
- **Revisar el motor de alertas del hato.** Que 63 de 64 se descarten es un hallazgo con
  vida propia: no se arregla presentándolo mejor en el tablero. Necesita su propia sesión.

---

## 11. Preguntas abiertas del motor de acciones

**Esta pasada no diseña el motor**, por decisión explícita del dueño ("luego, pensamos en
el motor"). Lo que queda arriba es el contrato de producto del bloque: su forma, sus
límites y sus barreras. Estas son las preguntas que la sesión del motor tiene que resolver,
**sin resolverlas aquí**. Están agrupadas por quién las contesta.

**Del dueño (producto/negocio):**

1. **¿Con qué cadencia se llena de verdad la base de Notion de llamadas?** El código no lo
   sabe (§4.4) y todo lo demás depende de la respuesta. Si es irregular, el contexto entra
   como "lo último que hubo, con su fecha", nunca como "esta semana".
2. **¿Qué es una buena acción recomendada, en sus palabras?** Hace falta un set de 5–10
   ejemplos escritos por él —de las que le habrían servido y de las que le habrían molestado—
   para poder evaluar el motor contra algo que no sea intuición.
3. **¿Cada cuánto quiere que cambien?** Un bloque que cambia a diario se lee a diario y se
   agota; uno semanal envejece. Es una decisión de ritmo, no técnica.
4. **¿El descarte compartido y atribuido le sirve** (§4.2), o prefiere que cada usuario de
   Gerencia descarte lo suyo? Se arranca con compartido; conviene confirmarlo.

**Del CTO (arquitectura):**

5. Dónde corre, con qué modelo, con qué caché y a qué hora (§10).
6. Qué mecanismo implementa R-2 —ranuras tipadas o validación posterior—; ambos valen, uno
   tiene que existir.
7. Cómo se persiste el descarte. La recomendación de producto es colgarlo de
   `alertas_catalogo` (migración 096) en vez de inventar una tabla.

**Todavía sin dueño claro, y por eso hay que plantearlas:**

8. **¿Se guarda cada generación —hechos de entrada y texto de salida— para poder responder
   "¿de dónde salió esto?" seis semanas después?** Mi posición: sí, y es barato hacerlo
   desde el primer día; recuperarlo después es imposible. Pero cuesta una tabla y es una
   decisión de la sesión del motor.
9. **¿Qué se hace cuando el motor y el bloque 1 se contradicen** —el motor recomienda algo
   cuya premisa el bloque 1 ya declaró resuelta? La deduplicación de §4.3 evita la
   duplicación literal, no la contradicción de fondo.
10. **¿Se evalúa el motor antes de encenderlo, y contra qué?** Sin las respuestas 2 y 8 no
    hay forma de saber si mejora o empeora entre versiones, y un motor que no se puede
    evaluar se ajusta por corazonada.

---

## 12. Los tres números que resumen este documento

- **11** vacas vacías con más de 90 días desde el parto, y ninguna pantalla lo dice.
- **3** quincenas de leche sin registrar, entre $11M y $27M cada una, presentadas hoy como
  "no hubo ingresos".
- **63 de 64** alertas descartadas: la app ya intentó avisar y el aviso se volvió ruido.

El tablero nuevo existe para que ninguno de los tres vuelva a pasar en silencio.
