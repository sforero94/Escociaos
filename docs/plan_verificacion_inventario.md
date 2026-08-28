# Brief de producto — Verificación de inventario (ronda mensual de conteo físico)

**Rutas afectadas:** `/inventario/verificaciones/*` · canal nuevo: bot de Telegram · **Estado:** definición de producto **CERRADA** — sin decisiones del dueño pendientes · **Fecha:** 2026-08-27 · **Ampliado y cerrado 2026-08-28** (§11 — reporte por nota de voz)
**Autor:** CPO · **Origen:** issue #175 + entrevista de descubrimiento y entrevista de seguimiento con Santiago (Gerencia), ambas 2026-08-27
**Contratos leídos:** `CLAUDE.md` (raíz), migraciones 104/112/118/119 · **Código auditado:** `VerificacionesList.tsx`, `NuevaVerificacion.tsx`, `ConteoFisico.tsx`, `NuevoMovimientoModal.tsx`, `App.tsx` (rutas), `chat.tsx` (`execInventoryMovements`)

Este documento define **qué** se construye y **por qué**. El **cómo** —tablas, RPC, arquitectura de la conversación de Telegram, cómo se identifica a Uriel, cómo se interpreta la nota de voz— es del CTO y va en un brief técnico posterior. **No quedan preguntas abiertas para el dueño**: §9 y §11 conservan las dieciséis decisiones que se tomaron, con su respuesta y su rastro, para que ningún implementador tenga que ir a buscarlas ni tenga que adivinar por qué son así.

---

## 1. Resumen ejecutivo

La finca ya hace un conteo físico mensual de todo el catálogo de insumos, con separación de funciones (quien cuenta no es quien custodia, y quien autoriza no es ninguno de los dos). **Ese proceso funciona bien y nunca ha tocado el sistema: vive en una planilla de papel cuyo destino nadie sabe.** El objetivo de esta iteración no es arreglar un flujo que la gente evita, sino **capturar digitalmente un proceso que ya es bueno, sin deformarlo** — entrando por Telegram, registrando solo las excepciones, y dejando que el control humano (David explica → Uriel juzga → Santiago aprueba lo que no tiene respaldo) siga siendo quien decide qué se ajusta.

Ese principio llega hasta el formato: **Uriel reporta narrando por nota de voz**, igual que hoy le resume a Santiago por chat, y el sistema le devuelve escrito lo que entendió para que lo corrija y lo confirme antes de registrar nada (§11).

El módulo web de Verificaciones que existe hoy no puede hacerlo: está incompleto de punta a punta y su único registro histórico es una prueba.

---

## 2. Contexto y diagnóstico

### 2.1 El módulo actual no funciona de extremo a extremo

Verificado contra producción y contra el código. No es que se use poco: **es que no hay ningún camino que lleve de un conteo a un inventario corregido.**

| # | Hallazgo | Evidencia |
|---|---|---|
| D-1 | **Una sola verificación en toda la historia** (`4a595f8c`, abierta 2026-07-30, estado «En proceso»), con 223 renglones y **0 contados**. | `verificaciones_inventario` = 1 fila |
| D-2 | **El conteo es producto-por-producto sobre todo el catálogo activo** (226 productos hoy). `ConteoFisico.tsx` es un carrusel de un producto a la vez con barra de progreso «N / total». | `ConteoFisico.tsx:289-292, 430-520` |
| D-3 | **Arrancar una ronda crea un renglón por cada producto activo, sin selección posible** — hoy serían 226, de los cuales **33 están en cero**. No hay cierre parcial ni alcance acotado. | `NuevaVerificacion.tsx` |
| D-4 | **«Completar Verificación» no ajusta nada.** Solo hace `update({ estado: 'Pendiente Aprobación' })`. Nunca escribe en `productos.cantidad_actual` ni en `movimientos_inventario`. | `ConteoFisico.tsx:262-268` |
| D-5 | **Los dos botones siguientes son callejones sin salida.** `revisar/:id` **no existe como ruta**: cae en el catch-all `path="*"` y **redirige al tablero en silencio**. `Ver Detalle` (`:id`) cae en un `ComingSoon`. | `App.tsx:93-98, 192` |
| D-6 | **El RPC de aplicación de ajustes nunca se pudo llamar.** `aplicar_ajustes_verificacion(integer, text)` tiene firma rota (integer contra columna uuid) y **cero call sites** en el repo. | Confirmado en migración 104, que además lo usa como argumento para bajar ese hallazgo de P0 a P1 |
| D-7 | **Gerencia nunca ve el botón de revisar.** El código compara `profile?.rol === 'Gerente'`, un rol que **no existe** en el enum (`Administrador \| Verificador \| Gerencia`). | `VerificacionesList.tsx:131` |
| D-8 | **Esco reporta discrepancias falsas.** Cuenta `diferencia !== 0`, y `diferencia` es NULL en los renglones no contados: `null !== 0` es `true`, así que los 223 renglones sin contar entran como discrepancia. | `chat.tsx:1512` (los **dos** árboles de edge function) |
| D-9 | **El ajuste manual sí funciona.** `NuevoMovimientoModal` tipo «Ajuste» escribe `productos.cantidad_actual` + `movimientos_inventario`. Es hoy el **único** camino real para corregir stock. | `NuevoMovimientoModal.tsx` |

**Lectura de producto:** D-4 + D-5 + D-6 juntos significan que el módulo **nunca pudo cerrar el ciclo**, ni siquiera si alguien lo hubiera usado con disciplina. Y nadie lo notó porque nadie lo usó — y nadie lo usó porque el proceso real nunca entró por ahí. El defecto y la falta de adopción se taparon mutuamente durante un año.

### 2.2 La premisa central del diagnóstico original estaba mal atribuida

El issue #175 leía los **3 movimientos de «Ajuste» del 2026-08-24** (Acondicionador sys, Proxam 200 EC, Magister) como evidencia de que *«la gente prefiere el atajo manual al flujo formal»*, y sobre esa premisa construía su recomendación: contar producto por producto y **aplicar el ajuste en el acto** para eliminar fricción.

**Santiago lo refutó en la entrevista: esos 3 ajustes fueron parte de una corrección de datos de mantenimiento, sin ninguna relación con el proceso operativo.** El registro del repo lo corrobora: el `CLAUDE.md` documenta las migraciones **118** (borra una `Entrada` duplicada de **Acondicionador sys**) y **119** (entrada huérfana de Sulcamag), ambas aplicadas **el 2026-08-24**, es decir la misma jornada de saneamiento de inventario.

Consecuencias, y son grandes:

1. **No existe evidencia de que nadie prefiera un atajo.** No hay atajo y no hay flujo largo: **no hay proceso digital en absoluto**. La única fila del módulo fue una exploración de un agente, no un intento de Uriel.
2. **Cae la recomendación D1(a) del issue original** («aplicar el ajuste en el acto, marcando la diferencia grande solo para revisión posterior, no bloqueante»). Habría eliminado exactamente el control que hoy da valor: la oportunidad de David de explicar y la autorización de Santiago. Se habría automatizado la parte buena del proceso para resolver un problema de fricción que no existe.
3. **Queda invalidada la métrica implícita** de «reducir el tiempo de conteo». Uriel y David ya recorren el catálogo entero cada mes sin quejarse. El costo no está en contar; está en que ese conteo no deja rastro.

---

## 3. Actores y proceso actual (hoy, 100 % fuera del sistema)

> Primera vez que este proceso queda escrito en alguna parte. Lo que sigue es descripción, no diseño.

### 3.1 Actores

| Actor | Rol en el proceso | Relación con el sistema hoy |
|---|---|---|
| **Uriel** | Hace el conteo físico mensual. Es el **verificador independiente**. | **Ningún usuario en Escocia OS**, nunca ha tocado nada digital del sistema. Usa Telegram en su vida personal |
| **David** | Custodio de la bodega de insumos. Debe *demostrar* que lo físico cuadra con lo que dice el sistema. | Usuario de la app (captura movimientos, compras) |
| **Santiago** | Gerencia. Recibe el reporte, decide la causa raíz y **aprueba todo movimiento de stock sin respaldo, sin excepción**. | Gerencia, acceso total |

**La propiedad de control que este proceso ya tiene y que hay que preservar: quien cuenta (Uriel) no es quien custodia (David) ni quien autoriza (Santiago).** No es una formalidad — es la razón por la que el conteo significa algo. Cualquier diseño que permita a un solo actor contar, explicar y aplicar destruye el valor del proceso, por más ágil que sea.

### 3.2 El flujo real

1. **Cadencia mensual**, primera semana del mes.
2. **David imprime una planilla** con cada producto y su cantidad teórica — **no desde el sistema, sino desde un Google Sheet manual paralelo** que él mantiene. Ver §3.4: es el hallazgo con más consecuencias de toda la entrevista.
3. Uriel va a la finca y recorre **todo el catálogo** junto con David, verificando lo físico contra lo impreso.
4. Uriel **anota discrepancias y observaciones** en la planilla, a mano.
5. Ante una discrepancia, **primera instancia: David tiene la oportunidad de confirmar o explicar.** Muchas veces no es un faltante físico sino un movimiento real que nunca se capturó en el sistema.
6. Si la discrepancia es **importante** —a juicio de Uriel; **no hay umbral fijo, ni por valor ni por porcentaje**— la escala a Santiago por **un mensaje de chat muy resumido**: «todo bien», o «2-3 insumos no estuvieron bien».
7. Santiago y Uriel **identifican la causa raíz juntos** (pérdida, descuido, robo, error de captura) y, si corresponde, **Santiago aprueba el ajuste**.
8. El ajuste lo puede **proponer David o Uriel; la aprobación es siempre de Santiago** — *«El ajuste lo puede proponer David o Uriel, pero lo debo aprobar yo»*. Quién lo teclea después es secundario. *(La primera entrevista dejó esto como «lo aplica David o Santiago según sensibilidad»; la entrevista de seguimiento lo corrigió: **no hay regla de sensibilidad**.)*
9. **Qué pasa con la planilla física después: no se sabe.** Es probable que ese registro se pierda.
10. **Es control interno de la finca, no una exigencia de GlobalGAP.** Sirve como evidencia operativa útil, pero no es lo que lo motiva.

### 3.3 Lo que hoy no existe

| Vacío | Costo real |
|---|---|
| **Ningún registro histórico de rondas.** Ni digital, ni un archivo de planillas confiable | No se puede responder «¿qué pasó en la ronda de mayo?» ni «¿este producto ya falló antes?» |
| **El resultado de la ronda no llega al inventario del sistema salvo que alguien lo registre aparte** | El `cantidad_actual` del sistema queda desfasado aunque el conteo haya salido perfecto |
| **La escalada es un mensaje de chat de una línea** | Santiago no ve el contexto: cuánto era el teórico, cuánto lo físico, en cuánta plata, qué dijo David |
| **No hay alerta de mes saltado** | Si la ronda no se hace, nadie se entera hasta que alguien pregunta |
| **La causa raíz se conversa y se pierde** | El beneficio de detectar patrones de pérdida por producto es imposible hoy |

### 3.4 La fuente de verdad paralela (hallazgo de la entrevista de seguimiento)

**La planilla que Uriel usa en campo no sale de Escocia OS: sale de un Google Sheet manual que David mantiene aparte** — *«una copia manual que tenemos del inventario»*.

Es la pieza que faltaba para entender por qué el módulo web lleva un año sin usarse: **el proceso nunca necesitó al sistema, porque ya tenía otra fuente de verdad.** Y explica también el vacío de §3.3: el resultado del conteo no llega a `productos.cantidad_actual` porque el conteo nunca se comparó contra `productos.cantidad_actual`, sino contra el Sheet.

**Riesgo latente, dicho en voz alta:** nadie sabe cuánto diverge ese Sheet del inventario del sistema. Si diverge, entonces las rondas de los últimos meses validaron el Sheet, no el sistema — y el `cantidad_actual` que la app muestra hoy nunca ha pasado por un conteo físico.

**Decisión del dueño: el flujo nuevo reemplaza el Sheet sin auditarlo previamente.** Uriel pasa a consultar el teórico directamente del sistema y el Sheet deja de usarse. No se mide la divergencia antes de lanzar.

Es una decisión defendible —medir la divergencia cuesta una ronda entera y el resultado no cambiaría qué hay que construir— pero tiene una consecuencia que hay que anticipar: **la primera ronda contra el sistema va a producir un pico de excepciones**, y ese pico será en buena parte deuda acumulada del sistema contra la realidad, no pérdidas del mes. Por eso la primera ronda se rotula como línea base (R-17).

---

## 4. Objetivo de producto y métricas de éxito

### 4.1 Objetivo

Que la ronda mensual que ya se hace **quede registrada en el sistema, con el mínimo de fricción para quien la hace, y que su resultado llegue al inventario pasando por el control humano que ya existe** — sin pedirle a nadie que cambie cómo cuenta.

Los tres beneficios que Santiago articuló, en sus términos:

- **B-1 · Historial digital de cada ronda.** Hoy no existe ninguno.
- **B-2 · Inventario al día una vez resuelta la excepción** —por captura directa o por ajuste aprobado— sin depender de que alguien lo registre aparte.
- **B-3 · Ver patrones de pérdida por producto a través del tiempo.**

**No-objetivo declarado:** reducir el tiempo del conteo físico. §2.2 explica por qué esa meta era un espejismo.

### 4.2 Métricas

Línea base tomada el 2026-08-27. Todas medibles con lo que el sistema registrará; no requieren instrumentación aparte.

| # | Métrica | Línea base | Objetivo a 90 días | Mide |
|---|---|---|---|---|
| M-1 | **Rondas mensuales cerradas en el sistema** | **0** en toda la historia | **3 de 3** | Adopción. Es la métrica madre: si es 0, todo lo demás da igual |
| M-2 | **Días entre recordatorio enviado y ronda cerrada** | No medible hoy | Mediana ≤ 7 días | Que el recordatorio funcione como disparador y no como ruido |
| M-3 | **Excepciones con causa raíz clasificada / total de excepciones cerradas** | 0 % (la causa se conversa y se pierde) | **100 %** | Habilita B-3. Sin esto, «patrones de pérdida» no se puede construir nunca |
| M-4 | **Días entre excepción reportada y desenlace** (cerrada sin ajuste · resuelta con captura · ajuste aplicado o desestimado) | No medible hoy | Mediana ≤ 5 días · ninguna abierta > 30 | Que el ciclo cierre. Una excepción eterna es peor que no haberla reportado. **Conviene medirla partida por desenlace**: si la captura directa no es más rápida que el ajuste aprobado, el camino (a) de R-14 no está dando el beneficio por el que se decidió |
| M-5 | **Rondas con reporte de cierre entregado a Gerencia** | 0 | 100 % de las rondas cerradas | B-1 desde el lado del consumidor del dato |
| M-6 | **Meses sin ronda detectados y alertados** | 0 detectados (no hay detección) | 100 % de los que ocurran | Que el silencio sea visible. Un mes saltado alertado es un éxito de la métrica, no un fracaso |
| M-7 | **Productos con excepción en ≥ 2 rondas consecutivas** | No calculable | Reportable a partir de la 3ª ronda | B-3. **No es una meta a bajar en 90 días**: es la señal que empieza a existir |
| M-8 | **Previews confirmados al primer intento** *(2026-08-28, §11)* | No existe | ≥ 70 % · **0 rondas con el límite de intentos agotado** | Si el intérprete falla seguido, A-8 le cuesta a Uriel más de lo que le ahorra y hay que degradar a reporte estructurado. Es la métrica que dice si la voz funciona |
| M-9 | **Hallazgos ruteados a Santiago por duda del intérprete** (R-18), sobre el total | No existe | Vigilar, sin meta | Si es alto, Santiago termina aprobando ruido y el sesgo defensivo se vuelve contraproducente. **No se corrige aflojando R-18**, se corrige mejorando la interpretación o el mapeo |

**M-1 y M-3 son las que valen.** M-1 dice si el proceso entró al sistema; M-3 dice si entró con la calidad que hace útil el historial. El resto son diagnósticos.

**La primera ronda no cuenta para ninguna tendencia.** Por §3.4, va a comparar por primera vez lo físico contra `productos.cantidad_actual` en vez de contra el Sheet de David, así que su número de excepciones mide deuda acumulada, no el mes. La línea base real de M-7 arranca en la **segunda** ronda.

---

## 5. Flujo propuesto

### 5.1 Dos caminos que conviven y no se fusionan

| | **(a) Ronda mensual formal** | **(b) Ajuste puntual operativo** |
|---|---|---|
| **Quién** | Uriel cuenta, David explica, **Santiago autoriza siempre** | David (o quien corresponda), solo |
| **Cuándo** | Primera semana del mes, por recordatorio | Cualquier día, ante un hallazgo o una corrección |
| **Alcance** | **Los productos con existencia > 0** — 193 de 226 activos al 2026-08-27 | Un producto |
| **Control** | Separación de funciones; **Gerencia aprueba todo lo que no tenga respaldo** (R-14) | Registro directo con trazabilidad |
| **Canal** | Telegram | Web (`NuevoMovimientoModal`, ya existe) |
| **Esta iteración** | Se diseña y se construye | **Se deja tal cual, sin cambios forzados** |

**Por qué no se fusionan.** Son controles distintos. El camino (b) resuelve el día a día y **debe seguir siendo rápido**; meterle la maquinaria de aprobación lo mataría, y su ausencia empujaría a la gente a no corregir nada. El camino (a) vale precisamente porque **no** es rápido: su valor está en las tres firmas. Fusionarlos degrada los dos a la vez.

**Los dos caminos son coherentes entre sí gracias a la decisión de §9.10**, que resolvió la tensión que este diseño abría: la frontera **no** es «ronda vs. día a día», sino **con respaldo vs. sin respaldo**. Dentro de la ronda, una diferencia explicada por un movimiento real la captura David sin aprobación (igual que en el camino b); una diferencia sin nada que la explique pasa por Santiago, esté dentro o fuera de una ronda.

**Riesgo que esto abre y que hay que vigilar:** que el camino (b) se use para mover stock sin respaldo esquivando a Santiago. La mitigación es de visibilidad, no de bloqueo — todo movimiento ocurrido con una ronda abierta sale en el reporte de cierre (R-9).

### 5.2 El ciclo de la ronda

```
  E1 RECORDATORIO          sistema → Uriel (Telegram, primera semana del mes)
        │                  botones: [Empezar]  [Posponer]
        ▼
  E2 APERTURA              Uriel confirma "Empezar" → la ronda queda abierta
        │                  alcance = productos con existencia > 0 (193 al 2026-08-27)
        │                  se congela el teórico de esos productos (foto del momento)
        ▼
  E3 CONTEO POR EXCEPCIÓN  Uriel recorre en campo; consulta el teórico desde el bot
        │                  (cantidad y unidad, SIN precio ni valor)
        │                  reporta SOLO lo que no cuadra — por NOTA DE VOZ (§11):
        │
        │    ┌─ Uriel narra TODOS los hallazgos de una vez, en lenguaje natural
        │    │  (una o varias notas de voz; sin señal, salen al recuperar conexión)
        │    ▼
        │    transcripción + interpretación por modelo
        │    ▼
        │    PREVIEW: un renglón por hallazgo — producto identificado, físico,
        │    │        teórico TRAÍDO DEL SISTEMA, causa propuesta y VÍA propuesta
        │    │        (David resuelve directo / pasa a Santiago)
        │    ▼
        │    ¿Uriel lo da por bueno?
        │      no ──► corrige por texto ──► preview nuevo   (máx. 3–4 intentos;
        │      sí ──► botón [Confirmar]                      agotados, el bot cede
        │             se guarda el TRANSCRIPT confirmado      y ofrece otra vía,
        │             (el audio NO se conserva)               sin perder lo narrado)
        │
        │                  + observación libre si encuentra algo que no está en el catálogo
        ▼
  E4 CIERRE DE LA RONDA    Uriel declara el alcance recorrido y cierra
        │                  ── la ronda se cierra AUNQUE queden excepciones abiertas ──
        ├──────────────────────────────► E7 REPORTE DE CIERRE → Santiago  (Telegram, siempre)
        ▼
  E5 EXPLICACIÓN DE DAVID  cada excepción pasa por David — dos formas de llegar:
        │
        │    ├─ PRECARGADA desde el audio de Uriel ("David dice que es error
        │    │  del sistema"): se le muestra escrita y él la CONFIRMA o la
        │    │  CORRIGE con un toque. Hasta ese toque NO es su explicación,
        │    │  es una cita — y no habilita ninguna vía (R-6, §11.4)
        │    │
        │    └─ DIRECTA: Uriel no narró nada por él y David explica de cero
        ▼
  E6 ¿HAY RESPALDO?        ¿la diferencia se explica con un movimiento real identificable?
        │                  (una aplicación, una entrega, un documento concreto)
        │
        ├── SÍ, con respaldo ──► CAPTURA DIRECTA DE DAVID
        │                        David registra el movimiento como el movimiento que fue
        │                        (salida a aplicación, entrada, etc.), NO como "ajuste"
        │                        queda ligado a la excepción y sale en el reporte de cierre
        │                        ── no pasa por Santiago ──
        │
        ├── NO hace falta mover inventario ──► se cierra sin ajuste
        │                                      (el sistema estaba bien; queda registrada igual)
        │
        └── NO, sin respaldo ──► JUICIO DE URIEL + PROPUESTA DE AJUSTE
                     │           la propone David o Uriel — ninguno de los dos la aprueba
                     │           Santiago ve el caso completo: teórico, físico, diferencia,
                     │           valor, observación de Uriel, explicación de David
                     ▼
              CAUSA RAÍZ + APROBACIÓN DE SANTIAGO   clasifica la causa y aprueba o desestima
                     │                              ── SIEMPRE Santiago, sin umbral ──
                     ▼
              APLICACIÓN     el ajuste entra al inventario, atribuido y trazado
```

**Decisión de modelado que importa: la ronda y sus excepciones tienen ciclos de vida separados.** Si la ronda no pudiera cerrarse hasta que la última excepción esté resuelta, una aprobación demorada dejaría la ronda de agosto abierta en septiembre y el recordatorio del mes siguiente no sabría qué hacer. Uriel cierra su trabajo cuando terminó de contar; las excepciones siguen su propio curso.

**La bifurcación de E6 es el corazón del control** (decisión del dueño, §9.10). Lo que Santiago necesita aprobar **no es todo movimiento de stock: es todo movimiento de stock sin respaldo** — que es exactamente donde viven la pérdida y la sustracción. Una salida a una aplicación que nadie capturó no es una pérdida: es data entry atrasada, y hacerla pasar por Gerencia solo agrega demora sin agregar control.

### 5.3 Reglas del flujo

| # | Regla | Consecuencia concreta |
|---|---|---|
| **R-1** | **Reportar una excepción no toca `productos.cantidad_actual`.** La ronda **registra**; el inventario se mueve después, por una acción humana deliberada (captura con respaldo, o ajuste aprobado — R-14). | Contradice frontalmente la recomendación D1(a) del issue #175. Reportar una excepción no mueve un solo gramo de inventario, ni siquiera cuando la causa es evidente |
| **R-2** | **La ausencia de excepción NO es un dato de conteo: es una declaración de conformidad sobre un alcance declarado.** Al cerrar, Uriel declara qué recorrió. | El sistema **nunca** escribe una cantidad física que nadie contó. Un producto conforme queda como «conforme dentro del alcance declarado», **no** como «contado = teórico». El día que alguien pregunte «¿cuánto había físicamente de X en agosto?», la respuesta honesta es «se declaró conforme, no se registró la cifra» |
| **R-3** | **«Sin dato» nunca se muestra como 0 ni como conforme.** Regla transversal del proyecto (monitoreo, hato, clima). | Un producto fuera del alcance declarado se muestra **«—» / «no verificado»**, jamás como cuadrado. Y ninguna pantalla ni herramienta de Esco puede contar un renglón sin dato como discrepancia (corrige D-8) |
| **R-4** | **El ajuste aplica el DELTA (físico − teórico del momento del conteo), nunca fija el físico como verdad nueva.** | Entre el conteo y la aprobación pueden pasar días y movimientos legítimos. Fijar el físico los borraría en silencio. Y si el teórico cambió desde el conteo, **el sistema lo dice antes de aplicar** — no aplica y avisa después |
| **R-5** | **El teórico de la ronda es una foto fechada, y se guarda.** | Precedente del repo: `aplicaciones_compras` guarda un snapshot que hoy diverge del inventario real y engaña a quien lo lee como dato vivo. La foto se rotula como foto |
| **R-6** | **Toda excepción pasa por David antes de llegar a Santiago.** Uriel decide si **escala**, no si **consulta**. **Una explicación que llega citada en el audio de Uriel NO cuenta como la explicación de David**: se le muestra precargada y él la confirma o la corrige con un toque. Recién entonces es su palabra. | El paso de David no es opcional ni saltable «porque es obvio». *(Precisado el 2026-08-28, §11.4: el audio suele traer ya lo que David dijo en la bodega — precargarlo ahorra el trabajo, pero la confirmación sigue siendo suya. Si la explicación de quien custodia el inventario entrara referida por quien lo está auditando, la separación de funciones de §3.1 se perdería sin que nadie lo notara.)* |
| **R-7** | **La causa raíz es un dato clasificado, no texto libre.** Catálogo **confirmado por Santiago**: *movimiento no capturado · consumo no registrado · pérdida o daño · sustracción · error de conteo · error de captura previa · otro (con nota)*. | Sin clasificación, B-3 («patrones de pérdida») es imposible: nadie va a minar texto libre. **La lista no se cambia a la ligera**: si cambia, el historial deja de ser comparable |
| **R-8** | **Todo movimiento nacido de una excepción queda atribuido y ligado a ella, por los DOS caminos de R-14.** El camino (a) registra quién capturó, cuándo y contra qué excepción; el (b) además quién propuso, quién aprobó y con qué causa. | Hoy un «Ajuste» manual no registra capturador — nadie sabe quién lo hizo (D-9). **Captura directa no es captura opaca**: el camino (a) se salta la *aprobación*, nunca la *trazabilidad* |
| **R-9** | **Todo movimiento de inventario ocurrido con una ronda abierta se muestra en el reporte de cierre**: tanto las capturas directas del camino (a) como los ajustes puntuales del camino (b) de §5.1. | Es la mitigación honesta contra usar el atajo para saltarse el control: no se bloquea, se hace visible. Santiago ve *después* lo que no tuvo que aprobar *antes* — que es lo que hace seguro no aprobarlo |
| **R-10** | **El reporte de cierre se congela al emitirse; no se recalcula.** | Si se recalcula desde datos vivos, el reporte de agosto cambia en septiembre. Misma lección que la migración 122, que agregó una columna solo para poder auditar después por qué un día quedó como quedó |
| **R-11** | **Alerta a Santiago si se salta un mes: día 15 sin ronda cerrada.** El silencio no puede ser indistinguible de «todo bien». | Una sola alerta por mes omitido, no una por día |
| **R-12** | **El reporte de cierre se emite siempre**, con excepciones o sin ellas. | Una ronda limpia también es información: es la evidencia de que el control se ejecutó |
| **R-13** | **Formato colombiano** vía `src/utils/format.ts` en todo número que se muestre (Telegram incluido): sin decimales en dinero, punto de miles, sin sufijo COP. Fechas con `obtenerFechaHoy()`, nunca UTC. | Contrato transversal del repo |
| **R-14** | **Lo que Santiago aprueba es todo movimiento de stock SIN RESPALDO.** Dos caminos, según lo que David explique: **(a) con respaldo identificable** —una aplicación, una entrega, un documento concreto— David **captura el movimiento que realmente fue** (salida, entrada), ligado a la excepción y visible en el reporte de cierre, **sin pasar por Santiago**; **(b) sin nada que la explique** —pérdida, sustracción, error sin causa clara— **siempre** pasa por Santiago, sin umbral ni excepción. | Cita del dueño: *«El ajuste lo puede proponer David o Uriel, pero lo debo aprobar yo»*, precisada después con *«David lo captura directo, sin mi aprobación. Solo lo sin respaldo (pérdida, sustracción) pasa por mí.»* **La distinción no es de tamaño ni de sensibilidad: es de evidencia.** Un movimiento con respaldo no es un ajuste — es el registro atrasado de algo que pasó, y llamarlo «ajuste» perdería su tipo, su fecha y su destino. Quién teclea el ajuste aprobado del camino (b) es detalle de implementación |
| **R-15** | **Uriel ve cantidad y unidad, nunca precio ni valor.** El teórico que consulta desde el bot es «Silicalmag: 8.000 kg», no su valoración. | La valoración es privativa de Gerencia. Aplica a la consulta del teórico, a la confirmación de una excepción y a cualquier resumen que le llegue a Uriel |
| **R-16** | **Un producto físico que no está en el catálogo se reporta como observación libre.** No dispara alta automática de producto, no se mapea a ningún producto existente y no bloquea el cierre de la ronda. | Mapearlo «al que más se parece» inventaría un dato; darlo de alta automático metería fichas basura al catálogo desde el campo. La observación llega al reporte de cierre y Santiago decide si se crea el producto, por el camino normal |
| **R-17** | **La primera ronda se rotula explícitamente como línea base.** | Por §3.4 va a comparar contra `productos.cantidad_actual` algo que hasta hoy se comparaba contra el Sheet de David. Su volumen de excepciones es deuda acumulada, no el mes. Sin el rótulo, alguien va a leer ese pico como «se está perdiendo mucho» |
| **R-18** | **Ante duda del intérprete, siempre la vía CON aprobación.** Si el modelo no puede clasificar la causa con confianza —o la clasifica como `otro`— el hallazgo se rutea a Santiago, **nunca** a la vía sin aprobación. | *(2026-08-28, ampliación §11.)* El costo de una aprobación de más es una notificación; el de una aprobación saltada es exactamente lo que R-14 existe para impedir. **El sesgo del sistema es asimétrico a propósito**: puede equivocarse pidiendo control de más, jamás de menos |
| **R-19** | **El teórico del preview lo pone el SISTEMA, nunca lo que Uriel dijo.** Lo narrado por Uriel entra como *físico* y como *observación*; la cantidad teórica se lee de `productos.cantidad_actual` al momento de la ronda (R-5). | *(2026-08-28.)* Si Uriel dice «deberían haber 100» y el sistema dice 90, esa discrepancia **es información** —típicamente un producto mal identificado— y se pierde si el bot repite el número que oyó. Un físico **derivado** («faltan 3» sobre un teórico de 8 → físico 5) se muestra rotulado como derivado, no como dictado |
| **R-20** | **Un producto que el intérprete no puede identificar con certeza en el catálogo queda «no identificado» y lo elige Uriel.** Nunca se mapea al nombre más parecido. | *(2026-08-28.)* Precedente literal del repo: en el OCR del chequeo del hato **solo la confianza `alta` pasa al pipeline**; `baja` e `ilegible` entran como celda vacía + bandera, y una fila que no casa con el roster queda **no leída y nunca se desplaza**. El error de Santiago en su propio ejemplo —«Silicalmag» transcrito como «Silicio»— no es hipotético: es el caso base |

**Mapeo causa raíz → vía** *(confirmado por el dueño el 2026-08-28; es la tabla que el intérprete de §11 aplica y que el preview muestra)*

| Causa raíz (R-7) | Vía | Efecto en inventario |
|---|---|---|
| `movimiento no capturado` | **(a)** David resuelve directo, sin Santiago | Se captura el movimiento que faltaba |
| `consumo no registrado` | **(a)** David resuelve directo, sin Santiago | Se captura el consumo que faltaba |
| `error de captura previa` | **(a)** David resuelve directo, sin Santiago | Se corrige el registro errado |
| `pérdida o daño` | **(b)** Aprobación de Santiago, siempre | Ajuste, si Santiago lo aprueba |
| `sustracción` | **(b)** Aprobación de Santiago, siempre | Ajuste, si Santiago lo aprueba |
| `error de conteo` | **Ninguna** — Uriel se equivocó contando | **No mueve inventario.** Cierra como `Cerrada sin ajuste` |
| `otro (con nota)` | **(b)** Aprobación de Santiago | Por **R-18**, no por una decisión propia: es la clasificación menos informativa, y lo menos informativo nunca puede rutear hacia menos control |

### 5.4 Estados

- **Ronda:** `Programada` → `En curso` → `Cerrada` → (`Omitida`, si venció sin ejecutarse)
- **Excepción:** `Reportada` → `Explicada por David` → uno de tres desenlaces:

| Desenlace | Cuándo | ¿Mueve inventario? | ¿Pasa por Santiago? |
|---|---|---|---|
| `Cerrada sin ajuste` | El sistema estaba bien; la diferencia era del conteo o ya se había resuelto | **No** | No |
| `Resuelta con captura` | David explica con **respaldo identificable** y registra el movimiento que faltaba | **Sí** — como el movimiento que realmente fue, no como «ajuste» | **No** (R-14 camino a) |
| `Ajuste propuesto` → `Aprobada por Santiago` → `Aplicada` · o `Desestimada` | La diferencia **no tiene respaldo**: pérdida, sustracción, error sin causa clara | Sí, si se aprueba | **Sí, siempre** (R-14 camino b) |

Los tres son estados terminales distintos y **no se colapsan en la UI ni en el reporte**: `Cerrada sin ajuste` dice «no pasó nada», `Resuelta con captura` dice «pasó algo y ya sabemos qué fue», y `Aplicada` dice «pasó algo que nadie puede explicar y Gerencia lo asumió». Fundirlos borraría exactamente la señal que alimenta C-4 y M-7.

Vocabulario único: lo que hoy se llama «verificación» en la web y «conteo» en el papel debe llamarse igual en los dos lados. **Propuesta: «ronda de inventario»**, consistente con `rondas_monitoreo`, que es el mismo concepto en el módulo de monitoreo.

---

## 6. Historias de usuario

> Agrupadas por objetivo del actor, no por pantalla. **Los criterios Given/When/Then los escribe QA** a partir de §7; si un criterio no se puede verificar como está redactado, la historia está mal escrita y vuelve al CPO — no se ajusta en silencio.

### Épica A — Registrar la ronda mensual sin fricción (Uriel)

**A-1 · Que el sistema me recuerde y me deje arrancar — `Must`**
*Como Uriel, quiero recibir un recordatorio por Telegram la primera semana del mes con la opción de empezar o posponer, para que la ronda no dependa de que yo me acuerde ni de que alguien me escriba.*

**A-2 · Tener el teórico a la mano en campo — `Must`**
*Como Uriel, quiero consultar desde el bot la cantidad y la unidad que el sistema dice que hay de cada producto, para contrastarla contra lo físico sin depender de que David me imprima una hoja desde su Sheet.*
> **Sustituye la hoja impresa del Google Sheet paralelo** (§3.4): es lo que hace que el conteo pase a validar el sistema y no una copia manual. Muestra cantidad y unidad, **nunca precio ni valor** (R-15).

**A-3 · Reportar solo lo que no cuadra — `Must`**
*Como Uriel, quiero reportar únicamente los tres o cuatro productos con observación, en vez de confirmar 190 que están bien, para que reportar me cueste minutos y no una tarde.*
> Cita del dueño: *«No tiene sentido que uno marque que 200 o más insumos están al día, sino por el contrario marcar los tres o cuatro que necesitan alguna observación.»*
> **A-3 es el principio; A-8 es el mecanismo.** El principio no cambió con la ampliación de §11: sigue siendo excepción por defecto. Lo que cambió es cómo se expresa la excepción.

**A-4 · Posponer sin quedar en falta — `Must`**
*Como Uriel, quiero posponer el recordatorio cuando no puedo ir ese día, para que el sistema me vuelva a buscar en vez de dar la ronda por perdida.*

**A-5 · Cerrar declarando qué recorrí — `Must`**
*Como Uriel, quiero cerrar la ronda diciendo qué alcancé a recorrer, para que quede claro qué quedó verificado y qué no.*

**A-6 · Reportar aunque no haya señal — `Should`**
*Como Uriel, quiero que lo que escribo salga cuando recupere conexión, para no perder el trabajo por estar en una zona sin cobertura.*
> No requiere ingeniería de sincronización: Telegram ya lo resuelve. La historia existe para que nadie construya un modo offline (§8).

**A-7 · Reportar algo que no está en el catálogo — `Must`**
*Como Uriel, quiero dejar una observación libre cuando encuentro en bodega un producto que no aparece en el sistema, para que el hallazgo no se pierda ni me obligue a forzarlo dentro de otro producto.*
> Decisión del dueño (R-16): observación libre. **No** da de alta el producto, **no** lo mapea a nada y **no** bloquea el cierre. Santiago decide después si se crea la ficha.

**A-8 · Narrar todos los hallazgos en una nota de voz — `Must`** *(2026-08-28, §11)*
*Como Uriel, quiero contar por nota de voz todo lo que encontré en la ronda, en mis palabras y de una sola vez, para reportar igual que como ya le resumo a Santiago por chat — sin llenar un formulario por producto.*
> Una o varias notas por ronda; los hallazgos se acumulan sobre la misma ronda. Cada nota abre su propio ciclo de A-9. Sin señal, la nota sale al recuperar conexión (A-6 sigue valiendo tal cual).
> **A-2 no se recorta ni se reemplaza**: para detectar la diferencia en campo, Uriel necesita saber el teórico *mientras cuenta*. La voz resuelve el reporte, no la consulta.

**A-9 · Ver, corregir y confirmar antes de que quede registrado — `Must`** *(2026-08-28, §11)*
*Como Uriel, quiero ver escrito lo que el sistema entendió de mi audio y poder corregirlo antes de que se registre, para que un nombre mal oído no se convierta en un dato falso.*
> Ciclo: preview → corrección por texto → preview nuevo → **botón `Confirmar`**. **Máximo 3–4 intentos**; agotados, el bot cede y ofrece otra vía, **sin descartar lo narrado** (A-10). La confirmación es un botón deliberado, **nunca** un «sí» interpretado del tono del mensaje — misma disciplina que cerrar una ronda o aprobar un ajuste.

**A-10 · No perder lo narrado si el preview no cuaja — `Must`** *(2026-08-28, §11)*
*Como Uriel, quiero que lo que ya conté no se pierda si el sistema no logra entenderme, para no tener que recorrer la bodega otra vez.*
> El transcrito queda como **borrador sin confirmar** colgado de la ronda: no es una excepción registrada (no mueve nada, no entra a las métricas de excepciones), pero **sí aparece en el reporte de cierre** como «N hallazgos narrados sin confirmar». Una ronda con borradores pendientes **no se reporta como limpia**.

### Épica B — Resolver una discrepancia (David · Uriel · Santiago)

> **Tras la explicación de David hay dos desenlaces posibles, y la diferencia entre ellos es la evidencia, no el tamaño** (R-14, §5.4): con respaldo identificable → **B-2**, sin Santiago; sin respaldo → **B-3 → B-5 → B-6 → B-7**, siempre con Santiago.

**B-1 · Explicar antes de que escale — `Must`**
*Como David, quiero recibir cada discrepancia y poder confirmarla o explicarla, para que un movimiento que simplemente no se capturó no se reporte como un faltante.*
> **Cuando la explicación ya viene en el audio de Uriel** (*«David dice que es por error en el sistema»*), le llega **precargada** y la confirma o la corrige **con un toque** — no la vuelve a escribir. Hasta ese toque es una cita de Uriel, no su palabra, y no habilita ninguna vía (R-6, §11.4). Le sirve además para corregir una explicación suya que quedó mal transcrita **antes** de que se convierta en la causa raíz de su propio inventario.

**B-2 · Capturar el movimiento que faltaba — `Must`**
*Como David, quiero registrar directamente el movimiento real que explica una diferencia —la salida a una aplicación, la entrega que nadie capturó— sin esperar aprobación, para no demorar días una corrección que ya sé qué fue.*
> Camino (a) de R-14. Se registra **como el movimiento que fue** (con su tipo, fecha y destino), **nunca como un «ajuste»** —eso perdería la información— queda ligado a la excepción, atribuido a David (R-8) y visible en el reporte de cierre (R-9). Se salta la aprobación, no la trazabilidad.

**B-3 · Escalar solo lo que importa — `Must`**
*Como Uriel, quiero decidir cuáles discrepancias sin respaldo suben a Santiago después de oír a David, para no inundarlo con ruido.*

**B-4 · Ver el caso completo, no una línea de chat — `Must`**
*Como Santiago, quiero ver el teórico, el físico, la diferencia, su valor, la observación de Uriel y la explicación de David en un solo lugar, para decidir con contexto en vez de preguntar por chat.*

**B-5 · Proponer el ajuste — `Must`**
*Como David o como Uriel, quiero proponer el ajuste que corresponde a una diferencia sin respaldo, para que Santiago tenga algo concreto que aprobar en vez de una descripción del problema.*
> Proponer no es aprobar. Ninguno de los dos puede aplicar por su cuenta un ajuste sin respaldo (R-14 camino b).

**B-6 · Aprobar con causa raíz — `Must`**
*Como Santiago, quiero clasificar la causa y aprobar o desestimar cada ajuste propuesto, para que ningún movimiento de inventario sin respaldo ocurra sin mi decisión y quede registrada.*
> **Siempre Santiago para el camino (b), sin umbral ni excepción.** Reemplaza el modelo de «David o Santiago según sensibilidad», que era una lectura equivocada del proceso: la distinción no es de sensibilidad, es de evidencia.

**B-7 · Aplicar el ajuste aprobado — `Must`**
*Como quien ejecuta (David, Uriel o Santiago), quiero aplicar el ajuste ya aprobado desde el sistema, para que el inventario quede al día sin tener que registrarlo aparte por otro camino.*
> Quién ejecuta es detalle de implementación; lo que es producto es que **ningún ajuste sin respaldo llegue al inventario sin haber pasado por B-6**.

### Épica C — Enterarse y decidir (Santiago)

**C-1 · Reporte de cierre de cada ronda — `Must`**
*Como Santiago, quiero recibir por Telegram, al cerrar cada ronda, un resumen con el valor total del inventario, el cambio contra el mes anterior, las entradas y salidas del período y las observaciones de Uriel, para tener una foto mensual del inventario sin entrar a la app y no solo un «todo bien».*
> **Telegram, solo para Santiago.** Ni David ni Uriel lo reciben. **Las cifras de valoración dependen del prerrequisito de §8** — hasta que el catálogo se sanee, el reporte sale sin ellas, no con ellas mal.

**C-2 · Alerta si se saltó un mes — `Must`**
*Como Santiago, quiero enterarme explícitamente cuando la ronda del mes no se hizo, para que el silencio no se confunda con normalidad.*

**C-3 · Historial de rondas — `Must`**
*Como Santiago, quiero consultar las rondas anteriores con sus excepciones y cómo se resolvieron, para poder auditar y para no perder el registro como se pierde hoy la planilla.*
> El **reporte de cierre** llega por Telegram (C-1). Por dónde se consulta el **historial** —pantalla en la app, o preguntándole a Esco, que ya responde sobre datos de la finca por Telegram— lo resuelve el brief técnico. Lo que es producto: el registro existe, es completo y es consultable.

**C-4 · Patrones de pérdida por producto — `Should`**
*Como Santiago, quiero ver qué productos presentan excepciones repetidas a lo largo del tiempo, para atacar la causa en vez de ajustar el número cada mes.*
> `Should` y no `Must` por una razón de calendario, no de valor: necesita **tres rondas** para decir algo. Construirlo en la primera entrega es construir una pantalla vacía.

**C-5 · Deuda de excepciones visible — `Should`**
*Como Santiago, quiero ver cuántas excepciones llevan días sin resolverse, para que el ciclo no quede abierto indefinidamente.*

### Épica D — No engañarse con lo que ya está en el sistema

**D-1 · Cerrar la verificación histórica marcándola como prueba — `Must`**
*Como Gerencia, quiero que la verificación del 30 de julio quede cerrada y rotulada explícitamente como prueba, para que nadie la lea nunca como una ronda real fallida.*
> No se borra ni se reescribe: se marca. Es el patrón que el repo ya usa («archivo de registro, no aplicar» en las migraciones 067/079/108).

**D-2 · Que Esco deje de inventar discrepancias — `Must`**
*Como cualquier usuario, quiero que Esco no reporte 223 discrepancias que no existen, para poder creerle cuando reporte una.*
> Corrige D-8, en los **dos** árboles de edge function.

**D-3 · Que Gerencia vea lo que le corresponde — `Must`**
*Como Gerencia, quiero ver las acciones de revisión que el sistema cree que me está ofreciendo, para que la comparación contra un rol inexistente deje de dejarme por fuera.*
> Corrige D-7. Vale aunque la pantalla de revisión web se rediseñe: hoy es un botón que redirige al tablero en silencio (D-5).

**D-4 · Que el ajuste puntual siga existiendo igual — `Must`**
*Como David, quiero seguir corrigiendo un producto puntual el día que lo detecto, sin pasar por la maquinaria de la ronda, para no dejar de corregir por estar esperando a alguien.*
> Sigue igual que hoy. La frontera del control no es «ronda vs. día a día» sino **con respaldo vs. sin respaldo** (R-14), así que este camino no es un agujero: un movimiento sin respaldo sigue necesitando a Santiago, y todo lo que ocurra con una ronda abierta sale en el reporte de cierre (R-9).

### Prioridad consolidada (MoSCoW)

| | Historias |
|---|---|
| **Must** | A-1 · A-2 · A-3 · A-4 · A-5 · A-7 · **A-8 · A-9 · A-10** · B-1 · B-2 · B-3 · B-4 · B-5 · B-6 · B-7 · C-1 · C-2 · C-3 · D-1 · D-2 · D-3 · D-4 |
| **Should** | A-6 · C-4 · C-5 |
| **Could** | Adjuntar foto a una excepción · exportar el historial · recordatorio configurable por Gerencia · pantalla web del historial de rondas |
| **Won't (esta iteración)** | Ver §8 |

**Si hay que recortar, sale C-4 primero** (necesita tres rondas para existir), luego C-5. **A-2, A-3, A-9 y B-6 no se recortan**: A-2 es lo que reemplaza el Sheet paralelo y hace que el conteo valide el sistema, A-3 es lo que hace viable el canal, A-9 es lo que impide que un modelo escriba datos que nadie miró, y B-6 es el control que justifica todo el ejercicio.

> **Si A-8 (la voz) resultara técnicamente inviable o poco confiable, el flujo NO se cae**: se degrada a reportar la excepción en un mensaje estructurado, que era el mecanismo del documento original. Lo que **no** es negociable es A-9 — con voz o sin ella, nada se registra sin que un humano vea escrito lo que se va a guardar y lo confirme.

---

## 7. Criterios de aceptación

> Declarativos a propósito. **QA los traduce a Given/When/Then** y los endurece; el CPO revisa que la traducción no se haya desviado de la intención.

**Del ciclo de la ronda**

- **CA-1** · Reportar una excepción **no modifica** `productos.cantidad_actual` ni genera ningún movimiento de inventario. El inventario solo cambia por una acción humana posterior y deliberada: la captura con respaldo de CA-8, o el ajuste aprobado de CA-9. *(Reemplaza el CA-1 original, que aplicaba el ajuste en el acto.)*
- **CA-2** · Al aplicarse, el ajuste usa el **delta** (físico − teórico del momento del conteo). Si el teórico cambió entre el conteo y la aplicación, el sistema lo informa **antes** de aplicar y no aplica en silencio.
- **CA-3** · La ronda se **dispara con recordatorio + confirmación de Uriel**, no sola y no 100 % a mano. Posponer reprograma el recordatorio y deja rastro. *(Reemplaza el CA-3 original, «la tanda se arma sola».)*
- **CA-4** · El alcance por defecto de la ronda son los **productos con existencia > 0** al momento de abrirla (193 de 226 activos al 2026-08-27). Los productos en cero no entran solos; Uriel puede reportar uno igual si lo encuentra.
- **CA-5** · Cerrar una ronda **no exige** que sus excepciones estén resueltas. Una excepción abierta no bloquea el cierre ni el recordatorio del mes siguiente.
- **CA-6** · Toda excepción escalada muestra a Santiago, en un solo lugar: teórico, físico, diferencia, valor de la diferencia, observación de Uriel y explicación de David.
- **CA-7** · Una excepción no puede llegar a Santiago sin haber pasado por David.
- **CA-8** · **Una diferencia con respaldo identificable la resuelve David capturando el movimiento que realmente fue** (salida, entrada, con su tipo, fecha y destino) — **sin aprobación previa de Santiago**. Ese movimiento **no** se registra como «ajuste», queda **ligado a la excepción**, atribuido a quien lo capturó, y **aparece en el reporte de cierre**. Es un camino sin aprobación, **nunca** un camino sin trazabilidad.
- **CA-9** · **Una diferencia sin respaldo —pérdida, sustracción, error sin causa clara— no llega jamás al inventario sin la aprobación de Santiago.** No existe umbral, categoría ni ruta que permita a David o a Uriel aplicarla por su cuenta. Proponer y aprobar son acciones distintas, de actores distintos.
- **CA-10** · Los dos desenlaces de CA-8 y CA-9 son **estados terminales distintos y distinguibles** (§5.4): «resuelta con captura» nunca se muestra ni se cuenta como «ajuste aprobado», ni al revés. Fundirlos borra la señal que alimenta C-4 y M-7.
- **CA-11** · Aprobar exige elegir una causa raíz del catálogo confirmado (R-7). No hay aprobación sin causa.
- **CA-12** · Todo movimiento nacido de una excepción queda atribuido: por CA-8, quién lo capturó, cuándo y contra qué excepción; por CA-9, además quién lo propuso, quién lo aprobó, quién lo aplicó y con qué causa.
- **CA-13** · Uriel nunca ve precio ni valoración: ni al consultar el teórico, ni al reportar, ni en ningún mensaje que le llegue del bot.
- **CA-14** · Un hallazgo de producto no catalogado se registra como observación libre. **No** crea un producto, **no** se mapea a ningún producto existente y **no** bloquea el cierre de la ronda. Aparece en el reporte de cierre.

**De la honestidad del dato**

- **CA-15** · Un producto sin excepción figura como **«conforme dentro del alcance declarado»**, nunca como «contado» con una cifra física que nadie capturó.
- **CA-16** · Un producto **fuera** del alcance declarado —incluidos los 33 en cero que no entran por defecto— se muestra como «—» / «no verificado». Nunca como conforme, nunca como 0.
- **CA-17** · Ninguna pantalla ni herramienta de Esco cuenta un renglón sin dato como discrepancia. Con cero conteos, el número de discrepancias reportado es **0**, no 223.
- **CA-18** · El reporte de cierre, una vez emitido, muestra siempre las mismas cifras aunque los datos vivos cambien después.

**Del reporte y las alertas**

- **CA-19** · Al cerrar una ronda, **Santiago recibe el reporte por Telegram, siempre**: con excepciones o sin ellas, sin necesidad de entrar a la app. Ni David ni Uriel lo reciben. Incluye entradas y salidas del período, observaciones de Uriel (incluidas las de producto no catalogado) y **todo movimiento de inventario ocurrido con la ronda abierta: las capturas directas de CA-8 y los ajustes puntuales del camino (b) de §5.1** (R-9).
- **CA-20** · El **valor total del inventario y su variación contra el mes anterior** solo se publican una vez saneado el catálogo de precios (prerrequisito de §8.1). Antes de eso el reporte se emite **sin** esas líneas — nunca con cifras que se sabe que están mal.
- **CA-21** · Si el valor del mes anterior no existe (primera ronda), la variación muestra «—», no 0 ni 100 %.
- **CA-22** · La primera ronda se identifica como **línea base** en su propio reporte, para que su volumen de excepciones no se lea como pérdida del mes (R-17).
- **CA-23** · Si el mes llega al **día 15** sin ronda cerrada, Santiago recibe una alerta explícita que nombra el mes omitido.
- **CA-24** · La alerta de mes saltado se emite **una sola vez** por mes omitido, no una por día.

**De la higiene del módulo**

- **CA-25** · La verificación `4a595f8c` queda cerrada y rotulada de forma inequívoca como prueba. No se borra ni se reescriben sus 223 renglones.
- **CA-26** · El ajuste puntual (`NuevoMovimientoModal` tipo «Ajuste») sigue funcionando exactamente igual: mismo camino, mismos campos, sin pasos nuevos.
- **CA-27** · Ninguna acción visible en el módulo lleva a una ruta inexistente ni a un `ComingSoon`. Un botón que no puede cumplir su promesa no se renderiza.
- **CA-28** · Las comparaciones de rol usan valores del enum real (`Administrador | Verificador | Gerencia`). No queda ninguna contra `'Gerente'`.

**Del reporte por voz** *(2026-08-28, §11)*

- **CA-29** · Una nota de voz **no registra nada por sí sola**. Sin `Confirmar` no existe excepción, no se mueve inventario y no se dispara ninguna vía. La confirmación es un **botón**, nunca un «sí» inferido de un mensaje de texto.
- **CA-30** · El preview muestra, por cada hallazgo: producto identificado, cantidad física, **cantidad teórica traída del sistema** (R-19), causa propuesta y **vía propuesta** en lenguaje que Uriel entienda («David lo resuelve» / «pasa a Santiago»). Sin precio ni valor (R-15).
- **CA-31** · Una cantidad física **derivada** de lo narrado («faltan 3» sobre un teórico de 8) se muestra rotulada como derivada. No se presenta como si Uriel la hubiera dictado.
- **CA-32** · Un producto que el intérprete no identifica con certeza aparece como **«no identificado»** y lo elige Uriel de una lista. **Nunca** se resuelve al nombre más parecido, y un hallazgo no identificado **no se puede confirmar** hasta que tenga producto (R-20).
- **CA-33** · Una causa que el intérprete no puede determinar con confianza, o que clasifica como `otro`, **se rutea a la aprobación de Santiago** (R-18). No existe ninguna condición bajo la cual una duda del modelo mande algo por la vía sin aprobación.
- **CA-34** · La vía de cada hallazgo se deriva del **mapeo causa → vía de §5.3**, no del criterio del modelo. `error de conteo` no mueve inventario en absoluto y cierra como `Cerrada sin ajuste`.
- **CA-35** · Corregir el preview lo regenera **entero**; se confirma el preview completo, no hallazgo por hallazgo. Tras **3–4 intentos** sin confirmación el bot cede, ofrece otra vía y **conserva el transcrito como borrador sin confirmar** (A-10). No insiste indefinidamente y no descarta lo narrado.
- **CA-36** · Se guarda el **transcrito confirmado**; **el audio original no se conserva** (decisión del dueño, §11). El transcrito es la capa cruda de este flujo: se guarda literal, y los hallazgos estructurados se derivan de él — nunca al revés.
- **CA-37** · Una ronda con borradores sin confirmar **no se reporta como limpia**: el reporte de cierre los nombra («N hallazgos narrados sin confirmar»). Un borrador no cuenta como excepción registrada ni entra en las métricas de excepciones.
- **CA-38** · **Una explicación de David que llega citada en el audio de Uriel no cuenta como la explicación de David hasta que David la confirme o la corrija.** Se le muestra precargada y se resuelve con un toque; mientras tanto la excepción **no avanza a ninguna vía** —ni a la captura directa de CA-8, ni al escalamiento de CA-9— y el registro la distingue como cita de Uriel, no como palabra de David.

---

## 8. Prerrequisito de lanzamiento y fuera de alcance

### 8.1 Prerrequisito bloqueante: sanear el catálogo de precios

**Decisión del dueño: se sanea el catálogo antes de publicar valores.** No es "su propio ticket y ya" — **bloquea la parte valorizada de C-1 / CA-17**.

Motivo: el reporte de cierre pide *valor total del inventario* y *cambio contra el mes anterior*, y esas cifras salen de `productos.precio_unitario`, que tiene errores conocidos y documentados. El caso testigo está en el `CLAUDE.md`: la migración 119 dejó el `precio_unitario` de Sulcamag contaminado en 669,96 y el valor anterior es **irrecuperable**; la misma migración movió el total de Entradas del tablero de Inventario en $5.675.648.

Consecuencia operativa, escrita para que nadie la interprete distinto:

- **El flujo de la ronda NO espera al saneamiento.** A-1 a A-7, B-1 a B-7, C-2 y C-3 se pueden entregar y usar sin él.
- **Las dos líneas valorizadas del reporte de cierre SÍ esperan.** Hasta que el catálogo esté saneado, el reporte sale sin ellas (CA-20), no con ellas mal. Publicar una cifra que Santiago va a comparar mes a mes sobre una base con errores conocidos es la forma más rápida de quemar la confianza en el reporte nuevo.

Alcance, responsable y calendario del saneamiento: **del brief técnico**, no de este documento.

### 8.2 Fuera de alcance

| Fuera | Razón |
|---|---|
| **Aplicar el ajuste automáticamente al reportar la excepción** | Decisión del dueño. Destruiría la separación de funciones que es el valor del proceso (§3.1). Era la recomendación D1(a) del issue #175 |
| **Pantalla web de aprobación tipo «Revisar y Aprobar» como la proponía el issue** | El escalamiento nace en Telegram y Santiago responde por ahí. Una pantalla web **puede** ser necesaria para el paso de aprobación con contexto (B-4/B-6), pero eso lo decide el brief técnico según por dónde responda Santiago — no se compromete aquí una pantalla que quizá sea un mensaje |
| **Conteo producto-por-producto obligatorio** (`ConteoFisico` actual) | Contradice la decisión de excepción por defecto. Qué pasa con ese componente —se retira, se reusa o se deja— es del brief técnico |
| **Modo offline con sincronización** | Telegram ya tolera la falta de señal: el mensaje sale al recuperar conexión. Construir sincronización sería resolver un problema que el canal ya resolvió |
| **Dar de alta a Uriel como usuario web (Administrador / Verificador)** | No lo necesita para este flujo y sería onboarding digital que hoy no tiene. Su identidad vive en la tabla de usuarios de Telegram del bot |
| **Digitalizar las rondas históricas en papel** | No hay fuente confiable: no se sabe si las planillas se conservan (§3.2, paso 9). Inventar historia es peor que no tenerla |
| **Umbral automático de escalamiento** (por valor o por %) | Hoy la decisión es el juicio de Uriel y funciona. Un umbral es una decisión de negocio que nadie tomó; ponerlo por defecto lo inventaría |
| **Umbral de sensibilidad o de valor para la aprobación** | Decisión del dueño: **no existe**. Lo que decide si algo pasa por Santiago es **si tiene respaldo o no**, nunca cuánto vale (R-14, §9.10). Un umbral por valor dejaría pasar una sustracción chica y frenaría una corrección grande y documentada |
| **Conteo por bodega o por ubicación física** | El proceso actual recorre el catálogo completo, no por zonas. Sin demanda expresada |
| **Enmarcarlo como cumplimiento GlobalGAP** | Es control interno. Sirve como evidencia operativa, pero no es lo que lo justifica |
| **Auditar la divergencia del Google Sheet de David contra el sistema antes de lanzar** | Decisión del dueño (§3.4): se reemplaza sin medir. El costo de medirlo es una ronda entera y no cambiaría qué hay que construir. El precio se paga con R-17 |
| **Alta automática de producto desde el campo** | R-16. La observación libre llega al reporte; la ficha la crea Santiago por el camino normal |
| **Que David o Uriel reciban el reporte de cierre** | Decisión del dueño: es un reporte para Santiago |
| **Pantalla web del reporte de cierre** | El canal del MVP es Telegram, sin entrar a la app. Posible extensión futura, no parte de esta entrega |

---

## 9. Decisiones resueltas (entrevistas de seguimiento, 2026-08-27)

**Las diez preguntas que este documento abrió el 2026-08-27 están cerradas.** Se conservan con su respuesta para que el razonamiento quede trazable: **este documento es también el registro de cómo se llegó hasta acá.** *(La ampliación de §11, del día siguiente, cerró seis decisiones más — §11.3 y §11.4 — y no dejó ninguna abierta.)*

| # | Pregunta | Respuesta del dueño | Dónde vive ahora |
|---|---|---|---|
| **9.1** | ¿Quién imprime la planilla, y desde dónde? | **David, desde un Google Sheet manual paralelo**, no desde el sistema. El flujo nuevo **reemplaza ese Sheet sin auditar su divergencia previa** | §3.4 · A-2 · R-17 |
| **9.2** | ¿Qué ve Uriel al consultar el teórico? | **Solo cantidad y unidad** («Silicalmag: 8.000 kg»). Sin precio ni valor: eso es privativo de Gerencia | R-15 · A-2 · CA-13 |
| **9.3** | Catálogo de causas raíz | **Confirmado tal cual la propuesta**, sin cambios | R-7 · CA-11 |
| **9.4** | ¿Alcance de la ronda? | **Solo productos con existencia > 0.** Medido en producción el 2026-08-27: **226 activos · 33 en cero · 193 con existencia > 0 · 0 con `cantidad_actual` NULL**. La ronda recorre esos 193 | §5.1 · CA-4 · CA-16 |
| **9.5** | ¿Quién aplica el ajuste y bajo qué criterio? | **Corrige el modelo del brief, no lo confirma.** *«El ajuste lo puede proponer David o Uriel, pero lo debo aprobar yo.»* No hay regla de sensibilidad ni umbral. **Precisado en 9.10:** lo que Santiago aprueba es lo que **no tiene respaldo** | **R-14** · B-5 · B-6 · B-7 · CA-9 |
| **9.6** | Valoración con errores conocidos | **Sanear el catálogo antes de publicar valores.** Pasa de "fuera de alcance" a **prerrequisito bloqueante** de la parte valorizada del reporte | §8.1 · CA-20 |
| **9.7** | ¿Canal del reporte de cierre y a quién más? | **Solo Telegram, solo Santiago**, sin entrar a la app. Ni David ni Uriel lo reciben | C-1 · CA-19 · §8.2 |
| **9.8** | Definición de «mes saltado» | **Día 15 sin ronda cerrada → alerta a Santiago** | R-11 · CA-23 |
| **9.9** | Nombre del concepto | **«Ronda de inventario»**, consistente con `rondas_monitoreo` | Todo el documento |
| **9.10** | ¿La captura de un movimiento faltante también pasa por Santiago? | **No, si tiene respaldo.** *«David lo captura directo, sin mi aprobación. Solo lo sin respaldo (pérdida, sustracción) pasa por mí.»* Ver el detalle abajo | **R-14** · §5.2 E6 · §5.4 · B-2 · CA-8 · CA-9 · CA-10 |

**Hallazgo nuevo de la misma entrevista:** un producto físico que no está en el catálogo **se reporta como observación libre**, sin alta automática de producto y sin bloquear el cierre → R-16 · A-7 · CA-14.

> **Nota metodológica sobre las cifras.** 226 / 33 / 193 son la foto del **2026-08-27** y van a fluctuar con el catálogo. Se citan como orden de magnitud para dimensionar el alcance, no como constantes: el alcance de cada ronda se resuelve **al abrirla** (CA-4), nunca contra un número escrito en un documento.

### 9.10 · El matiz que abrió la decisión 9.5 — resuelto

| | |
|---|---|
| **Pregunta** | La regla «ningún ajuste sin aprobación de Santiago» es clara cuando hay un faltante inexplicado. Pero el caso **más frecuente** del proceso real es otro (§3.2, paso 5): David explica que *«hubo un movimiento real que no se capturó»* — una salida a una aplicación, una entrega que nadie registró. Ahí la corrección natural **no es un ajuste: es capturar el movimiento que faltaba**, y eso también mueve `productos.cantidad_actual`. ¿Pasa por Santiago o no? |
| **Por qué importaba** | Bajo la lectura estricta, Santiago quedaba aprobando data entry rutinaria, **y el camino (b) de §5.1 —el ajuste puntual, que se decidió dejar intacto— quedaba en contradicción con R-14 durante los días en que hubiera una ronda abierta.** |
| **Respuesta del dueño** | **Se eligió distinguir por respaldo.** *«David lo captura directo, sin mi aprobación. Solo lo sin respaldo (pérdida, sustracción) pasa por mí.»* Con respaldo identificable → David registra el movimiento que realmente fue, sin aprobación, ligado a la excepción y visible en el reporte. Sin respaldo → siempre Santiago. |
| **Dónde vive ahora** | **R-14** (los dos caminos) · R-1 · R-8 · R-9 · §5.2 bifurcación E6 · §5.4 (tres desenlaces terminales) · B-2 · B-5 · B-6 · B-7 · CA-8 · CA-9 · CA-10 · CA-12 · CA-19 |

**La lección que deja, y que conviene no perder:** la distinción que gobierna este flujo **no es de tamaño ni de sensibilidad — es de evidencia**. Lo que Gerencia necesita aprobar no es todo movimiento de stock, sino todo movimiento de stock **sin respaldo**, que es exactamente donde viven la pérdida y la sustracción. Poner un umbral por valor habría dejado pasar sin control una sustracción chica y habría frenado una corrección grande y perfectamente documentada.

---

## 10. Próximos pasos

**No quedan decisiones del dueño pendientes.** La definición de producto está cerrada, incluida la ampliación de §11.

1. **Brief técnico del CTO** sobre este documento: arquitectura de la conversación de Telegram (siguiendo el patrón de `pesajeLeche` / `produccionQuincenal`, sin inventar uno nuevo), **el pipeline de voz de §11 sobre el precedente de `hato-chequeo-foto.ts`** —transcripción, interpretación, contrato del preview, dónde vive la lógica pura testeable, y cómo se sostienen R-18/R-19/R-20 en el propio contrato de salida del modelo y no en una revisión a ojo—, cómo se identifica a Uriel en la capa de Telegram, qué tablas y RPC se tocan, **cómo se modelan los dos caminos de R-14 sin que la captura directa pierda trazabilidad**, **cómo se representa una explicación precargada-pero-no-confirmada de David** (R-6 / CA-38: es un estado, no un texto suelto), cómo se emite el recordatorio y la alerta del día 15, dónde vive el historial que pide C-3, y qué pasa con `ConteoFisico` / `NuevaVerificacion` / el RPC roto `aplicar_ajustes_verificacion`. Debe además dimensionar el **saneamiento de `precio_unitario`** de §8.1, prerrequisito de la parte valorizada del reporte.
2. **Criterios Given/When/Then por QA** a partir de §7, con revisión del CPO. Atención especial a **CA-8 / CA-9 / CA-10** (la frontera «con respaldo» vs. «sin respaldo»), **CA-32 / CA-33** (qué hace el intérprete cuando duda) y **CA-38** (cuándo una cita se convierte en la palabra de David). Los tres son puntos donde un criterio ambiguo se convierte en un agujero de control, no en un defecto cosmético.
3. **Implementación**, con los tres arreglos de higiene (D-1, D-2, D-3) desacoplados del flujo nuevo: son chicos, independientes y **D-2 corrige una respuesta falsa que Esco está dando hoy**.

**Este documento es definición de producto, no diseño técnico.** Ninguna decisión de esquema, de tabla o de arquitectura aquí escrita es vinculante: donde se menciona una tabla o un archivo es como evidencia del diagnóstico, no como propuesta de implementación.

---

## 11. Ampliación: el reporte de Uriel es una nota de voz (2026-08-28)

> **Posterior al cierre del documento.** Santiago revisó el brief publicado y propuso una mejora al mecanismo de reporte de campo (afecta A-2/A-3 y las etapas E3 y E5). **No cambia ningún principio de §5**: la ronda sigue siendo excepción por defecto, nada sigue tocando el inventario sin decisión humana, R-14 sigue gobernando quién aprueba qué y R-6 sigue exigiendo el paso de David — precisado en §11.4, no debilitado. Cambia **cómo Uriel expresa una excepción**.

### 11.1 Qué propuso, y por qué es la decisión correcta

En vez de reportar producto por producto en un mensaje estructurado, **Uriel manda una o varias notas de voz narrando todos los hallazgos de la ronda, en lenguaje natural** — exactamente como hoy le resume a Santiago por chat. Ejemplo del dueño:

> **Uriel (audio):** *«Hay un desface en Silicalmag donde deberían haber 100 kg y hay 90 kg, David dice que es por error en el sistema y hacen falta 3 martillos que no aparecen.»*
>
> **Bot (preview):** *«Registros a incluir: Silicalmag: hay 90, deberían haber 100. David actualiza en sistema. Martillos: hay 5, deberían haber 8. Pérdida de equipo, pasa a aprobación de Santiago.»*
>
> **Uriel (texto):** *«Es Silicalmag, no Silicio.»* → **Bot:** preview corregido → **Uriel:** `[Confirmar]`

**Es la misma tesis del documento entero, una vuelta más adentro.** §1 dice que el objetivo es capturar un proceso que ya funciona sin deformarlo. El mensaje de chat resumido del paso 6 de §3.2 **ya era** el formato natural de Uriel; pedirle un formulario por producto lo habría deformado igual que el conteo uno-por-uno que §2.1 diagnostica. La voz no es una comodidad: es el formato que el proceso ya tenía.

### 11.2 El patrón, y en qué se aparta de él

Es el mismo pipeline que `hato-chequeo-foto.ts` ya usa para las planillas del hato: **interpretación por modelo → preview → confirmación humana explícita → recién ahí se escribe**. Dos préstamos literales de ese precedente, que en el hato ya están probados:

- **Nada entra al dominio sin confirmación.** El endpoint del hato «nunca escribe a tablas de dominio»; acá, sin `Confirmar` no existe excepción (CA-29).
- **Lo que el modelo no lee con confianza no se adivina.** En el hato, solo la confianza `alta` pasa al pipeline; `baja` e `ilegible` entran como celda vacía + bandera, y una fila que no casa con el roster queda **no leída y nunca se desplaza**. Acá eso es R-20 / CA-32: producto no identificado ⇒ lo elige Uriel, jamás el nombre más parecido.

**Y una diferencia deliberada, que no es un descuido:** el hato guarda la foto cruda en Storage como evidencia; **acá el audio no se conserva**. Decisión del dueño. La consecuencia hay que decirla en voz alta: **la capa cruda de este flujo es el transcrito confirmado, no un archivo de audio.** Por eso el transcrito se guarda literal y los hallazgos estructurados se derivan de él — es la única evidencia que va a existir el día que alguien discuta qué se dijo, y por eso A-9 (que Uriel lo lea antes de confirmar) deja de ser comodidad y pasa a ser el control que sostiene la trazabilidad.

### 11.3 Decisiones del dueño — cerradas

| # | Pregunta | Respuesta del dueño | Dónde vive ahora |
|---|---|---|---|
| **11.a** | ¿Cómo reporta Uriel? | **Nota de voz en lenguaje natural**, una o varias por ronda, con todos los hallazgos juntos | A-8 · §5.2 E3 |
| **11.b** | ¿Cómo se confirma? | **Un botón `Confirmar`**, no un «sí» en lenguaje natural. Es la acción que compromete el registro | A-9 · CA-29 |
| **11.c** | ¿Cuántos reintentos de corrección? | **3–4.** Agotados, el bot cede y ofrece otra vía; **no insiste indefinidamente** | A-9 · A-10 · CA-35 |
| **11.d** | ¿Se guarda el audio? | **No. Solo el transcrito confirmado** | §11.2 · CA-36 |
| **11.e** | Mapeo causa → vía | `movimiento no capturado` · `consumo no registrado` · `error de captura previa` → **David directo**; `pérdida o daño` · `sustracción` → **Santiago**; `error de conteo` → **no mueve inventario** | Tabla en §5.3 · CA-34 |

**Decisión de producto que tomé yo, no el dueño:** `otro (con nota)` **rutea a Santiago** — por **R-18**, no como caso especial. Es la clasificación menos informativa, y el sesgo de este flujo es asimétrico a propósito: puede equivocarse pidiendo control de más, nunca de menos.

### 11.4 · La pregunta que esta ampliación abrió — resuelta

| | |
|---|---|
| **Pregunta** | **El audio de Uriel ya trae la explicación de David dentro.** En el ejemplo del propio dueño: *«David dice que es por error en el sistema»*. Es lo natural — David camina la bodega con Uriel (§3.2 paso 3), así que explica ahí mismo, delante del producto. ¿Eso cuenta como el paso de David? |
| **Por qué importaba** | Choca con **R-6**, que dice que toda excepción pasa por David y que ese paso *«no es opcional ni saltable porque sea obvio»*. Si el audio bastara, la explicación de quien **custodia** el inventario entraría referida por quien lo está **auditando** — y esa es exactamente la separación de funciones que §3.1 identifica como el valor de todo el proceso. Se habría perdido sin que nadie lo notara, porque la regla habría seguido escrita |
| **Respuesta del dueño** | **Opción (b): David confirma igual, con un toque.** La explicación le llega **precargada** desde el audio de Uriel y él la confirma o la corrige. **Hasta ese toque es una cita, no su palabra, y no habilita ninguna vía.** R-6 queda intacta y el costo es una interacción sobre un texto ya escrito — no volver a explicar |
| **Dónde vive ahora** | **R-6** (reescrita) · §5.2 E5 (dos formas de llegar: precargada vs. directa) · B-1 · **CA-38** |

**Lo que hace elegante a esta solución, y conviene no perderlo al implementar:** el audio no se descarta ni se desconfía de él — **se usa para ahorrarle a David el trabajo, no para reemplazar su firma**. Y de paso le da algo que hoy no tiene: la oportunidad de corregir una explicación suya mal transcrita **antes** de que se convierta en la causa raíz de su propio inventario.

---

*Fuente: entrevista de descubrimiento y entrevista de seguimiento con Santiago (Gerencia) del 2026-08-27, la revisión del dueño del 2026-08-28 (§11), y el issue #175. Las decisiones de §3.4, §5.1, §5.2, §8.1, la tabla de §9 con sus diez entradas —incluida §9.10—, las tablas de §11.3 y §11.4, y las reglas R-1, R-2, R-6, R-7, R-11, R-12, R-14, R-15, R-16 y el mapeo causa→vía de §5.3 son del dueño y **no son reabribles**. R-18, R-19 y R-20 son decisiones de producto del CPO derivadas de lo ya aprobado. **No queda ninguna pregunta abierta ni ninguna decisión de producto pendiente: lo que sigue es diseño técnico.***
